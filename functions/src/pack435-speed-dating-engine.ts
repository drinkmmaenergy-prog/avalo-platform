/**
 * PACK 435 — Global Events Engine: Speed-Dating Engine
 * 
 * Real-time pairing, round management, and match suggestions
 * Depends on: PACK 435 Event Types, PACK 300 Safety
 */

import * as admin from 'firebase-admin';
import { EventAttendee, AttendeeStatus } from './pack435-event-types';

// ============================================================================
// SPEED DATING INTERFACES
// ============================================================================

export interface SpeedDatingSession {
  sessionId: string;
  eventId: string;
  status: 'pending' | 'active' | 'break' | 'completed' | 'cancelled';
  
  // Rounds
  totalRounds: number;
  currentRound: number;
  roundDuration: number; // minutes
  breakDuration: number; // minutes
  
  // Participants
  participants: SessionParticipant[];
  pairings: RoundPairing[];
  
  // Timing
  startTime: admin.firestore.Timestamp;
  currentRoundStartTime?: admin.firestore.Timestamp;
  currentRoundEndTime?: admin.firestore.Timestamp;
  nextBreakTime?: admin.firestore.Timestamp;
  
  // Matching
  enableFeedback: boolean;
  enableMatchSuggestions: boolean;
  
  // Metadata
  createdAt: admin.firestore.Timestamp;
  completedAt?: admin.firestore.Timestamp;
}

export interface SessionParticipant {
  userId: string;
  attendeeId: string;
  name: string;
  age: number;
  gender: 'male' | 'female' | 'other';
  preferences: MatchingPreferences;
  
  // Status
  isPresent: boolean;
  currentPairId?: string;
  seatNumber?: number;
  
  // Stats
  roundsCompleted: number;
  feedbackSubmitted: number;
  panicButtonUsed: boolean;
}

export interface MatchingPreferences {
  interestedIn: ('male' | 'female' | 'other')[];
  ageRange: { min: number; max: number };
  topics?: string[]; // interests, hobbies
  dealBreakers?: string[];
}

export interface RoundPairing {
  pairId: string;
  roundNumber: number;
  participant1: string; // userId
  participant2: string; // userId
  
  // Seats/Positions
  table?: number;
  position?: string;
  
  // Status
  status: 'pending' | 'active' | 'completed' | 'interrupted';
  
  // Timing
  startTime: admin.firestore.Timestamp;
  endTime?: admin.firestore.Timestamp;
  duration?: number; // actual duration in seconds
  
  // Feedback
  feedback1?: RoundFeedback;
  feedback2?: RoundFeedback;
  
  // Safety
  panicTriggered: boolean;
  panicBy?: string; // userId
  incidentReported: boolean;
}

export interface RoundFeedback {
  userId: string;
  rating: 1 | 2 | 3 | 4 | 5; // 1=no interest, 5=strong interest
  notes?: string;
  wouldMeetAgain: boolean;
  submittedAt: admin.firestore.Timestamp;
  
  // Red flags
  reportedConcerns: boolean;
  concernCategory?: string;
}

export interface MatchSuggestion {
  matchId: string;
  sessionId: string;
  user1: string;
  user2: string;
  
  // Match score
  compatibilityScore: number; // 0-100
  mutualInterest: boolean;
  
  // Reasons
  matchReasons: string[];
  
  // Status
  status: 'suggested' | 'notified' | 'accepted' | 'rejected' | 'expired';
  
  // Timestamps
  createdAt: admin.firestore.Timestamp;
  notifiedAt?: admin.firestore.Timestamp;
  expiresAt: admin.firestore.Timestamp;
}

// ============================================================================
// SESSION INITIALIZATION
// ============================================================================

