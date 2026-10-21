import { encodeWav, louder, mix, newRecorder, Recorder } from "./recorder";

describe("call recording", () => {
  it("mixes both sides, clipping and padding the shorter one", () => {
    expect(Array.from(mix(Int16Array.of(1, 30000, -30000), Int16Array.of(2, 10000)))).toEqual([
      3, 32767, -30000,
    ]);
  });

  it("writes a 16 kHz mono 16-bit WAV file", () => {
    const wav = encodeWav(Int16Array.of(1, -1));
    const v = new DataView(wav.buffer);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe("WAVE");
    expect(v.getUint16(22, true)).toBe(1);
    expect(v.getUint32(24, true)).toBe(16000);
    expect(v.getUint32(40, true)).toBe(4);
    expect(v.getInt16(46, true)).toBe(-1);
    expect(wav.length).toBe(48);
  });

  it("raises a quiet recording, at most 8 times, and leaves a loud one alone", () => {
    expect(Array.from(louder(Int16Array.of(100, -50)))).toEqual([800, -400]);
    expect(Array.from(louder(Int16Array.of(10000, -2900)))).toEqual([29000, -8410]);
    expect(Array.from(louder(Int16Array.of(30000, 5)))).toEqual([30000, 5]);
    expect(Array.from(louder(Int16Array.of(0, 0)))).toEqual([0, 0]);
  });

  it("keeps each side in order and mixes them at the end", () => {
    const r = new Recorder();
    expect(r.empty).toBe(true);
    r.add("customer", Int16Array.of(10000, 2000).buffer);
    r.add("customer", Int16Array.of(3000).buffer);
    r.add("agent", Int16Array.of(10000).buffer);
    const v = new DataView(r.wav().buffer);
    // mixed 20000, 2000, 3000, then raised by 29000 / 20000
    expect([v.getInt16(44, true), v.getInt16(46, true), v.getInt16(48, true)]).toEqual([
      29000, 2900, 4350,
    ]);
  });
});

describe("recorder choice", () => {
  it("falls back to WAV where the device cannot record Opus, and finishes into a file", async () => {
    const r = newRecorder();
    expect(r).toBeInstanceOf(Recorder);
    expect(await r.finish()).toBeNull(); // nothing recorded, no file
    r.add("customer", Int16Array.of(1, 2).buffer);
    const blob = await r.finish();
    expect(blob?.type).toBe("audio/wav");
    expect(blob?.size).toBe(48);
  });
});
