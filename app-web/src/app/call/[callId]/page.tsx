'use client';

/**
 * Video Call Page — WebRTC with Firebase Firestore signaling
 * Route: /call/[callId]
 *
 * FIX 40: Browser-native WebRTC — no external SDK needed.
 * Uses Google STUN servers + Firestore for offer/answer/ICE exchange.
 *
 * INVARIANTS:
 *   - Uses requireDb() canonical guard for Firestore access.
 *   - Uses useAuth() from AuthProvider for user context.
 *   - Call document schema: { callerId, callerName, receiverId, receiverName,
 *       callRate, status, offer, answer, createdAt, endedAt, duration }
 *   - ICE candidates stored in subcollection: calls/{callId}/candidates/{peerId}/ice/{candidateId}
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import {
  doc,
  onSnapshot,
  updateDoc,
  getDoc,
  collection,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { requireDb } from '@/lib/firebase';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export default function CallPage() {
  const params = useParams();
  const callId = params?.callId as string;
  const { user, firebaseUser } = useAuth();
  const router = useRouter();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [callState, setCallState] = useState<'connecting' | 'ringing' | 'active' | 'ended'>('connecting');
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [callData, setCallData] = useState<any>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const uid = firebaseUser?.uid || user?.uid || null;

  // Initialize WebRTC
  useEffect(() => {
    if (!uid || !callId) return;

    const db = requireDb();
    let pc: RTCPeerConnection;

    const init = async () => {
      // Get local media
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      // Create peer connection
      pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;

      // Add local tracks
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // Handle remote tracks
      pc.ontrack = (event) => {
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
        setCallState('active');
        // Start duration timer
        timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
      };

      // ICE candidates — send to Firestore
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          addDoc(collection(db, 'calls', callId as string, 'candidates', uid, 'ice'), {
            candidate: event.candidate.toJSON(),
            timestamp: serverTimestamp(),
          });
        }
      };

      // Load call document
      const callDoc = await getDoc(doc(db, 'calls', callId as string));
      const data = callDoc.data();
      setCallData(data);

      if (data?.callerId === uid) {
        // Caller — create offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await updateDoc(doc(db, 'calls', callId as string), {
          offer: { type: offer.type, sdp: offer.sdp },
          status: 'ringing',
        });
        setCallState('ringing');
      } else {
        // Receiver — set remote offer and create answer
        if (data?.offer) {
          await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await updateDoc(doc(db, 'calls', callId as string), {
            answer: { type: answer.type, sdp: answer.sdp },
            status: 'active',
          });
        }
      }

      // Listen for answer (caller side)
      onSnapshot(doc(db, 'calls', callId as string), (snap) => {
        const d = snap.data();
        if (d?.answer && !pc.currentRemoteDescription && d.callerId === uid) {
          pc.setRemoteDescription(new RTCSessionDescription(d.answer));
        }
        if (d?.status === 'ended') {
          handleEndCall();
        }
      });

      // Listen for ICE candidates from other party
      const otherUid = data?.callerId === uid ? data?.receiverId : data?.callerId;
      if (otherUid) {
        onSnapshot(collection(db, 'calls', callId as string, 'candidates', otherUid, 'ice'), (snap) => {
          snap.docChanges().forEach((change) => {
            if (change.type === 'added') {
              pc.addIceCandidate(new RTCIceCandidate(change.doc.data().candidate));
            }
          });
        });
      }
    };

    init().catch(console.error);

    return () => {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      pcRef.current?.close();
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, callId]);

  const handleEndCall = async () => {
    setCallState('ended');
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    pcRef.current?.close();
    if (timerRef.current) clearInterval(timerRef.current);
    try {
      const db = requireDb();
      await updateDoc(doc(db, 'calls', callId as string), {
        status: 'ended',
        duration,
        endedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('[CallPage] Error ending call:', err);
    }
    setTimeout(() => router.back(), 2000);
  };

  const toggleMute = () => {
    const audio = localStreamRef.current?.getAudioTracks()[0];
    if (audio) {
      audio.enabled = !audio.enabled;
      setIsMuted(!audio.enabled);
    }
  };

  const toggleVideo = () => {
    const video = localStreamRef.current?.getVideoTracks()[0];
    if (video) {
      video.enabled = !video.enabled;
      setIsVideoOff(!video.enabled);
    }
  };

  const formatDuration = (s: number) =>
    `${Math.floor(s / 60)
      .toString()
      .padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Remote video (full screen) */}
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Local video (small pip) */}
      <video
        ref={localVideoRef}
        autoPlay
        playsInline
        muted
        className="absolute top-4 right-4 w-32 h-44 rounded-2xl object-cover border-2 border-white/30 z-10"
      />

      {/* Status overlay */}
      <div className="absolute top-4 left-4 z-10">
        <p className="text-white text-sm font-medium">
          {callState === 'connecting' && 'Connecting...'}
          {callState === 'ringing' && 'Ringing...'}
          {callState === 'active' && formatDuration(duration)}
          {callState === 'ended' && 'Call ended'}
        </p>
        {callData && (
          <p className="text-white/70 text-xs mt-1">
            {callData.callRate || 0} tokens/min
          </p>
        )}
      </div>

      {/* Controls */}
      <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-6 z-10">
        <button
          onClick={toggleMute}
          className={`w-14 h-14 rounded-full flex items-center justify-center ${
            isMuted ? 'bg-red-500' : 'bg-white/20'
          }`}
        >
          <span className="text-white text-xl">{isMuted ? '🔇' : '🎤'}</span>
        </button>
        <button
          onClick={handleEndCall}
          className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center"
        >
          <span className="text-white text-2xl">📞</span>
        </button>
        <button
          onClick={toggleVideo}
          className={`w-14 h-14 rounded-full flex items-center justify-center ${
            isVideoOff ? 'bg-red-500' : 'bg-white/20'
          }`}
        >
          <span className="text-white text-xl">{isVideoOff ? '📷' : '📹'}</span>
        </button>
      </div>
    </div>
  );
}
