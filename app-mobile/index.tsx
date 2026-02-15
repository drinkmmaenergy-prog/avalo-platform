// Inicjalizacja Avalo SDK (side-effect przy starcie aplikacji)
import { AvaloSDK } from "./lib/sdk";

AvaloSDK.init({
  apiUrl: "https://us-central1-avalo-c8c46.cloudfunctions.net",
  projectId: "avalo-c8c46",
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyBpOGHxWKxd7Y8zXnLxJ7bZTdEwNRuCqLw",
  deviceId: "DEVICE_PLACEHOLDER",
});

// Wejście expo-router – NIE zmieniamy
import "expo-router/entry";
