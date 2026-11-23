// Secure storage: the Android keystore on the phone, localStorage in the
// browser (expo-secure-store has no web implementation).
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const web = Platform.OS === 'web';

export async function getItem(key: string): Promise<string | null> {
  if (web) {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  if (web) {
    globalThis.localStorage?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function deleteItem(key: string): Promise<void> {
  if (web) {
    globalThis.localStorage?.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
