/** In-memory prompt studio store (P6.2) until Phase 6 reads and writes `prompt_versions`. */
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { PROMPT_DOCS, type StudioPrompt } from "./mock";
import { publishVersion, type Scope, saveDraft } from "./studio";

type StoreValue = {
  prompts: readonly StudioPrompt[];
  save: (key: string, body: string) => void;
  publish: (key: string, version: number) => void;
  setScope: (key: string, scope: Scope) => void;
};

const StoreContext = createContext<StoreValue | null>(null);

export function PromptStoreProvider({ children }: { children: ReactNode }) {
  const [prompts, setPrompts] = useState<readonly StudioPrompt[]>(PROMPT_DOCS);
  const update = useCallback((key: string, change: (p: StudioPrompt) => StudioPrompt) => {
    setPrompts((all) => all.map((p) => (p.key === key ? change(p) : p)));
  }, []);
  const value = useMemo<StoreValue>(
    () => ({
      prompts,
      save: (key, body) =>
        update(key, (p) => ({
          ...p,
          ...saveDraft(p, body, new Date().toISOString().slice(0, 10)),
        })),
      publish: (key, version) => update(key, (p) => ({ ...p, ...publishVersion(p, version) })),
      setScope: (key, scope) => update(key, (p) => ({ ...p, scope })),
    }),
    [prompts, update],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

/** Outside a provider (leaf tests) the store is the read-only mock data. */
export function usePrompts(): StoreValue {
  return (
    useContext(StoreContext) ?? {
      prompts: PROMPT_DOCS,
      save: () => {},
      publish: () => {},
      setScope: () => {},
    }
  );
}
