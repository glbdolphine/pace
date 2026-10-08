import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { logUpazila, UPAZILAS } from './utils/upazilas';
import { matchReseller } from './utils/resellers';
import { logDay, fromInputDate } from './utils/dates';
import { LogEntry, FieldSuggestionsMap, ActivityEvent, AppUser, Reseller, ApprovalRequest, MarkAction, MarkKind } from './types';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { LogsToolbar, StatusFilter, ViewMode, SortBy } from './components/LogsToolbar';
import { LogList, LogDetailModal } from './components/LogList';
import { DevelopedBy } from './components/DevelopedBy';
import { LogForm } from './components/LogForm';
import { FormMaker } from './components/FormMaker';
import { ResellerSupply } from './components/ResellerSupply';
import { ResellerDirectory } from './components/ResellerDirectory';
import { Dashboard, DashboardGo } from './components/Dashboard';
import { LogSheetView } from './components/LogSheetView';
import { SuggestionsModal } from './components/SuggestionsModal';
import { BackupModal } from './components/BackupModal';
import { ActivityModal } from './components/ActivityModal';
import { AdminPanel } from './components/AdminPanel';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { CsvImportModal } from './components/CsvImportModal';
import { FieldFillModal } from './components/FieldFillModal';
import type { FillKey } from './utils/bulkFill';
import { cleanCategoryLabel } from './utils/csvImporter';
import { displayCategory } from './utils/category';
import { splitName, primaryName } from './utils/names';
import {
  loadLogs, saveLog, deleteLog, clearAllLogs, loadSuggestions, saveSuggestions,
  loadActivity, subscribeToCloud, restoreLogs, getAccessToken, importLocalBrowserData,
  loadResellers, createReseller, updateReseller, deleteReseller, notePasswordChanged,
  saveBatchLogs, bulkFillField, loadApprovals, requestMarks, decideApprovals, withdrawApproval,
} from './utils/cloud';
import { exportAppBackup } from './utils/storage';
import { changePassword } from './utils/auth';
import { FormFilter, ImportPlan, expectsForm, hasForm } from './utils/forms';
import { hasBill } from './utils/bills';
import { monthKey, monthLabel } from './utils/months';
import { MonthSelect } from './components/MonthSelect';
import { MissingKey, missingLabel, missingOf } from './utils/completeness';
import { indexPending } from './utils/approvals';
import { ApprovalsPanel } from './components/ApprovalsPanel';
import { BillsPanel } from './components/BillsPanel';
import { FormsTab } from './components/FormsTab';
import { ConfirmDialog } from './components/ConfirmDialog';
import { FollowFilter, followState } from './utils/followUps';
import { Plus, UploadCloud } from 'lucide-react';

const DESKTOP_QUERY = '(min-width: 1024px)';

interface AppProps {
  onLock?: () => void;
  currentUser: AppUser;
  initialAdminPanelOpen?: boolean;
}

