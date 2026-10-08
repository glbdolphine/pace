import React, { useState, useEffect, useMemo, useRef } from 'react';
import { resolveCategory, detectCategoryFromName, CATEGORY_LABELS } from '../utils/category';
import { LogEntry, FieldSuggestionsMap, Reseller } from '../types';
import { SuggestionInput } from './SuggestionInput';
import { ConfirmDialog } from './ConfirmDialog';
import { findDuplicates, describeLog } from '../utils/duplicates';
import { matchReseller } from '../utils/resellers';
import { addDaysIso } from '../utils/followUps';
import { UPAZILAS, upazilaKey, resellerLogName } from '../utils/upazilas';
import { scanPdfForms, saveBatchLogs, ScannedForm } from '../utils/cloud';
import { useAutoSave } from '../utils/useAutoSave';
import { splitName, primaryName } from '../utils/names';
import { parseEntryDate, toInputDate, fromInputDate } from '../utils/dates';

import {
  ArrowLeft,
  AlertTriangle,
  MapPin,
  ExternalLink,
  FileText,
  Upload,
  CheckCircle2,
  Loader2,
  Layers,
  Trash2,
  Edit2,
  Check,
} from 'lucide-react';

function formatEntryDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

interface LogFormProps {
  initialData?: LogEntry | null;
  nextLogNo: number;
  suggestions: FieldSuggestionsMap;
  logs: LogEntry[];
  resellers: Reseller[];
  onSave: (entry: LogEntry, andCreateAnother?: boolean) => void;
  /** Called after a silent background save, with the log as stored on the server. */
  onAutoSaved?: (saved: LogEntry) => void;
  onCancel: () => void;
}

interface ScannedQueueItem extends ScannedForm {
  id: string;
  resellerName: string;
  resellerPhone: string;
}

