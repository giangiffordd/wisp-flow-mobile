import AsyncStorage from '@react-native-async-storage/async-storage';

const SESSION_KEY = 'worker_session';

export async function getWorkerSession() {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function setWorkerSession(session) {
  try {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {}
}

export async function clearWorkerSession() {
  try {
    await AsyncStorage.removeItem(SESSION_KEY);
  } catch {}
}

/**
 * Canonical worker label used for BOTH writing worker_name to the DB and
 * filtering by it -- must be identical on both sides so per-worker queries
 * keep matching. Format: "EMP001 — GianLorenzo Almario". Falls back
 * gracefully if a field is missing.
 */
export function workerLabel(session) {
  if (!session) return 'Worker';
  const emp = (session.employee_id || '').trim();
  const name = (session.name || '').trim();
  if (emp && name) return `${emp} — ${name}`;
  return name || emp || 'Worker';
}
