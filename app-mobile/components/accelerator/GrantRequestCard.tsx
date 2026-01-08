import React from "react";
import { View, Text, StyleSheet } from "react-native";

interface Props {
  title?: string;
  status?: string;
}

export default function GrantRequestCard({ title, status }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title ?? "Grant Request"}</Text>
      <Text style={styles.status}>{status ?? "Pending"}</Text>
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
  title: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  status: {
    fontSize: 12,
    color: "#6b7280",
  },
});
