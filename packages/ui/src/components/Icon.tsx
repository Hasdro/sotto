/**
 * Sotto's own icon set (owner, 22 Oct 2026: "create an icon set for this application... I want
 * icons, specifically designed for my application"). One consistent family: 24-unit grid,
 * 1.8-unit rounded strokes, drawn with Views so it runs on web, desktop and phones without an
 * SVG dependency. No emoji are used as interface icons.
 *
 * Icons are decorative next to a label; pass `label` only when the icon stands alone.
 */
import { StyleSheet, View } from "react-native";
import { useTheme } from "../theme.tsx";

export type IconName =
  | "home"
  | "call"
  | "phone"
  | "history"
  | "clock"
  | "timer"
  | "reports"
  | "playbook"
  | "inbox"
  | "admin"
  | "settings"
  | "account"
  | "search"
  | "calendar"
  | "cards"
  | "screen"
  | "users"
  | "globe"
  | "mic"
  | "mail"
  | "key"
  | "shield"
  | "spark"
  | "note"
  | "check"
  | "plus"
  | "close"
  | "copy"
  | "chevron"
  | "arrowLeft"
  | "headphones"
  | "laptop"
  | "list"
  | "cpu"
  | "video"
  | "message"
  | "lock"
  | "info"
  | "palette"
  | "target"
  | "bolt"
  | "external";

type Prim =
  | { k: "line"; x1: number; y1: number; x2: number; y2: number; t?: number }
  | { k: "ring"; cx: number; cy: number; r: number; t?: number }
  | { k: "dot"; cx: number; cy: number; r: number }
  | {
      k: "rect";
      x: number;
      y: number;
      w: number;
      h: number;
      r?: number;
      t?: number;
      fill?: boolean;
    }
  | {
      k: "arc";
      cx: number;
      cy: number;
      r: number;
      side: "top" | "bottom";
      t?: number;
      rotate?: number;
    };

