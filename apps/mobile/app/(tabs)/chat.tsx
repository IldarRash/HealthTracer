import { Text, View } from "react-native";
import { styles } from "../../src/styles";

export default function ChatScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.eyebrow}>Chat</Text>
      <Text style={styles.title}>AI coach placeholder</Text>
      <Text style={styles.body}>
        Coach chat and proposal approval are implemented in a later slice.
      </Text>
    </View>
  );
}
