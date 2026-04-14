import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

import { defineString } from "firebase-functions/params";

export const STRIPE_SECRET = defineString("STRIPE_SECRET");
export const STRIPE_WEBHOOK_SECRET = defineString("STRIPE_WEBHOOK_SECRET");
export const FIREBASE_REGION = defineString("FIREBASE_REGION");

















