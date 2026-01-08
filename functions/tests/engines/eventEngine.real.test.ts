/**
 * Event Engine Real Tests
 * Tests event queue processing with actual Firebase operations
 */

;
import { EventStatus, EventPriority, EventType } from "../../src/engines/eventEngine";
import { Timestamp } from "firebase-admin/firestore";

describe("Event Engine - Real Tests", () => {
  let db: any;

  beforeAll(async () => {
    db = getDb();
    await setupTestEnvironment();
  });

  beforeEach(async () => {
    // Clear events before each test
    const eventsSnapshot = await db.collection("systemEvents").limit(500).get();
    const batch = db.batch();
    eventsSnapshot.docs.forEach((doc: any) => batch.delete(doc.ref));
    await batch.commit();
  });

  describe("Event Creation and Queuing", () => {
    it("should create event with correct fields", async () => {
      const eventId = `evt_${Date.now()}`;
      const eventData = {
        eventId,
        type: EventType.CHAT_MESSAGE,
        priority: EventPriority.NORMAL,
        status: EventStatus.QUEUED,
        payload: { chatId: "chat123", message: "Hello" },
        ttl: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000), // 1 hour from now
        createdAt: Timestamp.now(),
        retryCount: 0,
        maxRetries: 3,
        updatedAt: Timestamp.now(),
      };

      await db.collection("systemEvents").doc(eventId).set(eventData);

      const doc = await db.collection("systemEvents").doc(eventId).get();
      expect(doc.exists).toBe(true);

      const data = doc.data();
      expect(data.eventId).toBe(eventId);
      expect(data.type).toBe(EventType.CHAT_MESSAGE);
      expect(data.priority).toBe(EventPriority.NORMAL);
      expect(data.status).toBe(EventStatus.QUEUED);
      expect(data.payload.chatId).toBe("chat123");
      expect(data.retryCount).toBe(0);
      expect(data.maxRetries).toBe(3);
    });

    it("should queue events with different priorities", async () => {
      const events = [
        {
          eventId: "evt_low",
          type: EventType.CHAT_MESSAGE,
          priority: EventPriority.LOW,
          status: EventStatus.QUEUED,
          payload: {},
          ttl: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
          createdAt: minutesAgo(10),
          retryCount: 0,
          maxRetries: 3,
          updatedAt: Timestamp.now(),
        },
        {
          eventId: "evt_high",
          type: EventType.PAYMENT_PURCHASE,
          priority: EventPriority.HIGH,
          status: EventStatus.QUEUED,
          payload: {},
          ttl: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
          createdAt: minutesAgo(5),
          retryCount: 0,
          maxRetries: 3,
          updatedAt: Timestamp.now(),
        },
        {
          eventId: "evt_critical",
          type: EventType.MODERATION_FLAG,
          priority: EventPriority.CRITICAL,
          status: EventStatus.QUEUED,
          payload: {},
          ttl: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
          createdAt: minutesAgo(2),
          retryCount: 0,
          maxRetries: 3,
          updatedAt: Timestamp.now(),
        },
      ];

      // Create all events
      for (const event of events) {
        await db.collection("systemEvents").doc(event.eventId).set(event);
      }

      // Query by priority (descending) to verify ordering
      const snapshot = await db
        .collection("systemEvents")
        .where("status", "==", EventStatus.QUEUED)
        .orderBy("priority", "desc")
        .get();

      expect(snapshot.size).toBe(3);

      const priorities = snapshot.docs.map((doc: any) => doc.data().priority);
      expect(priorities[0]).toBe(EventPriority.CRITICAL); // Highest priority first
      expect(priorities[1]).toBe(EventPriority.HIGH);
      expect(priorities[2]).toBe(EventPriority.LOW);
    });
  });

  describe("Event Processing and Idempotency", () => {
    it("should mark event as processing with processedBy", async () => {
      const eventId = "evt_process";
      const instanceId = "instance_123";

      await db.collection("systemEvents").doc(eventId).set({
        eventId,
        type: EventType.CHAT_MESSAGE,
        priority: EventPriority.NORMAL,
        status: EventStatus.QUEUED,
        payload: {},
        ttl: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
        createdAt: Timestamp.now(),
        retryCount: 0,
        maxRetries: 3,
        updatedAt: Timestamp.now(),
      });

      // Simulate processing: update status and set processedBy
      await db.collection("systemEvents").doc(eventId).update({
        status: EventStatus.PROCESSING,
        processedBy: instanceId,
        updatedAt: Timestamp.now(),
      });

      const doc = await db.collection("systemEvents").doc(eventId).get();
      const data = doc.data();

      expect(data.status).toBe(EventStatus.PROCESSING);
      expect(data.processedBy).toBe(instanceId);
    });

    it("should complete event successfully", async () => {
      const eventId = "evt_complete";

      await db.collection("systemEvents").doc(eventId).set({
        eventId,
        type: EventType.PAYMENT_PURCHASE,
        priority: EventPriority.NORMAL,
        status: EventStatus.PROCESSING,
        processedBy: "instance_123",
        payload: {},
        ttl: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
        createdAt: Timestamp.now(),
        retryCount: 0,
        maxRetries: 3,
        updatedAt: Timestamp.now(),
      });

      // Mark as completed
      await db.collection("systemEvents").doc(eventId).update({
        status: EventStatus.COMPLETED,
        processedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      const doc = await db.collection("systemEvents").doc(eventId).get();
      const data = doc.data();

      expect(data.status).toBe(EventStatus.COMPLETED);
      expect(data.processedAt).toBeDefined();
    });

    it("should handle event failure with retry count", async () => {
      const eventId = "evt_fail";

      await db.collection("systemEvents").doc(eventId).set({
        eventId,
        type: EventType.CHAT_MESSAGE,
        priority: EventPriority.NORMAL,
        status: EventStatus.PROCESSING,
        processedBy: "instance_123",
        payload: {},
        ttl: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
        createdAt: Timestamp.now(),
        retryCount: 0,
        maxRetries: 3,
        updatedAt: Timestamp.now(),
      });

      // Mark as failed and increment retry count
      await db.collection("systemEvents").doc(eventId).update({
        status: EventStatus.FAILED,
        retryCount: 1,
        failureReason: "Network timeout",
        updatedAt: Timestamp.now(),
      });

      const doc = await db.collection("systemEvents").doc(eventId).get();
      const data = doc.data();

      expect(data.status).toBe(EventStatus.FAILED);
      expect(data.retryCount).toBe(1);
      expect(data.failureReason).toBe("Network timeout");
    });
  });

  describe("TTL and Expiration", () => {
    it("should identify expired events", async () => {
      const expiredEventId = "evt_expired";
      const validEventId = "evt_valid";

      // Create expired event (TTL in past)
      await db.collection("systemEvents").doc(expiredEventId).set({
        eventId: expiredEventId,
        type: EventType.CHAT_MESSAGE,
        priority: EventPriority.NORMAL,
        status: EventStatus.QUEUED,
        payload: {},
        ttl: minutesAgo(10), // 10 minutes ago
        createdAt: minutesAgo(20),
        retryCount: 0,
        maxRetries: 3,
        updatedAt: Timestamp.now(),
      });

      // Create valid event (TTL in future)
      await db.collection("systemEvents").doc(validEventId).set({
        eventId: validEventId,
        type: EventType.CHAT_MESSAGE,
        priority: EventPriority.NORMAL,
        status: EventStatus.QUEUED,
        payload: {},
        ttl: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000), // 1 hour from now
        createdAt: Timestamp.now(),
        retryCount: 0,
        maxRetries: 3,
        updatedAt: Timestamp.now(),
      });

      // Query for events with TTL > now (valid events only)
      const validSnapshot = await db
        .collection("systemEvents")
        .where("status", "==", EventStatus.QUEUED)
        .where("ttl", ">", Timestamp.now())
        .get();

      expect(validSnapshot.size).toBe(1);
      expect(validSnapshot.docs[0].id).toBe(validEventId);

      // Query for expired events (TTL < now)
      const expiredSnapshot = await db
        .collection("systemEvents")
        .where("status", "==", EventStatus.QUEUED)
        .where("ttl", "<", Timestamp.now())
        .get();

      expect(expiredSnapshot.size).toBe(1);
      expect(expiredSnapshot.docs[0].id).toBe(expiredEventId);
    });

    it("should mark expired event as EXPIRED", async () => {
      const eventId = "evt_mark_expired";

      await db.collection("systemEvents").doc(eventId).set({
        eventId,
        type: EventType.CHAT_MESSAGE,
        priority: EventPriority.NORMAL,
        status: EventStatus.QUEUED,
        payload: {},
        ttl: minutesAgo(5),
        createdAt: minutesAgo(10),
        retryCount: 0,
        maxRetries: 3,
        updatedAt: Timestamp.now(),
      });

      // Mark as expired
      await db.collection("systemEvents").doc(eventId).update({
        status: EventStatus.EXPIRED,
        updatedAt: Timestamp.now(),
      });

      const doc = await db.collection("systemEvents").doc(eventId).get();
      expect(doc.data().status).toBe(EventStatus.EXPIRED);
    });
  });

  describe("Retry Logic", () => {
    it("should retry failed event within retry limit", async () => {
      const eventId = "evt_retry";

      await db.collection("systemEvents").doc(eventId).set({
        eventId,
        type: EventType.PAYMENT_PURCHASE,
        priority: EventPriority.HIGH,
        status: EventStatus.FAILED,
        payload: {},
        ttl: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
        createdAt: minutesAgo(15),
        retryCount: 1,
        maxRetries: 3,
        failureReason: "Temporary error",
        updatedAt: minutesAgo(10),
      });

      // Simulate retry: change status back to QUEUED
      await db.collection("systemEvents").doc(eventId).update({
        status: EventStatus.QUEUED,
        updatedAt: Timestamp.now(),
      });

      const doc = await db.collection("systemEvents").doc(eventId).get();
      const data = doc.data();

      expect(data.status).toBe(EventStatus.QUEUED);
      expect(data.retryCount).toBe(1); // Retry count not reset
      expect(data.maxRetries).toBe(3);
    });

    it("should not retry event exceeding max retries", async () => {
      const eventId = "evt_max_retries";

      await db.collection("systemEvents").doc(eventId).set({
        eventId,
        type: EventType.CHAT_MESSAGE,
        priority: EventPriority.NORMAL,
        status: EventStatus.FAILED,
        payload: {},
        ttl: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
        createdAt: minutesAgo(30),
        retryCount: 3,
        maxRetries: 3,
        failureReason: "Max retries reached",
        updatedAt: Timestamp.now(),
      });

      // Query for events eligible for retry (retryCount < maxRetries)
      const retryableSnapshot = await db
        .collection("systemEvents")
        .where("status", "==", EventStatus.FAILED)
        .get();

      const retryable = retryableSnapshot.docs.filter((doc: any) => {
        const data = doc.data();
        return data.retryCount < data.maxRetries;
      });

      expect(retryable.length).toBe(0); // No events eligible for retry
    });
  });

  describe("Event Types and Payload Validation", () => {
    it("should store different event types correctly", async () => {
      const eventTypes = [
        EventType.CHAT_DEPOSITED,
        EventType.CHAT_MESSAGE,
        EventType.CALENDAR_BOOKED,
        EventType.CALENDAR_VERIFIED,
        EventType.PAYMENT_PURCHASE,
        EventType.AI_CHAT_STARTED,
        EventType.MODERATION_FLAG,
      ];

      for (const type of eventTypes) {
        const eventId = `evt_${type}`;
        await db.collection("systemEvents").doc(eventId).set({
          eventId,
          type,
          priority: EventPriority.NORMAL,
          status: EventStatus.QUEUED,
          payload: { typeSpecificData: "test" },
          ttl: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
          createdAt: Timestamp.now(),
          retryCount: 0,
          maxRetries: 3,
          updatedAt: Timestamp.now(),
        });
      }

      const snapshot = await db.collection("systemEvents").get();
      expect(snapshot.size).toBe(eventTypes.length);

      const types = snapshot.docs.map((doc: any) => doc.data().type);
      for (const type of eventTypes) {
        expect(types).toContain(type);
      }
    });

    it("should store complex payload data", async () => {
      const eventId = "evt_complex_payload";
      const complexPayload = {
        chatId: "chat123",
        userId: "user456",
        amount: 100,
        metadata: {
          source: "mobile_app",
          version: "1.0.0",
        },
        timestamp: Date.now(),
        nestedArray: [1, 2, 3],
      };

      await db.collection("systemEvents").doc(eventId).set({
        eventId,
        type: EventType.CHAT_DEPOSITED,
        priority: EventPriority.NORMAL,
        status: EventStatus.QUEUED,
        payload: complexPayload,
        ttl: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
        createdAt: Timestamp.now(),
        retryCount: 0,
        maxRetries: 3,
        updatedAt: Timestamp.now(),
      });

      const doc = await db.collection("systemEvents").doc(eventId).get();
      const data = doc.data();

      expect(data.payload.chatId).toBe("chat123");
      expect(data.payload.amount).toBe(100);
      expect(data.payload.metadata.source).toBe("mobile_app");
      expect(data.payload.nestedArray).toEqual([1, 2, 3]);
    });
  });

  describe("Performance and Batch Operations", () => {
    it("should handle batch event creation", async () => {
      const batch = db.batch();
      const eventCount = 10;

      for (let i = 0; i < eventCount; i++) {
        const eventId = `evt_batch_${i}`;
        const ref = db.collection("systemEvents").doc(eventId);
        batch.set(ref, {
          eventId,
          type: EventType.CHAT_MESSAGE,
          priority: EventPriority.NORMAL,
          status: EventStatus.QUEUED,
          payload: { index: i },
          ttl: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
          createdAt: Timestamp.now(),
          retryCount: 0,
          maxRetries: 3,
          updatedAt: Timestamp.now(),
        });
      }

      await batch.commit();

      const snapshot = await db.collection("systemEvents").get();
      expect(snapshot.size).toBe(eventCount);
    });

    it("should query events efficiently with limits", async () => {
      // Create 20 events
      for (let i = 0; i < 20; i++) {
        await db.collection("systemEvents").add({
          eventId: `evt_limit_${i}`,
          type: EventType.CHAT_MESSAGE,
          priority: EventPriority.NORMAL,
          status: EventStatus.QUEUED,
          payload: {},
          ttl: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
          createdAt: Timestamp.now(),
          retryCount: 0,
          maxRetries: 3,
          updatedAt: Timestamp.now(),
        });
      }

      // Query with limit
      const snapshot = await db
        .collection("systemEvents")
        .where("status", "==", EventStatus.QUEUED)
        .limit(10)
        .get();

      expect(snapshot.size).toBe(10);
    });
  });
});


