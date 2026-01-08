/**
 * PACK 435 — Global Events Engine: Mobile UI - Events Feed
 * 
 * Global events feed with filtering and discovery
 */

import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { router } from 'expo-router';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from "@/lib/firebase";

interface Event {
  eventId: string;
  title: string;
  type: string;
  description: string;
  coverImage?: string;
  city: string;
  startTime: Date;
  currentParticipants: number;
  maxParticipants: number;
  pricePerSeat: number;
  isFree: boolean;
}

export default function EventsFeedScreen() {
  const [events, setEvents] = useState<Event[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    // Subscribe to events
    let q = query(
      collection(db, 'events'),
      where('status', '==', 'published'),
      where('visibility', '==', 'public'),
      orderBy('startTime', 'asc'),
      limit(50)
    );
    
    if (filter !== 'all') {
      q = query(
        collection(db, 'events'),
        where('status', '==', 'published'),
        where('type', '==', filter),
        orderBy('startTime', 'asc'),
        limit(50)
      );
    }
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const eventsData = snapshot.docs.map(doc => ({
        eventId: doc.id,
        ...doc.data(),
        startTime: doc.data().startTime?.toDate(),
      })) as Event[];
      
      setEvents(eventsData);
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, [filter]);
  
  const renderEventCard = ({ item }: { item: Event }) => (
    <TouchableOpacity
      style={styles.eventCard}
      onPress={() => router.push(`/events/${item.eventId}`)}
    >
      {item.coverImage && (
        <Image source={{ uri: item.coverImage }} style={styles.coverImage} />
      )}
      
      <View style={styles.eventInfo}>
        <Text style={styles.eventTitle}>{item.title}</Text>
        <Text style={styles.eventType}>{formatEventType(item.type)}</Text>
        <Text style={styles.eventDesc} numberOfLines={2}>{item.description}</Text>
        
        <View style={styles.eventMeta}>
          <Text style={styles.location}>📍 {item.city}</Text>
          <Text style={styles.date}>📅 {formatDate(item.startTime)}</Text>
        </View>
        
        <View style={styles.eventFooter}>
          <Text style={styles.attendees}>
            {item.currentParticipants}/{item.maxParticipants} attending
          </Text>
          <Text style={styles.price}>
            {item.isFree ? 'FREE' : `$${item.pricePerSeat}`}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
  
  return (
    <View style={styles.container}>
      <Text style={styles.header}>Discover Events</Text>
      
      {/* Filter Tabs */}
      <View style={styles.filterTabs}>
        <FilterTab label="All" value="all" selected={filter} onPress={setFilter} />
        <FilterTab label="Speed Dating" value="speed_dating" selected={filter} onPress={setFilter} />
        <FilterTab label="Creator Events" value="creator_fan_event" selected={filter} onPress={setFilter} />
        <FilterTab label="Professional" value="professional_networking" selected={filter} onPress={setFilter} />
        <FilterTab label="Meetups" value="open_meetup" selected={filter} onPress={setFilter} />
      </View>
      
      {/* Events List */}
      <FlatList
        data={events}
        renderItem={renderEventCard}
        keyExtractor={(item) => item.eventId}
        contentContainerStyle={styles.listContainer}
        refreshing={loading}
        onRefresh={() => setLoading(true)}
      />
    </View>
  );
}

const FilterTab: React.FC<{
  label: string;
  value: string;
  selected: string;
  onPress: (value: string) => void;
}> = ({ label, value, selected, onPress }) => (
  <TouchableOpacity
    style={[styles.filterTab, selected === value && styles.filterTabActive]}
    onPress={() => onPress(value)}
  >
    <Text style={[styles.filterTabText, selected === value && styles.filterTabTextActive]}>
      {label}
    </Text>
  </TouchableOpacity>
);

function formatEventType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    fontSize: 28,
    fontWeight: 'bold',
    padding: 20,
    paddingTop: 60,
  },
  filterTabs: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 10,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
  },
  filterTabActive: {
    backgroundColor: '#4CAF50',
  },
  filterTabText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
  },
  filterTabTextActive: {
    color: '#fff',
  },
  listContainer: {
    padding: 20,
  },
  eventCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  coverImage: {
    width: '100%',
    height: 180,
    resizeMode: 'cover',
  },
  eventInfo: {
    padding: 16,
  },
  eventTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  eventType: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  eventDesc: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  eventMeta: {
    marginBottom: 12,
  },
  location: {
    fontSize: 13,
    color: '#333',
    marginBottom: 4,
  },
  date: {
    fontSize: 13,
    color: '#333',
  },
  eventFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  attendees: {
    fontSize: 13,
    color: '#666',
  },
  price: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
});

