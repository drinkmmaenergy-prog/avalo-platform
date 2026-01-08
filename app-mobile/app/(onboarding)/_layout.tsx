import { Stack } from "expo-router";

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="language" />
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="selfie-verify" />
    </Stack>
  );
}
