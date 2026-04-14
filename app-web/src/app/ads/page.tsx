'use client';

/**
 * FIX 74A: Advertiser Dashboard — /ads
 *
 * Three tabs:
 *   1. My Campaigns — list of advertiser's campaigns with status/stats
 *   2. Create Campaign — form to create new ad campaign with targeting
 *   3. Analytics — placeholder for future detailed analytics
 *
 * Revenue: Ads = 100% Avalo
 *
 * INVARIANTS:
 *   - Uses useAuth() from AuthProvider for user context.
 *   - Uses requireDb() / requireStorage() / functions canonical guards.
 *   - Campaign creation goes through Cloud Function (createAdCampaign).
 *   - Image uploads go to Firebase Storage under ads/{uid}/.
 */

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { requireDb, requireStorage, functions } from '@/lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { useRouter } from 'next/navigation';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// ============================================================================
// TYPES
// ============================================================================

interface AdCampaign {
  id: string;
  advertiserId: string;
  title: string;
  description?: string;
  targetUrl?: string;
  imageUrl?: string;
  budgetTokens: number;
  spentTokens?: number;
  impressions?: number;
  clicks?: number;
  status: string;
  targeting?: {
    gender?: string;
    ageMin?: number;
    ageMax?: number;
    city?: string | null;
  };
  createdAt?: any;
}

// ============================================================================
// PAGE
// ============================================================================

