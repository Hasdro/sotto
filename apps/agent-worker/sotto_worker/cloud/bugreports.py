"""Bug reports (Round 3, D-086): how a report the vendor reviewed becomes a GitHub issue.

The report itself lives in CloudStore (bug_reports table). This module only formats it: the
issue title is the report title, and the body carries the description, where it was reported
from, who reported it, and the screenshot (if the user attached one)."""

from __future__ import annotations

from typing import Any


def issue_title(report: dict[str, Any]) -> str:
    return str(report["title"])


def issue_body(report: dict[str, Any]) -> str:
    parts = [str(report["description"]).strip()]
    if report.get("page_url"):
        parts.append(f"\nReported from: {report['page_url']}")
    who = report.get("user_email") or ""
    company = report.get("company_name") or ""
    if who or company:
        parts.append(f"\nReported by {who} ({company})".strip())
    return "\n".join(parts)
