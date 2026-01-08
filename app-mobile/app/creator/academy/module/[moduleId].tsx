/**
 * Academy Module Detail Screen
 * Shows slides and quiz for a specific module
 * Marks module as complete when quiz is passed
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../../contexts/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Slide {
  title: string;
  content: string[];
}

interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: number;
}

interface ModuleContent {
  id: string;
  title: string;
  icon: string;
  slides: Slide[];
  quiz: QuizQuestion[];
}

const STORAGE_KEY = 'academy_progress';

// Module content with slides and quizzes
const MODULE_CONTENT: Record<string, ModuleContent> = {
  'earn-to-chat': {
    id: 'earn-to-chat',
    title: 'Earn-to-Chat Mastery',
    icon: '💬',
    slides: [
      {
        title: 'What is Earn-to-Chat?',
        content: [
          '💰 Get paid for every conversation',
          '🎯 Users pay tokens to message premium creators',
          '📈 Build recurring income from your audience',
          '✨ First 3 messages always free to hook users',
        ],
      },
      {
        title: 'Setting Your Rates',
        content: [
          '💎 Standard: 10 tokens per message',
          '🔥 Be responsive - fast replies = more messages',
          '📊 Track earnings per conversation',
          '💪 Quality responses keep users engaged',
        ],
      },
      {
        title: 'Maximizing Earnings',
        content: [
          '⚡ Reply within 5 minutes for best results',
          '💬 Ask open-ended questions to extend conversations',
          '🎁 Offer exclusive content to loyal chatters',
          '📈 Build relationships that lead to tips and more',
        ],
      },
    ],
    quiz: [
      {
        question: 'How many free messages do users get before paying?',
        options: ['1 message', '3 messages', '5 messages', '10 messages'],
        correctAnswer: 1,
      },
      {
        question: 'What is the best way to maximize Earn-to-Chat income?',
        options: [
          'Only reply once per day',
          'Keep responses very short',
          'Reply quickly and ask engaging questions',
          'Ignore user messages',
        ],
        correctAnswer: 2,
      },
      {
        question: 'How much do users pay per message after free messages?',
        options: ['5 tokens', '10 tokens', '20 tokens', '50 tokens'],
        correctAnswer: 1,
      },
    ],
  },
  'ai-companions': {
    id: 'ai-companions',
    title: 'AI Companions & Passive Income',
    icon: '🤖',
    slides: [
      {
        title: 'Create Your AI Bot',
        content: [
          '🤖 AI bots earn money 24/7 automatically',
          '💤 Make money while you sleep',
          '🎭 Define unique personality and style',
          '📸 Use quality photos for higher engagement',
        ],
      },
      {
        title: 'Pricing Tiers',
        content: [
          '💬 Basic: 1 token per message',
          '⭐ Premium: 2 tokens per message',
          '🔥 NSFW: 4 tokens per message',
          '💡 Higher tiers = higher earnings per chat',
        ],
      },
      {
        title: 'Growth Strategies',
        content: [
          '📈 Create multiple bots for different niches',
          '✨ Update personality based on user feedback',
          '🎯 Use compelling descriptions to attract users',
          '💰 Top creators earn 1000+ tokens per bot monthly',
        ],
      },
      {
        title: 'Best Practices',
        content: [
          '🎨 Professional profile photos get 3x more chats',
          '💬 Engaging bios lead to longer conversations',
          '📊 Monitor stats and optimize regularly',
          '🚀 Promote your bots across all content',
        ],
      },
    ],
    quiz: [
      {
        question: 'When do AI bots earn money?',
        options: [
          'Only when you are online',
          '24/7 automatically',
          'Only during business hours',
          'Only on weekends',
        ],
        correctAnswer: 1,
      },
      {
        question: 'What is the cost per message for a Premium AI bot?',
        options: ['1 token', '2 tokens', '4 tokens', '10 tokens'],
        correctAnswer: 1,
      },
      {
        question: 'What leads to higher AI bot engagement?',
        options: [
          'Low-quality photos',
          'Generic descriptions',
          'Professional photos and engaging bios',
          'Never updating the bot',
        ],
        correctAnswer: 2,
      },
    ],
  },
  'live-streaming': {
    id: 'live-streaming',
    title: 'LIVE Streaming Gifts',
    icon: '🎥',
    slides: [
      {
        title: 'LIVE Streaming Basics',
        content: [
          '🎥 Go live to interact with fans in real-time',
          '🎁 Viewers send virtual gifts worth tokens',
          '💰 You keep 80% of all gift values',
          '🔥 Top streamers earn 5000+ tokens per stream',
        ],
      },
      {
        title: 'Available Gifts',
        content: [
          '🌹 Rose: 5 tokens',
          '❤️ Heart: 10 tokens',
          '💎 Diamond: 50 tokens',
          '👑 Crown: 100 tokens',
          '🚀 Rocket: 500 tokens',
          '🏆 Trophy: 1000 tokens',
        ],
      },
      {
        title: 'Engagement Tips',
        content: [
          '📣 Announce streams 24 hours in advance',
          '💬 Interact with viewers by name',
          '🎯 Set gift goals for special content',
          '⏰ Stream consistently at same times',
        ],
      },
      {
        title: 'Maximizing Earnings',
        content: [
          '✨ Thank gifters publicly to encourage more',
          '🎊 Celebrate big gifts with reactions',
          '📊 Stream during peak hours (7-10pm)',
          '🔥 Create excitement with limited-time events',
        ],
      },
    ],
    quiz: [
      {
        question: 'What percentage of gift value do creators keep?',
        options: ['50%', '70%', '80%', '100%'],
        correctAnswer: 2,
      },
      {
        question: 'How much is a Diamond gift worth?',
        options: ['10 tokens', '25 tokens', '50 tokens', '100 tokens'],
        correctAnswer: 2,
      },
      {
        question: 'When should you stream for maximum earnings?',
        options: [
          'Random times',
          'Early morning',
          'Consistently at peak hours (7-10pm)',
          'Only on holidays',
        ],
        correctAnswer: 2,
      },
    ],
  },
  'drops-marketplace': {
    id: 'drops-marketplace',
    title: 'Drops Marketplace',
    icon: '🎁',
    slides: [
      {
        title: 'What Are Drops?',
        content: [
          '🎁 Exclusive digital content for sale',
          '🔒 Limited quantity creates urgency',
          '💰 Price: 20-1000 tokens per drop',
          '⚡ Flash drops sell out in hours',
        ],
      },
      {
        title: 'Drop Types',
        content: [
          '📦 Standard: Always available, unlimited',
          '⚡ Flash: 24-hour time limit',
          '🎲 Lootbox: Random rewards system',
          '🤝 Co-op: Collaborate with other creators',
        ],
      },
      {
        title: 'Creating Winning Drops',
        content: [
          '🎨 High-quality exclusive content performs best',
          '💎 Price based on exclusivity and value',
          '📊 Limited quantities (10-50) create FOMO',
          '🔥 Tease content before launch',
        ],
      },
      {
        title: 'Marketing Your Drops',
        content: [
          '📣 Announce 48 hours before launch',
          '⏰ Create countdown timers',
          '🎯 Offer early-bird discounts',
          '💪 Bundle drops for higher revenue',
        ],
      },
    ],
    quiz: [
      {
        question: 'What creates urgency in drop sales?',
        options: [
          'Unlimited quantity',
          'Limited quantity and time limits',
          'High prices only',
          'No marketing',
        ],
        correctAnswer: 1,
      },
      {
        question: 'What is a Flash Drop?',
        options: [
          'Available forever',
          'Only 24-hour time limit',
          'Only for VIP users',
          'Free content',
        ],
        correctAnswer: 1,
      },
      {
        question: 'What is the price range for drops?',
        options: ['1-10 tokens', '5-50 tokens', '20-1000 tokens', '2000+ tokens'],
        correctAnswer: 2,
      },
    ],
  },
  'growth-missions': {
    id: 'growth-missions',
    title: 'Growth Missions & Ranking',
    icon: '🎯',
    slides: [
      {
        title: 'Growth Mission System',
        content: [
          '🎯 Complete daily/weekly missions for rewards',
          '💎 Earn bonus tokens for achievements',
          '📈 Level up your creator status',
          '🏆 Top 10 creators get monthly bonuses',
        ],
      },
      {
        title: 'Mission Types',
        content: [
          '💬 Message streaks: Reply within 1 hour',
          '🎥 Stream hours: Go live regularly',
          '🤖 Bot engagement: High AI chat rates',
          '🎁 Drop sales: Sell exclusive content',
        ],
      },
      {
        title: 'Ranking System',
        content: [
          '🥇 Top 10: 500 token monthly bonus',
          '🥈 Top 50: 200 token monthly bonus',
          '🥉 Top 100: 100 token monthly bonus',
          '📊 Rankings update weekly',
        ],
      },
      {
        title: 'Leveling Up',
        content: [
          '⭐ Level 1: Beginner (0-100 points)',
          '🌟 Level 2: Rising (100-500 points)',
          '✨ Level 3: Star (500-2000 points)',
          '💫 Level 4: Elite (2000+ points)',
        ],
      },
    ],
    quiz: [
      {
        question: 'How often do creator rankings update?',
        options: ['Daily', 'Weekly', 'Monthly', 'Yearly'],
        correctAnswer: 1,
      },
      {
        question: 'What bonus do Top 10 creators get monthly?',
        options: ['100 tokens', '200 tokens', '500 tokens', '1000 tokens'],
        correctAnswer: 2,
      },
      {
        question: 'What type of missions earn you points?',
        options: [
          'All of the above',
          'Message streaks',
          'Stream hours',
          'Bot engagement and drop sales',
        ],
        correctAnswer: 0,
      },
    ],
  },
  'tips-ads': {
    id: 'tips-ads',
    title: 'Tips + Ads Rewards System',
    icon: '💰',
    slides: [
      {
        title: 'Receiving Tips',
        content: [
          '💰 Minimum tip: 5 tokens',
          '🎁 Maximum tip: 10,000 tokens',
          '📊 You keep 80% of all tips',
          '✨ Build rapport to encourage tipping',
        ],
      },
      {
        title: 'Encouraging Tips',
        content: [
          '🙏 Be gracious and thank all tippers',
          '🎯 Set tip goals for exclusive content',
          '💬 Mention tips naturally in conversations',
          '🔥 Offer tip-gated premium content',
        ],
      },
      {
        title: 'Ads Rewards System',
        content: [
          '📺 Watch ads to earn tokens yourself',
          '💎 10 tokens per ad you watch',
          '🎁 Bonus every 10 ads watched',
          '📈 20 ads maximum per day',
        ],
      },
      {
        title: 'Combined Strategy',
        content: [
          '💪 Watch daily ads for steady token income',
          '🎯 Reinvest tokens in profile boosts',
          '📣 More visibility = more tips',
          '🚀 Compound earnings for rapid growth',
        ],
      },
    ],
    quiz: [
      {
        question: 'What percentage of tips do creators keep?',
        options: ['50%', '70%', '80%', '100%'],
        correctAnswer: 2,
      },
      {
        question: 'How many tokens do you earn per ad watched?',
        options: ['5 tokens', '10 tokens', '15 tokens', '20 tokens'],
        correctAnswer: 1,
      },
      {
        question: 'What is the maximum number of ads you can watch per day?',
        options: ['10 ads', '20 ads', '50 ads', 'Unlimited'],
        correctAnswer: 1,
      },
    ],
  },
};

export default function AcademyModuleScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { moduleId } = useLocalSearchParams();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [showQuiz, setShowQuiz] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<number[]>([]);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const moduleContent = MODULE_CONTENT[moduleId as string];

  useEffect(() => {
    if (!moduleContent) {
      Alert.alert('Error', 'Module not found');
      router.back();
    }
  }, [moduleContent]);

  if (!moduleContent) {
    return null;
  }

  const totalSlides = moduleContent.slides.length;
  const currentSlideData = moduleContent.slides[currentSlide];

  const handleNext = () => {
    if (currentSlide < totalSlides - 1) {
      setCurrentSlide(currentSlide + 1);
    } else {
      // Last slide, show quiz
      setShowQuiz(true);
    }
  };

  const handlePrevious = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
    } else {
      router.back();
    }
  };

  const handleQuizAnswer = (questionIndex: number, answerIndex: number) => {
    const newAnswers = [...quizAnswers];
    newAnswers[questionIndex] = answerIndex;
    setQuizAnswers(newAnswers);
  };

  const handleSubmitQuiz = async () => {
    // Check if all questions are answered
    if (quizAnswers.length !== moduleContent.quiz.length) {
      Alert.alert('Incomplete', 'Please answer all questions before submitting');
      return;
    }

    // Check answers
    let correctCount = 0;
    moduleContent.quiz.forEach((question, index) => {
      if (quizAnswers[index] === question.correctAnswer) {
        correctCount++;
      }
    });

    const totalQuestions = moduleContent.quiz.length;
    const passed = correctCount === totalQuestions;

    setQuizSubmitted(true);

    if (passed) {
      // Save completion
      setLoading(true);
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        const progress = stored ? JSON.parse(stored) : { completedModules: [], rewarded: false };
        
        if (!progress.completedModules.includes(moduleId)) {
          progress.completedModules.push(moduleId);
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
        }

        Alert.alert(
          'Module Completed! 🎉',
          `Great job! You scored ${correctCount}/${totalQuestions}.\n\nThis module is now marked as complete.`,
          [
            {
              text: 'Continue',
              onPress: () => router.back(),
            },
          ]
        );
      } catch (error) {
        console.error('Error saving progress:', error);
        Alert.alert('Error', 'Failed to save progress');
      } finally {
        setLoading(false);
      }
    } else {
      Alert.alert(
        'Quiz Failed',
        `You scored ${correctCount}/${totalQuestions}.\n\nYou need to answer all questions correctly. Review the slides and try again.`,
        [
          {
            text: 'Retry',
            onPress: () => {
              setQuizAnswers([]);
              setQuizSubmitted(false);
              setShowQuiz(false);
              setCurrentSlide(0);
            },
          },
        ]
      );
    }
  };

  const shuffleOptions = (options: string[], correctIndex: number, seed: number) => {
    // Simple deterministic shuffle based on question index
    const shuffled = [...options];
    const n = shuffled.length;
    
    for (let i = n - 1; i > 0; i--) {
      const j = Math.abs((seed * (i + 1) + i) % (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    
    // Find new index of correct answer
    const correctAnswer = options[correctIndex];
    const newCorrectIndex = shuffled.indexOf(correctAnswer);
    
    return { shuffled, newCorrectIndex };
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerIcon}>{moduleContent.icon}</Text>
          <Text style={styles.headerTitle}>{moduleContent.title}</Text>
        </View>
      </View>

      {!showQuiz ? (
        // Slides View
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          <View style={styles.progressIndicator}>
            <Text style={styles.progressText}>
              Slide {currentSlide + 1} of {totalSlides}
            </Text>
          </View>

          <View style={styles.slideCard}>
            <Text style={styles.slideTitle}>{currentSlideData.title}</Text>
            
            <View style={styles.slideContent}>
              {currentSlideData.content.map((item, index) => (
                <View key={index} style={styles.contentItem}>
                  <Text style={styles.contentText}>{item}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.navigation}>
            <TouchableOpacity
              style={[styles.navButton, styles.navButtonSecondary]}
              onPress={handlePrevious}
            >
              <Text style={styles.navButtonTextSecondary}>Previous</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.navButton} onPress={handleNext}>
              <Text style={styles.navButtonText}>
                {currentSlide === totalSlides - 1 ? 'Take Quiz' : 'Next'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : (
        // Quiz View
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          <View style={styles.quizHeader}>
            <Text style={styles.quizEmoji}>📝</Text>
            <Text style={styles.quizTitle}>Knowledge Check</Text>
            <Text style={styles.quizSubtitle}>
              Answer all questions correctly to complete this module
            </Text>
          </View>

          {moduleContent.quiz.map((question, qIndex) => {
            const { shuffled, newCorrectIndex } = shuffleOptions(
              question.options,
              question.correctAnswer,
              qIndex
            );

            return (
              <View key={qIndex} style={styles.questionCard}>
                <Text style={styles.questionNumber}>Question {qIndex + 1}</Text>
                <Text style={styles.questionText}>{question.question}</Text>

                <View style={styles.optionsList}>
                  {shuffled.map((option, oIndex) => {
                    const isSelected = quizAnswers[qIndex] === oIndex;
                    const isCorrect = oIndex === newCorrectIndex;
                    const showResult = quizSubmitted;

                    return (
                      <TouchableOpacity
                        key={oIndex}
                        style={[
                          styles.optionButton,
                          isSelected && styles.optionButtonSelected,
                          showResult && isCorrect && styles.optionButtonCorrect,
                          showResult && isSelected && !isCorrect && styles.optionButtonWrong,
                        ]}
                        onPress={() => !quizSubmitted && handleQuizAnswer(qIndex, oIndex)}
                        disabled={quizSubmitted}
                      >
                        <Text
                          style={[
                            styles.optionText,
                            isSelected && styles.optionTextSelected,
                          ]}
                        >
                          {option}
                        </Text>
                        {showResult && isCorrect && (
                          <Text style={styles.correctIcon}>✓</Text>
                        )}
                        {showResult && isSelected && !isCorrect && (
                          <Text style={styles.wrongIcon}>✗</Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            );
          })}

          {!quizSubmitted && (
            <TouchableOpacity
              style={[
                styles.submitButton,
                quizAnswers.length !== moduleContent.quiz.length && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmitQuiz}
              disabled={loading || quizAnswers.length !== moduleContent.quiz.length}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitButtonText}>Submit Quiz</Text>
              )}
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#1A1A1A',
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  backButton: {
    marginRight: 16,
  },
  backText: {
    fontSize: 32,
    color: '#40E0D0',
    fontWeight: '300',
  },
  headerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIcon: {
    fontSize: 32,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  progressIndicator: {
    alignItems: 'center',
    marginBottom: 20,
  },
  progressText: {
    fontSize: 14,
    color: '#999',
    fontWeight: '600',
  },
  slideCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  slideTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 24,
  },
  slideContent: {
    gap: 16,
  },
  contentItem: {
    paddingLeft: 8,
  },
  contentText: {
    fontSize: 16,
    color: '#fff',
    lineHeight: 24,
  },
  navigation: {
    flexDirection: 'row',
    gap: 12,
  },
  navButton: {
    flex: 1,
    backgroundColor: '#40E0D0',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  navButtonSecondary: {
    backgroundColor: '#2A2A2A',
  },
  navButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  navButtonTextSecondary: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  quizHeader: {
    alignItems: 'center',
    marginBottom: 32,
  },
  quizEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  quizTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
  },
  quizSubtitle: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    lineHeight: 20,
  },
  questionCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  questionNumber: {
    fontSize: 12,
    fontWeight: '600',
    color: '#40E0D0',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  questionText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 16,
    lineHeight: 24,
  },
  optionsList: {
    gap: 12,
  },
  optionButton: {
    backgroundColor: '#2A2A2A',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#2A2A2A',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  optionButtonSelected: {
    borderColor: '#40E0D0',
    backgroundColor: '#1A2A2A',
  },
  optionButtonCorrect: {
    borderColor: '#4CAF50',
    backgroundColor: '#1A2A1A',
  },
  optionButtonWrong: {
    borderColor: '#FF4444',
    backgroundColor: '#2A1A1A',
  },
  optionText: {
    fontSize: 15,
    color: '#fff',
    flex: 1,
    lineHeight: 20,
  },
  optionTextSelected: {
    fontWeight: '600',
  },
  correctIcon: {
    fontSize: 20,
    color: '#4CAF50',
    marginLeft: 12,
  },
  wrongIcon: {
    fontSize: 20,
    color: '#FF4444',
    marginLeft: 12,
  },
  submitButton: {
    backgroundColor: '#40E0D0',
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
});