export default function AdsPage() {
  const { firebaseUser } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<'campaigns' | 'create' | 'analytics'>('campaigns');
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [creating, setCreating] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [budgetTokens, setBudgetTokens] = useState(500);
  const [targetGender, setTargetGender] = useState('all');
  const [targetAgeMin, setTargetAgeMin] = useState(18);
  const [targetAgeMax, setTargetAgeMax] = useState(45);
  const [targetCity, setTargetCity] = useState('');
  const [adImage, setAdImage] = useState<File | null>(null);
  const [adPreview, setAdPreview] = useState('');

  // ── Load campaigns ──────────────────────────────────────────────────
  useEffect(() => {
    if (!firebaseUser?.uid) return;

    getDocs(
      query(
        collection(requireDb(), 'ad_campaigns'),
        where('advertiserId', '==', firebaseUser.uid),
        orderBy('createdAt', 'desc')
      )
    )
      .then((snap) =>
        setCampaigns(
          snap.docs.map((d) => ({ id: d.id, ...d.data() } as AdCampaign))
        )
      )
      .catch(() => {});
  }, [firebaseUser?.uid, tab]);

  // ── Create campaign handler ─────────────────────────────────────────
  const handleCreate = async () => {
    if (!title || budgetTokens < 100) {
      alert('Title required, min budget 100 tokens');
      return;
    }
    if (!firebaseUser?.uid) return;

    setCreating(true);
    try {
      let imageUrl = '';
      if (adImage) {
        const storageRef = ref(
          requireStorage(),
          `ads/${firebaseUser.uid}/${Date.now()}_${adImage.name}`
        );
        await uploadBytes(storageRef, adImage);
        imageUrl = await getDownloadURL(storageRef);
      }

      const fn = httpsCallable(functions, 'createAdCampaign');
      await fn({
        title,
        description,
        targetUrl,
        budgetTokens,
        imageUrl,
        targeting: {
          gender: targetGender,
          ageMin: targetAgeMin,
          ageMax: targetAgeMax,
          city: targetCity || null,
        },
      });

      alert('Campaign created! Review in progress.');
      setTab('campaigns');
      setTitle('');
      setDescription('');
      setTargetUrl('');
      setBudgetTokens(500);
      setAdImage(null);
      setAdPreview('');
    } catch (e) {
      console.error('[AdsPage] Create campaign error:', e);
      alert('Failed to create campaign');
    }
    setCreating(false);
  };

  // ── Status badge colors ─────────────────────────────────────────────
  const statusBadge = (s: string) => {
    if (s === 'active') return 'bg-green-100 text-green-700';
    if (s === 'paused') return 'bg-yellow-100 text-yellow-700';
    if (s === 'ended' || s === 'expired') return 'bg-gray-100 text-gray-600';
    if (s === 'review') return 'bg-blue-100 text-blue-700';
    return 'bg-gray-100 text-gray-600';
  };

  return (
    <div className="max-w-3xl mx-auto p-4 pb-24">
      <h1 className="text-2xl font-bold mb-1">Advertising</h1>
      <p className="text-sm text-gray-500 mb-6">
        Promote your brand on Avalo — reach thousands of active users
      </p>

      {/* Tab bar */}
      <div className="flex gap-1 border-b mb-4">
        {[
          { id: 'campaigns' as const, label: 'My Campaigns' },
          { id: 'create' as const, label: 'Create Campaign' },
          { id: 'analytics' as const, label: 'Analytics' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? 'border-[#E4458F] text-[#E4458F]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Campaigns list ───────────────────────────────────────────── */}
      {tab === 'campaigns' && (
        <div className="space-y-3">
          {campaigns.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-4xl mb-3">📢</p>
              <p className="text-gray-500">No campaigns yet</p>
              <button
                onClick={() => setTab('create')}
                className="mt-3 px-4 py-2 bg-[#E4458F] text-white rounded-lg text-sm"
              >
                Create your first campaign
              </button>
            </div>
          ) : (
            campaigns.map((c) => (
              <div key={c.id} className="p-4 border rounded-xl">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{c.title}</p>
                    <p className="text-xs text-gray-500">
                      {c.description?.slice(0, 80)}
                    </p>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${statusBadge(
                      c.status
                    )}`}
                  >
                    {c.status}
                  </span>
                </div>
                <div className="flex gap-4 mt-2 text-xs text-gray-500">
                  <span>Budget: {c.budgetTokens} tokens</span>
                  <span>Spent: {c.spentTokens || 0} tokens</span>
                  <span>Views: {c.impressions || 0}</span>
                  <span>Clicks: {c.clicks || 0}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Create campaign form ─────────────────────────────────────── */}
      {tab === 'create' && (
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Campaign Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Spring Sale — "
              className="w-full mt-1 p-2 border rounded-lg"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What do you want users to know?"
              className="w-full mt-1 p-2 border rounded-lg resize-none"
              rows={3}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Link (URL)</label>
            <input
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="https://yoursite.com"
              className="w-full mt-1 p-2 border rounded-lg"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Ad Image</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setAdImage(f);
                  setAdPreview(URL.createObjectURL(f));
                }
              }}
              className="w-full mt-1"
            />
            {adPreview && (
              <img
                src={adPreview}
                alt=""
                className="mt-2 w-full h-40 object-cover rounded-lg"
              />
            )}
          </div>

          {/* Targeting */}
          <div className="p-4 bg-gray-50 rounded-xl">
            <h4 className="font-medium text-sm mb-3">Targeting</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500">Gender</label>
                <select
                  value={targetGender}
                  onChange={(e) => setTargetGender(e.target.value)}
                  className="w-full p-2 border rounded-lg text-sm"
                >
                  <option value="all">All</option>
                  <option value="male">Men</option>
                  <option value="female">Women</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">City (optional)</label>
                <input
                  value={targetCity}
                  onChange={(e) => setTargetCity(e.target.value)}
                  placeholder="e.g., Warsaw"
                  className="w-full p-2 border rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Age min</label>
                <input
                  type="number"
                  value={targetAgeMin}
                  onChange={(e) => setTargetAgeMin(Number(e.target.value))}
                  min={18}
                  max={80}
                  className="w-full p-2 border rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Age max</label>
                <input
                  type="number"
                  value={targetAgeMax}
                  onChange={(e) => setTargetAgeMax(Number(e.target.value))}
                  min={18}
                  max={80}
                  className="w-full p-2 border rounded-lg text-sm"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Budget (tokens)</label>
            <input
              type="number"
              value={budgetTokens}
              onChange={(e) => setBudgetTokens(Number(e.target.value))}
              min={100}
              className="w-full mt-1 p-2 border rounded-lg"
            />
            <p className="text-xs text-gray-400 mt-1">
              Min 100 tokens. ~0.5-2 tokens per view depending on targeting.
            </p>
          </div>

          <button
            onClick={handleCreate}
            disabled={creating || !title}
            className="w-full py-3 bg-gradient-to-r from-[#E8593C] via-[#E4458F] to-[#8B5CF6] text-white rounded-lg font-medium disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Launch Campaign'}
          </button>
        </div>
      )}

      {/* ── Analytics placeholder ────────────────────────────────────── */}
      {tab === 'analytics' && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">📊</p>
          <p>Detailed analytics coming soon</p>
          <p className="text-sm mt-1">
            Campaign performance, CTR, and ROI tracking
          </p>
        </div>
      )}
    </div>
  );
}
