/**
 * The Sotto character: a small rounded face that shows what the app is doing (owner, 21 Oct;
 * 22 Oct: no tail, a soft smile, no orange). It looks alive: it blinks, breathes, and on the web
 * and desktop its eyes follow the pointer (owner, 22 Oct: "when I move my mouse around, its eyes
 * follow the mouse, making an animated effect and making it look live"). idle · listening sends
 * out sound rings · thinking looks up with three dots · suggesting hops with a spark and a big
 * smile · reviewing is violet, looks down at its notes and nods · offline is grey, eyes closed.
 * Built from Views and the Animated API so it runs on web, desktop and phones without SVG.
 */
import { type ComponentRef, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View } from "react-native";
import { useTheme } from "../theme.tsx";
import type { Hex } from "../tokens.ts";

export type MascotState =
  | "idle"
  | "listening"
  | "thinking"
  | "suggesting"
  | "reviewing"
  | "offline";

/** How a finished call went (T-051), from the review's success score (0-100). */
export type MascotMood = "excellent" | "good" | "mixed" | "needsWork" | "noResult";
export type MascotSentiment = "positive" | "neutral" | "negative";

/** Score bands: >= 75 excellent, 60-74 good, 40-59 mixed, < 40 needsWork, no score noResult. */
export function moodFor(
  score: number | null | undefined,
  _sentiment?: MascotSentiment,
): MascotMood {
  if (score === null || score === undefined || Number.isNaN(score)) return "noResult";
  if (score >= 75) return "excellent";
  if (score >= 60) return "good";
  if (score >= 40) return "mixed";
  return "needsWork";
}

export type MascotProps = {
  state?: MascotState;
  /** A call-result face; overrides the face of `state`. */
  mood?: MascotMood;
  /** Shades the mood face slightly (smaller smile when negative, softer brow when positive). */
  sentiment?: MascotSentiment;
  /** Body width in px; everything scales from it. */
  size?: number;
  /** Read by screen readers, e.g. "Sotto is listening". */
  label?: string;
};

/** True when the OS asks for reduced motion; every looping animation must honour it. */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => live && setReduce(v))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener?.("reduceMotionChanged", setReduce);
    return () => {
      live = false;
      sub?.remove();
    };
  }, []);
  return reduce;
}

function loop(value: Animated.Value, ms: number, delay = 0): Animated.CompositeAnimation {
  return Animated.loop(
    Animated.sequence([
      Animated.delay(delay),
      Animated.timing(value, {
        toValue: 1,
        duration: ms,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }),
      Animated.timing(value, { toValue: 0, duration: 0, useNativeDriver: false }),
    ]),
  );
}

