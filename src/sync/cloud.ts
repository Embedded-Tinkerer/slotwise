// Sync with your own Slotwise server (server/server.mjs, run in Docker).
// The phone stores the server address and password; the web app is served by
// that same server, so it only needs the password.

import { Platform } from 'react-native';

import type { Row } from '../cloudMerge';
import * as SecureStore from '../secureStore';

const KEY = 'slotwise_sync_server';

interface ServerConfig {
  url: string;
  password: string;
}

/** Sync needs no build-time setup any more; it is configured in the app. */
export const cloudConfigured = true;

/** On the web the app is served by the sync server itself. */
export const webOrigin = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : '';

let cached: ServerConfig | null | undefined;

async function config(): Promise<ServerConfig | null> {
  if (cached !== undefined) return cached;
  const raw = await SecureStore.getItem(KEY);
  cached = raw ? (JSON.parse(raw) as ServerConfig) : null;
  return cached;
}

function normalizeUrl(input: string): string {
  let u = input.trim().replace(/\/+$/, '');
  if (!u) return webOrigin;
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`;
  return u;
}

/** A short label for the connected server, or null when not connected. */
export async function currentServer(): Promise<string | null> {
  const c = await config();
  if (!c) return null;
  return c.url.replace(/^https?:\/\//, '');
}

async function call(c: ServerConfig, path: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${c.url}${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${c.password}` },
    });
  } catch {
    throw new Error(`Can't reach ${c.url}. Check the address and that you're on the right network.`);
  }
  if (res.status === 401) throw new Error('Wrong password for the Slotwise server');
  if (!res.ok) throw new Error(`Slotwise server error ${res.status}`);
  return res;
}

/** Checks the address and password, then remembers them. */
export async function connectServer(url: string, password: string): Promise<string> {
  const c = { url: normalizeUrl(url), password };
  if (!c.url) throw new Error('Enter your server address, like http://192.168.1.20:8088');
  await call(c, '/api/ping');
  await SecureStore.setItem(KEY, JSON.stringify(c));
  cached = c;
  return c.url.replace(/^https?:\/\//, '');
}

export async function cloudSignOut(): Promise<void> {
  await SecureStore.deleteItem(KEY);
  cached = null;
}

async function need(): Promise<ServerConfig> {
  const c = await config();
  if (!c) throw new Error('Not connected to a Slotwise server');
  return c;
}

/** Rows changed since `since` (a server timestamp from an earlier pull). */
export async function pullRows(since?: string): Promise<Row[]> {
  const q = since ? `?since=${encodeURIComponent(since)}` : '';
  const res = await call(await need(), `/api/items${q}`);
  return ((await res.json()) as { rows: Row[] }).rows;
}

export async function pushRows(rows: Row[]): Promise<void> {
  if (!rows.length) return;
  const c = await need();
  for (let i = 0; i < rows.length; i += 500) {
    await call(c, '/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: rows.slice(i, i + 500) }),
    });
  }
}
