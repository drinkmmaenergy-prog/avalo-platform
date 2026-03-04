// src/app/api/auth/login/route.ts
//
// POST /api/auth/login
//
// Server-side endpoint for email + password sign-in
// Uses Firebase Identity Toolkit REST API

import { NextRequest, NextResponse } from "next/server";

const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY as string;

interface FirebaseErrorResponse {
  error?: {
    message?: string;
  };
}

interface FirebaseSignInSuccess {
  localId: string;
  email: string;
  displayName?: string;
  idToken: string;
  refreshToken: string;
  expiresIn: string;
  registered: boolean;
}

function mapFirebaseError(code?: string): string {
  switch (code) {
    case "EMAIL_NOT_FOUND":
      return "No account found with this email address.";
    case "INVALID_PASSWORD":
    case "INVALID_LOGIN_CREDENTIALS":
      return "Invalid email or password.";
    case "USER_DISABLED":
      return "This account has been disabled.";
    case "TOO_MANY_ATTEMPTS_TRY_LATER":
      return "Too many failed attempts. Try again later.";
    default:
      return "Login failed.";
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!FIREBASE_API_KEY) {
      console.error("FIREBASE_API_KEY missing in environment.");
      return NextResponse.json(
        { success: false, error: "Server configuration error." },
        { status: 500 }
      );
    }

    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "Email and password are required." },
        { status: 400 }
      );
    }

    const firebaseRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          returnSecureToken: true,
        }),
      }
    );

    const data:
      | FirebaseSignInSuccess
      | FirebaseErrorResponse = await firebaseRes.json();

    if (!firebaseRes.ok || "error" in data) {
      const errorCode =
        (data as FirebaseErrorResponse).error?.message || "UNKNOWN_ERROR";

      console.error("Firebase login error:", errorCode);

      return NextResponse.json(
        {
          success: false,
          error: mapFirebaseError(errorCode),
        },
        { status: 401 }
      );
    }

    const { localId, email: userEmail, displayName, idToken } =
      data as FirebaseSignInSuccess;

    return NextResponse.json({
      success: true,
      data: {
        uid: localId,
        email: userEmail,
        displayName: displayName ?? null,
        idToken,
      },
    });
  } catch (err: any) {
    console.error("Login route crash:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error." },
      { status: 500 }
    );
  }
}