import React, { useEffect, useRef, useState } from 'react';
import { displayCategory } from '../utils/category';
import { X, ChevronRight } from 'lucide-react';
import { LogEntry, Reseller } from '../types';
import { LogSheetView } from './LogSheetView';
import type { ViewMode } from './LogsToolbar';
import { followState, followLabel } from '../utils/followUps';
import { logUpazila } from '../utils/upazilas';
import { cleanCategoryLabel } from '../utils/csvImporter';
import { hasBill, latestBillMonth } from '../utils/bills';
import { monthKey, monthLabel } from '../utils/months';
import { PendingIndex, pendingFor } from '../utils/approvals';

const tone = (status = '') => {
  const s = status.toLowerCase();
  if (s.includes('resolved') || s.includes('closed')) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (s.includes('progress')) return 'bg-amber-100 text-amber-800 border-amber-200';
  if (s.includes('pending') || s.includes('waiting')) return 'bg-rose-100 text-rose-800 border-rose-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
};

const Badge: React.FC<{ status?: string }> = ({ status }) => (
  <span className={`inline-block max-w-full truncate px-2 py-0.5 text-[10px] font-semibold rounded-full border ${tone(status)}`}>
    {status || '—'}
  </span>
);

const PendingChip: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <span role="button" tabIndex={0} title="Waiting for admin approval - click to withdraw the request"
    onClick={(e) => { e.stopPropagation(); onClick(); }}
    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onClick(); } }}
    className="inline-flex items-center gap-1 shrink-0 px-2 py-0.5 text-[10px] font-semibold rounded-full border cursor-pointer bg-amber-50 text-amber-800 border-amber-300">
    ⏳ {label}
  </span>
);

const BillChip: React.FC<{ log: LogEntry; onToggle: (l: LogEntry) => void; pending?: PendingIndex }> = ({ log, onToggle, pending }) => {
  const cur = monthKey();
  const pend = pendingFor(pending, log.id, 'bill', cur);
  if (pend) return <PendingChip label={`Bill ${pend.action === 'received' ? 'received' : 'not received'} · ${monthLabel(cur, true)} · waiting for admin`} onClick={() => onToggle(log)} />;
  const got = hasBill(log);
  const gotNow = hasBill(log, cur);
  const latest = latestBillMonth(log);
  return (
    <span role="button" tabIndex={0} title={gotNow ? `Bill for ${monthLabel(cur)} received - click to mark not received` : `Click to mark the ${monthLabel(cur)} bill received`}
      onClick={(e) => { e.stopPropagation(); onToggle(log); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onToggle(log); } }}
      className={`inline-flex items-center gap-1 shrink-0 px-2 py-0.5 text-[10px] font-semibold rounded-full border cursor-pointer ${
        got ? 'bg-sky-100 text-sky-800 border-sky-200' : 'bg-white text-slate-500 border-slate-300 border-dashed hover:bg-brand-50'}`}>
      {got ? `✓ Bill · ${monthLabel(latest, true)}` : '○ Bill not received'}
    </span>
  );
};

const FollowChip: React.FC<{ log: LogEntry }> = ({ log }) => {
  const st = followState(log);
  if (!st) return null;
  const cls = st === 'overdue' ? 'bg-rose-100 text-rose-800 border-rose-300'
    : st === 'today' ? 'bg-amber-100 text-amber-800 border-amber-300'
    : 'bg-slate-50 text-slate-600 border-slate-200';
  return <span className={`inline-block shrink-0 px-2 py-0.5 text-[10px] font-semibold rounded-full border ${cls}`}>{followLabel(log)}</span>;
};

const rowProps = (onOpen: () => void) => ({
  role: 'button' as const, tabIndex: 0, onClick: onOpen,
  onKeyDown: (e: React.KeyboardEvent) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(); } },
});

interface ListProps { logs: LogEntry[]; resetKey?: string; mode: ViewMode; resellers: Reseller[]; onOpen: (log: LogEntry) => void; onToggleForm: (log: LogEntry) => void; onToggleBill?: (log: LogEntry) => void; pending?: PendingIndex; }

const PAGE = 100;

