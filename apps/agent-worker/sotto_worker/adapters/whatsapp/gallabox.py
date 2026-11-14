"""Gallabox WhatsApp adapter (D-033, REFERENCES § Gallabox). Template-first.

Only the fields named here ever leave this module: Gallabox's template list embeds a `channel`
object with credential-like fields, and nothing from it is copied, stored, returned or logged.
The 24-hour window has no documented status field, so `window_status()` is always "unknown",
which means template only (D-033); free-form text is not offered."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Literal

import httpx

BASE = "https://server.gallabox.com/devapi"
VAR = re.compile(r"\{\{\s*([\w.]+)\s*\}\}")
# Meta / Gallabox codes after which sending must stop (policy, opt-out, quality) — D-033.
STOP_CODES = frozenset({"131056", "131048", "131049", "132015", "132016"})
WINDOW_CLOSED = "131047"
Window = Literal["open", "closed", "unknown"]


class GallaboxError(RuntimeError):
    def __init__(self, message: str, *, status: int = 0, code: str = "") -> None:
        super().__init__(message)
        self.status, self.code = status, code

    @property
    def stop(self) -> bool:
        return self.code in STOP_CODES


# Where a template parameter's value comes from on the agent's screen (ZC-07). "" = the agent
# types it. The app fills what it knows (customer, agent, company); the rest stay editable.
SOURCES = frozenset(
    {
        "customer.name",
        "customer.first_name",
        "customer.phone",
        "agent.name",
        "agent.first_name",
        "company.name",
        "meeting.date",
        "meeting.time",
        "meeting.place",
        "deal.name",
    }
)
_GUESSES: tuple[tuple[re.Pattern[str], str], ...] = tuple(
    (re.compile(rf"^(?:{pattern})$"), source)
    for pattern, source in (
        (r"full_?name|customer_?full_?name|contact_?name", "customer.name"),
        (
            r"name|first_?name|f_?name|customer|customer_?name|client|client_?name",
            "customer.first_name",
        ),
        (r"phone|mobile|customer_?phone|whatsapp", "customer.phone"),
        (r"agent|agent_?name|rep|rep_?name|sales_?rep|advisor|consultant|sender", "agent.name"),
        (r"agent_?first_?name", "agent.first_name"),
        (r"company|company_?name|business|brand|org|organi[sz]ation", "company.name"),
        (r"date|meeting_?date|day|appointment_?date", "meeting.date"),
        (r"time|meeting_?time|slot|appointment_?time|hour", "meeting.time"),
        (r"place|venue|location|address|meeting_?place|meeting_?location", "meeting.place"),
        (r"deal|deal_?name|project|property|product|unit", "deal.name"),
    )
)


def guess_source(name: str) -> str:
    """A parameter's likely source from its name (`customer_name` → customer.first_name);
    "" when nothing fits, e.g. Meta's numbered `{{1}}`."""
    key = re.sub(r"[\s.\-]+", "_", name.strip().lower())
    for pattern, source in _GUESSES:
        if pattern.match(key):
            return source
    return ""


@dataclass(frozen=True)
class Param:
    name: str
    component: str  # header | body | button
    type: str  # text (only text parameters are sent in v1)
    example: str = ""
    source: str = ""  # one of SOURCES, or "" (the agent types it)

    def out(self) -> dict[str, str]:
        return {
            "name": self.name,
            "component": self.component,
            "type": self.type,
            "example": self.example,
            "source": self.source,
        }


@dataclass(frozen=True)
class Template:
    name: str
    language: str
    category: str
    status: str
    body: str  # the body text with {{variables}}, for the preview
    params: tuple[Param, ...] = field(default_factory=tuple)

    def out(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "language": self.language,
            "category": self.category,
            "status": self.status,
            "body": self.body,
            "params": [p.out() for p in self.params],
        }


def _s(value: Any, limit: int = 200) -> str:
    return str(value if value is not None else "").strip()[:limit]


def _examples(component: dict[str, Any]) -> list[str]:
    ex = component.get("example")
    if isinstance(ex, dict):
        for key in ("body_text", "header_text"):
            vals = ex.get(key)
            if isinstance(vals, list) and vals:
                first = vals[0] if isinstance(vals[0], list) else vals
                return [_s(v) for v in first]
    return []


def parse_template(raw: dict[str, Any]) -> Template | None:
    """Whitelists the fields we use. Accepts both a `variables` list and Meta-style components
    (the exact Gallabox shape is unverified on the owner's account; REFERENCES § Gallabox)."""
    name = _s(raw.get("name"), 120)
    if not name:
        return None
    body, params = "", []
    seen: set[tuple[str, str]] = set()
    components = raw.get("components")
    for comp in components if isinstance(components, list) else []:
        if not isinstance(comp, dict):
            continue
        kind = _s(comp.get("type"), 20).lower()
        if kind not in ("header", "body"):
            continue
        if kind == "header" and _s(comp.get("format"), 20).lower() not in ("", "text"):
            continue  # media headers are not filled in v1
        text = _s(comp.get("text"), 2000)
        if kind == "body":
            body = text
        examples = _examples(comp)
        for i, var in enumerate(VAR.findall(text)):
            if (kind, var) not in seen:
                seen.add((kind, var))
                ex = examples[i] if i < len(examples) else ""
                params.append(Param(var, kind, "text", ex, guess_source(var)))
    variables = raw.get("variables")
    for var in variables if isinstance(variables, list) else []:
        if isinstance(var, dict):
            vname = _s(var.get("name") or var.get("key"), 60)
            comp_name = _s(var.get("component") or "body", 20).lower()
            example = _s(var.get("example") or var.get("sample"))
            vtype = _s(var.get("type") or "text", 20).lower()
        else:
            vname, comp_name, example, vtype = _s(var, 60), "body", "", "text"
        if vname and (comp_name, vname) not in seen:
            seen.add((comp_name, vname))
            params.append(Param(vname, comp_name, vtype, example))
    if not body:
        body = _s(raw.get("body") or raw.get("text"), 2000)
    return Template(
        name=name,
        language=_s(raw.get("language") or raw.get("languageCode") or "en", 20),
        category=_s(raw.get("category"), 40).upper(),
        status=_s(raw.get("status"), 40).upper(),
        body=body,
        params=tuple(params),
    )


