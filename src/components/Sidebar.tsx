import React from 'react';
import {
  LayoutDashboard,
  Table,
  Users,
  Layers,
  FileSpreadsheet,
  Settings,
  History,
  Database,
  KeyRound,
  SlidersHorizontal,
  X,
  FileCheck2,
  Receipt,
  ClipboardCheck,
} from 'lucide-react';
import { BRAND_NAME } from '../brand';

interface SidebarProps {
  visible: boolean;
  isDesktop: boolean;
  onClose: () => void;
  currentView: 'home' | 'sheet' | 'form' | 'maker' | 'resellers' | 'directory' | 'bills' | 'forms';
  onNavigate: (view: 'home' | 'sheet' | 'form' | 'maker' | 'resellers' | 'directory' | 'bills' | 'forms') => void;
  logsCount: number;
  userName: string;
  userRole: string;
  onOpenBackup: () => void;
  onOpenActivity: () => void;
  onChangePassword: () => void;
  onOpenSuggestions?: () => void;
  onOpenAdmin?: () => void;
  /** Form / bill requests waiting for the admin. */
  pendingCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  visible,
  isDesktop,
  onClose,
  currentView,
  onNavigate,
  logsCount,
  userName,
  userRole,
  onOpenBackup,
  onOpenActivity,
  onChangePassword,
  onOpenSuggestions,
  onOpenAdmin,
  pendingCount = 0,
}) => {
  if (!visible) return null;

  const navItems = [
    { id: 'home', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'sheet', label: 'Logs Record', icon: Table, count: logsCount },
    { id: 'forms', label: 'Forms', icon: ClipboardCheck },
    { id: 'bills', label: 'Bills', icon: Receipt },
    { id: 'maker', label: 'Form Maker', icon: FileSpreadsheet },
    { id: 'directory', label: 'Reseller Directory', icon: Users },
    { id: 'resellers', label: 'Reseller Supply', icon: Layers },
  ] as const;

  const content = (
    <aside className="w-64 bg-white border-r border-brand-100 flex flex-col h-full shadow-xs">
      {/* Mobile Header */}
      {!isDesktop && (
        <div className="p-4 flex items-center justify-between border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand-800 text-white font-bold flex items-center justify-center text-xs">
              P
            </div>
            <span className="font-bold text-slate-800 text-sm">{BRAND_NAME}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main navigation */}
      <div className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Workspace
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                onNavigate(item.id);
                if (!isDesktop) onClose();
              }}
              className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-xl transition-colors ${
                isActive
                  ? 'bg-brand-50 text-brand-900 font-semibold'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon
                  className={`w-4 h-4 ${
                    isActive ? 'text-brand-700' : 'text-slate-400'
                  }`}
                />
                <span>{item.label}</span>
              </div>
              {'count' in item && item.count !== undefined && (
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-medium ${
                    isActive ? 'bg-brand-200 text-brand-900' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {item.count}
                </span>
              )}
            </button>
          );
        })}

        <div className="pt-6 px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Management & Tools
        </div>

        {onOpenAdmin && (
          <button
            onClick={() => {
              onOpenAdmin();
              if (!isDesktop) onClose();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-purple-700 hover:bg-purple-50 rounded-xl transition-colors"
          >
            <Settings className="w-4 h-4 text-purple-600" />
            <span className="flex-1 text-left">Admin Control Panel</span>
            {pendingCount > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold bg-amber-100 text-amber-800" title="Requests waiting for approval">{pendingCount}</span>
            )}
          </button>
        )}

        {onOpenSuggestions && (
          <button
            onClick={() => {
              onOpenSuggestions();
              if (!isDesktop) onClose();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 rounded-xl transition-colors"
          >
            <SlidersHorizontal className="w-4 h-4 text-slate-400" />
            <span>Saved Suggestions</span>
          </button>
        )}

        <button
          onClick={() => {
            onOpenActivity();
            if (!isDesktop) onClose();
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 rounded-xl transition-colors"
        >
          <History className="w-4 h-4 text-slate-400" />
          <span>Activity Audit Log</span>
        </button>

        <button
          onClick={() => {
            onOpenBackup();
            if (!isDesktop) onClose();
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 rounded-xl transition-colors"
        >
          <Database className="w-4 h-4 text-slate-400" />
          <span>Database & Backup</span>
        </button>
      </div>

      {/* User profile & Password in footer */}
      <div className="p-3 border-t border-slate-100 bg-slate-50/50">
        <div className="flex items-center justify-between mb-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-800 truncate">{userName}</p>
            <p className="text-[10px] text-slate-500 capitalize">{userRole} Account</p>
          </div>
          <button
            onClick={onChangePassword}
            title="Change Password"
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white rounded-lg transition-colors border border-transparent hover:border-slate-200"
          >
            <KeyRound className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );

  if (isDesktop) {
    // Stays in place while the page scrolls (sits just under the 3.5rem top bar).
    return <div className="shrink-0 sticky top-14 self-start h-[calc(100vh-3.5rem)]">{content}</div>;
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={onClose} />
      <div className="relative z-10">{content}</div>
    </div>
  );
};
