// src/app/api/auth/register/route.ts
//
// POST /api/auth/register
//
// Server-side endpoint for email+password registration.
// Uses Firebase Auth REST API to create the user,
// then creates the Firestore users/{uid} document via REST API.

import { NextRequest, NextResponse } from 'next/server';

const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

interface FirebaseAuthError {
  error?: {
    code?: number;
    message?: string;
    errors?: Array<{ message: string; domain: string; reason: string }>;
  };
}

interface FirebaseSignUpResponse {
  localId: string;
  email: string;
  idToken: string;
  refreshToken: string;
  expiresIn: string;
}

function mapFirebaseError(errorCode: string): string {
  switch (errorCode) {
    case 'EMAIL_EXISTS':
      return 'An account with this email already exists.';
    case 'WEAK_PASSWORD : Password should be at least 6 characters':
      return 'Password is too weak. Use at least 8 characters.';
    case 'INVALID_EMAIL':
      return 'The email address is invalid.';
    case 'OPERATION_NOT_ALLOWED':
      return 'Email/password registration is disabled. Contact support.';
    case 'TOO_MANY_ATTEMPTS_TRY_LATER':
      return 'Too many attempts. Please try again later.';
    default:
      return errorCode;
  }
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
    const { email, password, displayName } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Email is required.' },
        { status: 400 },
      );
    }

    if (!password || typeof password !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Password is required.' },
        { status: 400 },
      );
    }

    if (!displayName || typeof displayName !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Display name is required.' },
        { status: 400 },
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 8 characters.' },
        { status: 400 },
      );
    }

    // 1. Create user in Firebase Auth via REST API
    const signUpRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          returnSecureToken: true,
        }),
      },
    );

    const signUpData: FirebaseSignUpResponse & FirebaseAuthError = await signUpRes.json();

    if (!signUpRes.ok || signUpData.error) {
      const errorMessage = signUpData.error?.message || 'Registration failed.';
      console.error('Firebase Auth signUp error:', errorMessage);
      return NextResponse.json(
        { success: false, error: mapFirebaseError(errorMessage) },
        { status: 400 },
      );
    }

    const { localId: uid, idToken } = signUpData;

    // 2. Update display name on the Firebase Auth user
    await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          displayName,
          returnSecureToken: false,
        }),
      },
    );

    // 3. Create Firestore users/{uid} document via REST API
    const now = new Date().toISOString();
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users?documentId=${uid}`;

    const firestoreRes = await fetch(firestoreUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        fields: {
          uid: { stringValue: uid },
          email: { stringValue: email },
          displayName: { stringValue: displayName },
          photoURL: { nullValue: null },
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

    if (!firestoreRes.ok) {
      const firestoreError = await firestoreRes.text();
      console.error('Firestore document creation failed:', firestoreError);
      // User was created in Auth but Firestore doc failed.
      // Client-side authService will handle doc creation on next sign-in.
    }

    return NextResponse.json({
      success: true,
      data: { uid, email, displayName },
    });
  } catch (error: any) {
    console.error('Registration endpoint error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error.' },
      { status: 500 },
    );
  }
}
