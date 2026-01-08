import React from "react";
import { View, Text, StyleSheet } from "react-native";

export default function TierProgressBar() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Tier Progress (MVP)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 12,
    borderRadius: 6,
    backgroundColor: "#e5e7eb",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  text: {
    fontSize: 10,
    color: "#6b7280",
  },
});
