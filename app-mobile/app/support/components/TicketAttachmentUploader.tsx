/**
 * PACK 300A - Ticket Attachment Uploader Component
 * Allows users to upload images, videos, and audio to support tickets
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Image,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

interface Attachment {
  uri: string;
  type: 'image' | 'video' | 'audio' | 'document';
  name: string;
  size?: number;
}

interface TicketAttachmentUploaderProps {
  attachments: Attachment[];
  onAttachmentsChange: (attachments: Attachment[]) => void;
  maxFiles?: number;
  maxSizeMB?: number;
}

export default function TicketAttachmentUploader({
  attachments,
  onAttachmentsChange,
  maxFiles = 5,
  maxSizeMB = 10,
}: TicketAttachmentUploaderProps) {
  const [uploading, setUploading] = useState(false);

  const requestPermissions = async () => {
    if (Platform.OS !== 'web') {
      const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
      const { status: libraryStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (cameraStatus !== 'granted' || libraryStatus !== 'granted') {
        Alert.alert(
          'Permissions Required',
          'Camera and photo library permissions are required to upload attachments.'
        );
        return false;
      }
    }
    return true;
  };

  const handlePickImage = async () => {
    if (attachments.length >= maxFiles) {
      Alert.alert('Limit Reached', `You can attach up to ${maxFiles} files.`);
      return;
    }

    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const newAttachment: Attachment = {
          uri: asset.uri,
          type: 'image',
          name: asset.fileName || 'image.jpg',
          size: asset.fileSize,
        };

        // Check file size
        if (asset.fileSize && asset.fileSize > maxSizeMB * 1024 * 1024) {
          Alert.alert('File Too Large', `Maximum file size is ${maxSizeMB}MB`);
          return;
        }

        onAttachmentsChange([...attachments, newAttachment]);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const handleTakePhoto = async () => {
    if (attachments.length >= maxFiles) {
      Alert.alert('Limit Reached', `You can attach up to ${maxFiles} files.`);
      return;
    }

    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const newAttachment: Attachment = {
          uri: asset.uri,
          type: 'image',
          name: asset.fileName || 'photo.jpg',
          size: asset.fileSize,
        };

        if (asset.fileSize && asset.fileSize > maxSizeMB * 1024 * 1024) {
          Alert.alert('File Too Large', `Maximum file size is ${maxSizeMB}MB`);
          return;
        }

        onAttachmentsChange([...attachments, newAttachment]);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const handleRemoveAttachment = (index: number) => {
    const newAttachments = attachments.filter((_, i) => i !== index);
    onAttachmentsChange(newAttachments);
  };

  const showAttachmentOptions = () => {
    Alert.alert(
      'Add Attachment',
      'Choose an option',
      [
        {
          text: 'Take Photo',
          onPress: handleTakePhoto,
        },
        {
          text: 'Choose from Library',
          onPress: handlePickImage,
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'image':
        return 'image-outline';
      case 'video':
        return 'videocam-outline';
      case 'audio':
        return 'musical-notes-outline';
      default:
        return 'document-outline';
    }
  };

  return (
    <View style={styles.container}>
      {/* Attachments List */}
      {attachments.length > 0 && (
        <View style={styles.attachmentsList}>
          {attachments.map((attachment, index) => (
            <View key={index} style={styles.attachmentItem}>
              {attachment.type === 'image' ? (
                <Image source={{ uri: attachment.uri }} style={styles.thumbnail} />
              ) : (
                <View style={styles.iconContainer}>
                  <Ionicons name={getFileIcon(attachment.type) as any} size={24} color="#6366f1" />
                </View>
              )}
              <View style={styles.attachmentInfo}>
                <Text style={styles.attachmentName} numberOfLines={1}>
                  {attachment.name}
                </Text>
                {attachment.size && (
                  <Text style={styles.attachmentSize}>
                    {(attachment.size / 1024 / 1024).toFixed(2)} MB
                  </Text>
                )}
              </View>
              <TouchableOpacity
                onPress={() => handleRemoveAttachment(index)}
                style={styles.removeButton}
              >
                <Ionicons name="close-circle" size={24} color="#ef4444" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Add Attachment Button */}
      {attachments.length < maxFiles && (
        <TouchableOpacity
          style={styles.addButton}
          onPress={showAttachmentOptions}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator size="small" color="#6366f1" />
          ) : (
            <>
              <Ionicons name="attach-outline" size={20} color="#6366f1" />
              <Text style={styles.addButtonText}>
                Add Attachment ({attachments.length}/{maxFiles})
              </Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  attachmentsList: {
    gap: 8,
  },
  attachmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 8,
    gap: 12,
  },
  thumbnail: {
    width: 50,
    height: 50,
    borderRadius: 8,
  },
  iconContainer: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  attachmentInfo: {
    flex: 1,
    gap: 2,
  },
  attachmentName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  attachmentSize: {
    fontSize: 12,
    color: '#6b7280',
  },
  removeButton: {
    padding: 4,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#6366f1',
    borderStyle: 'dashed',
    gap: 8,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6366f1',
  },
});
