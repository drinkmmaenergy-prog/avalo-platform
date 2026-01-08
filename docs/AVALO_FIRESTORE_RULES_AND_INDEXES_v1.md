# AVALO_FIRESTORE_RULES_AND_INDEXES_v1.md

## Goals
- Least privilege by default.
- Server-authoritative writes for money flows.
- 18+ verification required for paid features.

---

## Firestore Rules (v1)

```rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function authed() { return request.auth != null; }
    function uid() { return request.auth.uid; }
    function isOwner(u) { return uid() == u; }

    function userDoc(u) {
      return get(/databases/$(database)/documents/users/$(u));
    }

    function isVerified18() {
      return userDoc(uid()).data.verification.status == "approved";
    }

    match /users/{u} {
      allow read: if authed();
      allow create: if authed() && isOwner(u);
      allow update: if authed() && isOwner(u);
    }

    match /chats/{chatId} {
      allow read: if authed() && (uid() in resource.data.participants);
      allow create: if false; // server-only via callable
      allow update: if authed() && (uid() in resource.data.participants);
    }

    match /chats/{chatId}/messages/{m} {
      allow read: if authed() && (uid() in get(/databases/$(database)/documents/chats/$(chatId)).data.participants);
      allow create: if false; // server-only via callable
      allow update, delete: if false;
    }

    match /transactions/{t} {
      allow read: if authed() && (resource.data.uid == uid() || userDoc(uid()).data.roles.admin == true);
      allow create, update, delete: if false; // only functions
    }

    match /calendarBookings/{b} {
      allow read: if authed() && (uid() in [resource.data.creatorId, resource.data.bookerId]);
      allow create: if false; // via callable
      allow update: if false; // via callable
    }

    match /aiBots/{id} {
      allow read: if authed();
      allow write: if authed() && resource.data.ownerId == uid();
    }

    match /adminFlags/{id} {
      allow read, write: if authed() && userDoc(uid()).data.roles.moderator == true;
    }
  }
}
```

---

## Indexes (firestore.indexes.json)

```json
{
  "indexes": [
    {
      "collectionGroup": "chats",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "participants", "arrayConfig": "CONTAINS" },
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "updatedAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "transactions",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "uid", "order": "ASCENDING" },
        { "fieldPath": "type", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "calendarBookings",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "creatorId", "order": "ASCENDING" },
        { "fieldPath": "bookerId", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "slot.start", "order": "DESCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

---

## Emulator Config (firebase.json)

```json
{
  "firestore": { "rules": "infra/firestore.rules", "indexes": "infra/firestore.indexes.json" },
  "emulators": {
    "auth": { "port": 9099 },
    "functions": { "port": 5001 },
    "firestore": { "port": 8080 },
    "hosting": { "port": 5000 },
    "ui": { "enabled": true, "port": 4000 }
  }
}
```

