import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  TextInput,
  ScrollView,
  ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from "@/lib/firebase";
import { Course, CourseCategory } from "@/functions/src/types/education.types";

const CATEGORIES: { id: CourseCategory; name: string; icon: string }[] = [
  { id: 'business_fundamentals', name: 'Business', icon: 'briefcase' },
  { id: 'social_media_growth', name: 'Social Media', icon: 'logo-instagram' },
  { id: 'fitness_coaching', name: 'Fitness', icon: 'fitness' },
  { id: 'language_teaching', name: 'Languages', icon: 'language' },
  { id: 'design_photography', name: 'Design', icon: 'color-palette' },
  { id: 'ecommerce', name: 'E-Commerce', icon: 'cart' },
  { id: 'productivity_mindset', name: 'Productivity', icon: 'time' },
  { id: 'career_skills', name: 'Career', icon: 'school' }
];

export default function EducationHub() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CourseCategory | 'all'>('all');
  const [sortBy, setSortBy] = useState<'popular' | 'rating' | 'newest'>('popular');

  useEffect(() => {
    loadCourses();
  }, [selectedCategory, sortBy]);

  const loadCourses = async () => {
    try {
      setLoading(true);
      let q = query(
        collection(db, 'courses'),
        where('status', '==', 'published')
      );

      if (selectedCategory !== 'all') {
        q = query(q, where('category', '==', selectedCategory));
      }

      if (sortBy === 'popular') {
        q = query(q, orderBy('enrollmentCount', 'desc'));
      } else if (sortBy === 'rating') {
        q = query(q, orderBy('rating', 'desc'));
      } else {
        q = query(q, orderBy('createdAt', 'desc'));
      }

      q = query(q, limit(20));

      const snapshot = await getDocs(q);
      const coursesData = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as Course[];

      setCourses(coursesData);
    } catch (error) {
      console.error('Error loading courses:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredCourses = courses.filter(course =>
    searchQuery === '' ||
    course.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    course.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderCourseCard = ({ item }: { item: Course }) => (
    <TouchableOpacity
      style={styles.courseCard}
      onPress={() => router.push(`/education/course/${item.id}` as any)}
    >
      <Image source={{ uri: item.coverImage }} style={styles.courseImage} />
      
      <View style={styles.courseInfo}>
        <Text style={styles.courseTitle} numberOfLines={2}>
          {item.title}
        </Text>
        
        <Text style={styles.courseCreator} numberOfLines={1}>
          by {item.creatorName}
        </Text>
        
        <View style={styles.courseStats}>
          <View style={styles.stat}>
            <Ionicons name="star" size={14} color="#FFD700" />
            <Text style={styles.statText}>
              {item.rating.toFixed(1)} ({item.ratingCount})
            </Text>
          </View>
          
          <View style={styles.stat}>
            <Ionicons name="people" size={14} color="#666" />
            <Text style={styles.statText}>{item.enrollmentCount}</Text>
          </View>
          
          <View style={styles.stat}>
            <Ionicons name="time" size={14} color="#666" />
            <Text style={styles.statText}>{item.duration}h</Text>
          </View>
        </View>
        
        <View style={styles.priceRow}>
          <Text style={styles.price}>
            {item.price === 0 ? 'Free' : `${item.price} ${item.currency}`}
          </Text>
          
          <View style={[styles.levelBadge, getLevelColor(item.level)]}>
            <Text style={styles.levelText}>{item.level}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'beginner':
        return { backgroundColor: '#E8F5E9' };
      case 'intermediate':
        return { backgroundColor: '#FFF3E0' };
      case 'advanced':
        return { backgroundColor: '#FFEBEE' };
      default:
        return { backgroundColor: '#F5F5F5' };
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Education Hub</Text>
        <TouchableOpacity onPress={() => router.push('/education/my-courses' as any)}>
          <Ionicons name="book" size={24} color="#000" />
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search courses..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="#999"
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoriesScroll}
        contentContainerStyle={styles.categoriesContainer}
      >
        <TouchableOpacity
          style={[styles.categoryChip, selectedCategory === 'all' && styles.categoryChipActive]}
          onPress={() => setSelectedCategory('all')}
        >
          <Text style={[styles.categoryText, selectedCategory === 'all' && styles.categoryTextActive]}>
            All
          </Text>
        </TouchableOpacity>
        
        {CATEGORIES.map(cat => (
          <TouchableOpacity
            key={cat.id}
            style={[styles.categoryChip, selectedCategory === cat.id && styles.categoryChipActive]}
            onPress={() => setSelectedCategory(cat.id)}
          >
            <Ionicons
              name={cat.icon as any}
              size={16}
              color={selectedCategory === cat.id ? '#FFF' : '#666'}
              style={styles.categoryIcon}
            />
            <Text style={[styles.categoryText, selectedCategory === cat.id && styles.categoryTextActive]}>
              {cat.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.sortContainer}>
        {['popular', 'rating', 'newest'].map(sort => (
          <TouchableOpacity
            key={sort}
            style={[styles.sortButton, sortBy === sort && styles.sortButtonActive]}
            onPress={() => setSortBy(sort as any)}
          >
            <Text style={[styles.sortText, sortBy === sort && styles.sortTextActive]}>
              {sort.charAt(0).toUpperCase() + sort.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6C63FF" />
        </View>
      ) : (
        <FlatList
          data={filteredCourses}
          renderItem={renderCourseCard}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.coursesList}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="school" size={64} color="#CCC" />
              <Text style={styles.emptyText}>No courses found</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0'
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000'
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    margin: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    height: 48
  },
  searchIcon: {
    marginRight: 8
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#000'
  },
  categoriesScroll: {
    maxHeight: 50
  },
  categoriesContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    marginRight: 8
  },
  categoryChipActive: {
    backgroundColor: '#6C63FF'
  },
  categoryIcon: {
    marginRight: 6
  },
  categoryText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500'
  },
  categoryTextActive: {
    color: '#FFF'
  },
  sortContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8
  },
  sortButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F5F5F5'
  },
  sortButtonActive: {
    backgroundColor: '#E8E5FF'
  },
  sortText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500'
  },
  sortTextActive: {
    color: '#6C63FF',
    fontWeight: '600'
  },
  coursesList: {
    padding: 16
  },
  courseCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4
  },
  courseImage: {
    width: '100%',
    height: 180,
    backgroundColor: '#F0F0F0'
  },
  courseInfo: {
    padding: 12
  },
  courseTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4
  },
  courseCreator: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8
  },
  courseStats: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 8
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  statText: {
    fontSize: 12,
    color: '#666'
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  price: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#6C63FF'
  },
  levelBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12
  },
  levelText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    textTransform: 'capitalize'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    color: '#999'
  }
});
