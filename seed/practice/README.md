# Practice call (D-073, owner Q15)

One neutral scripted call for "Try a practice call" in real accounts. It names no company,
product or price, so the cards come from the company's own playbook and AI settings, and it
is the same script for every company.

- `practice.json`: the script, in the `seed/demo/calls` scenario format (`expect` per line is
  used only by the replay; the app ignores it). Shipped to the app as `bundle.practice`.
- A practice call is labelled "Practice" and is never saved to History, Reports, ratings or
  learning, and nothing about it is uploaded (`apps/app/features/call/practice.ts`).
