import { LogEntry } from '../types';

const BANGLA = /[ঀ-৿]/;

export const isBangla = (s?: string) => BANGLA.test(s || '');

/** Puts a single name into the right-language field. */
export function splitName(name?: string): { nameBn: string; nameEn: string } {
  const n = (name || '').trim();
  if (!n) return { nameBn: '', nameEn: '' };
  return isBangla(n) ? { nameBn: n, nameEn: '' } : { nameBn: '', nameEn: n };
}

/**
 * The name shown everywhere in the logs: Bangla when it exists, otherwise whatever was
 * entered before. The English name is only stored (for later use) and never shown in the logs.
 */
export function displayName(l: Pick<LogEntry, 'customerName'> & Partial<LogEntry>): string {
  return (l.nameBn || '').trim() || (l.customerName || '').trim();
}

/** The value kept in customerName so every list, search and report shows the Bangla name first. */
export function primaryName(nameBn?: string, nameEn?: string, fallback?: string): string {
  return (nameBn || '').trim() || (nameEn || '').trim() || (fallback || '').trim();
}