@dataclass(frozen=True)
class Channel:
    """A WhatsApp number on the account. `id` is server-side only (D-039); screens get a ref."""

    id: str
    label: str


def parse_channel(raw: dict[str, Any]) -> Channel | None:
    """The channel a template belongs to. Only the id and a display name are read from the
    embedded `channel` object (its other fields are credential-like and never copied)."""
    inner = raw.get("channel")
    ch: dict[str, Any] = inner if isinstance(inner, dict) else {}
    cid = _s(raw.get("channelId") or ch.get("id") or ch.get("_id"), 120)
    if not cid:
        return None
    label = _s(ch.get("name") or ch.get("displayName"), 80)
    phone = digits(_s(ch.get("phone") or ch.get("phoneNumber"), 30))
    if phone and len(phone) >= 4:
        masked = f"+{'•' * max(0, len(phone) - 4)}{phone[-4:]}"
        label = f"{label} ({masked})" if label else masked
    return Channel(cid, label)


def digits(phone: str) -> str:
    return re.sub(r"\D", "", phone or "")


class Gallabox:
    provider = "gallabox"

    def __init__(
        self,
        http: httpx.AsyncClient,
        *,
        api_key: str,
        api_secret: str,
        account_id: str,
        channel_id: str = "",
        base: str = BASE,
        **_extra: str,
    ) -> None:
        self._http = http
        self._headers = {"apiKey": api_key, "apiSecret": api_secret}
        self._account, self._channel, self._base = account_id, channel_id, base.rstrip("/")

    async def _call(self, method: str, path: str, **kw: Any) -> Any:
        try:
            r = await self._http.request(
                method, f"{self._base}{path}", headers=self._headers, timeout=15, **kw
            )
        except httpx.HTTPError as e:
            raise GallaboxError(f"could not reach Gallabox ({type(e).__name__})") from None
        if r.status_code >= 400:
            code, message = "", f"Gallabox answered {r.status_code}"
            try:
                data = r.json()
            except ValueError:
                data = {}
            if isinstance(data, dict):
                inner = data.get("error")
                err: dict[str, Any] = inner if isinstance(inner, dict) else data
                code = _s(err.get("code"), 20)
                detail = _s(err.get("message") or err.get("msg"), 200)
                if detail:
                    message = f"{message}: {detail}"
            raise GallaboxError(message, status=r.status_code, code=code)
        return r.json() if r.content else {}

    async def _template_rows(self) -> list[dict[str, Any]]:
        data = await self._call("GET", f"/accounts/{self._account}/whatsappTemplates")
        rows = data if isinstance(data, list) else (data.get("data") or data.get("templates") or [])
        return [r for r in rows if isinstance(r, dict)][:500]

    async def templates(self) -> list[Template]:
        return [t for t in (parse_template(r) for r in await self._template_rows()) if t]

    async def discover(self) -> tuple[list[Template], list[Channel]]:
        """Templates and the channels they belong to, from one read. Gallabox documents no
        channel list endpoint (REFERENCES § Gallabox), so channels come from the templates."""
        rows = await self._template_rows()
        templates = [t for t in (parse_template(r) for r in rows) if t]
        channels: dict[str, Channel] = {}
        for r in rows:
            ch = parse_channel(r)
            if ch and (ch.id not in channels or not channels[ch.id].label):
                channels[ch.id] = ch
        return templates, list(channels.values())

    async def window_status(self, _phone: str) -> Window:
        """No documented window signal (REFERENCES § Gallabox): never claim "open"."""
        return "unknown"

    async def send_template(
        self,
        *,
        phone: str,
        name: str,
        template: Template,
        values: dict[str, str],
    ) -> str:
        body_values = {p.name: values[p.name] for p in template.params if p.component == "body"}
        header_values = {p.name: values[p.name] for p in template.params if p.component == "header"}
        payload: dict[str, Any] = {
            "channelId": self._channel,
            "channelType": "whatsapp",
            "recipient": {"name": name, "phone": digits(phone)},
            "whatsapp": {
                "type": "template",
                "template": {
                    "templateName": template.name,
                    **({"bodyValues": body_values} if body_values else {}),
                    **({"headerValues": header_values} if header_values else {}),
                },
            },
        }
        data = await self._call("POST", "/messages/whatsapp", json=payload)
        return _s(data.get("id") if isinstance(data, dict) else "", 120)
