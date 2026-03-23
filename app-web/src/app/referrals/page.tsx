'use client';

/**
 * FIX 82: Referral / Invite Friends page
 *
 * Displays:
 *   - Reward explainer (50 tokens for referrer, 25 for referred)
 *   - Unique referral link + copy/share/WhatsApp/Telegram
 *   - Stats: invited, joined, tokens earned
 *   - Referral list with status
 *   - How it works explainer
 *
 * Data sources:
 *   - users/{uid}.referralCode — the user's referral code
 *   - referrals collection — referral records (referrerId, referredId, status, tokensEarned)
 *   - generateReferralCodeV1 — Cloud Function to generate/assign a referral code
 *
 * INVARIANTS:
 *   - Uses useAuth() from AuthProvider for user context.
 *   - Uses requireDb() canonical guard for Firestore access.
 *   - Uses functions (europe-west1) for Cloud Functions via httpsCallable.
 *   - referrals collection is server-only write.
 */

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { requireDb, functions } from '@/lib/firebase';
import EmptyState from '@/components/ui/EmptyState';
import { httpsCallable } from 'firebase/functions';

export default function ReferralsPage() {
  const { user, firebaseUser } = useAuth();
  const [referralCode, setReferralCode] = useState('');
  const [referralLink, setReferralLink] = useState('');
  const [stats, setStats] = useState({ invited: 0, joined: 0, earned: 0 });
  const [referrals, setReferrals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const uid = firebaseUser?.uid || user?.uid;

  useEffect(() => {
    if (!uid) return;
    const load = async () => {
      try {
        const db = requireDb();

        // Get or generate referral code
        const userDoc = await getDoc(doc(db, 'users', uid));
        let code = userDoc.data()?.referralCode;

        if (!code) {
          try {
            const fn = httpsCallable(functions, 'generateReferralCodeV1');
            const result = await fn({});
            code = (result.data as any)?.code;
          } catch {
            code = `AVALO_${uid.slice(0, 6).toUpperCase()}`;
          }
        }

        setReferralCode(code || '');
        setReferralLink(`https://avalo.app/start?ref=${code}`);

        // Load referral stats
        const refQuery = query(collection(db, 'referrals'), where('referrerId', '==', uid));
        const refSnap = await getDocs(refQuery).catch(() => ({ docs: [] as any[] }));
        const refs = refSnap.docs.map((d: any) => d.data());
        setReferrals(refs);
        setStats({
          invited: refs.length,
          joined: refs.filter((r: any) => r.status === 'joined' || r.status === 'active').length,
          earned: refs.reduce((sum: number, r: any) => sum + (r.tokensEarned || 0), 0),
        });
      } catch (err) {
        console.error('[ReferralsPage] Failed to load referral data:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [uid]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const input = document.createElement('input');
      input.value = referralLink;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const shareLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join Avalo!',
          text: 'I\'m on Avalo — the social platform where you can connect, create, and earn. Join me!',
          url: referralLink,
        });
      } catch {
        // User cancelled or share failed — ignore
      }
    } else {
      copyLink();
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-4 pb-24 flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-[#E4458F] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 pb-24">
      <h1 className="text-2xl font-bold mb-1">Invite Friends</h1>
      <p className="text-sm text-gray-500 mb-6">Share Avalo and earn rewards when friends join</p>

      {/* Reward explainer */}
      <div className="p-4 bg-gradient-to-r from-[#E8593C] via-[#E4458F] to-[#8B5CF6] rounded-2xl text-white mb-6">
        <h2 className="text-lg font-bold mb-2">Earn 50 tokens per friend!</h2>
        <p className="text-sm text-white/80 mb-1">When your friend signs up and completes their profile:</p>
        <div className="flex gap-4 mt-3">
          <div className="text-center">
            <p className="text-2xl font-bold">50</p>
            <p className="text-[10px] text-white/70">tokens for you</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">25</p>
            <p className="text-[10px] text-white/70">tokens for them</p>
          </div>
        </div>
      </div>

      {/* Referral link */}
      <div className="p-4 border rounded-xl mb-6">
        <h3 className="font-semibold text-sm mb-2">Your invite link</h3>
        <div className="flex gap-2">
          <input value={referralLink} readOnly
            className="flex-1 p-2 bg-gray-50 border rounded-lg text-sm text-gray-600" />
          <button onClick={copyLink}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              copied ? 'bg-green-500 text-white' : 'bg-[#E4458F] text-white'
            }`}>
            {copied ? '✓ Copied!' : 'Copy'}
          </button>
        </div>

        <div className="flex gap-2 mt-3">
          <button onClick={shareLink}
            className="flex-1 py-2 bg-gray-100 rounded-lg text-sm font-medium hover:bg-gray-200">
            📤 Share
          </button>
          <button onClick={() => {
            window.open(`https://wa.me/?text=${encodeURIComponent('Join me on Avalo! ' + referralLink)}`, '_blank');
          }}
            className="flex-1 py-2 bg-green-100 text-green-700 rounded-lg text-sm font-medium hover:bg-green-200">
            WhatsApp
          </button>
          <button onClick={() => {
            window.open(`https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent('Join Avalo!')}`, '_blank');
          }}
            className="flex-1 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-200">
            Telegram
          </button>
        </div>

        <p className="text-xs text-gray-400 mt-3">
          Your code: <strong>{referralCode}</strong> — friends can also enter this during sign-up.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="p-3 bg-gray-50 rounded-xl text-center">
          <p className="text-xl font-bold">{stats.invited}</p>
          <p className="text-xs text-gray-500">Invited</p>
        </div>
        <div className="p-3 bg-gray-50 rounded-xl text-center">
          <p className="text-xl font-bold text-green-600">{stats.joined}</p>
          <p className="text-xs text-gray-500">Joined</p>
        </div>
        <div className="p-3 bg-gray-50 rounded-xl text-center">
          <p className="text-xl font-bold text-[#E4458F]">{stats.earned}</p>
          <p className="text-xs text-gray-500">Tokens earned</p>
        </div>
      </div>

      {/* Referral list — FIX 130: Empty state for no referrals */}
      {referrals.length === 0 && (
        <EmptyState
          icon="🎁"
          title="Invite friends, earn tokens"
          description="Share your unique link and earn 50 tokens for each friend who joins!"
          actionLabel="Copy Link"
          onAction={() => {
            if (referralLink) {
              navigator.clipboard.writeText(referralLink);
            }
          }}
        />
      )}
      {referrals.length > 0 && (
        <div>
          <h3 className="font-semibold text-sm text-gray-600 mb-3">Your referrals</h3>
          {referrals.map((r, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b">
              <div>
                <p className="text-sm font-medium">{r.referredName || r.referredEmail || 'User'}</p>
                <p className="text-xs text-gray-400">
                  {r.status === 'joined' ? '✅ Joined' : r.status === 'pending' ? '⏳ Pending' : r.status}
                </p>
              </div>
              <span className="text-sm font-medium text-[#E4458F]">
                +{r.tokensEarned || 0} tokens
              </span>
            </div>
          ))}
        </div>
      )}

      {/* How it works */}
      <div className="mt-8 p-4 bg-gray-50 rounded-xl">
        <h3 className="font-semibold mb-3">How it works</h3>
        <div className="space-y-3">
          {[
            { step: '1', text: 'Share your unique link with friends', textPL: 'Udostępnij swój link znajomym' },
            { step: '2', text: 'They sign up and complete their profile', textPL: 'Rejestrują się i uzupełniają profil' },
            { step: '3', text: 'You both earn bonus tokens!', textPL: 'Oboje dostajecie bonusowe tokeny!' },
          ].map(s => (
            <div key={s.step} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#E4458F] text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                {s.step}
              </div>
              <p className="text-sm">{s.textPL}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
