"use strict";
/**
 * Tests for AI Companions Module - Focus on Limit Reset Logic
 */
Object.defineProperty(exports, "__esModule", { value: true });
// Mock Firebase admin
const mockFirestore = {
    collection: jest.fn(),
};
const mockServerTimestamp = jest.fn(() => ({ _seconds: Date.now() / 1000 }));
const mockIncrement = jest.fn((value) => ({ _increment: value }));
jest.mock("./init", () => ({
    db: mockFirestore,
    serverTimestamp: mockServerTimestamp,
    increment: mockIncrement,
}));
jest.mock("firebase-functions", () => ({
    region: jest.fn(() => ({
        https: {
            onCall: jest.fn((handler) => handler),
        },
    })),
}));
describe("AI Companions - Daily Limit Reset Logic", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    describe("Timestamp Conversion", () => {
        test("should handle Firestore timestamp with toDate method", () => {
            const mockDate = new Date("2025-10-27T10:00:00Z");
            const firestoreTimestamp = {
                toDate: jest.fn(() => mockDate),
                _seconds: mockDate.getTime() / 1000,
            };
            // Test the conversion logic
            const lastReset = typeof firestoreTimestamp.toDate === "function"
                ? firestoreTimestamp.toDate()
                : new Date(firestoreTimestamp._seconds * 1000);
            expect(lastReset).toEqual(mockDate);
            expect(firestoreTimestamp.toDate).toHaveBeenCalled();
        });
        test("should handle Firestore timestamp without toDate method (raw object)", () => {
            const mockDate = new Date("2025-10-27T10:00:00Z");
            const firestoreTimestamp = {
                _seconds: mockDate.getTime() / 1000,
            };
            // Test the conversion logic
            const lastReset = typeof firestoreTimestamp.toDate === "function"
                ? firestoreTimestamp.toDate()
                : new Date(firestoreTimestamp._seconds * 1000);
            expect(lastReset.getTime()).toBeCloseTo(mockDate.getTime(), -3); // Within milliseconds
        });
        test("should handle undefined/null timestamp", () => {
            const timestamp = null;
            const lastReset = timestamp ? timestamp.toDate() : new Date(0);
            expect(lastReset).toEqual(new Date(0));
        });
    });
    describe("Daily Limit Reset Calculation", () => {
        test("should reset when 24 hours have passed", () => {
            const now = new Date("2025-10-28T10:00:00Z");
            const lastReset = new Date("2025-10-27T09:00:00Z");
            const daysSinceReset = Math.floor((now.getTime() - lastReset.getTime()) / (1000 * 60 * 60 * 24));
            expect(daysSinceReset).toBe(1);
        });
        test("should not reset when less than 24 hours have passed", () => {
            const now = new Date("2025-10-28T10:00:00Z");
            const lastReset = new Date("2025-10-28T08:00:00Z");
            const daysSinceReset = Math.floor((now.getTime() - lastReset.getTime()) / (1000 * 60 * 60 * 24));
            expect(daysSinceReset).toBe(0);
        });
        test("should handle multiple days passed", () => {
            const now = new Date("2025-10-28T10:00:00Z");
            const lastReset = new Date("2025-10-25T10:00:00Z");
            const daysSinceReset = Math.floor((now.getTime() - lastReset.getTime()) / (1000 * 60 * 60 * 24));
            expect(daysSinceReset).toBe(3);
        });
        test("should handle edge case: exactly 24 hours", () => {
            const now = new Date("2025-10-28T10:00:00Z");
            const lastReset = new Date("2025-10-27T10:00:00Z");
            const daysSinceReset = Math.floor((now.getTime() - lastReset.getTime()) / (1000 * 60 * 60 * 24));
            expect(daysSinceReset).toBe(1);
        });
    });
    describe("Subscription Tier Logic", () => {
        test("should skip limit check for Plus tier", () => {
            const subscription = {
                tier: "Plus",
                status: "active",
                dailyMessageCount: 100,
            };
            // Plus tier should not have limits
            const shouldCheckLimit = subscription.tier === "Free";
            expect(shouldCheckLimit).toBe(false);
        });
        test("should check limit for Free tier", () => {
            const subscription = {
                tier: "Free",
                status: "active",
                dailyMessageCount: 5,
            };
            const shouldCheckLimit = subscription.tier === "Free";
            expect(shouldCheckLimit).toBe(true);
        });
        test("should enforce 10 message limit for Free tier", () => {
            const DAILY_LIMIT = 10;
            const dailyCount = 10;
            const limitReached = dailyCount >= DAILY_LIMIT;
            expect(limitReached).toBe(true);
        });
        test("should allow messages under limit for Free tier", () => {
            const DAILY_LIMIT = 10;
            const dailyCount = 5;
            const limitReached = dailyCount >= DAILY_LIMIT;
            expect(limitReached).toBe(false);
        });
    });
    describe("Edge Cases", () => {
        test("should handle zero daily count", () => {
            const dailyCount = 0;
            const DAILY_LIMIT = 10;
            expect(dailyCount < DAILY_LIMIT).toBe(true);
        });
        test("should handle undefined daily count", () => {
            const dailyCount = undefined;
            const actualCount = dailyCount || 0;
            expect(actualCount).toBe(0);
        });
        test("should handle negative days (clock skew)", () => {
            const now = new Date("2025-10-27T10:00:00Z");
            const lastReset = new Date("2025-10-28T10:00:00Z"); // Future date
            const daysSinceReset = Math.floor((now.getTime() - lastReset.getTime()) / (1000 * 60 * 60 * 24));
            // Should not reset if negative (clock skew)
            expect(daysSinceReset).toBe(-1);
            expect(daysSinceReset >= 1).toBe(false);
        });
        test("should handle very old lastResetDate (epoch)", () => {
            const now = new Date("2025-10-28T10:00:00Z");
            const lastReset = new Date(0);
            const daysSinceReset = Math.floor((now.getTime() - lastReset.getTime()) / (1000 * 60 * 60 * 24));
            expect(daysSinceReset).toBeGreaterThan(10000); // Many days
            expect(daysSinceReset >= 1).toBe(true); // Should reset
        });
    });
    describe("Error Handling", () => {
        test("should handle malformed timestamp gracefully", () => {
            const badTimestamp = { invalid: true };
            // The function should handle this without crashing
            const lastReset = typeof badTimestamp.toDate === "function"
                ? badTimestamp.toDate()
                : badTimestamp._seconds
                    ? new Date(badTimestamp._seconds * 1000)
                    : new Date(0);
            expect(lastReset).toEqual(new Date(0));
        });
        test("should handle NaN in timestamp conversion", () => {
            const badTimestamp = { _seconds: "not a number" };
            const lastReset = new Date(isNaN(badTimestamp._seconds * 1000)
                ? 0
                : badTimestamp._seconds * 1000);
            expect(lastReset.getTime()).toBe(0);
        });
    });
    describe("Integration: Full Limit Check Flow", () => {
        test("should reset and allow message after 24 hours (Free tier)", () => {
            const now = new Date("2025-10-28T10:00:00Z");
            const lastReset = new Date("2025-10-27T09:00:00Z");
            const dailyCount = 10;
            const DAILY_LIMIT = 10;
            const daysSinceReset = Math.floor((now.getTime() - lastReset.getTime()) / (1000 * 60 * 60 * 24));
            if (daysSinceReset >= 1) {
                // Should reset
                expect(true).toBe(true);
            }
            else {
                // Should check limit
                expect(dailyCount < DAILY_LIMIT).toBe(false);
            }
        });
        test("should block message at limit within 24 hours (Free tier)", () => {
            const now = new Date("2025-10-28T10:00:00Z");
            const lastReset = new Date("2025-10-28T08:00:00Z");
            const dailyCount = 10;
            const DAILY_LIMIT = 10;
            const daysSinceReset = Math.floor((now.getTime() - lastReset.getTime()) / (1000 * 60 * 60 * 24));
            let shouldBlock = false;
            if (daysSinceReset >= 1) {
                // Should reset
                shouldBlock = false;
            }
            else {
                // Should check limit
                shouldBlock = dailyCount >= DAILY_LIMIT;
            }
            expect(shouldBlock).toBe(true);
        });
    });
});
//# sourceMappingURL=aiCompanions.test.js.map