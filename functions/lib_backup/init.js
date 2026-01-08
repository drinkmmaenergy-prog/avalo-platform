"use strict";
/**
 * Firebase Admin Initialization
 * Single source of truth for Firestore, Auth, and Storage instances
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateId = exports.timestamp = exports.arrayRemove = exports.arrayUnion = exports.increment = exports.serverTimestamp = exports.admin = exports.storage = exports.auth = exports.db = void 0;
const admin = __importStar(require("firebase-admin"));
exports.admin = admin;
const firestore_1 = require("firebase-admin/firestore");
// Initialize Firebase Admin SDK only once
if (!admin.apps.length) {
    admin.initializeApp();
}
// Firestore instance (with modern API)
exports.db = (0, firestore_1.getFirestore)();
// Auth & Storage
exports.auth = admin.auth();
exports.storage = admin.storage();
// Firestore global settings
exports.db.settings({
    ignoreUndefinedProperties: true,
});
// --------------------------
// 🔧 Helper utilities
// --------------------------
// FieldValue helpers
exports.serverTimestamp = firestore_1.FieldValue.serverTimestamp;
exports.increment = firestore_1.FieldValue.increment;
exports.arrayUnion = firestore_1.FieldValue.arrayUnion;
exports.arrayRemove = firestore_1.FieldValue.arrayRemove;
// Timestamp helper (optional explicit export)
exports.timestamp = firestore_1.Timestamp;
// Helper to generate unique document IDs
const generateId = () => exports.db.collection("_").doc().id;
exports.generateId = generateId;
// --------------------------
// ✅ Diagnostics log
// --------------------------
console.log("🔥 Firebase Admin initialized successfully with Firestore, Auth, and Storage.");
//# sourceMappingURL=init.js.map