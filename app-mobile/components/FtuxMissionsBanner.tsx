/**
 * FtuxMissionsBanner - Phase 32-4
 * Displays first-week mission progress banner and mission list modal
 * Gender-adaptive, dark theme UI
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Pressable,
} from 'react-native';
import { FtuxMission } from '../utils/ftuxMissionEngine';

interface FtuxMissionsBannerProps {
  missions: FtuxMission[];
  completedCount: number;
  totalCount: number;
  onMissionPress?: (missionId: string) => void;
  t: (key: string, params?: Record<string, any>) => string;
}

export function FtuxMissionsBanner({
  missions,
  completedCount,
  totalCount,
  onMissionPress,
  t,
}: FtuxMissionsBannerProps) {
  const [showModal, setShowModal] = useState(false);
  
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  
  return (
    <>
      {/* Banner Card */}
      <TouchableOpacity
        style={styles.banner}
        onPress={() => setShowModal(true)}
        activeOpacity={0.8}
      >
        <View style={styles.bannerContent}>
          {/* Left: Title and subtitle */}
          <View style={styles.bannerLeft}>
            <Text style={styles.bannerTitle}>{t('ftuxMissions.bannerTitle')}</Text>
            <Text style={styles.bannerSubtitle}>
              {t('ftuxMissions.progressLabel', { completed: completedCount, total: totalCount })}
            </Text>
          </View>
          
          {/* Middle: Progress bar */}
          <View style={styles.progressContainer}>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
            </View>
            <Text style={styles.progressText}>{Math.round(progressPercent)}%</Text>
          </View>
          
          {/* Right: View tasks button */}
          <View style={styles.bannerRight}>
            <View style={styles.viewTasksButton}>
              <Text style={styles.viewTasksText}>{t('ftuxMissions.viewTasks')}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
      
      {/* Mission List Modal */}
      <Modal
        visible={showModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setShowModal(false)}
          />
          
          <View style={styles.modalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('ftuxMissions.bannerTitle')}</Text>
              <TouchableOpacity
                onPress={() => setShowModal(false)}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            
            {/* Progress Summary */}
            <View style={styles.modalProgress}>
              <Text style={styles.modalProgressText}>
                {t('ftuxMissions.progressLabel', { completed: completedCount, total: totalCount })}
              </Text>
              <View style={styles.modalProgressBar}>
                <View style={[styles.modalProgressFill, { width: `${progressPercent}%` }]} />
              </View>
            </View>
            
            {/* Mission List */}
            <ScrollView
              style={styles.missionList}
              showsVerticalScrollIndicator={false}
            >
              {missions.map((mission) => (
                <TouchableOpacity
                  key={mission.id}
                  style={styles.missionItem}
                  onPress={() => {
                    if (onMissionPress) {
                      onMissionPress(mission.id);
                      setShowModal(false);
                    }
                  }}
                  activeOpacity={0.7}
                >
                  {/* Mission Icon */}
                  <View style={styles.missionIcon}>
                    <Text style={styles.missionIconText}>{mission.icon}</Text>
                  </View>
                  
                  {/* Mission Info */}
                  <View style={styles.missionInfo}>
                    <Text style={styles.missionTitle}>{t(mission.titleKey)}</Text>
                    <Text style={styles.missionSubtitle} numberOfLines={1}>
                      {t(mission.subtitleKey)}
                    </Text>
                  </View>
                  
                  {/* Mission Status */}
                  <View
                    style={[
                      styles.missionStatus,
                      mission.status === 'COMPLETED' && styles.missionStatusCompleted,
                    ]}
                  >
                    <Text
                      style={[
                        styles.missionStatusText,
                        mission.status === 'COMPLETED' && styles.missionStatusTextCompleted,
                      ]}
                    >
                      {mission.status === 'COMPLETED'
                        ? t('ftuxMissions.status_done')
                        : t('ftuxMissions.status_todo')}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // Banner styles
  banner: {
    backgroundColor: '#181818',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 18,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  bannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bannerLeft: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  bannerSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#999',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressBarBg: {
    width: 60,
    height: 6,
    backgroundColor: '#2A2A2A',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#40E0D0',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#40E0D0',
    minWidth: 35,
  },
  bannerRight: {
    marginLeft: 4,
  },
  viewTasksButton: {
    backgroundColor: '#40E0D0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  viewTasksText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F0F0F',
  },
  
  // Modal styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  modalContent: {
    backgroundColor: '#0F0F0F',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2A2A2A',
    borderRadius: 16,
  },
  closeButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#999',
  },
  modalProgress: {
    padding: 20,
    paddingTop: 16,
    paddingBottom: 16,
  },
  modalProgressText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
    marginBottom: 10,
  },
  modalProgressBar: {
    height: 8,
    backgroundColor: '#2A2A2A',
    borderRadius: 4,
    overflow: 'hidden',
  },
  modalProgressFill: {
    height: '100%',
    backgroundColor: '#40E0D0',
    borderRadius: 4,
  },
  missionList: {
    paddingHorizontal: 20,
  },
  missionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181818',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    gap: 12,
  },
  missionIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2A2A2A',
    borderRadius: 24,
  },
  missionIconText: {
    fontSize: 24,
  },
  missionInfo: {
    flex: 1,
  },
  missionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  missionSubtitle: {
    fontSize: 13,
    fontWeight: '400',
    color: '#999',
  },
  missionStatus: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#2A2A2A',
  },
  missionStatusCompleted: {
    backgroundColor: 'rgba(64, 224, 208, 0.15)',
  },
  missionStatusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#999',
  },
  missionStatusTextCompleted: {
    color: '#40E0D0',
  },
});
