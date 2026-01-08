/**
 * PACK 74 — Reservation Safety Integration Example
 * 
 * Shows how to integrate post-reservation safety follow-up
 */

import React, { useState, useEffect } from 'react';
import { View } from 'react-native';
import { PostReservationSafetyBanner } from './PostReservationSafetyBanner';
import { logSafetyAction } from '../../services/safetyRelationshipService';

// ============================================================================
// TYPES
// ============================================================================

interface ReservationSafetyIntegrationProps {
  reservationId: string;
  hostUserId: string;
  guestUserId: string;
  currentUserId: string;
  isFirstReservation: boolean;
  onReservationComplete?: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Safety follow-up integration for reservation screens
 * 
 * Usage in your reservation rating/completion screen:
 * ```tsx
 * <ReservationSafetyIntegration
 *   reservationId={reservationId}
 *   hostUserId={hostId}
 *   guestUserId={guestId}
 *   currentUserId={user.uid}
 *   isFirstReservation={isFirstMeeting}
 * />
 * ```
 */
export const ReservationSafetyIntegration: React.FC<ReservationSafetyIntegrationProps> = ({
  reservationId,
  hostUserId,
  guestUserId,
  currentUserId,
  isFirstReservation,
  onReservationComplete,
}) => {
  const [showBanner, setShowBanner] = useState(false);

  // Determine counterpart user (the other person in the reservation)
  const counterpartUserId = currentUserId === hostUserId ? guestUserId : hostUserId;

  // Show banner after first reservation
  useEffect(() => {
    if (isFirstReservation) {
      // Small delay to show after rating is submitted
      const timer = setTimeout(() => {
        setShowBanner(true);
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [isFirstReservation]);

  // Handle block action
  const handleBlock = async () => {
    await logSafetyAction(counterpartUserId, 'BLOCKED_USER', `After reservation ${reservationId}`);
    // Call your existing block user function
    setShowBanner(false);
  };

  // Handle report action
  const handleReport = async () => {
    await logSafetyAction(counterpartUserId, 'REPORTED_USER', `After reservation ${reservationId}`);
    // Call your existing report user function
    setShowBanner(false);
  };

  // Handle support contact
  const handleSupport = async () => {
    await logSafetyAction(counterpartUserId, 'CONTACT_SUPPORT', `After reservation ${reservationId}`);
    // Navigate to support with pre-filled info
    setShowBanner(false);
  };

  // Handle dismiss
  const handleDismiss = async () => {
    await logSafetyAction(counterpartUserId, 'OPENED_WARNING');
    setShowBanner(false);
    if (onReservationComplete) {
      onReservationComplete();
    }
  };

  return (
    <PostReservationSafetyBanner
      visible={showBanner}
      onBlock={handleBlock}
      onReport={handleReport}
      onSupport={handleSupport}
      onDismiss={handleDismiss}
    />
  );
};

// ============================================================================
// FULL RESERVATION RATING SCREEN EXAMPLE
// ============================================================================

/**
 * Example of complete reservation rating screen with safety follow-up
 */
export function ExampleReservationRatingScreen({ route }: any) {
  const { reservationId, hostUserId, guestUserId, currentUserId } = route.params;
  const [rating, setRating] = useState(0);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [isFirstReservation, setIsFirstReservation] = useState(false);

  // Check if this is user's first IRL reservation
  useEffect(() => {
    async function checkFirstReservation() {
      // Your logic to check if first reservation
      // e.g., query Firestore for previous completed reservations
      const isFirst = true; // Replace with actual check
      setIsFirstReservation(isFirst);
    }
    checkFirstReservation();
  }, []);

  const handleSubmitRating = async () => {
    // Your rating submission logic
    console.log('Submitting rating:', rating);
    setRatingSubmitted(true);
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Rating UI */}
      <View style={{ flex: 1 }}>
        {/* Your rating stars/interface */}
        {!ratingSubmitted && (
          <View>
            {/* Rating input */}
          </View>
        )}
      </View>

      {/* Safety follow-up banner (shows after rating submitted) */}
      {ratingSubmitted && (
        <ReservationSafetyIntegration
          reservationId={reservationId}
          hostUserId={hostUserId}
          guestUserId={guestUserId}
          currentUserId={currentUserId}
          isFirstReservation={isFirstReservation}
        />
      )}
    </View>
  );
}

export default ReservationSafetyIntegration;
