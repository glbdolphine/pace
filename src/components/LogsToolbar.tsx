import React, { useState } from 'react';
import { LogEntry } from '../types';
import {
  Search,
  FileText,
  FileSpreadsheet,
  Printer,
  List,
  LayoutGrid,
  SlidersHorizontal,
  UploadCloud,
  ListChecks,
  ChevronDown,
  ChevronUp,
  X,
  Calendar,
  Clock,
  ExternalLink,
} from 'lucide-react';
import { exportBatchLogsPdf } from '../utils/exportPdf';
import { exportBatchLogsExcel } from '../utils/exportExcel';
import type { FormFilter, ImportPlan } from '../utils/forms';
import type { FollowFilter } from '../utils/followUps';
import type { Reseller } from '../types';
import { UPAZILAS, upazilaKey } from '../utils/upazilas';
import { toInputDate } from '../utils/dates';

export type StatusFilter = 'all' | 'pending' | 'in_progress' | 'resolved';
export type ViewMode = 'list' | 'card';
export type SortBy = 'log_desc' | 'log_asc' | 'date_desc' | 'date_asc' | 'upazila' | 'reseller';

const STATUS_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'resolved', label: 'Resolved' },
];

export const STANDARD_CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'Primary Education', label: 'Primary' },
  { key: 'Secondary Education', label: 'Secondary' },
  { key: 'National University', label: 'National University' },
  { key: 'Madrasa Education', label: 'Madrasa' },
  { key: 'Health Service', label: 'Health' },
  { key: 'Land Reform Board', label: 'Land Reform' },
  { key: 'Govt. Organization', label: 'Govt. Org' },
];

