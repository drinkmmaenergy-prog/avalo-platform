import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from "@/hooks/useAuth";
import { httpsCallable } from 'firebase/functions';
import { functions } from "@/lib/firebase";

interface AcceleratorStatus {
  hasApplication: boolean;
  applicationStatus?: 'draft' | 'pending' | 'under_review' | 'accepted' | 'rejected';
  canApply: boolean;
  isInProgram: boolean;
}

export default function AcceleratorHub() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<AcceleratorStatus | null>(null);

  useEffect(() => {
    loadAcceleratorStatus();
  }, [user]);

  const loadAcceleratorStatus = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      // Check if user has application
      const { data } = await httpsCallable(functions, 'getAcceleratorStatus')({ user_id: user.uid });
      setStatus(data as AcceleratorStatus);
    } catch (error) {
      console.error('Error loading accelerator status:', error);
      setStatus({
        hasApplication: false,
        canApply: true,
        isInProgram: false
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    router.push('/accelerator/apply');
  };

  const handleViewDashboard = () => {
    router.push('/accelerator/dashboard');
  };

  const handleViewTracks = () => {
    router.push('/accelerator/tracks');
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Global Creator Accelerator</Text>
        <Text style={styles.subtitle}>Please sign in to access the accelerator program</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => router.push('/auth/login')}
        >
          <Text style={styles.buttonText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Global Creator Accelerator</Text>
        <Text style={styles.subtitle}>
          Education · Funding · Tools · Growth
        </Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Zero Beauty Bias</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About the Program</Text>
        <Text style={styles.description}>
          Support for promising creators worldwide through education, mentorship,
          launch support and tools to scale your business — without rewarding
          attractiveness or flirting.
        </Text>
        <Text style={styles.description}>
          • Skill and productivity focused{'\n'}
          • Professional development only{'\n'}
          • No appearance-based advantages{'\n'}
          • Merit-based selection
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Available Tracks</Text>
        <TouchableOpacity style={styles.card} onPress={handleViewTracks}>
          <Text style={styles.cardTitle}>📱 Digital Products</Text>
          <Text style={styles.cardDescription}>eBooks, presets, templates</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.card} onPress={handleViewTracks}>
          <Text style={styles.cardTitle}>💪 Fitness & Wellness</Text>
          <Text style={styles.cardDescription}>Training plans, nutrition, mobility</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.card} onPress={handleViewTracks}>
          <Text style={styles.cardTitle}>📸 Photography & Art</Text>
          <Text style={styles.cardDescription}>Editing, composition, design</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.card} onPress={handleViewTracks}>
          <Text style={styles.cardTitle}>💼 Business & Productivity</Text>
          <Text style={styles.cardDescription}>Marketing, planning, entrepreneurship</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.card} onPress={handleViewTracks}>
          <Text style={styles.cardTitle}>🎮 Entertainment</Text>
          <Text style={styles.cardDescription}>Gaming, commentary, lifestyle shows</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.card} onPress={handleViewTracks}>
          <Text style={styles.cardTitle}>📚 Education</Text>
          <Text style={styles.cardDescription}>Tutoring, workshops, online learning</Text>
        </TouchableOpacity>
      </View>

      {status?.isInProgram && (
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={handleViewDashboard}
          >
            <Text style={styles.buttonText}>View My Dashboard</Text>
          </TouchableOpacity>
        </View>
      )}

      {status?.hasApplication && !status.isInProgram && (
        <View style={styles.section}>
          <View style={[styles.card, styles.statusCard]}>
            <Text style={styles.cardTitle}>Application Status</Text>
            <Text style={styles.statusText}>
              {status.applicationStatus?.toUpperCase() || 'UNKNOWN'}
            </Text>
            {status.applicationStatus === 'pending' && (
              <Text style={styles.cardDescription}>
                Your application is under review. You'll be notified of the decision.
              </Text>
            )}
            {status.applicationStatus === 'rejected' && (
              <Text style={styles.cardDescription}>
                Your application was not accepted. You may reapply after 30 days.
              </Text>
            )}
          </View>
        </View>
      )}

      {status?.canApply && !status.hasApplication && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ready to Apply?</Text>
          <Text style={styles.description}>
            Requirements:{'\n'}
            • 18+ years old{'\n'}
            • Verified identity (KYC){'\n'}
            • Business plan{'\n'}
            • SFW content samples{'\n'}
            • 5+ hours weekly availability
          </Text>
          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={handleApply}
          >
            <Text style={styles.buttonText}>Apply Now</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Merit-based selection • No beauty bias • Professional focus only
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5'
  },
  header: {
    backgroundColor: '#007AFF',
    padding: 24,
    alignItems: 'center'
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center'
  },
  subtitle: {
    fontSize: 16,
    color: '#FFFFFF',
    opacity: 0.9,
    textAlign: 'center'
  },
  badge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginTop: 12
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600'
  },
  section: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 12
  },
  description: {
    fontSize: 14,
    color: '#666666',
    lineHeight: 20,
    marginBottom: 12
  },
  card: {
    backgroundColor: '#F9F9F9',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0'
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 4
  },
  cardDescription: {
    fontSize: 14,
    color: '#666666'
  },
  statusCard: {
    backgroundColor: '#FFF3CD',
    borderColor: '#FFD700'
  },
  statusText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#007AFF',
    marginVertical: 8
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12
  },
  primaryButton: {
    backgroundColor: '#007AFF'
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600'
  },
  footer: {
    padding: 24,
    alignItems: 'center'
  },
  footerText: {
    fontSize: 12,
    color: '#999999',
    textAlign: 'center'
  }
});
