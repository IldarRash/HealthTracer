import { Text, View } from "react-native";
import { styles } from "../../src/styles";

export default function NutritionScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.eyebrow}>Nutrition</Text>
      <Text style={styles.title}>Nutrition plan placeholder</Text>
      <Text style={styles.body}>
        Nutrition targets and adherence are implemented after foundation.
      </Text>
    </View>
  );
}
