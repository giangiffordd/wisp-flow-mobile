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
