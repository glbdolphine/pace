import React, { useEffect, useMemo, useState } from 'react';
import { X, ListChecks, ArrowLeft, ArrowRight, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { LogEntry } from '../types';
import { displayName } from '../utils/names';
import {
  FILL_FIELDS, FillKey, RowState, buildFillPlan, fillFieldOf,
} from '../utils/bulkFill';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  logs: LogEntry[];
  onApply: (field: FillKey, items: { id: string; value: string }[]) => Promise<{ updated: number; unchanged: number; missing: number }>;
}

type Step = 'ids' | 'field' | 'values' | 'done';

const BADGE: Record<RowState, { label: string; cls: string }> = {
  change: { label: 'Will fill', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  same: { label: 'Same', cls: 'bg-slate-50 text-slate-500 border-slate-200' },
  has_value: { label: 'Has value', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  not_found: { label: 'Not found', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  ambiguous: { label: 'Shared ID', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  invalid: { label: 'Invalid', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  repeated: { label: 'Repeated', cls: 'bg-slate-50 text-slate-500 border-slate-200' },
  no_value: { label: 'No value', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
};

const SHOWN = 300;

export const FieldFillModal: React.FC<Props> = ({ isOpen, onClose, logs, onApply }) => {
  const [step, setStep] = useState<Step>('ids');
  const [idsText, setIdsText] = useState('');
  const [field, setField] = useState<FillKey>('mac');
  const [valuesText, setValuesText] = useState('');
  const [overwrite, setOverwrite] = useState(true);
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ updated: number; unchanged: number; missing: number } | null>(null);

  // start clean every time the window is opened
  useEffect(() => {
    if (isOpen) {
      setStep('ids'); setIdsText(''); setValuesText(''); setField('mac');
      setOverwrite(true); setProblemsOnly(false); setError(''); setResult(null); setBusy(false);
    }
  }, [isOpen]);

  const def = fillFieldOf(field);

  // How many pasted IDs match a log (step 1 feedback)
  const idPlan = useMemo(() => buildFillPlan(idsText, '', 'mac', logs, true), [idsText, logs]);
  const idTotal = idPlan.idCount;
  const idFound = idPlan.rows.filter((r) => r.log).length;
  const idMissing = idPlan.rows.filter((r) => r.state === 'not_found').length;

  const plan = useMemo(
    () => (step === 'values' || step === 'done' ? buildFillPlan(idsText, valuesText, field, logs, overwrite) : null),
    [step, idsText, valuesText, field, logs, overwrite],
  );

  if (!isOpen) return null;

  const goField = () => {
    if (!idTotal) { setError('Paste at least one NMS ID first.'); return; }
    if (!idFound) { setError('None of these NMS IDs match a log.'); return; }
    setError(''); setStep('field');
  };

  const apply = async () => {
    if (!plan || !plan.changes.length) return;
    setBusy(true); setError('');
    try {
      const r = await onApply(field, plan.changes.map((c) => ({ id: c.log!.id, value: c.value })));
      setResult(r); setStep('done');
    } catch (e: any) {
      setError(e?.message || 'Could not save. Nothing was lost - try again.');
    } finally { setBusy(false); }
  };

  const rows = plan ? (problemsOnly ? plan.rows.filter((r) => r.state !== 'change' && r.state !== 'same') : plan.rows) : [];
  const countMismatch = plan && plan.idCount !== plan.valueCount;
  const taClass = 'w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-brand-600';

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/40 backdrop-blur-xs">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-brand-50">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5"><ListChecks className="w-4 h-4" />Fill a field from a list</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {step === 'ids' && 'Step 1 of 3 · Paste the NMS IDs'}
              {step === 'field' && 'Step 2 of 3 · Choose what to fill'}
              {step === 'values' && `Step 3 of 3 · Paste the ${def.label.toLowerCase()} values`}
              {step === 'done' && 'Done'}
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-500 hover:text-slate-900 rounded hover:bg-white" title="Close"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 overflow-y-auto space-y-3 text-xs">
          {step === 'ids' && (
            <>
              <p className="text-slate-600">Paste the NMS IDs, <b>one per line</b>. Then press <b>Select</b> (or Ctrl + Enter).</p>
              <textarea autoFocus value={idsText} rows={12} placeholder={'55001\n55002\n55003'} className={taClass}
                onChange={(e) => { setIdsText(e.target.value); setError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); goField(); } }} />
              {idTotal > 0 && (
                <p className="text-slate-600">
                  <b>{idTotal}</b> NMS ID{idTotal === 1 ? '' : 's'} · <b className="text-emerald-700">{idFound}</b> match a log
                  {idMissing > 0 && <> · <b className="text-rose-700">{idMissing}</b> not found</>}
                </p>
              )}
            </>
          )}

          {step === 'field' && (
            <>
              <p className="text-slate-600"><b>{idFound}</b> logs selected. What do you want to fill?</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {FILL_FIELDS.map((f) => (
                  <button key={f.key} type="button" onClick={() => setField(f.key)}
                    className={`px-3 py-2 text-left rounded-xl border text-xs font-semibold ${field === f.key ? 'bg-brand-800 text-white border-brand-800' : 'bg-white text-slate-700 border-slate-200 hover:bg-brand-50'}`}>
                    {f.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-500">{def.hint}</p>
            </>
          )}

          {step === 'values' && plan && (
            <>
              <p className="text-slate-600">
                Paste the <b>{def.label}</b> values, <b>one per line, in the same order</b> as the NMS IDs (line 1 → first ID, and so on).
              </p>
              <textarea autoFocus value={valuesText} rows={7} placeholder={def.example} className={taClass}
                onChange={(e) => { setValuesText(e.target.value); setError(''); }} />
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className={countMismatch ? 'text-rose-700 font-semibold' : 'text-slate-600'}>
                  {plan.idCount} NMS IDs · {plan.valueCount} values{countMismatch ? ' - the counts differ, check the order before filling' : ''}
                </span>
                <label className="inline-flex items-center gap-1.5 text-slate-600">
                  <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
                  Replace values that are already filled (recommended)
                </label>
              </div>
              {plan.extraValues.length > 0 && (
                <p className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-rose-800">
                  {plan.extraValues.length} extra value{plan.extraValues.length === 1 ? '' : 's'} at the end have no NMS ID and will be ignored.
                </p>
              )}

              {plan.valueCount > 0 && (
                <>
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="font-semibold text-emerald-700">{plan.counts.change} will be filled{plan.changes.some((c) => c.current.trim()) ? ` (${plan.changes.filter((c) => c.current.trim()).length} replacing an existing value)` : ''}</span>
                    {plan.counts.same > 0 && <span className="text-slate-500">· {plan.counts.same} already same</span>}
                    {plan.counts.has_value > 0 && <span className="text-amber-700">· {plan.counts.has_value} skipped (already filled)</span>}
                    {plan.counts.invalid > 0 && <span className="text-rose-700">· {plan.counts.invalid} invalid</span>}
                    {plan.counts.not_found > 0 && <span className="text-rose-700">· {plan.counts.not_found} not found</span>}
                    {plan.counts.ambiguous > 0 && <span className="text-rose-700">· {plan.counts.ambiguous} shared ID</span>}
                    {plan.counts.repeated > 0 && <span className="text-slate-500">· {plan.counts.repeated} repeated</span>}
                    {plan.counts.no_value > 0 && <span className="text-rose-700">· {plan.counts.no_value} without value</span>}
                    {plan.warnings > 0 && <span className="text-amber-700 inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{plan.warnings} to double-check</span>}
                    <label className="ml-auto inline-flex items-center gap-1.5 text-slate-600">
                      <input type="checkbox" checked={problemsOnly} onChange={(e) => setProblemsOnly(e.target.checked)} />Problems only
                    </label>
                  </div>
                  <div className="border border-slate-200 rounded-lg overflow-auto max-h-72">
                    <table className="w-full text-[11px]">
                      <thead className="bg-slate-50 text-slate-500 sticky top-0">
                        <tr>
                          <th className="px-2 py-1.5 text-left">#</th><th className="px-2 py-1.5 text-left">NMS ID</th>
                          <th className="px-2 py-1.5 text-left">Log</th><th className="px-2 py-1.5 text-left">Now</th>
                          <th className="px-2 py-1.5 text-left">New</th><th className="px-2 py-1.5 text-left">Result</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {rows.slice(0, SHOWN).map((r) => (
                          <tr key={r.n} className={r.state === 'change' ? '' : 'bg-slate-50/60'}>
                            <td className="px-2 py-1 text-slate-400">{r.n}</td>
                            <td className="px-2 py-1 font-mono">{r.nmsId}</td>
                            <td className="px-2 py-1 max-w-[12rem] truncate" title={r.log ? displayName(r.log) : ''}>{r.log ? `#${r.log.logNo} · ${displayName(r.log)}` : '-'}</td>
                            <td className="px-2 py-1 font-mono text-slate-500">{r.current || '-'}</td>
                            <td className="px-2 py-1 font-mono">{r.value || (r.raw ?? '-')}</td>
                            <td className="px-2 py-1">
                              <span className={`inline-block px-1.5 py-0.5 rounded-full border text-[10px] font-semibold ${BADGE[r.state].cls}`}>{r.state === 'change' && r.current.trim() ? 'Will replace' : BADGE[r.state].label}</span>
                              {(r.note || r.warn) && <span className={`ml-1.5 ${r.warn && !r.note ? 'text-amber-700' : 'text-slate-500'}`}>{r.note || r.warn}</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {rows.length > SHOWN && <p className="px-2 py-1.5 text-center text-slate-400">Showing the first {SHOWN} of {rows.length} rows (all will be processed).</p>}
                  </div>
                </>
              )}
            </>
          )}

          {step === 'done' && result && (
            <div className="py-6 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
              <p className="text-sm font-semibold text-slate-900">{result.updated} log{result.updated === 1 ? '' : 's'} updated</p>
              <p className="text-slate-500">{def.label}{result.unchanged ? ` · ${result.unchanged} already had it` : ''}{result.missing ? ` · ${result.missing} no longer exist` : ''}</p>
              <p className="text-[11px] text-slate-400">Every change is recorded in each log's history and in Activity.</p>
            </div>
          )}

          {error && <p className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-rose-800">{error}</p>}
        </div>

        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-slate-200 bg-slate-50">
          {step === 'ids' && (<><span /><button type="button" onClick={goField} className="inline-flex items-center gap-1.5 h-8 px-4 text-xs font-semibold text-white bg-brand-800 rounded-lg hover:bg-brand-900">Select {idFound > 0 ? idFound : ''}<ArrowRight className="w-3.5 h-3.5" /></button></>)}
          {step === 'field' && (<>
            <button type="button" onClick={() => setStep('ids')} className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"><ArrowLeft className="w-3.5 h-3.5" />Back</button>
            <button type="button" onClick={() => { setValuesText(''); setStep('values'); }} className="inline-flex items-center gap-1.5 h-8 px-4 text-xs font-semibold text-white bg-brand-800 rounded-lg hover:bg-brand-900">Next<ArrowRight className="w-3.5 h-3.5" /></button>
          </>)}
          {step === 'values' && (<>
            <button type="button" onClick={() => setStep('field')} className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"><ArrowLeft className="w-3.5 h-3.5" />Back</button>
            <button type="button" onClick={apply} disabled={busy || !plan || plan.changes.length === 0}
              className="inline-flex items-center gap-1.5 h-8 px-4 text-xs font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-40">
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Fill {plan?.changes.length || 0} log{plan?.changes.length === 1 ? '' : 's'}
            </button>
          </>)}
          {step === 'done' && (<>
            <button type="button" onClick={() => { setValuesText(''); setResult(null); setStep('field'); }} className="h-8 px-3 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50">Fill another field for the same IDs</button>
            <button type="button" onClick={onClose} className="h-8 px-4 text-xs font-semibold text-white bg-brand-800 rounded-lg hover:bg-brand-900">Close</button>
          </>)}
        </div>
      </div>
    </div>
  );
};
