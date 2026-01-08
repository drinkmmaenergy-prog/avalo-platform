# AVALO — User Profile & Matching Spec (v2)
Version: 2.0 • Scope: Profile, Search, GPS, Filters, Discovery

## 0. Goals
- Precise control of **who you see** and **who sees you** via GPS/manual region + radius.
- Rich profile with verified markers and modes: **Incognito**, **Passport**, **Earn from chat**.
- Deterministic matching with queue, capacity, and “Inbox Full” visibility rules.

## 1. Profile Data Model
`users/{uid}` (selected fields)
```
displayName, dob, gender, seeking[], orientation[]
bio (<=500), prompts[<=3], interests[<=10], languages[<=5]
photos[1..6], videoIntro, voiceIntro
location: { city, country, coords { lat, lng }, manual: bool }
searchAreaKm: 1..150 | "country"
modes: { incognito: bool, passport: bool, earnFromChat: bool }
verification: { selfie: bool, phone: bool, bank: bool, age18: bool }
social: { instagramLinked: bool, instagramFollowers: int, handle?: string }
tiers: { vip: bool, royal: bool, royalReason?: "instagram"|"earnings"|"quality" }
qualityScore: 0..100
chatCapacity: { max: 50|100|200|500, used: int }
visibility: { discover: bool=true, swipe: bool=true }
```
Indices prepared for common queries (see rules file).

## 2. Onboarding Flow (Revised)
1. **Basics**: phone/email → OTP.  
2. **Profile Core**: photos (min 2), bio, interests, languages.  
3. **Modes**: toggle **Incognito**, **Passport**, **Earn from chat**.  
4. **Location Setup**: **GPS OR Manual** city + radius (1..150km or whole country).  
5. **Instagram Link** (optional): OAuth + follower import.  
6. **Selfie Verification**: live selfie now that gallery exists.  
7. **Finish** → Discovery.

Rationale: Selfie after photo upload = better comparison dataset.

## 3. Discovery Filters UI
- Gender to show: multi‑select (Male/Female/NB).
- Age range: 18–99.
- Distance mode:
  - **GPS**: slider 1..150km.
  - **Manual**: choose city/country from list + slider, option “whole country”.
- Languages (optional): show only users who speak X.
- Earn Mode filter: show/hide users who **earn from chat**.
- Verified filters: selfie/phone/bank.
- Royal/VIP boost: sorts higher but never hides others.

## 4. Matching & Queue
- Swipe limits by tier (Free/VIP/Royal).
- Match on mutual like → create `matches/{id}` and `chats/{id}`.
- **Inbox capacity**:
  - Default 50 active chats. Thresholds to expand (QS + Royal).
  - If full: profile is **hidden from Swipe**, **visible in Discover** with badge “Inbox Full”.
  - Royal males can still message (queue bypass = priority lane).

## 5. Search Logic (Backend)
Query plan uses composite indexes:
```
1) by distance (GeoHash), gender ∈ filters, age ∈ range
2) exclude blocked, exclude already swiped in last N days
3) sort by: score(distance, recency, quality, tierBoost)
```
Geo encoding: geohash precision tuned to radius; manual mode replaces coords with selected city centroid.

## 6. Instagram → Royal Auto‑Grant
- If `instagramLinked=true` and `instagramFollowers >= 1000` → `tiers.royal=true (reason=instagram)`.
- Or if monthly earnings ≥ **20,000 tokens**, or QualityScore ≥ 75 for 14 days.
- Maintained while QualityScore > 70; revoked after 30 days below.

## 7. Incognito & Passport (Free for all)
- **Incognito**: hidden from stacks, visible only to those you liked first. Badge 👻 shown to you only.
- **Passport**: swipe anywhere by selecting location manually; distance scoring disabled.

## 8. Visitors (Free)
- Track last 100 viewers (30 days). Surfaced in “Visited Me”. Includes like shortcut.

## 9. Anti‑spam
- Copy‑paste detector, min 3 words, velocity limits.
- Honeypot profiles to catch mass swipers.

## 10. Metrics
- Swipe → like rate, match rate, first message latency.
- Capacity usage and queue wait times.
- QualityScore drift vs bans.

---
## 🇵🇱 DODATEK (PL skrót)
- Lokalizacja **GPS lub z listy** + **promień 1..150 km** lub cały kraj.
- Tryby **Incognito/Passport/Earn** darmowe dla wszystkich.
- Gdy skrzynka pełna: ukrycie w Swipe, widoczność w Discover z plakietką.
- Royal z Instagrama ≥1000 follow lub 20k tokenów/mies.