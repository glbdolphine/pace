import React from 'react';
import { CalendarDays } from 'lucide-react';
import { monthLabel, monthOptions } from '../utils/months';

interface Props {
  value: string;
  onChange: (month: string) => void;
  /** How many items each month has (shown beside the month). */
  counts?: Map<string, number>;
  /** Adds an "All months" choice (value ''). */
  allowAll?: boolean;
  title?: string;
  className?: string;
}

/** Receiving-month picker: every month that has data, this month and the five before it. */
export const MonthSelect: React.FC<Props> = ({ value, onChange, counts, allowAll, title, className = '' }) => {
  const months = monthOptions([...(counts?.keys() ?? []), ...(value ? [value] : [])]);
  return (
    <label title={title} className={`inline-flex items-center gap-1.5 h-8 pl-2.5 pr-1 text-xs border border-slate-200 rounded-full bg-white text-slate-600 ${className}`}>
      <CalendarDays className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-7 bg-transparent font-semibold text-slate-800 focus:outline-none cursor-pointer max-w-[11rem]">
        {allowAll && <option value="">All months</option>}
        {months.map((m) => {
          const n = counts?.get(m);
          return <option key={m} value={m}>{monthLabel(m)}{n ? ` · ${n}` : ''}</option>;
        })}
      </select>
    </label>
  );
};