export function Mascot({
  state = "idle",
  mood,
  sentiment = "neutral",
  size = 64,
  label,
}: MascotProps) {
  const { color, card } = useTheme();
  const reduce = useReduceMotion();
  const blink = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const pulse2 = useRef(new Animated.Value(0)).current;
  const bob = useRef(new Animated.Value(0)).current;
  const breath = useRef(new Animated.Value(0)).current;
  // Where the pointer is, in [-1, 1] from the face's centre: 0 is straight ahead.
  const gazeX = useRef(new Animated.Value(0)).current;
  const gazeY = useRef(new Animated.Value(0)).current;
  const face = useRef<ComponentRef<typeof View>>(null);

  const tint: Record<MascotState, Hex> = {
    idle: color.primary,
    listening: card.answer.accent,
    thinking: card.question.accent,
    suggesting: color.positive,
    reviewing: card.signal.accent,
    offline: color.borderStrong,
  };
  const moodTint: Record<MascotMood, Hex> = {
    excellent: color.positive,
    good: color.primary,
    mixed: card.objection.accent,
    needsWork: card.warning.accent,
    noResult: color.borderStrong,
  };
  const body = mood ? moodTint[mood] : tint[state];

  useEffect(() => {
    if (reduce) return;
    const anims: Animated.CompositeAnimation[] = [];
    if (mood !== "noResult" && state !== "offline" && state !== "reviewing") {
      anims.push(
        Animated.loop(
          Animated.sequence([
            Animated.delay(2600),
            Animated.timing(blink, { toValue: 0.1, duration: 90, useNativeDriver: false }),
            Animated.timing(blink, { toValue: 1, duration: 120, useNativeDriver: false }),
          ]),
        ),
      );
    }
    if (state === "listening") anims.push(loop(pulse, 1400), loop(pulse2, 1400, 700));
    if (state === "thinking") anims.push(loop(pulse, 900));
    if (!mood && (state === "suggesting" || state === "reviewing" || state === "idle")) {
      const ms = state === "suggesting" ? 520 : state === "reviewing" ? 900 : 1800;
      anims.push(
        Animated.loop(
          Animated.sequence([
            Animated.timing(bob, {
              toValue: 1,
              duration: ms,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: false,
            }),
            Animated.timing(bob, {
              toValue: 0,
              duration: ms,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: false,
            }),
          ]),
        ),
      );
    }
    // Breathing, at about the rate of a calm person (owner, 22 Oct: make it look live).
    anims.push(
      Animated.loop(
        Animated.sequence([
          Animated.timing(breath, {
            toValue: 1,
            duration: 2100,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: false,
          }),
          Animated.timing(breath, {
            toValue: 0,
            duration: 2100,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: false,
          }),
        ]),
      ),
    );
    for (const a of anims) a.start();
    return () => {
      for (const a of anims) a.stop();
      blink.setValue(1);
      pulse.setValue(0);
      pulse2.setValue(0);
      bob.setValue(0);
      breath.setValue(0);
    };
  }, [state, mood, reduce, blink, pulse, pulse2, bob, breath]);

  // The eyes follow the pointer on the web and in the desktop app. Only a position is read;
  // nothing outside this app is inspected. On phones there is no pointer, so the face waits.
  useEffect(() => {
    if (reduce || Platform.OS !== "web" || state === "offline") return;
    const doc = (globalThis as { document?: Document }).document;
    if (!doc) return;
    let frameBox = { x: 0, y: 0, w: 1, h: 1 };
    let measured = 0;
    let raf = 0;
    const measure = () => {
      measured = 0;
      face.current?.measureInWindow((x, y, w, h) => {
        if (w > 0 && h > 0) frameBox = { x, y, w, h };
        measured = Date.now();
      });
    };
    const follow = (e: PointerEvent) => {
      if (!measured) measure();
      if (Date.now() - measured > 400) {
        measure(); // the page scrolled or the window moved under the pointer
        return;
      }
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const dx = (e.clientX - (frameBox.x + frameBox.w / 2)) / (frameBox.w * 0.9);
        const dy = (e.clientY - (frameBox.y + frameBox.h / 2)) / (frameBox.h * 0.9);
        const x = Math.max(-1, Math.min(1, dx));
        const y = Math.max(-1, Math.min(1, dy));
        Animated.spring(gazeX, {
          toValue: x,
          stiffness: 160,
          damping: 18,
          mass: 0.6,
          useNativeDriver: false,
        }).start();
        Animated.spring(gazeY, {
          toValue: y,
          stiffness: 160,
          damping: 18,
          mass: 0.6,
          useNativeDriver: false,
        }).start();
      });
    };
    const leave = () => {
      Animated.spring(gazeX, { toValue: 0, useNativeDriver: false }).start();
      Animated.spring(gazeY, { toValue: 0, useNativeDriver: false }).start();
    };
    measure();
    doc.addEventListener("pointermove", follow, { passive: true });
    doc.addEventListener("pointerleave", leave, { passive: true });
    const win = (globalThis as { addEventListener?: Window["addEventListener"] }).addEventListener;
    win?.("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      doc.removeEventListener("pointermove", follow);
      doc.removeEventListener("pointerleave", leave);
      win?.("resize", measure);
    };
  }, [reduce, state, gazeX, gazeY]);

  const s = size;
  const hop = state === "suggesting" ? -s * 0.08 : state === "reviewing" ? s * 0.03 : -s * 0.03;
  const lift = bob.interpolate({ inputRange: [0, 1], outputRange: [0, hop] });
  const lookX = gazeX.interpolate({ inputRange: [-1, 1], outputRange: [-s * 0.055, s * 0.055] });
  const lookY = gazeY.interpolate({ inputRange: [-1, 1], outputRange: [-s * 0.045, s * 0.045] });
  const tilt = gazeX.interpolate({ inputRange: [-1, 1], outputRange: ["-2.4deg", "2.4deg"] });
  const sway = gazeX.interpolate({ inputRange: [-1, 1], outputRange: [-s * 0.02, s * 0.02] });
  const breathe = breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.018] });
  const eyeW = s * 0.15;
  const eyeH = s * 0.2;
  const closed = state === "offline" && !mood;
  const look = state === "thinking" ? -s * 0.04 : state === "reviewing" ? s * 0.03 : 0;

  const ring = (v: Animated.Value) => (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ring,
        {
          width: s * 1.1,
          height: s * 0.9,
          borderRadius: s * 0.45,
          borderColor: body,
          opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.55] }) }],
        },
      ]}
    />
  );

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label || (mood ? `Call result: ${mood}` : `Sales Shield: ${state}`)}
      ref={face}
      style={[styles.frame, { width: s * 1.7, height: s * 1.5 }]}
      testID={mood ? `mascot-mood-${mood}` : `mascot-${state}`}
    >
      {!mood && state === "listening" ? (
        <>
          {ring(pulse)}
          {ring(pulse2)}
        </>
      ) : null}
      {!mood && state === "thinking" ? (
        <View style={[styles.dots, { top: 0, gap: s * 0.06 }]}>
          {[0, 1, 2].map((i) => (
            <Animated.View
              key={i}
              style={{
                width: s * 0.09,
                height: s * 0.09,
                borderRadius: s,
                backgroundColor: body,
                opacity: pulse.interpolate({
                  inputRange: [0, i / 3, (i + 1) / 3, 1],
                  outputRange: [0.25, 0.25, 1, 0.25],
                }),
              }}
            />
          ))}
        </View>
      ) : null}
      <Animated.View
        style={{
          transform: [
            { translateY: lift },
            { translateX: sway },
            { rotate: tilt },
            { scale: breathe },
          ],
        }}
      >
        <View
          style={[
            styles.body,
            {
              width: s,
              height: s * 0.82,
              borderRadius: s * 0.38,
              backgroundColor: body,
              shadowColor: body,
              shadowOpacity: closed ? 0 : 0.35,
              shadowRadius: s * 0.18,
              shadowOffset: { width: 0, height: s * 0.06 },
            },
          ]}
        >
          {closed ? null : (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: s * 0.1,
                left: s * 0.13,
                width: s * 0.24,
                height: s * 0.1,
                borderRadius: s,
                backgroundColor: color.onPrimary,
                opacity: 0.16,
                transform: [{ rotate: "-24deg" }],
              }}
            />
          )}
          <Animated.View
            style={[
              styles.eyes,
              {
                gap: s * 0.16,
                marginTop: look,
                transform: [{ translateX: lookX }, { translateY: lookY }],
              },
            ]}
          >
            {[0, 1].map((i) => (
              <Animated.View
                key={i}
                style={{
                  width: eyeW,
                  height: closed ? s * 0.035 : mood === "noResult" ? eyeH * 0.4 : eyeH,
                  borderRadius: eyeW,
                  backgroundColor: color.onPrimary,
                  transform: [{ scaleY: closed ? 1 : blink }],
                }}
              />
            ))}
          </Animated.View>
          {mood ? (
            <MoodMouth mood={mood} sentiment={sentiment} size={s} ink={color.onPrimary} />
          ) : (
            <Smile size={s} wide={state === "suggesting"} flat={closed} ink={color.onPrimary} />
          )}
        </View>
      </Animated.View>
      {mood === "excellent" || (!mood && state === "suggesting") ? (
        <View
          style={[
            styles.spark,
            {
              width: s * 0.16,
              height: s * 0.16,
              top: s * 0.12,
              right: s * 0.12,
              backgroundColor: color.positive,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

/** The mouth (and a soft brow for "mixed") of a call-result face. Sentiment only shades it. */
function MoodMouth({
  mood,
  sentiment,
  size: s,
  ink,
}: {
  mood: MascotMood;
  sentiment: MascotSentiment;
  size: number;
  ink: Hex;
}) {
  const thick = Math.max(2, s * 0.045);
  if (mood === "excellent") {
    const w = s * (sentiment === "negative" ? 0.26 : 0.32);
    return (
      <View
        style={{
          marginTop: s * 0.11,
          width: w,
          height: w / 2,
          borderBottomLeftRadius: w / 2,
          borderBottomRightRadius: w / 2,
          backgroundColor: ink,
        }}
      />
    );
  }
  if (mood === "good") {
    const w = s * (sentiment === "negative" ? 0.16 : sentiment === "positive" ? 0.26 : 0.22);
    return (
      <View
        style={{
          marginTop: s * 0.11,
          width: w,
          height: w / 2,
          borderBottomLeftRadius: w / 2,
          borderBottomRightRadius: w / 2,
          borderWidth: thick,
          borderTopWidth: 0,
          borderColor: ink,
        }}
      />
    );
  }
  if (mood === "mixed") {
    return (
      <View style={{ alignItems: "center" }}>
        <View
          testID="mascot-brow"
          style={{
            width: s * 0.3,
            height: thick,
            borderRadius: s,
            backgroundColor: ink,
            opacity: sentiment === "positive" ? 0.35 : 0.7,
            transform: [{ rotate: sentiment === "negative" ? "-4deg" : "0deg" }],
            marginTop: s * 0.02,
          }}
        />
        <View
          style={{
            marginTop: s * 0.08,
            width: s * 0.2,
            height: thick,
            borderRadius: s,
            backgroundColor: ink,
            opacity: 0.9,
          }}
        />
      </View>
    );
  }
  if (mood === "needsWork") {
    const w = s * (sentiment === "positive" ? 0.12 : 0.16);
    return (
      <View
        style={{
          marginTop: s * 0.12,
          width: w,
          height: w / 2,
          borderTopLeftRadius: w / 2,
          borderTopRightRadius: w / 2,
          borderWidth: thick,
          borderBottomWidth: 0,
          borderColor: ink,
          opacity: 0.9,
        }}
      />
    );
  }
  return (
    <View
      style={{
        marginTop: s * 0.1,
        width: s * 0.14,
        height: s * 0.035,
        borderRadius: s,
        backgroundColor: ink,
        opacity: 0.6,
      }}
    />
  );
}

/** A soft "U" smile drawn as the lower half of a ring; wider and fuller when suggesting, a short
 * line when offline. */
function Smile({
  size: s,
  wide,
  flat,
  ink,
}: {
  size: number;
  wide: boolean;
  flat: boolean;
  ink: Hex;
}) {
  if (flat) {
    return (
      <View
        style={{
          marginTop: s * 0.08,
          width: s * 0.14,
          height: s * 0.035,
          borderRadius: s,
          backgroundColor: ink,
          opacity: 0.6,
        }}
      />
    );
  }
  const w = wide ? s * 0.3 : s * 0.22;
  return (
    <View
      style={{
        // A little lower than the first version (owner, 22 Oct).
        marginTop: s * 0.11,
        width: w,
        height: w / 2,
        borderBottomLeftRadius: w / 2,
        borderBottomRightRadius: w / 2,
        borderWidth: Math.max(2, s * 0.045),
        borderTopWidth: 0,
        borderColor: ink,
        backgroundColor: wide ? ink : "transparent",
        opacity: 0.95,
      }}
    />
  );
}

const styles = StyleSheet.create({
  frame: { alignItems: "center", justifyContent: "center" },
  ring: { position: "absolute", borderWidth: 2 },
  dots: { position: "absolute", flexDirection: "row" },
  body: { alignItems: "center", justifyContent: "center" },
  eyes: { flexDirection: "row", alignItems: "center" },
  spark: { position: "absolute", transform: [{ rotate: "45deg" }], borderRadius: 2 },
});
