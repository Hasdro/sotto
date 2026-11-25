"""Personal data redaction for style memory feedback (Round 4, A3, R11).

Strips emails, phone numbers, prices/amounts tied to a customer, URLs, account/ID numbers,
and explicit customer name references before feedback is persisted or sent to the merge model.
"""

from __future__ import annotations

import re

_EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
_URL_RE = re.compile(r"\bhttps?://\S+|\bwww\.\S+", re.IGNORECASE)
# Phone numbers: international (+971 50 123 4567) or local (050-123-4567, (555) 123-4567, 7+ digits)
_PHONE_RE = re.compile(
    r"(?<!\w)(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?|\d{2,4}[\s.-])\d{3,4}[\s.-]?\d{3,4}(?!\w)"
    r"|(?<!\w)\+?\d{7,15}(?!\w)"
)
# Currency/price figures: $1,200, AED 5000, 2,500 USD, €300, £99.50, SAR 450, 15k AED
_PRICE_RE = re.compile(
    r"(?:[$€£¥₹]|(?:USD|AED|EUR|GBP|SAR|QAR|KWD|BHD|OMR)\b)\s*\d[\d,]*(?:\.\d+)?[kKmM]?"
    r"|\b\d[\d,]*(?:\.\d+)?[kKmM]?\s*(?:USD|AED|EUR|GBP|SAR|QAR|KWD|BHD|OMR|dollars?|dirhams?|euros?|pounds?)\b",
    re.IGNORECASE,
)
# Salutation + capitalized name (e.g. "Mr. John Smith", "Ms. Sara")
_HONORIFIC_NAME_RE = re.compile(
    r"\b(?:Mr|Mrs|Ms|Miss|Dr|Eng|Sheikh)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b"
)
# Explicit "customer/client/prospect/lead/with <Capitalized Name>" patterns
_LABELED_NAME_RE = re.compile(
    r"\b(customer|client|prospect|lead|contact)\s+([A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,20})?)\b",
    re.IGNORECASE,
)


def strip_personal_data(
    text: str | None,
    *,
    known_names: tuple[str, ...] = (),
) -> str | None:
    """Remove personal data (emails, phones, prices, URLs, customer names) from feedback text."""
    if text is None:
        return None
    out = " ".join(text.split())
    if not out:
        return None
    out = _EMAIL_RE.sub("[redacted-email]", out)
    out = _URL_RE.sub("[redacted-url]", out)
    out = _PRICE_RE.sub("[redacted-price]", out)
    out = _PHONE_RE.sub("[redacted-phone]", out)
    out = _HONORIFIC_NAME_RE.sub("[redacted-name]", out)
    out = _LABELED_NAME_RE.sub(lambda m: f"{m.group(1)} [redacted-name]", out)
    for name in known_names:
        cleaned = name.strip()
        if len(cleaned) >= 2:
            out = re.sub(rf"\b{re.escape(cleaned)}\b", "[redacted-name]", out, flags=re.IGNORECASE)
    return out.strip() or None
