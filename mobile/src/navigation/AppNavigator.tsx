import React from "react";
import { ActivityIndicator, View } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "../context/AuthContext";
import { AlertHistoryScreen } from "../screens/AlertHistoryScreen";
import { AuthScreen } from "../screens/AuthScreen";
import { ContactsScreen } from "../screens/ContactsScreen";
import { GestureSetupScreen } from "../screens/GestureSetupScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { LiveStatusScreen } from "../screens/LiveStatusScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { useTheme } from "../theme/useTheme";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MainTabs() {
  const { theme } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopColor: theme.border,
          borderTopWidth: 1,
          height: 74,
          paddingBottom: 10,
          paddingTop: 8,
          marginHorizontal: 14,
          marginBottom: 12,
          borderRadius: 24,
          position: "absolute",
          shadowColor: theme.shadow,
          shadowOpacity: 0.22,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
          elevation: 10,
        },
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarLabelStyle: {
          fontWeight: "800",
          fontSize: 11,
        },
        sceneStyle: {
          backgroundColor: theme.background,
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="shield-checkmark" color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Contacts"
        component={ContactsScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="people" color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="SOS"
        component={GestureSetupScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="radio" color={color} size={size + 3} />,
        }}
      />
      <Tab.Screen
        name="Track"
        component={LiveStatusScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="navigate" color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Alerts"
        component={AlertHistoryScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="time" color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" color={color} size={size} />,
        }}
      />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  const { token, loading } = useAuth();
  const { theme } = useTheme();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.background },
      }}
    >
      {token ? <Stack.Screen name="Main" component={MainTabs} /> : <Stack.Screen name="Auth" component={AuthScreen} />}
    </Stack.Navigator>
  );
}
