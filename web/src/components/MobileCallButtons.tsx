'use client';

/**
 * Mobile Call Buttons Component (Web)
 * Shows buttons to initiate calls that open in the mobile app
 * via deep links or QR codes
 */

import React, { useState } from 'react';
import {
  generateDeepLink,
  generateQRCode,
  isMobileDevice,
  openDeepLink,
  getDeepLinkInstructions,
  getFallbackMessage,
} from '../lib/mobileDeepLink';

interface MobileCallButtonsProps {
  userId: string;
  userName: string;
}

export default function MobileCallButtons({ userId, userName }: MobileCallButtonsProps) {
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrCodeType, setQrCodeType] = useState<'audio' | 'video'>('audio');
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);

  const handleCallClick = async (type: 'audio' | 'video') => {
    const isMobile = isMobileDevice();
    
    if (isMobile) {
      // On mobile, try to open deep link directly
      const deepLink = generateDeepLink({
        type: type === 'audio' ? 'call_audio' : 'call_video',
        userId,
      });
      openDeepLink(deepLink);
    } else {
      // On desktop, show QR modal
      setQrCodeType(type);
      
      const deepLink = generateDeepLink({
        type: type === 'audio' ? 'call_audio' : 'call_video',
        userId,
      });
      
      try {
        const qrUrl = await generateQRCode(deepLink);
        setQrCodeUrl(qrUrl);
      } catch (error) {
        console.error('Error generating QR code:', error);
        setQrCodeUrl(null);
      }
      
      setShowQRModal(true);
    }
  };

  return (
    <>
      <div className="flex gap-3">
        <button
          onClick={() => handleCallClick('audio')}
          className="flex-1 flex items-center justify-center gap-2 bg-teal-500 hover:bg-teal-600 text-white font-semibold py-3 px-4 rounded-xl transition-colors"
        >
          <span className="text-xl">📞</span>
          <span>Połączenie głosowe</span>
          <span className="text-xs opacity-75">(Avalo app)</span>
        </button>

        <button
          onClick={() => handleCallClick('video')}
          className="flex-1 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-4 rounded-xl transition-colors"
        >
          <span className="text-xl">📹</span>
          <span>Połączenie wideo</span>
          <span className="text-xs opacity-75">(Avalo app)</span>
        </button>
      </div>

      {/* QR Code Modal */}
      {showQRModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowQRModal(false)}
        >
          <div
            className="bg-white rounded-2xl p-8 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-6">
              <h3 className="text-2xl font-bold text-gray-900">
                {qrCodeType === 'audio' ? '📞 Połączenie głosowe' : '📹 Połączenie wideo'}
              </h3>
              <button
                onClick={() => setShowQRModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <p className="text-gray-600 mb-6 text-center">
              {getDeepLinkInstructions(qrCodeType === 'audio' ? 'call_audio' : 'call_video')}
            </p>

            {qrCodeUrl ? (
              <div className="flex justify-center mb-6">
                <div className="bg-white p-4 rounded-xl border-2 border-gray-200">
                  <img
                    src={qrCodeUrl}
                    alt="QR Code"
                    className="w-64 h-64"
                  />
                </div>
              </div>
            ) : (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 mb-6">
                <p className="text-sm text-yellow-800 text-center">
                  {getFallbackMessage()}
                </p>
              </div>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
              <p className="font-semibold mb-2">💡 Jak to działa:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Otwórz aplikację Avalo na telefonie</li>
                <li>Zeskanuj kod QR aparatem lub z poziomu aplikacji</li>
                <li>Połączenie rozpocznie się automatycznie</li>
              </ol>
            </div>

            <div className="mt-6 text-center">
              <p className="text-xs text-gray-500">
                Nie masz aplikacji?{' '}
                <a href="/download" className="text-teal-600 hover:underline">
                  Pobierz Avalo
                </a>
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}