import { Text, View } from "react-native";
import { styles } from "../../src/styles";

export default function TodayScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.eyebrow}>Today</Text>
      <Text style={styles.title}>Daily checklist placeholder</Text>
      <Text style={styles.body}>
        Completion tracking starts after the daily loop slice is implemented.
      </Text>
    </View>
  );
}
