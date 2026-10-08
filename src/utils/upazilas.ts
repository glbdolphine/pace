import type { LogEntry, Reseller } from '../types';

// The 13 upazilas of Sylhet district (the company's coverage area).
// `key` is what gets stored in the database (Reseller.area).
export interface Upazila {
  key: string;
  bn: string;
  /** Other spellings that should map to this upazila. */
  aliases: string[];
}

export const UPAZILAS: Upazila[] = [
  { key: 'Balaganj', bn: 'বালাগঞ্জ', aliases: ['balagonj', 'balaganj', 'balaganj sadar'] },
  { key: 'Beanibazar', bn: 'বিয়ানীবাজার', aliases: ['beanibazar', 'beani bazar', 'beanibazaar', 'biyanibazar'] },
  { key: 'Bishwanath', bn: 'বিশ্বনাথ', aliases: ['bishwanath', 'biswanath', 'bishwonath', 'biswonath'] },
  { key: 'Companiganj', bn: 'কোম্পানীগঞ্জ', aliases: ['companiganj', 'company ganj', 'companigonj'] },
  { key: 'Dakshin Surma', bn: 'দক্ষিণ সুরমা', aliases: ['dakshin surma', 'south surma', 'dokkhin surma', 'daksin surma', 'd surma', 'd.surma', 'dokkinsurma', 'moglabazar'] },
  { key: 'Fenchuganj', bn: 'ফেঞ্চুগঞ্জ', aliases: ['fenchuganj', 'fenchugonj', 'fencuganj'] },
  { key: 'Golapganj', bn: 'গোলাপগঞ্জ', aliases: ['golapganj', 'golapgonj', 'golapgonj', 'golapganj sadar', 'golabgonj', 'golabganj'] },
  { key: 'Gowainghat', bn: 'গোয়াইনঘাট', aliases: ['gowainghat', 'goainghat', 'gowain ghat'] },
  { key: 'Jaintiapur', bn: 'জৈন্তাপুর', aliases: ['jaintiapur', 'jointiapur', 'jaintapur', 'jointa'] },
  { key: 'Kanaighat', bn: 'কানাইঘাট', aliases: ['kanaighat', 'kanaighat sadar', 'kanai ghat'] },
  { key: 'Osmani Nagar', bn: 'ওসমানী নগর', aliases: ['osmani nagar', 'osmaninagar', 'usmani nagar', 'osmanpur', 'tajpur'] },
  { key: 'Sylhet Sadar', bn: 'সিলেট সদর', aliases: ['sylhet sadar', 'sylhet sodor', 'sylhet sador', 'sadar', 'sylhet', 'সিলেট', 'shah paran', 'airport', 'jalalabad', 'kotwali'] },
  { key: 'Zakiganj', bn: 'জকিগঞ্জ', aliases: ['zakiganj', 'jakiganj', 'zakigonj', 'jakigonj', 'jokigonj', 'jokiganj'] },
];

const norm = (s: string) =>
  s.toLowerCase().replace(/[.,()\-]/g, ' ').replace(/\s+/g, ' ').trim();

/** Map any spelling (English or Bangla) to the canonical upazila key, or '' if unknown. */
export function upazilaKey(text?: string): string {
  if (!text) return '';
  const t = norm(text);
  if (!t) return '';
  for (const u of UPAZILAS) {
    if (norm(u.key) === t || u.bn === text.trim() || u.aliases.some((a) => norm(a) === t)) return u.key;
  }
  // Bangla text that contains an upazila name, e.g. "সিলেট সদর"
  for (const u of UPAZILAS) {
    if (text.includes(u.bn)) return u.key;
  }
  return '';
}

export function upazilaBn(key: string): string {
  return UPAZILAS.find((u) => u.key === key)?.bn || '';
}

/**
 * Split old-style names such as "Shabul- Balaganj" into { name: 'Shabul', area: 'Balaganj' }.
 * Returns null when the text after the dash is not one of the 13 upazilas.
 */
export function splitLegacyName(full: string): { name: string; area: string } | null {
  const m = full.match(/^(.+?)\s*[-–]\s*(.+)$/);
  if (!m) return null;
  const area = upazilaKey(m[2]);
  return area ? { name: m[1].trim(), area } : null;
}

/** The upazila a log belongs to: its reseller's upazila, else the institute's upazila from the form. */
export function logUpazila(log: LogEntry, resellers: Reseller[]): string {
  const r =
    (log.resellerId && resellers.find((x) => x.id === log.resellerId)) ||
    resellers.find((x) => x.name.trim().toLowerCase() === (log.resellerName || '').trim().toLowerCase());
  return upazilaKey(r?.area) || upazilaKey(log.upazila) || upazilaKey(log.resellerName.split(/[-–]/).pop());
}

