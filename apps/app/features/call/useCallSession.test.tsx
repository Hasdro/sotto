import { act, renderHook } from "@testing-library/react-native";
import type { SocketFactory } from "./bridge";
import { demoEnabled } from "./devGate";
import { RETRY_MS, useCallSession } from "./useCallSession";

jest.mock("./devGate", () => ({ demoEnabled: jest.fn(() => true) }));

describe("useCallSession", () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    jest.useFakeTimers();
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    jest.useRealTimers();
    warn.mockRestore();
    jest.mocked(demoEnabled).mockReturnValue(true);
  });

  it("keeps retrying every RETRY_MS for as long as the bridge stays offline", async () => {
    const failing = jest.fn<ReturnType<SocketFactory>, [string]>(() => {
      throw new Error("ECONNREFUSED");
    });
    const { result } = await renderHook(() =>
      useCallSession({ mock: false, locale: "en", socketFactory: failing }),
    );
    expect(result.current.state.connection).toBe("offline");
    expect(failing).toHaveBeenCalledTimes(1);
    for (let i = 2; i <= 5; i++) {
      await act(async () => {
        jest.advanceTimersByTime(RETRY_MS);
      });
      expect(failing).toHaveBeenCalledTimes(i);
    }
    expect(result.current.state.connection).toBe("offline");
  });

  it("stops retrying once the bridge greets", async () => {
    let calls = 0;
    const factory: SocketFactory = () => {
      calls += 1;
      if (calls === 1) throw new Error("not yet");
      const sock = {
        readyState: 1,
        onopen: null,
        onclose: null,
        onerror: null,
        onmessage: null as ((ev: { data: unknown }) => void) | null,
        send: () => {},
        close: () => {},
      };
      setTimeout(() =>
        sock.onmessage?.({
          data: JSON.stringify({
            type: "hello",
            v: 1,
            company_name: "Demo",
            mode: "fake",
            scenarios: [],
          }),
        }),
      );
      return sock;
    };
    const { result } = await renderHook(() =>
      useCallSession({ mock: false, locale: "en", socketFactory: factory }),
    );
    await act(async () => {
      jest.advanceTimersByTime(RETRY_MS); // second attempt connects
    });
    await act(async () => {
      jest.advanceTimersByTime(1); // its hello arrives
    });
    expect(result.current.state.connection).toBe("open");
    await act(async () => {
      jest.advanceTimersByTime(RETRY_MS * 3);
    });
    expect(calls).toBe(2);
  });

  it("a production build never opens the demo socket or the mock stream", async () => {
    jest.mocked(demoEnabled).mockReturnValue(false);
    const factory = jest.fn<ReturnType<SocketFactory>, [string]>();
    const { result } = await renderHook(() =>
      useCallSession({ mock: true, locale: "en", socketFactory: factory }),
    );
    await act(async () => {
      jest.advanceTimersByTime(RETRY_MS * 3);
    });
    expect(factory).not.toHaveBeenCalled();
    expect(result.current.state.hello).toBeNull();
  });
});
