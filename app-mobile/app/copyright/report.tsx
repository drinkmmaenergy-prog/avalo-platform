/**
 * PACK 146 — Copyright Report Screen
 * File copyright infringement claims
 */

import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { functions } from "@/lib/firebase";
import { httpsCallable } from 'firebase/functions';

export default function CopyrightReportScreen() {
  const params = useLocalSearchParams();
  const { originalContentId, infringingContentId } = params;
  
  const [description, setDescription] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [claimType, setClaimType] = useState('UNAUTHORIZED_UPLOAD');
  const [loading, setLoading] = useState(false);

  const claimTypes = [
    { value: 'UNAUTHORIZED_UPLOAD', label: 'Unauthorized Upload' },
    { value: 'SCREENSHOT_THEFT', label: 'Screenshot Theft' },
    { value: 'SCREEN_RECORDING', label: 'Screen Recording' },
    { value: 'RESALE', label: 'Unauthorized Resale' },
    { value: 'EXTERNAL_LEAK', label: 'External Leak' },
  ];

  const handleSubmitClaim = async () => {
    if (!description.trim()) {
      Alert.alert('Error', 'Please provide a description of the infringement');
      return;
    }

    setLoading(true);

    try {
      const fileClaim = httpsCallable(functions, 'fileCopyrightClaim');
      const result = await fileClaim({
        originalContentId,
        infringingContentId,
        claimType,
        description: description.trim(),
        evidenceUrls: evidenceUrl ? [evidenceUrl.trim()] : [],
      });

      const data = result.data as any;

      if (data.success) {
        Alert.alert(
          'Claim Submitted',
          'Your copyright claim has been submitted and is being reviewed.',
          [
            {
              text: 'OK',
              onPress: () => router.back(),
            },
          ]
        );
      }
    } catch (error: any) {
      console.error('Copyright claim error:', error);
      Alert.alert('Error', error.message || 'Failed to submit claim');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Report Copyright Infringement',
          headerBackTitle: 'Back',
        }}
      />
      <ScrollView className="flex-1 bg-gray-50 dark:bg-gray-900">
        <View className="p-4 space-y-6">
          {/* Info Card */}
          <View className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
            <Text className="text-blue-900 dark:text-blue-100 font-semibold mb-2">
              Copyright Protection
            </Text>
            <Text className="text-blue-700 dark:text-blue-300 text-sm">
              Your claim will be reviewed by our AI system and moderation team. 
              False claims may result in penalties.
            </Text>
          </View>

          {/* Claim Type */}
          <View>
            <Text className="text-gray-900 dark:text-white font-semibold mb-3">
              Type of Infringement
            </Text>
            <View className="space-y-2">
              {claimTypes.map((type) => (
                <TouchableOpacity
                  key={type.value}
                  className={`p-4 rounded-lg border-2 ${
                    claimType === type.value
                      ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                  }`}
                  onPress={() => setClaimType(type.value)}
                >
                  <Text
                    className={`font-medium ${
                      claimType === type.value
                        ? 'text-red-900 dark:text-red-100'
                        : 'text-gray-900 dark:text-white'
                    }`}
                  >
                    {type.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Description */}
          <View>
            <Text className="text-gray-900 dark:text-white font-semibold mb-3">
              Description *
            </Text>
            <TextInput
              className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white"
              placeholder="Describe the infringement..."
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={6}
              textAlignVertical="top"
              value={description}
              onChangeText={setDescription}
            />
          </View>

          {/* Evidence URL */}
          <View>
            <Text className="text-gray-900 dark:text-white font-semibold mb-3">
              Evidence URL (Optional)
            </Text>
            <TextInput
              className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white"
              placeholder="https://..."
              placeholderTextColor="#9CA3AF"
              value={evidenceUrl}
              onChangeText={setEvidenceUrl}
              autoCapitalize="none"
              keyboardType="url"
            />
          </View>

          {/* Warning */}
          <View className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg">
            <Text className="text-yellow-900 dark:text-yellow-100 font-semibold mb-2">
              ⚠️ Important
            </Text>
            <Text className="text-yellow-700 dark:text-yellow-300 text-sm">
              • False claims will be penalized{'\n'}
              • Stolen NSFW content results in instant ban{'\n'}
              • Claims are typically reviewed within 48 hours{'\n'}
              • You'll be notified of the outcome
            </Text>
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            className={`p-4 rounded-lg ${
              loading || !description.trim()
                ? 'bg-gray-300 dark:bg-gray-700'
                : 'bg-red-600'
            }`}
            onPress={handleSubmitClaim}
            disabled={loading || !description.trim()}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white text-center font-bold text-lg">
                Submit Claim
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </>
  );
}
