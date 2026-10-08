import React, { useMemo, useState } from 'react';
import { X, Search } from 'lucide-react';
import { formatStamp } from '../utils/activity';
import { ActivityEvent } from '../types';

interface ActivityModalProps {
  isOpen: boolean;
  onClose: () => void;
  events: ActivityEvent[];
}

const ACTION_STYLES: Record<ActivityEvent['action'], string> = {
  created: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  edited: 'bg-brand-50 text-brand-700 border-brand-200',
  deleted: 'bg-rose-50 text-rose-700 border-rose-200',
  cleared: 'bg-rose-50 text-rose-700 border-rose-200',
  restored: 'bg-amber-50 text-amber-700 border-amber-200',
  user_created: 'bg-violet-50 text-violet-700 border-violet-200',
  user_disabled: 'bg-rose-50 text-rose-700 border-rose-200',
  user_enabled: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  purged: 'bg-rose-50 text-rose-700 border-rose-200',
  password_reset: 'bg-violet-50 text-violet-700 border-violet-200',
};

export const ActivityModal: React.FC<ActivityModalProps> = ({ isOpen, onClose, events }) => {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => events.filter((e) => {

    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return [e.by, e.action, e.logNo, e.customer, e.detail]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(q);
  }), [events, query]);

  if (!isOpen) return null;

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
      <div className="bg-white w-full max-w-2xl rounded-lg shadow-xl border border-slate-200 overflow-hidden flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">Activity</h2>
          <button
            onClick={onClose}
            className="p-1 text-slate-500 hover:text-slate-900 rounded hover:bg-slate-100"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-2.5 border-b border-slate-100 relative">
          <Search className="w-3.5 h-3.5 absolute left-6.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name, action or log..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded focus:outline-none focus:border-brand-600"
          />
        </div>

        <div className="overflow-y-auto divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-10">No activity recorded yet.</p>
          ) : (
            filtered.map((e) => (
              <div key={e.id} className="px-4 py-2.5 text-xs flex items-start gap-3">
                <span
                  className={`mt-0.5 px-1.5 py-0.5 rounded border text-[10px] font-medium uppercase tracking-wide ${ACTION_STYLES[e.action]}`}
                >
                  {e.action}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-slate-800">
                    <span className="font-semibold">{e.by}</span>
                    {e.logNo !== undefined && e.logNo !== '' && (
                      <>
                        {' '}
                        &middot; Log #{e.logNo}
                        {e.customer ? ` (${e.customer})` : ''}
                      </>
                    )}
                  </p>
                  {e.detail && <p className="text-slate-500 mt-0.5 break-words">{e.detail}</p>}
                </div>
                <span className="text-[11px] text-slate-400 whitespace-nowrap font-mono">
                  {formatStamp(e.at)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
