FILE: C:\a\avalo\functions\src\config\economyConfig.ts
LINE: 40
CODE: * Platform fee percentage on chat deposits (0.35 = 35%).
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\config\economyConfig.ts
LINE: 68
CODE: CHAT:           { creator: 0.65, avalo: 0.35 },
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\config\economyConfig.ts
LINE: 69
CODE: CALLS_VOICE:    { creator: 0.65, avalo: 0.35 },
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\config\economyConfig.ts
LINE: 70
CODE: CALLS_VIDEO:    { creator: 0.65, avalo: 0.35 },
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\config\economyConfig.ts
LINE: 71
CODE: CALENDAR:       { creator: 0.80, avalo: 0.20 },
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\config\economyConfig.ts
LINE: 72
CODE: EVENTS:         { creator: 0.80, avalo: 0.20 },
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\config\economyConfig.ts
LINE: 76
CODE: LIVE_VIP:       { creator: 0.80, avalo: 0.20 },
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\config\economyConfig.ts
LINE: 77
CODE: AI_COMPANIONS:  { creator: 0.80, avalo: 0.20 },
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\config\economyConfig.ts
LINE: 78
CODE: BOOSTS_CREATOR: { creator: 0.65, avalo: 0.35 },
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\config\economyConfig.ts
LINE: 80
CODE: DIGITAL_PRODUCTS: { creator: 0.65, avalo: 0.35 },
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\config\economyConfig.ts
LINE: 82
CODE: MARKETPLACE:    { creator: 0.65, avalo: 0.35 },
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\config\economyConfig.ts
LINE: 92
CODE: return SPLITS_BY_SURFACE[key] ?? { creator: 0.65, avalo: 0.35 };
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\config\economyConfig.ts
LINE: 126
CODE: /** Platform fee on deposit (0.35 = 35%, non-refundable) */
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\config\economyConfig.ts
LINE: 127
CODE: DEPOSIT_PLATFORM_FEE_PCT: 0.35,
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\config\economyConfig.ts
LINE: 128
CODE: /** Escrow from deposit (0.65 = 65%, refundable unused) */
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\config\economyConfig.ts
LINE: 129
CODE: DEPOSIT_ESCROW_PCT: 0.65,
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\types\pack303-creator-earnings.types.ts
LINE: 7
CODE: * - Breakdown per source (chat, calls, calendar, events, etc.)
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\types\pack303-creator-earnings.types.ts
LINE: 23
CODE: * Collection: creatorEarningsMonthly/{docId}
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\types\pack303-creator-earnings.types.ts
LINE: 26
CODE: export interface CreatorEarningsMonthly {
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\types\pack303-creator-earnings.types.ts
LINE: 33
CODE: tokensEarnedCalls: number;
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\types\pack303-creator-earnings.types.ts
LINE: 34
CODE: tokensEarnedCalendar: number;
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\types\pack303-creator-earnings.types.ts
LINE: 35
CODE: tokensEarnedEvents: number;
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\types\pack303-creator-earnings.types.ts
LINE: 40
CODE: tokensRefundedCalendar: number;
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\types\pack303-creator-earnings.types.ts
LINE: 41
CODE: tokensRefundedEvents: number;
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\types\pack303-creator-earnings.types.ts
LINE: 46
CODE: tokensCreatorShare: number; // creator: 65% or 80%
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\types\pack303-creator-earnings.types.ts
LINE: 70
CODE: | 'CALLS'
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\types\pack303-creator-earnings.types.ts
LINE: 71
CODE: | 'CALENDAR'
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\types\pack303-creator-earnings.types.ts
LINE: 72
CODE: | 'EVENTS'
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\types\pack303-creator-earnings.types.ts
LINE: 79
CODE: tokensCreatorShare: number;
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\types\pack303-creator-earnings.types.ts
LINE: 98
CODE: totalCreatorShare: number;
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\types\pack303-creator-earnings.types.ts
LINE: 112
CODE: tokensCreatorShare: number;
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\types\pack303-creator-earnings.types.ts
LINE: 134
CODE: tokenPayoutRate: number; // e.g., 0.2 (1 token = 0.20 USD)
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\types\pack303-creator-earnings.types.ts
LINE: 238
CODE: CHAT: { creator: 0.65, avalo: 0.35 },
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\types\pack303-creator-earnings.types.ts
LINE: 239
CODE: CALLS: { creator: 0.65, avalo: 0.35 },
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\types\pack303-creator-earnings.types.ts
LINE: 240
CODE: CALENDAR: { creator: 0.80, avalo: 0.20 },
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\types\pack303-creator-earnings.types.ts
LINE: 241
CODE: EVENTS: { creator: 0.80, avalo: 0.20 },
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\types\pack303-creator-earnings.types.ts
LINE: 242
CODE: OTHER: { creator: 0.65, avalo: 0.35 },
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\types\pack304-admin-finance.types.ts
LINE: 40
CODE: gmvFiatUSD: number;           // GMV in USD (gmvTokens * 0.20)
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\types\pack304-admin-finance.types.ts
LINE: 43
CODE: totalCreatorShareTokens: number;  // Total tokens going to creators
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\types\pack304-admin-finance.types.ts
LINE: 61
CODE: feesFromCallsTokens: number;
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\types\pack304-admin-finance.types.ts
LINE: 62
CODE: feesFromCalendarTokens: number;
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\types\pack304-admin-finance.types.ts
LINE: 63
CODE: feesFromEventsTokens: number;
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\types\pack304-admin-finance.types.ts
LINE: 262
CODE: SPLIT_CHAT_CREATOR: 0.65,
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\types\pack304-admin-finance.types.ts
LINE: 263
CODE: SPLIT_CHAT_AVALO: 0.35,
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\types\pack304-admin-finance.types.ts
LINE: 264
CODE: SPLIT_CALLS_CREATOR: 0.65,
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\types\pack304-admin-finance.types.ts
LINE: 265
CODE: SPLIT_CALLS_AVALO: 0.35,
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\types\pack304-admin-finance.types.ts
LINE: 266
CODE: SPLIT_CALENDAR_CREATOR: 0.80,
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\types\pack304-admin-finance.types.ts
LINE: 267
CODE: SPLIT_CALENDAR_AVALO: 0.20,
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\types\pack304-admin-finance.types.ts
LINE: 268
CODE: SPLIT_EVENTS_CREATOR: 0.80,
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\types\pack304-admin-finance.types.ts
LINE: 269
CODE: SPLIT_EVENTS_AVALO: 0.20,
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\types\pack304-admin-finance.types.ts
LINE: 270
CODE: SPLIT_OTHER_CREATOR: 0.65,
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\types\pack304-admin-finance.types.ts
LINE: 271
CODE: SPLIT_OTHER_AVALO: 0.35,
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\types\pack304-admin-finance.types.ts
LINE: 314
CODE: tokensCreatorShare: number;
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\types\pack304-admin-finance.types.ts
LINE: 327
CODE: creatorShareTokens: number;
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\analytics\creatorMetrics.ts
LINE: 11
CODE: calendarEarnings: number;
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\analytics\creatorMetrics.ts
LINE: 38
CODE: calendarBookings: number;
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\analytics\creatorMetrics.ts
LINE: 64
CODE: await db.collection('creator_metrics').doc(view.profile_user_id).collection('events').add({
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\analytics\creatorMetrics.ts
LINE: 95
CODE: await db.collection('creator_metrics').doc(userId).collection('events').add({
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\analytics\creatorMetrics.ts
LINE: 125
CODE: const creatorEarnings = (payment.tokens || 0) * 0.65;
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\analytics\creatorMetrics.ts
LINE: 130
CODE: chat_earnings: FieldValue.increment(creatorEarnings),
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\analytics\creatorMetrics.ts
LINE: 136
CODE: await db.collection('creator_metrics').doc(creatorId).collection('events').add({
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\analytics\creatorMetrics.ts
LINE: 139
CODE: tokens: creatorEarnings,
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\analytics\creatorMetrics.ts
LINE: 148
CODE: // Track calendar earnings
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\analytics\creatorMetrics.ts
LINE: 149
CODE: export const trackCreatorCalendarEarnings = onDocumentCreated('calendar_events/{eventId}', async (event) => {
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\analytics\creatorMetrics.ts
LINE: 159
CODE: const creatorEarnings = (eventData.tokens || 0) * 0.8; // 80% to creator for calendar
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\analytics\creatorMetrics.ts
LINE: 164
CODE: calendar_earnings: FieldValue.increment(creatorEarnings),
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\analytics\creatorMetrics.ts
LINE: 165
CODE: calendar_bookings: FieldValue.increment(1),
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\analytics\creatorMetrics.ts
LINE: 170
CODE: await db.collection('creator_metrics').doc(creatorId).collection('events').add({
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\analytics\creatorMetrics.ts
LINE: 171
CODE: event_type: 'calendar_earnings',
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\analytics\creatorMetrics.ts
LINE: 173
CODE: tokens: creatorEarnings,
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\analytics\creatorMetrics.ts
LINE: 178
CODE: const previousBookings = await db.collection('calendar_events')
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\analytics\creatorMetrics.ts
LINE: 192
CODE: console.error('Error tracking creator calendar earnings:', error);
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\analytics\creatorMetrics.ts
LINE: 352
CODE: const calendarEarnings = daily.calendar_earnings || 0;
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\analytics\creatorMetrics.ts
LINE: 353
CODE: const totalEarnings = chatEarnings + calendarEarnings;
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\analytics\creatorMetrics.ts
LINE: 354
CODE: const calendarBookings = daily.calendar_bookings || 0;
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\analytics\creatorMetrics.ts
LINE: 400
CODE: previous: (prevDaily.chat_earnings || 0) + (prevDaily.calendar_earnings || 0),
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\analytics\creatorMetrics.ts
LINE: 401
CODE: change: totalEarnings - ((prevDaily.chat_earnings || 0) + (prevDaily.calendar_earnings || 0))
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\analytics\creatorMetrics.ts
LINE: 407
CODE: const demand = chatSessions + calendarBookings;
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\analytics\creatorMetrics.ts
LINE: 427
CODE: calendarEarnings,
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\analytics\creatorMetrics.ts
LINE: 438
CODE: calendarBookings,
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\callBilling.ts
LINE: 4
CODE: * Handles per-minute billing for voice & video calls
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\callBilling.ts
LINE: 7
CODE: * NO FREE CALLS - all calls are paid, insufficient funds = graceful termination
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\callBilling.ts
LINE: 15
CODE: interface CallSession {
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\callBilling.ts
LINE: 32
CODE: const EARNER_SPLIT = 0.65;  // 65% to callee (creator/earner)
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\callBilling.ts
LINE: 33
CODE: const AVALO_SPLIT = 0.35;   // 35% to Avalo
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\callBilling.ts
LINE: 48
CODE: const callData = callDoc.data() as CallSession;
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\callBilling.ts
LINE: 96
CODE: const callDataInTxn = callDocInTxn.data() as CallSession;
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\callBilling.ts
LINE: 147
CODE: service: 'functions.calls',
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\callBilling.ts
LINE: 204
CODE: service: 'functions.calls',
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\callBilling.ts
LINE: 233
CODE: service: 'functions.calls',
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\callBilling.ts
LINE: 264
CODE: service: 'functions.calls',
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\callMonetization.ts
LINE: 46
CODE: export type CallState = 'ACTIVE' | 'ENDED';
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\callMonetization.ts
LINE: 48
CODE: export interface CallSession {
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\callMonetization.ts
LINE: 54
CODE: state: CallState;
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\callMonetization.ts
LINE: 151
CODE: // PRIORITY 2: HETEROSEXUAL RULE - MAN ALWAYS PAYS FOR CALLS
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\callMonetization.ts
LINE: 161
CODE: // Man is ALWAYS the payer for calls in heterosexual interactions
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\callMonetization.ts
LINE: 378
CODE: const callSession: Partial<CallSession> = {
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\callMonetization.ts
LINE: 391
CODE: await db.collection('calls').doc(callId).set(callSession);
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\callMonetization.ts
LINE: 403
CODE: * Update call activity timestamp (prevents auto-disconnect)
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\callMonetization.ts
LINE: 406
CODE: await db.collection('calls').doc(callId).update({
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\callMonetization.ts
LINE: 435
CODE: const callRef = db.collection('calls').doc(callId);
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\callMonetization.ts
LINE: 436
CODE: const callSnap = await callRef.get();
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\callMonetization.ts
LINE: 438
CODE: if (!callSnap.exists) {
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\callMonetization.ts
LINE: 442
CODE: const call = callSnap.data() as CallSession;
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\callMonetization.ts
LINE: 599
CODE: * Check and auto-disconnect idle calls
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\callMonetization.ts
LINE: 603
CODE: export async function autoDisconnectIdleCalls(): Promise<number> {
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\callMonetization.ts
LINE: 606
CODE: const idleCalls = await db.collection('calls')
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\callMonetization.ts
LINE: 614
CODE: for (const callDoc of idleCalls.docs) {
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\callMonetization.ts
LINE: 627
CODE: logger.info(`Auto-disconnected ${disconnectedCount} idle calls`);
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\callMonetization.ts
LINE: 636
CODE: export async function getActiveCallForUser(userId: string): Promise<CallSession | null> {
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\callMonetization.ts
LINE: 637
CODE: const callsSnap = await db.collection('calls')
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\callMonetization.ts
LINE: 644
CODE: if (!callsSnap.empty) {
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\callMonetization.ts
LINE: 645
CODE: return callsSnap.docs[0].data() as CallSession;
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\callMonetization.ts
LINE: 649
CODE: const callsSnap2 = await db.collection('calls')
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\callMonetization.ts
LINE: 656
CODE: if (!callsSnap2.empty) {
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\callMonetization.ts
LINE: 657
CODE: return callsSnap2.docs[0].data() as CallSession;
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\brands\brandProducts.ts
LINE: 516
CODE: let creatorShare = 0;
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\brands\brandProducts.ts
LINE: 527
CODE: creatorShare = Math.floor(totalTokens * (creatorPercent / 100));
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\brands\brandProducts.ts
LINE: 528
CODE: brandShare = totalTokens - creatorShare;
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\brands\brandProducts.ts
LINE: 530
CODE: creatorShare = Math.floor(totalTokens * 0.65);
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\brands\brandProducts.ts
LINE: 531
CODE: brandShare = totalTokens - creatorShare;
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\brands\brandProducts.ts
LINE: 538
CODE: if (creatorShare > 0 && purchaseData.creator_id) {
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\brands\brandProducts.ts
LINE: 541
CODE: balance: admin.firestore.FieldValue.increment(creatorShare),
------------------------------------------------------------
FILE: C:\a\avalo\functions\src\brands\brandProducts.ts
LINE: 550
CODE: amount: creatorShare,
------------------------------------------------------------
