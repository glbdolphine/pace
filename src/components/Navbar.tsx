import React from 'react';
import { Plus, Lock, Menu, PanelLeftClose } from 'lucide-react';
import { BRAND_SLOGAN } from '../brand';

interface NavbarProps {
  onGoHome: () => void;
  /** Opens/closes the sidebar (drawer on small screens, collapsible rail on large ones). */
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
  onNewLog: () => void;
  onLock?: () => void;
}

/**
 * Top bar: only what has to be reachable from every screen.
 * Everything else (pages, tools, account) lives in the sidebar and view toolbars.
 *
 *   [ menu ] [ Pace IT ]                              [ New Log ] [ lock ]
 */
export const Navbar: React.FC<NavbarProps> = ({ onGoHome, onToggleSidebar, sidebarOpen, onNewLog, onLock }) => {
  const iconBtn =
    'inline-flex items-center justify-center w-9 h-9 rounded-full text-slate-600 hover:text-brand-800 hover:bg-brand-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500';

  return (
    <header className="no-print sticky top-0 z-40 h-14 bg-white/90 backdrop-blur border-b border-brand-100 shadow-sm">
      <div className="h-full w-full px-3 sm:px-4 flex items-center justify-between gap-3">
        {/* Left: menu + brand */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onToggleSidebar}
            className={iconBtn}
            aria-label={sidebarOpen ? 'Hide menu' : 'Show menu'}
            aria-expanded={sidebarOpen}
            aria-controls="app-sidebar"
            title={sidebarOpen ? 'Hide menu' : 'Show menu'}
          >
            {sidebarOpen ? <PanelLeftClose className="w-[18px] h-[18px] hidden lg:block" /> : null}
            <Menu className={`w-[18px] h-[18px] ${sidebarOpen ? 'lg:hidden' : ''}`} />
          </button>

          <button
            type="button"
            onClick={onGoHome}
            className="flex flex-col items-start justify-center leading-none text-left min-w-0 h-9 rounded-lg px-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            aria-label="Pace IT home"
          >
            <span className="font-display text-lg sm:text-xl font-bold tracking-tight text-brand-700 leading-none">
              Pace <span className="text-brand-500">IT</span>
            </span>
            <span className="hidden sm:block font-display text-[9px] font-medium uppercase tracking-[0.22em] text-slate-500 mt-1 truncate">
              {BRAND_SLOGAN}
            </span>
          </button>
        </div>

        {/* Right: primary action + lock */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onNewLog}
            className="inline-flex items-center justify-center gap-1.5 h-9 px-3.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-full shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New<span className="hidden sm:inline"> Log</span></span>
          </button>
          {onLock && (
            <button type="button" onClick={onLock} className={iconBtn} title="Lock the app" aria-label="Lock">
              <Lock className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
