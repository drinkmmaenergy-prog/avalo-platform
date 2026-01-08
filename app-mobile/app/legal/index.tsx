import { getLegalDoc } from '@/shared/legal/legalRegistry';
/**
 * PACK 338a - Legal Documents List
 * Entry point for viewing legal policies
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LEGAL_DOCS, getAllLegalDocKeys, type LegalDocKey } from "@/shared/legal/legalRegistry";

export default function LegalScreen() {
  const router = useRouter();
  const [lang] = React.useState<'en' | 'pl'>('en'); // TODO: detect from device locale

  const legalDocs = getAllLegalDocKeys();

  const handleDocPress = (docKey: LegalDocKey) => {
    router.push(`/legal/${docKey}` as any);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Legal & Policies</Text>
      </View>

      <ScrollView style={styles.content}>
        <Text style={styles.subtitle}>
          Review our legal documents and community policies
        </Text>

        {legalDocs.map((docKey) => {
          const doc = LEGAL_DOCS[docKey][lang];
          return (
            <TouchableOpacity
              key={docKey}
              style={styles.docItem}
              onPress={() => handleDocPress(docKey)}
            >
              <View style={styles.docContent}>
                <View style={styles.docIcon}>
                  <Ionicons name="document-text-outline" size={24} color="#FF3B5C" />
                </View>
                <View style={styles.docText}>
                  <Text style={styles.docTitle}>{doc.title}</Text>
                  <Text style={styles.docVersion}>Version {doc.version}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </TouchableOpacity>
          );
        })}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Last updated: December 13, 2024
          </Text>
          <Text style={styles.footerText}>
            Have questions? Contact legal@avalo.app
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    padding: 16,
    paddingBottom: 8,
  },
  docItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  docContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  docIcon: {
    marginRight: 12,
  },
  docText: {
    flex: 1,
  },
  docTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  docVersion: {
    fontSize: 12,
    color: '#999',
  },
  footer: {
    padding: 16,
    paddingTop: 32,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#999',
    marginBottom: 8,
    textAlign: 'center',
  },
});






