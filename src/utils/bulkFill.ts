import { LogEntry } from '../types';
import { upazilaKey } from './upazilas';
import { normalizeId } from './markIds';

/**
 * "Fill a field from a list": paste NMS IDs (one per line), pick a field, paste the values
 * (one per line, same order) and every matched log gets its value.
 */

export type FillKey =
  | 'mac' | 'routerSerial' | 'edcNo' | 'lat' | 'long' | 'fiberLength'
  | 'unionName' | 'upazila' | 'headTeacherName' | 'headTeacherPhone'
  | 'nameBn' | 'nameEn' | 'remarks';

type Cleaned = { value: string } | { error: string };

export interface FillFieldDef {
  key: FillKey;
  label: string;
  /** Example lines shown as the placeholder of the values box. */
  example: string;
  /** Short help shown under the field picker. */
  hint: string;
  clean: (raw: string) => Cleaned;
}

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
const bnToEn = (s: string) => s.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));
const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();
const hasBangla = (s: string) => /[ঀ-৿]/.test(s);

export function cleanMac(raw: string): Cleaned {
  // 12 hex digits, with ':' '-' '.' or spaces between them (or none at all)
  const hex = raw.trim().replace(/[\s:.\-]/g, '');
  if (!/^[0-9A-Fa-f]{12}$/.test(hex)) return { error: 'Not a valid MAC (needs 12 hex digits)' };
  return { value: hex.toUpperCase().match(/.{2}/g)!.join(':') };
}

const coordinate = (limit: number, name: string) => (raw: string): Cleaned => {
  const t = bnToEn(raw).trim();
  if (!/^-?\d+(\.\d+)?$/.test(t)) return { error: `${name} must be a plain number` };
  if (Math.abs(Number(t)) > limit) return { error: `${name} must be between -${limit} and ${limit}` };
  return { value: t };
};

