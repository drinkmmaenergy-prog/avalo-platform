import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { router } from 'expo-router';

export default function AcceleratorApplyScreen() {
  const [formData, setFormData] = useState({
    userName: '',
    email: '',
    portfolioUrl: '',
    youtube: '',
    instagram: '',
    twitter: '',
    tiktok: '',
    goals: '',
    experience: '',
    businessPlan: '',
    whyAccelerator: '',
    commitment: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!formData.userName || !formData.email || !formData.goals || !formData.experience) {
      Alert.alert('Missing Information', 'Please fill in all required fields');
      return;
    }

    if (!formData.businessPlan || !formData.whyAccelerator || !formData.commitment) {
      Alert.alert('Missing Information', 'Please complete all application questions');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(
        'https://us-central1-avalo-c8c46.cloudfunctions.net/applyToAccelerator',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            data: {
              userName: formData.userName,
              email: formData.email,
              portfolioUrl: formData.portfolioUrl,
              socialLinks: {
                youtube: formData.youtube,
                instagram: formData.instagram,
                twitter: formData.twitter,
                tiktok: formData.tiktok,
              },
              goals: formData.goals,
              experience: formData.experience,
              businessPlan: formData.businessPlan,
              whyAccelerator: formData.whyAccelerator,
              commitment: formData.commitment,
            },
          }),
        }
      );

      const result = await response.json();

      if (result.result.success) {
        Alert.alert(
          'Application Submitted!',
          'Your application has been submitted successfully. We will review it and get back to you soon.',
          [
            {
              text: 'OK',
              onPress: () => router.back(),
            },
          ]
        );
      } else {
        Alert.alert('Error', result.result.message || 'Failed to submit application');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to submit application. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Join the Creator Accelerator</Text>
        <Text style={styles.subtitle}>
          Professional growth program with mentorship, workshops, and funding
        </Text>
      </View>

      <View style={styles.ethicsBanner}>
        <Text style={styles.ethicsTitle}>✓ Zero Exploitation Policy</Text>
        <Text style={styles.ethicsText}>
          Selection is merit-based only. No romantic pressure, beauty standards, or favoritism.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Basic Information</Text>

        <Text style={styles.label}>Full Name *</Text>
        <TextInput
          style={styles.input}
          value={formData.userName}
          onChangeText={(text) => updateField('userName', text)}
          placeholder="Enter your full name"
        />

        <Text style={styles.label}>Email *</Text>
        <TextInput
          style={styles.input}
          value={formData.email}
          onChangeText={(text) => updateField('email', text)}
          placeholder="your@email.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Text style={styles.label}>Portfolio URL</Text>
        <TextInput
          style={styles.input}
          value={formData.portfolioUrl}
          onChangeText={(text) => updateField('portfolioUrl', text)}
          placeholder="https://your-portfolio.com"
          autoCapitalize="none"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Social Media (Optional)</Text>

        <Text style={styles.label}>YouTube</Text>
        <TextInput
          style={styles.input}
          value={formData.youtube}
          onChangeText={(text) => updateField('youtube', text)}
          placeholder="YouTube channel URL"
          autoCapitalize="none"
        />

        <Text style={styles.label}>Instagram</Text>
        <TextInput
          style={styles.input}
          value={formData.instagram}
          onChangeText={(text) => updateField('instagram', text)}
          placeholder="Instagram profile URL"
          autoCapitalize="none"
        />

        <Text style={styles.label}>Twitter/X</Text>
        <TextInput
          style={styles.input}
          value={formData.twitter}
          onChangeText={(text) => updateField('twitter', text)}
          placeholder="Twitter profile URL"
          autoCapitalize="none"
        />

        <Text style={styles.label}>TikTok</Text>
        <TextInput
          style={styles.input}
          value={formData.tiktok}
          onChangeText={(text) => updateField('tiktok', text)}
          placeholder="TikTok profile URL"
          autoCapitalize="none"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Application Questions</Text>

        <Text style={styles.label}>What are your content creation goals? *</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={formData.goals}
          onChangeText={(text) => updateField('goals', text)}
          placeholder="Describe your goals as a creator..."
          multiline
          numberOfLines={4}
        />

        <Text style={styles.label}>Describe your creator experience *</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={formData.experience}
          onChangeText={(text) => updateField('experience', text)}
          placeholder="Share your journey and experience..."
          multiline
          numberOfLines={4}
        />

        <Text style={styles.label}>What's your business plan? *</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={formData.businessPlan}
          onChangeText={(text) => updateField('businessPlan', text)}
          placeholder="How do you plan to grow your creator business?"
          multiline
          numberOfLines={4}
        />

        <Text style={styles.label}>Why do you want to join the accelerator? *</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={formData.whyAccelerator}
          onChangeText={(text) => updateField('whyAccelerator', text)}
          placeholder="What do you hope to gain from this program?"
          multiline
          numberOfLines={4}
        />

        <Text style={styles.label}>Can you commit to the program requirements? *</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={formData.commitment}
          onChangeText={(text) => updateField('commitment', text)}
          placeholder="Describe your commitment and availability..."
          multiline
          numberOfLines={4}
        />
      </View>

      <View style={styles.disclaimer}>
        <Text style={styles.disclaimerText}>
          By submitting this application, you acknowledge that selection is based strictly on
          professional merit, skills, and commitment—never on appearance, relationships, or
          personal favors.
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={isSubmitting}
      >
        <Text style={styles.submitButtonText}>
          {isSubmitting ? 'Submitting...' : 'Submit Application'}
        </Text>
      </TouchableOpacity>

      <View style={styles.spacer} />
    </ScrollView>
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
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 20,
  },
  ethicsBanner: {
    backgroundColor: '#dcfce7',
    padding: 16,
    margin: 16,
    borderRadius: 12,
  },
  ethicsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#166534',
    marginBottom: 4,
  },
  ethicsText: {
    fontSize: 13,
    color: '#166534',
    lineHeight: 18,
  },
  section: {
    backgroundColor: '#fff',
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#1e293b',
    backgroundColor: '#fff',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  disclaimer: {
    backgroundColor: '#fff',
    padding: 20,
    marginBottom: 16,
  },
  disclaimerText: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 18,
    fontStyle: 'italic',
  },
  submitButton: {
    backgroundColor: '#3b82f6',
    marginHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#cbd5e1',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  spacer: {
    height: 40,
  },
});
