'use client';

/**
 * FIX 55: Voice Message Recorder Component
 *
 * Press-and-hold to record a voice message using the Web Audio API.
 * Returns a Blob (audio/webm) and duration to the parent via onRecorded callback.
 *
 * Used by:
 *   - /ai/chat/[avatarId] — AI chat voice messages
 *   - ChatInterface.tsx — Human chat voice messages (future integration)
 *
 * Max recording duration: 120 seconds (2 minutes).
 * Requires microphone permission from the browser.
 */

import { useState, useRef } from 'react';

interface VoiceRecorderProps {
  onRecorded: (blob: Blob, duration: number) => void;
}

export default function VoiceRecorder({ onRecorded }: VoiceRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const durationRef = useRef(0);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : undefined,
      });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      durationRef.current = 0;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        onRecorded(blob, durationRef.current);
        stream.getTracks().forEach(t => t.stop());
        setDuration(0);
      };

      mediaRecorder.start();
      setRecording(true);

      // Duration timer
      timerRef.current = setInterval(() => {
        durationRef.current++;
        setDuration(durationRef.current);
        if (durationRef.current >= 120) stopRecording(); // Max 2 minutes
      }, 1000);
    } catch (e) {
      console.error('Microphone access denied:', e);
      alert('Please allow microphone access to send voice messages.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  return (
    <button
      onMouseDown={startRecording}
      onMouseUp={stopRecording}
      onMouseLeave={() => recording && stopRecording()}
      onTouchStart={startRecording}
      onTouchEnd={stopRecording}
      className={`p-2 rounded-full transition ${
        recording
          ? 'bg-red-500 text-white animate-pulse scale-110'
          : 'text-gray-400 hover:text-[#E4458F] hover:bg-pink-50 dark:hover:bg-pink-900/20'
      }`}
      type="button"
      aria-label={recording ? `Recording: ${duration}s` : 'Record voice message'}
    >
      {recording ? (
        <span className="text-xs font-mono">{duration}s</span>
      ) : (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
      )}
    </button>
  );
}
