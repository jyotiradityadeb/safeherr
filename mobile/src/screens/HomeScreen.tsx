import React, { useEffect, useMemo, useRef, useState } from "react";
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
import * as SMS from "expo-sms";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";

import { api } from "../api/client";
import { ScreenHeader } from "../components/ui";
import { spacing } from "../design/tokens";
import { getBestEffortLocation } from "../services/locationFallback";
import { AppTheme } from "../theme/colors";
import { useTheme } from "../theme/useTheme";
import { getErrorMessage } from "../utils/errorMessage";
import { createSosRequestGuard } from "../utils/sosRequestGuard";

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

type DeliveryResult = {
  name: string;
  phone_number: string;
  relation: string;
  status: "SENT" | "FAILED" | "PENDING_USER_CONFIRMATION" | "PREPARED" | "NOT_ATTEMPTED";
  error?: string;
  sent_at?: string | null;
};

type SentAlert = {
  id: string;
  user_name: string;
  user_phone: string;
  trusted_contacts: TrustedContact[];
  latitude: number | null;
  longitude: number | null;
  map_url: string;
  location_address?: string | null;
  location_source?: string | null;
  nearest_police_station_name?: string | null;
  nearest_police_station_address?: string | null;
  police_distance_km?: number | null;
  police_delivery_status?: string;
  police_message_preview?: string | null;
  message_to_contacts?: string | null;
  contact_delivery_status?:
    | "NOT_ATTEMPTED"
    | "PREPARED"
    | "SENT"
    | "PARTIALLY_SENT"
    | "FAILED"
    | "PENDING_USER_CONFIRMATION";
  contact_delivery_results?: DeliveryResult[];
  contact_delivery_error?: string;
  status: string;
};

const COUNTDOWN_SECONDS = 25;

