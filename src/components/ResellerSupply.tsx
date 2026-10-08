import React, { useMemo, useState } from 'react';
import { Layers, Search, ChevronRight, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { LogEntry } from '../types';

interface ResellerSupplyProps {
  logs: LogEntry[];
  onOpenLog: (id: string) => void;
}

export const ResellerSupply: React.FC<ResellerSupplyProps> = ({ logs, onOpenLog }) => {
  const [search, setSearch] = useState('');
  const [selectedReseller, setSelectedReseller] = useState<string | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, LogEntry[]>();
    for (const log of logs) {
      const key = log.resellerName?.trim() || 'Unassigned Reseller';
      const arr = map.get(key) || [];
      arr.push(log);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [logs]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return groups;
    return groups.filter(([name]) => name.toLowerCase().includes(q));
  }, [groups, search]);

  const activeLogs = useMemo(() => {
    if (!selectedReseller) return null;
    return logs.filter((l) => (l.resellerName?.trim() || 'Unassigned Reseller') === selectedReseller);
  }, [logs, selectedReseller]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white p-4 rounded-2xl border border-brand-100 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div>
          <h1 className="text-base font-bold text-slate-900">Reseller Supply & Allocation</h1>
          <p className="text-xs text-slate-500">
            Overview of client IDs, routers, optical fiber cables, and forms allocated per reseller partner.
          </p>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reseller..."
            className="pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-brand-600 focus:bg-white w-48 sm:w-64"
          />
        </div>
      </div>

      {/* Grid of Resellers */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map(([resellerName, list]) => {
          const resolved = list.filter((l) => /resolved|closed/i.test(l.status)).length;
          const pending = list.length - resolved;
          const routers = list.filter((l) => l.routerSerial || l.mac).length;

          return (
            <div
              key={resellerName}
              onClick={() => setSelectedReseller(resellerName)}
              className={`cursor-pointer bg-white p-4 rounded-2xl border transition-all shadow-xs hover:shadow-md ${
                selectedReseller === resellerName
                  ? 'border-brand-600 ring-2 ring-brand-600/20'
                  : 'border-brand-100 hover:border-brand-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-900 text-sm truncate">{resellerName}</h3>
                <span className="text-xs font-mono font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded-full border border-brand-100">
                  {list.length} IDs
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-100 text-center">
                <div className="bg-slate-50 p-2 rounded-xl">
                  <div className="text-[10px] text-slate-400 font-medium">Routers</div>
                  <div className="text-xs font-bold text-slate-800">{routers}</div>
                </div>
                <div className="bg-emerald-50 p-2 rounded-xl">
                  <div className="text-[10px] text-emerald-600 font-medium">Resolved</div>
                  <div className="text-xs font-bold text-emerald-700">{resolved}</div>
                </div>
                <div className="bg-amber-50 p-2 rounded-xl">
                  <div className="text-[10px] text-amber-600 font-medium">Pending</div>
                  <div className="text-xs font-bold text-amber-700">{pending}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Drill-down view for selected reseller */}
      {selectedReseller && activeLogs && (
        <div className="bg-white rounded-2xl border border-brand-200 p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">
              Allocated Logs for <span className="text-brand-700">{selectedReseller}</span> ({activeLogs.length})
            </h2>
            <button
              onClick={() => setSelectedReseller(null)}
              className="text-xs text-slate-500 hover:text-slate-800"
            >
              Close Details
            </button>
          </div>

          <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {activeLogs.map((log) => (
              <div
                key={log.id}
                onClick={() => onOpenLog(log.id)}
                className="py-2.5 px-2 flex items-center justify-between hover:bg-slate-50 rounded-lg cursor-pointer transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-brand-700">#{log.logNo}</span>
                    <span className="text-xs font-semibold text-slate-800">{log.customerName || 'Untitled'}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {[log.nmsId ? `NMS: ${log.nmsId}` : null, log.edcNo ? `EDC: ${log.edcNo}` : null, log.routerSerial ? `Serial: ${log.routerSerial}` : null, log.mac ? `MAC: ${log.mac}` : null].filter(Boolean).join(' · ')}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                      /resolved|closed/i.test(log.status)
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {log.status}
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
