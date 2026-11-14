"""The company website as bootstrap material (ZC-04, D-066), fetched by the server with SSRF
guards: https only, port 443, the company's own domain (or a subdomain of it), every resolved
address public, the connection pinned to the checked address (no DNS rebinding between the check
and the connect), redirects re-checked hop by hop, a time cap and a size cap, HTML or plain text
only. What comes back is plain text, capped, for the device to run the bootstrap prompt on."""

from __future__ import annotations

import html
import ipaddress
import re
import socket
from collections.abc import Callable
from urllib.parse import urljoin, urlsplit

import httpx

from sotto_worker.cloud.store import CloudError

MAX_BYTES = 1_000_000
MAX_TEXT_CHARS = 20_000
TIMEOUT_S = 5.0
MAX_REDIRECTS = 3
TYPES = ("text/html", "text/plain", "application/xhtml+xml")
HOST = re.compile(r"^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")

Resolver = Callable[[str], list[str]]


def system_resolve(host: str) -> list[str]:
    infos = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    return sorted({str(info[4][0]) for info in infos})


# Tests swap these two (a fake resolver and an httpx.MockTransport); production uses the defaults.
resolve: Resolver = system_resolve
transport: httpx.AsyncBaseTransport | None = None


def public_ip(address: str) -> bool:
    try:
        ip = ipaddress.ip_address(address)
    except ValueError:
        return False
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    return ip.is_global and not ip.is_multicast


def on_domain(host: str, domains: list[str]) -> bool:
    return any(host == d or host.endswith("." + d) for d in domains)


def check_url(url: str, domains: list[str]) -> tuple[str, str]:
    """(host, path?query) of an allowed URL, else CloudError. No credentials, no other port."""
    parts = urlsplit(url.strip())
    if parts.scheme != "https":
        raise CloudError("invalid", "use an https:// address")
    if parts.username or parts.password or parts.port not in (None, 443):
        raise CloudError("invalid", "use a plain https address on the standard port")
    host = (parts.hostname or "").lower().rstrip(".")
    if not HOST.match(host):
        raise CloudError("invalid", "use the company's web address (a name, not a number)")
    if not on_domain(host, domains):
        raise CloudError("off_domain", "only the company's own website can be read")
    path = parts.path or "/"
    return host, path + (f"?{parts.query}" if parts.query else "")


def pinned_address(host: str) -> str:
    try:
        addresses = resolve(host)
    except OSError:
        raise CloudError("unreachable", "that website could not be found") from None
    if not addresses:
        raise CloudError("unreachable", "that website could not be found")
    if not all(public_ip(a) for a in addresses):
        raise CloudError("private_address", "that address is not a public website")
    return addresses[0]


def page_text(raw: str) -> str:
    """Visible text of an HTML page, one paragraph per block, without scripts and styles."""
    raw = re.sub(r"(?is)<(script|style|noscript|svg|template)\b.*?</\1\s*>", " ", raw)
    raw = re.sub(r"(?is)<!--.*?-->", " ", raw)
    raw = re.sub(r"(?i)<(br|/p|/div|/li|/h[1-6]|/tr|/section|/article)\b[^>]*>", "\n", raw)
    raw = re.sub(r"(?s)<[^>]+>", " ", raw)
    lines = (" ".join(html.unescape(line).split()) for line in raw.split("\n"))
    return "\n".join(line for line in lines if line)[:MAX_TEXT_CHARS]


async def fetch_site(url: str, domains: list[str]) -> dict[str, str]:
    """{url, text} of one page of the company's own website; CloudError for every refusal."""
    if not domains:
        raise CloudError("off_domain", "no company domain is known; paste the text instead")
    current = url
    async with httpx.AsyncClient(
        transport=transport, timeout=TIMEOUT_S, follow_redirects=False, verify=True
    ) as client:
        for _hop in range(MAX_REDIRECTS + 1):
            host, target = check_url(current, domains)
            address = pinned_address(host)
            ip_host = f"[{address}]" if ":" in address else address
            try:
                async with client.stream(
                    "GET",
                    f"https://{ip_host}{target}",
                    headers={"Host": host, "Accept": "text/html, text/plain"},
                    extensions={"sni_hostname": host},
                ) as r:
                    if r.is_redirect:
                        location = r.headers.get("location", "")
                        current = urljoin(f"https://{host}{target}", location)
                        continue
                    if r.status_code != 200:
                        raise CloudError("unreachable", f"the website answered {r.status_code}")
                    kind = r.headers.get("content-type", "").split(";")[0].strip().lower()
                    if kind not in TYPES:
                        raise CloudError("invalid", "that page is not a web page or text")
                    declared = r.headers.get("content-length")
                    if declared and declared.isdigit() and int(declared) > MAX_BYTES:
                        raise CloudError("too_large", "that page is too large; paste the text")
                    chunks: list[bytes] = []
                    size = 0
                    async for chunk in r.aiter_bytes():
                        size += len(chunk)
                        if size > MAX_BYTES:
                            raise CloudError("too_large", "that page is too large; paste the text")
                        chunks.append(chunk)
                    raw = b"".join(chunks).decode(r.encoding or "utf-8", errors="replace")
            except httpx.TimeoutException:
                raise CloudError("unreachable", "the website took too long to answer") from None
            except httpx.HTTPError:
                raise CloudError("unreachable", "the website could not be read") from None
            text = page_text(raw) if kind != "text/plain" else raw[:MAX_TEXT_CHARS]
            return {"url": f"https://{host}{target}", "text": text}
    raise CloudError("unreachable", "too many redirects")