export const LogList: React.FC<ListProps> = ({ logs: allLogs, resetKey, mode, resellers, onOpen, onToggleForm, onToggleBill, pending }) => {
  // Thousands of rows are never drawn at once: show a page, load the next page on scroll.
  const [visible, setVisible] = useState(PAGE);
  const sentinel = useRef<HTMLDivElement>(null);
  const total = allLogs.length;
  const logs = total > visible ? allLogs.slice(0, visible) : allLogs;

  // a new filter / sort / search starts again from the first page
  useEffect(() => { setVisible(PAGE); }, [resetKey]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || visible >= total) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setVisible((v) => v + PAGE);
    }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [visible, total]);

  const more = total > visible ? (
    <div ref={sentinel} className="no-print flex items-center justify-center gap-3 py-4 text-xs text-slate-500">
      <span>Showing {visible.toLocaleString()} of {total.toLocaleString()}</span>
      <button type="button" onClick={() => setVisible((v) => v + PAGE)}
        className="px-3 py-1.5 font-semibold text-brand-800 bg-white border border-brand-100 rounded-full hover:bg-brand-50">
        Show more
      </button>
    </div>
  ) : null;

  if (mode === 'card') {
    return (
      <div className="no-print grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {logs.map((l, i) => (
          <div key={l.id} id={`item-${l.id}`} {...rowProps(() => onOpen(l))}
            className="cursor-pointer text-left bg-white rounded-2xl border border-brand-100 p-4 shadow-sm hover:shadow-md hover:border-brand-300 transition scroll-mt-40 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs font-semibold text-brand-700 bg-brand-50 border border-brand-100 rounded-full px-2 py-0.5" title={`Log no. ${l.logNo}`}>#{i + 1}</span>
              <Badge status={l.status} />
            </div>
            <div className="font-semibold text-slate-900 leading-snug break-words">{l.customerName || 'Untitled'}</div>
            {displayCategory(l) && (
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                  {cleanCategoryLabel(displayCategory(l))}
                </span>
                {!l.mac && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                    MAC empty
                  </span>
                )}
              </div>
            )}
            <div className="text-xs text-slate-500 break-words">{[l.resellerName, l.resellerPhone].filter(Boolean).join(' · ')}</div>
            {(logUpazila(l, resellers) || l.upazila || l.unionName || l.fiberLength) && (
              <div className="text-[11px] text-slate-600 flex flex-wrap items-center gap-1.5 font-medium">
                {[logUpazila(l, resellers) || l.upazila, l.unionName].filter(Boolean).join(', ')}
                {l.fiberLength && <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[10px] font-mono">{l.fiberLength}m fiber</span>}
              </div>
            )}
            {l.issueFound && <p className="text-xs text-slate-600 line-clamp-2 break-words">{l.issueFound}</p>}
            <div className="mt-auto pt-2 flex items-center justify-between gap-2 text-[11px] text-slate-500 border-t border-slate-100">
              <span className="truncate">{l.requestType}</span>
              <span className="font-mono shrink-0">{l.nmsId || l.date}</span>
            </div>
            {(l.edcNo || l.headTeacherPhone) && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-600">
                {l.edcNo && <span className="font-mono">EDC {l.edcNo}</span>}
                {l.headTeacherPhone && (
                  <a href={`tel:${l.headTeacherPhone.replace(/[^0-9+]/g, '')}`} onClick={(e) => e.stopPropagation()} className="font-mono text-brand-700 underline underline-offset-2">{l.headTeacherPhone}</a>
                )}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-1.5">
              {onToggleBill && <BillChip log={l} onToggle={onToggleBill} pending={pending} />}
              <FollowChip log={l} />
            </div>
          </div>
        ))}
        {more && <div className="col-span-full">{more}</div>}
      </div>
    );
  }

  const cols = 'grid-cols-[2rem_minmax(0,1fr)_1rem] md:grid-cols-[3rem_6.5rem_1.1fr_2fr_6rem_6rem_9rem_9rem_1rem]';
  return (
    <div className="no-print bg-white rounded-2xl border border-brand-100 shadow-sm overflow-hidden">
      <div className={`hidden md:grid ${cols} gap-x-3 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-brand-800 bg-brand-50 border-b border-brand-100`}>
        <span className="text-center">#</span><span className="text-center">Date</span><span className="text-center">Reseller</span><span className="text-center">Customer</span><span className="text-center">EDC No.</span><span className="text-center">NMS ID</span><span className="text-center">Status</span><span className="text-center">Head Teacher Phone</span><span />
      </div>
      {logs.map((l, i) => (
        <div key={l.id} id={`item-${l.id}`} {...rowProps(() => onOpen(l))}
          className={`cursor-pointer w-full text-left grid ${cols} gap-x-3 items-center px-3 md:px-4 py-3 border-b border-slate-100 last:border-b-0 hover:bg-brand-50 transition-colors scroll-mt-40 text-sm`}>
          <span className="font-mono text-xs font-semibold text-brand-700 text-center" title={`Log no. ${l.logNo}`}>{i + 1}</span>
          <span className="md:hidden min-w-0 space-y-1">
            <span className="block font-semibold text-slate-900 leading-snug break-words line-clamp-2">{l.customerName || 'Untitled'}</span>
            <span className="block text-xs text-slate-500 break-words">{[l.resellerName, logUpazila(l, resellers) || l.upazila, l.date].filter(Boolean).join(' · ')}</span>
            <span className="flex flex-wrap items-center gap-1">
              <Badge status={l.status} />
              {displayCategory(l) && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">{cleanCategoryLabel(displayCategory(l))}</span>
              )}
              <FollowChip log={l} />
            </span>
            {(l.nmsId || l.edcNo || l.headTeacherPhone) && (
              <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-600">
                {l.nmsId && <span className="font-mono">NMS {l.nmsId}</span>}
                {l.edcNo && <span className="font-mono">EDC {l.edcNo}</span>}
                {l.headTeacherPhone && (
                  <a href={`tel:${l.headTeacherPhone.replace(/[^0-9+]/g, '')}`} onClick={(e) => e.stopPropagation()} className="font-mono text-brand-700 underline underline-offset-2">{l.headTeacherPhone}</a>
                )}
              </span>
            )}
          </span>
          <span className="hidden md:block text-center text-xs text-slate-600">{l.date}</span>
          <span className="hidden md:block text-center truncate text-slate-700">{l.resellerName}</span>
          <span className="hidden md:flex flex-col items-center text-center gap-0.5 min-w-0">
            <span className="flex items-center justify-center gap-1.5 min-w-0 max-w-full">
              <span className="truncate font-semibold text-slate-900">{l.customerName}</span>
              <FollowChip log={l} />
            </span>
            {displayCategory(l) && (
              <span className="text-[10px] font-medium text-purple-700 truncate">
                {cleanCategoryLabel(displayCategory(l))}
              </span>
            )}
          </span>
          <span className="hidden md:block text-center truncate font-mono text-xs text-slate-600">{l.edcNo || '—'}</span>
          <span className="hidden md:block text-center truncate font-mono text-xs text-slate-600">{l.nmsId}</span>
          <span className="hidden md:flex justify-center min-w-0"><Badge status={l.status} /></span>
          <span className="hidden md:block text-center truncate font-mono text-xs text-slate-600">{l.headTeacherPhone || '—'}</span>
          <ChevronRight className="w-4 h-4 text-slate-300" />
        </div>
      ))}
      {more}
    </div>
  );
};

