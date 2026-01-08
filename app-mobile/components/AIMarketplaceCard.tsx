import React from "react";
import { View, Text, StyleSheet } from "react-native";

interface Props {
  title?: string;
  price?: number;
  description?: string;
}

export function AIMarketplaceCard({ title, price, description }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title ?? "AI Companion"}</Text>
      <Text style={styles.desc}>
        {description ?? "AI companion preview (MVP)"}
      </Text>
      <Text style={styles.price}>
        {price != null ? `${price} tokens` : "—"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 14,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 6,
  },
  desc: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 8,
  },
  price: {
    fontSize: 12,
    fontWeight: "500",
    color: "#111827",
  },
});