/** Primitive geometry on a 24×24 grid. Angles in the gear are in degrees. */
const ICONS: Record<IconName, Prim[]> = {
  home: [
    { k: "line", x1: 3, y1: 10, x2: 12, y2: 3 },
    { k: "line", x1: 12, y1: 3, x2: 21, y2: 10 },
    { k: "rect", x: 5, y: 9, w: 14, h: 12, r: 2 },
    { k: "rect", x: 10, y: 14.5, w: 4, h: 6.5, r: 1 },
  ],
  call: [
    { k: "arc", cx: 12, cy: 13, r: 7, side: "top" },
    { k: "rect", x: 3, y: 13, w: 4, h: 7, r: 2 },
    { k: "rect", x: 17, y: 13, w: 4, h: 7, r: 2 },
    { k: "line", x1: 19, y1: 19.5, x2: 16, y2: 21 },
    { k: "dot", cx: 15.4, cy: 21.4, r: 1.4 },
  ],
  phone: [
    { k: "arc", cx: 12, cy: 12, r: 7, side: "bottom", rotate: -45 },
    { k: "dot", cx: 7, cy: 17, r: 2.5 },
    { k: "dot", cx: 17, cy: 7, r: 2.5 },
  ],
  history: [
    { k: "ring", cx: 12, cy: 12, r: 8.5 },
    { k: "line", x1: 12, y1: 12, x2: 12, y2: 6.8 },
    { k: "line", x1: 12, y1: 12, x2: 15.4, y2: 13.8 },
    { k: "dot", cx: 12, cy: 12, r: 1.3 },
  ],
  clock: [
    { k: "ring", cx: 12, cy: 12, r: 8 },
    { k: "line", x1: 12, y1: 12, x2: 12, y2: 7 },
    { k: "line", x1: 12, y1: 12, x2: 15, y2: 13.6 },
  ],
  timer: [
    { k: "ring", cx: 12, cy: 13.5, r: 7.4 },
    { k: "line", x1: 12, y1: 3, x2: 12, y2: 6.1 },
    { k: "line", x1: 9, y1: 3, x2: 15, y2: 3 },
    { k: "line", x1: 12, y1: 13.5, x2: 12, y2: 9.3 },
    { k: "line", x1: 19, y1: 5.2, x2: 20.5, y2: 6.7 },
  ],
  reports: [
    { k: "rect", x: 5, y: 12.5, w: 3, h: 7.5, r: 1.5, fill: true },
    { k: "rect", x: 10.5, y: 5.5, w: 3, h: 14.5, r: 1.5, fill: true },
    { k: "rect", x: 16, y: 9, w: 3, h: 11, r: 1.5, fill: true },
    { k: "line", x1: 3.5, y1: 21, x2: 20.5, y2: 21 },
  ],
  playbook: [
    { k: "rect", x: 3, y: 5.5, w: 8, h: 14, r: 2 },
    { k: "rect", x: 13, y: 5.5, w: 8, h: 14, r: 2 },
    { k: "line", x1: 12, y1: 6.5, x2: 12, y2: 19 },
    { k: "line", x1: 5.2, y1: 9.5, x2: 9, y2: 9.5 },
    { k: "line", x1: 5.2, y1: 13, x2: 9, y2: 13 },
    { k: "line", x1: 15, y1: 9.5, x2: 18.8, y2: 9.5 },
    { k: "line", x1: 15, y1: 13, x2: 18.8, y2: 13 },
  ],
  inbox: [
    { k: "rect", x: 3, y: 5, w: 18, h: 15, r: 2.5 },
    { k: "line", x1: 3, y1: 13.5, x2: 8.5, y2: 13.5 },
    { k: "line", x1: 8.5, y1: 13.5, x2: 10.5, y2: 16.5 },
    { k: "line", x1: 10.5, y1: 16.5, x2: 13.5, y2: 16.5 },
    { k: "line", x1: 13.5, y1: 16.5, x2: 15.5, y2: 13.5 },
    { k: "line", x1: 15.5, y1: 13.5, x2: 21, y2: 13.5 },
  ],
  admin: [
    { k: "line", x1: 4, y1: 7, x2: 20, y2: 7 },
    { k: "line", x1: 4, y1: 12, x2: 20, y2: 12 },
    { k: "line", x1: 4, y1: 17, x2: 20, y2: 17 },
    { k: "dot", cx: 9, cy: 7, r: 2.2 },
    { k: "dot", cx: 15, cy: 12, r: 2.2 },
    { k: "dot", cx: 7, cy: 17, r: 2.2 },
  ],
  settings: [
    { k: "ring", cx: 12, cy: 12, r: 5.4, t: 2.2 },
    ...Array.from({ length: 6 }, (_, i): Prim => {
      const a = (i * Math.PI) / 3;
      return {
        k: "line",
        x1: 12 + Math.cos(a) * 6.4,
        y1: 12 + Math.sin(a) * 6.4,
        x2: 12 + Math.cos(a) * 8.8,
        y2: 12 + Math.sin(a) * 8.8,
        t: 2.4,
      };
    }),
  ],
  account: [
    { k: "ring", cx: 12, cy: 8.2, r: 3.4 },
    { k: "arc", cx: 12, cy: 20, r: 8, side: "top" },
  ],
  search: [
    { k: "ring", cx: 10.5, cy: 10.5, r: 6.2 },
    { k: "line", x1: 15, y1: 15, x2: 20, y2: 20 },
  ],
  calendar: [
    { k: "rect", x: 3, y: 5, w: 18, h: 16, r: 2.5 },
    { k: "line", x1: 3, y1: 9.5, x2: 21, y2: 9.5 },
    { k: "line", x1: 7.5, y1: 2.5, x2: 7.5, y2: 6.5 },
    { k: "line", x1: 16.5, y1: 2.5, x2: 16.5, y2: 6.5 },
    { k: "dot", cx: 7.5, cy: 13, r: 1.1 },
    { k: "dot", cx: 12, cy: 13, r: 1.1 },
    { k: "dot", cx: 16.5, cy: 13, r: 1.1 },
  ],
  cards: [
    { k: "rect", x: 6.5, y: 3.5, w: 12.5, h: 15.5, r: 2 },
    { k: "rect", x: 4, y: 7, w: 12.5, h: 13, r: 2 },
  ],
  screen: [
    { k: "rect", x: 3, y: 4, w: 18, h: 12.5, r: 2 },
    { k: "line", x1: 8, y1: 20.5, x2: 16, y2: 20.5 },
    { k: "line", x1: 12, y1: 16.5, x2: 12, y2: 20.5 },
    { k: "dot", cx: 12, cy: 10.2, r: 2 },
  ],
  users: [
    { k: "ring", cx: 8.2, cy: 8.5, r: 3.1 },
    { k: "ring", cx: 15.8, cy: 8.5, r: 3.1 },
    { k: "arc", cx: 8.2, cy: 19, r: 5.6, side: "top" },
    { k: "arc", cx: 15.8, cy: 19, r: 5.6, side: "top" },
  ],
  globe: [
    { k: "ring", cx: 12, cy: 12, r: 8.5 },
    { k: "line", x1: 12, y1: 3.5, x2: 12, y2: 20.5 },
    { k: "line", x1: 3.5, y1: 12, x2: 20.5, y2: 12 },
  ],
  mic: [
    { k: "rect", x: 9, y: 3, w: 6, h: 10.5, r: 3 },
    { k: "arc", cx: 12, cy: 14.5, r: 5, side: "bottom" },
    { k: "line", x1: 12, y1: 19.5, x2: 12, y2: 21.5 },
    { k: "line", x1: 9, y1: 21.5, x2: 15, y2: 21.5 },
  ],
  mail: [
    { k: "rect", x: 3, y: 5, w: 18, h: 14, r: 2 },
    { k: "line", x1: 3.5, y1: 6, x2: 12, y2: 13 },
    { k: "line", x1: 20.5, y1: 6, x2: 12, y2: 13 },
  ],
  key: [
    { k: "ring", cx: 8, cy: 12, r: 4 },
    { k: "line", x1: 11.8, y1: 12, x2: 21, y2: 12 },
    { k: "line", x1: 18, y1: 12, x2: 18, y2: 15.2 },
    { k: "line", x1: 21, y1: 12, x2: 21, y2: 14.2 },
  ],
  shield: [
    { k: "rect", x: 5, y: 4, w: 14, h: 11, r: 3 },
    { k: "line", x1: 5, y1: 15, x2: 12, y2: 21.5 },
    { k: "line", x1: 19, y1: 15, x2: 12, y2: 21.5 },
  ],
  spark: [
    { k: "line", x1: 12, y1: 3, x2: 12, y2: 8.5 },
    { k: "line", x1: 12, y1: 15.5, x2: 12, y2: 21 },
    { k: "line", x1: 3, y1: 12, x2: 8.5, y2: 12 },
    { k: "line", x1: 15.5, y1: 12, x2: 21, y2: 12 },
    { k: "dot", cx: 12, cy: 12, r: 1.6 },
  ],
  note: [
    { k: "rect", x: 5, y: 3, w: 14, h: 18, r: 2 },
    { k: "line", x1: 8, y1: 8.5, x2: 16, y2: 8.5 },
    { k: "line", x1: 8, y1: 12.5, x2: 16, y2: 12.5 },
    { k: "line", x1: 8, y1: 16.5, x2: 13, y2: 16.5 },
  ],
  check: [
    { k: "line", x1: 4.5, y1: 12.5, x2: 9.5, y2: 17.5 },
    { k: "line", x1: 9.5, y1: 17.5, x2: 19.5, y2: 6.5 },
  ],
  plus: [
    { k: "line", x1: 12, y1: 5, x2: 12, y2: 19 },
    { k: "line", x1: 5, y1: 12, x2: 19, y2: 12 },
  ],
  close: [
    { k: "line", x1: 6, y1: 6, x2: 18, y2: 18 },
    { k: "line", x1: 18, y1: 6, x2: 6, y2: 18 },
  ],
  copy: [
    { k: "rect", x: 8.5, y: 8.5, w: 12, h: 12, r: 2 },
    { k: "rect", x: 3.5, y: 3.5, w: 12, h: 12, r: 2 },
  ],
  chevron: [
    { k: "line", x1: 7, y1: 10, x2: 12, y2: 15 },
    { k: "line", x1: 12, y1: 15, x2: 17, y2: 10 },
  ],
  /** Leaves the app (UI-014): an arrow out of an open box. */
  external: [
    { k: "line", x1: 11, y1: 6, x2: 5.5, y2: 6 },
    { k: "line", x1: 5.5, y1: 6, x2: 5.5, y2: 18.5 },
    { k: "line", x1: 5.5, y1: 18.5, x2: 18, y2: 18.5 },
    { k: "line", x1: 18, y1: 18.5, x2: 18, y2: 13 },
    { k: "line", x1: 11, y1: 13, x2: 19, y2: 5 },
    { k: "line", x1: 13.5, y1: 5, x2: 19, y2: 5 },
    { k: "line", x1: 19, y1: 5, x2: 19, y2: 10.5 },
  ],
  arrowLeft: [
    { k: "line", x1: 19, y1: 12, x2: 5, y2: 12 },
    { k: "line", x1: 5, y1: 12, x2: 11, y2: 6 },
    { k: "line", x1: 5, y1: 12, x2: 11, y2: 18 },
  ],
  headphones: [
    { k: "arc", cx: 12, cy: 12, r: 7.5, side: "top" },
    { k: "rect", x: 3.5, y: 12, w: 4, h: 8, r: 2 },
    { k: "rect", x: 16.5, y: 12, w: 4, h: 8, r: 2 },
  ],
  laptop: [
    { k: "rect", x: 4.5, y: 4.5, w: 15, h: 10, r: 1.5 },
    { k: "line", x1: 2.5, y1: 19.5, x2: 21.5, y2: 19.5 },
    { k: "line", x1: 4.5, y1: 14.5, x2: 2.5, y2: 19.5 },
    { k: "line", x1: 19.5, y1: 14.5, x2: 21.5, y2: 19.5 },
  ],
  list: [
    { k: "dot", cx: 6, cy: 7, r: 1.4 },
    { k: "line", x1: 10, y1: 7, x2: 20, y2: 7 },
    { k: "dot", cx: 6, cy: 12, r: 1.4 },
    { k: "line", x1: 10, y1: 12, x2: 20, y2: 12 },
    { k: "dot", cx: 6, cy: 17, r: 1.4 },
    { k: "line", x1: 10, y1: 17, x2: 20, y2: 17 },
  ],
  cpu: [
    { k: "rect", x: 6.5, y: 6.5, w: 11, h: 11, r: 2 },
    { k: "rect", x: 9.5, y: 9.5, w: 5, h: 5, r: 1 },
    ...([9, 12, 15] as const).flatMap((x): Prim[] => [
      { k: "line", x1: x, y1: 3, x2: x, y2: 6.5 },
      { k: "line", x1: x, y1: 17.5, x2: x, y2: 21 },
    ]),
    ...([9, 12, 15] as const).flatMap((y): Prim[] => [
      { k: "line", x1: 3, y1: y, x2: 6.5, y2: y },
      { k: "line", x1: 17.5, y1: y, x2: 21, y2: y },
    ]),
  ],
  video: [
    { k: "rect", x: 3, y: 7, w: 12, h: 10, r: 2 },
    { k: "line", x1: 15, y1: 12, x2: 21, y2: 8.5 },
    { k: "line", x1: 21, y1: 8.5, x2: 21, y2: 15.5 },
    { k: "line", x1: 21, y1: 15.5, x2: 15, y2: 12 },
  ],
  message: [
    { k: "rect", x: 3, y: 4.5, w: 18, h: 13.5, r: 4 },
    { k: "line", x1: 8, y1: 18, x2: 6, y2: 21.5 },
    { k: "line", x1: 6, y1: 21.5, x2: 11.5, y2: 18 },
    { k: "dot", cx: 8.5, cy: 11.5, r: 1.3 },
    { k: "dot", cx: 12, cy: 11.5, r: 1.3 },
    { k: "dot", cx: 15.5, cy: 11.5, r: 1.3 },
  ],
  lock: [
    { k: "rect", x: 4.5, y: 10.5, w: 15, h: 10, r: 2 },
    { k: "arc", cx: 12, cy: 10.5, r: 4.5, side: "top" },
    { k: "dot", cx: 12, cy: 15, r: 1.4 },
  ],
  info: [
    { k: "ring", cx: 12, cy: 12, r: 8.5 },
    { k: "dot", cx: 12, cy: 8.4, r: 1.15 },
    { k: "line", x1: 12, y1: 11.5, x2: 12, y2: 17 },
  ],
  palette: [
    { k: "ring", cx: 12, cy: 12, r: 8.4 },
    { k: "dot", cx: 8.8, cy: 9.2, r: 1.5 },
    { k: "dot", cx: 15.2, cy: 9.2, r: 1.5 },
    { k: "dot", cx: 8.8, cy: 15, r: 1.5 },
  ],
  target: [
    { k: "ring", cx: 12, cy: 12, r: 8.5 },
    { k: "ring", cx: 12, cy: 12, r: 4.4 },
    { k: "dot", cx: 12, cy: 12, r: 1.6 },
  ],
  bolt: [
    { k: "line", x1: 13, y1: 3, x2: 7, y2: 13 },
    { k: "line", x1: 7, y1: 13, x2: 12, y2: 13 },
    { k: "line", x1: 12, y1: 13, x2: 10, y2: 21 },
    { k: "line", x1: 10, y1: 21, x2: 17, y2: 10 },
    { k: "line", x1: 17, y1: 10, x2: 12, y2: 10 },
  ],
};

