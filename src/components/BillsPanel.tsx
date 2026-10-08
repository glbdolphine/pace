import React, { useMemo, useState } from 'react';
import { displayCategory } from '../utils/category';
import { Download, Receipt, Search } from 'lucide-react';
import * as XLSX from 'xlsx';
import { LogEntry, MarkAction } from '../types';
import { billMonthCounts, billMonthsOf, billStats, hasBill } from '../utils/bills';
import { monthKey, monthLabel } from '../utils/months';
import { MonthSelect } from './MonthSelect';
import { PendingIndex, pendingFor } from '../utils/approvals';
import { showDate } from '../utils/dates';
import { displayName } from '../utils/names';
import { matchIds, IdMatchResult } from '../utils/markIds';
import { IdMatchNote } from './IdMatchNote';

type Tab = 'not_received' | 'received' | 'all';

interface Props {
  logs: LogEntry[];
  pending: PendingIndex;
  onToggleBill: (log: LogEntry, month?: string) => void;
  onMarkMany: (logs: LogEntry[], action: MarkAction, month?: string) => void;
  onOpenLog: (id: string) => void;
}

const resellerOf = (l: LogEntry) => l.resellerName?.trim() || 'Unassigned';

export const BillsPanel: React.FC<Props> = ({ logs, pending, onToggleBill, onMarkMany, onOpenLog }) => {
  const [tab, setTab] = useState<Tab>('not_received');
  const [search, setSearch] = useState('');
  const [reseller, setReseller] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [idsText, setIdsText] = useState('');
  const [idsNote, setIdsNote] = useState('');
  const [idsResult, setIdsResult] = useState<IdMatchResult | null>(null);
  const [idsAction, setIdsAction] = useState<MarkAction>('received');

  // Bills arrive month by month, so "received" always means received for the picked month.
  const monthCounts = useMemo(() => billMonthCounts(logs), [logs]);
  const [pickedMonth, setPickedMonth] = useState<string | null>(null);
  const month = pickedMonth ?? ([...monthCounts.keys()].sort().pop() || monthKey());
  const monthText = monthLabel(month);
  const stats = useMemo(() => billStats(logs, month), [logs, month]);

  const byReseller = useMemo(() => {
    const m = new Map<string, { total: number; received: number }>();
    for (const l of logs) {
      const k = resellerOf(l);
      const c = m.get(k) || { total: 0, received: 0 };
      c.total++;
      if (hasBill(l, month)) c.received++;
      m.set(k, c);
    }
    return [...m.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => (b.total - b.received) - (a.total - a.received) || a.name.localeCompare(b.name));
  }, [logs, month]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((l) => {
      if (tab === 'received' && !hasBill(l, month)) return false;
      if (tab === 'not_received' && hasBill(l, month)) return false;
      if (reseller && resellerOf(l) !== reseller) return false;
      if (!q) return true;
      return [l.logNo, l.customerName, l.nameBn, l.nameEn, l.nmsId, l.edcNo, l.resellerName, l.upazila].filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [logs, tab, search, reseller, month]);

  const picks = rows.filter((l) => picked.has(l.id));
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allPicked = rows.length > 0 && rows.every((l) => picked.has(l.id));
  const pickAll = () => setPicked(allPicked ? new Set() : new Set(rows.map((l) => l.id)));

  const markPicked = (action: MarkAction) => {
    const target = picks.filter((l) => hasBill(l, month) !== (action === 'received'));
    if (!target.length) { setIdsNote('Nothing to change in the selection.'); return; }
    setIdsNote('');
    onMarkMany(target, action, month);
    setPicked(new Set());
  };

  // Paste a list of NMS IDs / EDC numbers / log numbers and mark them in one go.
  // `received` marks them received (the month is asked next); `not_received` takes off the bill for the month picked at the top.
  const markFromIds = (action: MarkAction = 'received') => {
    if (!idsText.trim()) { setIdsNote('Paste one or more NMS IDs first.'); setIdsResult(null); return; }
    const r = matchIds(idsText, logs, (l) => hasBill(l, month) === (action === 'received'));
    setIdsNote('');
    setIdsAction(action);
    setIdsResult(r);
    if (r.target.length) onMarkMany(r.target, action, month);
  };

  const exportList = () => {
    const data = rows.map((l) => ({
      'Log No': l.logNo,
      'Institute (Bangla)': l.nameBn || l.customerName,
      'Institute (English)': l.nameEn || '',
      'NMS ID': l.nmsId,
      'Reseller': l.resellerName,
      'Upazila': l.upazila || '',
      'Category / POP': displayCategory(l),
      'Bill month': monthText,
      'Bill': hasBill(l, month) ? 'Received' : 'Not received',
      'Bill received months': billMonthsOf(l).map((m) => monthLabel(m)).join(', '),
      'Latest bill received on': l.billReceivedAt ? showDate(new Date(l.billReceivedAt)) : '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bills');
    XLSX.writeFile(wb, `Pace_IT_Bills_${month}_${tab}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const tabs: { key: Tab; label: string; n: number }[] = [
    { key: 'not_received', label: 'Pending', n: stats.notReceived },
    { key: 'received', label: 'Received', n: stats.received },
    { key: 'all', label: 'All', n: stats.total },
  ];

  return (
    <div className="w-full space-y-4">
      <div className="pb-3 border-b border-slate-200 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5"><Receipt className="w-4 h-4" />Bills</h1>
          <p className="text-xs text-slate-500 mt-0.5">Monthly billing records and batch status by reseller.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <MonthSelect value={month} onChange={(m) => { setPickedMonth(m); setPicked(new Set()); }} counts={monthCounts}
          title="Bills are marked for this receiving month" />
        <button type="button" onClick={exportList} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand-900 bg-brand-50 border border-brand-200 rounded-xl hover:bg-brand-100">
          <Download className="w-3.5 h-3.5" />Export this list
        </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-sky-200 p-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Received · {monthText}</div>
          <div className="mt-1.5 text-3xl font-bold font-display text-sky-700">{stats.received}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">of {stats.total} institutes · {stats.pct}%</div>
          <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-sky-500" style={{ width: `${stats.pct}%` }} /></div>
        </div>
        <div className="bg-white rounded-2xl border border-rose-200 p-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Pending</div>
          <div className="mt-1.5 text-3xl font-bold font-display text-rose-700">{stats.notReceived}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">remaining for {monthText}</div>
        </div>
        <div className="bg-white rounded-2xl border border-amber-200 p-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Waiting for admin</div>
          <div className="mt-1.5 text-3xl font-bold font-display text-amber-700">{logs.filter((l) => pendingFor(pending, l.id, 'bill', month)).length}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">requests pending approval</div>
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
                <button type="button" onClick={() => markPicked('received')} className="px-2.5 py-1 font-semibold text-white bg-sky-700 rounded-full hover:bg-sky-800">Mark received</button>
                <button type="button" onClick={() => markPicked('not_received')} className="px-2.5 py-1 font-semibold text-slate-700 bg-white border border-slate-300 rounded-full hover:bg-slate-50">Mark not received</button>
              </>
            )}
          </div>

          {rows.length === 0 ? (
            <p className="px-3 py-10 text-xs text-slate-400 text-center">No institutes in this list.</p>
          ) : (
            <div className="max-h-[32rem] overflow-y-auto divide-y divide-slate-100">
              {rows.slice(0, 400).map((l) => {
                const pend = pendingFor(pending, l.id, 'bill', month);
                const got = hasBill(l, month);
                return (
                  <div key={l.id} className="px-3 py-2 flex flex-wrap sm:flex-nowrap items-center gap-x-2 gap-y-1 text-xs hover:bg-brand-50">
                    <input type="checkbox" checked={picked.has(l.id)} onChange={() => toggle(l.id)} />
                    <button type="button" onClick={() => onOpenLog(l.id)} className="flex-1 min-w-[11rem] text-left">
                      <span className="block font-semibold text-slate-900 truncate">#{l.logNo} · {displayName(l) || 'Untitled'}</span>
                      <span className="block text-[11px] text-slate-500 truncate">{[l.resellerName, l.nmsId, l.upazila].filter(Boolean).join(' · ')}</span>
                    </button>
                    {pend ? (
                      <button type="button" onClick={() => onToggleBill(l, month)} className="shrink-0 px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-amber-50 text-amber-800 border-amber-300" title="Waiting for admin - click to withdraw">
                        ⏳ {pend.action === 'received' ? 'received' : 'not received'} · waiting
                      </button>
                    ) : (
                      <button type="button" onClick={() => onToggleBill(l, month)}
                        className={`shrink-0 px-2 py-0.5 text-[10px] font-semibold rounded-full border ${got ? 'bg-sky-100 text-sky-800 border-sky-200' : 'bg-white text-slate-500 border-slate-300 border-dashed hover:bg-brand-50'}`}>
                        {got ? `✓ Received · ${monthLabel(month, true)}` : '○ Not received'}
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
              {byReseller.map((r) => (
                <button key={r.name} type="button" onClick={() => { setReseller(reseller === r.name ? '' : r.name); setTab('not_received'); }}
                  className={`w-full px-3 py-1.5 flex items-center gap-2 text-xs text-left hover:bg-brand-50 ${reseller === r.name ? 'bg-brand-50' : ''}`}>
                  <span className="flex-1 truncate font-medium text-slate-800">{r.name}</span>
                  <span className="font-mono text-[11px] text-sky-700">{r.received}</span>
                  <span className="font-mono text-[11px] text-slate-400">/ {r.total}</span>
                  <span className={`font-mono text-[11px] w-10 text-right ${r.total - r.received ? 'text-rose-700' : 'text-emerald-700'}`}>{r.total - r.received ? `-${r.total - r.received}` : '✓'}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-brand-100 shadow-sm p-3 space-y-2">
            <h2 className="text-xs font-semibold text-brand-800">Bulk mark by NMS ID</h2>
            <p className="text-[11px] text-slate-500">Paste NMS IDs, EDC numbers, or log numbers separated by spaces, commas, or new lines.</p>
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
