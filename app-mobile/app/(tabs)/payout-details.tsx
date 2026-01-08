/**
 * Payout Details Screen
 * Allows users to manage their payout method details
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from "@/contexts/AuthContext";
import { getFirestore, doc, getDoc, updateDoc } from 'firebase/firestore';
import { getApp } from 'firebase/app';
import { PayoutMethod } from "@/types/payout";

const BRAND_COLOR = '#FF6B6B';

interface PayoutDetailsForm {
  paypalEmail: string;
  bankIBAN: string;
  revolutUsername: string;
  cryptoWallet: string;
}

function PayoutDetailsScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [details, setDetails] = useState<PayoutDetailsForm>({
    paypalEmail: '',
    bankIBAN: '',
    revolutUsername: '',
    cryptoWallet: '',
  });

  useEffect(() => {
    if (user?.uid) {
      loadPayoutDetails();
    }
  }, [user?.uid]);

  const loadPayoutDetails = async () => {
    if (!user?.uid) return;

    setLoading(true);
    try {
      const db = getFirestore(getApp());
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const userData = userSnap.data();
        if (userData.payoutDetails) {
          setDetails({
            paypalEmail: userData.payoutDetails.paypalEmail || '',
            bankIBAN: userData.payoutDetails.bankIBAN || '',
            revolutUsername: userData.payoutDetails.revolutUsername || '',
            cryptoWallet: userData.payoutDetails.cryptoWallet || '',
          });
        }
      }
    } catch (error) {
      console.error('Error loading payout details:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user?.uid) {
      Alert.alert('Error', 'Please sign in to save payout details');
      return;
    }

    // Validate at least one method is filled
    const hasAtLeastOne = 
      details.paypalEmail.trim() !== '' ||
      details.bankIBAN.trim() !== '' ||
      details.revolutUsername.trim() !== '' ||
      details.cryptoWallet.trim() !== '';

    if (!hasAtLeastOne) {
      Alert.alert(
        'No Details Provided',
        'Please enter at least one payout method detail.'
      );
      return;
    }

    setSaving(true);
    try {
      const db = getFirestore(getApp());
      const userRef = doc(db, 'users', user.uid);

      const payoutDetails: Record<string, string> = {};
      if (details.paypalEmail.trim()) payoutDetails.paypalEmail = details.paypalEmail.trim();
      if (details.bankIBAN.trim()) payoutDetails.bankIBAN = details.bankIBAN.trim();
      if (details.revolutUsername.trim()) payoutDetails.revolutUsername = details.revolutUsername.trim();
      if (details.cryptoWallet.trim()) payoutDetails.cryptoWallet = details.cryptoWallet.trim();

      await updateDoc(userRef, {
        payoutDetails,
      });

      Alert.alert('Success', 'Payout details saved successfully!');
    } catch (error) {
      console.error('Error saving payout details:', error);
      Alert.alert('Error', 'Failed to save payout details. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={BRAND_COLOR} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Payout Details</Text>
        <Text style={styles.subtitle}>
          Add your payment information to receive withdrawals
        </Text>

        {/* PayPal */}
        <View style={styles.section}>
          <Text style={styles.label}>PayPal Email</Text>
          <Text style={styles.hint}>For PayPal withdrawals (7% fee)</Text>
          <TextInput
            style={styles.input}
            value={details.paypalEmail}
            onChangeText={(text) =>
              setDetails({ ...details, paypalEmail: text })
            }
            placeholder="email@example.com"
            placeholderTextColor="#999"
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        {/* Bank */}
        <View style={styles.section}>
          <Text style={styles.label}>Bank IBAN</Text>
          <Text style={styles.hint}>For bank transfers (€4 fee)</Text>
          <TextInput
            style={styles.input}
            value={details.bankIBAN}
            onChangeText={(text) => setDetails({ ...details, bankIBAN: text })}
            placeholder="DE89370400440532013000"
            placeholderTextColor="#999"
            autoCapitalize="characters"
          />
        </View>

        {/* Revolut */}
        <View style={styles.section}>
          <Text style={styles.label}>Revolut Username</Text>
          <Text style={styles.hint}>For Revolut transfers (5% fee)</Text>
          <TextInput
            style={styles.input}
            value={details.revolutUsername}
            onChangeText={(text) =>
              setDetails({ ...details, revolutUsername: text })
            }
            placeholder="@username"
            placeholderTextColor="#999"
            autoCapitalize="none"
          />
        </View>

        {/* Crypto */}
        <View style={styles.section}>
          <Text style={styles.label}>Crypto Wallet Address</Text>
          <Text style={styles.hint}>For crypto withdrawals (2% fee)</Text>
          <TextInput
            style={styles.input}
            value={details.cryptoWallet}
            onChangeText={(text) =>
              setDetails({ ...details, cryptoWallet: text })
            }
            placeholder="0x..."
            placeholderTextColor="#999"
            autoCapitalize="none"
            multiline
          />
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={styles.saveButton}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Save Details</Text>
          )}
        </TouchableOpacity>

        {/* Info */}
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>ℹ️ Important</Text>
          <Text style={styles.infoText}>
            • You only need to fill in the methods you want to use{'\n'}
            • Double-check your details before saving{'\n'}
            • You can update these details at any time{'\n'}
            • Your information is securely stored
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  hint: {
    fontSize: 13,
    color: '#999',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  saveButton: {
    backgroundColor: BRAND_COLOR,
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginBottom: 24,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  infoBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: BRAND_COLOR,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 22,
  },
});

export default PayoutDetailsScreen;
