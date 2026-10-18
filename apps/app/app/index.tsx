/** The app opens on the in-call screen (R1, R2, R4): it is the product. */
import { Redirect } from "expo-router";

export default function Index() {
  return <Redirect href="/call" />;
}