export async function initializeSpeedDatingSession(
  eventId: string,
  config: {
    rounds: number;
    roundDuration: number;
    breakDuration: number;
    enableFeedback: boolean;
    enableMatchSuggestions: boolean;
  }
): Promise<string> {
  const db = admin.firestore();
  
  // Get checked-in attendees
  const attendeesSnapshot = await db.collection('eventAttendees')
    .where('eventId', '==', eventId)
    .where('status', '==', AttendeeStatus.CHECKED_IN)
    .get();
  
  if (attendeesSnapshot.empty) {
    throw new Error('No checked-in attendees found');
  }
  
  // Build participant list
  const participants: SessionParticipant[] = [];
  
  for (const doc of attendeesSnapshot.docs) {
    const attendee = doc.data() as EventAttendee;
    const userDoc = await db.collection('users').doc(attendee.userId).get();
    const userData = userDoc.data();
    
    if (userData) {
      participants.push({
        userId: attendee.userId,
        attendeeId: attendee.attendeeId,
        name: userData.displayName || 'Anonymous',
        age: userData.age || 25,
        gender: userData.gender || 'other',
        preferences: userData.matchingPreferences || {
          interestedIn: ['male', 'female', 'other'],
          ageRange: { min: 18, max: 99 },
        },
        isPresent: true,
        roundsCompleted: 0,
        feedbackSubmitted: 0,
        panicButtonUsed: false,
      });
    }
  }
  
  // Create session
  const sessionRef = db.collection('speedDatingSessions').doc();
  const sessionId = sessionRef.id;
  
  const session: SpeedDatingSession = {
    sessionId,
    eventId,
    status: 'pending',
    totalRounds: config.rounds,
    currentRound: 0,
    roundDuration: config.roundDuration,
    breakDuration: config.breakDuration,
    participants,
    pairings: [],
    startTime: admin.firestore.Timestamp.now(),
    enableFeedback: config.enableFeedback,
    enableMatchSuggestions: config.enableMatchSuggestions,
    createdAt: admin.firestore.Timestamp.now(),
  };
  
  await sessionRef.set(session);
  
  return sessionId;
}

// ============================================================================
// PAIRING ALGORITHM
// ============================================================================

export async function generateRoundPairings(sessionId: string): Promise<RoundPairing[]> {
  const db = admin.firestore();
  
  const sessionDoc = await db.collection('speedDatingSessions').doc(sessionId).get();
  if (!sessionDoc.exists) {
    throw new Error('Session not found');
  }
  
  const session = sessionDoc.data() as SpeedDatingSession;
  const participants = session.participants.filter(p => p.isPresent);
  
  if (participants.length < 2) {
    throw new Error('Not enough participants');
  }
  
  // Separate by gender for heterosexual matching (can be customized)
  const males = participants.filter(p => p.gender === 'male');
  const females = participants.filter(p => p.gender === 'female');
  const others = participants.filter(p => p.gender === 'other');
  
  const pairings: RoundPairing[] = [];
  const newRound = session.currentRound + 1;
  
  // Create round robin pairings
  const minCount = Math.min(males.length, females.length);
  
  for (let i = 0; i < minCount; i++) {
    const pair: RoundPairing = {
      pairId: `${sessionId}-R${newRound}-P${i + 1}`,
      roundNumber: newRound,
      participant1: males[i].userId,
      participant2: females[i].userId,
      table: i + 1,
      status: 'pending',
      startTime: admin.firestore.Timestamp.now(),
      panicTriggered: false,
      incidentReported: false,
    };
    
    pairings.push(pair);
  }
  
  // Handle "others" or unpaired participants
  for (let i = minCount; i < Math.max(males.length, females.length, others.length); i++) {
    let p1, p2;
    
    if (i < males.length && i < others.length) {
      p1 = males[i].userId;
      p2 = others[i - minCount].userId;
    } else if (i < females.length && i < others.length) {
      p1 = females[i].userId;
      p2 = others[i - minCount].userId;
    } else {
      continue; // Skip if no valid pairing
    }
    
    const pair: RoundPairing = {
      pairId: `${sessionId}-R${newRound}-P${i + 1}`,
      roundNumber: newRound,
      participant1: p1,
      participant2: p2,
      table: i + 1,
      status: 'pending',
      startTime: admin.firestore.Timestamp.now(),
      panicTriggered: false,
      incidentReported: false,
    };
    
    pairings.push(pair);
  }
  
  return pairings;
}

// ============================================================================
// ROUND MANAGEMENT
// ============================================================================

