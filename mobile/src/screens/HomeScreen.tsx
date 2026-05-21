import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Location from "expo-location";
import * as SMS from "expo-sms";
import * as Clipboard from "expo-clipboard";

import { api } from "../api/client";
import { ScreenHeader } from "../components/ui";
import { spacing } from "../design/tokens";
import { useTheme } from "../theme/useTheme";
import { AppTheme } from "../theme/colors";
import { getErrorMessage } from "../utils/errorMessage";

type TrustedContact = {
  name: string;
  phone_number: string;
  relation: string;
};

type SafetyProfile = {
  full_name: string;
  age: number;
  phone_number: string;
  home_locality: string;
  city: string;
  trusted_contacts: TrustedContact[];
};

type SentAlert = {
  id: string;
  user_name: string;
  user_phone: string;
  trusted_contacts: TrustedContact[];
  latitude: number | null;
  longitude: number | null;
  map_url: string;
  nearest_police_station_name?: string | null;
  nearest_police_station_phone?: string | null;
  nearest_police_station_address?: string | null;
  police_distance_km?: number | null;
  police_source?: string | null;
  location_address?: string | null;
  location_source?: string | null;
  nearby_police_stations?: Array<{
    name: string;
    address: string;
    distance_km?: number;
    source?: string;
  }>;
  ai_agent_analysis?: {
    risk_level?: string;
    priority_score?: number;
    alert_summary?: string;
    reasoning?: string;
    recommended_actions?: string[];
    next_steps_for_user?: string[];
    maps_context_used?: boolean;
  };
  message_to_contacts?: string | null;
  message_to_police?: string | null;
  contact_delivery_status?:
    | "NOT_ATTEMPTED"
    | "PREPARED"
    | "SENT"
    | "PARTIALLY_SENT"
    | "FAILED"
    | "PENDING_USER_CONFIRMATION";
  contact_delivery_results?: Array<{
    name: string;
    phone_number: string;
    relation: string;
    status: "SENT" | "FAILED" | "PENDING_USER_CONFIRMATION" | "PREPARED" | "NOT_ATTEMPTED";
    error?: string;
    sent_at?: string | null;
  }>;
  status: string;
};

const COUNTDOWN_SECONDS = 25;

async function captureBestEffortLocation() {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      return {
        latitude: null,
        longitude: null,
        map_url: "Location unavailable",
      };
    }
    const current = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    }).catch(() => null);
    const lastKnown = current ? null : await Location.getLastKnownPositionAsync();
    const best = current || lastKnown;
    if (!best) {
      return {
        latitude: null,
        longitude: null,
        map_url: "Location unavailable",
      };
    }
    const latitude = Number(best.coords.latitude.toFixed(6));
    const longitude = Number(best.coords.longitude.toFixed(6));
    return {
      latitude,
      longitude,
      map_url: `https://www.google.com/maps?q=${latitude},${longitude}`,
    };
  } catch {
    return {
      latitude: null,
      longitude: null,
      map_url: "Location unavailable",
    };
  }
}

