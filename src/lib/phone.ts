import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
export type PhoneSession = { token: string; profileId: string };
const key = "crewgrain.linked-phone.v1";
export async function getPhone(): Promise<PhoneSession | null> {
  const value =
    Platform.OS === "web"
      ? localStorage.getItem(key)
      : await SecureStore.getItemAsync(key);
  if (!value) return null;
  try {
    return JSON.parse(value) as PhoneSession;
  } catch {
    return null;
  }
}
export async function savePhone(value: PhoneSession | null) {
  if (Platform.OS === "web") {
    if (value) localStorage.setItem(key, JSON.stringify(value));
    else localStorage.removeItem(key);
  } else if (value) await SecureStore.setItemAsync(key, JSON.stringify(value));
  else await SecureStore.deleteItemAsync(key);
}
