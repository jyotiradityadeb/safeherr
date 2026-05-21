import React, { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { AppButton, GlassCard, StatusPill } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { radii, spacing, typography } from "../design/tokens";
import { AppTheme } from "../theme/colors";
import { useTheme } from "../theme/useTheme";
import { getErrorMessage } from "../utils/errorMessage";

export function AuthScreen() {
  const { login, signup } = useAuth();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [isSignup, setIsSignup] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("demo@safeher.app");
  const [password, setPassword] = useState("password123");
  const [phoneNumber, setPhoneNumber] = useState("+919999999999");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setLoading(true);
    setError("");
    try {
      if (isSignup) {
        await signup(fullName || "SafeHer User", email, password, phoneNumber);
        return;
      }
      await login(email, password);
    } catch (err: any) {
      setError(getErrorMessage(err, "Authentication failed. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.brandMark}>
          <Ionicons name="shield-checkmark" size={36} color={theme.buttonText} />
        </View>
        <Text style={styles.title}>SafeHer</Text>
        <Text style={styles.subtitle}>
          AI-assisted emergency protection with private gesture detection and trusted-circle response.
        </Text>

        <View style={styles.signalRow}>
          <StatusPill label="On-device AI" />
          <StatusPill label="Live GPS" tone="success" />
          <StatusPill label="SOS ready" tone="danger" />
        </View>

        <GlassCard elevated style={styles.formCard}>
          <View style={styles.modeSwitch}>
            <Pressable
              style={[styles.modeOption, !isSignup && styles.modeActive]}
              onPress={() => setIsSignup(false)}
            >
              <Text style={[styles.modeText, !isSignup && styles.modeTextActive]}>Login</Text>
            </Pressable>
            <Pressable
              style={[styles.modeOption, isSignup && styles.modeActive]}
              onPress={() => setIsSignup(true)}
            >
              <Text style={[styles.modeText, isSignup && styles.modeTextActive]}>Signup</Text>
            </Pressable>
          </View>

          {isSignup ? (
            <TextInput
              style={styles.input}
              placeholder="Full name"
              placeholderTextColor={theme.textMuted}
              value={fullName}
              onChangeText={setFullName}
            />
          ) : null}
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={theme.textMuted}
            value={email}
            autoCapitalize="none"
            keyboardType="email-address"
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={theme.textMuted}
            value={password}
            secureTextEntry
            onChangeText={setPassword}
          />
          {isSignup ? (
            <TextInput
              style={styles.input}
              placeholder="Phone number"
              placeholderTextColor={theme.textMuted}
              value={phoneNumber}
              keyboardType="phone-pad"
              onChangeText={setPhoneNumber}
            />
          ) : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <AppButton
            title={isSignup ? "Create Protected Account" : "Enter SafeHer"}
            icon={isSignup ? "person-add" : "lock-open"}
            loading={loading}
            onPress={handleSubmit}
          />
          {!isSignup ? (
            <View style={styles.demoCard}>
              <Ionicons name="sparkles" size={18} color={theme.accent} />
              <Text style={styles.demoText}>Demo: demo@safeher.app / password123</Text>
            </View>
          ) : null}
        </GlassCard>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: AppTheme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      flexGrow: 1,
      justifyContent: "center",
      padding: spacing.xxl,
      paddingBottom: 40,
    },
    brandMark: {
      width: 74,
      height: 74,
      borderRadius: 24,
      backgroundColor: colors.danger,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: spacing.lg,
      shadowColor: colors.danger,
      shadowOpacity: 0.35,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
      elevation: 8,
    },
    title: {
      color: colors.text,
      fontSize: 42,
      fontWeight: "900",
      letterSpacing: 0,
    },
    subtitle: {
      color: colors.subtext,
      fontSize: typography.body,
      lineHeight: 23,
      marginTop: spacing.sm,
      maxWidth: 340,
    },
    signalRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
      marginVertical: spacing.xl,
    },
    formCard: {
      gap: spacing.md,
    },
    modeSwitch: {
      flexDirection: "row",
      backgroundColor: colors.cardAlt,
      borderRadius: radii.md,
      padding: spacing.xs,
      marginBottom: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
    },
    modeOption: {
      flex: 1,
      minHeight: 42,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radii.sm,
    },
    modeActive: {
      backgroundColor: colors.primary,
    },
    modeText: {
      color: colors.textMuted,
      fontWeight: "800",
    },
    modeTextActive: {
      color: colors.buttonText,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      minHeight: 54,
      paddingHorizontal: spacing.lg,
      color: colors.text,
      backgroundColor: colors.inputBackground,
    },
    errorText: {
      color: colors.danger,
      lineHeight: 20,
    },
    demoCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: colors.cardAlt,
      borderRadius: radii.md,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    demoText: {
      color: colors.subtext,
      flex: 1,
      fontWeight: "700",
      fontSize: 12,
    },
  });
