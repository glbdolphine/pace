import React, { useState } from 'react';
import { X, Plus, Trash2, Check, SlidersHorizontal } from 'lucide-react';
import { FieldSuggestionsMap } from '../types';

interface SuggestionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  suggestions: FieldSuggestionsMap;
  onUpdateSuggestions: (updated: FieldSuggestionsMap) => void;
}

export const SuggestionsModal: React.FC<SuggestionsModalProps> = ({
  isOpen,
  onClose,
  suggestions,
  onUpdateSuggestions,
}) => {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = useState<string>(
    Object.keys(suggestions)[0] || 'resellerName'
  );
  const [newVal, setNewVal] = useState('');
  const [localMap, setLocalMap] = useState<FieldSuggestionsMap>({ ...suggestions });

  const currentList = localMap[activeTab] || [];

  const handleAdd = () => {
    const trimmed = newVal.trim();
    if (!trimmed || currentList.includes(trimmed)) return;
    const nextList = [...currentList, trimmed];
    const nextMap = { ...localMap, [activeTab]: nextList };
    setLocalMap(nextMap);
    onUpdateSuggestions(nextMap);
    setNewVal('');
  };

  const handleRemove = (item: string) => {
    const nextList = currentList.filter((x) => x !== item);
    const nextMap = { ...localMap, [activeTab]: nextList };
    setLocalMap(nextMap);
    onUpdateSuggestions(nextMap);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-brand-700" />
            <h2 className="text-sm font-semibold text-slate-900">Manage Field Suggestions</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs for fields */}
        <div className="px-5 pt-3 border-b border-slate-100 flex gap-2 overflow-x-auto pb-2 scrollbar-none">
          {Object.keys(localMap).map((key) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                activeTab === key
                  ? 'bg-brand-800 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {key} ({localMap[key]?.length || 0})
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={newVal}
              onChange={(e) => setNewVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAdd();
                }
              }}
              placeholder={`Add new suggestion for ${activeTab}...`}
              className="flex-1 px-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-brand-600"
            />
            <button
              onClick={handleAdd}
              disabled={!newVal.trim()}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-brand-800 hover:bg-brand-900 rounded-lg transition-colors disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          </div>

          <div className="space-y-1.5">
            {currentList.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">No suggestions saved for this field.</p>
            ) : (
              currentList.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-100 rounded-lg text-xs text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <span className="truncate mr-2">{item}</span>
                  <button
                    onClick={() => handleRemove(item)}
                    className="p-1 text-slate-400 hover:text-rose-600 rounded"
                    title="Delete suggestion"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-white bg-brand-800 hover:bg-brand-900 rounded-lg"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
