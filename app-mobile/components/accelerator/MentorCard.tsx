import React from "react";
import { View, Text, StyleSheet } from "react-native";

interface Props {
  name?: string;
  role?: string;
}

export default function MentorCard({ name, role }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.name}>{name ?? "Mentor Name"}</Text>
      <Text style={styles.role}>{role ?? "Industry Expert"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 12,
  },
  name: {
    fontSize: 14,
    fontWeight: "600",
  },
  role: {
    fontSize: 12,
    color: "#6b7280",
  },
});
