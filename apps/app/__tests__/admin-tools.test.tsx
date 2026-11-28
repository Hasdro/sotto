/** Admin tools (owner, 22 Oct): the team's recordings, devices and activity log. */
import { UIProvider } from "@sotto/ui";
import { fireEvent, render, screen } from "@testing-library/react-native";
import ActivityScreen from "../app/admin/activity";
import DevicesScreen from "../app/admin/devices";
import RecordingsScreen from "../app/admin/recordings";
import { cloudApi } from "../lib/cloud";
import { LocaleProvider } from "../lib/locale";

jest.mock("../lib/cloud", () => ({ ...jest.requireActual("../lib/cloud"), cloudApi: jest.fn() }));

const wrap = (ui: React.ReactElement) =>
  render(
    <LocaleProvider>
      <UIProvider direction="ltr">{ui}</UIProvider>
    </LocaleProvider>,
  );

describe("admin tools", () => {
  beforeEach(() => jest.mocked(cloudApi).mockReset());

  it("lists only calls that have a recording", async () => {
    const base = { user_id: "u", started_at: Date.now(), duration_s: 120, source: "teams" };
    jest.mocked(cloudApi).mockResolvedValue({
      calls: [
        { ...base, id: "co:a", name: "Rania", recording_bytes: 1000 },
        { ...base, id: "co:b", name: "Omar", recording_bytes: null },
      ],
    });
    await wrap(<RecordingsScreen />);
    expect(await screen.findByText("Rania")).toBeOnTheScreen();
    expect(screen.queryByText("Omar")).toBeNull();
    expect(screen.getByTestId("listen-a")).toBeOnTheScreen();
  });

  it("shows that recordings are loading instead of a blank page (FUNC-008)", async () => {
    jest.mocked(cloudApi).mockReturnValue(new Promise(() => {}));
    await wrap(<RecordingsScreen />);
    expect(screen.getByTestId("admin-recordings-loading")).toHaveTextContent("Loading recordings…");
  });

  it("says when recordings could not load, and tries again", async () => {
    const base = { user_id: "u", started_at: Date.now(), duration_s: 120, source: "teams" };
    jest
      .mocked(cloudApi)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ calls: [{ ...base, id: "co:a", name: "Rania", recording_bytes: 9 }] });
    await wrap(<RecordingsScreen />);
    expect(await screen.findByTestId("admin-recordings-error")).toBeOnTheScreen();
    expect(screen.queryByText("No recordings yet")).toBeNull(); // a failure is not "none"
    await fireEvent.press(screen.getByTestId("admin-recordings-retry"));
    expect(await screen.findByText("Rania")).toBeOnTheScreen();
  });

  it("lists every signed-in device with its person", async () => {
    jest.mocked(cloudApi).mockResolvedValue({
      devices: [
        {
          id: "d1",
          platform: "mac",
          label: "MacBook",
          last_seen: Date.now(),
          revoked: false,
          this_device: false,
          name: "Omar",
        },
        {
          id: "d2",
          platform: "web",
          label: "Old",
          last_seen: 0,
          revoked: true,
          this_device: false,
        },
      ],
    });
    await wrap(<DevicesScreen />);
    expect(await screen.findByText("MacBook")).toBeOnTheScreen();
    expect(screen.queryByText("Old")).toBeNull();
    expect(jest.mocked(cloudApi)).toHaveBeenCalledWith("/api/v1/devices?all=1");
  });

  it("shows who changed what", async () => {
    jest.mocked(cloudApi).mockResolvedValue({
      items: [
        {
          at: Date.now(),
          action: "key.set",
          detail: "Groq key",
          actor: "a@a.test",
          actor_name: "Ada",
        },
      ],
    });
    await wrap(<ActivityScreen />);
    expect(await screen.findByText("key.set · Groq key")).toBeOnTheScreen();
  });
});
