import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  return {
    ...config,
    name: 'Avalo',
    slug: 'avalo',
    version: '1.0.0',
    orientation: 'portrait',
    scheme: 'avalo',
    icon: './assets/icon.png',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#000000',
    },
    experiments: {
      typedRoutes: true,
    },
    plugins: [
      'expo-dev-client',
      'expo-router',
      [
        'expo-location',
        {
          locationAlwaysAndWhenInUsePermission:
            'Allow Avalo to access your location for real-time location sharing.',
          isAndroidBackgroundLocationEnabled: true,
          isAndroidForegroundServiceEnabled: true,
        },
      ],
      'react-native-iap',
    ],
    android: {
      package: 'com.avalo.app',
      permissions: [
        'ACCESS_COARSE_LOCATION',
        'ACCESS_FINE_LOCATION',
        'ACCESS_BACKGROUND_LOCATION',
        'FOREGROUND_SERVICE',
        'FOREGROUND_SERVICE_LOCATION',
        'android.permission.ACCESS_COARSE_LOCATION',
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.ACCESS_BACKGROUND_LOCATION',
        'android.permission.FOREGROUND_SERVICE',
        'android.permission.FOREGROUND_SERVICE_LOCATION',
      ],
      adaptiveIcon: {
        foregroundImage: './assets/icon.png',
        backgroundColor: '#000000',
      },
    },
    ios: {
      bundleIdentifier: 'com.avalo.app',
      supportsTablet: true,
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          'Avalo needs your location for real-time location sharing with other users.',
        NSLocationAlwaysAndWhenInUseUsageDescription:
          'Avalo needs your location in the background to continue sharing your location even when the app is not in the foreground.',
        NSLocationAlwaysUsageDescription:
          'Avalo needs your location to share with other users.',
        UIBackgroundModes: ['location'],
      },
    },
    extra: {
      router: {},
      eas: {
        projectId: '6fbfda1d-aabe-4a6a-ac84-5faf0edd1487',
      },
      firebaseApiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
      firebaseAuthDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
      firebaseProjectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
      firebaseStorageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
      firebaseMessagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      firebaseAppId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
      apiUrl: process.env.EXPO_PUBLIC_API_URL,
      stripePublishableKey: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    },
    owner: 'mbuki83',
  };
};
