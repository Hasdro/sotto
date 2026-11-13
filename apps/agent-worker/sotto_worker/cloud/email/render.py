"""The one place an email's final text is built (D-032), so the preview the agent confirms and
the email that is sent are the same bytes. Static blocks (opening, signature) come from the
org's format and are merged verbatim with only their {{placeholders}} filled; the body is the
agent's (or the model's) text, used exactly as given."""

from __future__ import annotations

from dataclasses import dataclass

from sotto_worker.cloud.email.data import PLACEHOLDER


@dataclass(frozen=True)
class Rendered:
    subject: str
    text: str


def fill(template: str, values: dict[str, str]) -> str:
    return PLACEHOLDER.sub(lambda m: values.get(m.group(1), ""), template)


def render(fmt: dict[str, str], *, subject: str, body: str, values: dict[str, str]) -> Rendered:
    parts = [fill(fmt.get("opening", ""), values).strip(), body.strip()]
    parts.append(fill(fmt.get("signature", ""), values).strip())
    text = "\n\n".join(p for p in parts if p)
    one_line = " ".join(fill(subject, values).split())
    return Rendered(subject=one_line[:200], text=text)
