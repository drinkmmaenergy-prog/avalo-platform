/**
 * PACK 395 - Invoices Screen
 * Displays user's purchase invoices
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Share,
  Platform
} from 'react-native';
import { useAuth } from "@/context/AuthContext";
import { functions } from "@/lib/firebase";
import { Ionicons } from '@expo/vector-icons';

interface Invoice {
  id: string;
  invoiceNumber: string;
  transactionId: string;
  purchaseType: string;
  grossAmount: number;
  netAmount: number;
  taxAmount: number;
  taxType: string;
  currency: string;
  createdAt: any;
  pdfUrl?: string;
}

export default function InvoicesScreen() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadInvoices();
  }, []);

  const loadInvoices = async () => {
    if (!user) return;

    try {
      const getUserInvoices = functions.httpsCallable('getUserInvoices');
      const result = await getUserInvoices({ limit: 50 });
      setInvoices(result.data.invoices || []);
    } catch (error) {
      console.error('Error loading invoices:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadInvoices();
  };

  const downloadInvoice = async (invoice: Invoice) => {
    // In production, would download PDF
    alert(`Invoice ${invoice.invoiceNumber} download would start here`);
  };

  const shareInvoice = async (invoice: Invoice) => {
    try {
      await Share.share({
        message: `Invoice ${invoice.invoiceNumber}\nAmount: ${invoice.grossAmount} ${invoice.currency}\nDate: ${formatDate(invoice.createdAt)}`,
        title: `Invoice ${invoice.invoiceNumber}`
      });
    } catch (error) {
      console.error('Error sharing invoice:', error);
    }
  };

  const emailInvoice = async (invoice: Invoice) => {
    try {
      const emailInvoiceToUser = functions.httpsCallable('emailInvoiceToUser');
      await emailInvoiceToUser({ invoiceId: invoice.id });
      alert('Invoice sent to your email');
    } catch (error) {
      console.error('Error emailing invoice:', error);
      alert('Failed to send invoice');
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const renderInvoiceItem = ({ item }: { item: Invoice }) => (
    <View style={styles.invoiceCard}>
      <View style={styles.invoiceHeader}>
        <View style={styles.invoiceInfo}>
          <Text style={styles.invoiceNumber}>{item.invoiceNumber}</Text>
          <Text style={styles.invoiceType}>
            {item.purchaseType.charAt(0).toUpperCase() + item.purchaseType.slice(1)}
          </Text>
        </View>
        <View style={styles.invoiceAmount}>
          <Text style={styles.amount}>
            {item.grossAmount.toFixed(2)} {item.currency}
          </Text>
          <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
        </View>
      </View>

      <View style={styles.invoiceDetails}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Net Amount:</Text>
          <Text style={styles.detailValue}>
            {item.netAmount.toFixed(2)} {item.currency}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>{item.taxType}:</Text>
          <Text style={styles.detailValue}>
            {item.taxAmount.toFixed(2)} {item.currency}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Transaction ID:</Text>
          <Text style={styles.detailValue} numberOfLines={1}>
            {item.transactionId}
          </Text>
        </View>
      </View>

      <View style={styles.invoiceActions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => downloadInvoice(item)}
        >
          <Ionicons name="download-outline" size={20} color="#007AFF" />
          <Text style={styles.actionText}>Download</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => emailInvoice(item)}
        >
          <Ionicons name="mail-outline" size={20} color="#007AFF" />
          <Text style={styles.actionText}>Email</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => shareInvoice(item)}
        >
          <Ionicons name="share-outline" size={20} color="#007AFF" />
          <Text style={styles.actionText}>Share</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading invoices...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Invoices</Text>
        <Text style={styles.subtitle}>
          All your purchase invoices in one place
        </Text>
      </View>

      {invoices.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="document-text-outline" size={64} color="#999" />
          <Text style={styles.emptyText}>No invoices yet</Text>
          <Text style={styles.emptySubtext}>
            Your purchase invoices will appear here
          </Text>
        </View>
      ) : (
        <FlatList
          data={invoices}
          renderItem={renderInvoiceItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7'
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F7'
  },
  header: {
    padding: 20,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA'
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000',
    marginBottom: 4
  },
  subtitle: {
    fontSize: 14,
    color: '#666'
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666'
  },
  listContent: {
    padding: 16
  },
  invoiceCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  invoiceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0'
  },
  invoiceInfo: {
    flex: 1
  },
  invoiceNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4
  },
  invoiceType: {
    fontSize: 14,
    color: '#666'
  },
  invoiceAmount: {
    alignItems: 'flex-end'
  },
  amount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    marginBottom: 2
  },
  date: {
    fontSize: 12,
    color: '#999'
  },
  invoiceDetails: {
    marginBottom: 12
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  detailLabel: {
    fontSize: 14,
    color: '#666'
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#000',
    flex: 1,
    textAlign: 'right',
    marginLeft: 12
  },
  invoiceActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0'
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8
  },
  actionText: {
    fontSize: 14,
    color: '#007AFF',
    marginLeft: 6,
    fontWeight: '500'
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
    marginBottom: 8
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center'
  }
});