export async function startNextRound(sessionId: string): Promise<boolean> {
  const db = admin.firestore();
  
  const sessionRef = db.collection('speedDatingSessions').doc(sessionId);
  const sessionDoc = await sessionRef.get();
  
  if (!sessionDoc.exists) {
    return false;
  }
  
  const session = sessionDoc.data() as SpeedDatingSession;
  
  // Check if all rounds completed
  if (session.currentRound >= session.totalRounds) {
    await sessionRef.update({
      status: 'completed',
      completedAt: admin.firestore.Timestamp.now(),
    });
    return false;
  }
  
  // Generate pairings for next round
  const pairings = await generateRoundPairings(sessionId);
  
  const now = admin.firestore.Timestamp.now();
  const roundEndTime = new Date(now.toMillis() + session.roundDuration * 60 * 1000);
  
  // Update session
  await sessionRef.update({
    status: 'active',
    currentRound: admin.firestore.FieldValue.increment(1),
    pairings,
    currentRoundStartTime: now,
    currentRoundEndTime: admin.firestore.Timestamp.fromDate(roundEndTime),
  });
  
  // Save pairings
  for (const pairing of pairings) {
    await db.collection('speedDatingPairings').doc(pairing.pairId).set(pairing);
  }
  
  // Notify participants
  await notifyParticipantsOfPairing(sessionId, pairings);
  
  return true;
}

export async function endCurrentRound(sessionId: string): Promise<void> {
  const db = admin.firestore();
  
  const sessionRef = db.collection('speedDatingSessions').doc(sessionId);
  const sessionDoc = await sessionRef.get();
  
  if (!sessionDoc.exists) {
    return;
  }
  
  const session = sessionDoc.data() as SpeedDatingSession;
  
  // Mark all active pairings as completed
  const pairingsSnapshot = await db.collection('speedDatingPairings')
    .where('roundNumber', '==', session.currentRound)
    .where('status', '==', 'active')
    .get();
  
  for (const doc of pairingsSnapshot.docs) {
    await doc.ref.update({
      status: 'completed',
      endTime: admin.firestore.Timestamp.now(),
    });
  }
  
  // Set session to break
  const breakEndTime = new Date(Date.now() + session.breakDuration * 60 * 1000);
  
  await sessionRef.update({
    status: 'break',
    nextBreakTime: admin.firestore.Timestamp.fromDate(breakEndTime),
  });
  
  // Schedule next round after break
  setTimeout(() => {
    startNextRound(sessionId);
  }, session.breakDuration * 60 * 1000);
}

// ============================================================================
// FEEDBACK SYSTEM
// ============================================================================

export async function submitRoundFeedback(
  pairId: string,
  userId: string,
  feedback: {
    rating: 1 | 2 | 3 | 4 | 5;
    notes?: string;
    wouldMeetAgain: boolean;
    reportedConcerns: boolean;
    concernCategory?: string;
  }
): Promise<boolean> {
  const db = admin.firestore();
  
  const pairingRef = db.collection('speedDatingPairings').doc(pairId);
  const pairingDoc = await pairingRef.get();
  
  if (!pairingDoc.exists) {
    return false;
  }
  
  const pairing = pairingDoc.data() as RoundPairing;
  
  // Determine which participant is submitting
  const isParticipant1 = pairing.participant1 === userId;
  const isParticipant2 = pairing.participant2 === userId;
  
  if (!isParticipant1 && !isParticipant2) {
    return false;
  }
  
  const roundFeedback: RoundFeedback = {
    userId,
    rating: feedback.rating,
    notes: feedback.notes,
    wouldMeetAgain: feedback.wouldMeetAgain,
    submittedAt: admin.firestore.Timestamp.now(),
    reportedConcerns: feedback.reportedConcerns,
    concernCategory: feedback.concernCategory,
  };
  
  // Update appropriate feedback field
  const updateField = isParticipant1 ? 'feedback1' : 'feedback2';
  await pairingRef.update({
    [updateField]: roundFeedback,
  });
  
  // If concern reported, flag for review
  if (feedback.reportedConcerns) {
    await db.collection('safetyIncidents').add({
      eventId: pairing.pairId.split('-')[0],
      reportedBy: userId,
      reportedAgainst: isParticipant1 ? pairing.participant2 : pairing.participant1,
      category: feedback.concernCategory || 'general_concern',
      context: 'speed_dating_round',
      pairId,
      timestamp: admin.firestore.Timestamp.now(),
      status: 'pending_review',
    });
  }
  
  return true;
}

// ============================================================================
// MATCH SUGGESTIONS
// ============================================================================

