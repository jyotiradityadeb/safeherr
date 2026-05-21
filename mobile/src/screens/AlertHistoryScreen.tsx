import React, { useEffect, useMemo, useState } from "react";
import { FlatList, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { api } from "../api/client";
import { AppButton, GlassCard, ScreenHeader, StatusPill } from "../components/ui";
import { spacing } from "../design/tokens";
import { AppTheme } from "../theme/colors";
import { useTheme } from "../theme/useTheme";
import { getErrorMessage } from "../utils/errorMessage";

export function AlertHistoryScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [history, setHistory] = useState<any[]>([]);
  const [error, setError] = useState("");

  const loadHistory = async () => {
    try {
      setError("");
      const { data } = await api.get("/alerts/history");
      setHistory(data);
    } catch (loadError: any) {
      setError(getErrorMessage(loadError, "Could not load alert history."));
    }
  };

  useEffect(() => {
    loadHistory();
    const timer = setInterval(loadHistory, 4000);
    return () => clearInterval(timer);
  }, []);

  return (
    <View style={styles.container}>
      <ScreenHeader
        eyebrow="Safety timeline"
        title="Alerts"
        subtitle="Audit emergency events, confidence, delivery channels, and map links."
        right={<StatusPill label={`${history.length} events`} />}
      />
      <AppButton title="Refresh History" icon="refresh" variant="secondary" onPress={loadHistory} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={<Text style={styles.empty}>No alerts yet. Trigger SOS from Home to create a demo event.</Text>}
        renderItem={({ item, index }) => (
          <GlassCard style={styles.card}>
            <View style={styles.timelineRail}>
              <View style={styles.timelineDot} />
              {index !== history.length - 1 ? <View style={styles.timelineLine} /> : null}
            </View>
            <View style={styles.cardBody}>
              <View style={styles.cardHead}>
                <View>
                  <Text style={styles.cardTitle}>{item.gesture_label || "manual_sos"}</Text>
                  <Text style={styles.meta}>
                    {new Date(item.created_at || item.triggered_at).toLocaleString()}
                  </Text>
                </View>
                <StatusPill label={`${item.confidence ?? item.status ?? "-"}`} tone="danger" />
              </View>
              <View style={styles.metaRow}>
                <Ionicons name="radio" size={16} color={theme.accent} />
                <Text style={styles.meta}>Channels: {(item.delivery_channels || []).join(", ") || "none"}</Text>
              </View>
              <View style={styles.metaRow}>
                <Ionicons name="navigate" size={16} color={theme.accent} />
                <Text style={styles.meta}>Status: {item.status || "triggered"}</Text>
              </View>
              <Pressable
                style={styles.linkButton}
                onPress={() => {
                  const mapLink = item.map_link || item.map_url;
                  if (mapLink) {
                    Linking.openURL(mapLink).catch(() => undefined);
                  }
                }}
                disabled={!item.map_link && !item.map_url}
              >
                <Ionicons name="map" size={17} color={theme.buttonText} />
                <Text style={styles.linkText}>Open map link</Text>
              </Pressable>
            </View>
          </GlassCard>
        )}
      />
    </View>
  );
}

const createStyles = (colors: AppTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      padding: spacing.xl,
      paddingBottom: 96,
    },
    listContent: {
      gap: spacing.md,
      paddingTop: spacing.lg,
      paddingBottom: 120,
    },
    card: {
      flexDirection: "row",
      gap: spacing.md,
    },
    timelineRail: {
      alignItems: "center",
      width: 22,
    },
    timelineDot: {
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: colors.danger,
      marginTop: 4,
    },
    timelineLine: {
      flex: 1,
      width: 2,
      backgroundColor: colors.border,
      marginTop: 8,
    },
    cardBody: {
      flex: 1,
      gap: spacing.sm,
    },
    cardHead: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: spacing.md,
    },
    cardTitle: {
      color: colors.text,
      fontWeight: "900",
      fontSize: 16,
    },
    error: {
      color: colors.danger,
      marginTop: spacing.md,
      lineHeight: 20,
    },
    empty: {
      color: colors.subtext,
      lineHeight: 21,
      backgroundColor: colors.cardAlt,
      borderRadius: 18,
      padding: spacing.lg,
    },
    meta: {
      color: colors.subtext,
      lineHeight: 20,
      flexShrink: 1,
    },
    metaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    linkButton: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: colors.primary,
      borderRadius: 999,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      marginTop: spacing.xs,
    },
    linkText: {
      color: colors.buttonText,
      fontWeight: "900",
    },
  });
