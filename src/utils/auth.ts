import { AppUser } from '../types';

const LAST_USER_KEY = 'pace_it_last_user_v2';
const TOKEN_KEY = 'pace_it_auth_token';

export function cleanUserName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, 40);
}

export function getLastUser(): string {
  try {
    return localStorage.getItem(LAST_USER_KEY) || '';
  } catch {
    return '';
  }
}

export function setLastUser(name: string): void {
  try {
    localStorage.setItem(LAST_USER_KEY, name);
  } catch {
    /* ignore */
  }
}

export function getStoredToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setStoredToken(token: string): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    /* ignore */
  }
}

const authListeners = new Set<(user: AppUser | null) => void>();

function notifyAuthChange(user: AppUser | null) {
  authListeners.forEach((cb) => {
    try {
      cb(user);
    } catch (e) {
      console.error('Auth listener error:', e);
    }
  });
}

export async function login(username: string, password: string): Promise<AppUser> {
  const normalized = username.trim().toLowerCase().replace(/\s+/g, '_');
  if (!normalized || !password) throw new Error('Username and password are required.');

  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: normalized, password }),
  });

  if (!res.ok) {
    let msg = 'Invalid username or password.';
    try {
      const data = await res.json();
      if (data.error) msg = data.error;
    } catch {
      // not json
    }
    throw new Error(msg);
  }

  const { token, user } = await res.json();
  setStoredToken(token);
  setLastUser(user.username);
  notifyAuthChange(user);
  return user;
}

export async function getCurrentUser(): Promise<AppUser | null> {
  const token = getStoredToken();
  if (!token) return null;

  try {
    const res = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      setStoredToken('');
      return null;
    }
    const data = await res.json();
    return data.user || null;
  } catch {
    return null;
  }
}

export async function changePassword(password: string): Promise<void> {
  if (password.length < 8) throw new Error('Password must be at least 8 characters.');
  const token = await getAccessToken();

  const res = await fetch('/api/auth/change-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ password }),
  });

  if (!res.ok) {
    let msg = 'Could not change password.';
    try {
      const data = await res.json();
      if (data.error) msg = data.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
}

export async function getAccessToken(): Promise<string> {
  const token = getStoredToken();
  if (!token) throw new Error('Your session has expired. Please log in again.');
  return token;
}

export async function signOut(): Promise<void> {
  const token = getStoredToken();
  if (token) {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      /* ignore */
    }
  }
  setStoredToken('');
  notifyAuthChange(null);
}

export function onAuthChange(callback: (user: AppUser | null) => void) {
  authListeners.add(callback);
  // Initial fire
  getCurrentUser().then((u) => callback(u)).catch(() => callback(null));
  return () => {
    authListeners.delete(callback);
  };
}
