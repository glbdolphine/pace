import React, { useState, useMemo } from 'react';
import { Plus, Edit2, Trash2, Phone, MapPin, Check, X, Search, Layers, UserPlus } from 'lucide-react';
import { Reseller, LogEntry } from '../types';
import { UPAZILAS, upazilaKey, upazilaBn } from '../utils/upazilas';

const selectCls = 'w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-brand-600';

const UpazilaSelect: React.FC<{ value: string; onChange: (v: string) => void; className?: string }> = ({ value, onChange, className }) => (
  <select value={upazilaKey(value)} onChange={(e) => onChange(e.target.value)} className={className || selectCls}>
    <option value="">Select upazila…</option>
    {UPAZILAS.map((u) => (
      <option key={u.key} value={u.key}>{u.key} · {u.bn}</option>
    ))}
  </select>
);

interface ResellerDirectoryProps {
  resellers: Reseller[];
  logs: LogEntry[];
  onCreate: (input: { name: string; area: string; phone: string }) => Promise<void>;
  onUpdate: (id: string, input: { name: string; area: string; phone: string; active: boolean }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export const ResellerDirectory: React.FC<ResellerDirectoryProps> = ({
  resellers,
  logs,
  onCreate,
  onUpdate,
  onDelete,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [upazilaFilter, setUpazilaFilter] = useState('');
  const [sortBy, setSortBy] = useState<'upazila' | 'name' | 'logs'>('upazila');
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newArea, setNewArea] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editArea, setEditArea] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editActive, setEditActive] = useState(true);

