/**
 * PACK 145 - Campaign Creation Screen
 * Ethical ad creation with safety guardrails
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getFunctions, httpsCallable } from 'firebase/functions';

const CONTENT_TYPES = [
  { value: 'product', label: 'Product' },
  { value: 'club', label: 'Club' },
  { value: 'challenge', label: 'Challenge' },
  { value: 'event', label: 'Event' },
  { value: 'mentorship', label: 'Mentorship' },
  { value: 'digital_good', label: 'Digital Good' },
  { value: 'service', label: 'Service' },
];

const CALL_TO_ACTIONS = [
  { value: 'buy', label: 'Buy' },
  { value: 'learn_more', label: 'Learn More' },
  { value: 'join_event', label: 'Join Event' },
  { value: 'view_product', label: 'View Product' },
  { value: 'book_session', label: 'Book Session' },
  { value: 'join_club', label: 'Join Club' },
];

const BILLING_MODELS = [
  { value: 'cpc', label: 'CPC (Cost per Click)' },
  { value: 'cpm', label: 'CPM (Cost per 1000 Impressions)' },
  { value: 'cpv', label: 'CPV (Cost per View)' },
  { value: 'cpa', label: 'CPA (Cost per Conversion)' },
];

const PLACEMENT_SURFACES = [
  { value: 'feed', label: 'Feed' },
  { value: 'discovery', label: 'Discovery' },
  { value: 'club', label: 'Clubs' },
  { value: 'event_recommendations', label: 'Event Recommendations' },
];

interface SelectModalProps {
  visible: boolean;
  onClose: () => void;
  options: Array<{ value: string; label: string }>;
  value: string;
  onSelect: (value: string) => void;
  title: string;
}

const SelectModal: React.FC<SelectModalProps> = ({
  visible,
  onClose,
  options,
  value,
  onSelect,
  title,
}) => {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#64748b" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={options}
            keyExtractor={(item) => item.value}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.modalOption,
                  item.value === value && styles.modalOptionSelected,
                ]}
                onPress={() => {
                  onSelect(item.value);
                  onClose();
                }}
              >
                <Text
                  style={[
                    styles.modalOptionText,
                    item.value === value && styles.modalOptionTextSelected,
                  ]}
                >
                  {item.label}
                </Text>
                {item.value === value && (
                  <Ionicons name="checkmark" size={20} color="#007AFF" />
                )}
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  );
};

export default function CreateCampaign() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [contentType, setContentType] = useState('product');
  const [targetContentId, setTargetContentId] = useState('');
  const [callToAction, setCallToAction] = useState('buy');
  const [billingModel, setBillingModel] = useState('cpc');
  const [bidAmount, setBidAmount] = useState('0.10');
  const [totalBudget, setTotalBudget] = useState('100');
  const [dailyBudget, setDailyBudget] = useState('10');
  const [interests, setInterests] = useState('');
  const [purchaseIntent, setPurchaseIntent] = useState('');
  const [selectedPlacements, setSelectedPlacements] = useState<string[]>(['feed']);
  const [loading, setLoading] = useState(false);
  
  const [showContentTypeModal, setShowContentTypeModal] = useState(false);
  const [showCTAModal, setShowCTAModal] = useState(false);
  const [showBillingModal, setShowBillingModal] = useState(false);

  const functions = getFunctions();

  const togglePlacement = (placement: string) => {
    if (selectedPlacements.includes(placement)) {
      setSelectedPlacements(selectedPlacements.filter(p => p !== placement));
    } else {
      setSelectedPlacements([...selectedPlacements, placement]);
    }
  };

  const validateForm = (): boolean => {
    if (!name.trim()) {
      Alert.alert('Error', 'Campaign name is required');
      return false;
    }

    if (!description.trim()) {
      Alert.alert('Error', 'Description is required');
      return false;
    }

    if (!targetContentId.trim()) {
      Alert.alert('Error', 'Target content ID is required');
      return false;
    }

    const bid = parseFloat(bidAmount);
    if (isNaN(bid) || bid < 0.01 || bid > 10) {
      Alert.alert('Error', 'Bid amount must be between $0.01 and $10.00');
      return false;
    }

    const budget = parseFloat(totalBudget);
    if (isNaN(budget) || budget < 10 || budget > 100000) {
      Alert.alert('Error', 'Total budget must be between $10 and $100,000');
      return false;
    }

    const daily = parseFloat(dailyBudget);
    if (isNaN(daily) || daily < 1 || daily > budget) {
      Alert.alert('Error', 'Daily budget must be between $1 and total budget');
      return false;
    }

    if (selectedPlacements.length === 0) {
      Alert.alert('Error', 'Select at least one placement surface');
      return false;
    }

    return true;
  };

  const createCampaign = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      const createAdCampaign = httpsCallable(functions, 'createAdCampaign');
      
      const result = await createAdCampaign({
        name: name.trim(),
        description: description.trim(),
        contentType,
        targetContentId: targetContentId.trim(),
        callToAction,
        billing: {
          model: billingModel,
          bidAmount: parseFloat(bidAmount),
          currency: 'USD',
        },
        budget: {
          totalBudget: parseFloat(totalBudget),
          dailyBudget: parseFloat(dailyBudget),
          currency: 'USD',
        },
        targeting: {
          interests: interests.split(',').map(i => i.trim()).filter(i => i),
          purchaseIntent: purchaseIntent.split(',').map(i => i.trim()).filter(i => i),
        },
        placements: selectedPlacements,
        schedule: {
          startDate: new Date(),
          alwaysOn: true,
          timezone: 'UTC',
        },
      });

      const data = result.data as any;

      if (data.success) {
        Alert.alert(
          'Success',
          'Campaign created successfully! It will be reviewed before going live.',
          [{ text: 'OK', onPress: () => router.back() }]
        );
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create campaign');
    } finally {
      setLoading(false);
    }
  };

  const getLabel = (options: Array<{ value: string; label: string }>, value: string) => {
    return options.find(o => o.value === value)?.label || value;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#1e293b" />
        </TouchableOpacity>
        <Text style={styles.title}>Create Campaign</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scrollView}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Basic Information</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Campaign Name *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g., Summer Product Launch"
              maxLength={100}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Description *</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Describe your campaign (no romantic or NSFW content)"
              multiline
              numberOfLines={4}
              maxLength={500}
            />
            <Text style={styles.hint}>
              ⚠️ No dating, romance, sexual, or manipulative content allowed
            </Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Content Type *</Text>
            <TouchableOpacity
              style={styles.selectButton}
              onPress={() => setShowContentTypeModal(true)}
            >
              <Text style={styles.selectButtonText}>
                {getLabel(CONTENT_TYPES, contentType)}
              </Text>
              <Ionicons name="chevron-down" size={20} color="#64748b" />
            </TouchableOpacity>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Target Content ID *</Text>
            <TextInput
              style={styles.input}
              value={targetContentId}
              onChangeText={setTargetContentId}
              placeholder="ID of product/event/club to promote"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Call to Action *</Text>
            <TouchableOpacity
              style={styles.selectButton}
              onPress={() => setShowCTAModal(true)}
            >
              <Text style={styles.selectButtonText}>
                {getLabel(CALL_TO_ACTIONS, callToAction)}
              </Text>
              <Ionicons name="chevron-down" size={20} color="#64748b" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Budget & Billing</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Billing Model *</Text>
            <TouchableOpacity
              style={styles.selectButton}
              onPress={() => setShowBillingModal(true)}
            >
              <Text style={styles.selectButtonText}>
                {getLabel(BILLING_MODELS, billingModel)}
              </Text>
              <Ionicons name="chevron-down" size={20} color="#64748b" />
            </TouchableOpacity>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Bid Amount (USD) *</Text>
            <TextInput
              style={styles.input}
              value={bidAmount}
              onChangeText={setBidAmount}
              placeholder="0.10"
              keyboardType="decimal-pad"
            />
            <Text style={styles.hint}>Between $0.01 and $10.00</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Total Budget (USD) *</Text>
            <TextInput
              style={styles.input}
              value={totalBudget}
              onChangeText={setTotalBudget}
              placeholder="100"
              keyboardType="decimal-pad"
            />
            <Text style={styles.hint}>Between $10 and $100,000</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Daily Budget (USD) *</Text>
            <TextInput
              style={styles.input}
              value={dailyBudget}
              onChangeText={setDailyBudget}
              placeholder="10"
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ethical Targeting</Text>
          <Text style={styles.sectionSubtitle}>
            Only allowed: interests, purchase intent, engagement level
          </Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Interests (comma-separated)</Text>
            <TextInput
              style={styles.input}
              value={interests}
              onChangeText={setInterests}
              placeholder="e.g., fitness, photography, cooking"
            />
            <Text style={styles.hint}>
              ✅ Allowed: fitness, photography, tech, business, etc.
            </Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Purchase Intent (comma-separated)</Text>
            <TextInput
              style={styles.input}
              value={purchaseIntent}
              onChangeText={setPurchaseIntent}
              placeholder="e.g., digital_products, courses"
            />
            <Text style={styles.hint}>
              ✅ Allowed: digital_products, courses, mentorship, etc.
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Placement Surfaces</Text>
          
          {PLACEMENT_SURFACES.map(surface => (
            <TouchableOpacity
              key={surface.value}
              style={styles.checkboxRow}
              onPress={() => togglePlacement(surface.value)}
            >
              <Ionicons
                name={selectedPlacements.includes(surface.value) ? 'checkbox' : 'square-outline'}
                size={24}
                color={selectedPlacements.includes(surface.value) ? '#007AFF' : '#94a3b8'}
              />
              <Text style={styles.checkboxLabel}>{surface.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.warningBox}>
          <Ionicons name="shield-checkmark" size={24} color="#10b981" />
          <View style={styles.warningContent}>
            <Text style={styles.warningTitle}>Safety Guardrails Active</Text>
            <Text style={styles.warningText}>
              • No dating/romance/NSFW content{'\n'}
              • No exploitative targeting{'\n'}
              • No visibility advantage outside paid placements{'\n'}
              • Ads clearly labeled as "Sponsored"
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.createButton, loading && styles.createButtonDisabled]}
          onPress={createCampaign}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="rocket" size={20} color="#fff" />
              <Text style={styles.createButtonText}>Create Campaign</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      <SelectModal
        visible={showContentTypeModal}
        onClose={() => setShowContentTypeModal(false)}
        options={CONTENT_TYPES}
        value={contentType}
        onSelect={setContentType}
        title="Select Content Type"
      />

      <SelectModal
        visible={showCTAModal}
        onClose={() => setShowCTAModal(false)}
        options={CALL_TO_ACTIONS}
        value={callToAction}
        onSelect={setCallToAction}
        title="Select Call to Action"
      />

      <SelectModal
        visible={showBillingModal}
        onClose={() => setShowBillingModal(false)}
        options={BILLING_MODELS}
        value={billingModel}
        onSelect={setBillingModel}
        title="Select Billing Model"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  scrollView: {
    flex: 1,
  },
  section: {
    backgroundColor: '#fff',
    padding: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#1e293b',
    backgroundColor: '#fff',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  hint: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  selectButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#fff',
  },
  selectButtonText: {
    fontSize: 16,
    color: '#1e293b',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  checkboxLabel: {
    fontSize: 16,
    color: '#1e293b',
    marginLeft: 12,
  },
  warningBox: {
    flexDirection: 'row',
    backgroundColor: '#f0fdf4',
    padding: 16,
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  warningContent: {
    flex: 1,
    marginLeft: 12,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#166534',
    marginBottom: 4,
  },
  warningText: {
    fontSize: 14,
    color: '#15803d',
    lineHeight: 20,
  },
  createButton: {
    flexDirection: 'row',
    backgroundColor: '#007AFF',
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  modalOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  modalOptionSelected: {
    backgroundColor: '#eff6ff',
  },
  modalOptionText: {
    fontSize: 16,
    color: '#1e293b',
  },
  modalOptionTextSelected: {
    color: '#007AFF',
    fontWeight: '600',
  },
});
