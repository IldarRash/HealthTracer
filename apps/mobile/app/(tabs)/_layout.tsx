import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ title: "Today" }} />
      <Tabs.Screen name="chat" options={{ title: "Chat" }} />
      <Tabs.Screen name="training" options={{ title: "Training" }} />
      <Tabs.Screen name="nutrition" options={{ title: "Nutrition" }} />
    </Tabs>
  );
}
