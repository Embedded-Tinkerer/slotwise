import type { ExpoConfig, ConfigContext } from 'expo/config';

// Mirrors src/config.ts (kept separate so this file has no app imports).
function googleScheme(): string | undefined {
  const raw = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '';
  const id = raw.replace(/\.apps\.googleusercontent\.com$/, '');
  return id ? `com.googleusercontent.apps.${id}` : undefined;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const schemes = ['slotwise', googleScheme()].filter(Boolean) as string[];
  return {
    ...config,
    name: 'Slotwise',
    slug: 'slotwise',
    scheme: schemes,
    android: {
      ...config.android,
      package: 'com.embeddedtinkerer.slotwise',
      // CI sets BUILD_NUMBER so each APK installs as an upgrade.
      versionCode: Number(process.env.BUILD_NUMBER || 1),
    },
    ios: {
      ...config.ios,
      bundleIdentifier: 'com.embeddedtinkerer.slotwise',
    },
  };
};
