/**
 * API Route: Verify Firebase ID Token and Create Custom Token
 * Used for SSO from mobile app
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, createCustomToken } from "@/lib/firebase-admin";

export async function POST(request: NextRequest) {
  try {
    const { idToken } = await request.json();

    if (!idToken) {
      return NextResponse.json(
        { error: "ID token is required" },
        { status: 400 }
      );
    }

    // Verify the ID token
    const decodedToken = await verifyIdToken(idToken);

    if (!decodedToken) {
      return NextResponse.json(
        { error: "Invalid token" },
        { status: 401 }
      );
    }

    // Create a custom token for the user
    const customToken = await createCustomToken(decodedToken.uid);

    return NextResponse.json({
      customToken,
      uid: decodedToken.uid,
    });
  } catch (error: any) {
    console.error("Token verification error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to verify token" },
      { status: 500 }
    );
  }
}
