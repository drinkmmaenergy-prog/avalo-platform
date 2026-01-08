import { Redirect } from 'expo-router';
import { useAuth } from "@/contexts/AuthContext";
import { View, ActivityIndicator } from 'react-native';
import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function Index() {
  const { user, loading } = useAuth();
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);

  useEffect(() => {
    checkOnboardingStatus();
  }, []);

  const checkOnboardingStatus = async () => {
    try {
      const completed = await AsyncStorage.getItem('onboarding_completed');
      setOnboardingCompleted(completed === 'true');
    } catch (error) {
      console.error('Error checking onboarding status:', error);
      setOnboardingCompleted(false);
    } finally {
      setCheckingOnboarding(false);
    }
  };

  if (loading || checkingOnboarding) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0F0F0F' }}>
        <ActivityIndicator size="large" color="#40E0D0" />
      </View>
    );
  }

  // If user is authenticated, go to home
  if (user) {
    return <Redirect href="/(tabs)/home" />;
  }

  // If onboarding not completed, show FTUX intro
  if (!onboardingCompleted) {
    return <Redirect href="/onboarding/intro" as any />;
  }

  // Otherwise, show auth/welcome
  return <Redirect href="/(onboarding)/welcome" />;
}

