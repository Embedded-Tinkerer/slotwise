// OAuth 2.0 + PKCE sign-in for Google and Microsoft, with tokens kept in the
// device's secure storage and refreshed automatically.

import {
  AuthRequest,
  ResponseType,
  TokenResponse,
  exchangeCodeAsync,
  refreshAsync,
  revokeAsync,
  type DiscoveryDocument,
} from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';

import {
  APP_SCHEME,
  GOOGLE_CLIENT_ID,
  MS_CLIENT_ID,
  MS_TENANT,
  googleRedirectScheme,
} from '../config';

WebBrowser.maybeCompleteAuthSession();

export type ProviderId = 'google' | 'microsoft';

interface ProviderConfig {
  clientId: string;
  redirectUri: string;
  scopes: string[];
  discovery: DiscoveryDocument;
  extraParams?: Record<string, string>;
}

export function providerConfig(id: ProviderId): ProviderConfig {
  if (id === 'google') {
    return {
      clientId: GOOGLE_CLIENT_ID,
      redirectUri: `${googleRedirectScheme()}:/oauthredirect`,
      scopes: [
        'openid',
        'email',
        'https://www.googleapis.com/auth/calendar.readonly',
        // Read/write so finishing a task in Slotwise ticks it off in Google Tasks.
        'https://www.googleapis.com/auth/tasks',
      ],
      discovery: {
        authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenEndpoint: 'https://oauth2.googleapis.com/token',
        revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
      },
      extraParams: { access_type: 'offline', prompt: 'consent' },
    };
  }
  const base = `https://login.microsoftonline.com/${MS_TENANT}/oauth2/v2.0`;
  return {
    clientId: MS_CLIENT_ID,
    redirectUri: `${APP_SCHEME}://auth`,
    scopes: ['openid', 'profile', 'offline_access', 'User.Read', 'Calendars.Read'],
    discovery: {
      authorizationEndpoint: `${base}/authorize`,
      tokenEndpoint: `${base}/token`,
    },
    extraParams: { prompt: 'select_account' },
  };
}

export function isConfigured(id: ProviderId): boolean {
  return providerConfig(id).clientId.length > 0;
}

interface StoredToken {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  issuedAt: number;
}

const key = (id: ProviderId) => `slotwise_token_${id}`;

async function save(id: ProviderId, t: TokenResponse | StoredToken): Promise<void> {
  const stored: StoredToken = {
    accessToken: t.accessToken,
    refreshToken: t.refreshToken,
    expiresIn: t.expiresIn,
    issuedAt: t.issuedAt,
  };
  await SecureStore.setItemAsync(key(id), JSON.stringify(stored));
}

async function load(id: ProviderId): Promise<StoredToken | null> {
  const raw = await SecureStore.getItemAsync(key(id));
  return raw ? (JSON.parse(raw) as StoredToken) : null;
}

/** Opens the provider's sign-in page. Resolves true when connected. */
export async function signIn(id: ProviderId): Promise<boolean> {
  const cfg = providerConfig(id);
  if (!cfg.clientId) {
    throw new Error(
      `${id === 'google' ? 'Google' : 'Microsoft'} sign-in is not configured in this build. See docs/OAUTH_SETUP.md.`,
    );
  }
  const request = new AuthRequest({
    clientId: cfg.clientId,
    redirectUri: cfg.redirectUri,
    scopes: cfg.scopes,
    responseType: ResponseType.Code,
    usePKCE: true,
    extraParams: cfg.extraParams,
  });
  const result = await request.promptAsync(cfg.discovery);
  if (result.type !== 'success') {
    if (result.type === 'error') {
      throw new Error(result.error?.description || result.error?.message || 'Sign-in failed');
    }
    return false;
  }
  const token = await exchangeCodeAsync(
    {
      clientId: cfg.clientId,
      code: result.params.code,
      redirectUri: cfg.redirectUri,
      scopes: cfg.scopes,
      extraParams: { code_verifier: request.codeVerifier ?? '' },
    },
    cfg.discovery,
  );
  await save(id, token);
  return true;
}

export async function signOut(id: ProviderId): Promise<void> {
  const t = await load(id);
  await SecureStore.deleteItemAsync(key(id));
  const cfg = providerConfig(id);
  if (t && cfg.discovery.revocationEndpoint) {
    try {
      await revokeAsync({ token: t.refreshToken ?? t.accessToken, clientId: cfg.clientId }, cfg.discovery);
    } catch {
      // Best effort; the local token is already gone.
    }
  }
}

export async function isSignedIn(id: ProviderId): Promise<boolean> {
  return (await load(id)) !== null;
}

/** Returns a non-expired access token, refreshing it when needed. */
export async function getAccessToken(id: ProviderId): Promise<string> {
  const t = await load(id);
  if (!t) throw new Error('Not signed in');
  if (TokenResponse.isTokenFresh(t)) return t.accessToken;
  if (!t.refreshToken) throw new Error('Session expired, please reconnect');
  const cfg = providerConfig(id);
  const fresh = await refreshAsync(
    { clientId: cfg.clientId, refreshToken: t.refreshToken, scopes: cfg.scopes },
    cfg.discovery,
  );
  // Google does not always return a new refresh token; keep the old one.
  await save(id, { ...fresh, refreshToken: fresh.refreshToken ?? t.refreshToken });
  return fresh.accessToken;
}
