# Firestore Emulator Prerequisites (P3 blocker)

## Status: BLOCKED — environment prerequisite, not code issue

### What is ready:
- `tests/firestore-rules.test.js` — 18 rules tests covering:
  - `wallets/{uid}`: owner-read, other-deny, write-deny
  - `creatorEarningAccounts/{id}`: owner-read, other-deny, write-deny  
  - `creatorEarningLedger/{id}`: creator-read, other-deny, write-deny
  - `billingEvents/{id}`: payer+creator-read, third-party-deny, write-deny
  - `age_verification/{uid}`: owner-read, other-deny, write-deny
  - Forbidden paths (`user_wallets`, `wallet/main`, `wallet/current`): all denied
- `firestore.rules` — all canonical collections added with correct access rules

### What is blocked:
1. **Java 21 required** — `firebase-tools` v15.22.0 requires Java ≥21.
   Sandbox has OpenJDK 11.0.31 only. `sudo apt-get install openjdk-21-jdk` fails
   (no-new-privileges container flag).

2. **Emulator JAR download blocked** — Even with `firebase-tools` v12.9.1 (Java 11 compat),
   `cloud-firestore-emulator-v1.18.2.jar` download returns 403 (network allowlist).

### To run in CI/CD or developer environment:
```bash
# Install Java 21+
# Then:
npm install -g firebase-tools
firebase emulators:exec --only firestore --project avalo-test \
  "node tests/firestore-rules.test.js"
```

### Rules validation performed:
- Structure check: 219 lines, 10/10 collection rules present ✓
- All canonical collections: read-own-only ✓
- All writes: `if false` (server-only) ✓  
- Forbidden paths: explicit deny ✓
