import { useCallback, useEffect, useRef, useState } from 'react';
import { LogEntry } from '../types';
import { patchLog } from './cloud';

export type AutoSaveState = 'idle' | 'saving' | 'saved' | 'error';

/** Fields that are saved silently while a log is being edited. */
const FIELDS: (keyof LogEntry)[] = [
  'logNo', 'date', 'resellerName', 'resellerId', 'resellerPhone', 'requestType', 'customerName',
  'headTeacherName', 'headTeacherPhone', 'nmsId', 'edcNo', 'routerSerial', 'mac', 'lat', 'long',
  'unionName', 'upazila', 'fiberLength', 'category', 'nameBn', 'nameEn', 'issueFound', 'missingWrongDetails', 'actionTaken',
  'reasonForAction', 'resellerInformed', 'followUpNeeded', 'followUpDate', 'status',
  'supervisorInformed', 'remarks',
];

const norm = (v: unknown) => (typeof v === 'number' ? v : String(v ?? '').trim());

function snapshot(data: Partial<LogEntry>, resellerId?: string): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const f of FIELDS) out[f] = norm(f === 'resellerId' ? (resellerId ?? data.resellerId) : data[f]);
  return out;
}

/**
 * Silently pushes edits of an EXISTING log to the server in the background.
 * - waits `delay` ms after the last keystroke, sends only the fields that changed
 * - requests never overlap (queued), failures are retried on the next change / every 5 s
 * - nothing is refetched and the page never reloads; `onSaved` receives the stored log
 * - pending edits are flushed when the form closes or the tab is hidden / closed
 */
export function useAutoSave(opts: {
  enabled: boolean;
  logId?: string;
  data: Partial<LogEntry>;
  resellerId?: string;
  baseline?: LogEntry | null;
  onSaved?: (saved: LogEntry) => void;
  delay?: number;
}) {
  const { enabled, logId, data, resellerId, baseline, onSaved, delay = 800 } = opts;
  const [state, setState] = useState<AutoSaveState>('idle');
  const synced = useRef<Record<string, string | number>>({});
  const latest = useRef<Record<string, string | number>>({});
  const inFlight = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<any>(null);
  const retry = useRef<any>(null);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const idRef = useRef(logId);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  // Reset the baseline whenever a different log is opened.
  useEffect(() => {
    idRef.current = logId;
    synced.current = baseline ? snapshot(baseline) : {};
    latest.current = synced.current;
    setState('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logId]);

  const send = useCallback((keepalive = false) => {
    clearTimeout(timer.current);
    clearTimeout(retry.current);
    const id = idRef.current;
    if (!enabledRef.current || !id) return inFlight.current;
    inFlight.current = inFlight.current.then(async () => {
      const now = latest.current;
      const changed: Record<string, string | number> = {};
      for (const k of Object.keys(now)) if (now[k] !== synced.current[k]) changed[k] = now[k];
      if (!Object.keys(changed).length) return;
      setState('saving');
      try {
        const saved = await patchLog(id, changed as Partial<LogEntry>, { keepalive });
        for (const k of Object.keys(changed)) synced.current[k] = changed[k];
        onSavedRef.current?.(saved);
        setState('saved');
      } catch (err) {
        console.warn('autosave failed, will retry:', (err as Error)?.message);
        setState('error');
        retry.current = setTimeout(() => send(), 5000);
      }
    });
    return inFlight.current;
  }, []);

  // Schedule a save when the form data changes.
  useEffect(() => {
    if (!enabled || !logId) return;
    latest.current = snapshot(data, resellerId);
    const dirty = Object.keys(latest.current).some((k) => latest.current[k] !== synced.current[k]);
    if (!dirty) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => send(), delay);
    return () => clearTimeout(timer.current);
  }, [data, resellerId, enabled, logId, delay, send]);

  // Flush on tab hide / close and when the form is left.
  useEffect(() => {
    const flush = () => { send(true); };
    const onVis = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVis);
      flush();
    };
  }, [send]);

  return { state, flush: () => send() };
}
