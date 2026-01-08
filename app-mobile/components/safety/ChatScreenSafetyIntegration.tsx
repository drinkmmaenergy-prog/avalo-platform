/**
 * PACK 74 — Chat Screen Safety Integration Example
 * 
 * Example component showing how to integrate safety relationship warnings
 * into an existing chat screen
 * 
 * INTEGRATION INSTRUCTIONS:
 * Add this to the top of your chat screen component, below the header
 */

import React from 'react';
import { View } from 'react-native';
import { SafetyRelationshipBanner } from './SafetyRelationshipBanner';
import { useSafetyRelationshipHint } from '../../hooks/useSafetyRelationshipHint';
import { useNavigation } from '@react-navigation/native';

// ============================================================================
// TYPES
// ============================================================================

interface ChatScreenSafetyIntegrationProps {
  counterpartUserId: string;
  onBlock?: (userId: string) => void;
  onReport?: (userId: string) => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Safety integration wrapper for chat screens
 * 
 * Usage in your chat screen:
 * ```tsx
 * <ChatScreenSafetyIntegration
 *   counterpartUserId={chatPartnerUserId}
 *   onBlock={handleBlockUser}
 *   onReport={handleReportUser}
 * />
 * ```
 */
export const ChatScreenSafetyIntegration: React.FC<ChatScreenSafetyIntegrationProps> = ({
  counterpartUserId,
  onBlock,
  onReport,
}) => {
  const navigation = useNavigation();
  const { level, logAction } = useSafetyRelationshipHint(counterpartUserId);

  // Handle block action
  const handleBlock = async () => {
    await logAction('BLOCKED_USER');
    if (onBlock) {
      onBlock(counterpartUserId);
    }
  };

  // Handle report action
  const handleReport = async () => {
    await logAction('REPORTED_USER');
    if (onReport) {
      onReport(counterpartUserId);
    }
  };

  // Handle support contact
  const handleSupport = async () => {
    await logAction('CONTACT_SUPPORT');
    // Navigate to support with pre-filled category
    // @ts-ignore - Navigation type depends on app navigation structure
    navigation.navigate('Support', {
      category: 'RELATIONSHIP_SAFETY',
      relatedUserId: counterpartUserId,
    });
  };

  // Handle safety tips
  const handleSafetyTips = async () => {
    await logAction('OPENED_SAFETY_TIPS');
    // Navigate to safety info screen or open PACK 73 safety tips
    // @ts-ignore - Navigation type depends on app navigation structure
    navigation.navigate('SafetyInfo');
  };

  return (
    <View>
      <SafetyRelationshipBanner
        level={level}
        onBlock={handleBlock}
        onReport={handleReport}
        onSupport={handleSupport}
        onSafetyTips={handleSafetyTips}
      />
    </View>
  );
};

// ============================================================================
// FULL CHAT SCREEN EXAMPLE
// ============================================================================

/**
 * Example of a complete chat screen with safety integration
 * 
 * This shows the recommended placement and structure
 */
export function ExampleChatScreen({ route }: any) {
  const { chatId, counterpartUserId } = route.params;

  const handleBlockUser = (userId: string) => {
    // Your existing block logic from PACK 46
    console.log('Blocking user:', userId);
  };

  const handleReportUser = (userId: string) => {
    // Your existing report logic from PACK 54
    console.log('Reporting user:', userId);
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Header */}
      <View>{/* Your chat header */}</View>

      {/* Safety Banner - Add this below header */}
      <ChatScreenSafetyIntegration
        counterpartUserId={counterpartUserId}
        onBlock={handleBlockUser}
        onReport={handleReportUser}
      />

      {/* Chat Messages */}
      <View style={{ flex: 1 }}>{/* Your messages list */}</View>

      {/* Message Input */}
      <View>{/* Your message input */}</View>
    </View>
  );
}

export default ChatScreenSafetyIntegration;