interface ModalProps {
  log: LogEntry | null;
  onClose: () => void;
  onEdit: (log: LogEntry) => void;
  onDuplicate: (log: LogEntry) => void;
  onDelete: (id: string) => void;
  onToggleForm: (log: LogEntry) => void;
  onToggleBill?: (log: LogEntry) => void;
  pending?: PendingIndex;
  resellers?: Reseller[];
}

export const LogDetailModal: React.FC<ModalProps> = ({ log, onClose, onEdit, onDuplicate, onDelete, onToggleForm, onToggleBill, pending, resellers = [] }) => {
  useEffect(() => {
    if (!log) return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = prev; };
  }, [log, onClose]);
  if (!log) return null;
  return (
    <div className="log-modal-overlay fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-sm sm:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="log-modal-panel max-w-4xl mx-auto bg-[#eef8f1] min-h-full sm:min-h-0 sm:rounded-2xl shadow-2xl p-3 sm:p-5">
        <div className="no-print flex justify-end mb-2">
          <button onClick={onClose} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-brand-100 rounded-full hover:bg-brand-50">
            <X className="w-3.5 h-3.5" /> Close
          </button>
        </div>
        <LogSheetView log={log} resellers={resellers} onEdit={onEdit} onDuplicate={onDuplicate} onDelete={onDelete} onToggleForm={onToggleForm} onToggleBill={onToggleBill} pending={pending} />
      </div>
    </div>
  );
};
