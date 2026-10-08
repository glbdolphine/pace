import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardCheck, Download, Upload, X, AlertTriangle, MessageCircle } from 'lucide-react';
import { LogEntry, Reseller } from '../types';
import {
  FormFilter, ImportPlan, exportFormTracker, formStats, planFormImport,
  awaitingByReseller, daysAwaiting, getOverdueDays, setOverdueDays,
} from '../utils/forms';
import { matchReseller } from '../utils/resellers';
import { chaseMessage, waLink } from '../utils/whatsapp';

interface Props {
  logs: LogEntry[];
  resellers: Reseller[];
  formFilter: FormFilter;
  onFormFilter: (f: FormFilter) => void;
  onPickReseller: (name: string) => void;
  onApplyImport: (plan: ImportPlan) => Promise<void>;
}

const FILTERS: { key: FormFilter; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'awaiting', label: 'Awaiting' }, { key: 'received', label: 'Received' },
];

export const FormsPanel: React.FC<Props> = ({ logs, resellers, formFilter, onFormFilter, onPickReseller, onApplyImport }) => {
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const st = useMemo(() => formStats(logs), [logs]);
  const [limit, setLimit] = useState(getOverdueDays());
  const waiting = useMemo(() => awaitingByReseller(logs), [logs]);
  const overdueTotal = useMemo(
    () => [...waiting.values()].reduce((n, arr) => n + arr.filter((l) => daysAwaiting(l) >= limit).length, 0),
    [waiting, limit],
  );
  const pct = st.sent ? Math.round((st.received / st.sent) * 100) : 0;

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    window.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); window.removeEventListener('keydown', esc); };
  }, [open]);

  const pickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setError(''); setPlan(null);
    try { setPlan(await planFormImport(f, logs)); }
    catch (err: any) { setError(err?.message || 'Could not read that file.'); }
  };

  const apply = async () => {
    if (!plan) return;
    setBusy(true);
    try { await onApplyImport(plan); setPlan(null); } finally { setBusy(false); }
  };

  const active = formFilter !== 'all';
  const btn = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border rounded-full transition-colors';

  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className={`${btn} ${active ? 'bg-brand-600 text-white border-brand-600' : 'text-slate-700 bg-white border-brand-100 hover:bg-brand-50'}`}>
        <ClipboardCheck className="w-3.5 h-3.5" />
        <span>Forms {st.received}/{st.sent}{active ? ` · ${formFilter}` : ''}</span>
      </button>

      {open && (
        <div className="absolute right-0 md:left-auto left-0 top-full mt-2 z-50 w-[min(92vw,22rem)] bg-white rounded-2xl border border-brand-100 shadow-xl p-4 space-y-3 text-xs">
          <div>
            <div className="flex items-baseline justify-between">
              <span className="font-semibold text-slate-900 text-sm">Signed forms</span>
              <span className="text-slate-500">{st.received} of {st.sent} received · {st.awaiting} awaiting</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-brand-50 overflow-hidden"><div className="h-full bg-brand-500" style={{ width: `${pct}%` }} /></div>
            <p className="mt-1.5 text-[11px] text-slate-500">Every "New User ID" log expects one signed form back.</p>
            <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-600">
              <span className={`font-semibold ${overdueTotal ? 'text-rose-700' : 'text-emerald-700'}`}>{overdueTotal} overdue</span>
              <span>· overdue after</span>
              <input type="number" min={1} max={90} value={limit}
                onChange={(e) => { const n = parseInt(e.target.value, 10); if (n > 0 && n < 365) { setLimit(n); setOverdueDays(n); } }}
                className="w-12 px-1.5 py-0.5 border border-slate-300 rounded text-center" />
              <span>days</span>
            </div>
          </div>

          <div className="flex items-center bg-brand-50 p-0.5 rounded-full border border-brand-100">
            {FILTERS.map((f) => (
              <button key={f.key} type="button" onClick={() => { onFormFilter(f.key); setOpen(false); }}
                className={`flex-1 px-2 py-1.5 rounded-full ${formFilter === f.key ? 'bg-white text-brand-800 font-semibold shadow-sm' : 'text-slate-600'}`}>
                {f.label}
              </button>
            ))}
          </div>

          {st.rows.length > 0 && (
            <div className="max-h-60 overflow-y-auto -mx-1">
              {st.rows.map((r) => {
                const left = r.sent - r.received;
                const awaiting = waiting.get(r.key) || [];
                const oldest = awaiting.length ? daysAwaiting(awaiting[0]) : 0;
                const late = awaiting.length > 0 && oldest >= limit;
                const rs = matchReseller({ resellerName: r.name }, resellers);
                const phone = rs?.phone || awaiting.find((l) => l.resellerPhone)?.resellerPhone || '';
                const wa = awaiting.length ? waLink(phone, chaseMessage(r.name, awaiting)) : null;
                return (
                  <div key={r.key} className="flex items-center gap-1 rounded hover:bg-brand-50">
                    <button type="button" onClick={() => { onPickReseller(r.name); setOpen(false); }}
                      className="flex-1 min-w-0 text-left px-1 py-1.5 flex items-center gap-2" title="Show this reseller's awaiting forms">
                      <span className="flex-1 min-w-0 truncate text-slate-800">{r.name}</span>
                      {awaiting.length > 0 && (
                        <span className={`shrink-0 text-[10px] ${late ? 'text-rose-700 font-semibold' : 'text-slate-400'}`}>oldest {oldest}d</span>
                      )}
                      <span className={`font-mono shrink-0 ${left ? 'text-rose-700' : 'text-emerald-700'}`}>{r.received}/{r.sent}</span>
                    </button>
                    {awaiting.length > 0 && (wa ? (
                      <a href={wa} target="_blank" rel="noopener noreferrer" title={`WhatsApp ${r.name} about ${awaiting.length} awaiting form${awaiting.length === 1 ? '' : 's'}`}
                        className="shrink-0 p-1.5 text-emerald-700 hover:bg-emerald-100 rounded-full"><MessageCircle className="w-3.5 h-3.5" /></a>
                    ) : (
                      <span title="No phone number saved for this reseller (add it in Reseller List)" className="shrink-0 p-1.5 text-slate-300"><MessageCircle className="w-3.5 h-3.5" /></span>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          <div className="pt-2 border-t border-slate-100 space-y-2">
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={!st.sent} onClick={() => exportFormTracker(logs, false)} className={`${btn} border-brand-100 bg-white hover:bg-brand-50 disabled:opacity-40`}>
                <Download className="w-3.5 h-3.5" />Export all
              </button>
              <button type="button" disabled={!st.awaiting} onClick={() => exportFormTracker(logs, true)} className={`${btn} border-brand-100 bg-white hover:bg-brand-50 disabled:opacity-40`}>
                <Download className="w-3.5 h-3.5" />Export awaiting
              </button>
              <button type="button" onClick={() => fileRef.current?.click()} className={`${btn} border-brand-100 bg-white hover:bg-brand-50`}>
                <Upload className="w-3.5 h-3.5" />Import received
              </button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={pickFile} />
            </div>
            <p className="text-[11px] text-slate-500">Import reads an Excel/CSV with an NMS ID column (such as a file you exported). It only marks forms as received, never removes.</p>
            {error && <div className="flex gap-1.5 items-start text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />{error}</div>}
          </div>
        </div>
      )}

      {plan && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl border border-slate-200 p-5 text-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">Import preview</h3>
              <button type="button" onClick={() => setPlan(null)} aria-label="Close" className="p-1 text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
            </div>
            <ul className="space-y-1 text-slate-700">
              <li><span className="font-semibold text-emerald-700">{plan.toMark.length}</span> forms will be sent as "received" requests (the admin approves them)</li>
              <li><span className="font-semibold">{plan.already}</span> were already marked</li>
              <li><span className={`font-semibold ${plan.notFound.length ? 'text-rose-700' : ''}`}>{plan.notFound.length}</span> NMS IDs not found in your New User ID logs</li>
            </ul>
            {plan.notFound.length > 0 && (
              <p className="text-[11px] text-slate-500 break-words max-h-20 overflow-y-auto">Not found: {plan.notFound.slice(0, 30).join(', ')}{plan.notFound.length > 30 ? ` +${plan.notFound.length - 30} more` : ''}</p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setPlan(null)} className="px-3 py-1.5 text-xs rounded-full border border-slate-200 hover:bg-slate-50">Cancel</button>
              <button type="button" disabled={busy || !plan.toMark.length} onClick={apply}
                className="px-3 py-1.5 text-xs font-medium text-white bg-brand-800 hover:bg-brand-900 rounded-full disabled:opacity-40">
                {busy ? 'Saving…' : `Request ${plan.toMark.length} as received`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
