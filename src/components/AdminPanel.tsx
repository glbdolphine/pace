import React, { useEffect, useState } from 'react';
import { X, UserPlus, Shield, KeyRound, UserX, UserCheck, Upload, Copy, Eye, EyeOff, RefreshCw, Trash2, RotateCcw, Sparkles } from 'lucide-react';
import { AppUser, AdminUserSummary, LogEntry, Reseller } from '../types';
import { changePassword } from '../utils/auth';
import { getAccessToken } from '../utils/cloud';
import {
  createUserAccount, disableUserAccount, listUsers, listCredentials, resetUserPassword,
  loadBin, restoreBinLog, restoreBinReseller, purgeBinLog, purgeBinReseller, emptyBin,
} from '../utils/cloud';
import { ConfirmDialog } from './ConfirmDialog';
import { formatStamp } from '../utils/activity';

// Easy to read out loud: no 0/O or 1/l/I.
const makePassword = () => {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const buf = new Uint32Array(10);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => chars[n % chars.length]).join('');
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AppUser;
  onToast: (message: string) => void;
  onImportLocal: () => void;
  /** Called after a restore/purge so the main app reloads logs and resellers. */
  onBinChanged: () => void;
  /** The waiting-for-confirmation list with the approve-all button. */
  approvalsPanel?: React.ReactNode;
}

