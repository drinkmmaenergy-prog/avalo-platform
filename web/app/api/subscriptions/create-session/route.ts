/**
 * API Route: Create Stripe Subscription Checkout Session
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { verifyIdToken } from "@/lib/firebase-admin";
import { SUBSCRIPTION_TIERS } from "@/lib/stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-12-18.acacia",
});

export async function POST(request: NextRequest) {
  try {
    // Get authorization header
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const idToken = authHeader.split("Bearer ")[1];

    // Verify the ID token
    const decodedToken = await verifyIdToken(idToken);
    if (!decodedToken) {
      return NextResponse.json(
        { error: "Invalid token" },
        { status: 401 }
      );
    }

    const { tierId } = await request.json();

    if (!tierId) {
      return NextResponse.json(
        { error: "Tier ID is required" },
        { status: 400 }
      );
    }

    // Find the tier
    const tier = SUBSCRIPTION_TIERS.find((t) => t.id === tierId);
    if (!tier) {
      return NextResponse.json(
        { error: "Invalid tier ID" },
        { status: 400 }
      );
    }

    // Create or get Stripe customer
    let customerId: string | undefined;
    
    // TODO: Check if user has existing Stripe customer ID in Firestore
    // For now, we create a new customer if needed
    
    // Create Stripe subscription checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Avalo ${tier.name} Membership`,
              description: tier.features.join(", "),
            },
            unit_amount: Math.round(tier.price * 100), // Convert to cents
            recurring: {
              interval: "month",
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/subscriptions?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/subscriptions`,
      client_reference_id: decodedToken.uid,
      customer: customerId,
      customer_email: decodedToken.email,
      metadata: {
        userId: decodedToken.uid,
        tierId: tier.id,
        tierType: tier.type,
      },
    });

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error: any) {
    console.error("Subscription session error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create subscription session" },
      { status: 500 }
    );
  }
}