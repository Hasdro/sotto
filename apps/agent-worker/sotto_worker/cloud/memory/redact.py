"""Personal data redaction for style memory feedback (Round 4, A3, R11).

Strips emails, phone numbers, prices/amounts tied to a customer, URLs, account/ID numbers,
and explicit customer name references before feedback is persisted or sent to the merge model.
"""

from __future__ import annotations

import re

_EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
_URL_RE = re.compile(r"\bhttps?://\S+|\bwww\.\S+", re.IGNORECASE)
# Phone numbers: international (+971 50 123 4567) or local (050-123-4567, (555) 123-4567, 7+ digits)
# Negative lookarounds exclude hyphenated UUID segments and ISO dates (YYYY-MM-DD).
_PHONE_RE = re.compile(
    r"(?<![\w-])(?!\d{4}-\d{2}-\d{2}\b)(?![0-9a-f]{8}-[0-9a-f]{4}-)"
    r"(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?|\d{2,4}[\s.-])\d{3,4}[\s.-]?\d{3,4}(?![\w-])"
    r"|(?<![\w-])(?!\d{4}-\d{2}-\d{2}\b)(?![0-9a-f]{8}-[0-9a-f]{4}-)\+?\d{7,15}(?![\w-])",
    re.IGNORECASE,
)
_KEY_RE = re.compile(
    r"\b(?:sk-[A-Za-z0-9_-]{12,}|sk-ant-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9]{16,}|"
    r"gho_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,}|AIza[0-9A-Za-z_-]{20,}|"
    r"Bearer\s+[A-Za-z0-9._~+/=-]{12,}|Basic\s+[A-Za-z0-9+/=]{8,})\b",
    re.IGNORECASE,
)
# Currency/price figures: $1,200, AED 5000, 2,500 USD, EUR 300, SAR 450, 15k AED
_PRICE_RE = re.compile(
    r"(?:[$€£¥₹]|(?:USD|AED|EUR|GBP|SAR|QAR|KWD|BHD|OMR)\b)\s*\d[\d,]*(?:\.\d+)?[kKmM]?"
    r"|\b\d[\d,]*(?:\.\d+)?[kKmM]?\s*"
    r"(?:USD|AED|EUR|GBP|SAR|QAR|KWD|BHD|OMR|dollars?|dirhams?|euros?|pounds?)\b",
    re.IGNORECASE,
)
# Salutation + capitalized name (e.g. "Mr. John Smith", "Ms. Sara")
_HONORIFIC_NAME_RE = re.compile(
    r"\b(?:Mr|Mrs|Ms|Miss|Dr|Eng|Sheikh)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b"
)
# Explicit "customer/client/prospect/lead/contact <Capitalized Name>" (prefix case-insensitive,
# name strictly capitalized so lowercase verbs like "client asks" stay intact).
_LABELED_NAME_RE = re.compile(
    r"\b(?i:customer|client|prospect|lead|contact)\s+([A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,20})?)\b"
)


def strip_personal_data(
    text: str | None,
    *,
    known_names: tuple[str, ...] = (),
) -> str | None:
    """Remove personal data (emails, phones, prices, URLs, keys, customer names)."""
    if text is None:
        return None
    out = " ".join(text.split())
    if not out:
        return None
    out = _KEY_RE.sub("[redacted-key]", out)
    out = _EMAIL_RE.sub("[redacted-email]", out)
    out = _URL_RE.sub("[redacted-url]", out)
    out = _PRICE_RE.sub("[redacted-price]", out)
    out = _PHONE_RE.sub("[redacted-phone]", out)
    out = _HONORIFIC_NAME_RE.sub("[redacted-name]", out)
    out = _LABELED_NAME_RE.sub(lambda m: f"{m.group(0).split()[0]} [redacted-name]", out)
    for name in known_names:
        cleaned = name.strip()
        if len(cleaned) >= 2:
            out = re.sub(rf"\b{re.escape(cleaned)}\b", "[redacted-name]", out, flags=re.IGNORECASE)
    return out.strip() or None
