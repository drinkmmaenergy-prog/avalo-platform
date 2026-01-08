/**
 * PACK 241: Chemistry Badges - Memory Log Integration Example
 * 
 * Demonstrates how to display chemistry badges in Memory Log
 * Shows badge progress alongside shared memories
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import ChemistryBadgeDisplay from "@/components/ChemistryBadgeDisplay";
import { getChemistryBadges, getCosmeticRewards } from "@/lib/services/chemistryBadgeService";
import type { ChemistryBadges } from "@/types/chemistryBadges";

interface MemoryLogWithBadgesProps {
  matchId: string;
  memories: Array<{
    id: string;
    title: string;
    description: string;
    date: Date;
    type: string;
  }>;
}

export default function MemoryLogWithBadges({
  matchId,
  memories,
}: MemoryLogWithBadgesProps) {
  const [badges, setBadges] = useState<ChemistryBadges | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBadges();
  }, [matchId]);

  const loadBadges = async () => {
    try {
      const badgeData = await getChemistryBadges(matchId);
      setBadges(badgeData);
    } catch (error) {
      console.error('Error loading badges:', error);
    } finally {
      setLoading(false);
    }
  };

  const cosmeticEffects = badges ? getCosmeticRewards(badges.total) : null;

  return (
    <ScrollView style={styles.container}>
      {/* Memory Log Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>💫 Our Story Together</Text>
        <Text style={styles.headerSubtitle}>
          {memories.length} Shared Memories
        </Text>
      </View>

      {/* Chemistry Badges Section */}
      {badges && !loading && (
        <View 
          style={[
            styles.badgesSection,
            cosmeticEffects?.hasProfileGlow && styles.profileGlowEffect,
          ]}
        >
          <View style={styles.badgesSectionHeader}>
            <Text style={styles.badgesSectionTitle}>✨ Chemistry Milestones</Text>
            <Text style={styles.badgesSectionSubtitle}>
              Achievements we've unlocked together
            </Text>
          </View>

          <ChemistryBadgeDisplay
            badges={badges}
            matchId={matchId}
            size="medium"
            showLabels
            showProgress
          />

          {/* Next Badge Preview */}
          {badges.total < 10 && (
            <View style={styles.nextBadgePreview}>
              <Text style={styles.nextBadgeText}>
                🎯 {10 - badges.total} more badges to unlock all rewards!
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Memories List */}
      <View style={styles.memoriesSection}>
        <Text style={styles.memoriesSectionTitle}>📖 Memory Timeline</Text>
        
        {memories.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>📝</Text>
            <Text style={styles.emptyStateText}>
              Start creating memories together!
            </Text>
            <Text style={styles.emptyStateSubtext}>
              Each memory brings you closer and unlocks badges ✨
            </Text>
          </View>
        ) : (
          memories.map((memory) => (
            <View 
              key={memory.id} 
              style={[
                styles.memoryCard,
                cosmeticEffects?.hasMessageTail && styles.memoryCardWithEffect,
              ]}
            >
              <View style={styles.memoryHeader}>
                <Text style={styles.memoryType}>{getMemoryIcon(memory.type)}</Text>
                <Text style={styles.memoryDate}>
                  {formatDate(memory.date)}
                </Text>
              </View>
              <Text style={styles.memoryTitle}>{memory.title}</Text>
              <Text style={styles.memoryDescription}>{memory.description}</Text>
            </View>
          ))
        )}
      </View>

      {/* Badge Unlock Motivation */}
      {badges && badges.total > 0 && (
        <View style={styles.motivationSection}>
          <Text style={styles.motivationText}>
            💕 Keep creating beautiful moments together to unlock more badges!
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

// Helper functions
function getMemoryIcon(type: string): string {
  const icons: Record<string, string> = {
    chat: '💬',
    call: '📞',
    video: '📹',
    gift: '🎁',
    event: '🎉',
    date: '📅',
    milestone: '⭐',
  };
  return icons[type] || '📝';
}

function formatDate(date: Date): string {
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  };
  return date.toLocaleDateString('en-US', options);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  badgesSection: {
    margin: 16,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  profileGlowEffect: {
    borderWidth: 2,
    borderColor: '#FFD700',
    shadowColor: '#FFD700',
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  badgesSectionHeader: {
    marginBottom: 16,
  },
  badgesSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 4,
  },
  badgesSectionSubtitle: {
    fontSize: 13,
    color: '#666',
  },
  nextBadgePreview: {
    marginTop: 16,
    padding: 12,
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#FFD700',
  },
  nextBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFD700',
    textAlign: 'center',
  },
  memoriesSection: {
    padding: 16,
  },
  memoriesSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
  },
  memoryCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  memoryCardWithEffect: {
    borderLeftWidth: 3,
    borderLeftColor: '#FFD700',
  },
  memoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  memoryType: {
    fontSize: 20,
  },
  memoryDate: {
    fontSize: 12,
    color: '#999',
    fontWeight: '500',
  },
  memoryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  memoryDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  emptyStateSubtext: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
  },
  motivationSection: {
    margin: 16,
    padding: 16,
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
  },
  motivationText: {
    fontSize: 14,
    color: '#FFD700',
    textAlign: 'center',
    fontWeight: '600',
    lineHeight: 20,
  },
});
