/**
 * EXAMPLE: Chat Screen Integration with Trust & Blocklist
 * 
 * This file demonstrates how to integrate PACK 46 trust and blocklist features
 * into a chat screen. Copy relevant parts to your actual chat screen.
 * 
 * PACK 46 — Trust Engine & Blocklist Safety Mesh
 */

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Alert } from 'react-native';
import { useTrustAndBlocklist } from '../../hooks/useTrustAndBlocklist';
import { TrustWarningBanner } from '../TrustWarningBanner';
import { BlockedUserBanner } from '../BlockedUserBanner';
import { ReportUserSheet } from '../ReportUserSheet';

interface ChatScreenProps {
  currentUserId: string;
  partnerId: string;
  partnerName: string;
  locale?: 'en' | 'pl';
}

export const ChatScreenExample: React.FC<ChatScreenProps> = ({
  currentUserId,
  partnerId,
  partnerName,
  locale = 'en'
}) => {
  const [messageText, setMessageText] = useState('');
  const [showReportSheet, setShowReportSheet] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  // Load trust and blocklist data
  const {
    isBlocked,
    isHighRisk,
    blockUser,
    loadingBlocklist,
    loadingTrust
  } = useTrustAndBlocklist({
    currentUserId,
    targetUserId: partnerId,
    autoLoad: true
  });

  // Handle blocking user
  const handleBlockUser = () => {
    const confirmText = locale === 'pl' 
      ? 'Czy na pewno chcesz zablokować tego użytkownika?' 
      : 'Are you sure you want to block this user?';
    
    Alert.alert(
      locale === 'pl' ? 'Zablokuj użytkownika' : 'Block User',
      confirmText,
      [
        { text: locale === 'pl' ? 'Anuluj' : 'Cancel', style: 'cancel' },
        {
          text: locale === 'pl' ? 'Zablokuj' : 'Block',
          style: 'destructive',
          onPress: async () => {
            try {
              await blockUser(partnerId);
              Alert.alert(
                locale === 'pl' ? 'Użytkownik zablokowany' : 'User Blocked',
                locale === 'pl' ? 'Ten użytkownik został zablokowany.' : 'This user has been blocked.'
              );
              // Navigate back or close chat
            } catch (error) {
              Alert.alert(
                locale === 'pl' ? 'Błąd' : 'Error',
                locale === 'pl' ? 'Nie udało się zablokować użytkownika' : 'Failed to block user'
              );
            }
          }
        }
      ]
    );
  };

  const handleSendMessage = () => {
    if (isBlocked) {
      Alert.alert(
        locale === 'pl' ? 'Nie można wysłać' : 'Cannot Send',
        locale === 'pl' 
          ? 'Nie możesz wysyłać wiadomości do zablokowanych użytkowników.' 
          : 'You cannot send messages to blocked users.'
      );
      return;
    }

    // Proceed with normal message sending logic...
    console.log('Sending message:', messageText);
  };

  if (loadingBlocklist || loadingTrust) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }

  // If user is blocked, show blocked banner and prevent interaction
  if (isBlocked) {
    return (
      <View style={styles.container}>
        <BlockedUserBanner locale={locale} />
        <View style={styles.blockedMessage}>
          <Text style={styles.blockedMessageText}>
            {locale === 'pl' 
              ? 'Nie możesz wysyłać wiadomości do tego użytkownika.' 
              : 'You cannot send messages to this user.'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Trust warning banner for high-risk users */}
      <TrustWarningBanner userId={partnerId} locale={locale} />

      {/* Chat header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{partnerName}</Text>
        <TouchableOpacity onPress={() => setShowMenu(!showMenu)}>
          <Text style={styles.menuIcon}>⋮</Text>
        </TouchableOpacity>
      </View>

      {/* Menu */}
      {showMenu && (
        <View style={styles.menu}>
          <TouchableOpacity 
            style={styles.menuItem}
            onPress={() => {
              setShowMenu(false);
              setShowReportSheet(true);
            }}
          >
            <Text style={styles.menuItemText}>
              {locale === 'pl' ? 'Zgłoś użytkownika' : 'Report user'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.menuItem}
            onPress={() => {
              setShowMenu(false);
              handleBlockUser();
            }}
          >
            <Text style={[styles.menuItemText, styles.menuItemDanger]}>
              {locale === 'pl' ? 'Zablokuj użytkownika' : 'Block user'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Chat messages area */}
      <View style={styles.messagesContainer}>
        <Text style={styles.placeholder}>Messages would appear here...</Text>
      </View>

      {/* Message input */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={messageText}
          onChangeText={setMessageText}
          placeholder={locale === 'pl' ? 'Wpisz wiadomość...' : 'Type a message...'}
          editable={!isBlocked}
        />
        <TouchableOpacity 
          style={[styles.sendButton, isBlocked && styles.sendButtonDisabled]}
          onPress={handleSendMessage}
          disabled={isBlocked}
        >
          <Text style={styles.sendButtonText}>
            {locale === 'pl' ? 'Wyślij' : 'Send'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Report sheet */}
      <ReportUserSheet
        visible={showReportSheet}
        targetUserId={partnerId}
        targetUserName={partnerName}
        reporterId={currentUserId}
        locale={locale}
        onClose={() => setShowReportSheet(false)}
        onReported={() => {
          Alert.alert(
            locale === 'pl' ? 'Zgłoszenie wysłane' : 'Report Submitted',
            locale === 'pl' ? 'Dziękujemy za zgłoszenie.' : 'Thank you for your report.'
          );
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  menuIcon: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  menu: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
    padding: 8,
  },
  menuItem: {
    padding: 12,
  },
  menuItemText: {
    fontSize: 16,
    color: '#333',
  },
  menuItemDanger: {
    color: '#F44336',
  },
  messagesContainer: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholder: {
    color: '#999',
    fontSize: 14,
  },
  blockedMessage: {
    padding: 20,
    alignItems: 'center',
  },
  blockedMessageText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: '#F8F8F8',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 8,
    fontSize: 16,
  },
  sendButton: {
    backgroundColor: '#007AFF',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  sendButtonDisabled: {
    backgroundColor: '#CCC',
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ChatScreenExample;
