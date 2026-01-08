import { AvaloSDK } from "@/lib/sdk";

// Tymczasowa, prosta inicjalizacja SDK.
// W kolejnych etapach (AUTH) podmienimy apiKey, deviceId, userId, authToken.
AvaloSDK.init({
  apiUrl: "https://us-central1-avalo-c8c46.cloudfunctions.net",
  projectId: "avalo-c8c46",
  apiKey: "REPLACE_WITH_FIREBASE_API_KEY", // do podmiany po konfiguracji .env
  deviceId: "DEVICE_PLACEHOLDER",
});

// Export a null component to satisfy Expo Router
export default function SDKInit() {
  return null;
}
