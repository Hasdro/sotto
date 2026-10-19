/**
 * In-memory store for the inbox and playbook mocks, so answering an escalation shows up in the
 * playbook during a demo session (P7.2). Phase 5 replaces it with Supabase + approve_escalation().
 */
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { INBOX } from "../inbox/mock";
import { PLAYBOOK } from "../playbook/mock";
import { addToPlaybook, type EscalationState, type FlowError, saveAnswer } from "./flow";

type StoreValue = EscalationState & {
  save: (id: string, answer: string) => FlowError | null;
  add: (id: string, answer: string) => FlowError | null;
};

const StoreContext = createContext<StoreValue | null>(null);

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function EscalationStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<EscalationState>({ inbox: INBOX, playbook: PLAYBOOK });
  const apply = useCallback((result: ReturnType<typeof saveAnswer>): FlowError | null => {
    if (!result.ok) return result.error;
    setState(result.state);
    return null;
  }, []);
  const save = useCallback(
    (id: string, answer: string) => apply(saveAnswer(state, id, answer)),
    [apply, state],
  );
  const add = useCallback(
    (id: string, answer: string) => apply(addToPlaybook(state, id, answer, today())),
    [apply, state],
  );
  const value = useMemo(() => ({ ...state, save, add }), [state, save, add]);
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
    }
  );
}
