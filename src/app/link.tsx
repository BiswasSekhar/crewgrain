import { Redirect } from "expo-router";

/** Setup deep links (crewgrain://link?setup=...) are redeemed by the store; just show the app. */
export default function LinkRoute() {
  return <Redirect href="/" />;
}
