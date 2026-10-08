import React, { useMemo, useRef, useState } from 'react';
import { ClipboardCheck, Download, MessageCircle, Search, Upload } from 'lucide-react';
import { LogEntry, MarkAction, Reseller } from '../types';
import {
  awaitingByReseller, daysAwaiting, exportFormTracker, expectsForm, formStats, getOverdueDays,
  hasForm, planFormImport, setOverdueDays,
} from '../utils/forms';
import { PendingIndex, pendingFor } from '../utils/approvals';
import { matchReseller } from '../utils/resellers';
import { chaseMessage, waLink } from '../utils/whatsapp';
import { showDate } from '../utils/dates';
import { displayName } from '../utils/names';
import { matchIds, IdMatchResult } from '../utils/markIds';
import { IdMatchNote } from './IdMatchNote';

type Tab = 'awaiting' | 'received' | 'all';

interface Props {
  logs: LogEntry[];
  resellers: Reseller[];
  pending: PendingIndex;
  onToggleForm: (log: LogEntry) => void;
  onMarkMany: (logs: LogEntry[], action: MarkAction) => void;
  onOpenLog: (id: string) => void;
  initialTab?: Tab;
}

const resellerOf = (l: LogEntry) => l.resellerName?.trim() || 'Unassigned';

export const FormsTab: React.FC<Props> = ({ logs, resellers, pending, onToggleForm, onMarkMany, onOpenLog, initialTab = 'awaiting' }) => {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [search, setSearch] = useState('');
  const [reseller, setReseller] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [idsText, setIdsText] = useState('');
  const [idsNote, setIdsNote] = useState('');
  const [idsResult, setIdsResult] = useState<IdMatchResult | null>(null);
  const [idsAction, setIdsAction] = useState<MarkAction>('received');
  const [limit, setLimit] = useState(getOverdueDays());

  const fileRef = useRef<HTMLInputElement>(null);

  // Only logs that expect a signed form (New User ID / EDC book) belong in this list.
  const expecting = useMemo(() => logs.filter(expectsForm), [logs]);
  const stats = useMemo(() => formStats(logs), [logs]);
  const waiting = useMemo(() => awaitingByReseller(logs), [logs]);
  const pct = stats.sent ? Math.round((stats.received / stats.sent) * 100) : 0;
  const overdueCount = useMemo(
    () => expecting.filter((l) => !hasForm(l) && daysAwaiting(l) >= limit).length,
    [expecting, limit],
  );

  const byReseller = useMemo(() => {
    const m = new Map<string, { total: number; received: number }>();
    for (const l of expecting) {
      const k = resellerOf(l);
      const c = m.get(k) || { total: 0, received: 0 };
      c.total++;
      if (hasForm(l)) c.received++;
      m.set(k, c);
    }
    return [...m.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => (b.total - b.received) - (a.total - a.received) || a.name.localeCompare(b.name));
  }, [expecting]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return expecting.filter((l) => {
      if (tab === 'received' && !hasForm(l)) return false;
      if (tab === 'awaiting' && hasForm(l)) return false;
      if (reseller && resellerOf(l) !== reseller) return false;
      if (!q) return true;
      return [l.logNo, l.customerName, l.nameBn, l.nameEn, l.nmsId, l.edcNo, l.resellerName, l.upazila]
        .filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [expecting, tab, search, reseller]);

  const picks = rows.filter((l) => picked.has(l.id));
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allPicked = rows.length > 0 && rows.every((l) => picked.has(l.id));
  const pickAll = () => setPicked(allPicked ? new Set() : new Set(rows.map((l) => l.id)));

  const markPicked = (action: MarkAction) => {
    const target = picks.filter((l) => hasForm(l) !== (action === 'received'));
    if (!target.length) { setIdsNote('Nothing to change in the selection.'); return; }
    setIdsNote('');
    onMarkMany(target, action);
    setPicked(new Set());
  };

  // Paste a list of NMS IDs / EDC numbers / log numbers and mark them in one go.
  // `received` marks them received; `not_received` takes the mark off again.
  const markFromIds = (action: MarkAction = 'received') => {
    if (!idsText.trim()) { setIdsNote('Paste one or more NMS IDs first.'); setIdsResult(null); return; }
    const r = matchIds(idsText, expecting, (l) => hasForm(l) === (action === 'received'));
    setIdsNote('');
    setIdsAction(action);
    setIdsResult(r);
    if (r.target.length) onMarkMany(r.target, action);
  };

  const importFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const plan = await planFormImport(f, logs);
      setIdsNote(`File read: ${plan.toMark.length} to mark received · ${plan.already} already marked.`);
      if (plan.toMark.length) onMarkMany(plan.toMark.map((x) => x.log), 'received');
    } catch (err: any) {
      setIdsNote(err?.message || 'Could not read that file.');
    }
  };

  const tabs: { key: Tab; label: string; n: number }[] = [
    { key: 'awaiting', label: 'Awaiting', n: stats.awaiting },
    { key: 'received', label: 'Received', n: stats.received },
    { key: 'all', label: 'All', n: stats.sent },
  ];

  const btn = 'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand-900 bg-brand-50 border border-brand-200 rounded-xl hover:bg-brand-100 disabled:opacity-40';

  return (
    <div className="w-full space-y-4">
      <div className="pb-3 border-b border-slate-200 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5"><ClipboardCheck className="w-4 h-4" />Forms</h1>
          <p className="text-xs text-slate-500 mt-0.5">Signed forms from each institute. Marking goes to the admin for approval first.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!stats.sent} onClick={() => exportFormTracker(logs, false)} className={btn}><Download className="w-3.5 h-3.5" />Export all</button>
          <button type="button" disabled={!stats.awaiting} onClick={() => exportFormTracker(logs, true)} className={btn}><Download className="w-3.5 h-3.5" />Export awaiting</button>
          <button type="button" onClick={() => fileRef.current?.click()} className={btn}><Upload className="w-3.5 h-3.5" />Import received</button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={importFile} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-emerald-200 p-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Form received</div>
          <div className="mt-1.5 text-3xl font-bold font-display text-emerald-700">{stats.received}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">of {stats.sent} institutes · {pct}%</div>
          <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
        </div>
        <div className="bg-white rounded-2xl border border-rose-200 p-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Form awaited</div>
          <div className="mt-1.5 text-3xl font-bold font-display text-rose-700">{stats.awaiting}</div>
          <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
            <span className={`font-semibold ${overdueCount ? 'text-rose-700' : 'text-emerald-700'}`}>{overdueCount} overdue</span>
            <span>after</span>
            <input type="number" min={1} max={90} value={limit}
              onChange={(e) => { const n = parseInt(e.target.value, 10); if (n > 0 && n < 365) { setLimit(n); setOverdueDays(n); } }}
              className="w-11 px-1 py-0.5 border border-slate-300 rounded text-center" />
            <span>days</span>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-amber-200 p-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Waiting for admin</div>
          <div className="mt-1.5 text-3xl font-bold font-display text-amber-700">{expecting.filter((l) => pendingFor(pending, l.id, 'form')).length}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">form requests not yet approved</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <section className="lg:col-span-2 bg-white rounded-2xl border border-brand-100 shadow-sm overflow-hidden">
          <div className="p-3 border-b border-brand-100 bg-brand-50 flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-full border border-brand-200 bg-white overflow-hidden text-[11px] font-semibold">
              {tabs.map((t) => (
                <button key={t.key} type="button" onClick={() => { setTab(t.key); setPicked(new Set()); }}
                  className={`px-3 py-1 ${tab === t.key ? 'bg-brand-800 text-white' : 'text-slate-600 hover:bg-brand-50'}`}>
                  {t.label} <span className="font-mono opacity-80">{t.n}</span>
                </button>
              ))}
            </div>
            <div className="relative flex-1 min-w-[10rem]">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search institute, NMS ID, reseller"
                className="w-full h-8 pl-8 pr-2 text-xs border border-slate-200 rounded-full bg-white" />
            </div>
            <select value={reseller} onChange={(e) => setReseller(e.target.value)} className="h-8 px-2 text-xs border border-slate-200 rounded-full bg-white max-w-[11rem]">
              <option value="">All resellers</option>
              {byReseller.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
            </select>
          </div>

          <div className="px-3 py-2 border-b border-slate-100 flex flex-wrap items-center gap-2 text-[11px]">
            <label className="inline-flex items-center gap-1.5 text-slate-600">
              <input type="checkbox" checked={allPicked} onChange={pickAll} />Select all {rows.length}
            </label>
            {picks.length > 0 && (
              <>
                <span className="text-slate-500">{picks.length} selected</span>
                <button type="button" onClick={() => markPicked('received')} className="px-2.5 py-1 font-semibold text-white bg-emerald-700 rounded-full hover:bg-emerald-800">Mark form received</button>
                <button type="button" onClick={() => markPicked('not_received')} className="px-2.5 py-1 font-semibold text-slate-700 bg-white border border-slate-300 rounded-full hover:bg-slate-50">Mark not received</button>
              </>
            )}
          </div>

          {rows.length === 0 ? (
            <p className="px-3 py-10 text-xs text-slate-400 text-center">No institutes in this list.</p>
          ) : (
            <div className="max-h-[32rem] overflow-y-auto divide-y divide-slate-100">
              {rows.slice(0, 400).map((l) => {
                const pend = pendingFor(pending, l.id, 'form');
                const got = hasForm(l);
                const days = daysAwaiting(l);
                const late = !got && days >= limit;
                return (
                  <div key={l.id} className="px-3 py-2 flex flex-wrap sm:flex-nowrap items-center gap-x-2 gap-y-1 text-xs hover:bg-brand-50">
                    <input type="checkbox" checked={picked.has(l.id)} onChange={() => toggle(l.id)} />
                    <button type="button" onClick={() => onOpenLog(l.id)} className="flex-1 min-w-[11rem] text-left">
                      <span className="block font-semibold text-slate-900 truncate">#{l.logNo} · {displayName(l) || 'Untitled'}</span>
                      <span className="block text-[11px] text-slate-500 truncate">{[l.resellerName, l.nmsId, l.upazila].filter(Boolean).join(' · ')}</span>
                    </button>
                    {pend ? (
                      <button type="button" onClick={() => onToggleForm(l)} className="shrink-0 px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-amber-50 text-amber-800 border-amber-300" title="Waiting for admin - click to withdraw">
                        ⏳ {pend.action === 'received' ? 'received' : 'not received'} · waiting
                      </button>
                    ) : (
                      <button type="button" onClick={() => onToggleForm(l)}
                        className={`shrink-0 px-2 py-0.5 text-[10px] font-semibold rounded-full border ${got ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : late ? 'bg-rose-50 text-rose-700 border-rose-300 border-dashed' : 'bg-white text-slate-500 border-slate-300 border-dashed hover:bg-brand-50'}`}>
                        {got ? `✓ Received${l.formReceivedAt ? ` · ${showDate(new Date(l.formReceivedAt))}` : ''}` : `○ Awaited${days > 0 ? ` · ${days}d` : ''}${late ? ' · overdue' : ''}`}
                      </button>
                    )}
                  </div>
                );
              })}
              {rows.length > 400 && <p className="px-3 py-2 text-[11px] text-slate-400 text-center">Showing the first 400 of {rows.length}. Use search or the reseller filter to narrow the list.</p>}
            </div>
          )}
        </section>

        <div className="space-y-3">
          <section className="bg-white rounded-2xl border border-brand-100 shadow-sm overflow-hidden">
            <h2 className="px-3 py-2 text-xs font-semibold text-brand-800 bg-brand-50 border-b border-brand-100">By reseller</h2>
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
              {byReseller.map((r) => {
                const awaiting = waiting.get(r.name) || waiting.get(r.name === 'Unassigned' ? 'Unassigned Reseller' : r.name) || [];
                const rs = matchReseller({ resellerName: r.name }, resellers);
                const phone = rs?.phone || awaiting.find((l) => l.resellerPhone)?.resellerPhone || '';
                const wa = awaiting.length ? waLink(phone, chaseMessage(r.name, awaiting)) : null;
                return (
                  <div key={r.name} className={`flex items-center hover:bg-brand-50 ${reseller === r.name ? 'bg-brand-50' : ''}`}>
                    <button type="button" onClick={() => { setReseller(reseller === r.name ? '' : r.name); setTab('awaiting'); }}
                      className="flex-1 min-w-0 px-3 py-1.5 flex items-center gap-2 text-xs text-left">
                      <span className="flex-1 truncate font-medium text-slate-800">{r.name}</span>
                      <span className="font-mono text-[11px] text-emerald-700">{r.received}</span>
                      <span className="font-mono text-[11px] text-slate-400">/ {r.total}</span>
                      <span className={`font-mono text-[11px] w-10 text-right ${r.total - r.received ? 'text-rose-700' : 'text-emerald-700'}`}>{r.total - r.received ? `-${r.total - r.received}` : '✓'}</span>
                    </button>
                    {awaiting.length > 0 && (wa ? (
                      <a href={wa} target="_blank" rel="noopener noreferrer" title={`WhatsApp ${r.name} about ${awaiting.length} awaiting form${awaiting.length === 1 ? '' : 's'}`}
                        className="shrink-0 p-1.5 mr-1 text-emerald-700 hover:bg-emerald-100 rounded-full"><MessageCircle className="w-3.5 h-3.5" /></a>
                    ) : (
                      <span title="No phone number saved for this reseller (add it in Reseller Directory)" className="shrink-0 p-1.5 mr-1 text-slate-300"><MessageCircle className="w-3.5 h-3.5" /></span>
                    ))}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-brand-100 shadow-sm p-3 space-y-2">
            <h2 className="text-xs font-semibold text-brand-800">Mark many at once</h2>
            <p className="text-[11px] text-slate-500">Paste NMS IDs (or EDC / log numbers), separated by spaces, commas or new lines. They are sent as "form received" or "not received" requests - for received you will be asked the date.</p>
            <textarea value={idsText} onChange={(e) => setIdsText(e.target.value)} rows={4} placeholder="55001 55002 55003"
              className="w-full px-2 py-1.5 text-xs font-mono border border-slate-200 rounded-lg" />
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => markFromIds('received')} className="h-8 text-xs font-semibold text-white bg-brand-800 rounded-lg hover:bg-brand-900">Mark received</button>
              <button type="button" onClick={() => markFromIds('not_received')} className="h-8 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50">Mark not received</button>
            </div>
            {idsNote && <p className="text-[11px] text-slate-600">{idsNote}</p>}
            {idsResult && <IdMatchNote result={idsResult} noun={idsAction === 'received' ? 'received' : 'not received'} />}
          </section>
        </div>
      </div>
    </div>
  );
};
