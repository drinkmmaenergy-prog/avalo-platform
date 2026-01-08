import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { MEET_CONFIG } from "@/config/monetization";

export default function CreateMeetProfile() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [realMeetEnabled, setRealMeetEnabled] = useState(false);
  const [socialMeetEnabled, setSocialMeetEnabled] = useState(true);
  const [realMeetPrice, setRealMeetPrice] = useState('5000');
  const [socialMeetPrice, setSocialMeetPrice] = useState('2000');
  const [bio, setBio] = useState('');
  const [rules, setRules] = useState('');

  const handleSave = async () => {
    const auth = getAuth(getApp());
    if (!auth.currentUser) {
      Alert.alert('Błąd', 'Musisz być zalogowany');
      return;
    }

    if (!realMeetEnabled && !socialMeetEnabled) {
      Alert.alert('Błąd', 'Musisz włączyć przynajmniej jeden typ spotkań');
      return;
    }

    const realPrice = parseInt(realMeetPrice);
    const socialPrice = parseInt(socialMeetPrice);

    if (realMeetEnabled && (realPrice < MEET_CONFIG.REAL_MEET.MIN_PRICE || realPrice > MEET_CONFIG.REAL_MEET.MAX_PRICE)) {
      Alert.alert(
        'Błąd',
        `Real Meet: cena musi być między ${MEET_CONFIG.REAL_MEET.MIN_PRICE} a ${MEET_CONFIG.REAL_MEET.MAX_PRICE} tokenów`
      );
      return;
    }

    if (socialMeetEnabled && (socialPrice < MEET_CONFIG.SOCIAL_MEET.MIN_PRICE || socialPrice > MEET_CONFIG.SOCIAL_MEET.MAX_PRICE)) {
      Alert.alert(
        'Błąd',
        `Social Meet: cena musi być między ${MEET_CONFIG.SOCIAL_MEET.MIN_PRICE} a ${MEET_CONFIG.SOCIAL_MEET.MAX_PRICE} tokenów`
      );
      return;
    }

    if (!bio.trim()) {
      Alert.alert('Błąd', 'Opis nie może być pusty');
      return;
    }

    if (!rules.trim()) {
      Alert.alert('Błąd', 'Zasady nie mogą być puste');
      return;
    }

    setSaving(true);
    try {
      const functions = getFunctions(getApp());
      const createProfileFunc = httpsCallable(functions, 'meet_createProfile');
      
      const result = await createProfileFunc({
        realMeetEnabled,
        socialMeetEnabled,
        realMeetPrice: realPrice,
        socialMeetPrice: socialPrice,
        bio: bio.trim(),
        rules: rules.trim(),
      });

      const data = result.data as { success: boolean; profileId?: string; error?: string };
      
      if (data.success) {
        Alert.alert(
          'Sukces!',
          'Twój profil Meet został utworzony',
          [
            {
              text: 'OK',
              onPress: () => router.back(),
            },
          ]
        );
      } else {
        Alert.alert('Błąd', data.error || 'Nie udało się utworzyć profilu');
      }
    } catch (error: any) {
      Alert.alert('Błąd', error.message || 'Wystąpił błąd podczas tworzenia profilu');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <Text style={styles.title}>Utwórz Profil Meet</Text>
        <Text style={styles.subtitle}>
          Zarabiaj na spotkaniach offline i online
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Typ spotkań</Text>
        
        <View style={styles.toggleContainer}>
          <View style={styles.toggleItem}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>Real Meet (Spotkanie fizyczne)</Text>
              <Text style={styles.toggleDescription}>
                {MEET_CONFIG.REAL_MEET.MIN_PRICE} - {MEET_CONFIG.REAL_MEET.MAX_PRICE} tokenów
              </Text>
            </View>
            <Switch
              value={realMeetEnabled}
              onValueChange={setRealMeetEnabled}
              trackColor={{ false: '#2A2A2A', true: '#40E0D0' }}
              thumbColor="#FFFFFF"
            />
          </View>
          {realMeetEnabled && (
            <TextInput
              style={styles.priceInput}
              placeholder="Cena Real Meet"
              placeholderTextColor="#666666"
              value={realMeetPrice}
              onChangeText={setRealMeetPrice}
              keyboardType="numeric"
            />
          )}
        </View>

        <View style={styles.toggleContainer}>
          <View style={styles.toggleItem}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>Social Meet (Online)</Text>
              <Text style={styles.toggleDescription}>
                {MEET_CONFIG.SOCIAL_MEET.MIN_PRICE} - {MEET_CONFIG.SOCIAL_MEET.MAX_PRICE} tokenów
              </Text>
            </View>
            <Switch
              value={socialMeetEnabled}
              onValueChange={setSocialMeetEnabled}
              trackColor={{ false: '#2A2A2A', true: '#40E0D0' }}
              thumbColor="#FFFFFF"
            />
          </View>
          {socialMeetEnabled && (
            <TextInput
              style={styles.priceInput}
              placeholder="Cena Social Meet"
              placeholderTextColor="#666666"
              value={socialMeetPrice}
              onChangeText={setSocialMeetPrice}
              keyboardType="numeric"
            />
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Opis</Text>
        <TextInput
          style={styles.textArea}
          placeholder="Opisz siebie i co oferujesz..."
          placeholderTextColor="#666666"
          value={bio}
          onChangeText={setBio}
          multiline
          numberOfLines={4}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Zasady</Text>
        <TextInput
          style={styles.textArea}
          placeholder="Twoje zasady spotkań..."
          placeholderTextColor="#666666"
          value={rules}
          onChangeText={setRules}
          multiline
          numberOfLines={4}
        />
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>💰 Monetyzacja</Text>
        <Text style={styles.infoText}>
          • Zarabiasz 80% z każdego spotkania{'\n'}
          • Avalo pobiera 20% prowizji{'\n'}
          • Płatność 100% z góry od gościa{'\n'}
          • Środki w escrow do zakończenia{'\n'}
          • Automatyczne rozliczenie po 12h
        </Text>
      </View>

      <View style={styles.warningBox}>
        <Text style={styles.warningTitle}>⚠️ Wymagania</Text>
        <Text style={styles.warningText}>
          • Profil ukończony i zweryfikowany{'\n'}
          • Weryfikacja KYC + selfie live{'\n'}
          • Wiek 18+{'\n'}
          • Status konta: aktywny
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#0A0A0A" />
        ) : (
          <Text style={styles.saveButtonText}>Zapisz profil</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  contentContainer: {
    paddingBottom: 40,
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#1A1A1A',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#A0A0A0',
  },
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  toggleContainer: {
    marginBottom: 20,
  },
  toggleItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#1A1A1A',
  },
  toggleInfo: {
    flex: 1,
    marginRight: 16,
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  toggleDescription: {
    fontSize: 14,
    color: '#A0A0A0',
  },
  priceInput: {
    marginTop: 12,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#0A0A0A',
    color: '#FFFFFF',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  textArea: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#1A1A1A',
    color: '#FFFFFF',
    fontSize: 16,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  infoBox: {
    margin: 20,
    marginTop: 0,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#1A2A1A',
    borderWidth: 1,
    borderColor: '#40E0D0',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#40E0D0',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#D0D0D0',
    lineHeight: 22,
  },
  warningBox: {
    margin: 20,
    marginTop: 0,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#2A1A1A',
    borderWidth: 1,
    borderColor: '#FF6B6B',
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FF6B6B',
    marginBottom: 8,
  },
  warningText: {
    fontSize: 14,
    color: '#D0D0D0',
    lineHeight: 22,
  },
  saveButton: {
    margin: 20,
    marginTop: 0,
    padding: 18,
    borderRadius: 18,
    backgroundColor: '#40E0D0',
    alignItems: 'center',
    shadowColor: '#40E0D0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0A0A0A',
  },
});
