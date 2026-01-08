import AsyncStorage from '@react-native-async-storage/async-storage';
import { Timestamp } from 'firebase/firestore';

// Types
export interface EmotionalSummary {
  chatId: string;
  userId: string;
  username: string;
  avatar: string;
  engagementScore: number; // 0-100
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  tag: 'GAINING_TRACTION' | 'STABLE' | 'COOLING_DOWN' | 'AT_RISK';
  recommendation: string;
  lastMessageAt: number;
}

interface ChatAnalysisData {
  messages: Array<{
    senderId: string;
    text: string;
    timestamp: number;
  }>;
  userInfo: {
    userId: string;
    username: string;
    avatar: string;
  };
}

const STORAGE_KEY = 'emotional_inbox_cache';
const CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 hours

// Positive words for sentiment analysis
const POSITIVE_WORDS = [
  'love', 'like', 'happy', 'great', 'amazing', 'awesome', 'wonderful', 
  'good', 'excited', 'fun', 'nice', 'beautiful', 'perfect', 'thanks',
  'thank', 'appreciate', 'enjoy', 'yes', 'absolutely', 'definitely',
  'kocham', 'lubię', 'super', 'świetnie', 'wspaniale', 'dziękuję'
];

// Cold/negative words
const COLD_WORDS = [
  'no', 'not', 'never', 'stop', 'busy', 'maybe', 'later', 'sorry',
  'can\'t', 'won\'t', 'don\'t', 'nie', 'później', 'zajęty', 'przepraszam'
];

/**
 * Calculate engagement score based on multiple factors
 */
function calculateEngagementScore(
  messageCount: number,
  responseTime: number,
  sentimentScore: number,
  initiatorBalance: number,
  premiumActions: number
): number {
  // Message frequency score (0-30 points)
  const frequencyScore = Math.min(30, (messageCount / 10) * 30);
  
  // Response time score (0-25 points) - faster is better
  const responseScore = Math.max(0, 25 - (responseTime / 3600) * 5);
  
  // Sentiment score (0-20 points)
  const sentimentWeight = sentimentScore * 20;
  
  // Initiator balance (0-15 points) - who starts conversations
  const initiatorScore = initiatorBalance * 15;
  
  // Premium actions (0-10 points)
  const premiumScore = Math.min(10, premiumActions * 2);
  
  return Math.round(
    frequencyScore + responseScore + sentimentWeight + initiatorScore + premiumScore
  );
}

/**
 * Calculate sentiment from message text
 */
function calculateSentiment(text: string): number {
  const words = text.toLowerCase().split(/\s+/);
  let positiveCount = 0;
  let negativeCount = 0;
  
  words.forEach(word => {
    if (POSITIVE_WORDS.includes(word)) positiveCount++;
    if (COLD_WORDS.includes(word)) negativeCount++;
  });
  
  const totalSentimentWords = positiveCount + negativeCount;
  if (totalSentimentWords === 0) return 0.5; // Neutral
  
  return positiveCount / totalSentimentWords;
}

/**
 * Analyze chat data for emotional insights
 */
