export type AppTheme = {
  background: string;
  backgroundElevated: string;
  surface: string;
  card: string;
  cardAlt: string;
  glass: string;
  text: string;
  textMuted: string;
  subtext: string;
  primary: string;
  primarySoft: string;
  accent: string;
  danger: string;
  dangerSoft: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  border: string;
  borderStrong: string;
  inputBackground: string;
  buttonText: string;
  shadow: string;
  modalOverlay: string;
  emergencySurface: string;
  emergencyText: string;
  emergencyMuted: string;
  healthGreenBackground: string;
  healthGreenBorder: string;
  healthYellowBackground: string;
  healthYellowBorder: string;
  healthRedBackground: string;
  healthRedBorder: string;
};

export const lightTheme: AppTheme = {
  background: "#f8fafc",
  backgroundElevated: "#eef2ff",
  surface: "#ffffff",
  card: "#ffffff",
  cardAlt: "#f1f5f9",
  glass: "rgba(255, 255, 255, 0.78)",
  text: "#101828",
  textMuted: "#667085",
  subtext: "#667085",
  primary: "#7c3aed",
  primarySoft: "#ede9fe",
  accent: "#06b6d4",
  danger: "#ef233c",
  dangerSoft: "#ffe4e8",
  success: "#059669",
  successSoft: "#d1fae5",
  warning: "#d97706",
  warningSoft: "#fef3c7",
  border: "#e2e8f0",
  borderStrong: "#cbd5e1",
  inputBackground: "#ffffff",
  buttonText: "#ffffff",
  shadow: "rgba(15, 23, 42, 0.16)",
  modalOverlay: "rgba(15, 23, 42, 0.48)",
  emergencySurface: "#ffe4e8",
  emergencyText: "#7f1d1d",
  emergencyMuted: "#991b1b",
  healthGreenBackground: "#dcfce7",
  healthGreenBorder: "#22c55e",
  healthYellowBackground: "#fef3c7",
  healthYellowBorder: "#f59e0b",
  healthRedBackground: "#fee2e2",
  healthRedBorder: "#ef4444",
};

export const darkTheme: AppTheme = {
  background: "#070a12",
  backgroundElevated: "#101624",
  surface: "#101624",
  card: "#111827",
  cardAlt: "#162033",
  glass: "rgba(17, 24, 39, 0.78)",
  text: "#f8fafc",
  textMuted: "#98a2b3",
  subtext: "#cbd5e1",
  primary: "#a78bfa",
  primarySoft: "#2e235d",
  accent: "#22d3ee",
  danger: "#ff4d5e",
  dangerSoft: "#451a23",
  success: "#34d399",
  successSoft: "#123b2a",
  warning: "#fbbf24",
  warningSoft: "#3f2f12",
  border: "#273244",
  borderStrong: "#475569",
  inputBackground: "#0f172a",
  buttonText: "#ffffff",
  shadow: "rgba(0, 0, 0, 0.42)",
  modalOverlay: "rgba(0, 0, 0, 0.64)",
  emergencySurface: "#451a23",
  emergencyText: "#fee2e2",
  emergencyMuted: "#fecaca",
  healthGreenBackground: "#14532d",
  healthGreenBorder: "#22c55e",
  healthYellowBackground: "#78350f",
  healthYellowBorder: "#f59e0b",
  healthRedBackground: "#7f1d1d",
  healthRedBorder: "#ef4444",
};

export const colors = darkTheme;
