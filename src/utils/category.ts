// Automatic category detection from the institute name (shared by client and server).

export const CATEGORY_LABELS = [
  'Primary Education',
  'Secondary Education',
  'National University',
  'Madrasa Education',
  'Health Service',
  'Land Reform Board',
  'Govt. Organization',
] as const;

// Order matters: the first rule that matches wins. Education institutes are checked first so
// that e.g. "Union High School" is Secondary, not Land Reform (because of "Union").
// Keywords are compared with all whitespace removed, so spacing variants still match.
const RULES: { label: string; keywords: string[] }[] = [
  {
    label: 'National University',
    keywords: [
      'বিশ্ববিদ্যালয়', 'বিশ্ববিদ্যালয', 'ইউনিভার্সিটি', 'university',
      // Degree colleges are affiliated with the National University (a plain "College" stays Secondary)
      'degreecollege', 'degreecollage', 'digreecollege', 'digreecollage', 'digricollege', 'digricollage', 'degricollege', 'degricollage', 'ডিগ্রিকলেজ', 'ডিগ্রীকলেজ', 'ডিগ্রীকলেজ',
    ],
  },
  { label: 'Madrasa Education', keywords: ['মাদ্রাসা', 'মাদরাসা', 'madrasa', 'madrasah', 'madrassa'] },
  { label: 'Primary Education', keywords: ['primar', 'প্রাথমিক'] },
  {
    label: 'Secondary Education',
    keywords: [
      'secondary', 'highschool', 'উচ্চবিদ্যালয়', 'উচ্চবিদ্যালয', 'colleg', 'collage', 'কলেজ',
      'academy', 'একাডেমি', 'একাডেমী',
      'international', 'ইন্টারনেশনাল', 'ইন্টারন্যাশনাল', 'internation', 'আন্তর্জাতিক', 'আন্তর্জাতিক',
    ],
  },
  { label: 'Health Service', keywords: ['ক্লিনিক', 'clinic', 'সেবা', 'health', 'স্বাস্থ'] },
  {
    label: 'Govt. Organization',
    keywords: ['ictcenter', 'govtcenter', 'governmentcenter', 'govt.center', 'উন্নয়নঅফিস', 'আইসিটিঅফিস'],
  },
  { label: 'Land Reform Board', keywords: ['ভূমি', 'ভুমি', 'ইউনিয়ন', 'union'] },
];

function normalize(s: string): string {
  return s
    .normalize('NFC') // য় typed as one char or as য + ় becomes identical
    .replace(/[\u200C\u200D]/g, '')
    .toLowerCase()
    .replace(/\u09C2/g, '\u09C1') // ূ -> ু so ভূমি / ভুমি are the same
    .replace(/\s+/g, '');
}

const NORMALIZED_RULES = RULES.map((r) => ({ label: r.label, keywords: r.keywords.map(normalize) }));

/** Strips leading numbering such as "01." from a category label. */
export function stripCategoryNumber(cat?: string): string {
  if (!cat) return '';
  const trimmed = cat.trim();
  return trimmed.replace(/^\d+[\s.-]+/, '').trim() || trimmed;
}

/** Detects the category from institute name text. Returns '' when nothing matches. */
export function detectCategoryFromName(...names: (string | undefined)[]): string {
  const text = normalize(names.filter(Boolean).join(' '));
  if (!text) return '';
  for (const rule of NORMALIZED_RULES) {
    if (rule.keywords.some((k) => text.includes(k))) return rule.label;
  }
  return '';
}

/** Category to show for a log: the saved (possibly hand-fixed) one, else detected from the name. */
export function displayCategory(log: {
  nameBn?: string;
  nameEn?: string;
  customerName?: string;
  category?: string;
}): string {
  return stripCategoryNumber(log.category) || detectCategoryFromName(log.nameBn, log.nameEn, log.customerName);
}

/**
 * The category for a log: detected from the institute name when possible,
 * otherwise the existing category with its numbering removed.
 */
export function resolveCategory(log: {
  nameBn?: string;
  nameEn?: string;
  customerName?: string;
  category?: string;
}): string {
  return detectCategoryFromName(log.nameBn, log.nameEn, log.customerName) || stripCategoryNumber(log.category);
}
