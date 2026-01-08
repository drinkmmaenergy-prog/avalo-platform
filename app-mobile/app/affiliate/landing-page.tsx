/**
 * PACK 131: Affiliate Landing Page Builder
 * Allows affiliates to create custom landing pages
 * With pre-approved templates only
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
} from 'react-native';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';

const TEMPLATES = {
  default: {
    id: 'default',
    name: 'Default',
    title: 'Join Avalo',
    description: 'Connect with amazing people on Avalo',
  },
  influencer: {
    id: 'influencer',
    name: 'Influencer',
    title: 'Join me on Avalo',
    description: "I'm on Avalo and you should join too!",
  },
  minimal: {
    id: 'minimal',
    name: 'Minimal',
    title: 'Avalo',
    description: 'Social connection platform',
  },
};

interface LandingPageData {
  templateId: string;
  customPhoto?: string;
  socialLinks: {
    instagram?: string;
    twitter?: string;
    youtube?: string;
    tiktok?: string;
  };
}

export default function AffiliateLandingPageBuilder() {
  const auth = getAuth();
  const [selectedTemplate, setSelectedTemplate] = useState('default');
  const [customPhoto, setCustomPhoto] = useState('');
  const [socialLinks, setSocialLinks] = useState({
    instagram: '',
    twitter: '',
    youtube: '',
    tiktok: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    try {
      setSaving(true);

      // Validate social links
      const validatedLinks: any = {};
      if (socialLinks.instagram) {
        if (!isValidSocialLink(socialLinks.instagram, 'instagram')) {
          Alert.alert('Error', 'Invalid Instagram URL');
          return;
        }
        validatedLinks.instagram = socialLinks.instagram;
      }
      if (socialLinks.twitter) {
        if (!isValidSocialLink(socialLinks.twitter, 'twitter')) {
          Alert.alert('Error', 'Invalid Twitter URL');
          return;
        }
        validatedLinks.twitter = socialLinks.twitter;
      }
      if (socialLinks.youtube) {
        if (!isValidSocialLink(socialLinks.youtube, 'youtube')) {
          Alert.alert('Error', 'Invalid YouTube URL');
          return;
        }
        validatedLinks.youtube = socialLinks.youtube;
      }
      if (socialLinks.tiktok) {
        if (!isValidSocialLink(socialLinks.tiktok, 'tiktok')) {
          Alert.alert('Error', 'Invalid TikTok URL');
          return;
        }
        validatedLinks.tiktok = socialLinks.tiktok;
      }

      const functions = getFunctions();
      const updateLandingPage = httpsCallable(functions, 'affiliateUpdateLandingPage');

      await updateLandingPage({
        affiliateId: 'aff_123', // Would get from profile
        templateId: selectedTemplate,
        customPhoto: customPhoto || undefined,
        socialLinks: validatedLinks,
      });

      Alert.alert('Success', 'Landing page updated successfully');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update landing page');
    } finally {
      setSaving(false);
    }
  };

  const isValidSocialLink = (url: string, platform: string): boolean => {
    const patterns: Record<string, RegExp> = {
      instagram: /^https?:\/\/(www\.)?instagram\.com\//,
      twitter: /^https?:\/\/(www\.)?(twitter|x)\.com\//,
      youtube: /^https?:\/\/(www\.)?youtube\.com\//,
      tiktok: /^https?:\/\/(www\.)?tiktok\.com\//,
    };

    return patterns[platform]?.test(url) || false;
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Landing Page Builder</Text>
        <Text style={styles.subtitle}>
          Create a custom landing page to share your referral link
        </Text>
      </View>

      {/* Template Selection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Select Template</Text>
        <View style={styles.templateGrid}>
          {Object.values(TEMPLATES).map((template) => (
            <TouchableOpacity
              key={template.id}
              style={[
                styles.templateCard,
                selectedTemplate === template.id && styles.templateCardSelected,
              ]}
              onPress={() => setSelectedTemplate(template.id)}
            >
              <Text style={styles.templateName}>{template.name}</Text>
              <Text style={styles.templateDescription}>{template.description}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Preview */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preview</Text>
        <View style={styles.preview}>
          <Text style={styles.previewTitle}>
            {TEMPLATES[selectedTemplate as keyof typeof TEMPLATES].title}
          </Text>
          <Text style={styles.previewDescription}>
            {TEMPLATES[selectedTemplate as keyof typeof TEMPLATES].description}
          </Text>
          
          {customPhoto && (
            <View style={styles.previewImage}>
              <Text style={styles.previewImagePlaceholder}>📷 Photo Preview</Text>
            </View>
          )}

          <View style={styles.previewButtons}>
            <View style={styles.previewButton}>
              <Text style={styles.previewButtonText}>Download App</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Custom Photo */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Custom Photo (Optional)</Text>
        <Text style={styles.helperText}>
          Add a photo URL to personalize your landing page
        </Text>
        <TextInput
          style={styles.input}
          placeholder="https://example.com/photo.jpg"
          value={customPhoto}
          onChangeText={setCustomPhoto}
          autoCapitalize="none"
        />
      </View>

      {/* Social Links */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Social Links (Optional)</Text>
        <Text style={styles.helperText}>
          Add your social media profiles to build trust
        </Text>

        <View style={styles.socialInput}>
          <Text style={styles.socialLabel}>Instagram</Text>
          <TextInput
            style={styles.input}
            placeholder="https://instagram.com/username"
            value={socialLinks.instagram}
            onChangeText={(text) => setSocialLinks({ ...socialLinks, instagram: text })}
            autoCapitalize="none"
          />
        </View>

        <View style={styles.socialInput}>
          <Text style={styles.socialLabel}>Twitter / X</Text>
          <TextInput
            style={styles.input}
            placeholder="https://twitter.com/username"
            value={socialLinks.twitter}
            onChangeText={(text) => setSocialLinks({ ...socialLinks, twitter: text })}
            autoCapitalize="none"
          />
        </View>

        <View style={styles.socialInput}>
          <Text style={styles.socialLabel}>YouTube</Text>
          <TextInput
            style={styles.input}
            placeholder="https://youtube.com/channel/..."
            value={socialLinks.youtube}
            onChangeText={(text) => setSocialLinks({ ...socialLinks, youtube: text })}
            autoCapitalize="none"
          />
        </View>

        <View style={styles.socialInput}>
          <Text style={styles.socialLabel}>TikTok</Text>
          <TextInput
            style={styles.input}
            placeholder="https://tiktok.com/@username"
            value={socialLinks.tiktok}
            onChangeText={(text) => setSocialLinks({ ...socialLinks, tiktok: text })}
            autoCapitalize="none"
          />
        </View>
      </View>

      {/* Restrictions Notice */}
      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>⚠️ Content Restrictions</Text>
        <Text style={styles.noticeText}>
          • Cannot make monetization promises{'\n'}
          • Cannot advertise "earn money on Avalo"{'\n'}
          • Cannot imply escort or sexual services{'\n'}
          • Cannot claim explicit content is available{'\n'}
          • Must use pre-approved templates
        </Text>
      </View>

      {/* Save Button */}
      <TouchableOpacity
        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        <Text style={styles.saveButtonText}>
          {saving ? 'Saving...' : 'Save Landing Page'}
        </Text>
      </TouchableOpacity>

      <View style={styles.spacing} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  header: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#8E8E93',
  },
  section: {
    backgroundColor: '#FFFFFF',
    marginTop: 16,
    padding: 20,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E5E5EA',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 12,
  },
  helperText: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 12,
  },
  templateGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  templateCard: {
    flex: 1,
    minWidth: '45%',
    padding: 16,
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  templateCardSelected: {
    borderColor: '#007AFF',
    backgroundColor: '#E3F2FD',
  },
  templateName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 4,
  },
  templateDescription: {
    fontSize: 14,
    color: '#8E8E93',
  },
  preview: {
    padding: 20,
    backgroundColor: '#F9F9F9',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  previewTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000000',
    textAlign: 'center',
    marginBottom: 12,
  },
  previewDescription: {
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 20,
  },
  previewImage: {
    height: 120,
    backgroundColor: '#E5E5EA',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  previewImagePlaceholder: {
    fontSize: 16,
    color: '#8E8E93',
  },
  previewButtons: {
    alignItems: 'center',
  },
  previewButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  previewButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#F2F2F7',
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
    color: '#000000',
  },
  socialInput: {
    marginBottom: 16,
  },
  socialLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000000',
    marginBottom: 8,
  },
  notice: {
    margin: 16,
    padding: 16,
    backgroundColor: '#FFF3CD',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFC107',
  },
  noticeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#856404',
    marginBottom: 8,
  },
  noticeText: {
    fontSize: 14,
    color: '#856404',
    lineHeight: 20,
  },
  saveButton: {
    backgroundColor: '#007AFF',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#8E8E93',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  spacing: {
    height: 40,
  },
});