export const AdminPanel: React.FC<Props> = ({ isOpen, onClose, currentUser, onToast, onImportLocal, onBinChanged, approvalsPanel }) => {
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showPasswords, setShowPasswords] = useState(true);
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPwd, setResetPwd] = useState('');
  const [bin, setBin] = useState<{ logs: LogEntry[]; resellers: Reseller[] }>({ logs: [], resellers: [] });
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [purge, setPurge] = useState<{ kind: 'log' | 'reseller'; id: string; label: string } | null>(null);

  const load = async () => {
    try {
      const [list, creds] = await Promise.all([listUsers(), listCredentials().catch(() => ({} as Record<string, string>))]);
      setUsers(list.map((u: AdminUserSummary) => ({ ...u, password: creds[u.id] })));
    } catch (e: any) { setError(e?.message || 'Could not load users.'); }
  };
  const loadTheBin = async () => {
    try { setBin(await loadBin()); } catch (e: any) { setError(e?.message || 'Could not load the bin.'); }
  };
  useEffect(() => {
    if (isOpen && currentUser.role === 'admin') { load(); loadTheBin(); }
  }, [isOpen, currentUser.role]);

  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); onToast(`${what} copied`); }
    catch { onToast('Could not copy. Select the text and copy it manually.'); }
  };

  const doReset = async (u: AdminUserSummary) => {
    if (resetPwd.length < 8) return setError('New password must be at least 8 characters.');
    setBusy(true); setError('');
    try {
      await resetUserPassword(u.id, resetPwd);
      setResetId(null); setResetPwd('');
      await load();
      onToast(`Password reset for ${u.username}`);
    } catch (e: any) { setError(e?.message || 'Could not reset password.'); }
    finally { setBusy(false); }
  };

  const binAct = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true); setError('');
    try { await fn(); await loadTheBin(); onBinChanged(); onToast(msg); }
    catch (e: any) { setError(e?.message || 'Bin action failed.'); }
    finally { setBusy(false); }
  };

  if (!isOpen || currentUser.role !== 'admin') return null;

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError('New user password must be at least 8 characters.');
    setBusy(true); setError('');
    try {
      const token = await getAccessToken();
      await createUserAccount(token, username, password, displayName || username);
      setUsername(''); setDisplayName(''); setPassword('');
      await load();
      onToast('User account created');
    } catch (e: any) { setError(e?.message || 'Could not create user.'); }
    finally { setBusy(false); }
  };

  const toggle = async (u: AdminUserSummary) => {
    setBusy(true); setError('');
    try {
      const token = await getAccessToken();
      await disableUserAccount(token, u.id, !u.disabled);
      await load();
      onToast(u.disabled ? `${u.username} enabled` : `${u.username} disabled`);
    } catch (e: any) { setError(e?.message || 'Could not update account.'); }
    finally { setBusy(false); }
  };

  const changeAdminPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPassword.length < 8) return setError('Admin password must be at least 8 characters.');
    if (adminPassword !== confirm) return setError('Passwords do not match.');
    setBusy(true); setError('');
    try {
      await changePassword(adminPassword);
      setAdminPassword(''); setConfirm('');
      onToast('Admin password changed');
    } catch (e: any) { setError(e?.message || 'Could not change admin password.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="no-print fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-4xl rounded-xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <div className="flex items-center gap-2"><Shield className="w-4 h-4 text-brand-800" /><h2 className="font-semibold text-slate-900">Administrator</h2></div>
            <p className="text-xs text-slate-500 mt-1">Hidden admin panel · press Esc then T to open</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-500 hover:text-slate-900 rounded"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 overflow-y-auto space-y-6">
          {error && <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded p-2.5">{error}</div>}

          {approvalsPanel}

          <section>
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Create colleague account</h3>
            <form onSubmit={create} className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <input value={username} onChange={e=>setUsername(e.target.value)} required placeholder="Username / ID" className="h-10 px-3 text-xs border rounded" />
              <input value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Display name" className="h-10 px-3 text-xs border rounded" />
              <div className="flex gap-1">
                <input value={password} onChange={e=>setPassword(e.target.value)} required minLength={8} placeholder="Initial password" className="h-10 px-3 text-xs border rounded w-full font-mono" />
                <button type="button" onClick={() => setPassword(makePassword())} title="Generate a password" className="h-10 px-2.5 border rounded hover:bg-slate-50"><Sparkles className="w-3.5 h-3.5" /></button>
              </div>
              <button disabled={busy} className="h-10 inline-flex items-center justify-center gap-1.5 bg-brand-800 text-white rounded text-xs font-medium disabled:opacity-60"><UserPlus className="w-3.5 h-3.5" />Create ID</button>
            </form>
            <p className="text-[11px] text-slate-400 mt-2">The colleague logs in with this username and password. You can always see it again in the Accounts list below, until they change it themselves.</p>
          </section>

          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-900">Accounts</h3>
              <button type="button" onClick={() => setShowPasswords(v => !v)} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 border rounded hover:bg-slate-50">
                {showPasswords ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}{showPasswords ? 'Hide passwords' : 'Show passwords'}
              </button>
            </div>
            <div className="border border-slate-200 rounded-lg overflow-x-auto">
              <div className="min-w-[640px]">
                <div className="grid grid-cols-[1fr_1fr_1.2fr_70px_150px] gap-2 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-500"><span>User</span><span>Username</span><span>Password</span><span>Status</span><span></span></div>
                {users.map(u => (
                  <div key={u.id} className="border-t border-slate-100 text-xs">
                    <div className="grid grid-cols-[1fr_1fr_1.2fr_70px_150px] gap-2 items-center px-3 py-2.5">
                      <span className="font-medium text-slate-800 truncate">{u.displayName}</span>
                      <span className="font-mono text-slate-600 truncate">{u.username}</span>
                      <span className="font-mono min-w-0">
                        {u.id === currentUser.id ? <span className="text-slate-400">your own</span>
                          : u.password ? (
                            <span className="inline-flex items-center gap-1.5 max-w-full">
                              <span className="truncate text-slate-800">{showPasswords ? u.password : '••••••••'}</span>
                              <button type="button" title="Copy username + password" onClick={() => copy(`Username: ${u.username}\nPassword: ${u.password}`, 'Login details')} className="text-slate-400 hover:text-slate-800"><Copy className="w-3 h-3" /></button>
                            </span>
                          ) : <span className="text-slate-400 font-sans italic" title="Changed by the user, or created before password records existed">not recorded</span>}
                      </span>
                      <span className={u.disabled ? 'text-rose-600' : 'text-emerald-600'}>{u.disabled ? 'Disabled' : 'Active'}</span>
                      <span className="justify-self-end flex gap-1">
                        <button disabled={busy || u.id === currentUser.id} onClick={() => { setResetId(resetId === u.id ? null : u.id); setResetPwd(''); }} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 border rounded hover:bg-slate-50 disabled:opacity-40"><KeyRound className="w-3 h-3" />Reset</button>
                        <button disabled={busy || u.id === currentUser.id} onClick={() => toggle(u)} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 border rounded hover:bg-slate-50 disabled:opacity-40">
                          {u.disabled ? <UserCheck className="w-3 h-3" /> : <UserX className="w-3 h-3" />}{u.disabled ? 'Enable' : 'Disable'}
                        </button>
                      </span>
                    </div>
                    {resetId === u.id && (
                      <div className="px-3 pb-3 flex flex-wrap items-center gap-2 bg-slate-50/60">
                        <input value={resetPwd} onChange={e => setResetPwd(e.target.value)} placeholder="New password (8+ characters)" className="h-9 px-3 text-xs border rounded font-mono w-56" />
                        <button type="button" onClick={() => setResetPwd(makePassword())} className="h-9 px-2.5 border rounded hover:bg-white inline-flex items-center gap-1 text-[11px]"><Sparkles className="w-3 h-3" />Generate</button>
                        <button type="button" disabled={busy} onClick={() => doReset(u)} className="h-9 px-3 bg-slate-900 text-white rounded text-xs disabled:opacity-50">Set password</button>
                        <button type="button" onClick={() => setResetId(null)} className="h-9 px-3 text-xs text-slate-600">Cancel</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">Passwords are kept so you can look them up. If a colleague changes their own password, the record is removed (shown as "not recorded") and you can Reset it to a new one.</p>
          </section>

          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-900">Bin <span className="font-mono text-slate-400">({bin.logs.length + bin.resellers.length})</span></h3>
              <div className="flex gap-2">
                <button type="button" onClick={loadTheBin} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 border rounded hover:bg-slate-50"><RefreshCw className="w-3 h-3" />Refresh</button>
                <button type="button" disabled={busy || bin.logs.length + bin.resellers.length === 0} onClick={() => setConfirmEmpty(true)} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 border border-rose-200 text-rose-700 rounded hover:bg-rose-50 disabled:opacity-40"><Trash2 className="w-3 h-3" />Empty bin</button>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 mb-2">Anything staff delete lands here. It stays until you restore it or delete it forever.</p>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              {bin.logs.length + bin.resellers.length === 0 && <p className="px-3 py-6 text-xs text-slate-400 text-center">The bin is empty.</p>}
              {bin.logs.map(l => (
                <div key={l.id} className="px-3 py-2.5 border-t first:border-t-0 border-slate-100 text-xs flex items-center gap-3">
                  <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-semibold text-slate-600">LOG</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-800 truncate">#{l.logNo} · {l.customerName || 'Untitled'}</div>
                    <div className="text-[11px] text-slate-500 truncate">{[l.resellerName, l.nmsId, `deleted by ${l.deletedBy || 'unknown'}`, l.deletedAt ? formatStamp(l.deletedAt) : ''].filter(Boolean).join(' · ')}</div>
                  </div>
                  <button disabled={busy} onClick={() => binAct(() => restoreBinLog(l.id), `Log #${l.logNo} restored`)} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 border rounded hover:bg-slate-50"><RotateCcw className="w-3 h-3" />Restore</button>
                  <button disabled={busy} onClick={() => setPurge({ kind: 'log', id: l.id, label: `Log #${l.logNo}` })} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 border border-rose-200 text-rose-700 rounded hover:bg-rose-50"><Trash2 className="w-3 h-3" />Delete forever</button>
                </div>
              ))}
              {bin.resellers.map(r => (
                <div key={r.id} className="px-3 py-2.5 border-t border-slate-100 text-xs flex items-center gap-3">
                  <span className="px-1.5 py-0.5 rounded bg-violet-100 text-[10px] font-semibold text-violet-700">RESELLER</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-800 truncate">{r.name}</div>
                    <div className="text-[11px] text-slate-500 truncate">{[r.area, r.phone, `deleted by ${r.deletedBy || 'unknown'}`, r.deletedAt ? formatStamp(r.deletedAt) : ''].filter(Boolean).join(' · ')}</div>
                  </div>
                  <button disabled={busy} onClick={() => binAct(() => restoreBinReseller(r.id), `${r.name} restored`)} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 border rounded hover:bg-slate-50"><RotateCcw className="w-3 h-3" />Restore</button>
                  <button disabled={busy} onClick={() => setPurge({ kind: 'reseller', id: r.id, label: r.name })} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 border border-rose-200 text-rose-700 rounded hover:bg-rose-50"><Trash2 className="w-3 h-3" />Delete forever</button>
                </div>
              ))}
            </div>
          </section>

          <section className="grid md:grid-cols-2 gap-4">
            <form onSubmit={changeAdminPassword} className="border border-slate-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5"><KeyRound className="w-3.5 h-3.5" />Change admin password</h3>
              <p className="text-[11px] text-slate-500 mt-1 mb-3">The initial administrator password is <b>admin</b>. Change it before using this in production.</p>
              <input value={adminPassword} onChange={e=>setAdminPassword(e.target.value)} type="password" minLength={8} required placeholder="New admin password" className="w-full h-9 px-3 text-xs border rounded mb-2" />
              <input value={confirm} onChange={e=>setConfirm(e.target.value)} type="password" minLength={8} required placeholder="Repeat new password" className="w-full h-9 px-3 text-xs border rounded mb-2" />
              <button disabled={busy} className="w-full h-9 bg-slate-900 text-white rounded text-xs">Change admin password</button>
            </form>

            <div className="border border-amber-200 bg-amber-50 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5"><Upload className="w-3.5 h-3.5" />One-time local migration</h3>
              <p className="text-[11px] text-slate-600 mt-1 mb-3">Imports old logs from this browser into the shared database. Use this from the computer that contains the existing data.</p>
              <button onClick={onImportLocal} className="w-full h-9 border border-amber-300 bg-white text-amber-900 rounded text-xs">Import this browser's old logs</button>
            </div>
          </section>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmEmpty}
        title="Empty the bin?"
        message="Everything in the bin is deleted forever. This cannot be undone."
        confirmLabel="Delete forever"
        onCancel={() => setConfirmEmpty(false)}
        onConfirm={() => { setConfirmEmpty(false); binAct(() => emptyBin(), 'Bin emptied'); }}
      />
      <ConfirmDialog
        isOpen={!!purge}
        title={`Delete ${purge?.label || ''} forever?`}
        message="This cannot be undone."
        confirmLabel="Delete forever"
        onCancel={() => setPurge(null)}
        onConfirm={() => {
          const p = purge; setPurge(null);
          if (p) binAct(() => (p.kind === 'log' ? purgeBinLog(p.id) : purgeBinReseller(p.id)), `${p.label} deleted forever`);
        }}
      />
    </div>
  );
};
