import React from 'react';
import { CheckCheck, Hourglass, X } from 'lucide-react';
import { ApprovalRequest } from '../types';
import { formatStamp } from '../utils/activity';
import { actionLabel, kindLabel } from '../utils/approvals';
import { monthLabel } from '../utils/months';

interface Props {
  approvals: ApprovalRequest[];
  isAdmin: boolean;
  currentName: string;
  busy?: boolean;
  onApproveAll: () => void;
  onRejectAll: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onWithdraw: (id: string) => void;
  onOpenLog?: (logId: string) => void;
}

/** The "waiting for confirmation" list. Everyone can see it; only the admin can approve. */
export const ApprovalsPanel: React.FC<Props> = ({
  approvals, isAdmin, currentName, busy, onApproveAll, onRejectAll, onApprove, onReject, onWithdraw, onOpenLog,
}) => {
  const pending = approvals.filter((a) => a.status === 'pending');
  const forms = pending.filter((a) => a.kind === 'form').length;
  const bills = pending.filter((a) => a.kind === 'bill').length;

  return (
    <section className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
      <h2 className="px-3 py-2 text-xs font-semibold text-amber-900 bg-amber-50 border-b border-amber-200 flex flex-wrap items-center gap-2">
        <Hourglass className="w-3.5 h-3.5" />
        Waiting for confirmation
        <span className="font-mono text-slate-500">{pending.length}</span>
        {pending.length > 0 && (
          <span className="text-[11px] font-normal text-slate-500">{forms} form{forms === 1 ? '' : 's'} · {bills} bill{bills === 1 ? '' : 's'}</span>
        )}
        {isAdmin && pending.length > 0 && (
          <span className="ml-auto flex items-center gap-1.5">
            <button type="button" disabled={busy} onClick={onRejectAll}
              className="px-2.5 py-1 text-[11px] font-semibold text-slate-600 bg-white border border-slate-300 rounded-full hover:bg-slate-50 disabled:opacity-60">
              Reject all
            </button>
            <button type="button" disabled={busy} onClick={onApproveAll}
              className="inline-flex items-center gap-1 px-3 py-1 text-[11px] font-semibold text-white bg-emerald-700 rounded-full hover:bg-emerald-800 disabled:opacity-60">
              <CheckCheck className="w-3.5 h-3.5" />Approve all ({pending.length})
            </button>
          </span>
        )}
      </h2>
      {pending.length === 0 ? (
        <p className="px-3 py-6 text-xs text-slate-400 text-center">Nothing is waiting. New form and bill requests will appear here.</p>
      ) : (
        <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
          {pending.map((a) => (
            <div key={a.id} className="px-3 py-2 flex items-center gap-2 text-xs">
              <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold ${a.kind === 'form' ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-800'}`}>
                {kindLabel(a.kind).toUpperCase()}
              </span>
              <button type="button" onClick={() => onOpenLog?.(a.logId)} className="flex-1 min-w-0 text-left">
                <span className="block font-semibold text-slate-900 truncate">#{a.logNo} · {a.customer || 'Untitled'}</span>
                <span className="block text-[11px] text-slate-500 truncate">
                  {kindLabel(a.kind)} {actionLabel(a.action)}{a.action === 'received' && a.kind === 'bill' && a.month ? ` · ${monthLabel(a.month)}` : ''}{a.action === 'received' && a.kind === 'form' && a.receivedOn ? ` · on ${new Date(`${a.receivedOn}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''} · asked by {a.requestedBy} · {formatStamp(a.requestedAt)}
                </span>
              </button>
              {isAdmin ? (
                <span className="shrink-0 flex items-center gap-1">
                  <button type="button" disabled={busy} onClick={() => onApprove(a.id)}
                    className="px-2 py-1 text-[11px] font-semibold text-emerald-800 border border-emerald-300 rounded-full hover:bg-emerald-50 disabled:opacity-60">Approve</button>
                  <button type="button" disabled={busy} onClick={() => onReject(a.id)} title="Reject"
                    className="p-1 text-slate-400 hover:text-rose-700 rounded-full hover:bg-rose-50 disabled:opacity-60"><X className="w-3.5 h-3.5" /></button>
                </span>
              ) : a.requestedBy === currentName ? (
                <button type="button" onClick={() => onWithdraw(a.id)}
                  className="shrink-0 px-2 py-1 text-[11px] font-semibold text-slate-600 border border-slate-300 rounded-full hover:bg-slate-50">Withdraw</button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
