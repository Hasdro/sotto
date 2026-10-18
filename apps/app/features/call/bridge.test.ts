import {
  bridgeUrl,
  connectBridge,
  DEFAULT_BRIDGE_URL,
  decodeServerFrame,
  encodeClientMessage,
} from "./bridge";

const valid = JSON.stringify({
  type: "call_started",
  call_id: "0b8f3c1e-7a2d-4e6f-8c9b-1d2e3f4a5b6c",
});

class FakeSocket {
  static last: FakeSocket | null = null;
  readyState = 0;
  sent: string[] = [];
  closed = false;
  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  constructor(public url: string) {
    FakeSocket.last = this;
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
    this.onclose?.({});
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
}

const factory = (url: string) => new FakeSocket(url);

describe("demo bridge client", () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it("defaults to the local bridge port", () => {
    expect(DEFAULT_BRIDGE_URL).toBe("ws://127.0.0.1:8787");
    expect(bridgeUrl()).toBe(DEFAULT_BRIDGE_URL);
  });

  it("decodes a valid frame", () => {
    expect(decodeServerFrame(valid)).toEqual({
      type: "call_started",
      call_id: "0b8f3c1e-7a2d-4e6f-8c9b-1d2e3f4a5b6c",
    });
  });

  it.each([
    ["not JSON", "{oops"],
    ["unknown type", JSON.stringify({ type: "surprise" })],
    ["bad card", JSON.stringify({ type: "card", card: { v: 2 } })],
    ["extra field", JSON.stringify({ type: "turn_end", at_ms: 1, extra: true })],
  ])("drops and logs an invalid frame (%s)", (_name, raw) => {
    expect(decodeServerFrame(raw)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("refuses to encode an invalid client message", () => {
    expect(encodeClientMessage({ type: "say", speaker: "customer", text: "" })).toBeNull();
    expect(encodeClientMessage({ type: "end" })).toBe('{"type":"end"}');
  });

  it("reports connecting, delivers only valid messages, and goes offline on close", () => {
    const statuses: string[] = [];
    const messages: unknown[] = [];
    const bridge = connectBridge(
      "ws://test",
      { onStatus: (s) => statuses.push(s), onMessage: (m) => messages.push(m) },
      factory,
    );
    const sock = FakeSocket.last as FakeSocket;
    expect(sock.url).toBe("ws://test");
    sock.open();
    sock.onmessage?.({ data: valid });
    sock.onmessage?.({ data: "garbage" });
    expect(messages).toHaveLength(1);
    sock.onclose?.({});
    expect(statuses).toEqual(["connecting", "offline"]);
    bridge.close();
  });

  it("sends validated JSON only while open", () => {
    const bridge = connectBridge("ws://test", { onStatus: () => {}, onMessage: () => {} }, factory);
    const sock = FakeSocket.last as FakeSocket;
    expect(bridge.send({ type: "end" })).toBe(false);
    sock.open();
    expect(bridge.send({ type: "start", scenario_id: "price-objection" })).toBe(true);
    expect(bridge.send({ type: "say", speaker: "customer", text: "" })).toBe(false);
    expect(sock.sent).toEqual(['{"type":"start","scenario_id":"price-objection"}']);
  });

  it("a deliberate close does not report offline", () => {
    const statuses: string[] = [];
    const bridge = connectBridge(
      "ws://test",
      { onStatus: (s) => statuses.push(s), onMessage: () => {} },
      factory,
    );
    bridge.close();
    expect(statuses).toEqual(["connecting"]);
  });

  it("goes offline when the socket cannot be created", () => {
    const statuses: string[] = [];
    const bridge = connectBridge(
      "bad",
      { onStatus: (s) => statuses.push(s), onMessage: () => {} },
      () => {
        throw new Error("boom");
      },
    );
    expect(statuses).toEqual(["connecting", "offline"]);
    expect(bridge.send({ type: "end" })).toBe(false);
  });
});
