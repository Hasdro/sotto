/**
 * The floating mini window (desktop, owner 22 Oct): the newest card, big enough to read at a
 * glance beside Zoom or the softphone. It shows what the main window sends and runs no call of
 * its own. The whole sentence shows (UX-005): a long card scrolls inside the small window
 * instead of being cut after two lines.
 */
import type { CardSource, CardType } from "@sotto/shared";
import { Button, Icon, Mascot, SuggestionCard, space, Text, useTheme } from "@sotto/ui";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SourceChip } from "../components/SourceChip";
import { cardStrings } from "../features/call/components/strings";
import { isCallSource } from "../lib/callSource";
import { desktop, type MiniState } from "../lib/desktop";
import { useI18n } from "../lib/locale";

export default function MiniWindow() {
  const { t } = useI18n();
  const { color } = useTheme();
  const [s, setS] = useState<MiniState>({ live: false, card: null, partial: null, source: null });
  const [copied, setCopied] = useState(false);
  useEffect(() => desktop()?.onMini?.(setS), []);
  const card = s.card;
  return (
    <View style={[styles.page, { backgroundColor: color.background }]} testID="mini">
      <View style={styles.top}>
        <Mascot
          state={!s.live ? "idle" : card && !card.done ? "thinking" : "listening"}
          size={28}
        />
        {s.source && isCallSource(s.source) ? <SourceChip source={s.source} /> : null}
        <View style={styles.grow} />
        {card ? (
          <Button
            variant="ghost"
            label={copied ? t("mini.copied") : t("mini.copy")}
            onPress={() => {
              void globalThis.navigator?.clipboard?.writeText(card.text).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              });
            }}
          />
        ) : null}
        <Button
          variant="secondary"
          label={t("mini.open")}
          onPress={() => desktop()?.miniAction?.("open")}
        />
      </View>
      {card ? (
        <ScrollView
          testID="mini-card-scroll"
          style={styles.cardScroll}
          contentContainerStyle={styles.cardScrollBody}
        >
          <SuggestionCard
            variant="compact"
            expanded
            type={card.type as CardType}
            source={card.source as CardSource}
            label={card.label}
            text={card.text}
            done={card.done}
            strings={cardStrings(t, card.type as CardType, card.source as CardSource)}
          />
        </ScrollView>
      ) : (
        <Text tone="muted">{t(s.live ? "mini.waiting" : "mini.idle")}</Text>
      )}
      {s.partial ? (
        <View style={styles.partial}>
          <Icon name="mic" size={14} color={color.textMuted} />
          <Text variant="label" tone="muted" numberOfLines={2} style={styles.partialText}>
            {s.partial}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: space.md, gap: space.sm },
  top: { flexDirection: "row", alignItems: "center", gap: space.sm },
  grow: { flex: 1 },
  cardScroll: { flexGrow: 0, flexShrink: 1 },
  cardScrollBody: { flexGrow: 0 },
  partial: { flexDirection: "row", alignItems: "flex-start", gap: space.xs },
  partialText: { flex: 1, minWidth: 0 },
});
