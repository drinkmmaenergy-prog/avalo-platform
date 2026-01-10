import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

type LegalCaseCardProps = {
  caseId: string;
  category: string;
  severity: string;
  status: 'open' | 'closed' | 'pending';
  createdAt: Date;
  onRequestExport?: () => void;
};

const LegalCaseCard: React.FC<LegalCaseCardProps> = ({
  caseId,
  category,
  severity,
  status,
  createdAt,
  onRequestExport
}) => {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Case #{caseId}</Text>
      <Text>Category: {category}</Text>
      <Text>Severity: {severity}</Text>
      <Text>Status: {status}</Text>
      <Text>Created: {createdAt.toDateString()}</Text>

      {onRequestExport && (
        <TouchableOpacity style={styles.exportButton} onPress={onRequestExport}>
          <Text style={styles.exportText}>Request Export</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ccc',
    marginBottom: 12,
    backgroundColor: '#fff'
  },
  title: {
    fontWeight: '600',
    marginBottom: 6,
    fontSize: 16
  },
  exportButton: {
    marginTop: 8,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#007bff',
    alignItems: 'center'
  },
  exportText: {
    color: '#fff',
    fontWeight: '500'
  }
});

export default LegalCaseCard;
