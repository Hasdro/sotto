"""GitHub issue reporting (Round 3, D-085): the vendor's own repo + token, server-side only.

No OAuth, no App install: the owner pastes a repo name (`owner/repo`) and a token into the
owner console; the token is encrypted in the vault (vault name "platform:github") and decrypted
here, at call time, for one REST call. The token is never logged, never returned to a client,
and never leaves this module. A screenshot reaches the issue as a Markdown image pointing at
the public attachment URL the server minted for it (D-085)."""

from __future__ import annotations

from typing import Any

import httpx

from sotto_worker.cloud.store import CloudError, CloudStore

GITHUB_API = "https://api.github.com"
TIMEOUT_S = 10


def issue_markdown(body: str, page_url: str, screenshot_url: str | None) -> str:
    """The issue body: what was reported, where it happened, and the screenshot (if any)."""
    parts = [body.strip()]
    if page_url:
        parts.append(f"\nReported from: {page_url}")
    if screenshot_url:
        parts.append(f"\n![screenshot]({screenshot_url})")
    return "\n".join(parts)


async def create_issue(
    store: CloudStore,
    *,
    title: str,
    body: str,
    page_url: str = "",
    screenshot_url: str | None = None,
    transport: httpx.AsyncBaseTransport | None = None,
) -> dict[str, Any]:
    """Creates one issue in the configured repo. Returns {issue_url, issue_number}."""
    saved = store.github_token()
    if saved is None:
        raise CloudError("github_not_configured", "connect a GitHub repo first (Account view)")
    repo, token = saved
    title = title.strip()
    if not title or len(title) > 200:
        raise CloudError("invalid", "title must be 1 to 200 characters")
    if len(body) > 8000:
        raise CloudError("invalid", "description is too long (max 8000 characters)")
    async with httpx.AsyncClient(
        transport=transport, timeout=TIMEOUT_S, base_url=GITHUB_API
    ) as client:
        r = await client.post(
            f"/repos/{repo}/issues",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            json={"title": title, "body": issue_markdown(body, page_url, screenshot_url)},
        )
    if r.status_code == 201:
        data = r.json()
        return {"issue_url": str(data["html_url"]), "issue_number": int(data["number"])}
    if r.status_code in (401, 403):
        raise CloudError("github_auth", "GitHub refused the token; check the token and the repo")
    if r.status_code == 404:
        raise CloudError("github_not_found", "GitHub cannot see that repo with this token")
    raise CloudError("github_unavailable", f"GitHub answered {r.status_code}; try again")


async def test_repo(
    store: CloudStore, *, transport: httpx.AsyncBaseTransport | None = None
) -> dict[str, Any]:
    """Validates the saved repo + token without creating anything."""
    saved = store.github_token()
    if saved is None:
        return {"ok": False, "detail": "no GitHub repo is connected yet"}
    repo, token = saved
    try:
        async with httpx.AsyncClient(
            transport=transport, timeout=TIMEOUT_S, base_url=GITHUB_API
        ) as client:
            r = await client.get(
                f"/repos/{repo}",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
            )
    except httpx.HTTPError:
        return {"ok": False, "detail": "GitHub could not be reached"}
    if r.status_code == 200:
        return {"ok": True, "detail": f"connected to {repo}"}
    if r.status_code in (401, 403):
        return {"ok": False, "detail": "GitHub refused the token"}
    if r.status_code == 404:
        return {"ok": False, "detail": "GitHub cannot see that repo with this token"}
    return {"ok": False, "detail": f"GitHub answered {r.status_code}"}
