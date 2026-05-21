import React, { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { api } from "../api/client";
import { ScreenHeader } from "../components/ui";
import { spacing } from "../design/tokens";
import { AppTheme } from "../theme/colors";
import { useTheme } from "../theme/useTheme";
import { getErrorMessage } from "../utils/errorMessage";

type TrustedContact = {
  name: string;
  phone_number: string;
  relation: string;
};

type ProfileState = {
  full_name: string;
  age: string;
  phone_number: string;
  home_locality: string;
  city: string;
  trusted_contacts: TrustedContact[];
};

const emptyContact: TrustedContact = {
  name: "",
  phone_number: "",
  relation: "",
};

export function SettingsScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [profile, setProfile] = useState<ProfileState>({
    full_name: "",
    age: "",
    phone_number: "",
    home_locality: "",
    city: "",
    trusted_contacts: [{ ...emptyContact }],
  });
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const loadProfile = async () => {
    try {
      const { data } = await api.get("/profile/me");
      setProfile({
        full_name: data.full_name || "",
        age: String(data.age || ""),
        phone_number: data.phone_number || "",
        home_locality: data.home_locality || "",
        city: data.city || "",
        trusted_contacts: data.trusted_contacts?.length ? data.trusted_contacts : [{ ...emptyContact }],
      });
      setMessage("");
    } catch {
      setMessage("Fill and save your safety profile.");
    }
  };

  useEffect(() => {
    loadProfile().catch(() => undefined);
  }, []);

  const updateField = (key: keyof ProfileState, value: string) => {
    setProfile((current) => ({ ...current, [key]: value }));
  };

  const updateContact = (index: number, key: keyof TrustedContact, value: string) => {
    setProfile((current) => {
      const next = [...current.trusted_contacts];
      next[index] = { ...next[index], [key]: value };
      return { ...current, trusted_contacts: next };
    });
  };

  const addContact = () => {
    setProfile((current) => ({
      ...current,
      trusted_contacts: [...current.trusted_contacts, { ...emptyContact }],
    }));
  };

  const removeContact = (index: number) => {
    setProfile((current) => {
      const next = current.trusted_contacts.filter((_, contactIndex) => contactIndex !== index);
      return {
        ...current,
        trusted_contacts: next.length ? next : [{ ...emptyContact }],
      };
    });
  };

  const saveProfile = async () => {
    const fullName = profile.full_name.trim();
    const phone = profile.phone_number.trim();
    const age = Number(profile.age);
    const trustedContacts = profile.trusted_contacts
      .map((item) => ({
        name: item.name.trim(),
        phone_number: item.phone_number.trim(),
        relation: item.relation.trim(),
      }))
      .filter((item) => item.name && item.phone_number && item.relation);

    if (!fullName) {
      setMessage("Name cannot be empty.");
      return;
    }
    if (!phone) {
      setMessage("Phone number cannot be empty.");
      return;
    }
    if (!Number.isFinite(age) || age <= 0) {
      setMessage("Please enter a valid age.");
      return;
    }
    if (!profile.home_locality.trim() || !profile.city.trim()) {
      setMessage("Home locality and city are required.");
      return;
    }
    if (trustedContacts.length < 1) {
      setMessage("At least one trusted contact is required before SOS can be sent.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        full_name: fullName,
        age,
        phone_number: phone,
        home_locality: profile.home_locality.trim(),
        city: profile.city.trim(),
        trusted_contacts: trustedContacts,
      };
      const { data } = await api.put("/profile/me", payload);
      setProfile({
        full_name: data.full_name || "",
        age: String(data.age || ""),
        phone_number: data.phone_number || "",
        home_locality: data.home_locality || "",
        city: data.city || "",
        trusted_contacts: data.trusted_contacts?.length ? data.trusted_contacts : [{ ...emptyContact }],
      });
      setMessage("Safety profile saved.");
    } catch (error: any) {
      setMessage(getErrorMessage(error, "Could not save profile."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <ScreenHeader
        eyebrow="Profile"
        title="Safety Profile"
        subtitle="Complete this profile before using manual SOS."
      />

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Basic Details</Text>
        <TextInput
          style={styles.input}
          placeholder="Full name"
          placeholderTextColor={theme.textMuted}
          value={profile.full_name}
          onChangeText={(value) => updateField("full_name", value)}
        />
        <TextInput
          style={styles.input}
          placeholder="Age"
          placeholderTextColor={theme.textMuted}
          value={profile.age}
          keyboardType="number-pad"
          onChangeText={(value) => updateField("age", value)}
        />
        <TextInput
          style={styles.input}
          placeholder="Phone number"
          placeholderTextColor={theme.textMuted}
          value={profile.phone_number}
          keyboardType="phone-pad"
          onChangeText={(value) => updateField("phone_number", value)}
        />
        <TextInput
          style={styles.input}
          placeholder="Home locality"
          placeholderTextColor={theme.textMuted}
          value={profile.home_locality}
          onChangeText={(value) => updateField("home_locality", value)}
        />
        <TextInput
          style={styles.input}
          placeholder="City"
          placeholderTextColor={theme.textMuted}
          value={profile.city}
          onChangeText={(value) => updateField("city", value)}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Trusted Emergency Contacts</Text>
        {profile.trusted_contacts.map((contact, index) => (
          <View key={`trusted-contact-${index}`} style={styles.contactCard}>
            <TextInput
              style={styles.input}
              placeholder="Name"
              placeholderTextColor={theme.textMuted}
              value={contact.name}
              onChangeText={(value) => updateContact(index, "name", value)}
            />
            <TextInput
              style={styles.input}
              placeholder="Phone number"
              placeholderTextColor={theme.textMuted}
              keyboardType="phone-pad"
              value={contact.phone_number}
              onChangeText={(value) => updateContact(index, "phone_number", value)}
            />
            <TextInput
              style={styles.input}
              placeholder="Relation"
              placeholderTextColor={theme.textMuted}
              value={contact.relation}
              onChangeText={(value) => updateContact(index, "relation", value)}
            />
            <Pressable style={styles.removeButton} onPress={() => removeContact(index)}>
              <Text style={styles.removeText}>Remove Contact</Text>
            </Pressable>
          </View>
        ))}
        <Pressable style={styles.secondaryButton} onPress={addContact}>
          <Text style={styles.secondaryText}>Add Another Contact</Text>
        </Pressable>
      </View>

      <Pressable style={styles.primaryButton} onPress={saveProfile} disabled={saving}>
        <Text style={styles.primaryText}>{saving ? "Saving..." : "Save Safety Profile"}</Text>
      </Pressable>
      <Pressable style={styles.secondaryButton} onPress={() => loadProfile().catch(() => undefined)}>
        <Text style={styles.secondaryText}>Reload Saved Profile</Text>
      </Pressable>

      {message ? <Text style={styles.message}>{message}</Text> : null}
    </ScrollView>
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
      gap: spacing.lg,
      paddingBottom: 120,
    },
    card: {
      backgroundColor: theme.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    sectionTitle: {
      color: theme.text,
      fontWeight: "900",
      fontSize: 17,
      marginBottom: spacing.xs,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.inputBackground,
      borderRadius: 12,
      color: theme.text,
      minHeight: 48,
      paddingHorizontal: spacing.md,
    },
    contactCard: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      padding: spacing.md,
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    primaryButton: {
      minHeight: 50,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.primary,
    },
    primaryText: {
      color: theme.buttonText,
      fontWeight: "900",
      fontSize: 16,
    },
    secondaryButton: {
      minHeight: 44,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.cardAlt,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: spacing.md,
    },
    secondaryText: {
      color: theme.text,
      fontWeight: "800",
    },
    removeButton: {
      alignSelf: "flex-start",
      borderRadius: 10,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      backgroundColor: theme.dangerSoft,
    },
    removeText: {
      color: theme.danger,
      fontWeight: "800",
    },
    message: {
      color: theme.text,
      lineHeight: 20,
      backgroundColor: theme.cardAlt,
      borderRadius: 12,
      padding: spacing.md,
    },
  });