export const FILL_FIELDS: FillFieldDef[] = [
  {
    key: 'mac', label: 'MAC address',
    example: '20:23:51:77:DA:CD\n20-23-51-77-C2-35',
    hint: 'Any separator works (: - . or none). Saved as 20:23:51:77:DA:CD.',
    clean: cleanMac,
  },
  {
    key: 'routerSerial', label: 'Router serial',
    example: '22640VJ005240\n22640VJ005241',
    hint: 'Saved in capitals.',
    clean: (raw) => { const v = tidy(raw).toUpperCase(); return v ? { value: v } : { error: 'Empty' }; },
  },
  {
    key: 'edcNo', label: 'EDC book no.',
    example: '930\n929',
    hint: 'Bangla digits are converted.',
    clean: (raw) => { const v = bnToEn(tidy(raw)).replace(/\.0$/, ''); return v ? { value: v } : { error: 'Empty' }; },
  },
  {
    key: 'lat', label: 'Latitude',
    example: '24.8785\n24.7176',
    hint: 'One number per line.',
    clean: coordinate(90, 'Latitude'),
  },
  {
    key: 'long', label: 'Longitude',
    example: '91.8841\n92.3551',
    hint: 'One number per line.',
    clean: coordinate(180, 'Longitude'),
  },
  {
    key: 'fiberLength', label: 'Fiber length (m)',
    example: '200\n250',
    hint: 'A number of metres. A trailing "m" is dropped.',
    clean: (raw) => {
      const t = bnToEn(raw).trim().replace(/\s*(m|meters?|metres?|মিটার)\.?$/i, '').trim();
      return /^\d+(\.\d+)?$/.test(t) ? { value: t } : { error: 'Fiber length must be a number' };
    },
  },
  {
    key: 'unionName', label: 'Union / address',
    example: 'মানিকপুর\nদেওয়ান বাজার',
    hint: 'Saved exactly as pasted.',
    clean: (raw) => { const v = tidy(raw); return v ? { value: v } : { error: 'Empty' }; },
  },
  {
    key: 'upazila', label: 'Upazila',
    example: 'Golapganj\nSylhet Sadar',
    hint: 'English or Bangla spelling; saved as the standard English name.',
    clean: (raw) => { const k = upazilaKey(tidy(raw)); return k ? { value: k } : { error: 'Unknown upazila' }; },
  },
  {
    key: 'headTeacherName', label: 'Head teacher name',
    example: 'সাজেদা আক্তার নার্গিস\nসিদ্দার্থ শংকর দে',
    hint: 'Saved exactly as pasted.',
    clean: (raw) => { const v = tidy(raw); return v ? { value: v } : { error: 'Empty' }; },
  },
  {
    key: 'headTeacherPhone', label: 'Head teacher phone',
    example: '01778342594\n01818084167',
    hint: 'Saved as 11 digits. A lost leading 0 or a +88 prefix is fixed.',
    clean: (raw) => {
      let d = bnToEn(raw).replace(/[^\d+]/g, '');
      d = d.replace(/^\+?880/, '0').replace(/^\+/, '');
      if (/^1\d{9}$/.test(d)) d = '0' + d; // Excel dropped the leading zero
      return /^01\d{9}$/.test(d) ? { value: d } : { error: 'Not an 11-digit mobile number' };
    },
  },
  {
    key: 'nameBn', label: 'Institute name (Bangla)',
    example: 'সরকারি প্রাথমিক বিদ্যালয়',
    hint: 'Also becomes the name shown in the logs.',
    clean: (raw) => {
      const v = tidy(raw);
      if (!v) return { error: 'Empty' };
      return hasBangla(v) ? { value: v } : { error: 'Not Bangla text' };
    },
  },
  {
    key: 'nameEn', label: 'Institute name (English)',
    example: 'Government Primary School',
    hint: 'Kept for reference; the logs show the Bangla name.',
    clean: (raw) => {
      const v = tidy(raw);
      if (!v) return { error: 'Empty' };
      return hasBangla(v) ? { error: 'Contains Bangla text' } : { value: v };
    },
  },
  {
    key: 'remarks', label: 'Remarks',
    example: 'Router replaced\nCable checked',
    hint: 'Saved exactly as pasted.',
    clean: (raw) => { const v = tidy(raw); return v ? { value: v } : { error: 'Empty' }; },
  },
];

export const fillFieldOf = (key: FillKey) => FILL_FIELDS.find((f) => f.key === key)!;

/** NMS IDs: one per line (spaces / commas / tabs also separate them). Blank lines are ignored. */
export const parseIds = (text: string): string[] =>
  text.split(/[\s,;|]+/).map((t) => t.trim()).filter(Boolean);

/** Values: strictly one per line, so values with spaces stay whole. Blank lines are ignored. */
export const parseValues = (text: string): string[] =>
  text.split(/\r?\n/).map((t) => t.trim()).filter(Boolean);

export type RowState =
  | 'change'          // will be written
  | 'same'            // log already has exactly this value
  | 'has_value'       // log has a different value and "overwrite" is off
  | 'not_found'       // no log with this NMS ID
  | 'ambiguous'       // more than one log has this NMS ID
  | 'invalid'         // the pasted value is not valid for this field
  | 'repeated'        // this NMS ID is already in the list above
  | 'no_value';       // more IDs than values

export interface PlanRow {
  n: number;          // 1-based position in the list
  nmsId: string;
  raw: string | null; // the pasted value for this position
  value: string;      // the cleaned value ('' when not valid)
  log?: LogEntry;
  current: string;
  state: RowState;
  note?: string;      // why a row is skipped
  warn?: string;      // a row that will still be written, but deserves a look
}

export interface FillPlan {
  rows: PlanRow[];
  idCount: number;
  valueCount: number;
  /** Values that have no NMS ID in front of them (more values than IDs). */
  extraValues: string[];
  changes: PlanRow[];
  counts: Record<RowState, number>;
  warnings: number;
}

const uniqueKey = (field: FillKey, v: string) =>
  field === 'mac' ? v.replace(/[^0-9a-f]/gi, '').toLowerCase() : v.trim().toLowerCase();

