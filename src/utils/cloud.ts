import { ActivityEvent, ApprovalRequest, AppUser, FieldSuggestionsMap, LogEntry, MarkAction, MarkKind, Reseller } from '../types';
import { getAccessToken, signOut } from './auth';

async function authFetch(path: string, options: RequestInit = {}) {
  const token = await getAccessToken();
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    ...(options.headers || {}),
  };
  const res = await fetch(path, { ...options, headers });
  if (!res.ok) {
    if (res.status === 401) {
      try {
        await signOut();
      } catch {
        /* ignore */
      }
    }
    let msg = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data.error) msg = data.error;
    } catch {
      /* not json */
    }
    throw new Error(msg);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------
export async function loadLogs(): Promise<LogEntry[]> {
  return authFetch('/api/logs');
}

export async function saveLog(entry: LogEntry, user: AppUser, existing?: LogEntry | null): Promise<LogEntry> {
  return authFetch('/api/logs', {
    method: 'POST',
    body: JSON.stringify({ entry, existingId: existing?.id }),
  });
}

export async function saveBatchLogs(entries: LogEntry[]): Promise<{ saved: LogEntry[]; count: number }> {
  return authFetch('/api/logs/batch', {
    method: 'POST',
    body: JSON.stringify({ entries }),
  });
}

export async function bulkFillField(
  field: string,
  items: { id: string; value: string }[]
): Promise<{ updated: number; unchanged: number; missing: number }> {
  return authFetch('/api/logs/bulk-fill', {
    method: 'POST',
    body: JSON.stringify({ field, items }),
  });
}

export interface ScannedForm {
  fileName: string;
  customerName: string;
  edcNo: string;
  nmsId: string;
  upazila: string;
  unionName: string;
  lat: string;
  long: string;
  routerSerial: string;
  mac: string;
  fiberLength: string;
  headTeacherPhone: string;
  date: string;
  confidence: number;
  warnings: string[];
}

export async function scanPdfForms(
  files: { name: string; data: string }[]
): Promise<{ results: ScannedForm[]; errors: { fileName: string; error: string }[] }> {
  return authFetch('/api/pdf/scan', {
    method: 'POST',
    body: JSON.stringify({ files }),
  });
}

export async function deleteLog(id: string, _user?: AppUser): Promise<void> {
  await authFetch(`/api/logs/${id}`, { method: 'DELETE' });
}

export async function clearAllLogs(_user?: AppUser): Promise<void> {
  await authFetch('/api/logs/clear-all', { method: 'POST' });
}

export async function restoreLogs(imported: LogEntry[], merge: boolean, _user: AppUser): Promise<number> {
  const res = await authFetch('/api/logs/restore', {
    method: 'POST',
    body: JSON.stringify({ logs: imported, merge }),
  });
  return res.total;
}

export async function importLocalBrowserData(user: AppUser): Promise<number> {
  const raw = localStorage.getItem('pace_it_logs_v1');
  if (!raw) return 0;
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || !parsed.length) return 0;
  return restoreLogs(parsed, true, user);
}

// ---------------------------------------------------------------------------
// Resellers
// ---------------------------------------------------------------------------
export async function loadResellers(): Promise<Reseller[]> {
  return authFetch('/api/resellers');
}

