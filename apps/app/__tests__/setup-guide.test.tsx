import { UIProvider } from "@sotto/ui";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SetupGuideView } from "../app/admin/setup";
import { SETUP_STEPS, type SetupFacts } from "../features/home/setup";
import { HOME_TEXT, type HomeTextKey } from "../features/home/strings";
import { LocalModelsSettings } from "../features/settings/LocalModelsSettings";
import type { Locale } from "../lib/i18n";
import { LocaleProvider } from "../lib/locale";

/** An admin sees every step: Zoho is offered and loaded, the practice script is there. */
const admin: SetupFacts = {
  role: "admin",
  zohoOffered: true,
  zohoConnected: true,
  audioChecked: false,
  playbookEntries: 0,
  seatsUsed: 1,
  messagingConnected: false,
  practiceOffered: true,
  markedDone: [],
};

function guide(facts: SetupFacts, locale: Locale = "en"): ReactElement {
  const rtl = locale === "ar";
  return (
    <LocaleProvider initial={locale}>
      <UIProvider direction={rtl ? "rtl" : "ltr"} scheme={rtl ? "dark" : "light"}>
        <SetupGuideView facts={facts} onNavigate={() => {}} />
      </UIProvider>
    </LocaleProvider>
  );
}

/** Every string the screen shows or reads out: text, accessibility labels and hints. */
function shownText(node: unknown): string[] {
  if (typeof node === "string") return [node];
  if (Array.isArray(node)) return node.flatMap(shownText);
  if (!node || typeof node !== "object") return [];
  const n = node as { props?: Record<string, unknown>; children?: unknown[] | null };
  const read = ["accessibilityLabel", "accessibilityHint", "aria-label"]
    .map((k) => n.props?.[k])
    .filter((v): v is string => typeof v === "string");
  return [...read, ...(n.children ?? []).flatMap(shownText)];
}

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();

describe("SetupGuideView (L2)", () => {
  it("shows role-specific steps, live status, Test it result, and Fix it navigation", async () => {
    const nav = jest.fn();
    await render(
      <UIProvider direction="ltr" scheme="light">
        <SetupGuideView facts={admin} onNavigate={nav} />
      </UIProvider>,
    );
    expect(screen.getByTestId("setup-guide")).toBeTruthy();
    expect(screen.getByText("Zoho: connected ✓")).toBeTruthy();
    expect(screen.getByText("WhatsApp / Email: not set up")).toBeTruthy();
    expect(screen.getByText("Recommended default: Connected per agent")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("setup-guide-fix-messaging"));
    expect(nav).toHaveBeenCalledWith("/admin/integrations");

    await fireEvent.press(screen.getByTestId("setup-guide-test-zoho"));
    await fireEvent.press(screen.getByTestId("setup-guide-test-messaging"));
    await waitFor(() => {
      expect(screen.getByText("Zoho: connected ✓ (verified)")).toBeTruthy();
    });
    expect(
      screen.getByText("WhatsApp / Email: not set up — open Fix it to complete."),
    ).toBeTruthy();
  });

  it("counts playbook answers and team seats, with its own line for one answer", async () => {
    const view = await render(guide({ ...admin, playbookEntries: 12, seatsUsed: 3 }));
    expect(screen.getByText("Playbook: 12 entries ready ✓")).toBeTruthy();
    expect(screen.getByText("Team: 3 seats active ✓")).toBeTruthy();
    await view.rerender(guide({ ...admin, playbookEntries: 1, seatsUsed: 1 }));
    expect(screen.getByText("Playbook: 1 entry ready ✓")).toBeTruthy();
    expect(screen.getByText("Team: only 1 seat so far")).toBeTruthy();
  });

  it("reads fully in Arabic: no Latin letters outside names such as Zoho", async () => {
    const view = await render(guide({ ...admin, playbookEntries: 12, seatsUsed: 3 }, "ar"));
    for (const id of ["zoho", "audio", "practice", "playbook", "invite", "messaging"]) {
      expect(screen.getByTestId(`setup-guide-step-${id}`)).toBeTruthy();
    }
    expect(screen.getByText("دليل الإعداد")).toBeTruthy();
    expect(screen.getByText("حساب Zoho: متصل ✓")).toBeTruthy();
    expect(screen.getByText("الدليل: عدد الإجابات 12 ✓")).toBeTruthy();
    expect(screen.getByText("الفريق: عدد المقاعد النشطة 3 ✓")).toBeTruthy();
    expect(screen.getByText("الإعداد الموصى به: يربط كل مندوب حسابه الخاص")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("setup-guide-test-zoho"));
    await fireEvent.press(screen.getByTestId("setup-guide-test-messaging"));
    await waitFor(() => {
      expect(screen.getByText("حساب Zoho: متصل ✓ (تم التحقق)")).toBeTruthy();
    });
    expect(
      screen.getByText("البريد أو واتساب: غير متصل — افتح «أصلحها» لإكمال الخطوة."),
    ).toBeTruthy();

    const latin = (tree: unknown) =>
      shownText(tree)
        .map((s) => s.replace(/Zoho CRM|Zoho/g, ""))
        .filter((s) => /[A-Za-z]/.test(s));
    expect(latin(screen.toJSON())).toEqual([]);

    await view.rerender(guide({ ...admin, playbookEntries: 1 }, "ar"));
    expect(screen.getByText("الدليل: إجابة واحدة جاهزة ✓")).toBeTruthy();
    expect(latin(screen.toJSON())).toEqual([]);
  });

  it("keeps every step's text in the Home table, with the same placeholders in Arabic", () => {
    const keys = Object.keys(HOME_TEXT.en) as HomeTextKey[];
    expect(Object.keys(HOME_TEXT.ar).sort()).toEqual([...keys].sort());
    for (const key of keys) {
      expect([key, placeholders(HOME_TEXT.ar[key])]).toEqual([
        key,
        placeholders(HOME_TEXT.en[key]),
      ]);
    }
    for (const step of SETUP_STEPS) {
      for (const key of [step.title, step.whatItDoes, step.recommendedDefault]) {
        expect([step.id, typeof key === "string" && key in HOME_TEXT.en]).toEqual([step.id, true]);
      }
    }
    // Every state, not only the ones rendered above: Arabic apart from names and placeholders.
    const english = keys.filter((key) =>
      /[A-Za-z]/.test(HOME_TEXT.ar[key].replace(/Zoho CRM|Zoho|\{\w+\}/g, "")),
    );
    expect(english).toEqual([]);
  });
});

describe("LocalModelsSettings (L6, D-096)", () => {
  it("runs Test benchmark and reveals slow-model opt-in warning when > 1500 ms", async () => {
    const onSave = jest.fn();
    const onTest = jest.fn(async () => ({
      reachable: true,
      measuredMs: 2150,
      meetsR1: false,
      statusLabel: "Local model: connected ✓",
    }));

    await render(
      <UIProvider direction="ltr" scheme="light">
        <LocalModelsSettings onTest={onTest} onSave={onSave} />
      </UIProvider>,
    );

    await fireEvent.press(screen.getByTestId("local-model-test"));
    await waitFor(() => {
      expect(screen.getByTestId("local-model-status")).toBeTruthy();
      expect(screen.getByTestId("local-model-slow-warning")).toBeTruthy();
    });
    expect(screen.getByText(/2150 ms/)).toBeTruthy();
    expect(screen.getByText("Use it for live cards anyway")).toBeTruthy();
  });
});
