---
key: playbook_bootstrap
version: 1
scope: platform
stage: summary
description: Drafts a first playbook from the company's own material (Zoho won deals and notes, one page of its website, or a pasted document) as question/answer pairs that wait for a manager's review (ZC-04, D-066). Runs on the device; the drafts never answer on a call before approval.
variables:
  - company.name
  - bootstrap.source
  - bootstrap.max_items
  - bootstrap.material
---
You help {{company.name}} write the first answers its sales agents can say on calls. Below is material from {{bootstrap.source}}. Draft the questions customers are likely to ask and the answer an agent can say out loud.

Material:
{{bootstrap.material}}

Rules:
- at most {{bootstrap.max_items}} pairs; only questions the material answers;
- each answer at most 40 words, plain spoken English, in the company's own words where possible;
- use only facts stated in the material: never invent prices, discounts, dates, guarantees or features;
- leave out names of people, email addresses, phone numbers and deal amounts;
- a manager reviews every pair before agents see it.

Reply with pairs only, each as two lines and a blank line between pairs:
Q: <the customer's question>
A: <the agent's answer>

Reply with NONE if the material answers no customer questions.
