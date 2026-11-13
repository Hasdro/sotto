"""Writes the Zoho connect pages (cloud/zoho/routes.py `_page`) with sample values to a folder,
for design screenshots and axe (T-086). uv run python ../../scripts/zoho-pages-sample.py <outDir>"""

import html
import sys
from pathlib import Path

from sotto_worker.cloud.zoho.oauth import DC_NAMES
from sotto_worker.cloud.zoho.routes import APP_LINK, READS, WRITES, _page

out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
choices = "".join(f"<a href='#'>{html.escape(n)}</a>" for n in DC_NAMES.values())
facts = (
    "<ul class='facts'>"
    f"<li><b>Reads:</b> {READS}</li><li><b>Writes:</b> {WRITES}</li>"
    "<li><b>Zoho data centre:</b> Detected automatically when you sign in"
    f"<details open><summary>Change</summary><div class='dcs'>{choices}"
    "<a href='#'>Detect automatically</a></div></details></li></ul>"
)
pages = {
    "connect": _page(
        "Connect Zoho",
        "This connects your Zoho account to AGN Sales Shield for agent@zylker.example. "
        "Continue only if that is you.",
        link=("#", "Continue to Zoho"),
        extra=facts,
        after="<br><a class='quiet' href='#'>Cancel</a>",
    ),
    "connected": _page(
        "Zoho is connected",
        "You can close this tab.",
        state="ok",
        link=(APP_LINK, "Open Sales Shield"),
    ),
    "expired": _page("Link expired", "Start again from AGN Sales Shield.", 400, state="bad"),
    "cancelled": _page(
        "Not connected",
        "Nothing was connected. You can close this tab.",
        after="<br><a class='quiet' href='#'>Open Sales Shield</a>",
    ),
}
for name, page in pages.items():
    (out / f"{name}.html").write_bytes(page.body)
print(f"wrote {len(pages)} pages to {out}")