interface LogsToolbarProps {
  totalCount: number;
  filteredLogs: LogEntry[];
  searchTerm: string;
  onSearchChange: (value: string) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (value: StatusFilter) => void;
  onJumpToLog: (id: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onPrintAll: () => void;
  allLogs: LogEntry[];
  formFilter: FormFilter;
  onFormFilterChange: (f: FormFilter) => void;
  onPickFormReseller: (name: string) => void;
  onApplyFormImport: (plan: ImportPlan) => Promise<void>;
  resellers: Reseller[];
  followFilter: FollowFilter;
  onFollowFilterChange: (f: FollowFilter) => void;
  followCounts: { today: number; overdue: number };
  upazilaFilter: string;
  onUpazilaFilterChange: (v: string) => void;
  resellerFilter: string;
  onResellerFilterChange: (v: string) => void;
  sortBy: SortBy;
  onSortChange: (v: SortBy) => void;
  dateFrom: string;
  dateTo: string;
  onDateRangeChange: (from: string, to: string) => void;
  categoryFilter?: string;
  onCategoryFilterChange?: (cat: string) => void;
  categoryCounts?: Record<string, number>;
  onOpenCsvImport?: () => void;
  onOpenFieldFill?: () => void;
}

export const LogsToolbar: React.FC<LogsToolbarProps> = ({
  totalCount,
  filteredLogs,
  searchTerm,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  onJumpToLog,
  viewMode,
  onViewModeChange,
  onPrintAll,
  allLogs,
  formFilter,
  onFormFilterChange,
  onPickFormReseller,
  onApplyFormImport,
  resellers,
  followFilter,
  onFollowFilterChange,
  followCounts,
  upazilaFilter,
  onUpazilaFilterChange,
  resellerFilter,
  onResellerFilterChange,
  sortBy,
  onSortChange,
  dateFrom,
  dateTo,
  onDateRangeChange,
  categoryFilter = 'all',
  onCategoryFilterChange,
  categoryCounts = {},
  onOpenCsvImport,
  onOpenFieldFill,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const none = filteredLogs.length === 0;
  const resellerOptions = resellers
    .filter((r) => !upazilaFilter || upazilaKey(r.area) === upazilaFilter)
    .sort((a, b) => a.name.localeCompare(b.name));

  const hasAdvancedActive = Boolean(dateFrom || dateTo || followFilter !== 'all');
  const hasAnyFilterActive = Boolean(
    searchTerm ||
    statusFilter !== 'all' ||
    categoryFilter !== 'all' ||
    upazilaFilter ||
    resellerFilter ||
    dateFrom ||
    dateTo ||
    followFilter !== 'all' ||
    formFilter !== 'all'
  );

  const handleClearAllFilters = () => {
    onSearchChange('');
    onStatusFilterChange('all');
    if (onCategoryFilterChange) onCategoryFilterChange('all');
    onUpazilaFilterChange('');
    onResellerFilterChange('');
    onDateRangeChange('', '');
    onFollowFilterChange('all');
    onFormFilterChange('all');
  };

  const selClass =
    'h-8 text-xs text-slate-800 bg-white border border-slate-200 hover:border-slate-300 rounded-full px-2.5 focus:outline-none focus:border-brand-600 transition-colors cursor-pointer max-w-[150px] truncate';

  return (
    <div className="no-print bg-white/95 backdrop-blur border-b border-brand-100 shadow-xs flex flex-col text-xs">
      {/* ── ROW 1: Sleek Category Tabs & Quick Action Suite ──────────────── */}
      <div className="px-3 sm:px-4 py-1.5 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 border-b border-slate-100 overflow-hidden">
        {/* Category Pills (horizontal scrolling) */}
        {onCategoryFilterChange ? (
          <div className="order-2 sm:order-none w-full sm:w-auto flex items-center gap-1 overflow-x-auto scrollbar-none py-0.5 min-w-0">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1 hidden sm:inline">
              Category:
            </span>
            {STANDARD_CATEGORIES.map((cat) => {
              const count = cat.key === 'all' ? allLogs.length : (categoryCounts[cat.key] || 0);
              const isActive = categoryFilter === cat.key;
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => onCategoryFilterChange(cat.key)}
                  className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] font-medium rounded-full border transition-all ${
                    isActive
                      ? 'bg-brand-800 text-white border-brand-800 font-semibold shadow-xs'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <span>{cat.label}</span>
                  <span
                    className={`text-[9px] font-mono px-1.5 py-0.2 rounded-full ${
                      isActive ? 'bg-white/20 text-white' : 'bg-slate-200/80 text-slate-600'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="hidden sm:block" />
        )}

        {/* Right side actions */}
        <div className="order-1 sm:order-none ml-auto sm:ml-0 flex items-center gap-1.5 shrink-0">
          <span className="text-[11px] text-slate-500 font-mono hidden md:inline px-1">
            {filteredLogs.length === totalCount ? `${totalCount} logs` : `${filteredLogs.length}/${totalCount}`}
          </span>

          {onOpenFieldFill && (
            <button
              type="button"
              onClick={onOpenFieldFill}
              className="inline-flex items-center gap-1 h-7 px-2.5 text-[11px] font-semibold text-brand-900 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-full transition-colors shadow-xs"
              title="Fill one field (e.g. MAC) on many logs from a pasted list"
            >
              <ListChecks className="w-3.5 h-3.5 text-brand-700" />
              <span>Fill field</span>
            </button>
          )}

          {onOpenCsvImport && (
            <button
              type="button"
              onClick={onOpenCsvImport}
              className="inline-flex items-center gap-1 h-7 px-2.5 text-[11px] font-semibold text-brand-900 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-full transition-colors shadow-xs"
              title="Bulk import logs from CSV"
            >
              <UploadCloud className="w-3.5 h-3.5 text-brand-700" />
              <span>Import CSV</span>
            </button>
          )}

          {/* Export buttons */}
          <div className="flex items-center gap-0.5 bg-slate-50 p-0.5 rounded-full border border-slate-200">
            <button
              type="button"
              onClick={() => exportBatchLogsExcel(filteredLogs)}
              disabled={none}
              className="h-6 px-2 text-[10px] font-semibold text-emerald-700 hover:bg-white rounded-full transition-colors disabled:opacity-30 inline-flex items-center gap-1"
              title="Export Excel"
            >
              <FileSpreadsheet className="w-3 h-3" />
              <span className="hidden sm:inline">Excel</span>
            </button>
            <button
              type="button"
              onClick={() => exportBatchLogsPdf(filteredLogs)}
              disabled={none}
              className="h-6 px-2 text-[10px] font-semibold text-brand-700 hover:bg-white rounded-full transition-colors disabled:opacity-30 inline-flex items-center gap-1"
              title="Export PDF"
            >
              <FileText className="w-3 h-3" />
              <span className="hidden sm:inline">PDF</span>
            </button>
            <button
              type="button"
              onClick={onPrintAll}
              disabled={none}
              className="h-6 w-6 text-slate-600 hover:bg-white rounded-full transition-colors disabled:opacity-30 inline-flex items-center justify-center"
              title="Print All"
            >
              <Printer className="w-3 h-3" />
            </button>
          </div>

          {/* List / Cards view mode toggle */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-full border border-slate-200" role="group">
            {([['list', List, 'List'], ['card', LayoutGrid, 'Cards']] as const).map(([k, Icon, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => onViewModeChange(k)}
                aria-pressed={viewMode === k}
                title={label}
                className={`flex items-center gap-1 h-6 px-2 rounded-full text-[10px] font-semibold transition-colors ${
                  viewMode === k ? 'bg-brand-700 text-white shadow-xs' : 'text-slate-600 hover:text-brand-900'
                }`}
              >
                <Icon className="w-3 h-3" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── ROW 2: Compact Main Operational Bar ──────────────────────────── */}
      <div className="px-3 sm:px-4 py-1.5 flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
          {/* Search Box */}
          <div className="relative min-w-[140px] max-w-[240px] flex-1">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search logs..."
              className="w-full h-8 pl-8 pr-2.5 text-xs bg-[#e8eefb] border border-transparent rounded-full focus:outline-none focus:bg-white focus:border-brand-600 transition-colors placeholder:text-slate-400"
            />
          </div>

          {/* Status Filter (Compact segmented control) */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-full border border-slate-200">
            {STATUS_OPTIONS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => onStatusFilterChange(f.key)}
                className={`px-2.5 py-1 rounded-full text-[11px] transition-colors ${
                  statusFilter === f.key
                    ? 'bg-white text-brand-900 font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Quick Select: Upazila */}
          <select
            value={upazilaFilter}
            onChange={(e) => onUpazilaFilterChange(e.target.value)}
            className={selClass}
            aria-label="Filter by upazila"
          >
            <option value="">All upazilas</option>
            {UPAZILAS.map((u) => (
              <option key={u.key} value={u.key}>
                {u.key}
              </option>
            ))}
          </select>

          {/* Quick Select: Reseller */}
          <select
            value={resellerFilter}
            onChange={(e) => onResellerFilterChange(e.target.value)}
            className={selClass}
            aria-label="Filter by reseller"
          >
            <option value="">All resellers ({resellerOptions.length})</option>
            {resellerOptions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {!upazilaFilter && upazilaKey(r.area) ? ` (${upazilaKey(r.area)})` : ''}
              </option>
            ))}
          </select>

          {/* Quick Select: Sort */}
          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value as SortBy)}
            className={selClass}
            aria-label="Sort logs"
          >
            <option value="date_desc">Date (newest)</option>
            <option value="date_asc">Date (oldest)</option>
            <option value="log_desc">Log # (highest)</option>
            <option value="log_asc">Log # (lowest)</option>
            <option value="upazila">Upazila</option>
            <option value="reseller">Reseller</option>
          </select>

          {/* More Filters / Dates Toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full text-xs font-medium border transition-colors ${
              hasAdvancedActive || showAdvanced
                ? 'bg-brand-50 border-brand-300 text-brand-900 font-semibold'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
            title="Date range, follow-ups & quick jump"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-brand-600" />
            <span>Dates & Follow-ups</span>
            {hasAdvancedActive && (
              <span className="w-2 h-2 rounded-full bg-brand-600 ring-2 ring-white" />
            )}
            {showAdvanced ? (
              <ChevronUp className="w-3 h-3 text-slate-400" />
            ) : (
              <ChevronDown className="w-3 h-3 text-slate-400" />
            )}
          </button>

          {/* Clear Filters Button */}
          {hasAnyFilterActive && (
            <button
              type="button"
              onClick={handleClearAllFilters}
              className="inline-flex items-center gap-1 h-8 px-2.5 text-xs text-rose-700 hover:bg-rose-50 rounded-full transition-colors font-medium"
              title="Reset all filters"
            >
              <X className="w-3 h-3" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* ── EXPANDABLE TRAY: Dates, Presets & Follow-up Filters ───────────── */}
      {showAdvanced && (
        <div className="px-3 sm:px-4 py-2 border-t border-slate-100 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex flex-wrap items-center gap-3">
            {/* Date Range Inputs */}
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>From</span>
              <input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => onDateRangeChange(e.target.value, dateTo)}
                className="h-7 text-xs bg-white border border-slate-200 rounded-md px-1.5"
              />
              <span>To</span>
              <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => onDateRangeChange(dateFrom, e.target.value)}
                className="h-7 text-xs bg-white border border-slate-200 rounded-md px-1.5"
              />
            </div>

            {/* Date Presets */}
            <div className="flex flex-wrap items-center gap-1">
              {[
                { label: 'Today', days: 0 },
                { label: '7 days', days: 6 },
                { label: '30 days', days: 29 },
              ].map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - p.days);
                    onDateRangeChange(toInputDate(from), toInputDate(now));
                  }}
                  className="px-2 py-0.5 text-[10px] font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Follow-up Filter Pills */}
            <div className="flex flex-wrap items-center gap-1 bg-white p-0.5 rounded-xl border border-slate-200">
              <span className="text-[10px] text-slate-400 font-semibold px-2">Follow-up:</span>
              {([
                ['all', 'Any', 0],
                ['today', 'Due today', followCounts.today],
                ['overdue', 'Overdue', followCounts.overdue],
              ] as const).map(([k, label, n]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => onFollowFilterChange(k)}
                  className={`px-2 py-0.5 rounded-full text-[10px] transition-colors ${
                    followFilter === k
                      ? 'bg-brand-700 text-white font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {label}
                  {k !== 'all' && n > 0 && (
                    <span className={`ml-1 font-mono ${k === 'overdue' ? 'text-rose-300' : 'text-amber-300'}`}>
                      {n}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Log Opener */}
          {!none && (
            <div className="flex items-center gap-1.5">
              <select
                value=""
                onChange={(e) => e.target.value && onJumpToLog(e.target.value)}
                className="h-7 text-xs text-slate-800 bg-white border border-slate-200 rounded-md px-2 max-w-[220px] truncate"
              >
                <option value="">Jump to log...</option>
                {filteredLogs.slice(0, 150).map((item) => (
                  <option key={item.id} value={item.id}>
                    #{item.logNo} — {item.customerName || 'Untitled'} ({item.nmsId})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
