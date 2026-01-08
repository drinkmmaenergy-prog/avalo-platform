/**
 * PACK 60 — Security Center Screen
 * Main security settings hub
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import {
  fetchSecurityOverview,
  updateSecuritySettings,
  setupTwoFactor,
  confirmTwoFactorSetup,
  disableTwoFactor,
  requestTwoFactorChallenge,
  SecurityOverview,
  TwoFactorMethod,
} from '../../services/securityService';
import { useTranslation } from 'react-i18next';

export default function SecurityCenterScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<SecurityOverview | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    loadSecurityOverview();
  }, []);

  const loadSecurityOverview = async () => {
    if (!user?.uid) return;
    try {
      setLoading(true);
      const data = await fetchSecurityOverview(user.uid);
      setOverview(data);
    } catch (error: any) {
      console.error('Error loading security overview:', error);
      Alert.alert(t('common.error'), t('security.errorLoading'));
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAlert = async (
    key: keyof SecurityOverview['alerts'],
    value: boolean
  ) => {
    if (!user?.uid || !overview) return;
    try {
      setUpdating(true);
      const updated = await updateSecuritySettings(user.uid, {
        alerts: { [key]: value },
      });
      setOverview(updated);
    } catch (error: any) {
      console.error('Error updating alert setting:', error);
      Alert.alert(t('common.error'), t('security.errorUpdating'));
    } finally {
      setUpdating(false);
    }
  };

  const handleToggleRisk = async (
    key: keyof SecurityOverview['risk'],
    value: boolean
  ) => {
    if (!user?.uid || !overview) return;
    try {
      setUpdating(true);
      const updated = await updateSecuritySettings(user.uid, {
        risk: { [key]: value },
      });
      setOverview(updated);
    } catch (error: any) {
      console.error('Error updating risk setting:', error);
      Alert.alert(t('common.error'), t('security.errorUpdating'));
    } finally {
      setUpdating(false);
    }
  };

  const handleEnable2FA = () => {
    if (!overview) return;
    
    Alert.alert(
      t('security.twoFactor.enable'),
      t('security.twoFactor.chooseMethod'),
      [
        {
          text: t('security.twoFactor.method.sms'),
          onPress: () => router.push('/settings/setup-2fa?method=SMS'),
        },
        {
          text: t('security.twoFactor.method.email'),
          onPress: () => router.push('/settings/setup-2fa?method=EMAIL'),
        },
        { text: t('common.cancel'), style: 'cancel' },
      ]
    );
  };

  const handleDisable2FA = async () => {
    if (!user?.uid || !overview) return;

    Alert.alert(
      t('security.twoFactor.disable'),
      t('security.twoFactor.disableConfirm'),
      [
        {
          text: t('common.confirm'),
          onPress: async () => {
            try {
              setUpdating(true);
              // Request a challenge first
              await requestTwoFactorChallenge(user.uid, 'SETTINGS_CHANGE');
              // Navigate to verification screen
              router.push('/settings/verify-2fa?action=disable');
            } catch (error: any) {
              console.error('Error disabling 2FA:', error);
              Alert.alert(t('common.error'), error.message);
            } finally {
              setUpdating(false);
            }
          },
        },
        { text: t('common.cancel'), style: 'cancel' },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#e91e63" />
      </View>
    );
  }

  if (!overview) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{t('security.errorLoading')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Two-Factor Authentication */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('security.twoFactor.title')}</Text>
        
        <View style={styles.row}>
          <View style={styles.rowContent}>
            <Text style={styles.rowTitle}>
              {overview.twoFactor.enabled
                ? t('security.twoFactor.enabled')
                : t('security.twoFactor.disabled')}
            </Text>
            {overview.twoFactor.enabled && overview.twoFactor.destinationMasked && (
              <Text style={styles.rowSubtitle}>
                {overview.twoFactor.method === 'SMS'
                  ? t('security.twoFactor.method.sms')
                  : t('security.twoFactor.method.email')}
                : {overview.twoFactor.destinationMasked}
              </Text>
            )}
          </View>
          
          <TouchableOpacity
            style={[
              styles.button,
              overview.twoFactor.enabled ? styles.buttonDanger : styles.buttonPrimary,
            ]}
            onPress={overview.twoFactor.enabled ? handleDisable2FA : handleEnable2FA}
            disabled={updating}
          >
            <Text style={styles.buttonText}>
              {overview.twoFactor.enabled
                ? t('security.twoFactor.disable')
                : t('security.twoFactor.enable')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Security Alerts */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('security.alerts.title')}</Text>
        
        <View style={styles.row}>
          <Text style={styles.rowTitle}>{t('security.alerts.newDevice')}</Text>
          <Switch
            value={overview.alerts.newDeviceLogin}
            onValueChange={(v) => handleToggleAlert('newDeviceLogin', v)}
            disabled={updating}
            trackColor={{ false: '#ccc', true: '#e91e63' }}
            thumbColor="#fff"
          />
        </View>

        <View style={styles.row}>
          <Text style={styles.rowTitle}>{t('security.alerts.newLocation')}</Text>
          <Switch
            value={overview.alerts.newLocationLogin}
            onValueChange={(v) => handleToggleAlert('newLocationLogin', v)}
            disabled={updating}
            trackColor={{ false: '#ccc', true: '#e91e63' }}
            thumbColor="#fff"
          />
        </View>

        <View style={styles.row}>
          <Text style={styles.rowTitle}>{t('security.alerts.securityChanges')}</Text>
          <Switch
            value={overview.alerts.securityChanges}
            onValueChange={(v) => handleToggleAlert('securityChanges', v)}
            disabled={updating}
            trackColor={{ false: '#ccc', true: '#e91e63' }}
            thumbColor="#fff"
          />
        </View>
      </View>

      {/* Sensitive Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('security.risk.title')}</Text>
        
        <View style={styles.row}>
          <Text style={styles.rowTitle}>{t('security.risk.require2faPayout')}</Text>
          <Switch
            value={overview.risk.require2faForPayout}
            onValueChange={(v) => handleToggleRisk('require2faForPayout', v)}
            disabled={updating || !overview.twoFactor.enabled}
            trackColor={{ false: '#ccc', true: '#e91e63' }}
            thumbColor="#fff"
          />
        </View>

        <View style={styles.row}>
          <Text style={styles.rowTitle}>{t('security.risk.require2faSettings')}</Text>
          <Switch
            value={overview.risk.require2faForSettingsChange}
            onValueChange={(v) => handleToggleRisk('require2faForSettingsChange', v)}
            disabled={updating || !overview.twoFactor.enabled}
            trackColor={{ false: '#ccc', true: '#e91e63' }}
            thumbColor="#fff"
          />
        </View>
      </View>

      {/* Devices & Sessions */}
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => router.push('/settings/devices-sessions')}
        >
          <Text style={styles.linkButtonText}>{t('security.devices.title')}</Text>
          <Text style={styles.linkButtonArrow}>›</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  section: {
    backgroundColor: '#fff',
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  rowContent: {
    flex: 1,
    marginRight: 12,
  },
  rowTitle: {
    fontSize: 14,
    color: '#333',
  },
  rowSubtitle: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  buttonPrimary: {
    backgroundColor: '#e91e63',
  },
  buttonDanger: {
    backgroundColor: '#f44336',
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  linkButtonText: {
    fontSize: 14,
    color: '#e91e63',
    fontWeight: '600',
  },
  linkButtonArrow: {
    fontSize: 24,
    color: '#e91e63',
  },
  errorText: {
    fontSize: 14,
    color: '#f44336',
    textAlign: 'center',
  },
});
