/**
 * Empty State Component
 * Phase 27: Friendly empty states in Polish for all modules
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';

interface EmptyStateProps {
  emoji: string;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  emoji,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>{emoji}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {actionLabel && onAction && (
        <TouchableOpacity style={styles.actionButton} onPress={onAction}>
          <Text style={styles.actionButtonText}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// Predefined empty states in Polish
export const EmptyStates = {
  noFeed: {
    emoji: '📋',
    title: 'Brak profili w feedzie',
    description: 'Wróć później lub dostosuj swoje preferencje, aby zobaczyć więcej profili.',
  },
  noMatches: {
    emoji: '💬',
    title: 'Brak dopasowań',
    description: 'Zacznij przesuwać profile, aby znaleźć swoje dopasowania!',
  },
  noLiveRooms: {
    emoji: '📹',
    title: 'Brak transmisji na żywo',
    description: 'Sprawdź ponownie później lub rozpocznij własną transmisję.',
  },
  noAIChats: {
    emoji: '🤖',
    title: 'Brak rozmów z AI',
    description: 'Rozpocznij konwersację z jednym z naszych AI Botów!',
  },
  noDrops: {
    emoji: '🎁',
    title: 'Brak drops',
    description: 'Twórcy nie opublikowali jeszcze żadnych drops. Sprawdź później!',
  },
  noQuestions: {
    emoji: '❓',
    title: 'Brak pytań',
    description: 'Nikt nie zadał Ci jeszcze pytań. Udostępnij swój link!',
  },
  noNotifications: {
    emoji: '🔔',
    title: 'Brak powiadomień',
    description: 'Nie masz nowych powiadomień.',
  },
  noGoals: {
    emoji: '🎯',
    title: 'Brak celów',
    description: 'Utwórz swój pierwszy cel i zacznij zarabiać na wsparciu fanów!',
  },
  noWalletHistory: {
    emoji: '💰',
    title: 'Brak historii',
    description: 'Twoja historia transakcji pojawi się tutaj.',
  },
  noMissions: {
    emoji: '🎮',
    title: 'Brak misji',
    description: 'Wszystkie misje zostały ukończone. Sprawdź później po nowe!',
  },
  noCallHistory: {
    emoji: '📞',
    title: 'Brak historii połączeń',
    description: 'Twoja historia połączeń pojawi się tutaj.',
  },
  noReferrals: {
    emoji: '👥',
    title: 'Brak poleceń',
    description: 'Zaproś znajomych i zarabiaj razem!',
  },
  noContent: {
    emoji: '📦',
    title: 'Brak treści',
    description: 'Nie znaleziono żadnych treści.',
  },
  noResults: {
    emoji: '🔍',
    title: 'Brak wyników',
    description: 'Nie znaleziono wyników dla Twojego wyszukiwania.',
  },
  profileIncomplete: {
    emoji: '✏️',
    title: 'Uzupełnij swój profil',
    description: 'Dokończ konfigurację profilu, aby rozpocząć przesuwanie!',
  },
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emoji: {
    fontSize: 80,
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  actionButton: {
    backgroundColor: '#40E0D0',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 18,
    shadowColor: '#40E0D0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
