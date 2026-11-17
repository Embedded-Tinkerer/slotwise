// Build-time configuration. Values come from EXPO_PUBLIC_* environment
// variables (a local .env file, or GitHub Actions secrets for APK builds).
// See docs/OAUTH_SETUP.md for how to obtain them.

export const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '';
export const MS_CLIENT_ID = process.env.EXPO_PUBLIC_MS_CLIENT_ID ?? '';
/** "common" allows both personal and work/school Microsoft accounts. */
export const MS_TENANT = process.env.EXPO_PUBLIC_MS_TENANT || 'common';

/**
 * Google "iOS" type OAuth clients accept a redirect on the reversed client id
 * scheme, which lets an Android app sign in with PKCE and no client secret.
 */
export function googleRedirectScheme(clientId: string = GOOGLE_CLIENT_ID): string {
  const id = clientId.replace(/\.apps\.googleusercontent\.com$/, '');
  return id ? `com.googleusercontent.apps.${id}` : '';
}

export const APP_SCHEME = 'slotwise';
