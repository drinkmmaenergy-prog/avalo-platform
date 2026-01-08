import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { auth, functions } from "@/lib/firebase";
import { httpsCallable } from 'firebase/functions';

interface StrategyProfile {
  id: string;
  personalBrand: {
    niche: string[];
    expertise: string[];
    targetAudience: string;
  };
  professionalGoals: {
    targetRole: string;
    timeline: string;
  };
}

export default function BrandStrategyHub() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<StrategyProfile | null>(null);
  const [hasProfile, setHasProfile] = useState(false);
  const user = auth.currentUser;

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const getProfile = httpsCallable(functions, 'getStrategyProfile');
      const result = await getProfile({ profileId: user.uid });
      
      if (result.data && (result.data as any).success) {
        setProfile((result.data as any).profile);
        setHasProfile(true);
      }
    } catch (error: any) {
      if (error.code !== 'functions/not-found') {
        console.error('Error loading profile:', error);
      }
      setHasProfile(false);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading your brand strategy...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!hasProfile) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView style={styles.content}>
          <View style={styles.welcomeCard}>
            <Ionicons name="rocket-outline" size={64} color="#007AFF" />
            <Text style={styles.welcomeTitle}>Build Your Professional Brand</Text>
            <Text style={styles.welcomeText}>
              Get AI-powered guidance to grow your creator career authentically,
              without sexualization or parasocial manipulation.
            </Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => router.push('/brand-strategy/questionnaire' as any)}
            >
              <Text style={styles.primaryButtonText}>Start Strategy</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>

          <View style={styles.featuresSection}>
            <Text style={styles.sectionTitle}>What You'll Get</Text>
            
            <FeatureCard
              icon="calendar-outline"
              title="Content Calendar"
              description="Weekly and monthly plans tailored to your niche"
            />
            <FeatureCard
              icon="map-outline"
              title="Career Roadmap"
              description="Step-by-step path to your professional goals"
            />
            <FeatureCard
              icon="trending-up-outline"
              title="Analytics Insights"
              description="Data-driven recommendations for growth"
            />
            <FeatureCard
              icon="shield-checkmark-outline"
              title="Safety First"
              description="No sexualization, beauty farming, or manipulation"
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Brand Strategy</Text>
          <TouchableOpacity
            onPress={() => router.push('/brand-strategy/profile-settings' as any)}
          >
            <Ionicons name="settings-outline" size={24} color="#007AFF" />
          </TouchableOpacity>
        </View>

        {profile && (
          <View style={styles.profileCard}>
            <Text style={styles.profileRole}>
              {formatRole(profile.professionalGoals.targetRole)}
            </Text>
            <Text style={styles.profileNiche}>
              {profile.personalBrand.niche.join(' • ')}
            </Text>
            <View style={styles.profileBadges}>
              <View style={styles.badge}>
                <Ionicons name="shield-checkmark" size={16} color="#10B981" />
                <Text style={styles.badgeText}>Safe Strategy</Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {profile.professionalGoals.timeline.replace('_', ' ')}
                </Text>
              </View>
            </View>
          </View>
        )}

        <View style={styles.quickActions}>
          <ActionCard
            icon="calendar"
            title="Content Calendar"
            description="View your upcoming content"
            color="#007AFF"
            onPress={() => router.push('/brand-strategy/calendar' as any)}
          />
          <ActionCard
            icon="map"
            title="Career Roadmap"
            description="Track your progress"
            color="#10B981"
            onPress={() => router.push('/brand-strategy/roadmap' as any)}
          />
          <ActionCard
            icon="analytics"
            title="Insights"
            description="See what's working"
            color="#F59E0B"
            onPress={() => router.push('/brand-strategy/insights' as any)}
          />
          <ActionCard
            icon="bulb"
            title="Suggestions"
            description="Get recommendations"
            color="#8B5CF6"
            onPress={() => router.push('/brand-strategy/suggestions' as any)}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function FeatureCard({ icon, title, description }: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <View style={styles.featureCard}>
      <View style={styles.featureIcon}>
        <Ionicons name={icon as any} size={24} color="#007AFF" />
      </View>
      <View style={styles.featureContent}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDescription}>{description}</Text>
      </View>
    </View>
  );
}

function ActionCard({ icon, title, description, color, onPress }: {
  icon: string;
  title: string;
  description: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.actionCard} onPress={onPress}>
      <View style={[styles.actionIcon, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon as any} size={24} color={color} />
      </View>
      <View style={styles.actionContent}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionDescription}>{description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
    </TouchableOpacity>
  );
}

function formatRole(role: string): string {
  const roles: Record<string, string> = {
    full_time_creator: 'Full-Time Creator',
    hybrid_creator: 'Hybrid Creator',
    educator: 'Educator',
    entertainer: 'Entertainer',
    coach_trainer: 'Coach/Trainer',
  };
  return roles[role] || role;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
  },
  welcomeCard: {
    margin: 20,
    padding: 32,
    backgroundColor: '#FFF',
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  welcomeTitle: {
    marginTop: 16,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
  },
  welcomeText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
  },
  primaryButton: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#007AFF',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  featuresSection: {
    marginHorizontal: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 16,
  },
  featureCard: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#FFF',
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  profileCard: {
    margin: 20,
    padding: 20,
    backgroundColor: '#FFF',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  profileRole: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  profileNiche: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 12,
  },
  profileBadges: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  quickActions: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFF',
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  actionDescription: {
    fontSize: 14,
    color: '#6B7280',
  },
});
