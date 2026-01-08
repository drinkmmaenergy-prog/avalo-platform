import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from "@/contexts/AuthContext";
import { ChatListItem } from "@/components/ChatListItem";
import { TokenBadge } from "@/components/TokenBadge";
import { EmotionalInboxCard } from "@/components/EmotionalInboxCard";
import { useEmotionalInbox } from "@/hooks/useEmotionalInbox";
import {
  subscribeToUserChats,
  Chat,
  ChatWithUserData,
} from "@/services/chatService";
import { getChatMessages } from "@/services/chatMediaService";

export default function ChatInboxScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [chats, setChats] = useState<ChatWithUserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // PACK 42: Track which chats have locked media as last message
  const [lockedMediaChats, setLockedMediaChats] = useState<Set<string>>(new Set());
  
  // Emotional Inbox integration
  const { summaries: emotionalSummaries, refresh: refreshEmotional } = useEmotionalInbox(chats);

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }

    // Subscribe to user's chats
    const unsubscribe = subscribeToUserChats(
      user.uid,
      async (updatedChats) => {
        // Process chats to add user data
        const chatsWithUserData: ChatWithUserData[] = updatedChats.map((chat) => {
          const otherUserId = chat.participants.find((id) => id !== user.uid);
          return {
            ...chat,
            otherUserName: otherUserId || 'Unknown User',
            otherUserPhoto: undefined, // TODO: Fetch from user profile
          };
        });
        
        setChats(chatsWithUserData);
        
        // PACK 42: Check for locked media in last messages
        const lockedSet = new Set<string>();
        for (const chat of updatedChats) {
          try {
            const messages = await getChatMessages(chat.id);
            if (messages.length > 0) {
              const lastMsg = messages[messages.length - 1];
              // Check if last message is locked media and receiver hasn't unlocked
              if (lastMsg.payToUnlock && lastMsg.senderId !== user.uid) {
                const isUnlocked = lastMsg.unlockedBy?.includes(user.uid);
                if (!isUnlocked) {
                  lockedSet.add(chat.id);
                }
              }
            }
          } catch (error) {
            console.error('Error checking locked media:', error);
          }
        }
        setLockedMediaChats(lockedSet);
        
        setLoading(false);
        setRefreshing(false);
      },
      (error) => {
        console.error('Error subscribing to chats:', error);
        setLoading(false);
        setRefreshing(false);
      }
    );

    // Cleanup subscription
    return () => {
      unsubscribe();
    };
  }, [user?.uid]);

  const handleChatPress = (chatId: string) => {
    router.push(`/chat/${chatId}` as any);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    // Refresh emotional inbox data
    try {
      await refreshEmotional();
    } catch (error) {
      console.error('Error refreshing emotional inbox:', error);
    }
    // The subscription will automatically update
  };

  if (!user) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Please sign in to view chats</Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF6B6B" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Messages</Text>
        <TokenBadge />
      </View>
      
      {/* Emotional Inbox Card */}
      {emotionalSummaries.length > 0 && (
        <EmotionalInboxCard summaries={emotionalSummaries} />
      )}
      
      {chats.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No messages yet</Text>
          <Text style={styles.emptySubtext}>
            Start a conversation by sending an icebreaker
          </Text>
        </View>
      ) : (
        <FlatList
          data={chats}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const otherUserId = item.participants.find((id) => id !== user.uid);
            const unreadCount = item.unreadCountPerUser?.[user.uid] || 0;
            
            return (
              <ChatListItem
                chatId={item.id}
                otherUserName={item.otherUserName || 'User'}
                otherUserPhoto={item.otherUserPhoto}
                lastMessage={item.lastMessage}
                lastTimestamp={item.lastTimestamp}
                unreadCount={unreadCount}
                onPress={handleChatPress}
                isLockedMedia={lockedMediaChats.has(item.id)}
              />
            );
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#FF6B6B"
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
});

