/**
 * Create Premium Story Screen
 * Upload interface for creators to publish premium stories
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useUploadPremiumStory } from '../hooks/usePremiumStories';
import { PREMIUM_STORIES_CONFIG } from '../config/monetization';
import type { PremiumStoryUploadData } from '../types/premiumStories';

interface CreatePremiumStoryScreenProps {
  userId: string;
  onSuccess: (storyId: string) => void;
  onCancel: () => void;
}

export default function CreatePremiumStoryScreen({ 
  userId, 
  onSuccess, 
  onCancel 
}: CreatePremiumStoryScreenProps) {
  const [media, setMedia] = useState<{ uri: string; type: 'image' | 'video' } | null>(null);
  const [price, setPrice] = useState<string>('100');
  
  const { upload, uploading, progress, error } = useUploadPremiumStory();

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [9, 16],
      quality: 1,
    });

    if (!result.canceled) {
      setMedia({
        uri: result.assets[0].uri,
        type: 'image',
      });
    }
  };

  const pickVideo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: true,
      aspect: [9, 16],
      quality: 1,
      videoMaxDuration: PREMIUM_STORIES_CONFIG.MAX_VIDEO_DURATION_SECONDS,
    });

    if (!result.canceled) {
      setMedia({
        uri: result.assets[0].uri,
        type: 'video',
      });
    }
  };

  const handlePublish = async () => {
    if (!media) {
      Alert.alert('Error', 'Please select media first');
      return;
    }

    const priceNum = parseInt(price, 10);
    
    if (isNaN(priceNum) || priceNum < PREMIUM_STORIES_CONFIG.MIN_PRICE || priceNum > PREMIUM_STORIES_CONFIG.MAX_PRICE) {
      Alert.alert(
        'Invalid Price',
        `Price must be between ${PREMIUM_STORIES_CONFIG.MIN_PRICE} and ${PREMIUM_STORIES_CONFIG.MAX_PRICE} tokens`
      );
      return;
    }

    const uploadData: PremiumStoryUploadData = {
      uri: media.uri,
      type: media.type,
      price: priceNum,
    };

    const storyId = await upload(userId, uploadData);
    
    if (storyId) {
      Alert.alert('Success', 'Story published!', [
        { text: 'OK', onPress: () => onSuccess(storyId) }
      ]);
    }
  };

  const suggestedPrices = PREMIUM_STORIES_CONFIG.SUGGESTED_PRICES;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onCancel}>
          <Text style={styles.cancelButton}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Create Premium Story</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Media Preview */}
      {media ? (
        <View style={styles.previewContainer}>
          <Image source={{ uri: media.uri }} style={styles.preview} />
          <TouchableOpacity 
            style={styles.changeMediaButton}
            onPress={pickImage}
          >
            <Text style={styles.changeMediaText}>Change</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.pickerContainer}>
          <Text style={styles.pickerTitle}>Select Media</Text>
          <TouchableOpacity style={styles.pickerButton} onPress={pickImage}>
            <Text style={styles.pickerButtonText}>📷 Choose Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.pickerButton} onPress={pickVideo}>
            <Text style={styles.pickerButtonText}>🎥 Choose Video</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Price Selection */}
      <View style={styles.priceContainer}>
        <Text style={styles.sectionTitle}>Set Price (Tokens)</Text>
        <Text style={styles.sectionSubtitle}>
          You earn 65% · Avalo takes 35%
        </Text>
        
        <TextInput
          style={styles.priceInput}
          value={price}
          onChangeText={setPrice}
          keyboardType="numeric"
          placeholder="Enter price"
          placeholderTextColor="#666"
        />

        <View style={styles.suggestedPrices}>
          {suggestedPrices.map((p) => (
            <TouchableOpacity
              key={p}
              style={[
                styles.suggestedPriceButton,
                price === p.toString() && styles.suggestedPriceButtonActive,
              ]}
              onPress={() => setPrice(p.toString())}
            >
              <Text
                style={[
                  styles.suggestedPriceText,
                  price === p.toString() && styles.suggestedPriceTextActive,
                ]}
              >
                {p} 🪙
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Earnings Calculator */}
        {price && !isNaN(parseInt(price, 10)) && (
          <View style={styles.earningsInfo}>
            <Text style={styles.earningsText}>
              You will earn: {Math.floor(parseInt(price, 10) * 0.65)} tokens per unlock
            </Text>
          </View>
        )}
      </View>

      {/* Upload Progress */}
      {uploading && progress && (
        <View style={styles.progressContainer}>
          <Text style={styles.progressStage}>{progress.message}</Text>
          <View style={styles.progressBar}>
            <View 
              style={[styles.progressFill, { width: `${progress.progress}%` }]} 
            />
          </View>
          <Text style={styles.progressText}>{Math.round(progress.progress)}%</Text>
        </View>
      )}

      {/* Error */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Publish Button */}
      <TouchableOpacity
        style={[styles.publishButton, uploading && styles.publishButtonDisabled]}
        onPress={handlePublish}
        disabled={uploading || !media}
      >
        {uploading ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={styles.publishButtonText}>Publish Story</Text>
        )}
      </TouchableOpacity>

      {/* Info */}
      <View style={styles.infoContainer}>
        <Text style={styles.infoTitle}>💡 Premium Story Info</Text>
        <Text style={styles.infoText}>
          • Users must pay tokens to unlock{'\n'}
          • Access lasts 24 hours{'\n'}
          • Anti-screenshot protection enabled{'\n'}
          • You earn 65% of each unlock
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  cancelButton: {
    fontSize: 16,
    color: '#fff',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  previewContainer: {
    margin: 16,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  preview: {
    width: '100%',
    aspectRatio: 9 / 16,
    backgroundColor: '#1a1a1a',
  },
  changeMediaButton: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  changeMediaText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  pickerContainer: {
    margin: 16,
    padding: 32,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    alignItems: 'center',
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
  },
  pickerButton: {
    width: '100%',
    backgroundColor: '#333',
    paddingVertical: 16,
    borderRadius: 8,
    marginBottom: 12,
    alignItems: 'center',
  },
  pickerButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  priceContainer: {
    margin: 16,
    padding: 16,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#999',
    marginBottom: 12,
  },
  priceInput: {
    backgroundColor: '#333',
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    padding: 16,
    borderRadius: 8,
    textAlign: 'center',
    marginBottom: 16,
  },
  suggestedPrices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  suggestedPriceButton: {
    backgroundColor: '#333',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  suggestedPriceButtonActive: {
    backgroundColor: '#FFD700',
  },
  suggestedPriceText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  suggestedPriceTextActive: {
    color: '#000',
  },
  earningsInfo: {
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    padding: 12,
    borderRadius: 8,
  },
  earningsText: {
    fontSize: 14,
    color: '#FFD700',
    textAlign: 'center',
  },
  progressContainer: {
    margin: 16,
    padding: 16,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
  },
  progressStage: {
    fontSize: 14,
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#333',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#FFD700',
  },
  progressText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
  errorContainer: {
    margin: 16,
    padding: 16,
    backgroundColor: 'rgba(255, 0, 0, 0.1)',
    borderRadius: 12,
  },
  errorText: {
    fontSize: 14,
    color: '#ff4444',
    textAlign: 'center',
  },
  publishButton: {
    margin: 16,
    backgroundColor: '#FFD700',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  publishButtonDisabled: {
    opacity: 0.5,
  },
  publishButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
  },
  infoContainer: {
    margin: 16,
    padding: 16,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    marginBottom: 32,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 12,
    color: '#999',
    lineHeight: 20,
  },
});
