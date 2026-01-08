/**
 * PACK 372 — Feature Kill-Switch Panel
 * Real-time feature control across countries
 */

import React, { useState, useEffect } from 'react';
import {
  collection,
  query,
  onSnapshot,
  doc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

type FeatureState = 'on' | 'off' | 'restricted';

interface FeatureKillSwitch {
  featureKey: string;
  globalState: FeatureState;
  countriesAllowed: string[];
  reason: string;
  activatedBy: string;
  activatedAt: any;
}

const FEATURES = [
  'chat',
  'wallet',
  'payouts',
  'calendar',
  'events',
  'ai',
  'video-calls',
  'voice-calls',
  'boost',
  'premium',
];

export const FeatureKillSwitchPanel: React.FC = () => {
  const [killSwitches, setKillSwitches] = useState<
    Record<string, FeatureKillSwitch>
  >({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'featureKillSwitches'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: Record<string, FeatureKillSwitch> = {};
      snapshot.docs.forEach((doc) => {
        data[doc.id] = doc.data() as FeatureKillSwitch;
      });
      setKillSwitches(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const toggleFeature = async (
    featureKey: string,
    newState: FeatureState
  ) => {
    const reason = prompt(
      `Reason for setting ${featureKey} to ${newState}:`
    );
    if (!reason) return;

    try {
      const killSwitchRef = doc(db, 'featureKillSwitches', featureKey);
      await setDoc(
        killSwitchRef,
        {
          featureKey,
          globalState: newState,
          countriesAllowed: newState === 'restricted' ? [] : ['*'],
          reason,
          activatedBy: 'admin', // Replace with actual user ID
          activatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (error) {
      console.error('Error updating kill switch:', error);
      alert('Failed to update feature state');
    }
  };

  if (loading) {
    return <div>Loading kill switches...</div>;
  }

  return (
    <div className="p-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-2xl font-bold mb-4">🔴 Feature Kill Switches</h2>
        <p className="text-gray-600 mb-6">
          Control feature availability globally or per country
        </p>

        <div className="space-y-4">
          {FEATURES.map((feature) => {
            const killSwitch = killSwitches[feature];
            const state = killSwitch?.globalState || 'on';

            return (
              <div
                key={feature}
                className="border rounded-lg p-4 flex items-center justify-between"
              >
                <div>
                  <h3 className="font-bold text-lg capitalize">{feature}</h3>
                  {killSwitch && (
                    <p className="text-sm text-gray-600">
                      Reason: {killSwitch.reason}
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => toggleFeature(feature, 'on')}
                    className={`
                      px-4 py-2 rounded font-medium
                      ${
                        state === 'on'
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }
                    `}
                  >
                    ON
                  </button>
                  <button
                    onClick={() => toggleFeature(feature, 'restricted')}
                    className={`
                      px-4 py-2 rounded font-medium
                      ${
                        state === 'restricted'
                          ? 'bg-yellow-500 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }
                    `}
                  >
                    RESTRICTED
                  </button>
                  <button
                    onClick={() => toggleFeature(feature, 'off')}
                    className={`
                      px-4 py-2 rounded font-medium
                      ${
                        state === 'off'
                          ? 'bg-red-500 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }
                    `}
                  >
                    OFF
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default FeatureKillSwitchPanel;
