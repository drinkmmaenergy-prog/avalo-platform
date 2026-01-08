/**
 * PACK 294 - Search & Discovery Filters
 * Enhanced Filter Modal for Discovery
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
} from 'react-native';
import { colors, spacing, fontSizes, fontWeights, radius } from "@/shared/theme";

export interface DiscoveryFilterOptions {
  ageMin: number;
  ageMax: number;
  distanceKmMax: number;
  gender?: 'MALE' | 'FEMALE' | 'NONBINARY' | 'ANY';
  lookingFor?: 'MEN' | 'WOMEN' | 'NONBINARY' | 'ANY';
  interests?: string[];
  languages?: string[];
  hasProfilePhoto?: boolean;
  hasVideoIntro?: boolean;
  isVerifiedOnly?: boolean;
  minPopularityScore?: number;
  influencerOnly?: boolean;
  royalOnly?: boolean;
}

interface DiscoveryFiltersProps {
  visible: boolean;
  filters: DiscoveryFilterOptions;
  onClose: () => void;
  onApply: (filters: DiscoveryFilterOptions) => void;
}

const POPULAR_INTERESTS = [
  'travel', 'fitness', 'music', 'movies', 'gaming', 
  'cooking', 'reading', 'sports', 'art', 'photography',
  'dancing', 'yoga', 'hiking', 'tech', 'fashion'
];

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'pl', name: 'Polski' },
  { code: 'de', name: 'Deutsch' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'it', name: 'Italiano' },
  { code: 'pt', name: 'Português' },
  { code: 'ru', name: 'Русский' },
];

export default function DiscoveryFilters({ visible, filters, onClose, onApply }: DiscoveryFiltersProps) {
  const [localFilters, setLocalFilters] = useState<DiscoveryFilterOptions>(filters);

  const handleApply = () => {
    onApply(localFilters);
    onClose();
  };

  const handleReset = () => {
    setLocalFilters({
      ageMin: 18,
      ageMax: 99,
      distanceKmMax: 100,
      gender: 'ANY',
      lookingFor: 'ANY',
      interests: [],
      languages: [],
      hasProfilePhoto: false,
      hasVideoIntro: false,
      isVerifiedOnly: false,
      minPopularityScore: 0,
      influencerOnly: false,
      royalOnly: false,
    });
  };

  const toggleInterest = (interest: string) => {
    const currentInterests = localFilters.interests || [];
    if (currentInterests.includes(interest)) {
      setLocalFilters({
        ...localFilters,
        interests: currentInterests.filter(i => i !== interest),
      });
    } else {
      setLocalFilters({
        ...localFilters,
        interests: [...currentInterests, interest],
      });
    }
  };

  const toggleLanguage = (langCode: string) => {
    const currentLanguages = localFilters.languages || [];
    if (currentLanguages.includes(langCode)) {
      setLocalFilters({
        ...localFilters,
        languages: currentLanguages.filter(l => l !== langCode),
      });
    } else {
      setLocalFilters({
        ...localFilters,
        languages: [...currentLanguages, langCode],
      });
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Discovery Filters</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Age Range */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Age Range</Text>
              <View style={styles.row}>
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>Min</Text>
                  <TextInput
                    style={styles.input}
                    value={String(localFilters.ageMin)}
                    onChangeText={(text) => setLocalFilters({ ...localFilters, ageMin: parseInt(text) || 18 })}
                    keyboardType="number-pad"
                    placeholder="18"
                  />
                </View>
                <Text style={styles.separator}>-</Text>
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>Max</Text>
                  <TextInput
                    style={styles.input}
                    value={String(localFilters.ageMax)}
                    onChangeText={(text) => setLocalFilters({ ...localFilters, ageMax: parseInt(text) || 99 })}
                    keyboardType="number-pad"
                    placeholder="99"
                  />
                </View>
              </View>
            </View>

            {/* Distance */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Max Distance</Text>
              <View style={styles.distanceOptions}>
                {[10, 25, 50, 100, 250, 500].map((dist) => (
                  <TouchableOpacity
                    key={dist}
                    style={[
                      styles.distanceChip,
                      localFilters.distanceKmMax === dist && styles.distanceChipActive,
                    ]}
                    onPress={() => setLocalFilters({ ...localFilters, distanceKmMax: dist })}
                  >
                    <Text
                      style={[
                        styles.distanceChipText,
                        localFilters.distanceKmMax === dist && styles.distanceChipTextActive,
                      ]}
                    >
                      {dist} km
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Gender */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Gender</Text>
              <View style={styles.row}>
                {(['ANY', 'MALE', 'FEMALE', 'NONBINARY'] as const).map((gender) => (
                  <TouchableOpacity
                    key={gender}
                    style={[
                      styles.chip,
                      localFilters.gender === gender && styles.chipActive,
                    ]}
                    onPress={() => setLocalFilters({ ...localFilters, gender })}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        localFilters.gender === gender && styles.chipTextActive,
                      ]}
                    >
                      {gender === 'ANY' ? 'All' : gender.charAt(0) + gender.slice(1).toLowerCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Looking For */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Looking For</Text>
              <View style={styles.row}>
                {(['ANY', 'MEN', 'WOMEN', 'NONBINARY'] as const).map((looking) => (
                  <TouchableOpacity
                    key={looking}
                    style={[
                      styles.chip,
                      localFilters.lookingFor === looking && styles.chipActive,
                    ]}
                    onPress={() => setLocalFilters({ ...localFilters, lookingFor: looking })}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        localFilters.lookingFor === looking && styles.chipTextActive,
                      ]}
                    >
                      {looking === 'ANY' ? 'All' : looking.charAt(0) + looking.slice(1).toLowerCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Interests */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Interests</Text>
              <View style={styles.chipContainer}>
                {POPULAR_INTERESTS.map((interest) => (
                  <TouchableOpacity
                    key={interest}
                    style={[
                      styles.interestChip,
                      localFilters.interests?.includes(interest) && styles.interestChipActive,
                    ]}
                    onPress={() => toggleInterest(interest)}
                  >
                    <Text
                      style={[
                        styles.interestChipText,
                        localFilters.interests?.includes(interest) && styles.interestChipTextActive,
                      ]}
                    >
                      {interest}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Languages */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Languages</Text>
              <View style={styles.chipContainer}>
                {LANGUAGES.map((lang) => (
                  <TouchableOpacity
                    key={lang.code}
                    style={[
                      styles.interestChip,
                      localFilters.languages?.includes(lang.code) && styles.interestChipActive,
                    ]}
                    onPress={() => toggleLanguage(lang.code)}
                  >
                    <Text
                      style={[
                        styles.interestChipText,
                        localFilters.languages?.includes(lang.code) && styles.interestChipTextActive,
                      ]}
                    >
                      {lang.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Toggles */}
            <View style={styles.section}>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Verified Only</Text>
                <Switch
                  value={localFilters.isVerifiedOnly}
                  onValueChange={(value) => setLocalFilters({ ...localFilters, isVerifiedOnly: value })}
                  trackColor={{ false: colors.disabled, true: colors.primary }}
                  thumbColor={colors.white}
                />
              </View>

              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>With Profile Photo</Text>
                <Switch
                  value={localFilters.hasProfilePhoto}
                  onValueChange={(value) => setLocalFilters({ ...localFilters, hasProfilePhoto: value })}
                  trackColor={{ false: colors.disabled, true: colors.primary }}
                  thumbColor={colors.white}
                />
              </View>

              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>With Video Intro</Text>
                <Switch
                  value={localFilters.hasVideoIntro}
                  onValueChange={(value) => setLocalFilters({ ...localFilters, hasVideoIntro: value })}
                  trackColor={{ false: colors.disabled, true: colors.primary }}
                  thumbColor={colors.white}
                />
              </View>

              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Influencers Only</Text>
                <Switch
                  value={localFilters.influencerOnly}
                  onValueChange={(value) => setLocalFilters({ ...localFilters, influencerOnly: value })}
                  trackColor={{ false: colors.disabled, true: colors.primary }}
                  thumbColor={colors.white}
                />
              </View>

              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Royal Members Only</Text>
                <Switch
                  value={localFilters.royalOnly}
                  onValueChange={(value) => setLocalFilters({ ...localFilters, royalOnly: value })}
                  trackColor={{ false: colors.disabled, true: colors.primary }}
                  thumbColor={colors.white}
                />
              </View>
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
              <Text style={styles.resetButtonText}>Reset</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.applyButton} onPress={handleApply}>
              <Text style={styles.applyButtonText}>Apply Filters</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  closeButton: {
    fontSize: fontSizes['2xl'],
    color: colors.textSecondary,
  },
  content: {
    padding: spacing.lg,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  inputContainer: {
    flex: 1,
  },
  inputLabel: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.backgroundCard,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: fontSizes.base,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  separator: {
    fontSize: fontSizes.lg,
    color: colors.textSecondary,
  },
  distanceOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  distanceChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  distanceChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  distanceChipText: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  distanceChipTextActive: {
    color: colors.white,
    fontWeight: fontWeights.semibold,
  },
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.white,
    fontWeight: fontWeights.semibold,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  interestChip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  interestChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  interestChipText: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },
  interestChipTextActive: {
    color: colors.white,
    fontWeight: fontWeights.semibold,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  toggleLabel: {
    fontSize: fontSizes.base,
    color: colors.textPrimary,
  },
  footer: {
    flexDirection: 'row',
    padding: spacing.lg,
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  resetButton: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  resetButtonText: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  applyButton: {
    flex: 2,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  applyButtonText: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
    color: colors.white,
  },
});
