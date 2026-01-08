import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocaleContext } from '../contexts/LocaleContext';
import { translateBio, translateMessage, translateUI } from '../services/translationService';
import { Locale } from '../hooks/useLocale';

interface TranslatableTextProps {
  text: string;
  type: 'ui' | 'bio' | 'message';
  sourceLang?: Locale;
  context?: string;
  style?: any;
  showToggle?: boolean;
}

/**
 * Component for displaying text with translation support
 * Shows original text with option to translate on demand
 */
export const TranslatableText: React.FC<TranslatableTextProps> = ({
  text,
  type,
  sourceLang = 'en',
  context,
  style,
  showToggle = true,
}) => {
  const { locale } = useLocaleContext();
  const [translated, setTranslated] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showOriginal, setShowOriginal] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reset when text or locale changes
  useEffect(() => {
    setTranslated(null);
    setShowOriginal(true);
    setError(null);
  }, [text, locale]);

  const handleTranslate = async () => {
    // If already translated, just toggle view
    if (translated) {
      setShowOriginal(!showOriginal);
      return;
    }

    // Don't translate if same language
    if (sourceLang === locale) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      let result;
      switch (type) {
        case 'bio':
          result = await translateBio(text, locale, sourceLang);
          break;
        case 'message':
          result = await translateMessage(text, locale, sourceLang, context);
          break;
        case 'ui':
        default:
          result = await translateUI(text, locale, sourceLang);
          break;
      }

      if (result.error) {
        setError(result.error);
      } else {
        setTranslated(result.translated);
        setShowOriginal(false);
      }
    } catch (err) {
      console.error('Translation error:', err);
      setError('Translation failed');
    } finally {
      setLoading(false);
    }
  };

  // If source and target are the same language, just show the text
  if (sourceLang === locale) {
    return <Text style={style}>{text}</Text>;
  }

  return (
    <View style={styles.container}>
      <Text style={style}>
        {showOriginal ? text : translated || text}
      </Text>
      
      {showToggle && (
        <View style={styles.controls}>
          {loading ? (
            <ActivityIndicator size="small" color="#4CAF50" />
          ) : (
            <>
              {!translated && (
                <TouchableOpacity
                  style={styles.translateButton}
                  onPress={handleTranslate}
                >
                  <Text style={styles.translateButtonText}>
                    🌐 Translate
                  </Text>
                </TouchableOpacity>
              )}
              
              {translated && (
                <TouchableOpacity
                  style={styles.toggleButton}
                  onPress={() => setShowOriginal(!showOriginal)}
                >
                  <Text style={styles.toggleButtonText}>
                    {showOriginal ? '🌐 Show translation' : '📄 Show original'}
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      )}
      
      {error && (
        <Text style={styles.errorText}>{error}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  controls: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  translateButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: '#F0F9F4',
  },
  translateButtonText: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '600',
  },
  toggleButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: '#EFF6FF',
  },
  toggleButtonText: {
    fontSize: 12,
    color: '#1E40AF',
    fontWeight: '600',
  },
  errorText: {
    fontSize: 11,
    color: '#EF4444',
    marginTop: 4,
  },
});

export default TranslatableText;
