/**
 * The Sotto character: a small speech-bubble face that shows what the app is doing (owner, 21 Oct).
 * idle blinks · listening sends out sound rings · thinking looks up with three dots · suggesting
 * hops with a spark · reviewing squints and nods · offline is grey with closed eyes.
 * Built from Views and the Animated API so it runs on web, desktop and phones without SVG.
 */
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from "react-native";
import { useTheme } from "../theme.tsx";
import type { Hex } from "../tokens.ts";

export type MascotState =
  | "idle"
  | "listening"
  | "thinking"
  | "suggesting"
  | "reviewing"
  | "offline";

export type MascotProps = {
  state?: MascotState;
  /** Body width in px; everything scales from it. */
  size?: number;
  /** Read by screen readers, e.g. "Sotto is listening". */
  label?: string;
};

function useReduceMotion(): boolean {
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

export function Mascot({ state = "idle", size = 64, label }: MascotProps) {
  const { color, card } = useTheme();
  const reduce = useReduceMotion();
  const blink = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const pulse2 = useRef(new Animated.Value(0)).current;
  const bob = useRef(new Animated.Value(0)).current;

  const tint: Record<MascotState, Hex> = {
    idle: color.primary,
    listening: card.answer.accent,
    thinking: card.question.accent,
    suggesting: color.positive,
    reviewing: card.objection.accent,
    offline: color.borderStrong,
  };
  const body = tint[state];

  useEffect(() => {
    if (reduce) return;
    const anims: Animated.CompositeAnimation[] = [];
    if (state !== "offline" && state !== "reviewing") {
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
    if (state === "suggesting" || state === "reviewing" || state === "idle") {
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
    for (const a of anims) a.start();
    return () => {
      for (const a of anims) a.stop();
      blink.setValue(1);
      pulse.setValue(0);
      pulse2.setValue(0);
      bob.setValue(0);
    };
  }, [state, reduce, blink, pulse, pulse2, bob]);

  const s = size;
  const hop = state === "suggesting" ? -s * 0.08 : state === "reviewing" ? s * 0.03 : -s * 0.03;
  const lift = bob.interpolate({ inputRange: [0, 1], outputRange: [0, hop] });
  const eyeW = s * 0.15;
  const eyeH = state === "reviewing" ? s * 0.06 : s * 0.2;
  const closed = state === "offline";
  const look = state === "thinking" ? -s * 0.04 : 0;

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
      accessibilityLabel={label ?? `Sotto: ${state}`}
      style={[styles.frame, { width: s * 1.7, height: s * 1.5 }]}
      testID={`mascot-${state}`}
    >
      {state === "listening" ? (
        <>
          {ring(pulse)}
          {ring(pulse2)}
        </>
      ) : null}
      {state === "thinking" ? (
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
      <Animated.View style={{ transform: [{ translateY: lift }] }}>
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
          <View style={[styles.eyes, { gap: s * 0.16, marginTop: look }]}>
            {[0, 1].map((i) => (
              <Animated.View
                key={i}
                style={{
                  width: eyeW,
                  height: closed ? s * 0.035 : eyeH,
                  borderRadius: eyeW,
                  backgroundColor: color.onPrimary,
                  transform: [{ scaleY: closed ? 1 : blink }],
                }}
              />
            ))}
          </View>
          <View
            style={{
              marginTop: s * 0.07,
              width: state === "suggesting" ? s * 0.26 : s * 0.16,
              height: state === "suggesting" ? s * 0.1 : s * 0.04,
              borderBottomLeftRadius: s * 0.13,
              borderBottomRightRadius: s * 0.13,
              backgroundColor: color.onPrimary,
              opacity: closed ? 0.5 : 0.9,
            }}
          />
          {/* the bubble's tail */}
          <View
            style={[
              styles.tail,
              {
                width: s * 0.2,
                height: s * 0.2,
                left: s * 0.18,
                bottom: -s * 0.07,
                backgroundColor: body,
              },
            ]}
          />
        </View>
      </Animated.View>
      {state === "suggesting" ? (
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

const styles = StyleSheet.create({
  frame: { alignItems: "center", justifyContent: "center" },
  ring: { position: "absolute", borderWidth: 2 },
  dots: { position: "absolute", flexDirection: "row" },
  body: { alignItems: "center", justifyContent: "center" },
  eyes: { flexDirection: "row", alignItems: "center" },
  tail: { position: "absolute", transform: [{ rotate: "45deg" }], zIndex: -1 },
  spark: { position: "absolute", transform: [{ rotate: "45deg" }], borderRadius: 2 },
});
