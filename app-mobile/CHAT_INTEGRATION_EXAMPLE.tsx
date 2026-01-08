/**
 * Example: How to integrate Icebreaker Modal in Feed or Profile screens
 * 
 * This file demonstrates the integration pattern for the chat feature.
 * Copy this code into your Feed or Profile screens.
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import IcebreakerModal from './app/chat/icebreaker-modal';

// Example 1: Integration in Feed Screen
export function FeedScreenExample() {
  const [showIcebreaker, setShowIcebreaker] = useState(false);
  const [selectedUser, setSelectedUser] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const handleSendIcebreaker = (userId: string, userName: string) => {
    setSelectedUser({ id: userId, name: userName });
    setShowIcebreaker(true);
  };

  return (
    <View style={styles.container}>
      {/* Your existing feed content */}
      
      {/* User Card Example */}
      <View style={styles.userCard}>
        <Text style={styles.userName}>John Doe, 25</Text>
        <TouchableOpacity
          style={styles.icebreakerButton}
          onPress={() => handleSendIcebreaker('user123', 'John Doe')}
        >
          <Text style={styles.buttonText}>Send Icebreaker</Text>
        </TouchableOpacity>
      </View>

      {/* Icebreaker Modal */}
      <IcebreakerModal
        visible={showIcebreaker}
        onClose={() => {
          setShowIcebreaker(false);
          setSelectedUser(null);
        }}
        receiverId={selectedUser?.id || ''}
        receiverName={selectedUser?.name}
      />
    </View>
  );
}

// Example 2: Integration in Profile Screen
export function ProfileScreenExample() {
  const [showIcebreaker, setShowIcebreaker] = useState(false);
  
  // This would come from route params or API
  const profileUserId = 'user456';
  const profileUserName = 'Jane Smith';

  return (
    <View style={styles.container}>
      {/* Your existing profile content */}
      
      <View style={styles.profileHeader}>
        <Text style={styles.profileName}>{profileUserName}</Text>
        <Text style={styles.profileAge}>28</Text>
      </View>

      {/* Send Icebreaker Button */}
      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => setShowIcebreaker(true)}
      >
        <Text style={styles.buttonText}>Send Icebreaker</Text>
      </TouchableOpacity>

      {/* Icebreaker Modal */}
      <IcebreakerModal
        visible={showIcebreaker}
        onClose={() => setShowIcebreaker(false)}
        receiverId={profileUserId}
        receiverName={profileUserName}
      />
    </View>
  );
}

// Example 3: Integration with existing chat check
import { useRouter } from 'expo-router';
import { findExistingChat } from './services/chatService';
import { useAuth } from './contexts/AuthContext';

export function SmartChatButtonExample() {
  const router = useRouter();
  const { user } = useAuth();
  const [showIcebreaker, setShowIcebreaker] = useState(false);
  const [checkingChat, setCheckingChat] = useState(false);

  const targetUserId = 'user789';
  const targetUserName = 'Alice Brown';

  const handleStartChat = async () => {
    if (!user?.uid) return;

    setCheckingChat(true);
    try {
      // Check if chat already exists
      const existingChatId = await findExistingChat(user.uid, targetUserId);
      
      if (existingChatId) {
        // Navigate to existing chat
        router.push(`/chat/${existingChatId}` as any);
      } else {
        // Show icebreaker modal
        setShowIcebreaker(true);
      }
    } catch (error) {
      console.error('Error checking chat:', error);
    } finally {
      setCheckingChat(false);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.primaryButton}
        onPress={handleStartChat}
        disabled={checkingChat}
      >
        <Text style={styles.buttonText}>
          {checkingChat ? 'Checking...' : 'Message'}
        </Text>
      </TouchableOpacity>

      <IcebreakerModal
        visible={showIcebreaker}
        onClose={() => setShowIcebreaker(false)}
        receiverId={targetUserId}
        receiverName={targetUserName}
      />
    </View>
  );
}

// Styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  userCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  userName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  profileName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  profileAge: {
    fontSize: 18,
    color: '#666',
  },
  icebreakerButton: {
    backgroundColor: '#FF6B6B',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#FF6B6B',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginVertical: 16,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

/**
 * USAGE NOTES:
 * 
 * 1. Import the IcebreakerModal component
 * 2. Add state for modal visibility and selected user
 * 3. Add button/action to trigger modal
 * 4. Pass receiverId and receiverName to modal
 * 5. Modal handles everything else (create/open chat, send message, navigate)
 * 
 * REQUIRED PROPS:
 * - visible: boolean - Control modal visibility
 * - onClose: () => void - Called when modal should close
 * - receiverId: string - Target user's ID
 * - receiverName?: string - Optional display name
 * 
 * AUTOMATIC BEHAVIOR:
 * - If chat exists → opens existing chat with new message
 * - If no chat → creates new chat with icebreaker
 * - Automatically navigates to chat after sending
 * - Shows loading states and error handling
 * 
 * NO ADDITIONAL SETUP NEEDED:
 * - Firebase operations handled internally
 * - Error handling built-in
 * - Navigation automatic
 * - UI states managed
 */
