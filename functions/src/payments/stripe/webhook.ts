import { MONETIZATION_SPLITS, SPLITS } from "../../config/monetizationSplits";

import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import Stripe from "stripe";

export const stripeWebhookV1 = onRequest(
  {
    region: "europe-west1",
    memory: "512MiB",
    timeoutSeconds: 60,
    minInstances: 1,
    secrets: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
  },
  async (req, res) => {
    try {
      if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
      }

      const stripeSecret = process.env.STRIPE_SECRET_KEY;
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

      if (!stripeSecret || !webhookSecret) {
        logger.error("Stripe secrets not configured");
        res.status(500).send("Stripe configuration error");
        return;
      }

      const stripe = new Stripe(stripeSecret, {
        apiVersion: "2023-10-16",
      });

      const sig = req.headers["stripe-signature"] as string;

      if (!sig) {
        res.status(400).send("Missing signature");
        return;
      }

      let event: Stripe.Event;

      try {
        event = stripe.webhooks.constructEvent(
          req.rawBody as Buffer,
          sig,
          webhookSecret
        );
      } catch (err: any) {
        logger.error("Signature verification failed", err);
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
      }

      switch (event.type) {
        case "checkout.session.completed":
          logger.info("Checkout completed", event.data.object);
          break;

        case "payment_intent.succeeded":
          logger.info("Payment succeeded", event.data.object);
          break;

        default:
          logger.info(`Unhandled event type: ${event.type}`);
      }

      res.status(200).json({ received: true });

    } catch (err: any) {
      logger.error("Unhandled webhook error", err);
      res.status(500).json({ error: err.message });
    }
  }
);



























