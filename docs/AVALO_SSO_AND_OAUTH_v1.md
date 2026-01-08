# AVALO_SSO_AND_OAUTH_v1.md

## Mobile → Web SSO (Checkout)
1. Mobile gets Firebase ID token (`getIdToken()`).
2. Open `https://avalo.app/wallet?token=<ID>&redirect=avalo://wallet/success`.
3. Web verifies token server-side; sets Secure HttpOnly cookie.
4. After payment, webhook credits tokens; redirect back to deep link.
5. User sees updated balance without re-login.

## Web → Mobile Universal Links
- `https://avalo.app/ul/*` → handled by Next.js + Expo for deep-link routing.

## Instagram Linking (Royal eligibility)
- Use Facebook Graph API (Instagram Basic Display + Pages/IG).
- Scope: `instagram_basic`, `pages_show_list` if needed, read follower count.
- Flow:
  - GET `/api/instagram/login` → redirect to OAuth
  - GET `/api/instagram/callback` → exchange code → fetch profile
  - Save `{ username, followers }` in `users/{uid}.instagram`
  - If `followers >= 1000` → grant `royal:true`

## Security
- Store tokens server-side only.  
- Rotate IG tokens via cron.  
- Sign all state params; check CSRF.
