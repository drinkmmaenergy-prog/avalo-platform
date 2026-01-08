import { useEffect, useState } from 'react';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface PreSignupData {
  preSignupId: string;
  email: string;
  phone: string | null;
  country: string;
  language: string;
  createdAt: any;
  status: string;
}

export function useDeepLink() {
  const router = useRouter();
  const [preSignupData, setPreSignupData] = useState<PreSignupData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Handle initial URL when app is opened via deep link
    const handleInitialUrl = async () => {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        handleDeepLink(initialUrl);
      }
    };

    // Handle deep link when app is already open
    const subscription = Linking.addEventListener('url', (event) => {
      handleDeepLink(event.url);
    });

    handleInitialUrl();

    return () => {
      subscription.remove();
    };
  }, []);

  const handleDeepLink = async (url: string) => {
    try {
      setLoading(true);
      
      // Parse the URL
      const { hostname, path, queryParams } = Linking.parse(url);
      
      console.log('Deep link received:', { hostname, path, queryParams });

      // Handle signup deep link with preSignupId
      if (path === 'signup' && queryParams?.preSignupId) {
        const preSignupId = queryParams.preSignupId as string;
        
        // Fetch preSignup data from Firestore
        const preSignupRef = doc(db, 'preSignup', preSignupId);
        const preSignupDoc = await getDoc(preSignupRef);

        if (preSignupDoc.exists()) {
          const data = preSignupDoc.data();
          
          // Store data for use in signup flow
          const signupData = {
            preSignupId,
            email: data.email,
            phone: data.phone,
            country: data.country,
            language: data.language,
            createdAt: data.createdAt,
            status: data.status
          };
          
          setPreSignupData(signupData);

          // Update status to indicate user opened the app
          await updateDoc(preSignupRef, {
            status: 'OPENED',
            openedAt: new Date().toISOString()
          });

          // Store in AsyncStorage for persistence
          await AsyncStorage.setItem('preSignupData', JSON.stringify({
            preSignupId,
            email: data.email,
            phone: data.phone,
            country: data.country,
            language: data.language,
          }));
          
          // Navigate to home, registration flow will use stored data
          router.replace('/');
        } else {
          console.warn('PreSignup document not found:', preSignupId);
        }
      }
    } catch (error) {
      console.error('Error handling deep link:', error);
    } finally {
      setLoading(false);
    }
  };

  return {
    preSignupData,
    loading
  };
}