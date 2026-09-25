import { useAPAXStore } from './store';

export const TOKEN_KEY = 'apax_token';
export const SESSION_EVENT = 'apax-session-changed';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function saveToken(token: string) {
  if (!token.trim()) throw new Error('Authentication failed');
  try { window.localStorage.setItem(TOKEN_KEY, token); } catch {
    throw new Error('Unable to save your session. Please enable browser storage.');
  }
}

export function clearSession() {
  if (typeof window !== 'undefined') {
    try { window.localStorage.removeItem(TOKEN_KEY); } catch { /* Storage may be disabled. */ }
  }
  useAPAXStore.getState().clearSession();
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SESSION_EVENT));
}
