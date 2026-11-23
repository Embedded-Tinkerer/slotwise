// Alert.alert does nothing in the browser, so use window.confirm there.
import { Alert, Platform } from 'react-native';

export function confirmAction(title: string, message: string, actionLabel: string, onConfirm: () => void): void {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: actionLabel, style: 'destructive', onPress: onConfirm },
  ]);
}

export function notify(title: string, message: string): void {
  if (Platform.OS === 'web') globalThis.alert?.(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}
