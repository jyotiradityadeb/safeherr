import React, { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { api } from "../api/client";
import { AppButton, GlassCard, ScreenHeader, StatusPill } from "../components/ui";
import { radii, spacing } from "../design/tokens";
import { AppTheme } from "../theme/colors";
import { useTheme } from "../theme/useTheme";
import { getErrorMessage } from "../utils/errorMessage";

type Contact = {
  id: string;
  name: string;
  phone_number: string;
  relationship: string;
  channel: string;
};

export function ContactsScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [relationship, setRelationship] = useState("");
  const [message, setMessage] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);

  const loadContacts = async () => {
    try {
      const { data } = await api.get("/contacts");
      setContacts(data);
      setMessage("");
    } catch (error: any) {
      setMessage(getErrorMessage(error, "Could not load contacts."));
    }
  };

  useEffect(() => {
    loadContacts();
  }, []);

  const addContact = async () => {
    if (!name.trim() || !phone.trim() || !relationship.trim()) {
      setMessage("Fill in name, phone, and relationship before adding a contact.");
      return;
    }

    try {
      await api.post("/contacts", {
        name: name.trim(),
        phone_number: phone.trim(),
        relationship: relationship.trim(),
        channel: "sms",
      });
      setName("");
      setPhone("");
      setRelationship("");
      setMessage("Trusted contact added.");
      loadContacts();
    } catch (error: any) {
      setMessage(getErrorMessage(error, "Could not add contact."));
    }
  };

  const removeContact = async (contact: Contact) => {
    try {
      setRemovingId(contact.id);
      await api.delete(`/contacts/${contact.id}`);
      setMessage(`${contact.name} removed from trusted contacts.`);
      await loadContacts();
    } catch (error: any) {
      setMessage(getErrorMessage(error, "Could not remove contact."));
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        eyebrow="Trusted circle"
        title="Emergency Contacts"
        subtitle="People who should receive your SOS message and live safety updates."
        right={<StatusPill label={`${contacts.length} synced`} tone="success" />}
      />

      <GlassCard style={styles.formCard}>
        <TextInput style={styles.input} placeholder="Name" placeholderTextColor={theme.textMuted} value={name} onChangeText={setName} />
        <TextInput style={styles.input} placeholder="Phone" placeholderTextColor={theme.textMuted} value={phone} keyboardType="phone-pad" onChangeText={setPhone} />
        <TextInput style={styles.input} placeholder="Relationship" placeholderTextColor={theme.textMuted} value={relationship} onChangeText={setRelationship} />
        <View style={styles.deliveryRow}>
          <Ionicons name="chatbubble-ellipses" size={18} color={theme.accent} />
          <Text style={styles.deliveryText}>Delivery mode: SMS draft and backend alert log</Text>
        </View>
        <AppButton title="Add Trusted Contact" icon="person-add" onPress={addContact} />
        <AppButton title="Refresh Contacts" icon="refresh" variant="secondary" onPress={loadContacts} />
      </GlassCard>

      {message ? <Text style={styles.message}>{message}</Text> : null}
      <FlatList
        data={contacts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <GlassCard style={styles.contactCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.name.slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={styles.contactBody}>
              <Text style={styles.contactName}>{item.name}</Text>
              <Text style={styles.contactMeta}>{item.relationship} | {item.phone_number}</Text>
              <Text style={styles.contactMeta}>Channel: {item.channel}</Text>
            </View>
            <Pressable
              style={[styles.removeButton, removingId === item.id && styles.removeDisabled]}
              onPress={() => removeContact(item)}
              disabled={removingId === item.id}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${item.name}`}
            >
              <Ionicons name="trash" size={18} color={theme.buttonText} />
            </Pressable>
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
    formCard: {
      gap: spacing.md,
    },
    input: {
      backgroundColor: colors.inputBackground,
      color: colors.text,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: radii.md,
      minHeight: 52,
      paddingHorizontal: spacing.lg,
    },
    deliveryRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    deliveryText: {
      color: colors.subtext,
      flex: 1,
      lineHeight: 20,
    },
    message: {
      color: colors.subtext,
      marginVertical: spacing.md,
      lineHeight: 20,
    },
    listContent: {
      gap: spacing.md,
      paddingTop: spacing.lg,
      paddingBottom: 120,
    },
    contactCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
    },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primarySoft,
    },
    avatarText: {
      color: colors.text,
      fontWeight: "900",
      fontSize: 18,
    },
    contactBody: {
      flex: 1,
    },
    contactName: {
      color: colors.text,
      fontWeight: "900",
      fontSize: 16,
    },
    contactMeta: {
      color: colors.subtext,
      marginTop: 3,
      fontSize: 13,
    },
    removeButton: {
      width: 42,
      height: 42,
      borderRadius: 14,
      backgroundColor: colors.danger,
      alignItems: "center",
      justifyContent: "center",
    },
    removeDisabled: {
      opacity: 0.55,
    },
  });
