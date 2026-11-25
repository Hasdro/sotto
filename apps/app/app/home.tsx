import { View } from "react-native";
import { ReviewQueueCard } from "../features/coach";
import { HomeScreen } from "../features/home/HomeScreen";

export default function HomeRoute() {
  return (
    <View style={{ flex: 1 }}>
      <HomeScreen />
      <ReviewQueueCard />
    </View>
  );
}
