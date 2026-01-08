/**
 * Questions Page (Web - Read-Only)
 * Shows trending questions and encourages users to open in mobile app
 */

'use client';

import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';

interface Question {
  id: string;
  authorId: string;
  text: string;
  isAnonymous: boolean;
  isNSFW: boolean;
  tags: string[];
  createdAt: any;
  boostScore: number;
  answerCount: number;
  unlockCount: number;
  visibilityStatus: string;
}

export default function QuestionsPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadQuestions();
  }, []);

  const loadQuestions = async () => {
    try {
      const questionsRef = collection(db, 'questions');
      const q = query(
        questionsRef,
        where('visibilityStatus', '==', 'active'),
        where('isNSFW', '==', false), // Only show SFW content on web
        orderBy('boostScore', 'desc'),
        orderBy('createdAt', 'desc'),
        limit(20)
      );

      const snapshot = await getDocs(q);
      const questionsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Question[];

      setQuestions(questionsData);
    } catch (error) {
      console.error('Error loading questions:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTimeAgo = (timestamp: any): string => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerContent}>
          <h1 style={styles.title}>Questions on Avalo</h1>
          <p style={styles.subtitle}>
            Join the conversation in the Avalo mobile app
          </p>
        </div>
      </header>

      {/* CTA Banner */}
      <div style={styles.ctaBanner}>
        <div style={styles.ctaContent}>
          <h2 style={styles.ctaTitle}>💬 Ask Questions & Earn Tokens</h2>
          <p style={styles.ctaText}>
            Download the Avalo app to ask questions, answer, and unlock premium content
          </p>
          <div style={styles.ctaButtons}>
            <a href="https://apps.apple.com/app/avalo" style={styles.appButton}>
              📱 Download on iOS
            </a>
            <a href="https://play.google.com/store/apps/details?id=com.avalo" style={styles.appButton}>
              🤖 Download on Android
            </a>
          </div>
        </div>
      </div>

      {/* Questions Feed */}
      <main style={styles.main}>
        <h2 style={styles.sectionTitle}>Trending Questions</h2>

        {loading ? (
          <div style={styles.loading}>Loading questions...</div>
        ) : questions.length === 0 ? (
          <div style={styles.empty}>
            <p>No questions yet. Be the first to ask in the app!</p>
          </div>
        ) : (
          <div style={styles.questionsList}>
            {questions.map((question) => (
              <div key={question.id} style={styles.questionCard}>
                <div style={styles.questionHeader}>
                  <span style={styles.author}>
                    {question.isAnonymous ? '🎭 Anonymous' : 'User'}
                  </span>
                  <span style={styles.time}>
                    {formatTimeAgo(question.createdAt)}
                  </span>
                </div>

                <p style={styles.questionText}>{question.text}</p>

                <div style={styles.badges}>
                  {question.boostScore > 0 && (
                    <span style={styles.badge}>
                      🚀 Boosted {question.boostScore}
                    </span>
                  )}
                  {question.tags.map((tag) => (
                    <span key={tag} style={styles.badge}>
                      #{tag}
                    </span>
                  ))}
                </div>

                <div style={styles.questionFooter}>
                  <span style={styles.stat}>
                    💬 {question.answerCount} answers
                  </span>
                  <span style={styles.stat}>
                    🔓 {question.unlockCount} unlocks
                  </span>
                </div>

                <div style={styles.viewInApp}>
                  <a href={`avalo://questions/${question.id}`} style={styles.appLink}>
                    View in Avalo App →
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Footer CTA */}
      <div style={styles.footerCta}>
        <h3 style={styles.footerTitle}>Ready to join the conversation?</h3>
        <p style={styles.footerText}>
          Download Avalo to ask questions, share knowledge, and earn tokens
        </p>
        <div style={styles.ctaButtons}>
          <a href="https://apps.apple.com/app/avalo" style={styles.appButton}>
            Download Now
          </a>
        </div>
      </div>
    </div>
  );
}

// Simple inline styles for the web page
const styles: { [key: string]: React.CSSProperties } = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#F8F9FA',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  header: {
    backgroundColor: '#FFF',
    borderBottom: '1px solid #E5E5E5',
    padding: '32px 16px',
  },
  headerContent: {
    maxWidth: '800px',
    margin: '0 auto',
    textAlign: 'center',
  },
  title: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#000',
    margin: '0 0 8px 0',
  },
  subtitle: {
    fontSize: '16px',
    color: '#666',
    margin: 0,
  },
  ctaBanner: {
    backgroundColor: '#007AFF',
    color: '#FFF',
    padding: '40px 16px',
  },
  ctaContent: {
    maxWidth: '800px',
    margin: '0 auto',
    textAlign: 'center',
  },
  ctaTitle: {
    fontSize: '28px',
    fontWeight: 'bold',
    margin: '0 0 12px 0',
  },
  ctaText: {
    fontSize: '16px',
    margin: '0 0 24px 0',
    opacity: 0.9,
  },
  ctaButtons: {
    display: 'flex',
    gap: '16px',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  appButton: {
    display: 'inline-block',
    backgroundColor: '#FFF',
    color: '#007AFF',
    padding: '12px 24px',
    borderRadius: '8px',
    textDecoration: 'none',
    fontWeight: '600',
    fontSize: '16px',
    transition: 'transform 0.2s',
  },
  main: {
    maxWidth: '800px',
    margin: '0 auto',
    padding: '32px 16px',
  },
  sectionTitle: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#000',
    marginBottom: '24px',
  },
  loading: {
    textAlign: 'center',
    padding: '40px',
    color: '#666',
  },
  empty: {
    textAlign: 'center',
    padding: '40px',
    color: '#666',
  },
  questionsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  questionCard: {
    backgroundColor: '#FFF',
    border: '1px solid #E5E5E5',
    borderRadius: '12px',
    padding: '20px',
  },
  questionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '12px',
  },
  author: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#000',
  },
  time: {
    fontSize: '13px',
    color: '#999',
  },
  questionText: {
    fontSize: '16px',
    color: '#000',
    lineHeight: '1.6',
    marginBottom: '12px',
  },
  badges: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginBottom: '12px',
  },
  badge: {
    fontSize: '12px',
    color: '#666',
    backgroundColor: '#F0F0F0',
    padding: '4px 8px',
    borderRadius: '4px',
  },
  questionFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '12px',
    paddingBottom: '12px',
    borderBottom: '1px solid #F0F0F0',
  },
  stat: {
    fontSize: '13px',
    color: '#666',
  },
  viewInApp: {
    textAlign: 'center',
  },
  appLink: {
    color: '#007AFF',
    textDecoration: 'none',
    fontWeight: '600',
    fontSize: '14px',
  },
  footerCta: {
    backgroundColor: '#FFF',
    borderTop: '1px solid #E5E5E5',
    padding: '48px 16px',
    textAlign: 'center',
  },
  footerTitle: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#000',
    margin: '0 0 8px 0',
  },
  footerText: {
    fontSize: '16px',
    color: '#666',
    margin: '0 0 24px 0',
  },
};