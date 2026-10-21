/** The speech-to-text adapter's edges: Speechmatics, vendor errors, closing (T-042). */
import { describe, expect, it } from "vitest";
import { openStt, type SocketLike } from "./adapters/stt.ts";
import type { TranscriptEvent } from "./types.ts";

class Sock implements SocketLike {
  readyState = 0;
  binaryType = "";
  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: { code?: number; reason?: string }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  sent: (string | ArrayBuffer)[] = [];
  closed = false;
  readonly url: string;
  constructor(url: string) {
    this.url = url;
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  emit(m: unknown) {
    this.onmessage?.({ data: typeof m === "string" ? m : JSON.stringify(m) });
  }
  send(d: string | ArrayBuffer) {
    this.sent.push(d);
    if (typeof d === "string" && d.includes("EndOfStream"))
      this.emit({ message: "EndOfTranscript" });
  }
  close() {
    this.closed = true;
    this.readyState = 3;
  }
  json(): Record<string, unknown>[] {
    return this.sent.filter((d): d is string => typeof d === "string").map((d) => JSON.parse(d));
  }
}

async function open(provider: string, model = "enhanced") {
  let sock: Sock | null = null;
  const events: TranscriptEvent[] = [];
  const errors: Error[] = [];
  const stream = await openStt(
    { provider, model },
    async () => ({ token: "t", param: "jwt" }),
    { onEvent: (e) => events.push(e), onError: (e) => errors.push(e) },
    (url) => {
      sock = new Sock(url);
      return sock;
    },
  );
  return { stream, sock: sock as unknown as Sock, events, errors };
}

const frame = () => new ArrayBuffer(640);

describe("Speechmatics (client)", () => {
  it("starts recognition, holds audio until it starts, and maps partials and finals", async () => {
    const { stream, sock, events } = await open("speechmatics");
    expect(new URL(sock.url).searchParams.get("jwt")).toBe("t");
    stream.send(frame()); // before the socket opens: kept
    sock.open();
    expect(sock.json()[0]).toMatchObject({ message: "StartRecognition" });
    stream.send(frame()); // open but not started: kept
    stream.finalize(); // nothing to finalise before recognition starts
    expect(sock.sent.filter((d) => d instanceof ArrayBuffer)).toHaveLength(0);
    sock.emit({ message: "RecognitionStarted" });
    expect(sock.sent.filter((d) => d instanceof ArrayBuffer)).toHaveLength(2);
    stream.send(frame());
    expect(sock.sent.filter((d) => d instanceof ArrayBuffer)).toHaveLength(3);
    sock.emit("not json");
    sock.emit({ message: "Info" });
    sock.emit({ message: "AddPartialTranscript", metadata: { transcript: " " } });
    sock.emit({
      message: "AddPartialTranscript",
      metadata: { transcript: "is there", start_time: 0.1, end_time: 0.5 },
    });
    sock.emit({
      message: "AddTranscript",
      metadata: { transcript: "Is there parking?", start_time: 0.1, end_time: 0.9 },
    });
    sock.emit({ message: "AddTranscript" });
    expect(events.map((e) => [e.text, e.final, e.end_ms])).toEqual([
      ["is there", false, 500],
      ["Is there parking?", true, 900],
    ]);
    stream.finalize();
    expect(sock.json().at(-1)).toEqual({ message: "ForceEndOfUtterance" });
    await stream.end();
    expect(sock.json().at(-1)).toMatchObject({ message: "EndOfStream", last_seq_no: 3 });
    expect(sock.closed).toBe(true);
    stream.send(frame()); // after the end: ignored
    expect(sock.sent.filter((d) => d instanceof ArrayBuffer)).toHaveLength(3);
  });
  it("reports a vendor error once and then ignores the stream", async () => {
    const { stream, sock, errors } = await open("speechmatics");
    sock.open();
    sock.emit({ message: "Error", type: "quota_exceeded", reason: "no credit" });
    sock.onerror?.({});
    expect(errors.map((e) => e.message)).toEqual([
      "speech-to-text speechmatics: quota_exceeded: no credit",
    ]);
    stream.send(frame());
    stream.finalize();
    await stream.end();
    expect(sock.closed).toBe(false); // a failed stream is already over
  });
});

describe("AssemblyAI (client) edges", () => {
  it("reports an error message, a closed socket, and ignores binary or empty turns", async () => {
    const a = await open("assemblyai", "universal-streaming-english");
    a.sock.open();
    a.sock.onmessage?.({ data: new ArrayBuffer(2) });
    a.sock.emit({ type: "Turn", transcript: "  " });
    a.sock.emit({ type: "Begin" });
    a.sock.emit({ type: "Turn", transcript: "hello" }); // no words: times fall back to 0
    expect(a.events).toEqual([
      { speaker: "customer", text: "hello", final: false, start_ms: 0, end_ms: 0 },
    ]);
    a.sock.emit({ error: "bad token" });
    expect(a.errors.map((e) => e.message)).toEqual(["speech-to-text assemblyai: bad token"]);

    const b = await open("assemblyai", "m");
    b.sock.open();
    b.sock.onclose?.({ code: 4001, reason: "unauthorised" });
    expect(b.errors.map((e) => e.message)).toEqual([
      "speech-to-text assemblyai: closed (4001 unauthorised)",
    ]);
    const c = await open("assemblyai", "m");
    c.sock.onclose?.({});
    expect(c.errors[0]?.message).toBe("speech-to-text assemblyai: closed (?)");
  });
  it("refuses a vendor the app does not run", async () => {
    await expect(open("deepgram")).rejects.toThrow(/no client STT for deepgram/);
  });
  it("ends a session whose socket never opened without waiting for the vendor", async () => {
    const { stream, sock } = await open("assemblyai", "m");
    stream.finalize(); // not open: nothing to send
    sock.onclose?.({ code: 1000 });
    await stream.end();
    expect(sock.sent).toHaveLength(0);
  });
});