export async function createReseller(input: { name: string; area: string; phone: string }, _user: AppUser): Promise<Reseller> {
  return authFetch('/api/resellers', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateReseller(id: string, input: { name: string; area: string; phone: string; active: boolean }): Promise<void> {
  await authFetch(`/api/resellers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function deleteReseller(id: string): Promise<void> {
  await authFetch(`/api/resellers/${id}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------
export async function loadSuggestions(): Promise<FieldSuggestionsMap> {
  return authFetch('/api/suggestions');
}

export async function saveSuggestions(suggestions: FieldSuggestionsMap): Promise<void> {
  await authFetch('/api/suggestions', {
    method: 'POST',
    body: JSON.stringify(suggestions),
  });
}

export async function harvestSuggestions(_entry: Partial<LogEntry>): Promise<FieldSuggestionsMap> {
  return loadSuggestions();
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------
export async function loadActivity(): Promise<ActivityEvent[]> {
  return authFetch('/api/activity');
}

export async function addCloudActivity(event: Omit<ActivityEvent, 'id' | 'at'>): Promise<void> {
  await authFetch('/api/activity', {
    method: 'POST',
    body: JSON.stringify(event),
  });
}

// ---------------------------------------------------------------------------
// Admin User Management
// ---------------------------------------------------------------------------
export async function listUsers(): Promise<any[]> {
  return authFetch('/api/users');
}

export async function createUserAccount(_accessToken: string, username: string, password: string, displayName: string) {
  return authFetch('/api/users', {
    method: 'POST',
    body: JSON.stringify({ username, password, displayName }),
  });
}

export async function disableUserAccount(_accessToken: string, userId: string, disabled: boolean) {
  return authFetch(`/api/users/${userId}/disable`, {
    method: 'POST',
    body: JSON.stringify({ disabled }),
  });
}

export async function listCredentials(): Promise<Record<string, string>> {
  return authFetch('/api/admin/credentials');
}

export async function resetUserPassword(userId: string, password: string) {
  return authFetch(`/api/admin/users/${userId}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export async function notePasswordChanged(): Promise<void> {
  try {
    await authFetch('/api/auth/note-password-changed', { method: 'POST' });
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Form / bill received marks and admin approvals
// ---------------------------------------------------------------------------
export async function loadApprovals(): Promise<ApprovalRequest[]> {
  return authFetch('/api/approvals');
}

export async function requestMarks(
  items: { logId: string; kind: MarkKind; action: MarkAction; month?: string; receivedOn?: string }[]
): Promise<{ applied: number; queued: number; skipped: number }> {
  return authFetch('/api/approvals/request', { method: 'POST', body: JSON.stringify({ items }) });
}

export async function decideApprovals(opts: { ids?: string[]; all?: boolean; approve: boolean }): Promise<{ approved: number; rejected: number }> {
  return authFetch('/api/approvals/decide', { method: 'POST', body: JSON.stringify(opts) });
}

export async function withdrawApproval(id: string): Promise<void> {
  await authFetch(`/api/approvals/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Admin Bin
// ---------------------------------------------------------------------------
export async function loadBin(): Promise<{ logs: LogEntry[]; resellers: Reseller[] }> {
  return authFetch('/api/bin');
}

export async function restoreBinLog(id: string) {
  return authFetch(`/api/bin/logs/${id}/restore`, { method: 'POST' });
}

export async function restoreBinReseller(id: string) {
  return authFetch(`/api/bin/resellers/${id}/restore`, { method: 'POST' });
}

export async function purgeBinLog(id: string) {
  return authFetch(`/api/bin/logs/${id}`, { method: 'DELETE' });
}

export async function purgeBinReseller(id: string) {
  return authFetch(`/api/bin/resellers/${id}`, { method: 'DELETE' });
}

export async function emptyBin(): Promise<number> {
  const res = await authFetch('/api/bin', { method: 'DELETE' });
  return res.purged || 0;
}

// ---------------------------------------------------------------------------
// Realtime SSE & Office Sync
// ---------------------------------------------------------------------------
export function subscribeToCloud(
  onLogs: () => void,
  onActivity: () => void,
  onSuggestions: () => void,
  onResellers?: () => void,
  onApprovals?: () => void
): () => void {
  let eventSource: EventSource | null = null;
  let intervalId: any = null;

  // Several change events usually arrive together (e.g. a save touches logs + activity +
  // suggestions). Coalesce them so each kind refreshes at most once per burst.
  const timers: Record<string, any> = {};
  const fire = (type: string, fn?: () => void) => {
    if (!fn) return;
    clearTimeout(timers[type]);
    timers[type] = setTimeout(fn, 300);
  };

  try {
    eventSource = new EventSource('/api/events');
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'logs') fire('logs', onLogs);
        else if (data.type === 'activity') fire('activity', onActivity);
        else if (data.type === 'suggestions') fire('suggestions', onSuggestions);
        else if (data.type === 'resellers') fire('resellers', onResellers);
        else if (data.type === 'approvals') fire('approvals', onApprovals);
      } catch {
        /* ignore */
      }
    };
    eventSource.onerror = () => {
      // If SSE disconnects, fall back to occasional polling
      if (!intervalId) {
        intervalId = setInterval(() => {
          onLogs();
          onActivity();
          onApprovals?.();
        }, 8000);
      }
    };
  } catch {
    // If EventSource is not supported
    intervalId = setInterval(() => {
      onLogs();
      onActivity();
    }, 5000);
  }

  return () => {
    if (eventSource) eventSource.close();
    if (intervalId) clearInterval(intervalId);
    Object.values(timers).forEach((t) => clearTimeout(t));
  };
}

export { getAccessToken } from './auth';

// ---------------------------------------------------------------------------
// Silent autosave (partial update of one log; no refetch, no reload)
// ---------------------------------------------------------------------------
export async function patchLog(id: string, fields: Partial<LogEntry>, opts: { keepalive?: boolean } = {}): Promise<LogEntry> {
  return authFetch(`/api/logs/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields }),
    keepalive: opts.keepalive,
  });
}
