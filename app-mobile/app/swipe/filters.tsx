import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';

export default function SwipeFiltersScreen() {
  const [ageRange, setAgeRange] = useState<[number, number]>([18, 35]);
  const [distance, setDistance] = useState(50);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [nsfwFilter, setNsfwFilter] = useState<string[]>(['safe', 'soft']);

  const handleApply = () => {
    // Save filters to local storage or state management
    // For now, just go back
    router.back();
  };

  const handleReset = () => {
    setAgeRange([18, 35]);
    setDistance(50);
    setVerifiedOnly(false);
    setNsfwFilter(['safe', 'soft']);
  };

  const toggleNsfwFilter = (level: string) => {
    if (nsfwFilter.includes(level)) {
      setNsfwFilter(nsfwFilter.filter(l => l !== level));
    } else {
      setNsfwFilter([...nsfwFilter, level]);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Filters</Text>
        <TouchableOpacity onPress={handleReset}>
          <Text style={styles.resetButton}>Reset</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Age Range */}
        <View style={styles.filterSection}>
          <Text style={styles.sectionTitle}>Age Range</Text>
          <View style={styles.rangeDisplay}>
            <Text style={styles.rangeValue}>{ageRange[0]}</Text>
            <Text style={styles.rangeSeparator}>—</Text>
            <Text style={styles.rangeValue}>{ageRange[1]}</Text>
          </View>
          <View style={styles.sliderContainer}>
            <Slider
              style={styles.slider}
              minimumValue={18}
              maximumValue={80}
              step={1}
              value={ageRange[0]}
              onValueChange={(value) => setAgeRange([value, ageRange[1]])}
              minimumTrackTintColor="#ff4458"
              maximumTrackTintColor="#e0e0e0"
              thumbTintColor="#ff4458"
            />
            <Slider
              style={styles.slider}
              minimumValue={18}
              maximumValue={80}
              step={1}
              value={ageRange[1]}
              onValueChange={(value) => setAgeRange([ageRange[0], value])}
              minimumTrackTintColor="#ff4458"
              maximumTrackTintColor="#e0e0e0"
              thumbTintColor="#ff4458"
            />
          </View>
        </View>

        {/* Distance */}
        <View style={styles.filterSection}>
          <Text style={styles.sectionTitle}>Maximum Distance</Text>
          <View style={styles.rangeDisplay}>
            <Text style={styles.rangeValue}>{distance} km</Text>
          </View>
          <Slider
            style={styles.slider}
            minimumValue={5}
            maximumValue={200}
            step={5}
            value={distance}
            onValueChange={setDistance}
            minimumTrackTintColor="#ff4458"
            maximumTrackTintColor="#e0e0e0"
            thumbTintColor="#ff4458"
          />
        </View>

        {/* Verified Only */}
        <View style={styles.filterSection}>
          <View style={styles.switchRow}>
            <View>
              <Text style={styles.switchLabel}>Verified profiles only</Text>
              <Text style={styles.switchSubtext}>
                Only show users with verified badges
              </Text>
            </View>
            <Switch
              value={verifiedOnly}
              onValueChange={setVerifiedOnly}
              trackColor={{ false: '#e0e0e0', true: '#ff4458' }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* NSFW Content */}
        <View style={styles.filterSection}>
          <Text style={styles.sectionTitle}>Content Preferences</Text>
          <Text style={styles.sectionSubtext}>
            Choose what types of content you're comfortable seeing
          </Text>
          
          <View style={styles.nsfwOptions}>
            <TouchableOpacity
              style={[
                styles.nsfwOption,
                nsfwFilter.includes('safe') && styles.nsfwOptionActive,
              ]}
              onPress={() => toggleNsfwFilter('safe')}
            >
              <Ionicons
                name={nsfwFilter.includes('safe') ? 'checkmark-circle' : 'ellipse-outline'}
                size={24}
                color={nsfwFilter.includes('safe') ? '#00d68f' : '#999'}
              />
              <View>
                <Text style={styles.nsfwOptionLabel}>Safe</Text>
                <Text style={styles.nsfwOptionDesc}>Family-friendly content</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.nsfwOption,
                nsfwFilter.includes('soft') && styles.nsfwOptionActive,
              ]}
              onPress={() => toggleNsfwFilter('soft')}
            >
              <Ionicons
                name={nsfwFilter.includes('soft') ? 'checkmark-circle' : 'ellipse-outline'}
                size={24}
                color={nsfwFilter.includes('soft') ? '#00d68f' : '#999'}
              />
              <View>
                <Text style={styles.nsfwOptionLabel}>Soft</Text>
                <Text style={styles.nsfwOptionDesc}>Mildly suggestive</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.nsfwOption,
                nsfwFilter.includes('erotic') && styles.nsfwOptionActive,
              ]}
              onPress={() => toggleNsfwFilter('erotic')}
            >
              <Ionicons
                name={nsfwFilter.includes('erotic') ? 'checkmark-circle' : 'ellipse-outline'}
                size={24}
                color={nsfwFilter.includes('erotic') ? '#00d68f' : '#999'}
              />
              <View>
                <Text style={styles.nsfwOptionLabel}>Erotic</Text>
                <Text style={styles.nsfwOptionDesc}>Adult content (18+)</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Info Box */}
        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={20} color="#4A90E2" />
          <Text style={styles.infoText}>
            These filters help you find better matches. You can change them anytime.
          </Text>
        </View>
      </ScrollView>

      {/* Apply Button */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.applyButton} onPress={handleApply}>
          <Text style={styles.applyButtonText}>Apply Filters</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
  },
  resetButton: {
    color: '#ff4458',
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  filterSection: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  sectionSubtext: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  rangeDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 16,
  },
  rangeValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ff4458',
  },
  rangeSeparator: {
    fontSize: 24,
    color: '#999',
  },
  sliderContainer: {
    gap: 8,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
  },
  switchLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  switchSubtext: {
    fontSize: 12,
    color: '#666',
  },
  nsfwOptions: {
    gap: 12,
  },
  nsfwOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e0e0e0',
  },
  nsfwOptionActive: {
    borderColor: '#00d68f',
    backgroundColor: '#e8f9f3',
  },
  nsfwOptionLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  nsfwOptionDesc: {
    fontSize: 12,
    color: '#666',
  },
  infoBox: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#e8f4fd',
    padding: 16,
    borderRadius: 12,
    marginTop: 20,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#4A90E2',
    lineHeight: 20,
  },
  footer: {
    padding: 20,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  applyButton: {
    backgroundColor: '#ff4458',
    paddingVertical: 16,
    borderRadius: 24,
    alignItems: 'center',
  },
  applyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
