import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { AppButton, GlassCard, MetricCard, ScreenHeader, StatusPill } from "../components/ui";
import { fetchLatestGlobalModel, simulateFederatedRound } from "../services/federatedService";
import { startBackgroundLocationTracking, stopBackgroundLocationTracking } from "../services/backgroundLocation";
import { radii, spacing } from "../design/tokens";
import { AppTheme } from "../theme/colors";
import { useTheme } from "../theme/useTheme";
import { getErrorMessage } from "../utils/errorMessage";
const demoMetrics = require("../../assets/models/gesture_demo_metrics.json");

const gesturePatterns = [
  { label: "Rapid zig-zag swipe", detail: "Best for one-handed distress activation." },
  { label: "Tight panic motion", detail: "Short repeated movement with direction changes." },
  { label: "Long press + slash", detail: "Clear intent pattern for demo flows." },
];

export function GestureSetupScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [message, setMessage] = React.useState("");
  const [modelSummary, setModelSummary] = React.useState<any>({ round_id: 0, metrics: {}, aggregated_weights: [] });

  const loadModel = React.useCallback(async () => {
    try {
      const latest = await fetchLatestGlobalModel();
      setModelSummary(latest);
    } catch (error: any) {
      setMessage(getErrorMessage(error, "Could not load the global model."));
    }
  }, []);

  React.useEffect(() => {
    loadModel();
  }, [loadModel]);

  const enableTracking = async () => {
    try {
      await startBackgroundLocationTracking();
      setMessage("Background safety tracking enabled.");
    } catch (error: any) {
      setMessage(getErrorMessage(error, "Could not enable background tracking."));
    }
  };

  const disableTracking = async () => {
    try {
      await stopBackgroundLocationTracking();
      setMessage("Background safety tracking disabled.");
    } catch (error: any) {
      setMessage(getErrorMessage(error, "Could not disable background tracking."));
    }
  };

  const runLocalFederatedTraining = async () => {
    try {
      const result = await simulateFederatedRound();
      setModelSummary(result.global_model);
      setMessage(result.message);
    } catch (error: any) {
      setMessage(getErrorMessage(error, "Could not submit the local model update."));
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <ScreenHeader
        eyebrow="SOS intelligence"
        title="Gesture + AI"
        subtitle="Tune the distress gesture experience and preview privacy-preserving model updates."
        right={<StatusPill label="TFLite ready" />}
      />

      <GlassCard elevated style={styles.radarCard}>
        <View style={styles.radarOuter}>
          <View style={styles.radarMiddle}>
            <View style={styles.radarInner}>
              <Ionicons name="radio" size={34} color={theme.buttonText} />
            </View>
          </View>
        </View>
        <Text style={styles.radarTitle}>Emergency gesture monitor</Text>
        <Text style={styles.text}>Manual SOS is active from the home screen. Gesture insights stay available for demo analytics only.</Text>
      </GlassCard>

      <View style={styles.patternGrid}>
        {gesturePatterns.map((pattern, index) => (
          <GlassCard key={pattern.label} style={styles.patternCard}>
            <Text style={styles.patternNumber}>0{index + 1}</Text>
            <Text style={styles.patternTitle}>{pattern.label}</Text>
            <Text style={styles.text}>{pattern.detail}</Text>
          </GlassCard>
        ))}
      </View>

      <View style={styles.metricsRow}>
        <MetricCard label="Local accuracy" value={demoMetrics?.accuracy ?? "n/a"} tone="success" />
        <MetricCard label="Samples" value={demoMetrics?.sample_count ?? "n/a"} />
      </View>
      <View style={styles.metricsRow}>
        <MetricCard label="Global round" value={modelSummary?.round_id ?? 0} />
        <MetricCard label="Global loss" value={modelSummary?.metrics?.loss ?? "n/a"} tone="warning" />
      </View>

      <GlassCard style={styles.modelCard}>
        <Text style={styles.sectionTitle}>Federated model controls</Text>
        <Text style={styles.text}>Accuracy: {modelSummary?.metrics?.accuracy ?? "n/a"}</Text>
        <Text style={styles.text}>Privacy mode: local weights are simulated before aggregation.</Text>
        <AppButton title="Simulate Local Training Update" icon="cloud-upload" onPress={runLocalFederatedTraining} />
        <AppButton title="Refresh Global Model" icon="refresh" variant="secondary" onPress={loadModel} />
        <View style={styles.buttonRow}>
          <AppButton title="Track On" icon="navigate" variant="success" onPress={enableTracking} style={styles.halfButton} />
          <AppButton title="Track Off" icon="pause" variant="secondary" onPress={disableTracking} style={styles.halfButton} />
        </View>
      </GlassCard>

      {message ? <Text style={styles.message}>{message}</Text> : null}
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
    radarCard: {
      alignItems: "center",
      gap: spacing.md,
    },
    radarOuter: {
      width: 150,
      height: 150,
      borderRadius: 75,
      backgroundColor: colors.primarySoft,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
    radarMiddle: {
      width: 104,
      height: 104,
      borderRadius: 52,
      backgroundColor: colors.dangerSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    radarInner: {
      width: 68,
      height: 68,
      borderRadius: 34,
      backgroundColor: colors.danger,
      alignItems: "center",
      justifyContent: "center",
    },
    radarTitle: {
      color: colors.text,
      fontSize: 19,
      fontWeight: "900",
    },
    text: {
      color: colors.subtext,
      lineHeight: 20,
    },
    patternGrid: {
      gap: spacing.md,
    },
    patternCard: {
      gap: spacing.sm,
    },
    patternNumber: {
      color: colors.accent,
      fontWeight: "900",
    },
    patternTitle: {
      color: colors.text,
      fontSize: 16,
      fontWeight: "900",
    },
    metricsRow: {
      flexDirection: "row",
      gap: spacing.md,
    },
    modelCard: {
      gap: spacing.md,
    },
    sectionTitle: {
      color: colors.text,
      fontWeight: "900",
      fontSize: 18,
    },
    buttonRow: {
      flexDirection: "row",
      gap: spacing.md,
    },
    halfButton: {
      flex: 1,
    },
    message: {
      color: colors.subtext,
      lineHeight: 20,
      backgroundColor: colors.cardAlt,
      borderRadius: radii.md,
      padding: spacing.md,
    },
  });
