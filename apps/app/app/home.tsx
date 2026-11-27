import { SafeBoundary } from "../components/SafeBoundary";
import { ReviewQueueCard } from "../features/coach";
import { HomeScreen } from "../features/home/HomeScreen";

export default function HomeRoute() {
  return (
    <SafeBoundary name="home.screen">
      <HomeScreen
        today={
          <SafeBoundary name="home.reviewQueue">
            <ReviewQueueCard />
          </SafeBoundary>
        }
      />
    </SafeBoundary>
  );
}
