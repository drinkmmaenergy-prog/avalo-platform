/**
 * PACK 156: Compliance Education Screen
 * Required education modules for policy violations
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert
} from 'react-native';
import { Stack, router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { auth } from "@/lib/firebase";

interface EducationModule {
  id: string;
  title: string;
  description: string;
  content: string[];
  completed: boolean;
}

export default function ComplianceEducationScreen() {
  const [userId, setUserId] = useState<string | null>(null);
  const [modules, setModules] = useState<EducationModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedModule, setSelectedModule] = useState<EducationModule | null>(null);

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (currentUser) {
      setUserId(currentUser.uid);
    }
  }, []);

  useEffect(() => {
    loadEducationModules();
  }, [userId]);

  const loadEducationModules = async () => {
    if (!userId) return;

    setLoading(true);
    try {
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/compliance/education/${userId}`
      );
      const data = await response.json();
      setModules(data.modules || []);
    } catch (error) {
      console.error('Failed to load education modules:', error);
    } finally {
      setLoading(false);
    }
  };

  const completeModule = async (moduleId: string) => {
    if (!userId) return;

    try {
      await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/compliance/education/${userId}/complete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ moduleId })
        }
      );

      const updatedModules = modules.map(m =>
        m.id === moduleId ? { ...m, completed: true } : m
      );
      setModules(updatedModules);
      setSelectedModule(null);

      const allComplete = updatedModules.every(m => m.completed);
      if (allComplete) {
        Alert.alert(
          'Education Complete',
          'You have completed all required education modules. Your account restrictions may be lifted.',
          [{ text: 'OK', onPress: () => router.back() }]
        );
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to mark module as complete');
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: 'Compliance Education' }} />
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (selectedModule) {
    return (
      <View style={styles.container}>
        <Stack.Screen
          options={{
            title: selectedModule.title,
            headerBackTitle: 'Back'
          }}
        />
        
        <ScrollView style={styles.moduleContent}>
          <Text style={styles.moduleDescription}>
            {selectedModule.description}
          </Text>

          {selectedModule.content.map((section, index) => (
            <View key={index} style={styles.section}>
              <Text style={styles.sectionText}>{section}</Text>
            </View>
          ))}

          {!selectedModule.completed && (
            <TouchableOpacity
              style={styles.completeButton}
              onPress={() => completeModule(selectedModule.id)}
            >
              <MaterialIcons name="check-circle" size={20} color="#fff" />
              <Text style={styles.completeButtonText}>
                Mark as Complete
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.backButton}
            onPress={() => setSelectedModule(null)}
          >
            <Text style={styles.backButtonText}>Back to Modules</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Compliance Education',
          headerBackTitle: 'Back'
        }}
      />

      <ScrollView style={styles.scrollView}>
        <View style={styles.header}>
          <MaterialIcons name="school" size={48} color="#007AFF" />
          <Text style={styles.headerTitle}>Required Education</Text>
          <Text style={styles.headerText}>
            Complete these modules to understand our community guidelines
          </Text>
          <View style={styles.progress}>
            <Text style={styles.progressText}>
              {modules.filter(m => m.completed).length} of {modules.length} completed
            </Text>
          </View>
        </View>

        {modules.map((module) => (
          <TouchableOpacity
            key={module.id}
            style={styles.moduleCard}
            onPress={() => setSelectedModule(module)}
          >
            <View style={styles.moduleHeader}>
              <MaterialIcons
                name={module.completed ? 'check-circle' : 'circle'}
                size={24}
                color={module.completed ? '#4caf50' : '#ccc'}
              />
              <Text style={styles.moduleTitle}>{module.title}</Text>
            </View>
            <Text style={styles.moduleDesc} numberOfLines={2}>
              {module.description}
            </Text>
            <View style={styles.moduleFooter}>
              <Text style={styles.moduleAction}>
                {module.completed ? 'Review' : 'Start Module'}
              </Text>
              <MaterialIcons name="chevron-right" size={20} color="#007AFF" />
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5'
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  scrollView: {
    flex: 1
  },
  header: {
    padding: 24,
    backgroundColor: '#fff',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0'
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginTop: 12,
    color: '#333'
  },
  headerText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8
  },
  progress: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#e3f2fd',
    borderRadius: 16
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1976d2'
  },
  moduleCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2
  },
  moduleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8
  },
  moduleTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginLeft: 12,
    flex: 1
  },
  moduleDesc: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 12
  },
  moduleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  moduleAction: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF'
  },
  moduleContent: {
    flex: 1,
    padding: 16
  },
  moduleDescription: {
    fontSize: 16,
    color: '#333',
    lineHeight: 24,
    marginBottom: 24
  },
  section: {
    marginBottom: 20
  },
  sectionText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 22
  },
  completeButton: {
    backgroundColor: '#4caf50',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 8,
    marginTop: 24,
    gap: 8
  },
  completeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600'
  },
  backButton: {
    backgroundColor: '#f5f5f5',
    paddingVertical: 14,
    borderRadius: 8,
    marginTop: 12,
    alignItems: 'center'
  },
  backButtonText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600'
  }
});
