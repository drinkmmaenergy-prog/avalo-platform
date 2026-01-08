/**
 * VIP Profile Themes Gallery
 * 
 * Browse and apply premium profile themes
 * Available only to VIP and Royal Club members
 */

import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';

interface Theme {
  themeId: string;
  name: string;
  description: string;
  category: string;
  requiredTier: 'VIP' | 'ROYAL_CLUB';
  previewImageUrl: string;
  enabled: boolean;
}

const THEME_CATEGORIES = [
  { id: 'all', name: 'All Themes' },
  { id: 'classic', name: 'Classic' },
  { id: 'modern', name: 'Modern' },
  { id: 'elegant', name: 'Elegant' },
  { id: 'playful', name: 'Playful' },
  { id: 'seasonal', name: 'Seasonal' },
  { id: 'special', name: 'Special Edition' },
];

export default function VIPThemesScreen() {
  const router = useRouter();
  const [themes, setThemes] = useState<Theme[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [currentThemeId, setCurrentThemeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [userTier, setUserTier] = useState<'NONE' | 'VIP' | 'ROYAL_CLUB'>('NONE');

  useEffect(() => {
    loadThemes();
  }, [selectedCategory]);

  const loadThemes = async () => {
    try {
      setLoading(true);
      
      // TODO: Call Cloud Function
      // const result = await getAvailableThemes({
      //   type: 'profile',
      //   category: selectedCategory === 'all' ? undefined : selectedCategory,
      // });
      
      // setThemes(result.themes);
      // setUserTier(result.userTier);
      
      // Load current theme
      // const userThemes = await getUserThemes();
      // setCurrentThemeId(userThemes?.profileThemeId);
      
      // Mock data for demo
      setThemes([
        {
          themeId: 'classic-gold',
          name: 'Classic Gold',
          description: 'Elegant gold frame with subtle animations',
          category: 'classic',
          requiredTier: 'VIP',
          previewImageUrl: 'https://via.placeholder.com/300x400',
          enabled: true,
        },
        {
          themeId: 'modern-neon',
          name: 'Neon Glow',
          description: 'Modern neon border with dynamic effects',
          category: 'modern',
          requiredTier: 'VIP',
          previewImageUrl: 'https://via.placeholder.com/300x400',
          enabled: true,
        },
        {
          themeId: 'royal-purple',
          name: 'Royal Purple',
          description: 'Exclusive animated Royal Club theme',
          category: 'elegant',
          requiredTier: 'ROYAL_CLUB',
          previewImageUrl: 'https://via.placeholder.com/300x400',
          enabled: true,
        },
      ]);
      setUserTier('VIP');
    } catch (error) {
      console.error('Failed to load themes:', error);
      Alert.alert('Error', 'Failed to load themes. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const applyTheme = async (themeId: string, theme: Theme) => {
    if (theme.requiredTier === 'ROYAL_CLUB' && userTier !== 'ROYAL_CLUB') {
      Alert.alert(
        'Royal Club Required',
        'This theme is exclusive to Royal Club members. Upgrade to access it.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upgrade', onPress: () => router.push('/profile/vip/paywall' as any) },
        ]
      );
      return;
    }

    try {
      setApplying(true);
      
      // TODO: Call Cloud Function
      // await assignTheme({
      //   themeId,
      //   type: 'profile',
      // });
      
      setCurrentThemeId(themeId);
      Alert.alert('Success', `${theme.name} theme applied to your profile!`);
    } catch (error) {
      console.error('Failed to apply theme:', error);
      Alert.alert('Error', 'Failed to apply theme. Please try again.');
    } finally {
      setApplying(false);
    }
  };

  const filteredThemes = selectedCategory === 'all'
    ? themes
    : themes.filter(t => t.category === selectedCategory);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Profile Themes</Text>
        <Text style={styles.subtitle}>Customize Your Look</Text>
      </View>

      {/* Categories */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoriesContainer}
        contentContainerStyle={styles.categoriesContent}
      >
        {THEME_CATEGORIES.map((category) => (
          <TouchableOpacity
            key={category.id}
            style={[
              styles.categoryButton,
              selectedCategory === category.id && styles.categoryButtonActive,
            ]}
            onPress={() => setSelectedCategory(category.id)}
          >
            <Text
              style={[
                styles.categoryButtonText,
                selectedCategory === category.id && styles.categoryButtonTextActive,
              ]}
            >
              {category.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Themes Grid */}
      <ScrollView style={styles.content}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4ECDC4" />
            <Text style={styles.loadingText}>Loading themes...</Text>
          </View>
        ) : filteredThemes.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No themes available in this category</Text>
          </View>
        ) : (
          <View style={styles.themesGrid}>
            {filteredThemes.map((theme) => {
              const isLocked = theme.requiredTier === 'ROYAL_CLUB' && userTier !== 'ROYAL_CLUB';
              const isApplied = theme.themeId === currentThemeId;

              return (
                <View key={theme.themeId} style={styles.themeCard}>
                  <View style={styles.themeImageContainer}>
                    <Image
                      source={{ uri: theme.previewImageUrl }}
                      style={[styles.themeImage, isLocked && styles.themeImageLocked]}
                    />
                    {isLocked && (
                      <View style={styles.lockOverlay}>
                        <Text style={styles.lockIcon}>🔒</Text>
                        <Text style={styles.lockText}>Royal Club</Text>
                      </View>
                    )}
                    {isApplied && (
                      <View style={styles.appliedBadge}>
                        <Text style={styles.appliedBadgeText}>✓ Applied</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.themeInfo}>
                    <Text style={styles.themeName}>{theme.name}</Text>
                    <Text style={styles.themeDescription}>{theme.description}</Text>

                    <TouchableOpacity
                      style={[
                        styles.applyButton,
                        isApplied && styles.applyButtonApplied,
                        isLocked && styles.applyButtonLocked,
                      ]}
                      onPress={() => applyTheme(theme.themeId, theme)}
                      disabled={applying || isApplied}
                    >
                      <Text style={[
                        styles.applyButtonText,
                        isApplied && styles.applyButtonTextApplied,
                      ]}>
                        {isApplied ? 'Applied' : isLocked ? 'Locked' : 'Apply Theme'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.spacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    backgroundColor: '#fff',
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    marginBottom: 10,
  },
  backButtonText: {
    fontSize: 16,
    color: '#FF6B6B',
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 4,
  },
  categoriesContainer: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  categoriesContent: {
    paddingHorizontal: 20,
    paddingVertical: 15,
    gap: 10,
  },
  categoryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    marginRight: 10,
  },
  categoryButtonActive: {
    backgroundColor: '#4ECDC4',
  },
  categoryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  categoryButtonTextActive: {
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 100,
  },
  loadingText: {
    marginTop: 15,
    fontSize: 16,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 100,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
  },
  themesGrid: {
    padding: 20,
    gap: 20,
  },
  themeCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  themeImageContainer: {
    position: 'relative',
    width: '100%',
    height: 200,
    backgroundColor: '#E0E0E0',
  },
  themeImage: {
    width: '100%',
    height: '100%',
  },
  themeImageLocked: {
    opacity: 0.5,
  },
  lockOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  lockIcon: {
    fontSize: 48,
    marginBottom: 10,
  },
  lockText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  appliedBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#4CAF50',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  appliedBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  themeInfo: {
    padding: 15,
  },
  themeName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 6,
  },
  themeDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 15,
    lineHeight: 20,
  },
  applyButton: {
    backgroundColor: '#4ECDC4',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  applyButtonApplied: {
    backgroundColor: '#E0E0E0',
  },
  applyButtonLocked: {
    backgroundColor: '#9E9E9E',
  },
  applyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  applyButtonTextApplied: {
    color: '#666',
  },
  spacer: {
    height: 40,
  },
});
