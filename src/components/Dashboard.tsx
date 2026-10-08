import React, { useMemo } from 'react';
import { AlertTriangle, CalendarClock, ClipboardCheck, Clock, FileText, Receipt, Users } from 'lucide-react';
import { ActivityEvent, LogEntry } from '../types';
import { logDay } from '../utils/dates';
import { daysAwaiting, expectsForm, formStats, getOverdueDays, hasForm, isFormOverdue } from '../utils/forms';
import { followDiff, followLabel, followState, startOfToday } from '../utils/followUps';
import { formatStamp } from '../utils/activity';
import { displayName } from '../utils/names';
import { billStats, hasBill } from '../utils/bills';
import { completenessStats, MissingKey, missingOf } from '../utils/completeness';

export interface DashboardGo {
  status?: 'pending' | 'in_progress' | 'resolved';
  form?: 'awaiting';
  follow?: 'today' | 'overdue';
  resellerName?: string;
  missing?: MissingKey;
}

interface Props {
  logs: LogEntry[];
  activity: ActivityEvent[];
  userName: string;
  onOpenLog: (id: string) => void;
  onGo: (target: DashboardGo) => void;
  approvalsPanel?: React.ReactNode;
  onOpenBills?: () => void;
}

const isPending = (s = '') => /pending|waiting/i.test(s);