export function HomeScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [profile, setProfile] = useState<SafetyProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [message, setMessage] = useState("");
  const [countdownVisible, setCountdownVisible] = useState(false);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [sending, setSending] = useState(false);
  const [sentAlert, setSentAlert] = useState<SentAlert | null>(null);
  const [smsBusy, setSmsBusy] = useState(false);
  const [smsStatusNote, setSmsStatusNote] = useState("");

  const loadProfile = async () => {
    setLoadingProfile(true);
    try {
      const { data } = await api.get("/profile/me");
      setProfile(data);
      setMessage("");
    } catch {
      setProfile(null);
      setMessage("Please complete your safety profile before sending SOS.");
    } finally {
      setLoadingProfile(false);
    }
  };

  useEffect(() => {
    loadProfile().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!countdownVisible) {
      return;
    }
    if (countdown <= 0) {
      sendAlert().catch(() => undefined);
      return;
    }
    const timer = setTimeout(() => {
      setCountdown((value) => value - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdownVisible, countdown]);

  const isProfileComplete = () => {
    if (!profile) {
      return false;
    }
    if (!profile.full_name?.trim()) {
      return false;
    }
    if (!profile.phone_number?.trim()) {
      return false;
    }
    return (profile.trusted_contacts || []).length > 0;
  };

  const handleSendSosPress = async () => {
    await loadProfile();
    if (!isProfileComplete()) {
      setMessage("Please complete your safety profile before sending SOS.");
      return;
    }
    setMessage("");
    setCountdown(COUNTDOWN_SECONDS);
    setCountdownVisible(true);
  };

  const cancelCountdown = async () => {
    setCountdownVisible(false);
    setCountdown(COUNTDOWN_SECONDS);
    setMessage("False alarm cancelled. SOS alert was not sent.");
    try {
      await api.post("/alerts/cancel-false-alarm");
    } catch {
      // keep cancel resilient in demo mode
    }
  };

  const sendAlert = async () => {
    if (!profile || sending) {
      return;
    }
    setSending(true);
    try {
      const location = await captureBestEffortLocation();
      const payload = {
        user_name: profile.full_name,
        user_phone: profile.phone_number,
        trusted_contacts: profile.trusted_contacts,
        latitude: location.latitude,
        longitude: location.longitude,
        map_url: location.map_url,
      };
      const { data } = await api.post("/alerts", payload);
      setSentAlert(data);
      setSmsStatusNote("");
      setMessage("SOS Alert Sent");
    } catch (error: any) {
      setMessage(getErrorMessage(error, "Failed to send SOS alert. Please try again."));
    } finally {
      setCountdownVisible(false);
      setCountdown(COUNTDOWN_SECONDS);
      setSending(false);
    }
  };

  const syncContactDelivery = async (
    status: "SENT" | "FAILED" | "PENDING_USER_CONFIRMATION" | "PREPARED",
    error = ""
  ) => {
    if (!sentAlert) {
      return;
    }
    const contacts = sentAlert.trusted_contacts || [];
    if (!contacts.length) {
      return;
    }
    const results = contacts.map((contact) => ({
      phone_number: contact.phone_number,
      status,
      error,
    }));
    const { data } = await api.post(`/alerts/${sentAlert.id}/contact-delivery/mark-sent`, { results });
    setSentAlert(data);
  };

  const handleSendEmergencySms = async () => {
    if (!sentAlert || smsBusy) {
      return;
    }
    const recipients = (sentAlert.trusted_contacts || [])
      .map((contact) => contact.phone_number)
      .filter((value) => String(value || "").trim().length > 0);
    const body = sentAlert.message_to_contacts || "";
    if (!recipients.length) {
      setSmsStatusNote("No trusted contacts available.");
      return;
    }
    if (!body.trim()) {
      setSmsStatusNote("Emergency message unavailable.");
      return;
    }

    setSmsBusy(true);
    try {
      const available = await SMS.isAvailableAsync();
      if (!available) {
        setSmsStatusNote("SMS app unavailable on this device.");
        await syncContactDelivery("PREPARED");
        return;
      }

      await syncContactDelivery("PENDING_USER_CONFIRMATION");
      const result = await SMS.sendSMSAsync(recipients, body);

      if (result.result === "sent") {
        await syncContactDelivery("SENT");
        setSmsStatusNote("Emergency SMS marked as sent.");
      } else {
        await syncContactDelivery("PENDING_USER_CONFIRMATION");
        setSmsStatusNote("SMS composer closed. Confirm sent status manually if completed.");
      }
    } catch (error: any) {
      const errorMessage = getErrorMessage(error, "Could not open SMS composer.");
      setSmsStatusNote(errorMessage);
      try {
        await syncContactDelivery("FAILED", errorMessage);
      } catch {
        // keep UI resilient if backend update fails
      }
    } finally {
      setSmsBusy(false);
    }
  };

  const markSmsSent = async () => {
    if (!sentAlert || smsBusy) {
      return;
    }
    setSmsBusy(true);
    try {
      await syncContactDelivery("SENT");
      setSmsStatusNote("Trusted contact delivery status updated to SENT.");
    } catch (error: any) {
      setSmsStatusNote(getErrorMessage(error, "Could not update SMS status."));
    } finally {
      setSmsBusy(false);
    }
  };

  const copyEmergencyMessage = async () => {
    const text = sentAlert?.message_to_contacts || "";
    if (!text.trim()) {
      setSmsStatusNote("Emergency message unavailable.");
      return;
    }
    try {
      await Clipboard.setStringAsync(text);
      setSmsStatusNote("Emergency message copied.");
    } catch {
      setSmsStatusNote("Could not copy emergency message.");
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader
          eyebrow="Emergency"
          title="SafeHer Manual SOS"
          subtitle="Manual SOS only. No sensor-triggered SOS is active."
        />
        <View style={styles.card}>
          <Text style={styles.title}>Safety Readiness</Text>
          {loadingProfile ? <ActivityIndicator color={theme.primary} /> : null}
          <Text style={styles.text}>
            Profile: {profile?.full_name ? "Configured" : "Missing"}
          </Text>
          <Text style={styles.text}>
            Trusted contacts: {(profile?.trusted_contacts || []).length}
          </Text>
          <Pressable style={styles.secondaryButton} onPress={() => loadProfile().catch(() => undefined)}>
            <Text style={styles.secondaryText}>Refresh Profile</Text>
          </Pressable>
        </View>

        <Pressable style={styles.sosButton} onPress={handleSendSosPress} disabled={sending}>
          <Text style={styles.sosButtonText}>{sending ? "Sending..." : "Send SOS"}</Text>
        </Pressable>

        {message ? <Text style={styles.message}>{message}</Text> : null}
      </ScrollView>

      <Modal visible={countdownVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Emergency Countdown</Text>
            <Text style={styles.modalText}>
              SOS alert will be sent in 25 seconds.
            </Text>
            <Text style={styles.timer}>{countdown}s</Text>
            <Pressable style={styles.cancelButton} onPress={cancelCountdown}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(sentAlert)} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.sentCard}>
            <Text style={styles.modalTitle}>SOS Alert Sent</Text>
            <Text style={styles.modalText}>User: {sentAlert?.user_name}</Text>
            <Text style={styles.modalText}>Phone: {sentAlert?.user_phone}</Text>
            <Text style={styles.modalText}>Status: {sentAlert?.status}</Text>
            <Text style={styles.modalText}>
              Address: {sentAlert?.location_address || "Address unavailable. Map link still available."}
            </Text>
            <Text style={styles.modalText}>
              Location source: {sentAlert?.location_source || "fallback"}
            </Text>
            <Text style={styles.modalText}>
              Nearest police: {sentAlert?.nearest_police_station_name || "Not available"}
            </Text>
            <Text style={styles.modalText}>
              Police source: {sentAlert?.police_source || "static_fallback"}
            </Text>
            <Text style={styles.modalText}>
              Distance: {sentAlert?.police_distance_km ?? "N/A"} km
            </Text>
            <Text style={styles.modalText}>
              Trusted contacts: {(sentAlert?.trusted_contacts || []).length}
            </Text>
            <Pressable
              style={styles.secondaryButton}
              disabled={!sentAlert?.map_url || sentAlert?.map_url === "Location unavailable"}
              onPress={() => {
                if (sentAlert?.map_url && sentAlert.map_url !== "Location unavailable") {
                  Linking.openURL(sentAlert.map_url).catch(() => undefined);
                }
              }}
            >
              <Text style={styles.secondaryText}>Open Map Link</Text>
            </Pressable>
            <Text style={styles.previewTitle}>Message Preview (Contacts)</Text>
            <Text style={styles.previewBody}>{sentAlert?.message_to_contacts || "-"}</Text>
            <Text style={styles.previewTitle}>Message Preview (Police)</Text>
            <Text style={styles.previewBody}>{sentAlert?.message_to_police || "-"}</Text>
            <Text style={styles.previewTitle}>Emergency SMS to Trusted Contacts</Text>
            <Text style={styles.modalText}>
              Status: {sentAlert?.contact_delivery_status || "NOT_ATTEMPTED"}
            </Text>
            <Text style={styles.previewBody}>
              {(sentAlert?.contact_delivery_results?.length
                ? sentAlert.contact_delivery_results
                    .map(
                      (item) =>
                        `${item.name || "Contact"} (${item.phone_number}) - ${item.status}${item.sent_at ? ` at ${new Date(item.sent_at).toLocaleString()}` : ""}${item.error ? ` | ${item.error}` : ""}`
                    )
                    .join("\n")
                : (sentAlert?.trusted_contacts || [])
                    .map((item) => `${item.name} (${item.phone_number}) - ${item.relation}`)
                    .join("\n")) || "No trusted contacts."}
            </Text>
            <Pressable style={styles.secondaryButton} onPress={handleSendEmergencySms} disabled={smsBusy}>
              <Text style={styles.secondaryText}>
                {smsBusy ? "Working..." : "Send Emergency SMS to Trusted Contacts"}
              </Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={markSmsSent} disabled={smsBusy}>
              <Text style={styles.secondaryText}>Mark SMS Sent</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={copyEmergencyMessage}>
              <Text style={styles.secondaryText}>Copy Emergency Message</Text>
            </Pressable>
            {smsStatusNote ? <Text style={styles.modalText}>{smsStatusNote}</Text> : null}
            <Text style={styles.previewTitle}>AI Safety Agent</Text>
            {sentAlert?.ai_agent_analysis ? (
              <>
                <Text style={styles.modalText}>
                  Risk level: {sentAlert.ai_agent_analysis.risk_level || "-"}
                </Text>
                <Text style={styles.modalText}>
                  Priority score: {sentAlert.ai_agent_analysis.priority_score ?? "-"}
                </Text>
                <Text style={styles.previewBody}>
                  {sentAlert.ai_agent_analysis.alert_summary || "Summary unavailable."}
                </Text>
                <Text style={styles.previewBody}>
                  {sentAlert.ai_agent_analysis.reasoning || "Reasoning unavailable."}
                </Text>
                <Text style={styles.modalText}>
                  Maps context used: {sentAlert.ai_agent_analysis.maps_context_used ? "Yes" : "No"}
                </Text>
                <Text style={styles.previewTitle}>Recommended Actions</Text>
                <Text style={styles.previewBody}>
                  {(sentAlert.ai_agent_analysis.recommended_actions || []).join("\n") || "-"}
                </Text>
                <Text style={styles.previewTitle}>Next Steps For User</Text>
                <Text style={styles.previewBody}>
                  {(sentAlert.ai_agent_analysis.next_steps_for_user || []).join("\n") || "-"}
                </Text>
              </>
            ) : (
              <Text style={styles.modalText}>AI Safety Agent analysis unavailable.</Text>
            )}
            {sentAlert?.nearby_police_stations?.length ? (
              <>
                <Text style={styles.previewTitle}>Top Nearby Police Stations</Text>
                <Text style={styles.previewBody}>
                  {sentAlert.nearby_police_stations
                    .map(
                      (item, index) =>
                        `${index + 1}. ${item.name} (${item.distance_km ?? "N/A"} km) - ${item.address}`
                    )
                    .join("\n")}
                </Text>
              </>
            ) : null}
            <Text style={styles.notice}>Demo mode: Alert messages were generated and stored.</Text>
            <Pressable style={styles.homeButton} onPress={() => setSentAlert(null)}>
              <Text style={styles.homeButtonText}>Return Home</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    content: {
      padding: spacing.xl,
      paddingBottom: 110,
      gap: spacing.lg,
    },
    card: {
      backgroundColor: theme.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    title: {
      color: theme.text,
      fontWeight: "900",
      fontSize: 18,
    },
    text: {
      color: theme.subtext,
      lineHeight: 20,
    },
    sosButton: {
      minHeight: 88,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.danger,
    },
    sosButtonText: {
      color: theme.buttonText,
      fontSize: 30,
      fontWeight: "900",
      letterSpacing: 0.4,
    },
    secondaryButton: {
      alignSelf: "flex-start",
      backgroundColor: theme.cardAlt,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    secondaryText: {
      color: theme.text,
      fontWeight: "700",
    },
    message: {
      color: theme.text,
      backgroundColor: theme.cardAlt,
      borderRadius: 12,
      padding: spacing.md,
      lineHeight: 20,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      alignItems: "center",
      padding: spacing.xl,
    },
    modalCard: {
      width: "100%",
      borderRadius: 18,
      backgroundColor: theme.surface,
      padding: spacing.xl,
      gap: spacing.md,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: "center",
    },
    sentCard: {
      width: "100%",
      maxHeight: "88%",
      borderRadius: 18,
      backgroundColor: theme.surface,
      padding: spacing.xl,
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: theme.border,
    },
    modalTitle: {
      color: theme.text,
      fontSize: 22,
      fontWeight: "900",
      textAlign: "center",
    },
    modalText: {
      color: theme.subtext,
      lineHeight: 20,
    },
    timer: {
      color: theme.danger,
      fontSize: 54,
      fontWeight: "900",
    },
    cancelButton: {
      minWidth: 180,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.cardAlt,
      borderWidth: 1,
      borderColor: theme.border,
      paddingVertical: spacing.sm,
    },
    cancelButtonText: {
      color: theme.text,
      fontWeight: "900",
      fontSize: 16,
    },
    previewTitle: {
      color: theme.text,
      fontWeight: "900",
      marginTop: spacing.sm,
    },
    previewBody: {
      color: theme.subtext,
      backgroundColor: theme.cardAlt,
      borderRadius: 10,
      padding: spacing.sm,
      lineHeight: 19,
    },
    notice: {
      color: theme.text,
      fontWeight: "700",
      marginTop: spacing.sm,
    },
    homeButton: {
      marginTop: spacing.md,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.primary,
      borderRadius: 12,
      minHeight: 44,
    },
    homeButtonText: {
      color: theme.buttonText,
      fontWeight: "900",
      fontSize: 15,
    },
  });
