/**
 * Demo bridge client (D-013, dev-only): a WebSocket to the local worker on 127.0.0.1.
 *
 * Every server message is validated with `parseDemoServerMessage`; anything invalid is dropped
 * and logged, never shown. Every client message is validated before it is sent.
 * Phase 4 replaces this transport with the LiveKit data channel; the session reducer stays.
 */
import {
  type DemoClientMessage,
  DemoClientMessage as DemoClientSchema,
  type DemoServerMessage,
  parseDemoServerMessage,
} from "@sotto/shared";
import { DEFAULT_SOCKET_URL, socketUrl } from "../../lib/server";
import type { Connection } from "./session";

export const DEFAULT_BRIDGE_URL = DEFAULT_SOCKET_URL;

/** The server socket: EXPO_PUBLIC_DEMO_BRIDGE_URL, else this page's own server, else local. */
export function bridgeUrl(): string {
  return socketUrl();
}

/** Parses one raw frame. Returns null (and logs why) for anything that is not a valid v1 message. */
export function decodeServerFrame(raw: unknown): DemoServerMessage | null {
  try {
    const json: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
    return parseDemoServerMessage(json);
  } catch (err) {
    console.warn("[demo-bridge] dropped an invalid server message", err);
    return null;
  }
}

export type BridgeHandlers = {
  onStatus: (status: Connection) => void;
  onMessage: (msg: DemoServerMessage) => void;
};

export type Bridge = {
  /** Validates and sends. Returns false if the message is invalid or the socket is not open. */
  send: (msg: DemoClientMessage) => boolean;
  /** Raw customer audio (PCM16 mono 16 kHz) after an `audio_start`. False if not open. */
  sendAudio: (pcm: ArrayBuffer) => boolean;
  close: () => void;
};

type SocketLike = {
  readyState: number;
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  send: (data: string | ArrayBuffer) => void;
  close: () => void;
};

export type SocketFactory = (url: string) => SocketLike;

const OPEN = 1;

const defaultFactory: SocketFactory = (url) => new WebSocket(url) as unknown as SocketLike;

/** Validates a client message. Returns the message, or null when it does not match the protocol. */
export function encodeClientMessage(msg: DemoClientMessage): string | null {
  const parsed = DemoClientSchema.safeParse(msg);
  if (!parsed.success) {
    console.warn("[demo-bridge] refused to send an invalid client message", parsed.error);
    return null;
  }
  return JSON.stringify(parsed.data);
}

export function connectBridge(
  url: string,
  handlers: BridgeHandlers,
  factory: SocketFactory = defaultFactory,
): Bridge {
  let closed = false;
  let socket: SocketLike;
  handlers.onStatus("connecting");
  try {
    socket = factory(url);
  } catch (err) {
    console.warn("[demo-bridge] could not open the socket", err);
    handlers.onStatus("offline");
    return { send: () => false, sendAudio: () => false, close: () => {} };
  }
  // "open" is reported when the server says hello (the session reducer does that); a socket that
  // opens but never greets stays "connecting".
  socket.onmessage = (ev) => {
    if (closed) return; // a frame already in flight when we closed belongs to the old session
    const msg = decodeServerFrame(ev.data);
    if (msg) handlers.onMessage(msg);
  };
  socket.onerror = () => {
    if (!closed) handlers.onStatus("offline");
  };
  socket.onclose = () => {
    if (!closed) handlers.onStatus("offline");
  };
  return {
    send(msg) {
      const frame = encodeClientMessage(msg);
      if (frame === null || socket.readyState !== OPEN) return false;
      socket.send(frame);
      return true;
    },
    sendAudio(pcm) {
      if (socket.readyState !== OPEN) return false;
      socket.send(pcm);
      return true;
    },
    close() {
      closed = true;
      socket.close();
    },
  };
}
