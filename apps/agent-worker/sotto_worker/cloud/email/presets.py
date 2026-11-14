"""SMTP presets from the admin's email domain (UX-32, D-052, D-065).

A known-domain map answers the big free mail services at once; any other domain is looked up by
its MX records (dnspython), which names the mailbox provider behind a company domain. Nothing is
stored: the preset only pre-fills the form, and the admin still types the mailbox password."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

import dns.asyncresolver
import dns.exception
import dns.resolver

PresetId = Literal["google", "microsoft", "hostinger", "zoho", "other"]
DOMAIN = re.compile(r"^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")
MX_TIMEOUT_S = 3.0


@dataclass(frozen=True)
class Preset:
    id: PresetId
    label: str
    host: str
    port: int  # 465 = TLS from the start, 587 = STARTTLS (adapters/email/smtp.py)

    def out(self) -> dict[str, str | int]:
        return {"id": self.id, "label": self.label, "host": self.host, "port": self.port}


GOOGLE = Preset("google", "Google Workspace", "smtp.gmail.com", 465)
MICROSOFT = Preset("microsoft", "Microsoft 365", "smtp.office365.com", 587)
HOSTINGER = Preset("hostinger", "Hostinger", "smtp.hostinger.com", 465)
OTHER = Preset("other", "Other", "", 465)
ZOHO_HOSTS = {  # Zoho Mail's SMTP host follows the data centre its MX records point at
    "com": "smtp.zoho.com",
    "eu": "smtp.zoho.eu",
    "in": "smtp.zoho.in",
    "com.au": "smtp.zoho.com.au",
    "jp": "smtp.zoho.jp",
    "ca": "smtp.zohocloud.ca",
    "sa": "smtp.zoho.sa",
}


def zoho(tld: str = "com") -> Preset:
    return Preset("zoho", "Zoho Mail", ZOHO_HOSTS.get(tld, ZOHO_HOSTS["com"]), 465)


KNOWN_DOMAINS: dict[str, Preset] = {
    "gmail.com": GOOGLE,
    "googlemail.com": GOOGLE,
    "outlook.com": MICROSOFT,
    "hotmail.com": MICROSOFT,
    "live.com": MICROSOFT,
    "msn.com": MICROSOFT,
    "zoho.com": zoho(),
    "zohomail.com": zoho(),
    "zoho.eu": zoho("eu"),
    "zoho.in": zoho("in"),
}
ZOHO_MX = re.compile(r"(?:^|\.)zoho(?:mail)?\.(com\.au|com|eu|in|jp|sa)$|(?:^|\.)zohocloud\.(ca)$")


def domain_of(email: str) -> str | None:
    domain = email.rpartition("@")[2].strip().lower().rstrip(".")
    return domain if DOMAIN.match(domain) else None


def from_mx(hosts: list[str]) -> Preset | None:
    """The provider named by the first MX host we recognise (lowest preference first)."""
    for raw in hosts:
        host = raw.strip().lower().rstrip(".")
        if host.endswith((".google.com", ".googlemail.com")) or host == "smtp.google.com":
            return GOOGLE
        if host.endswith(".mail.protection.outlook.com") or host.endswith(".outlook.com"):
            return MICROSOFT
        if host.endswith(".hostinger.com") or host.endswith(".hostinger.in"):
            return HOSTINGER
        m = ZOHO_MX.search(host)
        if m:
            return zoho(m.group(1) or m.group(2))
    return None


async def resolve_mx(domain: str) -> list[str]:
    """MX hosts, lowest preference first; [] when the domain has none or DNS does not answer."""
    resolver = dns.asyncresolver.Resolver()
    try:
        answer = await resolver.resolve(domain, "MX", lifetime=MX_TIMEOUT_S)
    except (dns.exception.DNSException, dns.resolver.NoNameservers):
        return []
    rows = sorted(answer, key=lambda r: int(getattr(r, "preference", 0)))
    return [str(getattr(r, "exchange", "")) for r in rows]


async def preset_for(email: str) -> tuple[Preset, Literal["known", "mx", "none"], str]:
    """(preset, how it was found, domain). An unknown or invalid domain is "Other"."""
    domain = domain_of(email)
    if domain is None:
        return OTHER, "none", ""
    known = KNOWN_DOMAINS.get(domain)
    if known:
        return known, "known", domain
    found = from_mx(await resolve_mx(domain))
    return (found, "mx", domain) if found else (OTHER, "none", domain)
