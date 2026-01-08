/**
 * Season Pass Creator Dashboard
 * 
 * Allows creators to:
 * - Start new seasons
 * - View current season stats
 * - Preview tier rewards
 * - Monitor participant progress
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/contexts/AuthContext";
import seasonPassService, {
  Season,
  SeasonConfig,
  TIER_REWARDS,
  getTimeRemaining,
} from "@/services/seasonPassService";

const COLORS = {
  background: '#0F0F0F',
  gold: '#D4AF37',
  turquoise: '#40E0D0',
  darkGray: '#1A1A1A',
  mediumGray: '#2A2A2A',
  lightGray: '#CCCCCC',
  white: '#FFFFFF',
};

export default function SeasonPassScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [currentSeason, setCurrentSeason] = useState<Season | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Season creation form
  const [seasonName, setSeasonName] = useState('');
  const [seasonDescription, setSeasonDescription] = useState('');
  const [heroBannerUrl, setHeroBannerUrl] = useState<string | undefined>();

  useEffect(() => {
    loadSeason();
  }, []);

  const loadSeason = async () => {
    try {
      setLoading(true);
      if (!user?.uid) return;
      const season = await seasonPassService.getSeason(user.uid);
      setCurrentSeason(season);
    } catch (error) {
      console.error('Error loading season:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setHeroBannerUrl(result.assets[0].uri);
    }
  };

  const handleStartSeason = async () => {
    if (!seasonName.trim()) {
      Alert.alert(
        t('seasonPass.error'),
        t('seasonPass.nameRequired')
      );
      return;
    }

    if (!seasonDescription.trim()) {
      Alert.alert(
        t('seasonPass.error'),
        t('seasonPass.descriptionRequired')
      );
      return;
    }

    try {
      setLoading(true);
      
      if (!user?.uid) return;

      const config: SeasonConfig = {
        name: seasonName.trim(),
        description: seasonDescription.trim(),
        heroBannerUrl,
      };

      const newSeason = await seasonPassService.startSeason(
        user.uid,
        config
      );

      setCurrentSeason(newSeason);
      setIsCreating(false);
      setSeasonName('');
      setSeasonDescription('');
      setHeroBannerUrl(undefined);

      Alert.alert(
        t('seasonPass.success'),
        t('seasonPass.seasonStarted')
      );
    } catch (error: any) {
      Alert.alert(
        t('seasonPass.error'),
        error.message || t('seasonPass.failedToStart')
      );
    } finally {
      setLoading(false);
    }
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerGradient}>
        <Text style={styles.headerTitle}>{t('seasonPass.title')}</Text>
        <Text style={styles.headerSubtitle}>{t('seasonPass.subtitle')}</Text>
      </View>
    </View>
  );

  const renderCreateSeasonForm = () => (
    <View style={styles.createForm}>
      <Text style={styles.sectionTitle}>{t('seasonPass.createNew')}</Text>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>{t('seasonPass.seasonName')}</Text>
        <TextInput
          style={styles.input}
          value={seasonName}
          onChangeText={setSeasonName}
          placeholder={t('seasonPass.seasonNamePlaceholder')}
          placeholderTextColor="#666"
          maxLength={50}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>{t('seasonPass.description')}</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={seasonDescription}
          onChangeText={setSeasonDescription}
          placeholder={t('seasonPass.descriptionPlaceholder')}
          placeholderTextColor="#666"
          multiline
          numberOfLines={4}
          maxLength={200}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>{t('seasonPass.heroBanner')}</Text>
        <TouchableOpacity
          style={styles.imagePickerButton}
          onPress={handlePickImage}
        >
          {heroBannerUrl ? (
            <Image source={{ uri: heroBannerUrl }} style={styles.bannerPreview} />
          ) : (
            <View style={styles.imagePickerPlaceholder}>
              <Ionicons name="image-outline" size={48} color="#666" />
              <Text style={styles.imagePickerText}>
                {t('seasonPass.selectBanner')}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>{t('seasonPass.tierPreview')}</Text>
      {TIER_REWARDS.map((tier) => (
        <View key={tier.tier} style={styles.tierPreviewCard}>
          <View style={styles.tierHeader}>
            <View style={styles.tierBadge}>
              <Text style={styles.tierBadgeText}>{tier.tier}</Text>
            </View>
            <View style={styles.tierInfo}>
              <Text style={styles.tierName}>{tier.rewardName}</Text>
              <Text style={styles.tierPoints}>
                {tier.requiredPoints} {t('seasonPass.points')}
              </Text>
            </View>
          </View>
          <Text style={styles.tierDuration}>
            {t('seasonPass.duration')}: {tier.rewardDuration}h
          </Text>
        </View>
      ))}

      <TouchableOpacity
        style={styles.startButton}
        onPress={handleStartSeason}
        disabled={loading}
      >
        <View style={styles.startButtonGradient}>
          {loading ? (
            <ActivityIndicator color="#0F0F0F" />
          ) : (
            <>
              <Ionicons name="rocket" size={24} color="#0F0F0F" />
              <Text style={styles.startButtonText}>
                {t('seasonPass.startSeason')}
              </Text>
            </>
          )}
        </View>
      </TouchableOpacity>
    </View>
  );

  const renderActiveSeason = () => {
    if (!currentSeason) return null;

    const timeRemaining = getTimeRemaining(currentSeason);
    const isExpired = currentSeason.status === 'expired';

    return (
      <View style={styles.activeSeason}>
        {currentSeason.heroBannerUrl && (
          <Image
            source={{ uri: currentSeason.heroBannerUrl }}
            style={styles.seasonBanner}
          />
        )}

        <View style={styles.seasonHeader}>
          <Text style={styles.seasonTitle}>{currentSeason.name}</Text>
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>
              {isExpired ? t('seasonPass.expired') : t('seasonPass.active')}
            </Text>
          </View>
        </View>

        <Text style={styles.seasonDescription}>
          {currentSeason.description}
        </Text>

        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Ionicons name="people" size={32} color="#40E0D0" />
            <Text style={styles.statValue}>{currentSeason.participantCount}</Text>
            <Text style={styles.statLabel}>{t('seasonPass.participants')}</Text>
          </View>

          <View style={styles.statCard}>
            <Ionicons name="time" size={32} color="#D4AF37" />
            <Text style={styles.statValue}>
              {isExpired ? '0' : timeRemaining.days}
            </Text>
            <Text style={styles.statLabel}>{t('seasonPass.daysLeft')}</Text>
          </View>

          <View style={styles.statCard}>
            <Ionicons name="trophy" size={32} color="#40E0D0" />
            <Text style={styles.statValue}>{currentSeason.tiers.length}</Text>
            <Text style={styles.statLabel}>{t('seasonPass.tiers')}</Text>
          </View>
        </View>

        {!isExpired && (
          <View style={styles.timeRemainingCard}>
            <Ionicons name="hourglass-outline" size={24} color="#D4AF37" />
            <Text style={styles.timeRemainingText}>
              {t('seasonPass.timeRemaining')}: {timeRemaining.days}d{' '}
              {timeRemaining.hours}h {timeRemaining.minutes}m
            </Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>{t('seasonPass.tierRewards')}</Text>
        {currentSeason.tiers.map((tier) => (
          <View key={tier.tier} style={styles.tierCard}>
            <View style={styles.tierHeader}>
              <View style={[styles.tierBadge, styles.tierBadgeGold]}>
                <Text style={styles.tierBadgeText}>{tier.tier}</Text>
              </View>
              <View style={styles.tierInfo}>
                <Text style={styles.tierName}>{tier.rewardName}</Text>
                <Text style={styles.tierPoints}>
                  {tier.requiredPoints} {t('seasonPass.points')}
                </Text>
              </View>
            </View>
            <View style={styles.tierMeta}>
              <Text style={styles.tierDuration}>
                {tier.rewardDuration}h {t('seasonPass.duration')}
              </Text>
              <View style={[styles.tierTypeBadge, getTierTypeColor(tier.rewardType)]}>
                <Text style={styles.tierTypeText}>
                  {t(`seasonPass.rewardTypes.${tier.rewardType}`)}
                </Text>
              </View>
            </View>
          </View>
        ))}

        {isExpired && (
          <TouchableOpacity
            style={styles.newSeasonButton}
            onPress={() => setIsCreating(true)}
          >
            <Text style={styles.newSeasonButtonText}>
              {t('seasonPass.startNewSeason')}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const getTierTypeColor = (type: string) => {
    switch (type) {
      case 'frame':
        return { backgroundColor: '#D4AF37' };
      case 'badge':
        return { backgroundColor: '#40E0D0' };
      case 'animation':
        return { backgroundColor: '#FF6B9D' };
      case 'aura':
        return { backgroundColor: '#9D50BB' };
      case 'entrance':
        return { backgroundColor: '#FF9500' };
      default:
        return { backgroundColor: '#666' };
    }
  };

  if (loading && !currentSeason) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#D4AF37" />
        <Text style={styles.loadingText}>{t('seasonPass.loading')}</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: t('seasonPass.title'),
          headerStyle: { backgroundColor: '#0F0F0F' },
          headerTintColor: '#D4AF37',
        }}
      />
      <ScrollView style={styles.container}>
        {renderHeader()}

        {!currentSeason || currentSeason.status === 'expired' ? (
          isCreating || !currentSeason ? (
            renderCreateSeasonForm()
          ) : (
            <TouchableOpacity
              style={styles.createButton}
              onPress={() => setIsCreating(true)}
            >
              <View style={styles.createButtonGradient}>
                <Ionicons name="add-circle" size={32} color="#0F0F0F" />
                <Text style={styles.createButtonText}>
                  {t('seasonPass.createSeason')}
                </Text>
              </View>
            </TouchableOpacity>
          )
        ) : (
          renderActiveSeason()
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0F0F0F',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#D4AF37',
    fontSize: 16,
    marginTop: 16,
  },
  header: {
    marginBottom: 24,
  },
  headerGradient: {
    padding: 32,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    backgroundColor: COLORS.gold,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#0F0F0F',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#0F0F0F',
    opacity: 0.8,
  },
  createButton: {
    margin: 24,
    borderRadius: 18,
    overflow: 'hidden',
  },
  createButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
    backgroundColor: COLORS.gold,
  },
  createButtonText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0F0F0F',
  },
  createForm: {
    padding: 24,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#D4AF37',
    marginBottom: 16,
    marginTop: 24,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#FFF',
    borderWidth: 1,
    borderColor: '#333',
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  imagePickerButton: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#333',
    borderStyle: 'dashed',
  },
  imagePickerPlaceholder: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
  },
  imagePickerText: {
    color: '#666',
    fontSize: 14,
    marginTop: 8,
  },
  bannerPreview: {
    width: '100%',
    height: 200,
  },
  tierPreviewCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  tierHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  tierBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#D4AF37',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  tierBadgeGold: {
    backgroundColor: '#D4AF37',
  },
  tierBadgeText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0F0F0F',
  },
  tierInfo: {
    flex: 1,
  },
  tierName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 4,
  },
  tierPoints: {
    fontSize: 14,
    color: '#40E0D0',
  },
  tierDuration: {
    fontSize: 12,
    color: '#999',
  },
  startButton: {
    marginTop: 32,
    borderRadius: 18,
    overflow: 'hidden',
  },
  startButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 12,
    backgroundColor: COLORS.gold,
  },
  startButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0F0F0F',
  },
  activeSeason: {
    padding: 24,
  },
  seasonBanner: {
    width: '100%',
    height: 200,
    borderRadius: 18,
    marginBottom: 24,
  },
  seasonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  seasonTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFF',
    flex: 1,
  },
  statusBadge: {
    backgroundColor: '#40E0D0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0F0F0F',
    textTransform: 'uppercase',
  },
  seasonDescription: {
    fontSize: 16,
    color: '#CCC',
    lineHeight: 24,
    marginBottom: 24,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  statValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFF',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
    textAlign: 'center',
  },
  timeRemainingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    gap: 12,
    borderWidth: 1,
    borderColor: '#D4AF37',
  },
  timeRemainingText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#D4AF37',
  },
  tierCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#D4AF37',
  },
  tierMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  tierTypeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  tierTypeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#FFF',
    textTransform: 'uppercase',
  },
  newSeasonButton: {
    backgroundColor: '#D4AF37',
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
    marginTop: 24,
  },
  newSeasonButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0F0F0F',
  },
});
