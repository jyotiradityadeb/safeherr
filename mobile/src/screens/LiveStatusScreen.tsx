import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { api } from "../api/client";
import { AppButton, GlassCard, ScreenHeader, StatusPill } from "../components/ui";
import { getLatestLiveRoom, getLatestSmartCheckIn, LiveRoom, SmartCheckIn } from "../services/safetyService";
import { spacing } from "../design/tokens";
import { AppTheme } from "../theme/colors";
import { useTheme } from "../theme/useTheme";
import { getErrorMessage } from "../utils/errorMessage";

export function LiveStatusScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [latestAlert, setLatestAlert] = useState<any>(null);
  const [latestLocation, setLatestLocation] = useState<any>(null);
  const [liveRoom, setLiveRoom] = useState<LiveRoom | null>(null);
  const [smartCheckIn, setSmartCheckIn] = useState<SmartCheckIn | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadLatest = async () => {
    try {
      setLoading(true);
      setError("");
      const [{ data: alerts }, { data: location }, room, checkIn] = await Promise.all([
        api.get("/alerts/history"),
        api.get("/locations/latest"),
        getLatestLiveRoom(),
        getLatestSmartCheckIn(),
      ]);
      setLatestAlert(alerts[0] || null);
      setLatestLocation(location || null);
      setLiveRoom(room);
      setSmartCheckIn(checkIn);
    } catch (loadError: any) {
      setError(getErrorMessage(loadError, "Could not load the latest status."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLatest();
    const timer = setInterval(loadLatest, 5000);
    return () => clearInterval(timer);
  }, []);

  const mapUrl = latestAlert?.map_link || (
    latestLocation?.latitude && latestLocation?.longitude
      ? `https://maps.google.com/?q=${latestLocation.latitude},${latestLocation.longitude}`
      : ""
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <ScreenHeader
        eyebrow="Live command"
        title="Tracking"
        subtitle="Real-time safety state, location signal, trusted-circle room, and check-in status."
        right={<StatusPill label={latestAlert ? "Alert live" : "Safe"} tone={latestAlert ? "danger" : "success"} />}
      />

      <GlassCard elevated style={styles.mapCard}>
        <View style={styles.mapGrid}>
          <View style={[styles.mapPulse, latestAlert && styles.mapPulseDanger]}>
            <Ionicons name="location" size={34} color={theme.buttonText} />
          </View>
          <View style={styles.mapLineHorizontal} />
          <View style={styles.mapLineVertical} />
        </View>
        <View style={styles.mapOverlay}>
          <Text style={styles.mapTitle}>{latestAlert ? "Emergency route active" : "Live location standby"}</Text>
          <Text style={styles.mapText}>
            {latestLocation
              ? `${latestLocation.latitude}, ${latestLocation.longitude}`
              : "Waiting for a background location update."}
          </Text>
        </View>
        {mapUrl ? (
          <Pressable style={styles.mapButton} onPress={() => Linking.openURL(mapUrl)}>
            <Ionicons name="map" size={17} color={theme.buttonText} />
            <Text style={styles.mapButtonText}>Open Map</Text>
          </Pressable>
        ) : null}
      </GlassCard>

      {loading ? <ActivityIndicator color={theme.primary} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <GlassCard style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.infoTitle}>Alert state</Text>
          <Ionicons name={latestAlert ? "warning" : "checkmark-circle"} size={22} color={latestAlert ? theme.danger : theme.success} />
        </View>
        {latestAlert ? (
          <>
            <Text style={styles.info}>Gesture: {latestAlert.gesture_label}</Text>
            <Text style={styles.info}>Confidence: {latestAlert.confidence}</Text>
            <Text style={styles.info}>Triggered: {new Date(latestAlert.triggered_at).toLocaleString()}</Text>
          </>
        ) : (
          <Text style={styles.info}>No active alert detected.</Text>
        )}
      </GlassCard>

      <GlassCard style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.infoTitle}>Trusted circle live room</Text>
          <StatusPill label={liveRoom ? "Active" : "Idle"} tone={liveRoom ? "success" : "primary"} />
        </View>
        {liveRoom ? (
          <>
            <Text style={styles.info}>Room code: {liveRoom.room_code}</Text>
            <Text style={styles.info}>Participants: {liveRoom.participants.length}</Text>
            <Text style={styles.info}>Last activity: {new Date(liveRoom.updated_at).toLocaleString()}</Text>
            <Text style={styles.info}>Latest note: {liveRoom.timeline?.slice(-1)[0]?.message || "No notes yet."}</Text>
          </>
        ) : (
          <Text style={styles.info}>No live room active.</Text>
        )}
      </GlassCard>

      <GlassCard style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.infoTitle}>Smart check-in</Text>
          <StatusPill label={smartCheckIn?.status || "None"} tone={smartCheckIn?.status === "pending" ? "warning" : "primary"} />
        </View>
        {smartCheckIn ? (
          <>
            <Text style={styles.info}>Reason: {smartCheckIn.reason}</Text>
            <Text style={styles.info}>Due: {new Date(smartCheckIn.due_at).toLocaleString()}</Text>
            {smartCheckIn.acknowledged_at ? (
              <Text style={styles.info}>Acknowledged: {new Date(smartCheckIn.acknowledged_at).toLocaleString()}</Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.info}>No smart check-in request found.</Text>
        )}
      </GlassCard>

      <AppButton title="Refresh Live Status" icon="refresh" variant="secondary" onPress={loadLatest} loading={loading} />
    </ScrollView>
  );
}

const createStyles = (colors: AppTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: spacing.xl,
      paddingBottom: 116,
      gap: spacing.md,
    },
    mapCard: {
      minHeight: 260,
      overflow: "hidden",
      padding: 0,
    },
    mapGrid: {
      flex: 1,
      minHeight: 260,
      backgroundColor: colors.backgroundElevated,
      alignItems: "center",
      justifyContent: "center",
    },
    mapLineHorizontal: {
      position: "absolute",
      left: 0,
      right: 0,
      height: 1,
      backgroundColor: colors.border,
      opacity: 0.7,
    },
    mapLineVertical: {
      position: "absolute",
      top: 0,
      bottom: 0,
      width: 1,
      backgroundColor: colors.border,
      opacity: 0.7,
    },
    mapPulse: {
      width: 78,
      height: 78,
      borderRadius: 39,
      backgroundColor: colors.success,
      alignItems: "center",
      justifyContent: "center",
      zIndex: 2,
      shadowColor: colors.success,
      shadowOpacity: 0.35,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8,
    },
    mapPulseDanger: {
      backgroundColor: colors.danger,
      shadowColor: colors.danger,
    },
    mapOverlay: {
      position: "absolute",
      left: spacing.lg,
      right: spacing.lg,
      bottom: spacing.lg,
      backgroundColor: colors.glass,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
    },
    mapTitle: {
      color: colors.text,
      fontWeight: "900",
      fontSize: 16,
    },
    mapText: {
      color: colors.subtext,
      marginTop: 4,
    },
    mapButton: {
      position: "absolute",
      right: spacing.lg,
      top: spacing.lg,
      minHeight: 40,
      borderRadius: 999,
      paddingHorizontal: spacing.md,
      backgroundColor: colors.primary,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    mapButtonText: {
      color: colors.buttonText,
      fontWeight: "900",
    },
    card: {
      gap: spacing.sm,
    },
    cardHead: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.md,
    },
    info: {
      color: colors.subtext,
      lineHeight: 20,
    },
    infoTitle: {
      color: colors.text,
      fontWeight: "900",
      fontSize: 17,
    },
    error: {
      color: colors.danger,
      lineHeight: 20,
    },
  });
