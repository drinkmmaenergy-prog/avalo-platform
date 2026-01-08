/**
 * PACK 162: Quiz and Checkpoint System
 * 
 * Features:
 * - Create quizzes for course episodes
 * - Take quizzes with scoring
 * - Track quiz attempts
 * - Award XP for passing quizzes
 * - No NSFW content
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, generateId, serverTimestamp, increment } from './init';
import { Timestamp } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';

interface Quiz {
  quizId: string;
  courseId: string;
  episodeId: string;
  creatorId: string;
  
  title: string;
  description: string;
  passingScore: number;
  
  questions: QuizQuestion[];
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface QuizQuestion {
  questionId: string;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation?: string;
  points: number;
}

interface QuizAttempt {
  attemptId: string;
  userId: string;
  quizId: string;
  courseId: string;
  episodeId: string;
  
  answers: number[];
  score: number;
  passed: boolean;
  
  timeSpentSeconds: number;
  
  attemptedAt: Timestamp;
}

export const createQuiz = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const {
      courseId,
      episodeId,
      title,
      description,
      passingScore,
      questions,
    } = request.data;

    if (!courseId || !episodeId || !title || !questions || questions.length === 0) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }

    const episodeDoc = await db.collection('course_episodes').doc(episodeId).get();
    if (!episodeDoc.exists) {
      throw new HttpsError('not-found', 'Episode not found');
    }

    const episode = episodeDoc.data();
    if (episode?.creatorId !== uid) {
      throw new HttpsError('permission-denied', 'Not your episode');
    }

    if (passingScore < 0 || passingScore > 100) {
      throw new HttpsError('invalid-argument', 'Passing score must be between 0-100');
    }

    const quizId = generateId();
    
    const quizQuestions: QuizQuestion[] = questions.map((q: any, index: number) => ({
      questionId: `q${index + 1}`,
      question: q.question,
      options: q.options,
      correctAnswer: q.correctAnswer,
      explanation: q.explanation,
      points: q.points || 10,
    }));

    const quiz: Quiz = {
      quizId,
      courseId,
      episodeId,
      creatorId: uid,
      title,
      description,
      passingScore,
      questions: quizQuestions,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await db.collection('course_quizzes').doc(quizId).set(quiz);

    await episodeDoc.ref.update({
      hasQuiz: true,
      quizId,
      updatedAt: serverTimestamp(),
    });

    logger.info(`Quiz created: ${quizId} for episode ${episodeId}`);

    return {
      success: true,
      quizId,
      message: 'Quiz created successfully',
    };
  }
);

export const takeQuiz = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { quizId, answers, timeSpentSeconds } = request.data;

    if (!quizId || !answers || !Array.isArray(answers)) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }

    const quizDoc = await db.collection('course_quizzes').doc(quizId).get();
    if (!quizDoc.exists) {
      throw new HttpsError('not-found', 'Quiz not found');
    }

    const quiz = quizDoc.data() as Quiz;

    const purchaseKey = `${uid}_${quiz.courseId}`;
    const purchase = await db.collection('course_purchases').doc(purchaseKey).get();

    if (!purchase.exists) {
      throw new HttpsError('failed-precondition', 'Must purchase course to take quiz');
    }

    if (answers.length !== quiz.questions.length) {
      throw new HttpsError('invalid-argument', 'Answer count mismatch');
    }

    let correctCount = 0;
    let totalPoints = 0;
    let earnedPoints = 0;

    quiz.questions.forEach((question, index) => {
      totalPoints += question.points;
      if (answers[index] === question.correctAnswer) {
        correctCount++;
        earnedPoints += question.points;
      }
    });

    const scorePercentage = (earnedPoints / totalPoints) * 100;
    const passed = scorePercentage >= quiz.passingScore;

    const attemptId = generateId();
    const attempt: QuizAttempt = {
      attemptId,
      userId: uid,
      quizId,
      courseId: quiz.courseId,
      episodeId: quiz.episodeId,
      answers,
      score: scorePercentage,
      passed,
      timeSpentSeconds: timeSpentSeconds || 0,
      attemptedAt: Timestamp.now(),
    };

    await db.collection('quiz_attempts').doc(attemptId).set(attempt);

    if (passed) {
      const episodeProgressId = `${uid}_${quiz.courseId}_${quiz.episodeId}`;
      await db.collection('episode_progress').doc(episodeProgressId).update({
        quizScore: scorePercentage,
        quizPassed: true,
        completed: true,
      });

      const progressId = `${uid}_${quiz.courseId}`;
      await db.collection('course_progress').doc(progressId).update({
        xpEarned: increment(20),
      });
    }

    logger.info(`Quiz attempt: ${attemptId} by ${uid}, passed: ${passed}`);

    return {
      success: true,
      attemptId,
      score: scorePercentage,
      passed,
      correctCount,
      totalQuestions: quiz.questions.length,
      message: passed ? 'Quiz passed!' : 'Quiz not passed. Try again!',
    };
  }
);

export const getQuizResults = onCall(
  { region: 'europe-west3' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { quizId } = request.data;

    const attemptsSnapshot = await db.collection('quiz_attempts')
      .where('userId', '==', uid)
      .where('quizId', '==', quizId)
      .orderBy('attemptedAt', 'desc')
      .limit(10)
      .get();

    const attempts = attemptsSnapshot.docs.map(doc => doc.data());

    return {
      success: true,
      attempts,
      totalAttempts: attempts.length,
      bestScore: Math.max(...attempts.map(a => a.score), 0),
    };
  }
);

export const pack162_createQuiz = createQuiz;
export const pack162_takeQuiz = takeQuiz;
export const pack162_getQuizResults = getQuizResults;