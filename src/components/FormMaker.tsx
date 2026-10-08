import React, { useEffect, useRef, useState } from 'react';
import { Search, FileDown, Loader2, ExternalLink } from 'lucide-react';
import { LogEntry } from '../types';
import { upazilaKey } from '../utils/upazilas';
import { getAccessToken } from '../utils/cloud';
import { findDuplicates, describeLog } from '../utils/duplicates';

type Fields = Record<string, string>;
interface Meta { key: string; label: string; default: string }
interface Match { sheet: string; data: Fields }

interface FormMakerProps {
  logs: LogEntry[];
  onLog: (fields: Partial<LogEntry>, existingId?: string) => Promise<LogEntry>;
  onOpenLog: (id: string) => void;
}

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
// Same format the log form uses, e.g. "05 Oct 2026"
const logDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

async function api(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  const res = await fetch(path, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try { msg = (await res.json()).error || msg; } catch { /* not json */ }
    throw new Error(msg);
  }
  return res;
}

const inputCls = 'w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white';

export const FormMaker: React.FC<FormMakerProps> = ({ logs, onLog, onOpenLog }) => {
  const [meta, setMeta] = useState<Meta[]>([]);
  const [edc, setEdc] = useState('');
  const [date, setDate] = useState(todayIso());
  const [matches, setMatches] = useState<Match[]>([]);
  const [fields, setFields] = useState<Fields>({});
  const [busy, setBusy] = useState<'search' | 'download' | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const [lastLogId, setLastLogId] = useState<string | null>(null);
  // Re-downloading the same form in one session updates its log instead of creating a duplicate.
  const logged = useRef<Record<string, string>>({});
  const [ackDup, setAckDup] = useState('');

  // Same NMS ID / router serial / MAC already on another log? (the log this form already created doesn't count)
  const dupKey = fields.connection_nms || fields.source_no || fields.name;
  const dups = findDuplicates(
    { id: logged.current[dupKey], nmsId: fields.connection_nms, routerSerial: fields.router_serial, mac: fields.router_mac },
    logs,
  );
  const dupSig = dups.map((d) => `${d.field}:${d.value}`).join('|');

  useEffect(() => {
    fetch('/api/meta').then(r => r.json()).then(j => {
      const m: Meta[] = j.fields || [];
      setMeta(m);
      setFields(Object.fromEntries(m.map(f => [f.key, f.default])));
    }).catch(() => setNotice({ kind: 'err', text: 'Could not reach the Form Maker service.' }));
  }, []);

  const defaults = () => Object.fromEntries(meta.map(f => [f.key, f.default]));
  const apply = (m: Match) => { setFields({ ...defaults(), ...m.data }); setMatches([]); setNotice(null); };

  const search = async () => {
    if (!edc.trim()) return;
    setBusy('search'); setNotice(null); setLastLogId(null);
    try {
      const res = await api(`/api/lookup?edc=${encodeURIComponent(edc.trim())}`);
      const found: Match[] = (await res.json()).matches || [];
      if (found.length === 0) {
        setFields({ ...defaults(), source_no: edc.trim() });
        setMatches([]);
        setNotice({ kind: 'info', text: `EDC ${edc.trim()} was not found in the workbook (data/toscrape.xlsx). Fill the fields manually.` });
      } else if (found.length === 1) apply(found[0]);
      else { setMatches(found); setNotice({ kind: 'info', text: `${found.length} matches. Pick the right one.` }); }
    } catch (e: any) { setNotice({ kind: 'err', text: e.message }); }
    setBusy(null);
  };

  const download = async () => {
    if (dups.length > 0 && ackDup !== dupSig) {
      setAckDup(dupSig);
      setNotice({ kind: 'err', text: 'Duplicate found (see the warning above). Click "Download anyway" to continue, or fix the field first.' });
      return;
    }
    setBusy('download'); setNotice(null);
    let blobName = 'form.docx';
    let mac = fields.router_mac || '';
    try {
      const res = await api('/api/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: fields, date }),
      });
      const blob = await res.blob();
      blobName = decodeURIComponent(res.headers.get('X-Filename') || blobName);
      mac = res.headers.get('X-Mac') || mac;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = blobName;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e: any) {
      setNotice({ kind: 'err', text: `Download failed, no log was created. ${e.message}` });
      setBusy(null);
      return;
    }
    // Only reached after a successful download.
    try {
      const key = fields.connection_nms || fields.source_no || fields.name;
      // Everything the form knows goes straight into the log (empty values are skipped so a
      // re-download never wipes something typed into the log later).
      const ll = (fields.lat_long || '').match(/(-?\d+(?:\.\d+)?)\s*[,;\/\s]\s*(-?\d+(?:\.\d+)?)/);
      const KEEP_EMPTY: (keyof LogEntry)[] = ['customerName', 'nmsId', 'mac', 'edcNo', 'routerSerial'];
      const auto: Partial<LogEntry> = {
        date: logDate(date), requestType: 'New User ID',
        customerName: fields.name || '', nmsId: fields.connection_nms || '', mac,
        edcNo: fields.source_no || '', routerSerial: fields.router_serial || '',
        headTeacherPhone: fields.mobile || '',          // the form's mobile number is the head teacher's
        upazila: upazilaKey(fields.upazila) || fields.upazila || '',
        unionName: fields.union || '',
        lat: ll ? ll[1] : '', long: ll ? ll[2] : '',
        fiberLength: fields.cable_qty || '',
      };
      for (const k of Object.keys(auto) as (keyof LogEntry)[]) {
        if ((auto[k] === '' || auto[k] === undefined) && !KEEP_EMPTY.includes(k)) delete auto[k];
      }
      const saved = await onLog(auto, logged.current[key]);
      logged.current[key] = saved.id;
      setLastLogId(saved.id);
      setNotice({ kind: 'ok', text: `${blobName} downloaded. Log #${saved.logNo} saved.` });
    } catch (e: any) {
      setNotice({ kind: 'err', text: `${blobName} downloaded, but the log could not be saved: ${e.message}` });
    }
    setBusy(null);
  };

  const canDownload = !busy && Boolean(fields.name || fields.source_no || fields.connection_nms);
  const noticeCls: Record<string, string> = { ok: 'bg-emerald-50 text-emerald-800 border-emerald-200', err: 'bg-red-50 text-red-700 border-red-200', info: 'bg-slate-50 text-slate-700 border-slate-200' };

  return (
    <div className="w-full space-y-4">
      <div className="pb-3 border-b border-slate-200">
        <h1 className="text-sm font-semibold text-slate-900">Form Maker</h1>
        <p className="text-xs text-slate-500 mt-0.5">Look up an EDC number, review the fields, download the form. A log is added automatically once the download succeeds.</p>
      </div>

      <div className="bg-white rounded-2xl border border-brand-100 p-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <label className="flex-1 text-xs font-medium text-slate-600">EDC number
            <input className={`${inputCls} mt-1`} value={edc} onChange={e => setEdc(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && search()} placeholder="e.g. 1042" />
          </label>
          <label className="text-xs font-medium text-slate-600">Date
            <input type="date" className={`${inputCls} mt-1`} value={date} onChange={e => setDate(e.target.value)} />
          </label>
          <button onClick={search} disabled={busy !== null || !edc.trim()}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 rounded-full">
            {busy === 'search' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />} Look up
          </button>
        </div>

        {matches.length > 1 && (
          <div className="grid gap-2">
            {matches.map((m, i) => (
              <button key={i} onClick={() => apply(m)} className="text-left px-3 py-2 text-xs border border-slate-200 rounded hover:border-brand-500 hover:bg-brand-50">
                <span className="font-semibold">{m.data.name || '(no name)'}</span>
                <span className="text-slate-500"> · {m.sheet} · {m.data.union}</span>
              </button>
            ))}
          </div>
        )}

        {dups.length > 0 && (
          <div className="text-xs text-amber-900 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2.5 space-y-1">
            <div className="font-semibold">Already used on another log</div>
            {dups.map((d) => (
              <div key={d.field} className="break-words">
                {d.label} <span className="font-mono font-semibold">{d.value}</span> is on {d.others.slice(0, 3).map(describeLog).join('; ')}
                {d.others.length > 3 ? ` and ${d.others.length - 3} more` : ''}.
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {meta.map(f => (
            <label key={f.key} className="text-xs font-medium text-slate-600">{f.label}
              <input className={`${inputCls} mt-1`} value={fields[f.key] || ''}
                onChange={e => setFields(p => ({ ...p, [f.key]: e.target.value }))} />
            </label>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button onClick={download} disabled={!canDownload}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 rounded-full shadow-sm">
            {busy === 'download' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />} {dups.length > 0 && ackDup === dupSig ? 'Download anyway' : 'Download form & log it'}
          </button>
          {lastLogId && (
            <button onClick={() => onOpenLog(lastLogId)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:underline">
              <ExternalLink className="w-3.5 h-3.5" /> Open log to add details
            </button>
          )}
        </div>
        {notice && <div className={`text-xs px-3 py-2 border rounded ${noticeCls[notice.kind]}`}>{notice.text}</div>}
      </div>
    </div>
  );
};