/** Text stored in a log's reseller name. Adds the upazila only if two resellers share a name. */
export function resellerLogName(r: Reseller, all: Reseller[]): string {
  const clash = all.some((x) => x.id !== r.id && !x.deletedAt && x.name.trim().toLowerCase() === r.name.trim().toLowerCase());
  return clash && r.area ? `${r.name} (${r.area})` : r.name;
}

/**
 * Parses an EDC Area code (e.g. "36.EDC-Sylhet-Sadar-Liton", "28.EDC-Jokigonj-Sultan")
 * and extracts the matched reseller and upazila from database resellers.
 */
export function parseResellerAndUpazilaFromArea(
  areaText: string,
  thanaText: string = '',
  resellers: Reseller[] = []
): { reseller: Reseller | null; resellerName: string; upazila: string; resellerPhone: string } {
  const cleanArea = (areaText || '').trim();
  const cleanThana = (thanaText || '').trim();

  // Primary thana/upazila from the Thana column
  let detectedUpazila = upazilaKey(cleanThana);

  // Extract reseller candidate name and possible upazila from Area string
  // Examples: "36.EDC-Sylhet-Sadar-Liton" -> upazila: "Sylhet-Sadar", reseller: "Liton"
  // "04.EDC-D.Surma-Shahel" -> upazila: "D.Surma", reseller: "Shahel"
  // "42.EDC-Beanibazar-Sohag-Ahmed" -> upazila: "Beanibazar", reseller: "Sohag-Ahmed"
  // "27.EDC-Jokigonj-Monir/Shunasar" -> upazila: "Jokigonj", reseller: "Monir/Shunasar"
  let candidateReseller = '';
  let areaUpazilaCandidate = '';

  const edcMatch = cleanArea.match(/^\d+\.EDC-(.+)$/i);
  if (edcMatch) {
    const rest = edcMatch[1]; // e.g. "Sylhet-Sadar-Liton", "D.Surma-Shahel", "Beanibazar-Sohag-Ahmed"
    
    // Test known upazilas as prefix
    for (const u of UPAZILAS) {
      const uAliases = [u.key, ...u.aliases];
      for (const alias of uAliases) {
        const regexStr = '^' + alias.replace(/[.\-]/g, '[.\\-]').replace(/\s+/g, '[\\s.\\-]') + '-(.+)$';
        const match = rest.match(new RegExp(regexStr, 'i'));
        if (match) {
          areaUpazilaCandidate = u.key;
          candidateReseller = match[1].trim();
          break;
        }
      }
      if (candidateReseller) break;
    }

    if (!candidateReseller) {
      // Fallback: take the last segment after the last dash
      const parts = rest.split('-');
      candidateReseller = parts.pop()?.trim() || '';
      areaUpazilaCandidate = upazilaKey(parts.join(' '));
    }
  } else if (cleanArea) {
    candidateReseller = cleanArea;
  }

  // Prioritize areaUpazilaCandidate if thana was empty, or use thana
  if (!detectedUpazila && areaUpazilaCandidate) {
    detectedUpazila = areaUpazilaCandidate;
  }

  // Now match against resellers in the database
  let matchedReseller: Reseller | null = null;
  const candLower = candidateReseller.toLowerCase();

  if (candLower && resellers.length > 0) {
    // 1. Exact name match
    matchedReseller = resellers.find((r) => !r.deletedAt && r.name.trim().toLowerCase() === candLower) || null;

    // 2. Substring / slash match (e.g. "Monir" matching "Monir/Shunasar" or vice versa)
    if (!matchedReseller) {
      matchedReseller = resellers.find((r) => {
        if (r.deletedAt) return false;
        const rName = r.name.trim().toLowerCase();
        return (
          candLower.includes(rName) ||
          rName.includes(candLower) ||
          candLower.split(/[/_-]/).some((part) => part && rName === part) ||
          rName.split(/[/_-]/).some((part) => part && candLower === part)
        );
      }) || null;
    }

    // 3. Match by name within the same upazila
    if (!matchedReseller && detectedUpazila) {
      matchedReseller = resellers.find(
        (r) => !r.deletedAt && upazilaKey(r.area) === detectedUpazila && (candLower.includes(r.name.toLowerCase()) || r.name.toLowerCase().includes(candLower))
      ) || null;
    }
  }

  // If reseller was matched and has an area, that confirms or supplies upazila
  if (matchedReseller && matchedReseller.area) {
    detectedUpazila = upazilaKey(matchedReseller.area) || detectedUpazila;
  }

  const finalResellerName = matchedReseller ? matchedReseller.name : candidateReseller || cleanArea;
  const finalPhone = matchedReseller?.phone || '';

  return {
    reseller: matchedReseller,
    resellerName: finalResellerName,
    upazila: detectedUpazila || areaUpazilaCandidate,
    resellerPhone: finalPhone,
  };
}

