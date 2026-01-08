import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { VoiceMessage } from '../services/aiVoiceService';

interface AiVoiceMessageBubbleProps {
  voiceMessage: VoiceMessage;
}

export default function AiVoiceMessageBubble({ voiceMessage }: AiVoiceMessageBubbleProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  
  // Waveform animation values
  const waveAnims = useRef(
    Array.from({ length: 20 }, () => new Animated.Value(0.3))
  ).current;

  useEffect(() => {
    if (isPlaying) {
      // Start waveform animation
      startWaveformAnimation();
      
      // Simulate playback
      const interval = setInterval(() => {
        setCurrentTime((prev) => {
          const next = prev + 0.1;
          if (next >= voiceMessage.duration) {
            setIsPlaying(false);
            return 0;
          }
          return next;
        });
      }, 100);

      return () => clearInterval(interval);
    } else {
      // Stop waveform animation
      stopWaveformAnimation();
    }
  }, [isPlaying]);

  const startWaveformAnimation = () => {
    const animations = waveAnims.map((anim, index) => {
      return Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: 0.3 + Math.random() * 0.7,
            duration: 200 + Math.random() * 200,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0.3,
            duration: 200 + Math.random() * 200,
            useNativeDriver: true,
          }),
        ])
      );
    });

    Animated.parallel(animations).start();
  };

  const stopWaveformAnimation = () => {
    waveAnims.forEach((anim) => {
      anim.setValue(0.3);
    });
  };

  const handlePlayPause = () => {
    if (isPlaying) {
      // Pause
      setIsPlaying(false);
    } else {
      // Play
      setIsPlaying(true);
      if (currentTime >= voiceMessage.duration) {
        setCurrentTime(0);
      }
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      {/* Play/Pause Button */}
      <TouchableOpacity style={styles.playButton} onPress={handlePlayPause}>
        <Text style={styles.playIcon}>{isPlaying ? '⏸' : '▶'}</Text>
      </TouchableOpacity>

      {/* Waveform */}
      <View style={styles.waveformContainer}>
        <View style={styles.waveform}>
          {waveAnims.map((anim, index) => (
            <Animated.View
              key={index}
              style={[
                styles.waveBar,
                {
                  transform: [{ scaleY: anim }],
                },
              ]}
            />
          ))}
        </View>

        {/* Time Display */}
        <View style={styles.timeContainer}>
          <Text style={styles.timeText}>
            {formatTime(currentTime)} / {formatTime(voiceMessage.duration)}
          </Text>
        </View>

        {/* Transcript Preview */}
        <Text style={styles.transcriptText} numberOfLines={2}>
          {voiceMessage.transcript}
        </Text>
      </View>

      {/* Voice Style Badge */}
      <View style={styles.styleBadge}>
        <Text style={styles.styleBadgeText}>
          {voiceMessage.voiceStyle}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0F0F0F',
    borderWidth: 2,
    borderColor: '#D4AF37',
    borderRadius: 18,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    maxWidth: '85%',
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#40E0D0',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#40E0D0',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  playIcon: {
    fontSize: 20,
    color: '#0F0F0F',
    marginLeft: 2,
  },
  waveformContainer: {
    flex: 1,
    gap: 8,
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 40,
    gap: 2,
  },
  waveBar: {
    width: 3,
    height: '100%',
    backgroundColor: '#40E0D0',
    borderRadius: 2,
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeText: {
    fontSize: 12,
    color: '#999',
    fontWeight: '500',
  },
  transcriptText: {
    fontSize: 13,
    color: '#CCC',
    lineHeight: 18,
    marginTop: 4,
  },
  styleBadge: {
    backgroundColor: '#D4AF3733',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#D4AF37',
  },
  styleBadgeText: {
    fontSize: 11,
    color: '#D4AF37',
    fontWeight: '600',
    textTransform: 'capitalize',
  },
});
