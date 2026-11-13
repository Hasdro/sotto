/**
 * Mock role switch (P3.5, R3): which areas each role may open. Phase 5 replaces the switch with
 * the signed-in member's role; the area table stays the single place that gates navigation.
 *
 * R3: agents take calls, see suggestions and their own history; managers also edit the playbook
 * and answer their team's escalations; company admins also manage users, prompts and models.
 */
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { Platform } from "react-native";
import { type Member, TEAM } from "../features/admin/mock";

export type ViewRole = "agent" | "manager" | "admin";
export const VIEW_ROLES: readonly ViewRole[] = ["agent", "manager", "admin"];

export type Area =
  | "/home"
  | "/call"
  | "/history"
  | "/reports"
  | "/playbook"
  | "/inbox"
  | "/admin"
  | "/settings";

/** D-050: agents never see the Inbox or the playbook editor (R3 table: "Edit playbook: no"). */
export const ROLE_AREAS: Record<ViewRole, readonly Area[]> = {
  agent: ["/home", "/call", "/history", "/reports", "/settings"],
  manager: ["/home", "/call", "/history", "/reports", "/playbook", "/inbox", "/settings"],
  admin: ["/home", "/call", "/history", "/reports", "/playbook", "/inbox", "/admin", "/settings"],
};

const AREAS: readonly Area[] = ["/call", "/history", "/playbook", "/inbox", "/admin"];

/** The gated area a path belongs to, or null for pages every role may open (e.g. /gallery). */
export function areaOf(pathname: string): Area | null {
  if (pathname === "/" || pathname === "") return "/call";
  return AREAS.find((a) => pathname === a || pathname.startsWith(`${a}/`)) ?? null;
}

export function canOpen(role: ViewRole, pathname: string): boolean {
  const area = areaOf(pathname);
  return area === null || ROLE_AREAS[role].includes(area);
}

/** The mock person shown for each role (first team member with that role). */
export function personaFor(role: ViewRole): Member {
  const member = TEAM.find((m) => m.role === role);
  if (!member) throw new Error(`mock team has no ${role}`);
  return member;
}

const STORAGE_KEY = "sotto.viewRole";

/** Web only: the role chosen last time on this browser (a per-viewer convenience). */
function storedRole(): ViewRole | null {
  if (Platform.OS !== "web") return null;
  try {
    const value = globalThis.localStorage?.getItem(STORAGE_KEY);
    return VIEW_ROLES.find((r) => r === value) ?? null;
  } catch {
    return null; // storage blocked: fall back to the default
  }
}

type RoleContextValue = { role: ViewRole; setRole: (role: ViewRole) => void };

const RoleContext = createContext<RoleContextValue | null>(null);

/** Defaults to admin so the demo shows every screen until someone switches. */
export function RoleProvider({ initial, children }: { initial?: ViewRole; children: ReactNode }) {
  const [role, setRoleState] = useState<ViewRole>(() => initial ?? storedRole() ?? "admin");
  const setRole = useCallback((next: ViewRole) => {
    setRoleState(next);
    if (Platform.OS === "web") {
      try {
        globalThis.localStorage?.setItem(STORAGE_KEY, next);
      } catch {
        // storage blocked: the choice still applies for this visit
      }
    }
  }, []);
  const value = useMemo(() => ({ role, setRole }), [role, setRole]);
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

/** Outside a provider (leaf component tests) the role is admin and cannot change. */
export function useRole(): RoleContextValue {
  return useContext(RoleContext) ?? { role: "admin", setRole: () => {} };
}
