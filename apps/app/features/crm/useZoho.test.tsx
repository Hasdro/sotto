/** W1-L1: the desktop deep link `zoho/connected` re-reads the Zoho status at once. */
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { DeepLink } from "../../lib/desktop";
import { useZoho } from "./useZoho";

jest.mock("../../lib/cloud", () => ({
  CloudError: class extends Error {},
  cloudApi: jest.fn(),
  refreshFeatures: jest.fn(),
}));

const { cloudApi } = jest.requireMock("../../lib/cloud") as { cloudApi: jest.Mock };
const g = globalThis as { sottoDesktop?: unknown };

afterEach(() => {
  delete g.sottoDesktop;
  cloudApi.mockReset();
});

describe("useZoho deep link (W1-L1)", () => {
  it("re-reads the status when the desktop app opens agn-sales-shield://zoho/connected", async () => {
    let deliver: (l: DeepLink) => void = () => {};
    const off = jest.fn();
    g.sottoDesktop = {
      callState: async () => ({ app: null }),
      onCallState: () => () => {},
      onDeepLink: (cb: (l: DeepLink) => void) => {
        deliver = cb;
        return off;
      },
    };
    cloudApi.mockResolvedValueOnce({ connected: false, feature: { state: "x" }, client: "org" });
    const { result, unmount } = await renderHook(() => useZoho());
    await waitFor(() => expect(result.current.status?.connected).toBe(false));
    cloudApi.mockResolvedValueOnce({ connected: true, feature: { state: "x" }, client: "org" });
    await act(async () => deliver({ kind: "zoho", status: "connected" }));
    await waitFor(() => expect(result.current.status?.connected).toBe(true));
    expect(result.current.justConnected).toBe(true);
    expect(cloudApi.mock.calls.filter(([p]) => String(p).includes("/zoho/status"))).toHaveLength(2);
    await unmount();
    expect(off).toHaveBeenCalled();
  });

  it("works without the desktop app (focus and polling only)", async () => {
    cloudApi.mockResolvedValue({ connected: true, feature: { state: "x" }, client: "org" });
    const { result } = await renderHook(() => useZoho());
    await waitFor(() => expect(result.current.status?.connected).toBe(true));
  });
});
