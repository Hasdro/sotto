---
key: coaching_digest
version: 1
scope: platform
stage: summary
description: Weekly coaching email to a manager or admin who opted in (INT-05). Rendered on the server, not sent to a model. Numbers and themes only, never call words.
variables:
  - company.name
  - digest.reader
  - digest.scope
  - digest.days
  - digest.calls
  - digest.not_helpful
  - digest.objections
  - digest.skills
  - digest.instructions
  - digest.suggestions
  - digest.link
---
Subject: {{company.name}} coaching, last {{digest.days}} days

Hello {{digest.reader}},

Here is what your {{digest.scope}} did in the last {{digest.days}} days.

Calls: {{digest.calls}}
AI cards marked "not helpful": {{digest.not_helpful}}

Objections that came up most:
{{digest.objections}}

Skill to practise, per person (weakest of the six review skills):
{{digest.skills}}

What AGN learned from your team's ratings:
{{digest.instructions}}

Playbook suggestions waiting for you: {{digest.suggestions}}

Open the coaching page: {{digest.link}}

You get this email because you turned on the weekly coaching email. Turn it off on the same page.
