import { LogEntry, Reseller } from '../types';

export function matchReseller(
  query: { resellerId?: string; resellerName?: string },
  resellers: Reseller[]
): Reseller | null {
  if (query.resellerId) {
    const found = resellers.find((r) => r.id === query.resellerId);
    if (found) return found;
  }
  if (query.resellerName) {
    const norm = query.resellerName.trim().toLowerCase();
    const found = resellers.find((r) => r.name.trim().toLowerCase() === norm);
    if (found) return found;
  }
  return null;
}

export function phoneForLog(log: LogEntry, resellers: Reseller[]): string {
  if (log.resellerPhone && log.resellerPhone.trim()) return log.resellerPhone.trim();
  const matched = matchReseller({ resellerId: log.resellerId, resellerName: log.resellerName }, resellers);
  return matched?.phone || '';
}