export const LogForm: React.FC<LogFormProps> = ({
  initialData,
  nextLogNo,
  suggestions,
  logs,
  resellers,
  onSave,
  onAutoSaved,
  onCancel,
}) => {
  const isEditing = Boolean(initialData?.id);

  const [formData, setFormData] = useState<Partial<LogEntry>>({
    logNo: initialData ? initialData.logNo : nextLogNo,
    date: initialData ? initialData.date : formatEntryDate(new Date()),
    resellerName: initialData?.resellerName || '',
    resellerId: initialData?.resellerId || '',
    resellerPhone: initialData?.resellerPhone || '',
    requestType: initialData?.requestType || 'New User ID',
    customerName: initialData?.customerName || '',
    nameBn: initialData?.nameBn || (initialData && !initialData.nameEn ? splitName(initialData.customerName).nameBn : ''),
    nameEn: initialData?.nameEn || (initialData && !initialData.nameBn ? splitName(initialData.customerName).nameEn : ''),
    headTeacherName: initialData?.headTeacherName || '',
    headTeacherPhone: initialData?.headTeacherPhone || '',
    nmsId: initialData?.nmsId || '',
    edcNo: initialData?.edcNo || '',
    routerSerial: initialData?.routerSerial || '',
    mac: initialData?.mac || '',
    lat: initialData?.lat || '',
    long: initialData?.long || '',
    unionName: initialData?.unionName || '',
    upazila: initialData?.upazila || '',
    fiberLength: initialData?.fiberLength || '',
    category: initialData?.category || '',
    issueFound: initialData?.issueFound || '',
    missingWrongDetails: initialData?.missingWrongDetails || '',
    actionTaken: initialData?.actionTaken || '',
    reasonForAction: initialData?.reasonForAction || '',
    resellerInformed: initialData?.resellerInformed || 'Yes - phone',
    followUpNeeded: initialData?.followUpNeeded || 'Yes',
    followUpDate: initialData?.followUpDate || '',
    status: initialData?.status || 'Pending - waiting for reseller',
    supervisorInformed: initialData?.supervisorInformed || 'I informed my superiors',
    remarks: initialData?.remarks || '',
  });

  // PDF scanner state
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [lastScan, setLastScan] = useState<ScannedForm | null>(null);
  const [showBatchQueue, setShowBatchQueue] = useState(false);
  const [batchQueue, setBatchQueue] = useState<ScannedQueueItem[]>([]);
  const [batchReseller, setBatchReseller] = useState('');
  const [batchResellerPhone, setBatchResellerPhone] = useState('');
  const [isBatchSaving, setIsBatchSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
    } else {
      setFormData((prev) => ({
        ...prev,
        logNo: nextLogNo,
        date: prev.date || formatEntryDate(new Date()),
      }));
    }
  }, [initialData, nextLogNo]);

  const categoryManual = useRef(false);

  const updateField = (field: keyof LogEntry, value: string | number) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      // The name shown in the logs is the Bangla name (falls back to English if there is none).
      if (field === 'nameBn' || field === 'nameEn') {
        next.customerName = primaryName(next.nameBn, next.nameEn);
        // Auto-pick the category from the name, unless it was changed by hand.
        if (!categoryManual.current) {
          const detected = detectCategoryFromName(next.nameBn, next.nameEn);
          if (detected) next.category = detected;
        }
      }
      if (field === 'category') categoryManual.current = true;
      return next;
    });
  };

  const [pendingSave, setPendingSave] = useState<{ entry: LogEntry; another: boolean } | null>(null);

  // Other logs that already use this MAC / router serial / NMS ID
  const dups = useMemo(
    () =>
      findDuplicates(
        {
          id: initialData?.id,
          mac: formData.mac,
          routerSerial: formData.routerSerial,
          nmsId: formData.nmsId,
        },
        logs
      ),
    [initialData?.id, formData.mac, formData.routerSerial, formData.nmsId, logs]
  );

  const activeResellers = useMemo(() => resellers.filter((r) => r.active), [resellers]);
  const currentReseller = useMemo(
    () =>
      matchReseller(
        { resellerId: formData.resellerId, resellerName: formData.resellerName || '' },
        resellers
      ),
    [formData.resellerId, formData.resellerName, resellers]
  );

  // Silent background save for logs that already exist in the database (not new / duplicated ones).
  const existsInDb = Boolean(initialData?.id) && logs.some((l) => l.id === initialData!.id);
  const autoSave = useAutoSave({
    enabled: existsInDb,
    logId: existsInDb ? initialData!.id : undefined,
    data: formData,
    resellerId: currentReseller?.id,
    baseline: initialData,
    onSaved: onAutoSaved,
  });

  // Upazila chosen first; it narrows the reseller list.
  // One Upazila for the whole log: the reseller's upazila (also the customer's). Choosing a reseller
  // sets it; choosing an upazila first narrows the reseller list.
  const upazilaPick = upazilaKey(formData.upazila) || upazilaKey(currentReseller?.area);

  const resellerPool = useMemo(
    () => (upazilaPick ? activeResellers.filter((r) => upazilaKey(r.area) === upazilaPick) : activeResellers),
    [activeResellers, upazilaPick]
  );

  const pickUpazila = (key: string) => {
    // clear the reseller if it belongs to a different upazila
    const clear = key && currentReseller && upazilaKey(currentReseller.area) !== key;
    setFormData((p) => ({ ...p, upazila: key, ...(clear ? { resellerId: '', resellerName: '' } : {}) }));
  };

  const pickReseller = (id: string) => {
    if (id === '__keep__') return;
    const r = resellers.find((x) => x.id === id);
    if (!r) {
      setFormData((p) => ({ ...p, resellerId: '', resellerName: '' }));
      return;
    }
    setFormData((p) => ({
      ...p,
      resellerId: r.id,
      resellerName: resellerLogName(r, resellers),
      // the reseller's upazila is the log's upazila
      upazila: upazilaKey(r.area) || p.upazila || '',
      resellerPhone:
        p.resellerPhone?.trim() && p.resellerPhone !== currentReseller?.phone ? p.resellerPhone : r.phone || '',
    }));
  };

  // -------------------------------------------------------------------------
  // PDF scanner: sends the PDFs to /api/pdf/scan (rule-based text extraction)
  // -------------------------------------------------------------------------
  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const applyScanToForm = (r: ScannedForm) => {
    setFormData((prev) => ({
      ...prev,
      ...(r.customerName
        ? (() => {
            const n = splitName(r.customerName);
            const nameBn = n.nameBn || prev.nameBn || '';
            const nameEn = n.nameEn || prev.nameEn || '';
            return { nameBn, nameEn, customerName: primaryName(nameBn, nameEn, prev.customerName) };
          })()
        : {}),
      edcNo: r.edcNo || prev.edcNo,
      nmsId: r.nmsId || prev.nmsId,
      upazila: prev.upazila?.trim() ? prev.upazila : upazilaKey(r.upazila) || r.upazila || '',
      unionName: r.unionName || prev.unionName,
      lat: r.lat || prev.lat,
      long: r.long || prev.long,
      routerSerial: r.routerSerial || prev.routerSerial,
      mac: r.mac || prev.mac,
      fiberLength: r.fiberLength || prev.fiberLength,
      headTeacherPhone: r.headTeacherPhone || prev.headTeacherPhone,
      date: r.date || prev.date,
    }));
    setLastScan(r);
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsScanning(true);
    setScanError('');
    setLastScan(null);

    try {
      const payloads: { name: string; data: string }[] = [];
      for (let i = 0; i < files.length; i++) {
        payloads.push({ name: files[i].name, data: await readFileAsBase64(files[i]) });
      }

      const response = await scanPdfForms(payloads);
      const results = response.results || [];
      const failed = response.errors || [];

      if (results.length === 0) {
        throw new Error(failed.map((e) => `${e.fileName}: ${e.error}`).join(' | ') || 'Nothing could be read from the PDF.');
      }
      if (failed.length > 0) {
        setScanError(failed.map((e) => `${e.fileName}: ${e.error}`).join(' | '));
      }

      if (results.length === 1 && batchQueue.length === 0) {
        applyScanToForm(results[0]);
      } else {
        const items: ScannedQueueItem[] = results.map((r, index) => ({
          ...r,
          id: `${Date.now()}-${index}`,
          resellerName: formData.resellerName || '',
          resellerPhone: formData.resellerPhone || '',
        }));
        setBatchQueue((prev) => [...prev, ...items]);
        setShowBatchQueue(true);
      }
    } catch (err: any) {
      setScanError(err?.message || 'Failed to read the PDF.');
    } finally {
      setIsScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleBatchResellerApply = () => {
    if (!batchReseller) return;
    setBatchQueue((prev) =>
      prev.map((item) => ({
        ...item,
        resellerName: batchReseller,
        resellerPhone: batchResellerPhone || item.resellerPhone,
      }))
    );
  };

  const handleBatchSaveAll = async () => {
    if (batchQueue.length === 0) return;
    setIsBatchSaving(true);
    try {
      let currentNo = nextLogNo;
      const now = new Date().toISOString();
      const entriesToSave: LogEntry[] = batchQueue.map((item) => ({
        id: crypto.randomUUID(),
        logNo: currentNo++,
        date: item.date || formatEntryDate(new Date()),
        resellerName: item.resellerName?.trim() || '',
        resellerPhone: item.resellerPhone?.trim() || '',
        requestType: 'New User ID',
        customerName: item.customerName?.trim() || '',
        ...splitName(item.customerName),
        headTeacherPhone: item.headTeacherPhone?.trim() || '',
        nmsId: item.nmsId?.trim() || '',
        edcNo: item.edcNo?.trim() || '',
        routerSerial: item.routerSerial?.trim() || '',
        mac: item.mac?.trim() || '',
        lat: item.lat?.trim() || '',
        long: item.long?.trim() || '',
        unionName: item.unionName?.trim() || '',
        upazila: item.upazila?.trim() || '',
        fiberLength: item.fiberLength?.trim() || '',
        issueFound: '',
        missingWrongDetails: '',
        actionTaken: 'Generated from UPAC PDF',
        reasonForAction: 'Scanned EDC acceptance certificate',
        resellerInformed: 'Yes - phone',
        followUpNeeded: 'No',
        status: 'Resolved',
        supervisorInformed: 'I informed my superiors',
        remarks: `Scanned from UPAC PDF: ${item.fileName}`,
        createdAt: now,
        updatedAt: now,
      }));

      await saveBatchLogs(entriesToSave);
      setBatchQueue([]);
      setShowBatchQueue(false);
      onCancel(); // back to the list with the new logs
    } catch (err: any) {
      alert(`Failed to save batch logs: ${err?.message || err}`);
    } finally {
      setIsBatchSaving(false);
    }
  };

  const handleLoadQueueItemIntoForm = (item: ScannedQueueItem) => {
    applyScanToForm(item);
    setFormData((prev) => ({
      ...prev,
      resellerName: item.resellerName || prev.resellerName,
      resellerPhone: item.resellerPhone || prev.resellerPhone,
    }));
    setShowBatchQueue(false);
  };

  const commit = (entry: LogEntry, andCreateAnother: boolean) => {
    onSave(entry, andCreateAnother);
    if (andCreateAnother) {
      setLastScan(null);
      setFormData((prev) => ({
        logNo: Number(prev.logNo || nextLogNo) + 1,
        date: formatEntryDate(new Date()),
        resellerName: prev.resellerName || '',
        resellerId: prev.resellerId || '',
        resellerPhone: prev.resellerPhone || '',
        requestType: prev.requestType || 'New User ID',
        customerName: '',
        nameBn: '',
        nameEn: '',
        headTeacherName: '',
        headTeacherPhone: '',
        nmsId: '',
        edcNo: '',
        routerSerial: '',
        mac: '',
        lat: '',
        long: '',
        unionName: '',
        upazila: '',
        fiberLength: '',
        issueFound: '',
        missingWrongDetails: '',
        actionTaken: '',
        reasonForAction: '',
        resellerInformed: prev.resellerInformed || 'Yes - phone',
        followUpNeeded: 'Yes',
        followUpDate: '',
        status: 'Pending - waiting for reseller',
        supervisorInformed: prev.supervisorInformed || 'I informed my superiors',
        remarks: '',
      }));
    }
  };

  const handleSubmit = (e: React.FormEvent, andCreateAnother = false) => {
    e.preventDefault();

    const finalizedEntry: LogEntry = {
      id: initialData?.id || crypto.randomUUID(),
      logNo: formData.logNo || nextLogNo,
      date: formData.date?.trim() || formatEntryDate(new Date()),
      resellerName: formData.resellerName?.trim() || '',
      resellerId: currentReseller?.id || '',
      resellerPhone: formData.resellerPhone?.trim() || '',
      requestType: formData.requestType?.trim() || 'New User ID',
      customerName: primaryName(formData.nameBn, formData.nameEn, formData.customerName),
      nameBn: formData.nameBn?.trim() || '',
      nameEn: formData.nameEn?.trim() || '',
      headTeacherName: formData.headTeacherName?.trim() || '',
      headTeacherPhone: formData.headTeacherPhone?.trim() || '',
      nmsId: formData.nmsId?.trim() || '',
      edcNo: formData.edcNo?.trim() || '',
      routerSerial: formData.routerSerial?.trim() || '',
      mac: formData.mac?.trim() || '',
      lat: formData.lat?.trim() || '',
      long: formData.long?.trim() || '',
      unionName: formData.unionName?.trim() || '',
      upazila: upazilaPick || formData.upazila?.trim() || '',
      fiberLength: formData.fiberLength?.trim() || '',
      category: formData.category?.trim() || resolveCategory(formData),
      issueFound: formData.issueFound?.trim() || '',
      missingWrongDetails: formData.missingWrongDetails?.trim() || '',
      actionTaken: formData.actionTaken?.trim() || '',
      reasonForAction: formData.reasonForAction?.trim() || '',
      resellerInformed: formData.resellerInformed?.trim() || '',
      followUpNeeded: formData.followUpNeeded?.trim() || '',
      followUpDate: formData.followUpDate || '',
      status: formData.status?.trim() || 'Pending - waiting for reseller',
      supervisorInformed: formData.supervisorInformed?.trim() || '',
      remarks: formData.remarks?.trim() || '',
      formReceivedAt: initialData?.formReceivedAt || '',
      createdAt: initialData?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: initialData?.createdBy,
      updatedBy: initialData?.updatedBy,
      history: initialData?.history,
    };

    if (dups.length > 0) {
      setPendingSave({ entry: finalizedEntry, another: andCreateAnother });
      return;
    }
    commit(finalizedEntry, andCreateAnother);
  };

  return (
    <form onSubmit={(e) => handleSubmit(e, false)} className="w-full space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,application/pdf"
        onChange={(e) => handleFileUpload(e.target.files)}
        className="hidden"
      />

      {/* Header bar */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors"
            title="Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-sm font-semibold text-slate-900">
              {isEditing ? `Edit Log #${formData.logNo}` : 'New Reseller Request Log'}
            </h1>
            <p className="text-[11px] text-slate-500">
              Fill the record manually or scan UPAC / EDC PDF certificates.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {existsInDb && autoSave.state !== 'idle' && (
            <span
              className={`text-[11px] ${autoSave.state === 'error' ? 'text-rose-600' : 'text-slate-500'}`}
              aria-live="polite"
            >
              {autoSave.state === 'saving' ? 'Saving…' : autoSave.state === 'saved' ? 'All changes saved' : 'Not saved - retrying…'}
            </span>
          )}
          {batchQueue.length > 0 && (
            <button
              type="button"
              onClick={() => setShowBatchQueue(!showBatchQueue)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand-900 bg-brand-100 hover:bg-brand-200 rounded-lg transition-colors"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Queue ({batchQueue.length})</span>
            </button>
          )}

          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>

          {!isEditing && (
            <button
              type="button"
              onClick={(e) => handleSubmit(e, true)}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Save & Next
            </button>
          )}

          <button
            type="submit"
            className="px-3.5 py-1.5 text-xs font-medium text-white bg-brand-800 hover:bg-brand-900 rounded-lg shadow-xs transition-colors"
          >
            {isEditing ? 'Save Changes' : 'Save Log'}
          </button>
        </div>
      </div>

      {/* UPAC PDF scanner */}
      <div className="bg-gradient-to-br from-brand-900 via-brand-800 to-emerald-900 text-white rounded-2xl p-4 sm:p-5 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/10 rounded-xl">
              <FileText className="w-5 h-5 text-emerald-300" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight">UPAC PDF Scanner</h2>
              <p className="text-xs text-brand-100/80">
                Upload one or many UPAC / EDC certificate PDFs. Fills institute name, EDC, NMS ID, coordinates, MAC, serial and fiber length.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isScanning}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-white text-brand-900 hover:bg-brand-50 rounded-xl shadow-xs transition-colors disabled:opacity-50"
          >
            {isScanning ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-800" />
                <span>Reading...</span>
              </>
            ) : (
              <>
                <Upload className="w-3.5 h-3.5" />
                <span>Scan PDF Forms (Single / Batch)</span>
              </>
            )}
          </button>
        </div>

        {lastScan && !isScanning && (
          <div className="p-3 bg-emerald-500/20 border border-emerald-400/40 rounded-xl text-xs space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
                <div className="truncate">
                  Filled from <span className="font-semibold text-white">{lastScan.fileName}</span>
                  {lastScan.customerName ? <> - {lastScan.customerName}</> : null}
                </div>
              </div>
              <span className="text-[10px] text-emerald-200 shrink-0">
                {Math.round(lastScan.confidence * 9)}/9 key fields found
              </span>
            </div>
            {lastScan.warnings.length > 0 && (
              <ul className="list-disc pl-9 text-[11px] text-amber-200 space-y-0.5">
                {lastScan.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {scanError && !isScanning && (
          <div className="p-3 bg-rose-500/20 border border-rose-400/40 rounded-xl flex items-center gap-2 text-xs text-rose-200">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-300" />
            <span>{scanError}</span>
          </div>
        )}
      </div>

      {/* Batch Scanned Queue Table (Shown when multi-files are uploaded) */}
      {showBatchQueue && batchQueue.length > 0 && (
        <div className="bg-white rounded-2xl border border-brand-200 shadow-sm p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-brand-700" />
              <h3 className="text-xs font-bold text-slate-900">
                Scanned PDF Queue ({batchQueue.length} forms)
              </h3>
            </div>

            {/* Bulk reseller assign */}
            <div className="flex items-center gap-2">
              <select
                value={batchReseller}
                onChange={(e) => {
                  const val = e.target.value;
                  setBatchReseller(val);
                  const matched = resellers.find((r) => r.name === val);
                  if (matched) setBatchResellerPhone(matched.phone || '');
                }}
                className="px-2.5 py-1 text-xs border border-slate-300 rounded-lg bg-slate-50"
              >
                <option value="">Select Reseller for all...</option>
                {activeResellers.map((r) => (
                  <option key={r.id} value={r.name}>
                    {r.name}
                  </option>
                ))}
              </select>

              <input
                type="text"
                value={batchResellerPhone}
                onChange={(e) => setBatchResellerPhone(e.target.value)}
                placeholder="Reseller Phone"
                className="px-2.5 py-1 text-xs border border-slate-300 rounded-lg w-32"
              />

              <button
                type="button"
                onClick={handleBatchResellerApply}
                disabled={!batchReseller}
                className="px-2.5 py-1 text-xs font-medium text-white bg-slate-800 hover:bg-slate-900 rounded-lg disabled:opacity-40"
              >
                Apply to All
              </button>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs divide-y divide-slate-200">
              <thead className="bg-slate-50 text-[11px] font-semibold text-slate-700">
                <tr>
                  <th className="px-3 py-2">Institute / Customer</th>
                  <th className="px-3 py-2">EDC / NMS</th>
                  <th className="px-3 py-2">Upazila / Union</th>
                  <th className="px-3 py-2">Router & MAC</th>
                  <th className="px-3 py-2">Fiber (m)</th>
                  <th className="px-3 py-2">Contact Phone</th>
                  <th className="px-3 py-2">Reseller Name</th>
                  <th className="px-3 py-2">Reseller Phone</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {batchQueue.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium text-slate-900 max-w-[200px] truncate">
                      {item.customerName || '—'}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-600">
                      {item.edcNo ? `EDC: ${item.edcNo}` : ''}
                      {item.nmsId ? ` · NMS: ${item.nmsId}` : ''}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {[item.upazila, item.unionName].filter(Boolean).join(' / ') || '—'}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-slate-600">
                      <div>{item.routerSerial || '—'}</div>
                      <div className="text-slate-400">{item.mac || 'No MAC'}</div>
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-600">{item.fiberLength || '—'}</td>
                    <td className="px-3 py-2 text-slate-600">{item.headTeacherPhone || '—'}</td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={item.resellerName}
                        onChange={(e) => {
                          const val = e.target.value;
                          setBatchQueue((prev) =>
                            prev.map((q) => (q.id === item.id ? { ...q, resellerName: val } : q))
                          );
                        }}
                        placeholder="Reseller name"
                        className="px-2 py-0.5 text-xs border border-slate-200 rounded w-28"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={item.resellerPhone}
                        onChange={(e) => {
                          const val = e.target.value;
                          setBatchQueue((prev) =>
                            prev.map((q) => (q.id === item.id ? { ...q, resellerPhone: val } : q))
                          );
                        }}
                        placeholder="Reseller phone"
                        className="px-2 py-0.5 text-xs border border-slate-200 rounded w-28"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleLoadQueueItemIntoForm(item)}
                          className="p-1 text-slate-600 hover:text-brand-800 rounded"
                          title="Open this item in main form"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setBatchQueue((prev) => prev.filter((q) => q.id !== item.id))
                          }
                          className="p-1 text-slate-400 hover:text-rose-600 rounded"
                          title="Remove from queue"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-slate-500">
              Total {batchQueue.length} records ready to be logged.
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setBatchQueue([])}
                className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg"
              >
                Clear Queue
              </button>
              <button
                type="button"
                onClick={handleBatchSaveAll}
                disabled={isBatchSaving}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-brand-800 hover:bg-brand-900 rounded-lg shadow-xs disabled:opacity-50"
              >
                {isBatchSaving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Logging...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Batch Log All ({batchQueue.length}) Records</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate warning */}
      {dups.length > 0 && (
        <div className="flex gap-2 items-start text-xs text-amber-900 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2.5">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-px text-amber-600" />
          <div className="space-y-1 min-w-0">
            <div className="font-semibold">Already used on another log</div>
            {dups.map((d) => (
              <div key={d.field} className="break-words">
                {d.label} <span className="font-mono font-semibold">{d.value}</span> is on{' '}
                {d.others.slice(0, 3).map(describeLog).join('; ')}
                {d.others.length > 3 ? ` and ${d.others.length - 3} more` : ''}.
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!pendingSave}
        title="Duplicate found"
        message={
          dups
            .map((d) => `${d.label} ${d.value} is already on ${describeLog(d.others[0])}.`)
            .join(' ') + ' Save anyway?'
        }
        confirmLabel="Save anyway"
        isDestructive={false}
        onCancel={() => setPendingSave(null)}
        onConfirm={() => {
          if (pendingSave) commit(pendingSave.entry, pendingSave.another);
          setPendingSave(null);
        }}
      />

      {/* Main Form Sections */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
        {/* Section 1: Record & Reseller Details */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 pb-1 border-b border-slate-100">
            1. Log Identification & Reseller
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Log No. <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                value={formData.logNo ?? ''}
                onChange={(e) => updateField('logNo', parseInt(e.target.value, 10) || 1)}
                required
                className="w-full px-2.5 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg font-mono focus:outline-none focus:border-brand-600"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-slate-700">
                  Date <span className="text-rose-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => updateField('date', formatEntryDate(new Date()))}
                  className="text-[11px] text-slate-500 hover:text-slate-800"
                >
                  Today
                </button>
              </div>
              <input
                type="date"
                value={toInputDate(parseEntryDate(formData.date))}
                onChange={(e) => {
                  const d = fromInputDate(e.target.value);
                  if (d) updateField('date', formatEntryDate(d));
                }}
                required
                className="w-full px-2.5 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-brand-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Upazila</label>
              <select
                value={upazilaPick}
                onChange={(e) => pickUpazila(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-brand-600"
              >
                <option value="">Select upazila…</option>
                {UPAZILAS.map((u) => (
                  <option key={u.key} value={u.key}>
                    {u.key} · {u.bn}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Reseller Name <span className="text-rose-500">*</span>
              </label>
              {resellers.length > 0 ? (
                <select
                  value={currentReseller?.id || (formData.resellerName ? '__keep__' : '')}
                  onChange={(e) => pickReseller(e.target.value)}
                  required
                  className="w-full px-2.5 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-brand-600"
                >
                  <option value="">{upazilaPick && resellerPool.length === 0 ? `No reseller in ${upazilaPick} yet` : 'Select reseller…'}</option>
                  {!currentReseller && formData.resellerName && (
                    <option value="__keep__">{formData.resellerName} (not in list)</option>
                  )}
                  {resellerPool.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {!upazilaPick && upazilaKey(r.area) ? ` · ${upazilaKey(r.area)}` : ''}
                    </option>
                  ))}
                  {currentReseller && !currentReseller.active && (
                    <option value={currentReseller.id}>{currentReseller.name} (inactive)</option>
                  )}
                </select>
              ) : (
                <input
                  type="text"
                  value={formData.resellerName || ''}
                  onChange={(e) => updateField('resellerName', e.target.value)}
                  placeholder="e.g. Shabul"
                  required
                  className="w-full px-2.5 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg"
                />
              )}
            </div>

            {/* Reseller Phone */}
            <SuggestionInput
              name="resellerPhone"
              label="Reseller Phone"
              type="tel"
              value={formData.resellerPhone || ''}
              onChange={(val) => updateField('resellerPhone', val)}
              suggestions={suggestions.resellerPhone}
              placeholder="e.g. +880 1711-234567"
            />

            <SuggestionInput
              name="requestType"
              label="Request Type"
              value={formData.requestType || ''}
              onChange={(val) => updateField('requestType', val)}
              suggestions={suggestions.requestType}
              placeholder="e.g. New User ID"
              required
            />
          </div>
        </div>

        {/* Section 2: Institute / Customer & Contacts */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 pb-1 border-b border-slate-100">
            2. Customer / Institute Details & Leadership Contacts
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <SuggestionInput
                name="nameBn"
                label="Institute Name – বাংলা (shown in logs)"
                value={formData.nameBn || ''}
                onChange={(val) => updateField('nameBn', val)}
                suggestions={[]}
                placeholder="e.g. কাজী জালাল উদ্দিন বালক সরকারি প্রাথমিক বিদ্যালয়"
                required={!formData.nameEn?.trim()}
              />
            </div>
            <div>
              <SuggestionInput
                name="nameEn"
                label="Institute Name – English (kept for reference)"
                value={formData.nameEn || ''}
                onChange={(val) => updateField('nameEn', val)}
                suggestions={[]}
                placeholder="e.g. Kazi Jalal Uddin Boys Govt. Primary School"
              />
            </div>

            <SuggestionInput
              name="nmsId"
              label="NMS ID / Customer ID"
              value={formData.nmsId || ''}
              onChange={(val) => updateField('nmsId', val)}
              suggestions={suggestions.nmsId}
              placeholder="e.g. 55686"
            />

            <SuggestionInput
              name="category"
              label="Category (auto-detected, editable)"
              value={formData.category || ''}
              onChange={(val) => updateField('category', val)}
              suggestions={[...CATEGORY_LABELS]}
              placeholder="Detected from the institute name"
            />

            {/* NEW: Head Teacher / In-Charge Name */}
            <SuggestionInput
              name="headTeacherName"
              label="Head Teacher / In-Charge Name"
              value={formData.headTeacherName || ''}
              onChange={(val) => updateField('headTeacherName', val)}
              suggestions={[]}
              placeholder="সংযোগ গ্রহণকারী প্রধান কর্মকর্তার নাম"
            />

            {/* NEW: Head Teacher Phone */}
            <SuggestionInput
              name="headTeacherPhone"
              label="Head Teacher / In-Charge Phone"
              type="tel"
              value={formData.headTeacherPhone || ''}
              onChange={(val) => updateField('headTeacherPhone', val)}
              suggestions={[]}
              placeholder="e.g. +880 1711-XXXXXX"
            />

            <SuggestionInput
              name="edcNo"
              label="EDC Book No. / সুত্র নং"
              value={formData.edcNo || ''}
              onChange={(val) => updateField('edcNo', val)}
              suggestions={[]}
              placeholder="e.g. 929"
            />
          </div>
        </div>

        {/* Section 3: Geographic Location */}
        <div>
          <div className="flex items-center justify-between mb-3 pb-1 border-b border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              3. Geographic Location (Union, Coordinates)
            </h3>
            {formData.lat && formData.long && (
              <a
                href={`https://www.google.com/maps?q=${formData.lat},${formData.long}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-brand-700 hover:text-brand-900 font-medium"
              >
                <MapPin className="w-3 h-3" />
                <span>View on Google Maps</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Union */}
            <SuggestionInput
              name="unionName"
              label="Union / Ward / Pouroshova"
              value={formData.unionName || ''}
              onChange={(val) => updateField('unionName', val)}
              suggestions={['বালাগঞ্জ সদর', 'বিশ্বনাথ পৌরসভা', 'দেওয়ান বাজার', 'সিলেট সিটি কর্পোরেশন ওয়ার্ড নং-১৭']}
              placeholder="e.g. বালাগঞ্জ সদর / বিশ্বনাথ পৌরসভা"
            />

            {/* NEW: Lat */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Latitude (Lat)</label>
              <input
                type="text"
                value={formData.lat || ''}
                onChange={(e) => updateField('lat', e.target.value)}
                placeholder="e.g. 24.8965"
                className="w-full px-2.5 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg font-mono focus:outline-none focus:border-brand-600"
              />
            </div>

            {/* NEW: Long */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Longitude (Long)</label>
              <input
                type="text"
                value={formData.long || ''}
                onChange={(e) => updateField('long', e.target.value)}
                placeholder="e.g. 91.8791"
                className="w-full px-2.5 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg font-mono focus:outline-none focus:border-brand-600"
              />
            </div>
          </div>
        </div>

        {/* Section 4: Technical & Equipment Details */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 pb-1 border-b border-slate-100">
            4. Hardware, Fiber & Technical Parameters
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SuggestionInput
              name="mac"
              label="Wi-Fi Router MAC Address"
              value={formData.mac || ''}
              onChange={(val) => updateField('mac', val)}
              suggestions={suggestions.mac}
              placeholder="e.g. 20:23:51:78:47:A0"
              autoFormatMac
            />

            <SuggestionInput
              name="routerSerial"
              label="Router Serial No."
              value={formData.routerSerial || ''}
              onChange={(val) => updateField('routerSerial', val)}
              suggestions={[]}
              placeholder="e.g. 22640VJ005236"
            />

            {/* NEW: Fiber Length */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Fiber Length (meters)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={formData.fiberLength || ''}
                  onChange={(e) => updateField('fiberLength', e.target.value)}
                  placeholder="e.g. 200, 1500, 1520"
                  className="w-full px-2.5 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg font-mono focus:outline-none focus:border-brand-600"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
                  mtr.
                </span>
              </div>
            </div>

            <div className="sm:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <SuggestionInput
                name="issueFound"
                label="Issue Found"
                value={formData.issueFound || ''}
                onChange={(val) => updateField('issueFound', val)}
                suggestions={suggestions.issueFound}
                placeholder="e.g. Same router at two institute / Port down"
                isTextarea
                rows={2}
              />

              <SuggestionInput
                name="missingWrongDetails"
                label="Missing / Wrong Details"
                value={formData.missingWrongDetails || ''}
                onChange={(val) => updateField('missingWrongDetails', val)}
                suggestions={suggestions.missingWrongDetails}
                placeholder="e.g. They previously used the same router in Radhakona Govt. Primary School"
                isTextarea
                rows={2}
              />
            </div>
          </div>
        </div>

        {/* Section 5: Action Taken & Resolutions */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 pb-1 border-b border-slate-100">
            5. Action Taken, Status & Follow-ups
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SuggestionInput
              name="actionTaken"
              label="Action Taken"
              value={formData.actionTaken || ''}
              onChange={(val) => updateField('actionTaken', val)}
              suggestions={suggestions.actionTaken}
              placeholder="e.g. Provided the id/form as requested but kept nms entry on hold"
              isTextarea
              rows={2}
            />

            <SuggestionInput
              name="reasonForAction"
              label="Reason for Action (why I did it)"
              value={formData.reasonForAction || ''}
              onChange={(val) => updateField('reasonForAction', val)}
              suggestions={suggestions.reasonForAction}
              placeholder="e.g. I did not entry this school in nms because nms doesn't allow two school with same router."
              isTextarea
              rows={2}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
            <SuggestionInput
              name="resellerInformed"
              label="Reseller Informed?"
              value={formData.resellerInformed || ''}
              onChange={(val) => updateField('resellerInformed', val)}
              suggestions={suggestions.resellerInformed}
              placeholder="e.g. Yes - phone"
            />

            <SuggestionInput
              name="followUpNeeded"
              label="Follow-up Needed?"
              value={formData.followUpNeeded || ''}
              onChange={(val) => updateField('followUpNeeded', val)}
              suggestions={suggestions.followUpNeeded}
              placeholder="e.g. Yes"
            />

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-slate-700">Follow-up Date</label>
                {formData.followUpDate && (
                  <button
                    type="button"
                    onClick={() => updateField('followUpDate', '')}
                    className="text-[11px] text-slate-500 hover:text-slate-800"
                  >
                    Clear
                  </button>
                )}
              </div>
              <input
                type="date"
                value={formData.followUpDate || ''}
                onChange={(e) => updateField('followUpDate', e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-brand-600"
              />
              <div className="flex gap-1 mt-1.5">
                {([['Tomorrow', 1], ['3 days', 3], ['1 week', 7]] as const).map(
                  ([label, n]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => updateField('followUpDate', addDaysIso(n))}
                      className="px-2 py-0.5 text-[11px] text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-full"
                    >
                      {label}
                    </button>
                  )
                )}
              </div>
            </div>

            <SuggestionInput
              name="status"
              label="Status"
              value={formData.status || ''}
              onChange={(val) => updateField('status', val)}
              suggestions={suggestions.status}
              placeholder="e.g. Pending - waiting for reseller"
              required
            />

            <SuggestionInput
              name="supervisorInformed"
              label="Supervisor Informed / Approved By"
              value={formData.supervisorInformed || ''}
              onChange={(val) => updateField('supervisorInformed', val)}
              suggestions={suggestions.supervisorInformed}
              placeholder="e.g. I informed my superiors"
            />

            <div className="sm:col-span-3">
              <SuggestionInput
                name="remarks"
                label="Remarks"
                value={formData.remarks || ''}
                onChange={(val) => updateField('remarks', val)}
                suggestions={suggestions.remarks}
                placeholder="e.g. Reseller said Radhakona Govt. Primary School is not using the network or the router anymore..."
                isTextarea
                rows={2}
              />
            </div>
          </div>
        </div>
      </div>
    </form>
  );
};