export function buildFillPlan(
  idsText: string,
  valuesText: string,
  field: FillKey,
  logs: LogEntry[],
  overwrite: boolean,
): FillPlan {
  const def = fillFieldOf(field);
  const ids = parseIds(idsText);
  const values = parseValues(valuesText);

  // NMS ID -> every active log carrying it. Only the NMS ID is used: a log or EDC number that
  // looks like an NMS ID must never receive somebody else's data.
  const byNms = new Map<string, LogEntry[]>();
  for (const l of logs) {
    if (l.deletedAt || !l.nmsId?.trim()) continue;
    const k = normalizeId(l.nmsId);
    byNms.set(k, [...(byNms.get(k) || []), l]);
  }

  // For the "this MAC / serial is used somewhere else" warning
  const unique = field === 'mac' || field === 'routerSerial';
  const holders = new Map<string, LogEntry[]>();
  if (unique) {
    for (const l of logs) {
      if (l.deletedAt) continue;
      const v = String(l[field] ?? '');
      if (!v.trim()) continue;
      const k = uniqueKey(field, v);
      holders.set(k, [...(holders.get(k) || []), l]);
    }
  }

  const seen = new Set<string>();
  const rows: PlanRow[] = ids.map((nmsId, i) => {
    const raw = i < values.length ? values[i] : null;
    const row: PlanRow = { n: i + 1, nmsId, raw, value: '', current: '', state: 'change' };

    const key = normalizeId(nmsId);
    if (seen.has(key)) return { ...row, state: 'repeated', note: 'Already in the list above (first one is used)' };
    seen.add(key);

    const matches = byNms.get(key) || [];
    if (matches.length === 0) return { ...row, state: 'not_found', note: 'No log with this NMS ID' };
    if (matches.length > 1) {
      return { ...row, state: 'ambiguous', note: `${matches.length} logs share this NMS ID (#${matches.map((m) => m.logNo).join(', #')})` };
    }
    const log = matches[0];
    row.log = log;
    row.current = String(log[field] ?? '');

    if (raw === null) return { ...row, state: 'no_value', note: 'No value on this line' };
    const cleaned = def.clean(raw);
    if ('error' in cleaned) return { ...row, state: 'invalid', note: cleaned.error };
    row.value = cleaned.value;

    if (row.current === row.value) return { ...row, state: 'same', note: 'Already has this value' };
    if (row.current.trim() && !overwrite) return { ...row, state: 'has_value', note: 'Already has a different value' };
    return row;
  });

  // Warnings on rows that will be written
  if (unique) {
    const claimed = new Map<string, number>(); // value -> first plan position
    for (const r of rows) {
      if (r.state !== 'change') continue;
      const k = uniqueKey(field, r.value);
      const first = claimed.get(k);
      if (first !== undefined) { r.warn = `Same ${def.label} as line ${first} of your list`; continue; }
      claimed.set(k, r.n);
      const others = (holders.get(k) || []).filter((l) => l.id !== r.log!.id);
      // another log that is itself about to get a different value is not a clash
      const real = others.filter((l) => {
        const inPlan = rows.find((x) => x.log?.id === l.id && x.state === 'change');
        return !inPlan || uniqueKey(field, inPlan.value) === k;
      });
      if (real.length) r.warn = `Also on log #${real.map((l) => l.logNo).join(', #')}`;
    }
  }

  const counts: Record<RowState, number> = {
    change: 0, same: 0, has_value: 0, not_found: 0, ambiguous: 0, invalid: 0, repeated: 0, no_value: 0,
  };
  for (const r of rows) counts[r.state]++;

  return {
    rows,
    idCount: ids.length,
    valueCount: values.length,
    extraValues: values.slice(ids.length),
    changes: rows.filter((r) => r.state === 'change'),
    counts,
    warnings: rows.filter((r) => r.state === 'change' && r.warn).length,
  };
}