/** Every icon in the set, for tests and galleries. */
export const ICON_NAMES = Object.keys(ICONS) as IconName[];

const BASE = 24;
const BASE_STROKE = 1.8;

export type IconProps = {
  name: IconName;
  /** Outer size in px. Everything scales from it. */
  size?: number;
  /** Defaults to the muted text colour. */
  color?: string;
  /** Accessible name when the icon stands alone; omit beside a visible label. */
  label?: string;
  testID?: string;
};

export function Icon({ name, size = 22, color, label, testID }: IconProps) {
  const { color: theme } = useTheme();
  const ink = color ?? theme.textMuted;
  const k = size / BASE;
  const stroke = Math.max(1.2, BASE_STROKE * k);
  return (
    <View
      testID={testID ?? `icon-${name}`}
      accessible={Boolean(label)}
      accessibilityRole={label ? "image" : undefined}
      accessibilityLabel={label}
      accessibilityElementsHidden={!label}
      importantForAccessibility={label ? "yes" : "no-hide-descendants"}
      style={{ width: size, height: size }}
    >
      {ICONS[name].map((p) => (
        <Part key={JSON.stringify(p)} p={p} k={k} stroke={stroke} ink={ink} />
      ))}
    </View>
  );
}

function Part({ p, k, stroke, ink }: { p: Prim; k: number; stroke: number; ink: string }) {
  if (p.k === "line") {
    const t = (p.t ?? stroke / k) * k;
    const x1 = p.x1 * k;
    const y1 = p.y1 * k;
    const x2 = p.x2 * k;
    const y2 = p.y2 * k;
    const len = Math.hypot(x2 - x1, y2 - y1);
    const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
    return (
      <View
        style={[
          styles.part,
          {
            left: (x1 + x2) / 2 - len / 2,
            top: (y1 + y2) / 2 - t / 2,
            width: len,
            height: t,
            borderRadius: t,
            backgroundColor: ink,
            transform: [{ rotate: `${angle}deg` }],
          },
        ]}
      />
    );
  }
  if (p.k === "dot") {
    return (
      <View
        style={[
          styles.part,
          {
            left: (p.cx - p.r) * k,
            top: (p.cy - p.r) * k,
            width: p.r * 2 * k,
            height: p.r * 2 * k,
            borderRadius: p.r * k,
            backgroundColor: ink,
          },
        ]}
      />
    );
  }
  if (p.k === "ring") {
    const t = (p.t ?? stroke / k) * k;
    return (
      <View
        style={[
          styles.part,
          {
            left: (p.cx - p.r) * k,
            top: (p.cy - p.r) * k,
            width: p.r * 2 * k,
            height: p.r * 2 * k,
            borderRadius: p.r * k,
            borderWidth: t,
            borderColor: ink,
          },
        ]}
      />
    );
  }
  if (p.k === "rect") {
    const t = (p.t ?? stroke / k) * k;
    return (
      <View
        style={[
          styles.part,
          {
            left: p.x * k,
            top: p.y * k,
            width: p.w * k,
            height: p.h * k,
            borderRadius: (p.r ?? 0) * k,
            borderWidth: p.fill ? 0 : t,
            borderColor: ink,
            backgroundColor: p.fill ? ink : "transparent",
          },
        ]}
      />
    );
  }
  const t = (p.t ?? stroke / k) * k;
  const arc = (
    <View
      style={{
        position: "absolute",
        left: 0,
        top: (p.side === "top" ? 0 : p.r) * k,
        width: p.r * 2 * k,
        height: p.r * k,
        borderWidth: t,
        borderColor: ink,
        ...(p.side === "top"
          ? {
              borderBottomWidth: 0,
              borderTopLeftRadius: p.r * k,
              borderTopRightRadius: p.r * k,
            }
          : {
              borderTopWidth: 0,
              borderBottomLeftRadius: p.r * k,
              borderBottomRightRadius: p.r * k,
            }),
      }}
    />
  );
  // Rotate the whole circle box so the half-ring turns around the circle's centre, not its own.
  return (
    <View
      style={[
        styles.part,
        {
          left: (p.cx - p.r) * k,
          top: (p.cy - p.r) * k,
          width: p.r * 2 * k,
          height: p.r * 2 * k,
          ...(p.rotate ? { transform: [{ rotate: `${p.rotate}deg` }] } : null),
        },
      ]}
    >
      {arc}
    </View>
  );
}

const styles = StyleSheet.create({
  part: { position: "absolute" },
});
