import React from "react";
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { AppTheme } from "../theme/colors";
import { useTheme } from "../theme/useTheme";
import { radii, shadows, spacing, typography } from "../design/tokens";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

type CardProps = React.PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  elevated?: boolean;
}>;

export function GlassCard({ children, style, elevated = false }: CardProps) {
  const { theme } = useTheme();
  return (
    <View style={[createStyles(theme).glassCard, elevated && createStyles(theme).elevated, style]}>
      {children}
    </View>
  );
}

type HeaderProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
};

export function ScreenHeader({ eyebrow, title, subtitle, right }: HeaderProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  return (
    <View style={styles.headerRow}>
      <View style={styles.headerCopy}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.screenTitle}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

type AppButtonVariant = "primary" | "secondary" | "danger" | "success" | "ghost";

type AppButtonProps = Omit<PressableProps, "style"> & {
  title: string;
  icon?: IconName;
  variant?: AppButtonVariant;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export function AppButton({
  title,
  icon,
  variant = "primary",
  loading = false,
  disabled,
  style,
  textStyle,
  ...props
}: AppButtonProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const filled = variant !== "secondary" && variant !== "ghost";
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      style={[
        styles.button,
        styles[`button_${variant}`],
        (disabled || loading) && styles.disabled,
        style,
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={filled ? theme.buttonText : theme.primary} />
      ) : (
        <>
          {icon ? (
            <Ionicons
              name={icon}
              size={18}
              color={filled ? theme.buttonText : theme.text}
              style={styles.buttonIcon}
            />
          ) : null}
          <Text style={[styles.buttonText, filled && styles.buttonTextFilled, textStyle]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

type StatusPillProps = {
  label: string;
  tone?: "success" | "danger" | "warning" | "primary";
};

export function StatusPill({ label, tone = "primary" }: StatusPillProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  return (
    <View style={[styles.pill, styles[`pill_${tone}`]]}>
      <Text style={styles.pillText}>{label}</Text>
    </View>
  );
}

export function MetricCard({ label, value, tone = "primary" }: { label: string; value: string | number; tone?: StatusPillProps["tone"] }) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  return (
    <GlassCard style={styles.metricCard}>
      <View style={[styles.metricDot, styles[`dot_${tone}`]]} />
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </GlassCard>
  );
}

const createStyles = (colors: AppTheme) =>
  StyleSheet.create({
    glassCard: {
      backgroundColor: colors.glass,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      shadowColor: colors.shadow,
      ...shadows.card,
    },
    elevated: {
      borderColor: colors.borderStrong,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: spacing.md,
      marginBottom: spacing.lg,
    },
    headerCopy: {
      flex: 1,
    },
    eyebrow: {
      color: colors.accent,
      fontSize: typography.small,
      fontWeight: "900",
      textTransform: "uppercase",
      marginBottom: spacing.xs,
    },
    screenTitle: {
      color: colors.text,
      fontSize: typography.title,
      fontWeight: "900",
    },
    subtitle: {
      color: colors.subtext,
      marginTop: spacing.sm,
      lineHeight: 21,
    },
    button: {
      minHeight: 52,
      borderRadius: radii.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      borderWidth: 1,
      gap: spacing.sm,
    },
    button_primary: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    button_secondary: {
      backgroundColor: colors.cardAlt,
      borderColor: colors.border,
    },
    button_danger: {
      backgroundColor: colors.danger,
      borderColor: colors.danger,
      shadowColor: colors.danger,
      ...shadows.floating,
    },
    button_success: {
      backgroundColor: colors.success,
      borderColor: colors.success,
    },
    button_ghost: {
      backgroundColor: "transparent",
      borderColor: colors.border,
    },
    disabled: {
      opacity: 0.58,
    },
    buttonIcon: {
      marginTop: 1,
    },
    buttonText: {
      color: colors.text,
      fontWeight: "800",
      textAlign: "center",
    },
    buttonTextFilled: {
      color: colors.buttonText,
    },
    pill: {
      borderRadius: radii.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      alignSelf: "flex-start",
    },
    pill_success: {
      backgroundColor: colors.successSoft,
    },
    pill_danger: {
      backgroundColor: colors.dangerSoft,
    },
    pill_warning: {
      backgroundColor: colors.warningSoft,
    },
    pill_primary: {
      backgroundColor: colors.primarySoft,
    },
    pillText: {
      color: colors.text,
      fontSize: typography.small,
      fontWeight: "900",
    },
    metricCard: {
      flex: 1,
      minWidth: 132,
    },
    metricDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      marginBottom: spacing.md,
    },
    dot_success: {
      backgroundColor: colors.success,
    },
    dot_danger: {
      backgroundColor: colors.danger,
    },
    dot_warning: {
      backgroundColor: colors.warning,
    },
    dot_primary: {
      backgroundColor: colors.primary,
    },
    metricValue: {
      color: colors.text,
      fontSize: 28,
      fontWeight: "900",
    },
    metricLabel: {
      color: colors.subtext,
      marginTop: spacing.xs,
      fontWeight: "700",
    },
  });
