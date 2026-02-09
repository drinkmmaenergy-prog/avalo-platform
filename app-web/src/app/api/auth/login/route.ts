// src/app/api/auth/login/route.ts
//
// POST /api/auth/login
//
// Server-side endpoint for email+password sign-in.
// Uses Firebase Auth REST API to verify credentials and return tokens.

import { NextRequest, NextResponse } from 'next/server';

const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

interface FirebaseAuthError {
  error?: {
    code?: number;
    message?: string;
    errors?: Array<{ message: string; domain: string; reason: string }>;
  };
}

interface FirebaseSignInResponse {
  localId: string;
  email: string;
  displayName: string;
  idToken: string;
  refreshToken: string;
  expiresIn: string;
  registered: boolean;
}

function mapFirebaseError(errorCode: string): string {
  switch (errorCode) {
    case 'EMAIL_NOT_FOUND':
      return 'No account found with this email address.';
    case 'INVALID_PASSWORD':
      return 'Invalid password. Please try again.';
    case 'USER_DISABLED':
      return 'This account has been disabled. Contact support.';
    case 'INVALID_LOGIN_CREDENTIALS':
      return 'Invalid email or password.';
    case 'TOO_MANY_ATTEMPTS_TRY_LATER : Access to this account has been temporarily disabled due to many failed login attempts. You can immediately restore it by resetting your password or you can try again later.':
      return 'Too many failed attempts. Please reset your password or try again later.';
    case 'TOO_MANY_ATTEMPTS_TRY_LATER':
      return 'Too many attempts. Please try again later.';
    default:
      return errorCode;
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!FIREBASE_API_KEY) {
      console.error('Missing NEXT_PUBLIC_FIREBASE_API_KEY environment variable.');
      return NextResponse.json(
        { success: false, error: 'Server configuration error.' },
        { status: 500 },
      );
    }

    const body = await request.json();
    const { email, password } = body;

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

    // Verify credentials via Firebase Auth REST API
    const signInRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
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

    const signInData: FirebaseSignInResponse & FirebaseAuthError = await signInRes.json();

    if (!signInRes.ok || signInData.error) {
      const errorMessage = signInData.error?.message || 'Login failed.';
      console.error('Firebase Auth signIn error:', errorMessage);
      return NextResponse.json(
        { success: false, error: mapFirebaseError(errorMessage) },
        { status: 401 },
      );
    }

    const { localId: uid, email: userEmail, displayName, idToken } = signInData;

    return NextResponse.json({
      success: true,
      data: {
        uid,
        email: userEmail,
        displayName: displayName || null,
        idToken,
      },
    });
  } catch (error: any) {
    console.error('Login endpoint error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error.' },
      { status: 500 },
    );
  }
}
