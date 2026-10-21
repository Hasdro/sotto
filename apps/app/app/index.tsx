/** The app opens on Home (owner, 21 Oct); a call starts from there or by itself. */
import { Redirect } from "expo-router";

export default function Index() {
  return <Redirect href="/home" />;
}