function createRequestId() {
  return `sos-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function captureBestEffortLocation() {
  const location = await getBestEffortLocation();
  if (location.source === "unavailable") {
    return {
      latitude: null,
      longitude: null,
      map_url: "Location unavailable",
      location_source: "unavailable" as const,
    };
  }

  const latitude = Number(location.latitude.toFixed(6));
  const longitude = Number(location.longitude.toFixed(6));
  return {
    latitude,
    longitude,
    map_url: `https://www.google.com/maps?q=${encodeURIComponent(`${latitude},${longitude}`)}`,
    location_source:
      location.source === "current"
        ? ("live_gps" as const)
        : location.source === "last_known"
          ? ("last_known" as const)
          : ("cached" as const),
  };
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
  const sendingRef = useRef(false);
  const requestGuardRef = useRef(createSosRequestGuard());
  const requestIdRef = useRef<string | null>(null);

  const loadProfile = async (): Promise<SafetyProfile | null> => {
    setLoadingProfile(true);
    try {
      const { data } = await api.get("/profile/me");
      setProfile(data);
      setMessage("");
      return data;
    } catch {
      setProfile(null);
      setMessage("Please complete your safety profile before sending SOS.");
      return null;
    } finally {
      setLoadingProfile(false);
    }
  };

  const isProfileComplete = (candidate: SafetyProfile | null) =>
    Boolean(
      candidate?.full_name?.trim() &&
        candidate?.phone_number?.trim() &&
        candidate.trusted_contacts?.length
    );

  const syncContactDelivery = async (
    alert: SentAlert,
    status: "SENT" | "FAILED" | "PENDING_USER_CONFIRMATION" | "PREPARED",
    error = ""
  ) => {
    const results = (alert.trusted_contacts || []).map((contact) => ({
      phone_number: contact.phone_number,
      status,
      error,
    }));
    if (!results.length) {
      return alert;
    }
    const { data } = await api.post(`/alerts/${alert.id}/contact-delivery/mark-sent`, {
      results,
    });
    setSentAlert(data);
    return data as SentAlert;
  };

  const openSmsComposer = async (alert: SentAlert) => {
    if (smsBusy) {
      return;
    }
    const recipients = Array.from(
      new Set(
        (alert.trusted_contacts || [])
          .map((contact) => String(contact.phone_number || "").trim())
          .filter(Boolean)
      )
    );
    const body = alert.message_to_contacts || "";
    if (!recipients.length || !body.trim()) {
      setSmsStatusNote("No valid trusted-contact SMS message is available.");
      return;
    }

    setSmsBusy(true);
    try {
      if (!(await SMS.isAvailableAsync())) {
        setSmsStatusNote("The SMS app is unavailable. The message remains prepared but unsent.");
        await syncContactDelivery(alert, "PREPARED");
        return;
      }

      setSmsStatusNote("The SMS app is opening. You must press Send to notify your contacts.");
      await syncContactDelivery(alert, "PENDING_USER_CONFIRMATION");
      const result = await SMS.sendSMSAsync(recipients, body);
      if (result.result === "sent") {
        await syncContactDelivery(alert, "SENT");
        setSmsStatusNote("The device SMS app reported that the message was sent.");
      } else {
        await syncContactDelivery(alert, "PENDING_USER_CONFIRMATION");
        setSmsStatusNote("SMS delivery is not confirmed. Reopen the composer and press Send if needed.");
      }
    } catch (error: any) {
      const detail = getErrorMessage(error, "Could not open the SMS composer.");
      setSmsStatusNote(detail);
      try {
        await syncContactDelivery(alert, "FAILED", detail);
      } catch {
        // The SOS remains stored even when delivery-status synchronization fails.
      }
    } finally {
      setSmsBusy(false);
    }
  };

  const sendAlert = async () => {
    if (!profile || sendingRef.current || !requestGuardRef.current.claim()) {
      return;
    }

    sendingRef.current = true;
    setSending(true);
    setCountdownVisible(false);
    try {
      const location = await captureBestEffortLocation();
      const requestId = requestIdRef.current || createRequestId();
      requestIdRef.current = requestId;
      const { data } = await api.post("/alerts", {
        request_id: requestId,
        user_name: profile.full_name,
        user_phone: profile.phone_number,
        trusted_contacts: profile.trusted_contacts,
        latitude: location.latitude,
        longitude: location.longitude,
        map_url: location.map_url,
        location_source: location.location_source,
      });
      setSentAlert(data);
      setMessage("SOS created.");

      if (data.contact_delivery_status === "PREPARED") {
        await openSmsComposer(data);
      } else if (data.contact_delivery_status === "SENT") {
        setSmsStatusNote("The configured SMS provider confirmed all delivery requests.");
      } else {
        setSmsStatusNote(data.contact_delivery_error || "");
      }
    } catch (error: any) {
      requestGuardRef.current.release();
      setMessage(
        getErrorMessage(
          error,
          "Failed to create the SOS. Check the connection and retry; the same request ID will be reused."
        )
      );
    } finally {
      sendingRef.current = false;
      setSending(false);
      setCountdown(COUNTDOWN_SECONDS);
    }
  };

  const startCountdown = async () => {
    if (sendingRef.current) {
      return;
    }
    const loadedProfile = await loadProfile();
    if (!isProfileComplete(loadedProfile)) {
      setMessage("At least one valid trusted contact is required before sending SOS.");
      return;
    }

    setProfile(loadedProfile);
    setSentAlert(null);
    setSmsStatusNote("");
    setMessage("");
    setCountdown(COUNTDOWN_SECONDS);
    requestGuardRef.current.release();
    requestIdRef.current = requestIdRef.current || createRequestId();
    setCountdownVisible(true);
  };

  const cancelCountdown = () => {
    if (sendingRef.current) {
      return;
    }
    setCountdownVisible(false);
    setCountdown(COUNTDOWN_SECONDS);
    requestIdRef.current = null;
    requestGuardRef.current.release();
    setMessage("False alarm cancelled. No SOS alert was created.");
  };

  const closeResult = () => {
    setSentAlert(null);
    setSmsStatusNote("");
    setMessage("");
    requestIdRef.current = null;
    requestGuardRef.current.release();
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
      setSmsStatusNote("Could not copy the emergency message.");
    }
  };

  useEffect(() => {
    loadProfile().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!countdownVisible || sending) {
      return;
    }
    if (countdown <= 0) {
      sendAlert().catch(() => undefined);
      return;
    }
    const timer = setTimeout(() => {
      setCountdown((value) => Math.max(value - 1, 0));
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdownVisible, countdown, sending]);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader
          eyebrow="Emergency"
          title="SafeHer Manual SOS"
          subtitle="Manual SOS is active. Experimental gesture detection does not trigger alerts."
        />
        <View style={styles.card}>
          <Text style={styles.title}>Safety Readiness</Text>
          {loadingProfile ? <ActivityIndicator color={theme.primary} /> : null}
          <Text style={styles.text}>Profile: {profile?.full_name ? "Configured" : "Missing"}</Text>
          <Text style={styles.text}>Trusted contacts: {(profile?.trusted_contacts || []).length}</Text>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => loadProfile().catch(() => undefined)}
            accessibilityRole="button"
            accessibilityLabel="Refresh safety profile"
          >
            <Text style={styles.secondaryText}>Refresh Profile</Text>
          </Pressable>
        </View>

        <Pressable
          style={[styles.sosButton, sending && styles.disabledButton]}
          onPress={startCountdown}
          disabled={sending}
          accessibilityRole="button"
          accessibilityLabel="Start emergency SOS countdown"
        >
          <Text style={styles.sosButtonText}>{sending ? "Sending SOS..." : "Send SOS"}</Text>
        </Pressable>

        {message ? <Text style={styles.message}>{message}</Text> : null}
      </ScrollView>

      <Modal
        visible={countdownVisible}
        transparent
        animationType="fade"
        onRequestClose={cancelCountdown}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.countdownCard}>
            <Text style={styles.modalTitle}>Emergency Countdown</Text>
            <Text style={styles.modalText}>SOS will be created when the timer reaches zero.</Text>
            <Text style={styles.timer}>{countdown}s</Text>
            {sending ? <ActivityIndicator color={theme.danger} size="large" /> : null}
            <View style={styles.countdownActions}>
              <Pressable
                style={[styles.sendNowButton, sending && styles.disabledButton]}
                onPress={() => sendAlert().catch(() => undefined)}
                disabled={sending}
                accessibilityRole="button"
                accessibilityLabel="Send SOS now"
                hitSlop={8}
              >
                <Text style={styles.actionButtonText}>{sending ? "Sending SOS..." : "Send Now"}</Text>
              </Pressable>
              <Pressable
                style={[styles.cancelButton, sending && styles.disabledButton]}
                onPress={cancelCountdown}
                disabled={sending}
                accessibilityRole="button"
                accessibilityLabel="Cancel SOS countdown"
                hitSlop={8}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={Boolean(sentAlert)}
        transparent
        animationType="slide"
        onRequestClose={closeResult}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.resultCard}>
            <View style={styles.resultHeader}>
              <Text style={styles.modalTitle}>SOS Result</Text>
              <Pressable
                style={styles.closeButton}
                onPress={closeResult}
                accessibilityRole="button"
                accessibilityLabel="Close SOS result"
                hitSlop={10}
              >
                <Ionicons name="close" size={26} color={theme.text} />
              </Pressable>
            </View>

            <ScrollView
              style={styles.resultScroll}
              contentContainerStyle={styles.resultContent}
              showsVerticalScrollIndicator
            >
              <Text style={styles.modalText}>User: {sentAlert?.user_name}</Text>
              <Text style={styles.modalText}>Phone: {sentAlert?.user_phone}</Text>
              <Text style={styles.modalText}>Alert status: {sentAlert?.status}</Text>
              <Text style={styles.modalText}>
                Coordinates: {sentAlert?.latitude ?? "Unavailable"}, {sentAlert?.longitude ?? "Unavailable"}
              </Text>
              <Text style={styles.modalText}>
                Address: {sentAlert?.location_address || "Address unavailable; SOS creation was not blocked."}
              </Text>
              <Text style={styles.modalText}>Location source: {sentAlert?.location_source || "unavailable"}</Text>
              <Text style={styles.modalText}>
                Trusted contacts: {(sentAlert?.trusted_contacts || []).length}
              </Text>
              <Text style={styles.modalText}>
                Contact notification: {sentAlert?.contact_delivery_status || "NOT_ATTEMPTED"}
              </Text>
              {sentAlert?.contact_delivery_error ? (
                <Text style={styles.warning}>{sentAlert.contact_delivery_error}</Text>
              ) : null}

              <Text style={styles.previewTitle}>Individual SMS Status</Text>
              <Text style={styles.previewBody}>
                {(sentAlert?.contact_delivery_results || [])
                  .map(
                    (item) =>
                      `${item.name || "Contact"}: ${item.status}${item.error ? ` - ${item.error}` : ""}`
                  )
                  .join("\n") || "No delivery records are available."}
              </Text>

              <Text style={styles.previewTitle}>Suggested Nearest Police Station</Text>
              <Text style={styles.modalText}>
                {sentAlert?.nearest_police_station_name || "No station suggestion available"}
              </Text>
              {sentAlert?.nearest_police_station_address ? (
                <Text style={styles.modalText}>{sentAlert.nearest_police_station_address}</Text>
              ) : null}
              <Text style={styles.modalText}>
                Police delivery: {sentAlert?.police_delivery_status || "POLICE_CONTACT_NOT_AUTOMATED"}
              </Text>

              <Text style={styles.previewTitle}>Police Message Preview</Text>
              <Text style={styles.previewBody}>
                {sentAlert?.police_message_preview || "No police message preview available."}
              </Text>

              <Pressable
                style={styles.secondaryButton}
                disabled={!sentAlert?.map_url || sentAlert.map_url === "Location unavailable"}
                onPress={() => {
                  if (sentAlert?.map_url && sentAlert.map_url !== "Location unavailable") {
                    Linking.openURL(sentAlert.map_url).catch(() =>
                      setSmsStatusNote("Could not open the map link.")
                    );
                  }
                }}
                accessibilityRole="link"
                accessibilityLabel="Open SOS location in maps"
              >
                <Text style={styles.secondaryText}>Open Map Link</Text>
              </Pressable>

              {sentAlert?.contact_delivery_status !== "SENT" ? (
                <Pressable
                  style={[styles.secondaryButton, smsBusy && styles.disabledButton]}
                  onPress={() => sentAlert && openSmsComposer(sentAlert)}
                  disabled={smsBusy}
                  accessibilityRole="button"
                  accessibilityLabel="Open SMS composer for trusted contacts"
                >
                  <Text style={styles.secondaryText}>
                    {smsBusy ? "Opening SMS..." : "Open SMS Composer"}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                style={styles.secondaryButton}
                onPress={copyEmergencyMessage}
                accessibilityRole="button"
                accessibilityLabel="Copy emergency message"
              >
                <Text style={styles.secondaryText}>Copy Emergency Message</Text>
              </Pressable>
              {smsStatusNote ? <Text style={styles.warning}>{smsStatusNote}</Text> : null}
            </ScrollView>

            <Pressable
              style={styles.doneButton}
              onPress={closeResult}
              accessibilityRole="button"
              accessibilityLabel="Done and return home"
            >
              <Text style={styles.doneButtonText}>Done</Text>
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
      fontSize: 28,
      fontWeight: "900",
    },
    secondaryButton: {
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.cardAlt,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    secondaryText: {
      color: theme.text,
      fontWeight: "800",
      textAlign: "center",
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
      backgroundColor: "rgba(0,0,0,0.58)",
      justifyContent: "center",
      alignItems: "center",
      padding: spacing.md,
    },
    countdownCard: {
      width: "100%",
      maxWidth: 460,
      borderRadius: 18,
      backgroundColor: theme.surface,
      padding: spacing.xl,
      gap: spacing.md,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: "center",
    },
    modalTitle: {
      color: theme.text,
      fontSize: 22,
      fontWeight: "900",
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
    countdownActions: {
      width: "100%",
      gap: spacing.md,
    },
    sendNowButton: {
      minHeight: 56,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.danger,
    },
    cancelButton: {
      minHeight: 56,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.cardAlt,
      borderWidth: 1,
      borderColor: theme.border,
    },
    actionButtonText: {
      color: theme.buttonText,
      fontWeight: "900",
      fontSize: 17,
    },
    cancelButtonText: {
      color: theme.text,
      fontWeight: "900",
      fontSize: 17,
    },
    disabledButton: {
      opacity: 0.55,
    },
    resultCard: {
      width: "100%",
      maxWidth: 540,
      height: "88%",
      borderRadius: 18,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      overflow: "hidden",
    },
    resultHeader: {
      minHeight: 58,
      paddingHorizontal: spacing.lg,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    closeButton: {
      width: 48,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
    },
    resultScroll: {
      flex: 1,
    },
    resultContent: {
      padding: spacing.lg,
      gap: spacing.sm,
      paddingBottom: spacing.xl,
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
    warning: {
      color: theme.text,
      backgroundColor: theme.dangerSoft,
      borderRadius: 10,
      padding: spacing.sm,
      lineHeight: 19,
    },
    doneButton: {
      minHeight: 56,
      margin: spacing.md,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.primary,
    },
    doneButtonText: {
      color: theme.buttonText,
      fontWeight: "900",
      fontSize: 17,
    },
  });
