/**
 * PACK 314 - Configuration API Endpoints
 * 
 * Public and admin endpoints for configuration management
 * 
 * Region: europe-west3
 */

import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { getFirestore } from "firebase-admin/firestore";
import {
  getPublicAppConfig,
  updateAppConfig,
  initializeDefaultConfig,
  AppConfig,
} from "../services/configService";
import { FUNCTIONS_REGION } from "../config";

const db = getFirestore();

/**
 * GET /config/app
 * 
 * Public endpoint for clients to fetch sanitized configuration
 * Returns feature flags, country rollout info, and force upgrade requirements
 */
export const getAppConfigEndpoint = onRequest(
  {
    region: FUNCTIONS_REGION,
    cors: true,
  },
  async (req, res) => {
    try {
      // Only allow GET requests
      if (req.method !== "GET") {
        res.status(405).json({ error: "Method not allowed" });
        return;
      }

      const publicConfig = await getPublicAppConfig();

      res.status(200).json({
        success: true,
        config: publicConfig,
      });
    } catch (error) {
      logger.error("Error in getAppConfigEndpoint:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch configuration",
      });
    }
  }
);

/**
 * POST /config/app/update
 * 
 * Admin endpoint to update app configuration
 * Requires admin authentication
 */
export const updateAppConfigEndpoint = onRequest(
  {
    region: FUNCTIONS_REGION,
    cors: true,
  },
  async (req, res) => {
    try {
      // Only allow POST requests
      if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed" });
        return;
      }

      // Extract auth token
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res.status(401).json({ error: "Unauthorized - No token provided" });
        return;
      }

      const token = authHeader.split("Bearer ")[1];

      // Verify admin authentication
      const { getAuth } = await import("firebase-admin/auth");
      const decodedToken = await getAuth().verifyIdToken(token);
      const uid = decodedToken.uid;

      // Check if user is admin
      const userDoc = await db.collection("users").doc(uid).get();
      const userData = userDoc.data();

      if (!userData || !["ADMIN", "SUPERADMIN", "PRODUCT"].includes(userData.role)) {
        res.status(403).json({ error: "Forbidden - Admin access required" });
        return;
      }

      // Get updates from request body
      const updates = req.body as Partial<AppConfig>;

      if (!updates || Object.keys(updates).length === 0) {
        res.status(400).json({ error: "No updates provided" });
        return;
      }

      // Update configuration
      await updateAppConfig(updates, uid);

      res.status(200).json({
        success: true,
        message: "Configuration updated successfully",
      });
    } catch (error) {
      logger.error("Error in updateAppConfigEndpoint:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update configuration",
      });
    }
  }
);

/**
 * POST /config/app/initialize
 * 
 * Initialize default configuration (one-time setup)
 * Requires admin authentication
 */
export const initializeConfigEndpoint = onRequest(
  {
    region: FUNCTIONS_REGION,
    cors: true,
  },
  async (req, res) => {
    try {
      // Only allow POST requests
      if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed" });
        return;
      }

      // Extract auth token
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res.status(401).json({ error: "Unauthorized - No token provided" });
        return;
      }

      const token = authHeader.split("Bearer ")[1];

      // Verify admin authentication
      const { getAuth } = await import("firebase-admin/auth");
      const decodedToken = await getAuth().verifyIdToken(token);
      const uid = decodedToken.uid;

      // Check if user is admin
      const userDoc = await db.collection("users").doc(uid).get();
      const userData = userDoc.data();

      if (!userData || !["ADMIN", "SUPERADMIN"].includes(userData.role)) {
        res.status(403).json({ error: "Forbidden - Superadmin access required" });
        return;
      }

      // Initialize config
      await initializeDefaultConfig();

      // Audit log
      await db.collection("auditLogs").add({
        type: "CONFIG_INITIALIZED",
        adminId: uid,
        timestamp: new Date(),
      });

      res.status(200).json({
        success: true,
        message: "Configuration initialized successfully",
      });
    } catch (error) {
      logger.error("Error in initializeConfigEndpoint:", error);
      res.status(500).json({
        success: false,
        error: "Failed to initialize configuration",
      });
    }
  }
);