// src/app/api/auth/google/route.ts
//
// POST /api/auth/google
//
// Server-side endpoint for Google OAuth completion.
// Accepts a Google OAuth idToken (obtained client-side via signInWithPopup),
// verifies it against Firebase Auth, and ensures a Firestore users/{uid} document exists.

import { NextRequest, NextResponse } from 'next/server';

const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

interface FirebaseAuthError {
  error?: {
    code?: number;
    message?: string;
  };
}

interface FirebaseVerifyResponse {
  localId: string;
  email: string;
  displayName: string;
  photoUrl: string;
  idToken: string;
  refreshToken: string;
  expiresIn: string;
  needConfirmation?: boolean;
  oauthAccessToken?: string;
}

export async function POST(request: NextRequest) {
  try {
    if (!FIREBASE_API_KEY || !FIREBASE_PROJECT_ID) {
      console.error('Missing Firebase configuration environment variables.');
      return NextResponse.json(
        { success: false, error: 'Server configuration error.' },
        { status: 500 },
      );
    }

    const body = await request.json();
    const { idToken, accessToken } = body;

    if (!idToken && !accessToken) {
      return NextResponse.json(
        { success: false, error: 'Google idToken or accessToken is required.' },
        { status: 400 },
      );
    }

    // Exchange Google credential with Firebase Auth via REST API
    const requestBody: Record<string, any> = {
      postBody: idToken
        ? `id_token=${idToken}&providerId=google.com`
        : `access_token=${accessToken}&providerId=google.com`,
      requestUri: process.env.NEXT_PUBLIC_APP_URL || 'https://www.avaloapp.com',
      returnSecureToken: true,
      returnIdpCredential: true,
    };

    const verifyRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      },
    );

    const verifyData: FirebaseVerifyResponse & FirebaseAuthError = await verifyRes.json();

    if (!verifyRes.ok || verifyData.error) {
      const errorMessage = verifyData.error?.message || 'Google authentication failed.';
      console.error('Firebase Google auth error:', errorMessage);
      return NextResponse.json(
        { success: false, error: errorMessage },
        { status: 401 },
      );
    }

    const {
      localId: uid,
      email,
      displayName,
      photoUrl,
      idToken: firebaseIdToken,
    } = verifyData;

    // Ensure Firestore users/{uid} document exists
    const firestoreGetUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${uid}`;

    const docCheckRes = await fetch(firestoreGetUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${firebaseIdToken}`,
      },
    });

    if (docCheckRes.status === 404) {
      // Document does not exist — create it
      const now = new Date().toISOString();
      const firestoreCreateUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users?documentId=${uid}`;

      const createRes = await fetch(firestoreCreateUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${firebaseIdToken}`,
        },
        body: JSON.stringify({
          fields: {
            uid: { stringValue: uid },
            email: { stringValue: email || '' },
            displayName: { stringValue: displayName || email?.split('@')[0] || 'User' },
            photoURL: photoUrl ? { stringValue: photoUrl } : { nullValue: null },
            phoneNumber: { nullValue: null },
            role: { stringValue: 'user' },
            isCreator: { booleanValue: false },
            isVerified: { booleanValue: false },
            tokenBalance: { integerValue: '0' },
            accountStatus: { stringValue: 'ACTIVE' },
            createdAt: { timestampValue: now },
            lastActiveAt: { timestampValue: now },
          },
        }),
      });

      if (!createRes.ok) {
        const createError = await createRes.text();
        console.error('Firestore document creation failed for Google user:', createError);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        uid,
        email,
        displayName: displayName || null,
        photoURL: photoUrl || null,
        idToken: firebaseIdToken,
      },
    });
  } catch (error: any) {
    console.error('Google auth endpoint error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error.' },
      { status: 500 },
    );
  }
}

