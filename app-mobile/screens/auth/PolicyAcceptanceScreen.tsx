/**
 * PACK 55 — Policy Acceptance Screen
 * Requires users to accept critical policies before using the app
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useLocaleContext } from '../../contexts/LocaleContext';
import {
  PolicyDocument,
  getPoliciesNeedingAcceptance,
  acceptMultiplePolicies,
} from '../../services/policyService';

interface Props {
  onAccepted: () => void;
}

export default function PolicyAcceptanceScreen({ onAccepted }: Props) {
  const { user } = useAuth();
  const localeContext = useLocaleContext();
  const locale = localeContext.locale;
  
  // Helper function to translate
  const t = (key: string): string => {
    const keys = key.split('.');
    let value: any = require('../../i18n/strings.en.json');
    for (const k of keys) {
      value = value[k];
      if (!value) return key;
    }
    return value;
  };

  const [policies, setPolicies] = useState<PolicyDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadPolicies();
  }, []);

  const loadPolicies = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const needingAcceptance = await getPoliciesNeedingAcceptance(user.uid, locale);
      setPolicies(needingAcceptance);

      // Initialize all as not accepted
      const initialState: Record<string, boolean> = {};
      needingAcceptance.forEach((p) => {
        initialState[p.policyType] = false;
      });
      setAccepted(initialState);
    } catch (error: any) {
      console.error('[PolicyAcceptanceScreen] Error loading policies:', error);
      Alert.alert(t('common.error'), 'Failed to load policies. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const toggleAcceptance = (policyType: string) => {
    setAccepted((prev) => ({
      ...prev,
      [policyType]: !prev[policyType],
    }));
  };

  const allAccepted = policies.every((p) => accepted[p.policyType]);

  const handleContinue = async () => {
    if (!user) return;

    if (!allAccepted) {
      Alert.alert(
        t('common.error'),
        'You must accept all policies to continue using Avalo.'
      );
      return;
    }

    setAccepting(true);

    try {
      const policiesToAccept = policies.map((p) => ({
        policyType: p.policyType,
        version: p.version,
      }));

      await acceptMultiplePolicies(user.uid, policiesToAccept);
      onAccepted();
    } catch (error: any) {
      console.error('[PolicyAcceptanceScreen] Error accepting policies:', error);
      Alert.alert(
        t('common.error'),
        error.message || 'Failed to accept policies. Please try again.'
      );
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#E94057" />
        <Text style={styles.loadingText}>Loading policies...</Text>
      </View>
    );
  }

  if (policies.length === 0) {
    // No policies need acceptance, continue
    useEffect(() => {
      onAccepted();
    }, []);
    return null;
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('compliance.policies.title')}</Text>
          <Text style={styles.subtitle}>{t('compliance.policies.subtitle')}</Text>
        </View>

        <View style={styles.policiesList}>
          {policies.map((policy) => (
            <View key={policy.policyType} style={styles.policyItem}>
              <TouchableOpacity
                style={styles.checkbox}
                onPress={() => toggleAcceptance(policy.policyType)}
              >
                <View
                  style={[
                    styles.checkboxBox,
                    accepted[policy.policyType] && styles.checkboxBoxChecked,
                  ]}
                >
                  {accepted[policy.policyType] && (
                    <Text style={styles.checkboxCheck}>✓</Text>
                  )}
                </View>
                <Text style={styles.policyTitle}>{policy.title}</Text>
              </TouchableOpacity>

              <ScrollView style={styles.policyContent} nestedScrollEnabled>
                <Text style={styles.policyText}>{policy.contentMarkdown}</Text>
              </ScrollView>
            </View>
          ))}
        </View>

        <View style={styles.acceptAllContainer}>
          <TouchableOpacity
            style={styles.acceptAllCheckbox}
            onPress={() => {
              const allCurrentlyAccepted = allAccepted;
              const newState: Record<string, boolean> = {};
              policies.forEach((p) => {
                newState[p.policyType] = !allCurrentlyAccepted;
              });
              setAccepted(newState);
            }}
          >
            <View
              style={[
                styles.checkboxBox,
                allAccepted && styles.checkboxBoxChecked,
              ]}
            >
              {allAccepted && <Text style={styles.checkboxCheck}>✓</Text>}
            </View>
            <Text style={styles.acceptAllText}>
              {t('compliance.policies.acceptAll')}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.continueButton,
            (!allAccepted || accepting) && styles.continueButtonDisabled,
          ]}
          onPress={handleContinue}
          disabled={!allAccepted || accepting}
        >
          {accepting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.continueButtonText}>
              {t('compliance.policies.continue')}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#999',
    marginTop: 16,
    fontSize: 16,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 24,
    paddingBottom: 100,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#999',
    lineHeight: 24,
  },
  policiesList: {
    marginBottom: 24,
  },
  policyItem: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  checkbox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  checkboxBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#666',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxBoxChecked: {
    backgroundColor: '#E94057',
    borderColor: '#E94057',
  },
  checkboxCheck: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  policyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
  },
  policyContent: {
    maxHeight: 200,
    backgroundColor: '#0a0a0a',
    borderRadius: 8,
    padding: 12,
  },
  policyText: {
    fontSize: 14,
    color: '#ccc',
    lineHeight: 20,
  },
  acceptAllContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  acceptAllCheckbox: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  acceptAllText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    backgroundColor: '#000',
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  continueButton: {
    backgroundColor: '#E94057',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
  },
  continueButtonDisabled: {
    opacity: 0.5,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
