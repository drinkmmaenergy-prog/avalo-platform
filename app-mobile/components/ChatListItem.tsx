import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Timestamp } from 'firebase/firestore';

interface ChatListItemProps {
  chatId: string;
  otherUserName: string;
  otherUserPhoto?: string;
  lastMessage: string;
  lastTimestamp: Timestamp;
  unreadCount: number;
  onPress: (chatId: string) => void;
  // PACK 42: Media lock indicator
  isLockedMedia?: boolean;
}

export const ChatListItem: React.FC<ChatListItemProps> = ({
  chatId,
  otherUserName,
  otherUserPhoto,
  lastMessage,
  lastTimestamp,
  unreadCount,
  onPress,
  isLockedMedia = false,
}) => {
  const formatTimestamp = (timestamp: Timestamp) => {
    try {
      const date = timestamp.toDate();
      const now = new Date();
      const diff = now.getTime() - date.getTime();
      const diffHours = Math.floor(diff / (1000 * 60 * 60));
      const diffDays = Math.floor(diff / (1000 * 60 * 60 * 24));

      if (diffHours < 1) {
        const diffMinutes = Math.floor(diff / (1000 * 60));
        return diffMinutes < 1 ? 'now' : `${diffMinutes}m`;
      } else if (diffHours < 24) {
        return `${diffHours}h`;
      } else if (diffDays < 7) {
        return `${diffDays}d`;
      } else {
        const month = date.getMonth() + 1;
        const day = date.getDate();
        return `${month}/${day}`;
      }
    } catch (error) {
      return '';
    }
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => onPress(chatId)}
      activeOpacity={0.7}
    >
      <View style={styles.avatarContainer}>
        {otherUserPhoto ? (
          <Image source={{ uri: otherUserPhoto }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarText}>
              {otherUserName.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
      </View>
      
      <View style={styles.contentContainer}>
        <View style={styles.headerRow}>
          <Text style={styles.name} numberOfLines={1}>
            {otherUserName}
          </Text>
          <Text style={styles.timestamp}>{formatTimestamp(lastTimestamp)}</Text>
        </View>
        
        <View style={styles.messageRow}>
          {/* PACK 42: Media lock icon */}
          {isLockedMedia && (
            <Text style={styles.mediaLockIcon}>🔒</Text>
          )}
          <Text
            style={[
              styles.lastMessage,
              unreadCount > 0 && styles.unreadMessage
            ]}
            numberOfLines={1}
          >
            {lastMessage}
          </Text>
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  avatarContainer: {
    marginRight: 12,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarPlaceholder: {
    backgroundColor: '#FF6B6B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    flex: 1,
    marginRight: 8,
  },
  timestamp: {
    fontSize: 12,
    color: '#999',
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mediaLockIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  lastMessage: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  unreadMessage: {
    fontWeight: '600',
    color: '#000',
  },
  unreadBadge: {
    backgroundColor: '#FF6B6B',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginLeft: 8,
  },
  unreadText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
});