  const stats = useMemo(() => {
    const map = new Map<string, number>();
    for (const log of logs) {
      if (log.resellerName) {
        map.set(log.resellerName, (map.get(log.resellerName) || 0) + 1);
      }
    }
    return map;
  }, [logs]);

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    const list = resellers.filter((r) => {
      if (upazilaFilter && upazilaKey(r.area) !== upazilaFilter) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.area.toLowerCase().includes(q) ||
        upazilaBn(upazilaKey(r.area)).includes(q) ||
        r.phone.toLowerCase().includes(q)
      );
    });
    const upaOrder = (r: Reseller) => {
      const i = UPAZILAS.findIndex((u) => u.key === upazilaKey(r.area));
      return i === -1 ? 99 : i;
    };
    return [...list].sort((a, b) => {
      if (sortBy === 'logs') return (stats.get(b.name) || 0) - (stats.get(a.name) || 0) || a.name.localeCompare(b.name);
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      return upaOrder(a) - upaOrder(b) || a.name.localeCompare(b.name);
    });
  }, [resellers, searchTerm, upazilaFilter, sortBy, stats]);

  const countByUpazila = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of resellers) {
      const k = upazilaKey(r.area);
      if (k) m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
  }, [resellers]);

  const handleStartCreate = () => {
    setNewName('');
    setNewArea('');
    setNewPhone('');
    setIsCreating(true);
  };

  const handleSaveCreate = async () => {
    if (!newName.trim() || !newArea) return;
    try {
      await onCreate({ name: newName.trim(), area: newArea, phone: newPhone.trim() });
      setIsCreating(false);
    } catch (e: any) {
      alert(e?.message || 'Could not add reseller.');
    }
  };

  const handleStartEdit = (r: Reseller) => {
    setEditingId(r.id);
    setEditName(r.name);
    setEditArea(upazilaKey(r.area));
    setEditPhone(r.phone || '');
    setEditActive(r.active);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim() || !editArea) return;
    try {
      await onUpdate(editingId, {
        name: editName.trim(),
        area: editArea,
        phone: editPhone.trim(),
        active: editActive,
      });
      setEditingId(null);
    } catch (e: any) {
      alert(e?.message || 'Could not update reseller.');
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="bg-white p-4 rounded-2xl border border-brand-100 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div>
          <h1 className="text-base font-bold text-slate-900">Reseller Directory</h1>
          <p className="text-xs text-slate-500">
            Manage partner resellers, contact numbers, coverage areas, and assigned requests.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search resellers..."
              className="pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-brand-600 focus:bg-white w-48 sm:w-64"
            />
          </div>

          <button
            onClick={handleStartCreate}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-brand-800 hover:bg-brand-900 rounded-xl shadow-xs transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Add Reseller
          </button>
        </div>
      </div>

      {/* Upazila filter chips + sort */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
          <button
            type="button"
            onClick={() => setUpazilaFilter('')}
            className={`px-2.5 py-1 text-[11px] rounded-full border ${!upazilaFilter ? 'bg-brand-800 text-white border-brand-800' : 'bg-white text-slate-600 border-brand-100 hover:bg-brand-50'}`}
          >
            All ({resellers.length})
          </button>
          {UPAZILAS.filter((u) => countByUpazila.get(u.key)).map((u) => (
            <button
              key={u.key}
              type="button"
              onClick={() => setUpazilaFilter(upazilaFilter === u.key ? '' : u.key)}
              className={`px-2.5 py-1 text-[11px] rounded-full border ${upazilaFilter === u.key ? 'bg-brand-800 text-white border-brand-800' : 'bg-white text-slate-600 border-brand-100 hover:bg-brand-50'}`}
            >
              {u.key} ({countByUpazila.get(u.key)})
            </button>
          ))}
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'upazila' | 'name' | 'logs')}
          className="px-3 py-1.5 text-xs bg-white border border-brand-100 rounded-full focus:outline-none focus:border-brand-600"
        >
          <option value="upazila">Sort: Upazila</option>
          <option value="name">Sort: Name</option>
          <option value="logs">Sort: Most logs</option>
        </select>
      </div>

      {/* Creation Modal/Card */}
      {isCreating && (
        <div className="bg-brand-50/70 border border-brand-200 p-4 rounded-2xl space-y-3">
          <div className="text-xs font-bold text-brand-900">Add New Partner Reseller</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">
                Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Shabul"
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-brand-600"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">
                Upazila <span className="text-rose-500">*</span>
              </label>
              <UpazilaSelect value={newArea} onChange={setNewArea} />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">Official Phone</label>
              <input
                type="tel"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="e.g. +880 1711-234567"
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-brand-600"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setIsCreating(false)}
              className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveCreate}
              disabled={!newName.trim() || !newArea}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-brand-800 hover:bg-brand-900 rounded-lg disabled:opacity-50"
            >
              Save Reseller
            </button>
          </div>
        </div>
      )}

      {/* Reseller Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((r) => {
          const isEditing = editingId === r.id;
          const logCount = stats.get(r.name) || 0;

          if (isEditing) {
            return (
              <div key={r.id} className="bg-white p-4 rounded-2xl border border-brand-300 shadow-sm space-y-2.5">
                <div className="text-xs font-bold text-slate-900">Edit Reseller</div>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-2.5 py-1 text-xs border border-slate-300 rounded-md"
                  placeholder="Name"
                />
                <UpazilaSelect value={editArea} onChange={setEditArea} className="w-full px-2.5 py-1 text-xs border border-slate-300 rounded-md bg-white" />
                <input
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full px-2.5 py-1 text-xs border border-slate-300 rounded-md"
                  placeholder="Phone"
                />
                <label className="flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={editActive}
                    onChange={(e) => setEditActive(e.target.checked)}
                    className="rounded text-brand-600"
                  />
                  Active
                </label>
                <div className="flex justify-end gap-1.5 pt-2">
                  <button
                    onClick={() => setEditingId(null)}
                    className="px-2.5 py-1 text-xs text-slate-600 bg-slate-100 rounded-md"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    className="px-2.5 py-1 text-xs font-medium text-white bg-brand-800 rounded-md"
                  >
                    Save
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div
              key={r.id}
              className="bg-white p-4 rounded-2xl border border-brand-100 hover:border-brand-300 transition-all shadow-xs flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-slate-900 text-sm">{r.name}</h3>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                      r.active
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-100 text-slate-500 border-slate-200'
                    }`}
                  >
                    {r.active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <div className="mt-2.5 space-y-1.5 text-xs text-slate-600">
                  {r.area && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{upazilaKey(r.area) ? `${upazilaKey(r.area)} · ${upazilaBn(upazilaKey(r.area))}` : r.area}</span>
                    </div>
                  )}
                  {r.phone && (
                    <div className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <a href={`tel:${r.phone}`} className="hover:text-brand-700">
                        {r.phone}
                      </a>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500 font-mono">
                  {logCount} {logCount === 1 ? 'log' : 'logs'}
                </span>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleStartEdit(r)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-lg"
                    title="Edit reseller"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onDelete(r.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                    title="Move to admin bin"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 bg-white rounded-2xl border border-brand-100 text-slate-400 text-xs">
          No resellers found.
        </div>
      )}
    </div>
  );
};
