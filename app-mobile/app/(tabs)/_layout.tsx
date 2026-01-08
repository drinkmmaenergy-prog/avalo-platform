import { Tabs } from "expo-router";
import { View, StyleSheet } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { useAccountSafety } from "@/hooks/useAccountSafety";
import { SafetyBanner } from "@/components/SafetyBanner";

export default function TabsLayout() {
  const { user } = useAuth();
  const { data, isActive } = useAccountSafety(user?.uid);
  
  return (
    <View style={styles.container}>
      {/* Global Safety Banner - appears on all tabs when status is not ACTIVE */}
      {!isActive && data && (
        <SafetyBanner
          status={data.status}
          message={data.reason || null}
          expiresAt={data.statusExpiresAt ? new Date(data.statusExpiresAt) : null}
        />
      )}
      
      <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: () => '🏠',
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore People',
          tabBarIcon: () => '✨',
        }}
      />
      <Tabs.Screen
        name="swipe"
        options={{
          title: 'Chemistry',
          tabBarIcon: () => '🔥',
        }}
      />
      <Tabs.Screen
        name="live"
        options={{
          title: 'Events',
          tabBarIcon: () => '🎥',
        }}
      />
      <Tabs.Screen
        name="ai-bots"
        options={{
          title: 'AI Bots',
          tabBarIcon: () => '🤖',
        }}
      />
      <Tabs.Screen
        name="questions"
        options={{
          title: 'Connections',
          tabBarIcon: () => '❓',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Creator Mode',
          tabBarIcon: () => '👤',
        }}
      />
      {/* Hidden tabs - accessible via navigation but not shown in tab bar */}
      <Tabs.Screen
        name="discovery"
        options={{
          href: null, // Hide from tab bar
        }}
      />
      <Tabs.Screen
        name="ai"
        options={{
          href: null, // Hide from tab bar - legacy route
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          href: null, // Hide from tab bar - accessible via matches
        }}
      />
      {/* Hidden tabs - accessible via navigation but not shown in tab bar */}
      <Tabs.Screen
        name="wallet"
        options={{
          href: null, // Hide from tab bar - accessible via TokenBadge
        }}
      />
      <Tabs.Screen
        name="payout"
        options={{
          href: null, // Hide from tab bar
        }}
      />
      <Tabs.Screen
        name="payout-details"
        options={{
          href: null, // Hide from tab bar
        }}
      />
      <Tabs.Screen
        name="dating-preferences"
        options={{
          href: null, // Hide from tab bar - accessed from profile
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          href: null, // Hide from tab bar - accessible via profile/messages
        }}
      />
      <Tabs.Screen
        name="liked-you"
        options={{
          href: null, // Hide from tab bar - VIP feature
        }}
      />
    </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
