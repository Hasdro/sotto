import { useSyncExternalStore } from "react";
import { type CloudState, cloudState, subscribeCloud } from "./cloud";

/** The management-server session (D-022) for React: re-renders on sign-in, sign-out, refresh. */
export function useCloud(): CloudState {
  return useSyncExternalStore(subscribeCloud, cloudState, cloudState);
}
