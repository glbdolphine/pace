import React, { useRef, useState } from 'react';
import { LogEntry, FieldSuggestionsMap } from '../types';
import { exportAppBackup, parseAppBackup } from '../utils/storage';
import { exportBatchLogsExcel } from '../utils/exportExcel';
import { exportBatchLogsPdf } from '../utils/exportPdf';
import { X, Download, Upload, FileSpreadsheet, FileText, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { ConfirmDialog } from './ConfirmDialog';

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  logs: LogEntry[];
  suggestions: FieldSuggestionsMap;
  onRestore: (logs: LogEntry[], suggestions: FieldSuggestionsMap, merge: boolean) => void;
  onClearAllLogs: () => void;
}

export const BackupModal: React.FC<BackupModalProps> = ({
  isOpen,
  onClose,
  logs,
  suggestions,
  onRestore,
  onClearAllLogs,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [mergeOption, setMergeOption] = useState<'replace' | 'merge'>('replace');

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const { logs: importedLogs, suggestions: importedSuggestions } = parseAppBackup(text);
        
        onRestore(importedLogs, importedSuggestions, mergeOption === 'merge');
        setSuccessMsg(`Restored ${importedLogs.length} logs successfully.`);
        if (fileInputRef.current) fileInputRef.current.value = '';
      } catch (err: any) {
        setErrorMsg(err.message || 'Failed to read backup file.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
        <div className="bg-white w-full max-w-lg rounded-lg shadow-xl border border-slate-200 overflow-hidden flex flex-col">
          {/* Header */}
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Data Backup & Restore
              </h2>
              <p className="text-xs text-slate-500">
                Backup or restore all {logs.length} logs and saved field entries.
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-700 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-5 text-xs">
            {errorMsg && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Export Section */}
            <div>
              <h3 className="font-semibold text-slate-800 mb-2">1. Backup Everything</h3>
              <p className="text-slate-500 mb-3">
                Downloads a complete archive containing all logs, MAC addresses, and saved auto-fill suggestions.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => exportAppBackup(logs, suggestions)}
                  className="flex items-center justify-center gap-1.5 p-2.5 bg-brand-800 hover:bg-brand-900 text-white rounded font-medium transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Full Backup (.json)</span>
                </button>

                <button
                  type="button"
                  onClick={() => exportBatchLogsExcel(logs)}
                  className="flex items-center justify-center gap-1.5 p-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded font-medium transition-colors"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Excel (.xlsx)</span>
                </button>

                <button
                  type="button"
                  onClick={() => exportBatchLogsPdf(logs)}
                  className="flex items-center justify-center gap-1.5 p-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded font-medium transition-colors"
                >
                  <FileText className="w-3.5 h-3.5 text-slate-600" />
                  <span>PDF Report</span>
                </button>
              </div>
            </div>

            <div className="border-t border-slate-100" />

            {/* Import / Restore Section */}
            <div>
              <h3 className="font-semibold text-slate-800 mb-2">2. Restore from Backup File</h3>
              <p className="text-slate-500 mb-2">
                Load a previously exported <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">.json</code> backup file.
              </p>

              <div className="flex items-center gap-4 mb-3">
                <label className="flex items-center gap-1.5 text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="mergeMode"
                    checked={mergeOption === 'replace'}
                    onChange={() => setMergeOption('replace')}
                    className="text-slate-900"
                  />
                  <span>Replace existing logs</span>
                </label>
                <label className="flex items-center gap-1.5 text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="mergeMode"
                    checked={mergeOption === 'merge'}
                    onChange={() => setMergeOption('merge')}
                    className="text-slate-900"
                  />
                  <span>Merge with current logs</span>
                </label>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileChange}
                className="hidden"
                id="backup-file-input"
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-1.5 p-2.5 border border-dashed border-slate-300 hover:border-slate-400 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Select .json Backup File to Restore</span>
              </button>
            </div>

            <div className="border-t border-slate-100" />

            {/* Clear All Data */}
            <div className="flex items-center justify-between pt-1">
              <div>
                <span className="font-semibold text-slate-800">Clear All Logs</span>
                <p className="text-slate-400 text-[11px]">Delete all shared logs from the database. Everyone will lose access to them.</p>
              </div>

              <button
                type="button"
                onClick={() => setIsClearConfirmOpen(true)}
                disabled={logs.length === 0}
                className="px-2.5 py-1.5 text-rose-700 hover:bg-rose-50 border border-rose-200 rounded disabled:opacity-40 transition-colors"
              >
                Clear All Logs
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-100"
            >
              Done
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={isClearConfirmOpen}
        title="Clear All Logs?"
        message={`Move all ${logs.length} logs to the admin bin? Only the admin can restore them.`}
        confirmLabel="Clear All"
        onConfirm={() => {
          setIsClearConfirmOpen(false);
          onClearAllLogs();
        }}
        onCancel={() => setIsClearConfirmOpen(false)}
      />
    </>
  );
};
