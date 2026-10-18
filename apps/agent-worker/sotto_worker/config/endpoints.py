"""Company-supplied model endpoints (R6 OpenAI-compatible) must not become an SSRF hole
(ARCHITECTURE §2). In the cloud deployment: https only, no credentials in the URL, and every
resolved address must be public. A local deployment (the owner's Mac) may use localhost
(Ollama, LM Studio). Re-check at connect time too: DNS can change after this check.
"""

from __future__ import annotations

import ipaddress
import socket
from collections.abc import Callable
from typing import Literal
from urllib.parse import urlsplit

Deployment = Literal["cloud", "local"]


class EndpointRejected(ValueError):
    pass


def system_resolve(host: str) -> list[str]:
    try:
        return sorted({str(info[4][0]) for info in socket.getaddrinfo(host, None)})
    except socket.gaierror:
        return []


def check_endpoint(
    url: str, *, deployment: Deployment, resolve: Callable[[str], list[str]] = system_resolve
) -> None:
    parts = urlsplit(url)
    host = parts.hostname or ""
    if parts.username or parts.password:
        raise EndpointRejected("credentials do not belong in the URL; use the key field")
    if deployment == "local":
        if parts.scheme not in ("http", "https") or not host:
            raise EndpointRejected("needs an http(s) URL")
        return
    if parts.scheme != "https" or not host:
        raise EndpointRejected("cloud endpoints must use https")
    try:
        addresses = [str(ipaddress.ip_address(host))]
    except ValueError:
        addresses = resolve(host)
    if not addresses:
        raise EndpointRejected(f"cannot resolve {host}")
    for address in addresses:
        ip = ipaddress.ip_address(address)
        if not ip.is_global:
            raise EndpointRejected(f"{host} resolves to a private or reserved address ({ip})")