function analyzeChat(
  chatData: ChatAnalysisData,
  currentUserId: string
): EmotionalSummary | null {
  if (!chatData.messages || chatData.messages.length === 0) {
    return null;
  }

  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  
  // Filter last 7 days
  const recentMessages = chatData.messages.filter(
    m => m.timestamp > sevenDaysAgo
  );
  
  if (recentMessages.length === 0) return null;

  // Calculate metrics
  let totalResponseTime = 0;
  let responseCount = 0;
  let sentimentSum = 0;
  let userInitiated = 0;
  let otherInitiated = 0;
  let premiumActions = 0;

  for (let i = 1; i < recentMessages.length; i++) {
    const prev = recentMessages[i - 1];
    const curr = recentMessages[i];
    
    // Response time calculation
    if (prev.senderId !== curr.senderId) {
      const timeDiff = (curr.timestamp - prev.timestamp) / 1000; // seconds
      totalResponseTime += timeDiff;
      responseCount++;
    }
    
    // Sentiment
    sentimentSum += calculateSentiment(curr.text);
    
    // Check who initiates (first message after 1+ hour gap)
    if (i > 0 && (curr.timestamp - prev.timestamp) > 3600000) {
      if (curr.senderId === currentUserId) {
        userInitiated++;
      } else {
        otherInitiated++;
      }
    }
  }

  const avgResponseTime = responseCount > 0 ? totalResponseTime / responseCount : 3600;
  const avgSentiment = recentMessages.length > 0 ? sentimentSum / recentMessages.length : 0.5;
  const initiatorBalance = otherInitiated / Math.max(1, userInitiated + otherInitiated);
  
  // Calculate engagement score
  const engagementScore = calculateEngagementScore(
    recentMessages.length,
    avgResponseTime,
    avgSentiment,
    initiatorBalance,
    premiumActions
  );

  // Determine risk level and tag
  let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  let tag: 'GAINING_TRACTION' | 'STABLE' | 'COOLING_DOWN' | 'AT_RISK';
  let recommendationKey: string;

  if (engagementScore >= 70) {
    riskLevel = 'LOW';
    tag = 'GAINING_TRACTION';
    recommendationKey = 'recommendations.gaining';
  } else if (engagementScore >= 50) {
    riskLevel = 'LOW';
    tag = 'STABLE';
    recommendationKey = 'recommendations.stable';
  } else if (engagementScore >= 30) {
    riskLevel = 'MEDIUM';
    tag = 'COOLING_DOWN';
    recommendationKey = 'recommendations.cooling';
  } else {
    riskLevel = 'HIGH';
    tag = 'AT_RISK';
    recommendationKey = 'recommendations.atRisk';
  }

  const lastMessage = recentMessages[recentMessages.length - 1];

  return {
    chatId: chatData.userInfo.userId,
    userId: chatData.userInfo.userId,
    username: chatData.userInfo.username,
    avatar: chatData.userInfo.avatar,
    engagementScore,
    riskLevel,
    tag,
    recommendation: recommendationKey,
    lastMessageAt: lastMessage.timestamp,
  };
}

/**
 * Get emotional inbox summaries from cache or generate new
 */
export async function getEmotionalInboxSummaries(
  currentUserId: string,
  chats: any[]
): Promise<EmotionalSummary[]> {
  try {
    // Check cache first
    const cached = await AsyncStorage.getItem(STORAGE_KEY);
    if (cached) {
      const { timestamp, data } = JSON.parse(cached);
      if (Date.now() - timestamp < CACHE_DURATION) {
        return data;
      }
    }

    // Generate new summaries
    const summaries: EmotionalSummary[] = [];

    for (const chat of chats) {
      // Get messages from chat
      const messages: Array<{
        senderId: string;
        text: string;
        timestamp: number;
      }> = [];

      // Extract messages from chat data
      // In real implementation, this would fetch from Firestore or local storage
      // For now, use sample data structure
      const otherUserId = chat.participants?.find((id: string) => id !== currentUserId);
      
      if (!otherUserId) continue;

      const chatAnalysis: ChatAnalysisData = {
        messages: messages,
        userInfo: {
          userId: otherUserId,
          username: chat.otherUserName || 'User',
          avatar: chat.otherUserPhoto || '',
        },
      };

      const summary = analyzeChat(chatAnalysis, currentUserId);
      if (summary) {
        summaries.push(summary);
      }
    }

    // Sort by engagement score (descending) and take top 3
    summaries.sort((a, b) => b.engagementScore - a.engagementScore);
    const topSummaries = summaries.slice(0, 3);

    // Cache results
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        timestamp: Date.now(),
        data: topSummaries,
      })
    );

    return topSummaries;
  } catch (error) {
    console.error('Error getting emotional inbox summaries:', error);
    return [];
  }
}

/**
 * Clear emotional inbox cache
 */
export async function clearEmotionalInboxCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Error clearing emotional inbox cache:', error);
  }
}

/**
 * Force refresh emotional inbox data
 */
export async function refreshEmotionalInbox(
  currentUserId: string,
  chats: any[]
): Promise<EmotionalSummary[]> {
  await clearEmotionalInboxCache();
  return getEmotionalInboxSummaries(currentUserId, chats);
}