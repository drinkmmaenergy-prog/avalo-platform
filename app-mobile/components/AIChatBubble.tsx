/**
 * AIChatBubble Component
 * Instagram DM-style chat bubble for AI conversations
 * Shows token costs and billing info
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  useColorScheme,
  Animated,
} from 'react-native';

interface AIChatBubbleProps {
  role: 'user' | 'bot';
  content: string;
  timestamp: Date;
  tokensCost?: number;
  wasFree?: boolean;
  isTyping?: boolean;
}

export function AIChatBubble({
  role,
  content,
  timestamp,
  tokensCost = 0,
  wasFree = false,
  isTyping = false,
}: AIChatBubbleProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const isUser = role === 'user';

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  return (
    <View style={[styles.container, isUser && styles.containerUser]}>
      {/* Message Bubble */}
      <View
        style={[
          styles.bubble,
          isUser ? styles.bubbleUser : styles.bubbleBot,
          isDark && (isUser ? styles.bubbleUserDark : styles.bubbleBotDark),
        ]}
      >
        {isTyping ? (
          <TypingIndicator />
        ) : (
          <Text
            style={[
              styles.text,
              isUser ? styles.textUser : styles.textBot,
              isDark && styles.textDark,
            ]}
          >
            {content}
          </Text>
        )}

        {/* Token cost indicator for bot messages */}
        {!isUser && !isTyping && tokensCost > 0 && !wasFree && (
          <View style={styles.costBadge}>
            <Text style={styles.costText}>-{tokensCost} 🪙</Text>
          </View>
        )}

        {/* Free message indicator */}
        {!isUser && wasFree && (
          <View style={styles.freeBadge}>
            <Text style={styles.freeText}>FREE</Text>
          </View>
        )}
      </View>

      {/* Timestamp */}
      <Text style={[styles.timestamp, isDark && styles.timestampDark]}>
        {formatTime(timestamp)}
      </Text>
    </View>
  );
}

/**
 * Typing Indicator (3 animated dots)
 */
function TypingIndicator() {
  const [dot1] = React.useState(new Animated.Value(0));
  const [dot2] = React.useState(new Animated.Value(0));
  const [dot3] = React.useState(new Animated.Value(0));

  React.useEffect(() => {
    const animate = (dot: Animated.Value, delay: number) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
        ])
      ).start();
    };

    animate(dot1, 0);
    animate(dot2, 200);
    animate(dot3, 400);
  }, []);

  const getDotStyle = (dot: Animated.Value) => ({
    opacity: dot,
    transform: [
      {
        translateY: dot.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -5],
        }),
      },
    ],
  });

  return (
    <View style={styles.typingContainer}>
      <Animated.View style={[styles.dot, getDotStyle(dot1)]} />
      <Animated.View style={[styles.dot, getDotStyle(dot2)]} />
      <Animated.View style={[styles.dot, getDotStyle(dot3)]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    maxWidth: '75%',
    alignSelf: 'flex-start',
  },
  containerUser: {
    alignSelf: 'flex-end',
  },
  bubble: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    position: 'relative',
  },
  bubbleUser: {
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 4,
  },
  bubbleUserDark: {
    backgroundColor: '#0A84FF',
  },
  bubbleBot: {
    backgroundColor: '#E9E9EB',
    borderBottomLeftRadius: 4,
  },
  bubbleBotDark: {
    backgroundColor: '#3A3A3C',
  },
  text: {
    fontSize: 16,
    lineHeight: 22,
  },
  textUser: {
    color: '#FFFFFF',
  },
  textBot: {
    color: '#000000',
  },
  textDark: {
    color: '#FFFFFF',
  },
  timestamp: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 4,
    marginHorizontal: 12,
  },
  timestampDark: {
    color: '#636366',
  },
  costBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#FF3B30',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  costText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  freeBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#34C759',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  freeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  typingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#8E8E93',
  },
});

export default AIChatBubble;
