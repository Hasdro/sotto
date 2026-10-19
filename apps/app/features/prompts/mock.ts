/**
 * Mock prompt versions for the studio (P6.2). Bodies are variable templates only: real prompt
 * text lives in seed/prompts (the registry), never in app code (CLAUDE.md).
 */
import type { PromptDoc } from "./studio";

export type StudioPrompt = PromptDoc & { /** Last replay quality score, 0–100. */ score: number };

const SUGGEST_VARS = [
  "company.name",
  "company.tone",
  "company.call_goal",
  "playbook.match",
  "transcript.last_60s",
];

export const PROMPT_DOCS: StudioPrompt[] = [
  {
    key: "suggest",
    description: "Live suggestion card",
    scope: "company",
    variables: SUGGEST_VARS,
    score: 91,
    versions: [
      {
        version: 1,
        status: "archived",
        created: "2026-09-20",
        body: "Company: {{company.name}}\nPlaybook match: {{playbook.match}}\nRecent talk: {{transcript.last_60s}}",
      },
      {
        version: 2,
        status: "archived",
        created: "2026-09-28",
        body: "Company: {{company.name}}\nTone: {{company.tone}}\nPlaybook match: {{playbook.match}}\nRecent talk: {{transcript.last_60s}}",
      },
      {
        version: 3,
        status: "archived",
        created: "2026-10-04",
        body: "Company: {{company.name}}\nTone: {{company.tone}}\nGoal: {{company.call_goal}}\nPlaybook match: {{playbook.match}}\nRecent talk: {{transcript.last_60s}}",
      },
      {
        version: 4,
        status: "published",
        created: "2026-10-12",
        body: "Company: {{company.name}}\nGoal: {{company.call_goal}}\nTone: {{company.tone}}\nPlaybook match: {{playbook.match}}\nRecent talk: {{transcript.last_60s}}",
      },
      {
        version: 5,
        status: "draft",
        created: "2026-10-16",
        body: "Company: {{company.name}}\nGoal: {{company.call_goal}}\nTone: {{company.tone}}\nRecent talk: {{transcript.last_60s}}\nPlaybook match: {{playbook.match}}",
      },
    ],
  },
  {
    key: "trigger",
    description: "Does this turn need a card?",
    scope: "platform",
    variables: ["turn.text", "transcript.last_60s"],
    score: 96,
    versions: [
      { version: 1, status: "archived", created: "2026-09-18", body: "Turn: {{turn.text}}" },
      {
        version: 2,
        status: "published",
        created: "2026-10-10",
        body: "Turn: {{turn.text}}\nContext: {{transcript.last_60s}}",
      },
    ],
  },
  {
    key: "summary",
    description: "After-call summary",
    scope: "company",
    variables: ["company.name", "company.call_goal", "call.transcript", "call.escalations"],
    score: 88,
    versions: [
      {
        version: 1,
        status: "published",
        created: "2026-10-08",
        body: "Company: {{company.name}}\nGoal: {{company.call_goal}}\nTranscript: {{call.transcript}}\nOpen questions: {{call.escalations}}",
      },
    ],
  },
  {
    key: "escalation_email",
    description: "Email to the sales manager",
    scope: "team",
    variables: [
      "company.name",
      "escalation.question",
      "escalation.transcript",
      "escalation.agent",
      "escalation.customer",
    ],
    score: 93,
    versions: [
      {
        version: 1,
        status: "archived",
        created: "2026-09-22",
        body: "Question: {{escalation.question}}\nAgent: {{escalation.agent}}",
      },
      {
        version: 2,
        status: "archived",
        created: "2026-09-30",
        body: "Question: {{escalation.question}}\nCustomer: {{escalation.customer}}\nAgent: {{escalation.agent}}",
      },
      {
        version: 3,
        status: "published",
        created: "2026-10-05",
        body: "Company: {{company.name}}\nQuestion: {{escalation.question}}\nCustomer: {{escalation.customer}}\nAgent: {{escalation.agent}}\nExcerpt: {{escalation.transcript}}",
      },
    ],
  },
  {
    key: "judge",
    description: "Scores suggestion quality in replays",
    scope: "platform",
    variables: ["turn.text", "card.text", "playbook.match"],
    score: 100,
    versions: [
      {
        version: 1,
        status: "published",
        created: "2026-09-30",
        body: "Turn: {{turn.text}}\nCard: {{card.text}}\nPlaybook match: {{playbook.match}}",
      },
    ],
  },
];
