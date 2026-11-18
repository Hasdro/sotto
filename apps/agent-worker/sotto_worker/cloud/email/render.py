"""The one place an email's final text is built (D-032), so the preview the agent confirms and
the email that is sent are the same bytes. Static blocks (opening, signature) come from the
org's format and are merged verbatim with only their {{placeholders}} filled; the body is the
agent's (or the model's) text, used exactly as given.

Round 2 (D-080): the format blocks are rich text (Markdown). The plain-text part strips the
markers, so a format saved before this change reads exactly as it did; the HTML part renders
them (bold, italic, bullet lists, links) and is sent as the second part of a multipart email.
Text with no Markdown at all sends exactly as before: one plain-text part, no HTML."""

from __future__ import annotations

import html as html_lib
import re
from dataclasses import dataclass

from sotto_worker.cloud.email.data import PLACEHOLDER

_LINK = re.compile(r"\[([^\]]+)\]\(([^)\s]+)\)")
_BOLD = re.compile(r"\*\*([^*]+)\*\*")
_ITALIC = re.compile(r"(?<!\*)\*([^*]+)\*(?!\*)")
_MARKERS = re.compile(r"\*\*|\*[^*\n]+\*|\[[^\]]+\]\([^)\s]+\)|^- ", re.M)


@dataclass(frozen=True)
class Rendered:
    subject: str
    text: str
    # Empty when the filled text has no Markdown: the email stays one plain-text part.
    html: str = ""


def fill(template: str, values: dict[str, str]) -> str:
    return PLACEHOLDER.sub(lambda m: values.get(m.group(1), ""), template)


def strip_markdown(text: str) -> str:
    """The plain-text reading of Markdown: markers gone, link text kept, list dashes kept."""
    text = _LINK.sub(r"\1", text)
    return text.replace("**", "").replace("*", "")


def _inline(text: str) -> str:
    """Bold, italic and links on one already-escaped line."""
    text = _LINK.sub(_link, text)
    text = _BOLD.sub(r"<strong>\1</strong>", text)
    text = _ITALIC.sub(r"<em>\1</em>", text)
    return text


def _link(m: re.Match[str]) -> str:
    url = m.group(2)
    if not url.startswith(("http://", "https://", "mailto:")):
        return html_lib.escape(m.group(1))
    return f'<a href="{html_lib.escape(url, quote=True)}">{html_lib.escape(m.group(1))}</a>'


def markdown_html(text: str) -> str:
    """A small, safe subset: paragraphs, **bold**, *italic*, [links](https://…) and "- " lists.
    Everything else is escaped, so no markup the author did not write can reach the email."""
    blocks: list[str] = []
    lines = [html_lib.escape(line) for line in text.split("\n")]
    i = 0
    while i < len(lines):
        if not lines[i].strip():
            i += 1
            continue
        if lines[i].startswith("- "):
            items = []
            while i < len(lines) and lines[i].startswith("- "):
                items.append(f"<li>{_inline(lines[i][2:])}</li>")
                i += 1
            blocks.append("<ul>" + "".join(items) + "</ul>")
            continue
        para = [lines[i]]
        i += 1
        while i < len(lines) and lines[i].strip() and not lines[i].startswith("- "):
            para.append(lines[i])
            i += 1
        blocks.append("<p>" + "<br>".join(_inline(p) for p in para) + "</p>")
    return "\n".join(blocks)


def render(fmt: dict[str, str], *, subject: str, body: str, values: dict[str, str]) -> Rendered:
    parts = [fill(fmt.get("opening", ""), values).strip(), body.strip()]
    parts.append(fill(fmt.get("signature", ""), values).strip())
    joined = "\n\n".join(p for p in parts if p)
    one_line = " ".join(fill(subject, values).split())
    html = markdown_html(joined) if _MARKERS.search(joined) else ""
    return Rendered(subject=one_line[:200], text=strip_markdown(joined), html=html)