export default function App({ onLock, currentUser, initialAdminPanelOpen = false }: AppProps) {
  const user = currentUser;
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [suggestions, setSuggestions] = useState<FieldSuggestionsMap>({} as FieldSuggestionsMap);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [markPrompt, setMarkPrompt] = useState<
    | { type: 'mark'; items: { log: LogEntry; kind: MarkKind; action: MarkAction; month?: string }[] }
    | { type: 'withdraw'; approval: ApprovalRequest }
    | null
  >(null);
  const [approvalBusy, setApprovalBusy] = useState(false);
  // What the "mark as received" prompt asks for: the month of a bill, or the date a form was received.
  const todayStr = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD in local time
  const [markMonth, setMarkMonth] = useState(monthKey());
  const [markDate, setMarkDate] = useState(todayStr());
  const [selectedLogId, setSelectedLogId] = useState('');
  const [currentView, setCurrentView] = useState<'home' | 'sheet' | 'form' | 'maker' | 'resellers' | 'directory' | 'bills' | 'forms'>('home');
  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [followFilter, setFollowFilter] = useState<FollowFilter>('all');
  const [editingLog, setEditingLog] = useState<LogEntry | null>(null);
  const [isSuggestionsModalOpen, setIsSuggestionsModalOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(initialAdminPanelOpen && currentUser.role === 'admin');
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [isCsvImportModalOpen, setIsCsvImportModalOpen] = useState(false);
  const [isFieldFillOpen, setIsFieldFillOpen] = useState(false);
  const [formFilter, setFormFilter] = useState<FormFilter>('all');
  const [upazilaFilter, setUpazilaFilter] = useState('');
  const [resellerFilter, setResellerFilter] = useState('');
  const [missingFilter, setMissingFilter] = useState<MissingKey | ''>('');
  const [sortBy, setSortBy] = useState<SortBy>('date_desc');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [openLogId, setOpenLogId] = useState<string | null>(null);
  const [printingAll, setPrintingAll] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try { return localStorage.getItem('pace_it_view_mode') === 'list' ? 'list' : 'card'; } catch { return 'card'; }
  });
  const changeViewMode = (m: ViewMode) => {
    setViewMode(m);
    try { localStorage.setItem('pace_it_view_mode', m); } catch { /* ignore */ }
  };

  // Sidebar: a persistent, collapsible rail on large screens, a slide-over drawer on small ones.
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia(DESKTOP_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  const [sidebarDesktopOpen, setSidebarDesktopOpen] = useState(() => {
    try { return localStorage.getItem('pace_it_sidebar') !== 'closed'; } catch { return true; }
  });
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false);
  const sidebarVisible = isDesktop ? sidebarDesktopOpen : sidebarMobileOpen;
  const toggleSidebar = () => {
    if (!isDesktop) { setSidebarMobileOpen((v) => !v); return; }
    const next = !sidebarDesktopOpen;
    setSidebarDesktopOpen(next);
    try { localStorage.setItem('pace_it_sidebar', next ? 'open' : 'closed'); } catch { /* ignore */ }
  };
  const closeSidebar = React.useCallback(() => setSidebarMobileOpen(false), []);

  const handlePrintAll = () => {
    setPrintingAll(true);
    const done = () => { setPrintingAll(false); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.setTimeout(() => window.print(), 150);
  };

  // Only replace state when the data really changed - avoids re-rendering the whole app for nothing.
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

  const refreshLogs = async () => {
    try {
      const data = await loadLogs();
      setLogs((prev) => (same(prev, data) ? prev : data));
      setSelectedLogId(current => current && data.some(l => l.id === current) ? current : (data[0]?.id || ''));
    } catch (e: any) {
      console.warn('refreshLogs:', e?.message);
    }
  };

  const refreshActivity = async () => {
    try { const d = await loadActivity(); setActivity((prev) => (same(prev, d) ? prev : d)); } catch (e) { console.error(e); }
  };

  const refreshResellers = async () => {
    try { const d = await loadResellers(); setResellers((prev) => (same(prev, d) ? prev : d)); } catch (e) { console.error(e); }
  };

  const refreshApprovals = async () => {
    try { const d = await loadApprovals(); setApprovals((prev) => (same(prev, d) ? prev : d)); } catch (e) { console.error(e); }
  };

  const refreshSuggestions = async () => {
    try { const d = await loadSuggestions(); setSuggestions((prev) => (same(prev, d) ? prev : d)); } catch (e) { console.error(e); }
  };

  useEffect(() => {
    let alive = true;
    Promise.all([loadLogs(), loadActivity(), loadSuggestions(), loadResellers(), loadApprovals()])
      .then(([loadedLogs, loadedActivity, loadedSuggestions, loadedResellers, loadedApprovals]) => {
        if (!alive) return;
        setApprovals(loadedApprovals);
        setLogs(loadedLogs);
        setResellers(loadedResellers);
        setActivity(loadedActivity);
        setSuggestions(loadedSuggestions);
        setSelectedLogId(loadedLogs[0]?.id || '');
      })
      .catch((e) => {
        console.error(e);
        if (alive) showToast(e?.message || 'Could not load shared data');
      })
      .finally(() => { if (alive) setLoading(false); });

    const unsubscribe = subscribeToCloud(refreshLogs, refreshActivity, refreshSuggestions, refreshResellers, refreshApprovals);
    return () => { alive = false; unsubscribe(); };
  }, []);

  const showToast = (message: string) => {
    setToastMessage(message);
    window.setTimeout(() => setToastMessage(null), 2600);
  };

  const nextLogNo = useMemo(() => {
    if (!logs.length) return 1;
    return Math.max(...logs.map(l => {
      const n = typeof l.logNo === 'number' ? l.logNo : parseInt(String(l.logNo), 10);
      return Number.isFinite(n) ? n : 0;
    })) + 1;
  }, [logs]);

  // Typing stays responsive: the list filters on a slightly delayed copy of the search text.
  const deferredSearch = useDeferredValue(searchTerm);

  // Built once per data change (not once per keystroke): search text and upazila of every log.
  const searchIndex = useMemo(() => {
    const m = new Map<string, string>();
    for (const log of logs) {
      m.set(
        log.id,
        [
          log.logNo, log.date, log.resellerName, log.resellerPhone, log.requestType,
          log.customerName, log.nameBn, log.nameEn, log.headTeacherName, log.headTeacherPhone, log.nmsId, log.issueFound,
          log.missingWrongDetails, log.actionTaken, log.reasonForAction, log.status, log.remarks, log.mac,
          log.edcNo, log.routerSerial, log.upazila, log.unionName, log.lat, log.long, log.fiberLength, log.category,
        ].filter(Boolean).join(' ').toLowerCase()
      );
    }
    return m;
  }, [logs]);

  const upazilaOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const log of logs) m.set(log.id, logUpazila(log, resellers));
    return m;
  }, [logs, resellers]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const l of logs) {
      const c = cleanCategoryLabel(displayCategory(l));
      counts[c] = (counts[c] || 0) + 1;
    }
    return counts;
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    const fromT = fromInputDate(dateFrom)?.getTime() ?? null;
    const toT = fromInputDate(dateTo)?.getTime() ?? null;
    return logs.filter((log) => {
      if (categoryFilter !== 'all') {
        const c = cleanCategoryLabel(displayCategory(log));
        if (c !== categoryFilter) return false;
      }
      const s = (log.status || '').toLowerCase();
      if (statusFilter === 'pending' && !s.includes('pending') && !s.includes('waiting')) return false;
      if (statusFilter === 'in_progress' && !s.includes('progress')) return false;
      if (statusFilter === 'resolved' && !s.includes('resolved') && !s.includes('closed')) return false;
      if (followFilter !== 'all' && followState(log) !== followFilter) return false;
      if (upazilaFilter && upazilaOf.get(log.id) !== upazilaFilter) return false;
      if (fromT !== null || toT !== null) {
        const t = logDay(log)?.getTime();
        if (t === undefined) return false;
        if (fromT !== null && t < fromT) return false;
        if (toT !== null && t > toT) return false;
      }
      if (missingFilter && !missingOf(log).some((m) => m.key === missingFilter)) return false;
      if (resellerFilter && matchReseller({ resellerId: log.resellerId, resellerName: log.resellerName }, resellers)?.id !== resellerFilter) return false;
      if (formFilter !== 'all') {
        if (!expectsForm(log)) return false;
        if (formFilter === 'awaiting' && hasForm(log)) return false;
        if (formFilter === 'received' && !hasForm(log)) return false;
      }
      if (!query) return true;
      return (searchIndex.get(log.id) || '').includes(query);
    });
  }, [logs, resellers, deferredSearch, statusFilter, categoryFilter, formFilter, followFilter, upazilaFilter, resellerFilter, missingFilter, dateFrom, dateTo, searchIndex, upazilaOf]);

  const followCounts = useMemo(() => ({
    today: logs.filter((l) => followState(l) === 'today').length,
    overdue: logs.filter((l) => followState(l) === 'overdue').length,
  }), [logs]);

  const [formsInitialTab, setFormsInitialTab] = useState<'awaiting' | 'received' | 'all'>('awaiting');

  const goLogs = (t: DashboardGo) => {
    // Form shortcuts from the dashboard now open the Forms tab.
    if (t.form) {
      setFormsInitialTab('awaiting');
      setCurrentView('forms');
      return;
    }
    setSearchTerm('');
    setStatusFilter(t.status ?? 'all');
    setFormFilter(t.form ?? 'all');
    setFollowFilter(t.follow ?? 'all');
    setUpazilaFilter('');
    setMissingFilter(t.missing ?? '');
    // a reseller picked on the dashboard filters by that reseller
    const picked = t.resellerName ? resellers.find((r) => r.name === t.resellerName) : undefined;
    setResellerFilter(picked?.id ?? '');
    if (t.resellerName && !picked) setSearchTerm(t.resellerName);
    setCurrentView('sheet');
  };

  const displayLogs = useMemo(() => {
    const num = (l: LogEntry) => {
      const n = typeof l.logNo === 'number' ? l.logNo : parseInt(String(l.logNo), 10);
      return Number.isFinite(n) ? n : 0;
    };
    const rank = new Map<string, number>();
    const times = new Map<string, number>();
    for (const l of filteredLogs) {
      const i = UPAZILAS.findIndex((u) => u.key === upazilaOf.get(l.id));
      rank.set(l.id, i === -1 ? 99 : i);
      times.set(l.id, logDay(l)?.getTime() ?? 0);
    }
    const upaRank = (l: LogEntry) => rank.get(l.id) ?? 99;
    const time = (l: LogEntry) => times.get(l.id) ?? 0;
    const rname = (l: LogEntry) => (l.resellerName || '').toLowerCase();
    const list = [...filteredLogs];
    switch (sortBy) {
      case 'log_desc': return list.sort((a, b) => num(b) - num(a));
      case 'date_desc': return list.sort((a, b) => time(b) - time(a) || num(b) - num(a));
      case 'date_asc': return list.sort((a, b) => time(a) - time(b) || num(a) - num(b));
      case 'upazila': return list.sort((a, b) => upaRank(a) - upaRank(b) || rname(a).localeCompare(rname(b)) || num(a) - num(b));
      case 'reseller': return list.sort((a, b) => rname(a).localeCompare(rname(b)) || time(b) - time(a));
      default: return list.sort((a, b) => num(a) - num(b));
    }
  }, [filteredLogs, sortBy, upazilaOf]);

  const scrollToLog = (id: string) => {
    window.setTimeout(() => document.getElementById(`item-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  const handleSaveLog = async (entry: LogEntry, andCreateAnother = false) => {
    try {
      const existing = logs.find(l => l.id === entry.id) || null;
      const saved = await saveLog(entry, user, existing);
      await Promise.all([refreshLogs(), refreshActivity(), refreshSuggestions()]);
      setSelectedLogId(saved.id);
      scrollToLog(saved.id);
      setSearchTerm('');
      setStatusFilter('all');
      setFollowFilter('all');
      showToast(`Log #${saved.logNo} saved`);
      if (!andCreateAnother) {
        setEditingLog(null);
        setCurrentView('sheet');
      }
    } catch (e: any) {
      showToast(e?.message || 'Could not save log');
    }
  };

  const handleBatchImport = async (entries: LogEntry[]) => {
    try {
      await saveBatchLogs(entries);
      await Promise.all([refreshLogs(), refreshActivity(), refreshSuggestions()]);
      setCategoryFilter('all');
      setCurrentView('sheet');
      showToast(`Successfully imported ${entries.length} logs from CSV`);
    } catch (e: any) {
      showToast(e?.message || 'Could not import batch logs');
      throw e;
    }
  };

  // "Fill a field from a list": writes one field on many logs, then reloads the data.
  const handleFieldFill = async (field: FillKey, items: { id: string; value: string }[]) => {
    const r = await bulkFillField(field, items);
    await Promise.all([refreshLogs(), refreshActivity(), refreshSuggestions()]);
    showToast(`${r.updated} log${r.updated === 1 ? '' : 's'} updated`);
    return r;
  };

  // Called by Form Maker after a form is downloaded. New logs get the same defaults as the log form;
  // re-downloads only refresh the auto-filled fields so anything typed later is kept.
  const handleAutoLog = async (fields: Partial<LogEntry>, existingId?: string): Promise<LogEntry> => {
    const existing = existingId ? logs.find(l => l.id === existingId) || null : null;
    const now = new Date().toISOString();
    const entry = (existing ? { ...existing, ...fields } : {
      id: crypto.randomUUID(), logNo: nextLogNo, resellerName: '', resellerPhone: '',
      issueFound: '', missingWrongDetails: '', actionTaken: '', reasonForAction: '',
      resellerInformed: 'Yes - phone', followUpNeeded: 'Yes', status: 'Pending - waiting for reseller',
      supervisorInformed: 'I informed my superiors', remarks: '', createdAt: now, updatedAt: now,
      ...fields,
    }) as LogEntry;
    if (fields.customerName) {
      // keep the Bangla and English names in their own fields; logs show the Bangla one
      const n = splitName(fields.customerName);
      entry.nameBn = n.nameBn || existing?.nameBn || '';
      entry.nameEn = n.nameEn || existing?.nameEn || '';
      entry.customerName = primaryName(entry.nameBn, entry.nameEn);
    }
    const saved = await saveLog(entry, user, existing);
    await Promise.all([refreshLogs(), refreshActivity(), refreshSuggestions()]);
    showToast(`Log #${saved.logNo} ${existing ? 'updated' : 'created'}`);
    return saved;
  };

  // Form / bill marks: always ask first. An administrator's mark applies at once; anyone else's goes to
  // the "waiting for confirmation" list and the admin approves it later.
  const pendingIdx = useMemo(() => indexPending(approvals), [approvals]);
  useEffect(() => {
    if (markPrompt?.type === 'mark') {
      setMarkMonth(markPrompt.items[0].month || monthKey());
      setMarkDate(todayStr());
    }
  }, [markPrompt]);
  const pendingList = useMemo(() => approvals.filter((a) => a.status === 'pending'), [approvals]);

  // `month` is the receiving month ('YYYY-MM'). Panels pass the month picked there; the small chips elsewhere
  // use the current month.
  const askToggle = (log: LogEntry, kind: MarkKind, month?: string) => {
    const m = month || monthKey();
    const existing = kind === 'bill' ? pendingIdx.get(`${log.id}|bill|${m}`) : pendingIdx.get(`${log.id}|form`);
    if (existing) { setMarkPrompt({ type: 'withdraw', approval: existing }); return; }
    const got = kind === 'form' ? hasForm(log) : hasBill(log, m);
    setMarkPrompt({ type: 'mark', items: [{ log, kind, action: got ? 'not_received' : 'received', month: m }] });
  };
  const handleToggleForm = (log: LogEntry, month?: string) => askToggle(log, 'form', month);
  const handleToggleBill = (log: LogEntry, month?: string) => askToggle(log, 'bill', month);

  const askMany = (logsToMark: LogEntry[], kind: MarkKind, action: MarkAction, month?: string) => {
    if (!logsToMark.length) return;
    const m = month || monthKey();
    setMarkPrompt({ type: 'mark', items: logsToMark.map((log) => ({ log, kind, action, month: m })) });
  };

  const handleApplyFormImport = async (plan: ImportPlan) => {
    askMany(plan.toMark.map((x) => x.log), 'form', 'received');
  };

  const confirmMarkPrompt = async () => {
    const prompt = markPrompt;
    setMarkPrompt(null);
    if (!prompt) return;
    try {
      if (prompt.type === 'withdraw') {
        await withdrawApproval(prompt.approval.id);
        showToast('Request withdrawn');
      } else {
        const r = await requestMarks(prompt.items.map((i) => ({
          logId: i.log.id, kind: i.kind, action: i.action,
          // received: the month / date picked in the prompt; not received: the month of the bill being unmarked
          month: i.kind === 'bill' ? (i.action === 'received' ? markMonth : i.month) : undefined,
          receivedOn: i.kind === 'form' && i.action === 'received' ? (markDate || todayStr()) : undefined,
        })));
        showToast(r.queued ? `${r.queued} request${r.queued === 1 ? '' : 's'} sent to the admin for approval` : r.applied ? `${r.applied} marked` : 'Nothing to change');
      }
      await Promise.all([refreshLogs(), refreshApprovals(), refreshActivity()]);
    } catch (e: any) {
      showToast(e?.message || 'Could not send the request');
    }
  };

  const runDecision = async (opts: { ids?: string[]; all?: boolean; approve: boolean }) => {
    setApprovalBusy(true);
    try {
      const r = await decideApprovals(opts);
      await Promise.all([refreshLogs(), refreshApprovals(), refreshActivity()]);
      showToast(opts.approve ? `${r.approved} approved` : `${r.rejected} rejected`);
    } catch (e: any) {
      showToast(e?.message || 'Could not update the requests');
    } finally {
      setApprovalBusy(false);
    }
  };

  const approvalsPanel = (
    <ApprovalsPanel
      approvals={approvals}
      isAdmin={user.role === 'admin'}
      currentName={user.displayName}
      busy={approvalBusy}
      onApproveAll={() => runDecision({ all: true, approve: true })}
      onRejectAll={() => runDecision({ all: true, approve: false })}
      onApprove={(id) => runDecision({ ids: [id], approve: true })}
      onReject={(id) => runDecision({ ids: [id], approve: false })}
      onWithdraw={async (id) => { try { await withdrawApproval(id); await refreshApprovals(); showToast('Request withdrawn'); } catch (e: any) { showToast(e?.message || 'Could not withdraw'); } }}
      onOpenLog={setOpenLogId}
    />
  );

  const markDialog = (() => {
    if (!markPrompt) return { title: '', message: '', confirm: '' };
    if (markPrompt.type === 'withdraw') {
      const a = markPrompt.approval;
      return { title: 'Withdraw this request?', message: `${a.kind === 'form' ? 'Form' : 'Bill'} ${a.action === 'received' ? 'received' : 'not received'} for #${a.logNo} ${a.customer || ''} will no longer wait for the admin.`, confirm: 'Withdraw' };
    }
    const first = markPrompt.items[0];
    const word = first.kind === 'form' ? 'form' : 'bill';
    const what = first.action === 'received' ? 'received' : 'not received';
    const many = markPrompt.items.length > 1;
    const target = many ? `${markPrompt.items.length} ${word}s` : `the ${word} for #${first.log.logNo} ${first.log.nameBn || first.log.customerName || ''}`;
    const when = first.action === 'received'
      ? (first.kind === 'bill' ? ` for ${monthLabel(markMonth)}` : markDate ? ` on ${new Date(`${markDate}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}` : '')
      : (first.kind === 'bill' && first.month ? ` for ${monthLabel(first.month)}` : '');
    return {
      title: `Mark ${many ? `${markPrompt.items.length} ${word}s` : word} as ${what}?`,
      message: user.role === 'admin'
        ? `You are about to mark ${target} as ${what}${when}. This is applied immediately.`
        : `You are about to mark ${target} as ${what}${when}. This is sent to the admin and stays in "Waiting for confirmation" until it is approved.`,
      confirm: user.role === 'admin' ? 'Confirm' : 'Send for approval',
    };
  })();

  const handleEdit = (log: LogEntry) => {
    setEditingLog(log);
    setCurrentView('form');
  };

  const handleDuplicate = (log: LogEntry) => {
    const now = new Date().toISOString();
    setEditingLog({
      ...log,
      id: crypto.randomUUID(),
      logNo: nextLogNo,
      date: new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }),
      createdAt: now,
      updatedAt: now,
      createdBy: user.displayName,
      updatedBy: user.displayName,
      history: [],
      formReceivedAt: '',
      billReceivedAt: '',
      billMonths: [],
    });
    setCurrentView('form');
    showToast(`Duplicated to Log #${nextLogNo}`);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteLog(id, user);
      await Promise.all([refreshLogs(), refreshActivity()]);
      showToast('Log moved to the admin bin');
    } catch (e: any) {
      showToast(e?.message || 'Could not delete log');
    }
  };

  const handleClearAllLogs = async () => {
    try {
      await clearAllLogs(user);
      await Promise.all([refreshLogs(), refreshActivity()]);
      setSelectedLogId('');
      setCurrentView('sheet');
      showToast('All logs moved to the admin bin');
    } catch (e: any) {
      showToast(e?.message || 'Could not clear logs');
    }
  };

  const handleRestoreBackup = async (importedLogs: LogEntry[], importedSuggestions: FieldSuggestionsMap, merge: boolean) => {
    try {
      const total = await restoreLogs(importedLogs, merge, user);
      await saveSuggestions(importedSuggestions);
      await Promise.all([refreshLogs(), refreshActivity(), refreshSuggestions()]);
      showToast(`Restored ${total} shared logs`);
    } catch (e: any) {
      showToast(e?.message || 'Could not restore backup');
    }
  };

  const handleUpdateSuggestions = async (updated: FieldSuggestionsMap) => {
    try {
      await saveSuggestions(updated);
      setSuggestions(updated);
      showToast('Saved values updated');
    } catch (e: any) {
      showToast(e?.message || 'Could not update saved values');
    }
  };

  const handleImportLocal = async () => {
    try {
      const total = await importLocalBrowserData(user);
      await refreshLogs();
      await refreshActivity();
      showToast(total ? `Imported ${total} local logs into shared storage` : 'No old local logs found');
    } catch (e: any) {
      showToast(e?.message || 'Could not import local data');
    }
  };

  const handleCreateReseller = async (input: { name: string; area: string; phone: string }) => {
    await createReseller(input, user);
    await Promise.all([refreshResellers(), refreshActivity()]);
    showToast('Reseller added');
  };
  const handleUpdateReseller = async (id: string, input: { name: string; area: string; phone: string; active: boolean }) => {
    await updateReseller(id, input);
    await Promise.all([refreshResellers(), refreshLogs()]);
    showToast('Reseller updated');
  };
  const handleDeleteReseller = async (id: string) => {
    try {
      await deleteReseller(id);
      await Promise.all([refreshResellers(), refreshActivity()]);
      showToast('Reseller moved to the admin bin');
    } catch (e: any) {
      showToast(e?.message || 'Could not delete reseller');
    }
  };

  const handleChangePassword = async (password: string) => {
    try {
      await changePassword(password);
      await notePasswordChanged();
      showToast('Password changed');
      setIsPasswordModalOpen(false);
    } catch (e: any) {
      showToast(e?.message || 'Could not change password');
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-[#eef8f1] flex items-center justify-center text-sm text-slate-500">Loading shared Pace IT data…</div>;
  }

  return (
    <div className="min-h-screen bg-[#eef8f1] flex flex-col font-sans">
      <Navbar
        onGoHome={() => setCurrentView('home')}
        onToggleSidebar={toggleSidebar}
        sidebarOpen={sidebarVisible}
        onNewLog={() => { setEditingLog(null); setCurrentView('form'); }}
        onLock={onLock}
      />

      <div className="flex flex-1 min-w-0">
        <Sidebar
          visible={sidebarVisible}
          isDesktop={isDesktop}
          onClose={closeSidebar}
          currentView={currentView}
          onNavigate={setCurrentView}
          logsCount={logs.length}
          userName={user.displayName}
          userRole={user.role}
          onOpenBackup={() => setIsBackupModalOpen(true)}
          onOpenActivity={() => setIsActivityModalOpen(true)}
          onChangePassword={() => setIsPasswordModalOpen(true)}
          onOpenSuggestions={user.role === 'admin' ? () => setIsSuggestionsModalOpen(true) : undefined}
          onOpenAdmin={user.role === 'admin' ? () => setIsAdminPanelOpen(true) : undefined}
          pendingCount={pendingList.length}
        />

        <div className="flex-1 min-w-0 flex flex-col">
      {currentView === 'sheet' && logs.length > 0 && (
        <div className="no-print md:sticky md:top-14 z-30 shadow-sm">
          <LogsToolbar totalCount={logs.length} filteredLogs={displayLogs} searchTerm={searchTerm}
            onSearchChange={setSearchTerm} statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter} onJumpToLog={setOpenLogId}
            viewMode={viewMode} onViewModeChange={changeViewMode} onPrintAll={handlePrintAll}
            allLogs={logs} formFilter={formFilter} onFormFilterChange={setFormFilter}
            onPickFormReseller={(name) => { setSearchTerm(name); setFormFilter('awaiting'); }}
            onApplyFormImport={handleApplyFormImport}
            upazilaFilter={upazilaFilter} onUpazilaFilterChange={(v) => { setUpazilaFilter(v); setResellerFilter(''); }}
            resellerFilter={resellerFilter} onResellerFilterChange={setResellerFilter}
            sortBy={sortBy} onSortChange={setSortBy}
            dateFrom={dateFrom} dateTo={dateTo} onDateRangeChange={(f, t) => { setDateFrom(f); setDateTo(t); }}
            resellers={resellers} followFilter={followFilter} onFollowFilterChange={setFollowFilter} followCounts={followCounts}
            categoryFilter={categoryFilter} onCategoryFilterChange={setCategoryFilter} categoryCounts={categoryCounts}
            onOpenCsvImport={() => setIsCsvImportModalOpen(true)}
            onOpenFieldFill={() => setIsFieldFillOpen(true)} />
        </div>
      )}

      <main className="no-print flex-1 w-full p-3 sm:p-4 max-w-[1400px] mx-auto">
        {toastMessage && <div className="fixed bottom-4 right-4 z-50 bg-brand-800 text-white text-xs px-3 py-1.5 rounded shadow-lg">{toastMessage}</div>}

        {currentView === 'home' && (
          <Dashboard logs={logs} activity={activity} userName={user.displayName} onOpenLog={setOpenLogId} onGo={goLogs} approvalsPanel={approvalsPanel} onOpenBills={() => setCurrentView('bills')} />
        )}

        {currentView === 'forms' && (
          <FormsTab key={formsInitialTab} logs={logs} resellers={resellers} pending={pendingIdx} initialTab={formsInitialTab}
            onToggleForm={handleToggleForm} onMarkMany={(ls, action) => askMany(ls, 'form', action)} onOpenLog={setOpenLogId} />
        )}

        {currentView === 'bills' && (
          <BillsPanel logs={logs} pending={pendingIdx} onToggleBill={handleToggleBill}
            onMarkMany={(ls, action, month) => askMany(ls, 'bill', action, month)} onOpenLog={setOpenLogId} />
        )}

        {currentView === 'directory' && (
          <ResellerDirectory resellers={resellers} logs={logs}
            onCreate={handleCreateReseller} onUpdate={handleUpdateReseller} onDelete={handleDeleteReseller} />
        )}

        {currentView === 'resellers' && (
          <ResellerSupply logs={logs} onOpenLog={setOpenLogId} />
        )}

        {currentView === 'maker' && (
          <FormMaker
            logs={logs}
            onLog={handleAutoLog}
            onOpenLog={(id) => { const l = logs.find(x => x.id === id); if (l) handleEdit(l); }}
          />
        )}

        {currentView === 'form' && (
          <LogForm
            initialData={editingLog}
            nextLogNo={nextLogNo}
            suggestions={suggestions}
            logs={logs}
            resellers={resellers}
            onSave={handleSaveLog}
            onAutoSaved={(saved) => setLogs((prev) => prev.map((l) => (l.id === saved.id ? saved : l)))}
            onCancel={() => { setEditingLog(null); setCurrentView('sheet'); }}
          />
        )}

        {currentView === 'sheet' && logs.length === 0 && (
          <div className="bg-white rounded-2xl border border-brand-100 text-center py-16 px-4 space-y-4">
            <p className="text-sm text-slate-500 mb-2">No shared logs yet.</p>
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <button onClick={() => { setEditingLog(null); setCurrentView('form'); }} className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-brand-800 hover:bg-brand-900 rounded-xl shadow-xs transition-colors">
                <Plus className="w-3.5 h-3.5" /> Create first log
              </button>
              <button onClick={() => setIsCsvImportModalOpen(true)} className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-brand-900 bg-brand-50 border border-brand-200 hover:bg-brand-100 rounded-xl shadow-xs transition-colors">
                <UploadCloud className="w-3.5 h-3.5 text-brand-700" /> Import from CSV
              </button>
            </div>
          </div>
        )}

        {currentView === 'sheet' && logs.length > 0 && (
          <div>
            {missingFilter && (
              <div className="mb-3 flex items-center justify-between gap-2 px-3 py-2 text-xs bg-amber-50 border border-amber-200 rounded-xl text-amber-900">
                <span>Showing logs with <b>{missingLabel(missingFilter)}</b> missing ({displayLogs.length})</span>
                <button type="button" onClick={() => setMissingFilter('')} className="px-2.5 py-1 font-semibold bg-white border border-amber-300 rounded-full hover:bg-amber-100">Show all logs</button>
              </div>
            )}
            {displayLogs.length > 0 ? (
              <LogList logs={displayLogs} resetKey={`${searchTerm}|${statusFilter}|${categoryFilter}|${formFilter}|${followFilter}|${upazilaFilter}|${resellerFilter}|${missingFilter}|${dateFrom}|${dateTo}|${sortBy}|${viewMode}`} mode={viewMode} resellers={resellers} onOpen={(l) => setOpenLogId(l.id)} onToggleForm={handleToggleForm} onToggleBill={handleToggleBill} pending={pendingIdx} />
            ) : (
              <div className="bg-white rounded-2xl border border-brand-100 text-center py-16 px-4"><p className="text-sm text-slate-500">No logs match your search or filter.</p></div>
            )}
          </div>
        )}
      </main>

      <DevelopedBy />
        </div>
      </div>

      <LogDetailModal
        log={logs.find((l) => l.id === openLogId) || null}
        onClose={() => setOpenLogId(null)}
        onEdit={(l) => { setOpenLogId(null); handleEdit(l); }}
        onDuplicate={(l) => { setOpenLogId(null); handleDuplicate(l); }}
        onDelete={(id) => { setOpenLogId(null); handleDelete(id); }}
        onToggleForm={handleToggleForm}
        onToggleBill={handleToggleBill}
        pending={pendingIdx}
        resellers={resellers}
      />

      <CsvImportModal
        isOpen={isCsvImportModalOpen}
        onClose={() => setIsCsvImportModalOpen(false)}
        existingLogs={logs}
        resellers={resellers}
        nextLogNo={nextLogNo}
        onImportBatch={handleBatchImport}
      />

      <FieldFillModal isOpen={isFieldFillOpen} onClose={() => setIsFieldFillOpen(false)} logs={logs} onApply={handleFieldFill} />

      {printingAll && (
        <div className="hidden print:block">
          {displayLogs.map((l) => <LogSheetView key={l.id} log={l} resellers={resellers} />)}
        </div>
      )}

      {user.role === 'admin' && <SuggestionsModal isOpen={isSuggestionsModalOpen} onClose={() => setIsSuggestionsModalOpen(false)} suggestions={suggestions} onUpdateSuggestions={handleUpdateSuggestions} />}
      <ActivityModal isOpen={isActivityModalOpen} onClose={() => setIsActivityModalOpen(false)} events={activity} />
      <BackupModal isOpen={isBackupModalOpen} onClose={() => setIsBackupModalOpen(false)} logs={logs} suggestions={suggestions} onRestore={handleRestoreBackup} onClearAllLogs={handleClearAllLogs} />
      <ConfirmDialog
        isOpen={!!markPrompt}
        title={markDialog.title}
        message={markDialog.message}
        confirmLabel={markDialog.confirm}
        isDestructive={false}
        onCancel={() => setMarkPrompt(null)}
        onConfirm={confirmMarkPrompt}
      >
        {markPrompt?.type === 'mark' && markPrompt.items[0].action === 'received' && (
          markPrompt.items[0].kind === 'bill' ? (
            <label className="block text-xs font-medium text-slate-700">
              Which month is this bill for?
              <div className="mt-1.5"><MonthSelect value={markMonth} onChange={setMarkMonth} title="Month the bill was received for" /></div>
            </label>
          ) : (
            <label className="block text-xs font-medium text-slate-700">
              Date the form was received
              <input type="date" value={markDate} max={todayStr()} onChange={(e) => setMarkDate(e.target.value)}
                className="mt-1.5 block h-8 px-2.5 text-xs border border-slate-200 rounded-lg bg-white" />
            </label>
          )
        )}
      </ConfirmDialog>
      <AdminPanel isOpen={isAdminPanelOpen} onClose={() => setIsAdminPanelOpen(false)} currentUser={user} onToast={showToast} onImportLocal={handleImportLocal} approvalsPanel={approvalsPanel}
        onBinChanged={() => { refreshLogs(); refreshResellers(); refreshActivity(); }} />
      <ChangePasswordModal isOpen={isPasswordModalOpen} onClose={() => setIsPasswordModalOpen(false)} onSave={handleChangePassword} />
    </div>
  );
}
