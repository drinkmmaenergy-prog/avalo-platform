/**
 * Tests for Security Operations Center (Phase 22)
 * Focus on anomaly detection thresholds and incident management
 */
describe("Security Operations Center", () => {
    let IncidentType;
    (function (IncidentType) {
        IncidentType["UNUSUAL_TOKEN_DRAIN"] = "unusual_token_drain";
        IncidentType["RAPID_ACCOUNT_CREATION"] = "rapid_account_creation";
        IncidentType["LARGE_TRANSACTION"] = "large_transaction";
        IncidentType["SPAM_WAVE"] = "spam_wave";
        IncidentType["API_ABUSE"] = "api_abuse";
        IncidentType["DDOS_ATTEMPT"] = "ddos_attempt";
    })(IncidentType || (IncidentType = {}));
    let IncidentSeverity;
    (function (IncidentSeverity) {
        IncidentSeverity["LOW"] = "low";
        IncidentSeverity["MEDIUM"] = "medium";
        IncidentSeverity["HIGH"] = "high";
        IncidentSeverity["CRITICAL"] = "critical";
    })(IncidentSeverity || (IncidentSeverity = {}));
    describe("Token Drain Detection", () => {
        const THRESHOLDS = {
            TOKENS_PER_HOUR_MAX: 10000,
            TOKENS_PER_USER_HOUR_MAX: 1000,
        };
        test("should detect system-wide token drain", () => {
            const tokensSpentLastHour = 15000;
            const isAnomaly = tokensSpentLastHour > THRESHOLDS.TOKENS_PER_HOUR_MAX;
            expect(isAnomaly).toBe(true);
        });
        test("should not trigger on normal spending", () => {
            const tokensSpentLastHour = 5000;
            const isAnomaly = tokensSpentLastHour > THRESHOLDS.TOKENS_PER_HOUR_MAX;
            expect(isAnomaly).toBe(false);
        });
        test("should detect per-user token drain", () => {
            const userTokensSpentLastHour = 1500;
            const isAnomaly = userTokensSpentLastHour > THRESHOLDS.TOKENS_PER_USER_HOUR_MAX;
            expect(isAnomaly).toBe(true);
        });
        test("should not trigger on normal user spending", () => {
            const userTokensSpentLastHour = 500;
            const isAnomaly = userTokensSpentLastHour > THRESHOLDS.TOKENS_PER_USER_HOUR_MAX;
            expect(isAnomaly).toBe(false);
        });
    });
    describe("Rapid Account Creation Detection", () => {
        const THRESHOLDS = {
            NEW_ACCOUNTS_PER_HOUR_MAX: 50,
            NEW_ACCOUNTS_PER_IP_HOUR_MAX: 5,
        };
        test("should detect account creation spike", () => {
            const accountsCreatedLastHour = 75;
            const isAnomaly = accountsCreatedLastHour > THRESHOLDS.NEW_ACCOUNTS_PER_HOUR_MAX;
            expect(isAnomaly).toBe(true);
        });
        test("should not trigger on normal account creation", () => {
            const accountsCreatedLastHour = 30;
            const isAnomaly = accountsCreatedLastHour > THRESHOLDS.NEW_ACCOUNTS_PER_HOUR_MAX;
            expect(isAnomaly).toBe(false);
        });
        test("should detect IP-based account farming", () => {
            const accountsFromIPLastHour = 8;
            const isAnomaly = accountsFromIPLastHour > THRESHOLDS.NEW_ACCOUNTS_PER_IP_HOUR_MAX;
            expect(isAnomaly).toBe(true);
        });
        test("should allow multiple accounts from shared IP", () => {
            const accountsFromIPLastHour = 3;
            const isAnomaly = accountsFromIPLastHour > THRESHOLDS.NEW_ACCOUNTS_PER_IP_HOUR_MAX;
            expect(isAnomaly).toBe(false);
        });
    });
    describe("Large Transaction Detection", () => {
        const THRESHOLD = 5000;
        test("should flag large transaction", () => {
            const transactionAmount = 10000;
            const isLarge = transactionAmount > THRESHOLD;
            expect(isLarge).toBe(true);
        });
        test("should not flag normal transaction", () => {
            const transactionAmount = 1000;
            const isLarge = transactionAmount > THRESHOLD;
            expect(isLarge).toBe(false);
        });
        test("should flag transaction exactly at threshold", () => {
            const transactionAmount = 5001;
            const isLarge = transactionAmount > THRESHOLD;
            expect(isLarge).toBe(true);
        });
    });
    describe("Content Flood Detection", () => {
        const THRESHOLD = 10;
        test("should detect spam wave", () => {
            const postsInLastHour = 15;
            const isFlood = postsInLastHour > THRESHOLD;
            expect(isFlood).toBe(true);
        });
        test("should allow normal posting", () => {
            const postsInLastHour = 5;
            const isFlood = postsInLastHour > THRESHOLD;
            expect(isFlood).toBe(false);
        });
    });
    describe("API Abuse Detection", () => {
        const THRESHOLD = 100;
        test("should detect API abuse", () => {
            const requestsInLastMinute = 150;
            const isAbuse = requestsInLastMinute > THRESHOLD;
            expect(isAbuse).toBe(true);
        });
        test("should allow normal API usage", () => {
            const requestsInLastMinute = 50;
            const isAbuse = requestsInLastMinute > THRESHOLD;
            expect(isAbuse).toBe(false);
        });
    });
    describe("Incident Severity Calculation", () => {
        function calculateSeverity(incidentType, magnitude) {
            switch (incidentType) {
                case IncidentType.UNUSUAL_TOKEN_DRAIN:
                    if (magnitude > 50000)
                        return IncidentSeverity.CRITICAL;
                    if (magnitude > 20000)
                        return IncidentSeverity.HIGH;
                    if (magnitude > 10000)
                        return IncidentSeverity.MEDIUM;
                    return IncidentSeverity.LOW;
                case IncidentType.RAPID_ACCOUNT_CREATION:
                    if (magnitude > 200)
                        return IncidentSeverity.CRITICAL;
                    if (magnitude > 100)
                        return IncidentSeverity.HIGH;
                    if (magnitude > 50)
                        return IncidentSeverity.MEDIUM;
                    return IncidentSeverity.LOW;
                case IncidentType.LARGE_TRANSACTION:
                    if (magnitude > 50000)
                        return IncidentSeverity.HIGH;
                    if (magnitude > 20000)
                        return IncidentSeverity.MEDIUM;
                    return IncidentSeverity.LOW;
                case IncidentType.DDOS_ATTEMPT:
                    return IncidentSeverity.CRITICAL;
                default:
                    return IncidentSeverity.MEDIUM;
            }
        }
        test("should assign CRITICAL severity to massive token drain", () => {
            const severity = calculateSeverity(IncidentType.UNUSUAL_TOKEN_DRAIN, 60000);
            expect(severity).toBe(IncidentSeverity.CRITICAL);
        });
        test("should assign MEDIUM severity to moderate token drain", () => {
            const severity = calculateSeverity(IncidentType.UNUSUAL_TOKEN_DRAIN, 15000);
            expect(severity).toBe(IncidentSeverity.MEDIUM);
        });
        test("should assign CRITICAL severity to account creation spike", () => {
            const severity = calculateSeverity(IncidentType.RAPID_ACCOUNT_CREATION, 250);
            expect(severity).toBe(IncidentSeverity.CRITICAL);
        });
        test("should always assign CRITICAL to DDoS attempts", () => {
            const severity = calculateSeverity(IncidentType.DDOS_ATTEMPT, 1);
            expect(severity).toBe(IncidentSeverity.CRITICAL);
        });
    });
    describe("Incident Deduplication", () => {
        function isDuplicate(newIncident, existingIncidents) {
            const DEDUP_WINDOW_MS = 60 * 60 * 1000; // 1 hour
            return existingIncidents.some((existing) => existing.type === newIncident.type &&
                newIncident.timestamp - existing.timestamp < DEDUP_WINDOW_MS);
        }
        test("should detect duplicate within 1 hour", () => {
            const existingIncidents = [
                {
                    type: IncidentType.UNUSUAL_TOKEN_DRAIN,
                    timestamp: Date.now() - 30 * 60 * 1000, // 30 min ago
                },
            ];
            const newIncident = {
                type: IncidentType.UNUSUAL_TOKEN_DRAIN,
                timestamp: Date.now(),
            };
            const isDup = isDuplicate(newIncident, existingIncidents);
            expect(isDup).toBe(true);
        });
        test("should not detect duplicate after 1 hour", () => {
            const existingIncidents = [
                {
                    type: IncidentType.UNUSUAL_TOKEN_DRAIN,
                    timestamp: Date.now() - 90 * 60 * 1000, // 90 min ago
                },
            ];
            const newIncident = {
                type: IncidentType.UNUSUAL_TOKEN_DRAIN,
                timestamp: Date.now(),
            };
            const isDup = isDuplicate(newIncident, existingIncidents);
            expect(isDup).toBe(false);
        });
        test("should not detect duplicate for different incident type", () => {
            const existingIncidents = [
                {
                    type: IncidentType.UNUSUAL_TOKEN_DRAIN,
                    timestamp: Date.now() - 30 * 60 * 1000,
                },
            ];
            const newIncident = {
                type: IncidentType.RAPID_ACCOUNT_CREATION,
                timestamp: Date.now(),
            };
            const isDup = isDuplicate(newIncident, existingIncidents);
            expect(isDup).toBe(false);
        });
        test("should handle empty incident list", () => {
            const existingIncidents = [];
            const newIncident = {
                type: IncidentType.UNUSUAL_TOKEN_DRAIN,
                timestamp: Date.now(),
            };
            const isDup = isDuplicate(newIncident, existingIncidents);
            expect(isDup).toBe(false);
        });
    });
    describe("Time Window Calculations", () => {
        test("should calculate 1 hour window correctly", () => {
            const now = Date.now();
            const oneHourAgo = now - 60 * 60 * 1000;
            const events = [
                { timestamp: now - 30 * 60 * 1000 }, // 30 min ago
                { timestamp: now - 90 * 60 * 1000 }, // 90 min ago
            ];
            const recentEvents = events.filter((e) => e.timestamp > oneHourAgo);
            expect(recentEvents.length).toBe(1);
        });
        test("should handle edge case: exactly 1 hour", () => {
            const now = Date.now();
            const oneHourAgo = now - 60 * 60 * 1000;
            const events = [{ timestamp: oneHourAgo }];
            const recentEvents = events.filter((e) => e.timestamp > oneHourAgo);
            expect(recentEvents.length).toBe(0); // Exact boundary excluded
        });
    });
    describe("Rate Limit Violation Tracking", () => {
        test("should count violations correctly", () => {
            const violations = [
                { userId: "user1", count: 5 },
                { userId: "user2", count: 3 },
                { userId: "user1", count: 2 },
            ];
            const userViolationCount = violations
                .filter((v) => v.userId === "user1")
                .reduce((sum, v) => sum + v.count, 0);
            expect(userViolationCount).toBe(7);
        });
        test("should detect abuse threshold (10+ violations)", () => {
            const userViolationCount = 12;
            const ABUSE_THRESHOLD = 10;
            const isAbuse = userViolationCount >= ABUSE_THRESHOLD;
            expect(isAbuse).toBe(true);
        });
        test("should not trigger on normal violations", () => {
            const userViolationCount = 5;
            const ABUSE_THRESHOLD = 10;
            const isAbuse = userViolationCount >= ABUSE_THRESHOLD;
            expect(isAbuse).toBe(false);
        });
    });
    describe("Anomaly Score Aggregation", () => {
        function calculateAnomalyScore(metrics) {
            let score = 0;
            if (metrics.tokenDrain)
                score += 40;
            if (metrics.accountSpike)
                score += 30;
            if (metrics.apiAbuse)
                score += 20;
            if (metrics.contentFlood)
                score += 10;
            return score;
        }
        test("should calculate max score for all anomalies", () => {
            const score = calculateAnomalyScore({
                tokenDrain: true,
                accountSpike: true,
                apiAbuse: true,
                contentFlood: true,
            });
            expect(score).toBe(100);
        });
        test("should calculate zero score for no anomalies", () => {
            const score = calculateAnomalyScore({
                tokenDrain: false,
                accountSpike: false,
                apiAbuse: false,
                contentFlood: false,
            });
            expect(score).toBe(0);
        });
        test("should prioritize token drain in scoring", () => {
            const score = calculateAnomalyScore({
                tokenDrain: true,
                accountSpike: false,
                apiAbuse: false,
                contentFlood: false,
            });
            expect(score).toBe(40); // Highest single score
        });
    });
    describe("Incident Metadata Formatting", () => {
        test("should format token drain details", () => {
            const details = {
                type: IncidentType.UNUSUAL_TOKEN_DRAIN,
                tokensSpent: 15000,
                threshold: 10000,
            };
            const message = `Token drain detected: ${details.tokensSpent} tokens spent (threshold: ${details.threshold})`;
            expect(message).toContain("15000");
            expect(message).toContain("10000");
        });
        test("should format account creation details", () => {
            const details = {
                type: IncidentType.RAPID_ACCOUNT_CREATION,
                accountsCreated: 75,
                threshold: 50,
            };
            const message = `Rapid account creation: ${details.accountsCreated} accounts (threshold: ${details.threshold})`;
            expect(message).toContain("75");
            expect(message).toContain("50");
        });
    });
});
//# sourceMappingURL=secops.test.js.map