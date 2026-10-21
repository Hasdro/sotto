/**
 * In-memory store for the inbox and playbook mocks, so answering an escalation shows up in the
 * playbook during a demo session (P7.2). Phase 5 replaces it with Supabase + approve_escalation().
 */
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { cloudOrigin } from "../../lib/cloud";
import { useI18n } from "../../lib/locale";
import { useCloud } from "../../lib/useCloud";
import { INBOX } from "../inbox/mock";
import { PLAYBOOK } from "../playbook/mock";
import { addToPlaybook, type EscalationState, type FlowError, saveAnswer } from "./flow";
import { escalationsApi, loadServerInbox } from "./server";

type StoreValue = EscalationState & {
  save: (id: string, answer: string) => FlowError | null;
  add: (id: string, answer: string) => FlowError | null;
  /** Fetch this server's inbox again (after an escalation, or when the inbox opens). */
  reload: () => void;
};

const StoreContext = createContext<StoreValue | null>(null);

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function EscalationStoreProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  // A real account (management server, D-022) sees only its own questions and playbook; the
  // made-up samples are for builds without a server.
  const samples = !cloudOrigin();
  const [state, setState] = useState<EscalationState>(
    samples ? { inbox: INBOX, playbook: PLAYBOOK } : { inbox: [], playbook: [] },
  );
  // The local demo's questions come from practice calls; a real account's from real customers.
  const customer = t(samples ? "history.outcome.practice" : "call.speaker.customer");
  const agent = t("call.speaker.agent");
  // Reload once someone signs in to the management server (D-022).
  const signedIn = useCloud().status === "signed_in";
  // Questions escalated on this server go above the samples (D-020); no server: samples only.
  const reload = useCallback(() => {
    if (cloudOrigin() && !signedIn) return;
    loadServerInbox({ customer, agent })
      .then((server) => {
        const ids = new Set(server.playbook.map((e) => e.id));
        setState(
          samples
            ? {
                inbox: [...server.inbox, ...INBOX],
                playbook: [...server.playbook, ...PLAYBOOK.filter((e) => !ids.has(e.id))],
              }
            : server,
        );
      })
      .catch(() => {});
  }, [customer, agent, signedIn, samples]);
  useEffect(reload, [reload]);
  const apply = useCallback(
    (result: ReturnType<typeof saveAnswer>, sync?: () => Promise<unknown>): FlowError | null => {
      if (!result.ok) return result.error;
      setState(result.state);
      // Same rules on both sides, so the server agrees; if it does not, show its truth.
      sync?.().catch(reload);
      return null;
    },
    [reload],
  );
  const fromServer = useCallback(
    (id: string) => state.inbox.find((i) => i.id === id)?.source === "server",
    [state],
  );
  const save = useCallback(
    (id: string, answer: string) =>
      apply(
        saveAnswer(state, id, answer),
        fromServer(id) ? () => escalationsApi.answer(id, answer.trim()) : undefined,
      ),
    [apply, state, fromServer],
  );
  const add = useCallback(
    (id: string, answer: string) =>
      apply(
        addToPlaybook(state, id, answer, today()),
        fromServer(id) ? () => escalationsApi.addToPlaybook(id, answer.trim()) : undefined,
      ),
    [apply, state, fromServer],
  );
  const value = useMemo(() => ({ ...state, save, add, reload }), [state, save, add, reload]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

/** Outside a provider (leaf tests) the store is the read-only mock data. */
export function useEscalations(): StoreValue {
  return (
    useContext(StoreContext) ?? {
      inbox: INBOX,
      playbook: PLAYBOOK,
      save: () => "not_found",
      add: () => "not_found",
      reload: () => {},
    }
  );
}
