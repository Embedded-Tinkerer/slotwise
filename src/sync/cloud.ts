// Supabase client for syncing between the phone and the web app.
// Sign-in is by a 6-digit code sent by email; data lives in one "items"
// table protected by row level security (see supabase/schema.sql).

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Row } from '../cloudMerge';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const cloudConfigured = !!URL && !!ANON_KEY;

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!cloudConfigured) throw new Error('Sync is not set up in this build. See docs/SYNC_SETUP.md.');
  if (!client) {
    client = createClient(URL, ANON_KEY, {
      auth: { storage: AsyncStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
  }
  return client;
}

export async function currentEmail(): Promise<string | null> {
  if (!cloudConfigured) return null;
  const { data } = await supabase().auth.getSession();
  return data.session?.user.email ?? null;
}

export async function sendCode(email: string): Promise<void> {
  const { error } = await supabase().auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
  if (error) throw error;
}

export async function verifyCode(email: string, code: string): Promise<string> {
  const { data, error } = await supabase().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
  if (error) throw error;
  return data.user?.email ?? email;
}

export async function cloudSignOut(): Promise<void> {
  await supabase().auth.signOut();
}

const PAGE = 1000;

/** Rows changed since `since` (with a small overlap for clock races). */
export async function pullRows(since?: string): Promise<Row[]> {
  const from = since ? new Date(Date.parse(since) - 5_000).toISOString() : undefined;
  const out: Row[] = [];
  for (let offset = 0; ; offset += PAGE) {
    let q = supabase()
      .from('items')
      .select('kind,id,data,deleted,updated_at')
      .order('updated_at', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (from) q = q.gt('updated_at', from);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...((data ?? []) as Row[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export async function pushRows(rows: Row[]): Promise<void> {
  if (!rows.length) return;
  const { data: auth } = await supabase().auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error('Not signed in to sync');
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200).map((r) => ({
      user_id: uid,
      kind: r.kind,
      id: r.id,
      data: r.deleted ? null : r.data,
      deleted: !!r.deleted,
    }));
    const { error } = await supabase().from('items').upsert(batch, { onConflict: 'user_id,kind,id' });
    if (error) throw error;
  }
}