const Card: React.FC<{
  label: string; value: number | string; sub?: string; icon: React.ElementType;
  tone?: 'plain' | 'warn' | 'bad' | 'good'; onClick?: () => void;
}> = ({ label, value, sub, icon: Icon, tone = 'plain', onClick }) => {
  const ring = tone === 'bad' ? 'border-rose-200' : tone === 'warn' ? 'border-amber-200' : tone === 'good' ? 'border-emerald-200' : 'border-brand-100';
  const num = tone === 'bad' ? 'text-rose-700' : tone === 'warn' ? 'text-amber-700' : tone === 'good' ? 'text-emerald-700' : 'text-brand-800';
  return (
    <button type="button" onClick={onClick} disabled={!onClick}
      className={`text-left bg-white rounded-2xl border ${ring} p-4 shadow-sm ${onClick ? 'hover:shadow-md hover:border-brand-300 transition' : ''}`}>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500"><Icon className="w-3.5 h-3.5" />{label}</div>
      <div className={`mt-1.5 text-3xl font-bold font-display ${num}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
    </button>
  );
};

const Row: React.FC<{ log: LogEntry; right: string; rightCls?: string; onOpen: (id: string) => void }> = ({ log, right, rightCls = 'text-slate-500', onOpen }) => (
  <button type="button" onClick={() => onOpen(log.id)} className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-brand-50 border-b border-slate-100 last:border-b-0">
    <span className="font-mono text-[11px] font-semibold text-brand-700 shrink-0">#{log.logNo}</span>
    <span className="flex-1 min-w-0">
      <span className="block text-xs font-semibold text-slate-900 truncate">{displayName(log) || 'Untitled'}</span>
      <span className="block text-[11px] text-slate-500 truncate">{[log.resellerName, log.nmsId].filter(Boolean).join(' · ')}</span>
    </span>
    <span className={`shrink-0 text-[11px] font-semibold ${rightCls}`}>{right}</span>
  </button>
);

const Panel: React.FC<{ title: string; icon: React.ElementType; empty: string; count: number; children: React.ReactNode }> = ({ title, icon: Icon, empty, count, children }) => (
  <section className="bg-white rounded-2xl border border-brand-100 shadow-sm overflow-hidden">
    <h2 className="px-3 py-2 text-xs font-semibold text-brand-800 bg-brand-50 border-b border-brand-100 flex items-center gap-1.5">
      <Icon className="w-3.5 h-3.5" />{title}<span className="ml-auto font-mono text-slate-500">{count}</span>
    </h2>
    {count === 0 ? <p className="px-3 py-6 text-xs text-slate-400 text-center">{empty}</p> : <div className="max-h-72 overflow-y-auto">{children}</div>}
  </section>
);

export const Dashboard: React.FC<Props> = ({ logs, activity, userName, onOpenLog, onGo, approvalsPanel, onOpenBills }) => {
  const d = useMemo(() => {
    const today = startOfToday();
    const limit = getOverdueDays();
    const todays = logs.filter((l) => logDay(l)?.getTime() === today.getTime());
    const pending = logs.filter((l) => isPending(l.status));
    const forms = formStats(logs);
    const overdueForms = logs.filter((l) => isFormOverdue(l, limit)).sort((a, b) => daysAwaiting(b) - daysAwaiting(a));
    const overdueFollow = logs.filter((l) => followState(l, today) === 'overdue')
      .sort((a, b) => (followDiff(a, today) ?? 0) - (followDiff(b, today) ?? 0));
    const dueToday = logs.filter((l) => followState(l, today) === 'today');

    // Agent activity from the shared activity feed
    const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 6);
    const agents = new Map<string, { created: number; edited: number; deleted: number; week: number; last: string }>();
    for (const e of activity) {
      if (!['created', 'edited', 'deleted'].includes(e.action)) continue;
      const at = new Date(e.at);
      if (isNaN(at.getTime()) || at < weekAgo) continue;
      const a = agents.get(e.by) || { created: 0, edited: 0, deleted: 0, week: 0, last: '' };
      a.week++;
      if (at >= today) {
        if (e.action === 'created') a.created++;
        else if (e.action === 'edited') a.edited++;
        else a.deleted++;
      }
      if (!a.last || e.at > a.last) a.last = e.at;
      agents.set(e.by, a);
    }
    const agentRows = [...agents.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((x, y) => (y.created + y.edited + y.deleted) - (x.created + x.edited + x.deleted) || y.week - x.week);

    const bills = billStats(logs);
    const info = completenessStats(logs);

    // One row per reseller: logs, forms received of expected, bills received, logs with missing details.
    const rm = new Map<string, { logs: number; formsExpected: number; formsReceived: number; bills: number; incomplete: number }>();
    for (const l of logs) {
      const k = l.resellerName?.trim() || 'Unassigned';
      const r = rm.get(k) || { logs: 0, formsExpected: 0, formsReceived: 0, bills: 0, incomplete: 0 };
      r.logs++;
      if (expectsForm(l)) { r.formsExpected++; if (hasForm(l)) r.formsReceived++; }
      if (hasBill(l)) r.bills++;
      if (missingOf(l).length) r.incomplete++;
      rm.set(k, r);
    }
    const resellerRows = [...rm.entries()].map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => (b.formsExpected - b.formsReceived) - (a.formsExpected - a.formsReceived) || b.logs - a.logs);

    return { limit, todays, pending, forms, overdueForms, overdueFollow, dueToday, agentRows, bills, info, resellerRows };
  }, [logs, activity]);

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const todayLabel = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <div className="w-full space-y-4">
      <div className="pb-3 border-b border-slate-200">
        <h1 className="text-sm font-semibold text-slate-900">{greet}, {userName}</h1>
        <p className="text-xs text-slate-500 mt-0.5">{todayLabel}</p>
      </div>

      {approvalsPanel}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card label="Institutes" value={logs.length} sub={`${d.info.complete} fully filled in`} icon={FileText} />
        <Card label="Forms received" value={`${d.forms.received}/${d.forms.sent}`} sub={`${d.forms.awaiting} still awaited`}
          icon={ClipboardCheck} tone={d.forms.awaiting ? 'warn' : 'good'} onClick={() => onGo({ form: 'awaiting' })} />
        <Card label="Bills received" value={`${d.bills.received}/${d.bills.total}`} sub={`${d.bills.notReceived} pending · ${d.bills.pct}%`}
          icon={Receipt} tone={d.bills.notReceived ? 'warn' : 'good'} onClick={onOpenBills} />
        <Card label="Missing details" value={d.info.incomplete} sub="logs with information missing"
          icon={AlertTriangle} tone={d.info.incomplete ? 'bad' : 'good'} onClick={() => onGo({ missing: d.info.perField[0]?.missing ? d.info.perField[0].key : undefined })} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        <section className="lg:col-span-3 bg-white rounded-2xl border border-brand-100 shadow-sm overflow-hidden">
          <h2 className="px-3 py-2 text-xs font-semibold text-brand-800 bg-brand-50 border-b border-brand-100 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />Resellers: forms, bills and missing details
            <span className="ml-auto font-mono text-slate-500">{d.resellerRows.length}</span>
          </h2>
          {d.resellerRows.length === 0 ? (
            <p className="px-3 py-6 text-xs text-slate-400 text-center">No logs yet.</p>
          ) : (
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-left text-[11px] text-slate-500 border-b border-slate-100">
                    <th className="px-3 py-2 font-semibold">Reseller</th>
                    <th className="px-2 py-2 font-semibold text-right">Logs</th>
                    <th className="px-2 py-2 font-semibold text-right">Forms received</th>
                    <th className="px-2 py-2 font-semibold text-right">Awaiting</th>
                    <th className="px-2 py-2 font-semibold text-right">Bills</th>
                    <th className="px-3 py-2 font-semibold text-right">Missing info</th>
                  </tr>
                </thead>
                <tbody>
                  {d.resellerRows.map((r) => {
                    const left = r.formsExpected - r.formsReceived;
                    const pct = r.formsExpected ? Math.round((r.formsReceived / r.formsExpected) * 100) : 0;
                    return (
                      <tr key={r.name} className="border-b border-slate-50 last:border-b-0 hover:bg-brand-50 cursor-pointer"
                        onClick={() => onGo({ resellerName: r.name })}>
                        <td className="px-3 py-2 font-medium text-slate-800">{r.name}</td>
                        <td className="px-2 py-2 text-right font-mono text-slate-600">{r.logs}</td>
                        <td className="px-2 py-2 text-right">
                          <span className="font-mono text-emerald-700">{r.formsReceived}</span>
                          <span className="font-mono text-slate-400"> / {r.formsExpected}</span>
                          <span className="ml-2 inline-block align-middle w-12 h-1.5 rounded-full bg-slate-100 overflow-hidden"><span className="block h-full bg-emerald-500" style={{ width: `${pct}%` }} /></span>
                        </td>
                        <td className={`px-2 py-2 text-right font-mono ${left ? 'text-rose-700 font-semibold' : 'text-slate-300'}`}>{left || '·'}</td>
                        <td className="px-2 py-2 text-right font-mono text-sky-700">{r.bills}<span className="text-slate-400"> / {r.logs}</span></td>
                        <td className={`px-3 py-2 text-right font-mono ${r.incomplete ? 'text-amber-700' : 'text-emerald-700'}`}>{r.incomplete || '✓'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="lg:col-span-2 bg-white rounded-2xl border border-brand-100 shadow-sm overflow-hidden">
          <h2 className="px-3 py-2 text-xs font-semibold text-brand-800 bg-brand-50 border-b border-brand-100 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />What is missing in the logs
            <span className="ml-auto font-mono text-slate-500">{d.info.incomplete} of {logs.length}</span>
          </h2>
          {logs.length === 0 ? (
            <p className="px-3 py-6 text-xs text-slate-400 text-center">No logs yet.</p>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              {d.info.perField.map((f) => {
                const pct = logs.length ? Math.round((f.missing / logs.length) * 100) : 0;
                return (
                  <button key={f.key} type="button" disabled={!f.missing} onClick={() => onGo({ missing: f.key })}
                    className="w-full text-left px-3 py-1.5 border-b border-slate-100 last:border-b-0 enabled:hover:bg-brand-50 disabled:cursor-default">
                    <span className="flex items-center gap-2 text-xs">
                      <span className="flex-1 font-medium text-slate-800">{f.label}</span>
                      <span className={`font-mono ${f.missing ? 'text-rose-700 font-semibold' : 'text-emerald-700'}`}>{f.missing ? `${f.missing} missing` : '✓ all filled'}</span>
                    </span>
                    {f.missing > 0 && <span className="block mt-1 h-1 rounded-full bg-slate-100 overflow-hidden"><span className="block h-full bg-rose-400" style={{ width: `${pct}%` }} /></span>}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <Panel title="Least complete logs" icon={AlertTriangle} count={d.info.worst.length} empty="Every log is fully filled in.">
        {d.info.worst.map(({ log, missing }) => (
          <Row key={log.id} log={log} right={`${missing.length} missing`} rightCls="text-amber-700" onOpen={onOpenLog} />
        ))}
      </Panel>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card label="Logs today" value={d.todays.length} sub={`${logs.length} in total`} icon={FileText} />
        <Card label="Pending" value={d.pending.length} sub="waiting for reseller" icon={Clock} tone={d.pending.length ? 'warn' : 'good'} onClick={() => onGo({ status: 'pending' })} />
        <Card label="Forms awaiting" value={d.forms.awaiting} sub={d.overdueForms.length ? `${d.overdueForms.length} overdue (${d.limit}+ days)` : `${d.forms.received} of ${d.forms.sent} received`}
          icon={ClipboardCheck} tone={d.overdueForms.length ? 'bad' : d.forms.awaiting ? 'warn' : 'good'} onClick={() => onGo({ form: 'awaiting' })} />
        <Card label="Follow-up today" value={d.dueToday.length} icon={CalendarClock} tone={d.dueToday.length ? 'warn' : 'good'} onClick={() => onGo({ follow: 'today' })} />
        <Card label="Overdue follow-ups" value={d.overdueFollow.length} icon={AlertTriangle} tone={d.overdueFollow.length ? 'bad' : 'good'} onClick={() => onGo({ follow: 'overdue' })} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Panel title="Overdue follow-ups" icon={AlertTriangle} count={d.overdueFollow.length} empty="Nothing overdue. Nice.">
          {d.overdueFollow.map((l) => <Row key={l.id} log={l} right={followLabel(l)} rightCls="text-rose-700" onOpen={onOpenLog} />)}
        </Panel>
        <Panel title={`Signed forms overdue (${d.limit}+ days)`} icon={ClipboardCheck} count={d.overdueForms.length} empty="No overdue forms.">
          {d.overdueForms.map((l) => <Row key={l.id} log={l} right={`${daysAwaiting(l)}d`} rightCls="text-rose-700" onOpen={onOpenLog} />)}
        </Panel>
        <Panel title="Follow-up due today" icon={CalendarClock} count={d.dueToday.length} empty="No follow-ups due today.">
          {d.dueToday.map((l) => <Row key={l.id} log={l} right={l.status || ''} onOpen={onOpenLog} />)}
        </Panel>
        <Panel title="Today's logs" icon={FileText} count={d.todays.length} empty="No logs yet today.">
          {[...d.todays].reverse().map((l) => (
            <Row key={l.id} log={l} right={expectsForm(l) ? (hasForm(l) ? 'form ✓' : 'form ○') : l.requestType} onOpen={onOpenLog} />
          ))}
        </Panel>
      </div>

      <section className="bg-white rounded-2xl border border-brand-100 shadow-sm overflow-hidden">
        <h2 className="px-3 py-2 text-xs font-semibold text-brand-800 bg-brand-50 border-b border-brand-100 flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" />Agent activity<span className="ml-auto text-[11px] font-normal text-slate-500">today · last 7 days</span>
        </h2>
        {d.agentRows.length === 0 ? (
          <p className="px-3 py-6 text-xs text-slate-400 text-center">No activity in the last 7 days.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[11px] text-slate-500 border-b border-slate-100">
                  <th className="px-3 py-2 font-semibold">Agent</th>
                  <th className="px-2 py-2 font-semibold text-right">Created</th>
                  <th className="px-2 py-2 font-semibold text-right">Edited</th>
                  <th className="px-2 py-2 font-semibold text-right">Deleted</th>
                  <th className="px-2 py-2 font-semibold text-right">7 days</th>
                  <th className="px-3 py-2 font-semibold text-right">Last active</th>
                </tr>
              </thead>
              <tbody>
                {d.agentRows.map((a) => (
                  <tr key={a.name} className="border-b border-slate-50 last:border-b-0">
                    <td className="px-3 py-2 font-medium text-slate-800">{a.name}</td>
                    <td className="px-2 py-2 text-right font-mono">{a.created || '·'}</td>
                    <td className="px-2 py-2 text-right font-mono">{a.edited || '·'}</td>
                    <td className="px-2 py-2 text-right font-mono">{a.deleted || '·'}</td>
                    <td className="px-2 py-2 text-right font-mono text-slate-500">{a.week}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-500 whitespace-nowrap">{formatStamp(a.last)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
