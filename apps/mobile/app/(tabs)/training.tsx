import { Text, View } from "react-native";
import { styles } from "../../src/styles";

export default function TrainingScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.eyebrow}>Training</Text>
      <Text style={styles.title}>Workout plan placeholder</Text>
      <Text style={styles.body}>
        Revision-safe workout plans are implemented after foundation.
      </Text>
    </View>
  );
}
