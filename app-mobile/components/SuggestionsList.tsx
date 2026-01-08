import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export interface SuggestionItem {
  id: string;
  title: string;
  description?: string;
}

interface SuggestionsListComponentProps {
  suggestions?: SuggestionItem[];
}

export function SuggestionsListComponent({
  suggestions = [],
}: SuggestionsListComponentProps) {
  if (!suggestions.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No suggestions available</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {suggestions.map((item) => (
        <View key={item.id} style={styles.item}>
          <Text style={styles.title}>{item.title}</Text>
          {item.description ? (
            <Text style={styles.description}>{item.description}</Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
    marginBottom: 16,
  },
  item: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 12,
  },
  title: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  description: {
    marginTop: 4,
    color: '#9ca3af',
    fontSize: 13,
  },
  empty: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#0b0b0b',
  },
  emptyText: {
    color: '#6b7280',
    fontSize: 13,
  },
});
