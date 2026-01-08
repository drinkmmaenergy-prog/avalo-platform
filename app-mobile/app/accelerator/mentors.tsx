import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import MentorCard from "@/components/accelerator/MentorCard";

interface Mentor {
  id: string;
  name: string;
  expertise: string[];
  bio: string;
  avatar?: string;
  yearsExperience: number;
  successfulMentees: number;
  rating: number;
  ethicsAgreementSigned: boolean;
}

export default function MentorsScreen() {
  const [mentors, setMentors] = useState<Mentor[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedExpertise, setSelectedExpertise] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMentors();
  }, []);

  const loadMentors = async () => {
    setLoading(true);
    try {
      const mockMentors: Mentor[] = [
        {
          id: '1',
          name: 'Sarah Johnson',
          expertise: ['Content Strategy', 'YouTube Growth', 'Brand Partnerships'],
          bio: 'Former YouTube creator with 2M+ subscribers. Helped 50+ creators build sustainable businesses.',
          yearsExperience: 8,
          successfulMentees: 52,
          rating: 4.9,
          ethicsAgreementSigned: true,
        },
        {
          id: '2',
          name: 'Michael Chen',
          expertise: ['Video Production', 'Editing', 'Production Quality'],
          bio: 'Award-winning video producer. Specialized in helping creators improve their production quality.',
          yearsExperience: 12,
          successfulMentees: 38,
          rating: 4.8,
          ethicsAgreementSigned: true,
        },
        {
          id: '3',
          name: 'Emma Rodriguez',
          expertise: ['Business Strategy', 'Monetization', 'Legal'],
          bio: 'Business consultant for creators. Expert in diversifying income streams and business planning.',
          yearsExperience: 10,
          successfulMentees: 45,
          rating: 4.9,
          ethicsAgreementSigned: true,
        },
        {
          id: '4',
          name: 'David Thompson',
          expertise: ['Social Media', 'Community Building', 'Engagement'],
          bio: 'Community manager and social media strategist. Focused on building authentic creator communities.',
          yearsExperience: 6,
          successfulMentees: 31,
          rating: 4.7,
          ethicsAgreementSigned: true,
        },
      ];

      setMentors(mockMentors);
    } catch (error) {
      Alert.alert('Error', 'Failed to load mentors');
    } finally {
      setLoading(false);
    }
  };

  const handleBookSession = (mentorId: string) => {
    router.push(`/accelerator/book-session?mentorId=${mentorId}`);
  };

  const expertiseAreas = [
    'All',
    'Content Strategy',
    'Video Production',
    'Business Strategy',
    'Social Media',
    'Monetization',
    'Brand Partnerships',
  ];

  const filteredMentors = mentors.filter((mentor) => {
    const matchesSearch =
      searchQuery === '' ||
      mentor.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      mentor.expertise.some((exp) => exp.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesExpertise =
      !selectedExpertise ||
      selectedExpertise === 'All' ||
      mentor.expertise.includes(selectedExpertise);

    return matchesSearch && matchesExpertise;
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Find Your Mentor</Text>
        <Text style={styles.subtitle}>
          Professional guidance from experienced creators
        </Text>
      </View>

      <View style={styles.ethicsBanner}>
        <Text style={styles.ethicsText}>
          ✓ All mentors verified • Professional boundaries only • Zero exploitation
        </Text>
      </View>

      <View style={styles.searchSection}>
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search mentors by name or expertise..."
          placeholderTextColor="#94a3b8"
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
        <View style={styles.filterContainer}>
          {expertiseAreas.map((expertise) => (
            <TouchableOpacity
              key={expertise}
              style={[
                styles.filterChip,
                selectedExpertise === expertise && styles.filterChipActive,
              ]}
              onPress={() =>
                setSelectedExpertise(expertise === 'All' ? null : expertise)
              }
            >
              <Text
                style={[
                  styles.filterChipText,
                  selectedExpertise === expertise && styles.filterChipTextActive,
                ]}
              >
                {expertise}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <ScrollView style={styles.mentorsList}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading mentors...</Text>
          </View>
        ) : filteredMentors.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No mentors found</Text>
            <Text style={styles.emptySubtext}>Try adjusting your filters</Text>
          </View>
        ) : (
          filteredMentors.map((mentor) => (
            <MentorCard
              key={mentor.id}
              mentor={mentor}
              onBookSession={handleBookSession}
            />
          ))
        )}

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>About Our Mentors</Text>
          <Text style={styles.infoText}>
            • All mentors have signed our professional ethics agreement
          </Text>
          <Text style={styles.infoText}>
            • Sessions are monitored for professionalism
          </Text>
          <Text style={styles.infoText}>
            • Strict no-favoritism policy enforced
          </Text>
          <Text style={styles.infoText}>
            • If anyone crosses the line — let us know immediately
          </Text>
        </View>

        <View style={styles.spacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
  },
  ethicsBanner: {
    backgroundColor: '#dcfce7',
    padding: 12,
    alignItems: 'center',
  },
  ethicsText: {
    fontSize: 12,
    color: '#166534',
    fontWeight: '600',
  },
  searchSection: {
    padding: 16,
    backgroundColor: '#fff',
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#1e293b',
  },
  filterScroll: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  filterChip: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#3b82f6',
  },
  filterChipText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#fff',
  },
  mentorsList: {
    flex: 1,
    padding: 16,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 14,
    color: '#64748b',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#94a3b8',
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginTop: 16,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 20,
    marginBottom: 6,
  },
  spacer: {
    height: 20,
  },
});