export async function generateMatchSuggestions(sessionId: string): Promise<MatchSuggestion[]> {
  const db = admin.firestore();
  
  // Get all pairings with feedback
  const pairingsSnapshot = await db.collection('speedDatingPairings')
    .where('pairId', '>=', sessionId)
    .where('pairId', '<', sessionId + '\uf8ff')
    .get();
  
  const matches: MatchSuggestion[] = [];
  
  for (const doc of pairingsSnapshot.docs) {
    const pairing = doc.data() as RoundPairing;
    
    if (!pairing.feedback1 || !pairing.feedback2) {
      continue; // Need both feedbacks
    }
    
    // Check for mutual interest
    const mutualInterest = 
      pairing.feedback1.wouldMeetAgain && 
      pairing.feedback2.wouldMeetAgain &&
      pairing.feedback1.rating >= 4 &&
      pairing.feedback2.rating >= 4;
    
    if (!mutualInterest) {
      continue;
    }
    
    // Calculate compatibility score
    const avgRating = (pairing.feedback1.rating + pairing.feedback2.rating) / 2;
    const compatibilityScore = Math.floor(avgRating * 20); // Convert to 0-100 scale
    
    const matchSuggestion: MatchSuggestion = {
      matchId: `MATCH-${pairing.pairId}`,
      sessionId,
      user1: pairing.participant1,
      user2: pairing.participant2,
      compatibilityScore,
      mutualInterest,
      matchReasons: [
        'Both expressed interest',
        `High compatibility (${compatibilityScore}%)`,
        'Positive feedback from both sides',
      ],
      status: 'suggested',
      createdAt: admin.firestore.Timestamp.now(),
      expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    };
    
    matches.push(matchSuggestion);
    
    // Save match suggestion
    await db.collection('matchSuggestions').doc(matchSuggestion.matchId).set(matchSuggestion);
  }
  
  return matches;
}

// ============================================================================
// PANIC BUTTON
// ============================================================================

export async function triggerPanicButton(
  pairId: string,
  userId: string
): Promise<boolean> {
  const db = admin.firestore();
  
  const pairingRef = db.collection('speedDatingPairings').doc(pairId);
  const pairingDoc = await pairingRef.get();
  
  if (!pairingDoc.exists) {
    return false;
  }
  
  // Mark pairing as interrupted
  await pairingRef.update({
    status: 'interrupted',
    panicTriggered: true,
    panicBy: userId,
    endTime: admin.firestore.Timestamp.now(),
  });
  
  // Create safety incident
  const pairing = pairingDoc.data() as RoundPairing;
  
  await db.collection('safetyIncidents').add({
    type: 'panic_button',
    eventId: pairing.pairId.split('-')[0],
    reportedBy: userId,
    context: 'speed_dating_round',
    pairId,
    severity: 'high',
    status: 'pending_immediate_review',
    timestamp: admin.firestore.Timestamp.now(),
  });
  
  // Notify event staff/organizers
  await notifyEventStaff(pairing.pairId.split('-')[0], 'panic_button_triggered', {
    pairId,
    userId,
  });
  
  return true;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function notifyParticipantsOfPairing(
  sessionId: string,
  pairings: RoundPairing[]
): Promise<void> {
  const db = admin.firestore();
  
  for (const pairing of pairings) {
    // Send notification to both participants
    await db.collection('notifications').add({
      userId: pairing.participant1,
      type: 'speed_dating_round_start',
      title: 'New Round Starting',
      body: `Your next speed dating round is starting at Table ${pairing.table}`,
      data: { sessionId, pairId: pairing.pairId, table: pairing.table },
      createdAt: admin.firestore.Timestamp.now(),
      read: false,
    });
    
    await db.collection('notifications').add({
      userId: pairing.participant2,
      type: 'speed_dating_round_start',
      title: 'New Round Starting',
      body: `Your next speed dating round is starting at Table ${pairing.table}`,
      data: { sessionId, pairId: pairing.pairId, table: pairing.table },
      createdAt: admin.firestore.Timestamp.now(),
      read: false,
    });
  }
}

async function notifyEventStaff(
  eventId: string,
  alertType: string,
  metadata: any
): Promise<void> {
  const db = admin.firestore();
  
  // Get event organizer
  const eventDoc = await db.collection('events').doc(eventId).get();
  const organizerId = eventDoc.data()?.organizerId;
  
  if (organizerId) {
    await db.collection('notifications').add({
      userId: organizerId,
      type: 'event_staff_alert',
      title: 'Event Safety Alert',
      body: `A ${alertType} has been triggered at your event`,
      data: { eventId, alertType, ...metadata },
      priority: 'high',
      createdAt: admin.firestore.Timestamp.now(),
      read: false,
    });
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  initializeSpeedDatingSession,
  generateRoundPairings,
  startNextRound,
  endCurrentRound,
  submitRoundFeedback,
  generateMatchSuggestions,
  triggerPanicButton,
};
