/**
 * PACK 241: Chemistry Badges - Chat Header Integration Example
 * 
 * Demonstrates how to display chemistry badges in chat header
 * Badges visible only inside the chat, not publicly
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import ChemistryBadgeDisplay from "@/components/ChemistryBadgeDisplay";
import { subscribeToChemistryBadges, getCosmeticRewards } from "@/lib/services/chemistryBadgeService";
import type { ChemistryBadges } from "@/types/chemistryBadges";

interface ChatHeaderProps {
  matchId: string;
  partnerName: string;
  partnerAvatar?: string;
  onBackPress: () => void;
}

export default function ChatHeader({
  matchId,
  partnerName,
  partnerAvatar,
  onBackPress,
}: ChatHeaderProps) {
  const [badges, setBadges] = useState<ChemistryBadges | null>(null);
  const [showBadgeModal, setShowBadgeModal] = useState(false);

  useEffect(() => {
    // Subscribe to real-time badge updates
    const unsubscribe = subscribeToChemistryBadges(
      matchId,
      (updatedBadges) => {
        setBadges(updatedBadges);
      },
      (error) => {
        console.error('Error loading badges:', error);
      }
    );

    return () => unsubscribe();
  }, [matchId]);

  const cosmeticEffects = badges ? getCosmeticRewards(badges.total) : null;

  return (
    <View 
      style={[
        styles.container,
        cosmeticEffects?.hasChatBorder && styles.chatBorderEffect,
      ]}
    >
      {/* Back button and partner info */}
      <View style={styles.leftSection}>
        <TouchableOpacity onPress={onBackPress} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        
        <View style={styles.partnerInfo}>
          <Text style={styles.partnerName}>{partnerName}</Text>
          
          {/* Badge count indicator (compact view) */}
          {badges && badges.total > 0 && (
            <TouchableOpacity
              style={styles.badgeIndicator}
              onPress={() => setShowBadgeModal(true)}
            >
              <Text style={styles.badgeCount}>
                {badges.total}/10 🏆
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Badge Modal - Full view */}
      <Modal
        visible={showBadgeModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBadgeModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Chemistry Badges</Text>
              <TouchableOpacity
                onPress={() => setShowBadgeModal(false)}
                style={styles.closeButton}
              >
                <Text style={styles.closeIcon}>✕</Text>
              </TouchableOpacity>
            </View>

            {badges && (
              <ChemistryBadgeDisplay
                badges={badges}
                matchId={matchId}
                size="large"
                showLabels
                showProgress
              />
            )}

            <Text style={styles.modalDescription}>
              Unlock badges by sharing meaningful moments together.
              Each badge unlocks special cosmetic rewards! 💫
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  chatBorderEffect: {
    borderBottomWidth: 2,
    borderBottomColor: '#FFD700',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  backButton: {
    padding: 8,
  },
  backIcon: {
    fontSize: 24,
    color: '#333',
  },
  partnerInfo: {
    marginLeft: 12,
    flex: 1,
  },
  partnerName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  badgeIndicator: {
    marginTop: 2,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  badgeCount: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFD700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    maxWidth: 400,
    width: '100%',
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
  },
  closeButton: {
    padding: 8,
  },
  closeIcon: {
    fontSize: 24,
    color: '#666',
  },
  modalDescription: {
    marginTop: 16,
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    lineHeight: 18,
  },
});
