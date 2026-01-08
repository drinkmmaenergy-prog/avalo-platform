import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  Dimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../contexts/AuthContext';
import { getFirestore, doc, getDoc, updateDoc, increment, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { getTokenBalance } from '../../../services/tokenService';

const { width } = Dimensions.get('window');

interface Goal {
  id: string;
  creatorId: string;
  creatorName: string;
  title: string;
  description: string;
  category: string;
  targetTokens: number;
  currentTokens: number;
  status: 'active' | 'completed' | 'closed';
  topSupporters: Array<{
    uid: string;
    name: string;
    avatar?: string;
    amount: number;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

export default function GoalDetailScreen() {
  const router = useRouter();
  const { goalId } = useLocalSearchParams<{ goalId: string }>();
  const { user } = useAuth();
  const [goal, setGoal] = useState<Goal | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [supportAmount, setSupportAmount] = useState('');
  const [tokenBalance, setTokenBalance] = useState(0);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    loadGoalData();
    if (user?.uid) {
      loadTokenBalance();
    }
  }, [goalId, user?.uid]);

  const loadGoalData = async () => {
    if (!goalId) return;

    try {
      setLoading(true);
      const db = getFirestore();
      const goalRef = doc(db, 'creatorGoals', goalId);
      const goalSnap = await getDoc(goalRef);

      if (!goalSnap.exists()) {
        Alert.alert('Błąd', 'Cel nie został znaleziony');
        router.back();
        return;
      }

      const data = goalSnap.data();
      setGoal({
        id: goalSnap.id,
        ...data,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
      } as Goal);
    } catch (error) {
      console.error('Error loading goal:', error);
      Alert.alert('Błąd', 'Nie udało się załadować celu');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const loadTokenBalance = async () => {
    if (!user?.uid) return;
    try {
      const balance = await getTokenBalance(user.uid);
      setTokenBalance(balance);
    } catch (error) {
      console.error('Error loading token balance:', error);
    }
  };

  const handleSupportGoal = async () => {
    if (!user?.uid || !goal) return;

    const amount = parseInt(supportAmount);
    
    if (isNaN(amount) || amount < 10 || amount > 10000) {
      Alert.alert('Błąd', 'Wprowadź kwotę między 10 a 10000 tokenów');
      return;
    }

    if (amount > tokenBalance) {
      Alert.alert(
        'Niewystarczający balans',
        'Nie masz wystarczającej liczby tokenów. Czy chcesz doładować konto?',
        [
          { text: 'Anuluj', style: 'cancel' },
          { 
            text: 'Doładuj tokeny', 
            onPress: () => {
              setShowSupportModal(false);
              router.push('/(tabs)/wallet' as any);
            }
          },
        ]
      );
      return;
    }

    try {
      setProcessing(true);
      const db = getFirestore();
      const goalRef = doc(db, 'creatorGoals', goalId);

      // Get current user profile for supporter info
      const userRef = doc(db, 'profiles', user.uid);
      const userSnap = await getDoc(userRef);
      const userName = userSnap.exists() ? userSnap.data().name : 'Anonymous';

      // Update goal with support
      await updateDoc(goalRef, {
        currentTokens: increment(amount),
        topSupporters: arrayUnion({
          uid: user.uid,
          name: userName,
          amount,
          timestamp: serverTimestamp(),
        }),
        updatedAt: serverTimestamp(),
      });

      // Deduct tokens from user
      const walletRef = doc(db, 'balances', user.uid, 'wallet');
      await updateDoc(walletRef, {
        tokens: increment(-amount),
        lastUpdated: serverTimestamp(),
      });

      // Record transaction
      const { addDoc, collection } = await import('firebase/firestore');
      await addDoc(collection(db, 'transactions'), {
        senderUid: user.uid,
        receiverUid: goal.creatorId,
        tokensAmount: amount,
        avaloFee: Math.floor(amount * 0.2),
        transactionType: 'goal_support',
        goalId: goalId,
        createdAt: serverTimestamp(),
      });

      setShowSupportModal(false);
      setSupportAmount('');
      
      Alert.alert(
        'Sukces! 🎉',
        `Wsparłeś cel kwotą ${amount} tokenów!`,
        [{ text: 'OK', onPress: () => loadGoalData() }]
      );
      
      await loadTokenBalance();
    } catch (error) {
      console.error('Error supporting goal:', error);
      Alert.alert('Błąd', 'Nie udało się wesprzeć celu. Spróbuj ponownie.');
    } finally {
      setProcessing(false);
    }
  };

  const handleEditGoal = () => {
    // Navigate to edit screen (to be implemented)
    Alert.alert('Edycja celu', 'Funkcja edycji zostanie wkrótce dodana');
  };

  const handleCloseGoal = async () => {
    if (!user?.uid || !goal) return;

    Alert.alert(
      'Zamknij cel',
      'Czy na pewno chcesz zamknąć ten cel? Tej akcji nie można cofnąć.',
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Zamknij',
          style: 'destructive',
          onPress: async () => {
            try {
              const db = getFirestore();
              const goalRef = doc(db, 'creatorGoals', goalId);
              await updateDoc(goalRef, {
                status: 'closed',
                updatedAt: serverTimestamp(),
              });
              Alert.alert('Sukces', 'Cel został zamknięty', [
                { text: 'OK', onPress: () => router.back() }
              ]);
            } catch (error) {
              console.error('Error closing goal:', error);
              Alert.alert('Błąd', 'Nie udało się zamknąć celu');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#40E0D0" />
      </View>
    );
  }

  if (!goal) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Cel nie został znaleziony</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Wróć</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const progress = (goal.currentTokens / goal.targetTokens) * 100;
  const isCreator = user?.uid === goal.creatorId;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backIconButton} onPress={() => router.back()}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Cel twórcy</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Goal Info */}
        <View style={styles.goalCard}>
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryText}>{goal.category}</Text>
          </View>
          
          <Text style={styles.goalTitle}>{goal.title}</Text>
          <Text style={styles.goalDescription}>{goal.description}</Text>

          {/* Progress Bar */}
          <View style={styles.progressSection}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel}>Postęp</Text>
              <Text style={styles.progressPercentage}>{progress.toFixed(0)}%</Text>
            </View>
            <View style={styles.progressBarContainer}>
              <View style={[styles.progressBar, { width: `${Math.min(progress, 100)}%` }]} />
            </View>
            <View style={styles.tokensInfo}>
              <Text style={styles.tokensText}>
                {goal.currentTokens.toLocaleString()} / {goal.targetTokens.toLocaleString()} tokenów
              </Text>
            </View>
          </View>
        </View>

        {/* Top Supporters */}
        {goal.topSupporters && goal.topSupporters.length > 0 && (
          <View style={styles.supportersSection}>
            <Text style={styles.sectionTitle}>🏆 Najlepsi wspierający</Text>
            {goal.topSupporters
              .sort((a, b) => b.amount - a.amount)
              .slice(0, 10)
              .map((supporter, index) => (
                <View key={`${supporter.uid}-${index}`} style={styles.supporterItem}>
                  <View style={styles.supporterLeft}>
                    <View style={styles.supporterAvatar}>
                      <Text style={styles.supporterAvatarText}>
                        {supporter.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.supporterName}>{supporter.name}</Text>
                  </View>
                  <Text style={styles.supporterAmount}>{supporter.amount.toLocaleString()} 💎</Text>
                </View>
              ))}
          </View>
        )}
      </ScrollView>

      {/* Action Buttons */}
      <View style={styles.bottomBar}>
        {isCreator ? (
          <View style={styles.creatorActions}>
            <TouchableOpacity style={styles.editButton} onPress={handleEditGoal}>
              <Text style={styles.editButtonText}>✏️ Edytuj</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeButton} onPress={handleCloseGoal}>
              <Text style={styles.closeButtonText}>🔒 Zamknij cel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity 
            style={styles.supportButton} 
            onPress={() => setShowSupportModal(true)}
          >
            <Text style={styles.supportButtonText}>💎 Wesprzyj cel</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Support Modal */}
      <Modal
        visible={showSupportModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowSupportModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Wesprzyj cel</Text>
              <TouchableOpacity onPress={() => setShowSupportModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.balanceText}>
              Twój balans: {tokenBalance.toLocaleString()} tokenów
            </Text>

            <Text style={styles.inputLabel}>Kwota wsparcia (10-10000 tokenów)</Text>
            <TextInput
              style={styles.input}
              value={supportAmount}
              onChangeText={setSupportAmount}
              keyboardType="numeric"
              placeholder="Wprowadź kwotę"
              placeholderTextColor="#999"
            />

            {supportAmount && parseInt(supportAmount) > tokenBalance && (
              <TouchableOpacity 
                style={styles.rechargeButton}
                onPress={() => {
                  setShowSupportModal(false);
                  router.push('/(tabs)/wallet' as any);
                }}
              >
                <Text style={styles.rechargeButtonText}>⚡ Doładuj tokeny</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[
                styles.confirmButton,
                processing && styles.confirmButtonDisabled,
              ]}
              onPress={handleSupportGoal}
              disabled={processing}
            >
              {processing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.confirmButtonText}>Potwierdź wsparcie</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9F9F9',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9F9F9',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9F9F9',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#666',
    marginBottom: 20,
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: '#40E0D0',
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  backIconButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIcon: {
    fontSize: 28,
    color: '#333',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  goalCard: {
    margin: 16,
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(64, 224, 208, 0.1)',
    borderRadius: 12,
    marginBottom: 12,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#40E0D0',
  },
  goalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  goalDescription: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
    marginBottom: 24,
  },
  progressSection: {
    marginTop: 8,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  progressPercentage: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#40E0D0',
  },
  progressBarContainer: {
    height: 12,
    backgroundColor: '#F0F0F0',
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#40E0D0',
    borderRadius: 6,
  },
  tokensInfo: {
    marginTop: 8,
    alignItems: 'center',
  },
  tokensText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  supportersSection: {
    margin: 16,
    marginTop: 0,
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  supporterItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  supporterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  supporterAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#40E0D0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  supporterAvatarText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  supporterName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  supporterAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#40E0D0',
  },
  bottomBar: {
    padding: 20,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
  },
  creatorActions: {
    flexDirection: 'row',
    gap: 12,
  },
  editButton: {
    flex: 1,
    backgroundColor: '#40E0D0',
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
  },
  editButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  closeButton: {
    flex: 1,
    backgroundColor: '#FF6B6B',
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  supportButton: {
    backgroundColor: '#40E0D0',
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
  },
  supportButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
  },
  modalClose: {
    fontSize: 28,
    color: '#999',
  },
  balanceText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#40E0D0',
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#333',
    marginBottom: 16,
  },
  rechargeButton: {
    backgroundColor: '#FFE0B2',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  rechargeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF6B00',
  },
  confirmButton: {
    backgroundColor: '#40E0D0',
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    opacity: 0.6,
  },
  confirmButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
});