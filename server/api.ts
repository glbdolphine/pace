import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { extractUpacPdf, ExtractedForm } from './pdfExtractor';
import { getEdcIndex, edcIndexSource } from './edcIndex';
import { db, AppUser } from './db';
import { fillEdcDocx, sanitizeFilename, normalizeMac } from './docxFiller';

const router = Router();

// Ensure SQLite database is initialized before serving requests
router.use(async (_req, _res, next) => {
  await db.ready();
  next();
});

// EDC lookups read data/toscrape.xlsx (falls back to data/index.json); see server/edcIndex.ts
function getIndex(): Record<string, any[]> {
  return getEdcIndex();
}

function normalizeKey(value: any): string {
  if (value === null || value === undefined) return '';
  let s = String(value).trim();
  if (/^-?\d+\.0$/.test(s)) {
    s = s.slice(0, -2);
  }
  return s;
}

// Authentication Middleware
export interface AuthenticatedRequest extends Request {
  user?: AppUser;
  token?: string;
}

function extractToken(req: Request): string {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }
  return '';
}

function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }
  const user = db.getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
  }
  req.user = user;
  req.token = token;
  next();
}

function adminMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Administrator access required.' });
  }
  next();
}

// ---------------------------------------------------------------------------
// Realtime SSE
// ---------------------------------------------------------------------------
router.get('/events', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const onChange = (data: any) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  db.on('change', onChange);

  const heartbeat = setInterval(() => {
    res.write(': ping\n\n');
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    db.off('change', onChange);
  });
});

// ---------------------------------------------------------------------------
// Rate Limiter for Authentication
// ---------------------------------------------------------------------------
interface RateLimitRecord {
  attempts: number;
  lockedUntil: number;
  lastAttempt: number;
}

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes lockout
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes sliding window

const loginAttempts = new Map<string, RateLimitRecord>();

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

function checkRateLimit(key: string): { locked: boolean; retryAfterSeconds: number; attempts: number } {
  const now = Date.now();
  const record = loginAttempts.get(key);
  if (!record) {
    return { locked: false, retryAfterSeconds: 0, attempts: 0 };
  }

  if (record.lockedUntil > now) {
    const retryAfterSeconds = Math.ceil((record.lockedUntil - now) / 1000);
    return { locked: true, retryAfterSeconds, attempts: record.attempts };
  }

  if (now - record.lastAttempt > ATTEMPT_WINDOW_MS) {
    loginAttempts.delete(key);
    return { locked: false, retryAfterSeconds: 0, attempts: 0 };
  }

  return { locked: false, retryAfterSeconds: 0, attempts: record.attempts };
}

function recordFailedLogin(key: string): { locked: boolean; retryAfterSeconds: number; attemptsRemaining: number } {
  const now = Date.now();
  const record = loginAttempts.get(key) || { attempts: 0, lockedUntil: 0, lastAttempt: now };
  record.attempts += 1;
  record.lastAttempt = now;

  if (record.attempts >= MAX_LOGIN_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_DURATION_MS;
    loginAttempts.set(key, record);
    const retryAfterSeconds = Math.ceil(LOCKOUT_DURATION_MS / 1000);
    return { locked: true, retryAfterSeconds, attemptsRemaining: 0 };
  }

  loginAttempts.set(key, record);
  return { locked: false, retryAfterSeconds: 0, attemptsRemaining: MAX_LOGIN_ATTEMPTS - record.attempts };
}

function recordSuccessfulLogin(key: string): void {
  loginAttempts.delete(key);
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------
router.post('/auth/login', (req: Request, res: Response) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const norm = String(username).trim().toLowerCase().replace(/\s+/g, '_');
    const ip = getClientIp(req);
    const rateLimitKey = `login:${ip}:${norm}`;

    // Check rate limit
    const limitStatus = checkRateLimit(rateLimitKey);
    if (limitStatus.locked) {
      res.setHeader('Retry-After', limitStatus.retryAfterSeconds);
      const minutes = Math.ceil(limitStatus.retryAfterSeconds / 60);
      return res.status(429).json({
        error: `Too many failed login attempts. Temporarily locked for security. Please try again in ${minutes} minute${minutes > 1 ? 's' : ''}.`,
        retryAfter: limitStatus.retryAfterSeconds,
      });
    }

    const user = db.getUserByUsername(norm);
    if (!user || user.password !== password) {
      const failStatus = recordFailedLogin(rateLimitKey);
      if (failStatus.locked) {
        res.setHeader('Retry-After', failStatus.retryAfterSeconds);
        const minutes = Math.ceil(failStatus.retryAfterSeconds / 60);
        return res.status(429).json({
          error: `Too many failed login attempts. Account temporarily locked for ${minutes} minute${minutes > 1 ? 's' : ''}.`,
          retryAfter: failStatus.retryAfterSeconds,
        });
      }
      return res.status(401).json({
        error: `Invalid username or password. ${failStatus.attemptsRemaining} attempt${failStatus.attemptsRemaining === 1 ? '' : 's'} remaining.`,
        attemptsRemaining: failStatus.attemptsRemaining,
      });
    }

    if (user.disabled) {
      return res.status(403).json({ error: 'This account has been disabled. Contact an administrator.' });
    }

    // Success: clear rate limit counter
    recordSuccessfulLogin(rateLimitKey);

    const token = db.createSession(user.id);
    const profile: AppUser = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    };

    return res.json({ token, user: profile });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Login failed.' });
  }
});

router.get('/auth/me', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  return res.json({ user: req.user });
});

router.post('/auth/logout', (req: AuthenticatedRequest, res: Response) => {
  const token = extractToken(req);
  if (token) db.destroySession(token);
  return res.json({ ok: true });
});

router.post('/auth/change-password', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { password } = req.body || {};
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    db.setUserPassword(req.user!.id, password);
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

router.post('/auth/note-password-changed', authMiddleware, (_req: Request, res: Response) => {
  return res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// User Management (Admin only)
// ---------------------------------------------------------------------------
router.get('/users', authMiddleware, adminMiddleware, (_req: Request, res: Response) => {
  return res.json(db.listUsers());
});

router.post('/users', authMiddleware, adminMiddleware, (req: Request, res: Response) => {
  try {
    const { username, password, displayName } = req.body || {};
    const created = db.createUser(username, password, displayName);
    return res.json(created);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

router.post('/users/:id/disable', authMiddleware, adminMiddleware, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { disabled } = req.body;
    db.setUserDisabled(id, Boolean(disabled));
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

router.get('/admin/credentials', authMiddleware, adminMiddleware, (_req: Request, res: Response) => {
  return res.json(db.listCredentials());
});

router.post('/admin/users/:id/reset-password', authMiddleware, adminMiddleware, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    db.setUserPassword(id, password);
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Logs CRUD
// ---------------------------------------------------------------------------
// The log list is serialised and compressed once per database change and then served to every
// client from memory. Browsers revalidate with an ETag and get a tiny "304 Not Modified" when
// nothing changed, so reloads stay cheap even with thousands of records.
const bootId = Math.random().toString(36).slice(2, 8);
let logsCache: { rev: number; json: Buffer; gzip: Buffer } | null = null;

router.get('/logs', authMiddleware, (req: Request, res: Response) => {
  const rev = db.revision;
  if (!logsCache || logsCache.rev !== rev) {
    const json = Buffer.from(JSON.stringify(db.getLogs()));
    logsCache = { rev, json, gzip: zlib.gzipSync(json, { level: 5 }) };
  }
  const etag = `"logs-${bootId}-${rev}"`;
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Vary', 'Accept-Encoding');
  if (req.headers['if-none-match'] === etag) return res.status(304).end();

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (/\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))) {
    res.setHeader('Content-Encoding', 'gzip');
    return res.end(logsCache.gzip);
  }
  return res.end(logsCache.json);
});

router.post('/logs', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { entry, existingId } = req.body || {};
    if (!entry) return res.status(400).json({ error: 'Log entry data is required.' });
    const saved = db.saveLog(entry, req.user!, existingId);
    return res.json(saved);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Silent autosave: partial update of one log, flushed to disk immediately.
router.patch('/logs/:id', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const fields = req.body && typeof req.body === 'object' ? req.body.fields : null;
    if (!fields || typeof fields !== 'object') return res.status(400).json({ error: 'Fields to update are required.' });
    const saved = db.patchLog(req.params.id, fields, req.user!);
    if (!saved) return res.status(404).json({ error: 'Log not found.' });
    return res.json(saved);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Fill one field on many logs at once, e.g. MAC addresses pasted next to their NMS IDs.
router.post('/logs/bulk-fill', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { field, items } = req.body || {};
    if (typeof field !== 'string' || !field) return res.status(400).json({ error: 'A field is required.' });
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Nothing to fill.' });
    if (items.length > 5000) return res.status(400).json({ error: 'Too many rows at once (limit 5000).' });
    const result = db.bulkFillField(field, items, req.user!);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

router.post('/logs/batch', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { entries } = req.body || {};
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'Array of entries is required.' });
    }
    const saved = db.saveBatchLogs(entries, req.user!);
    return res.json({ saved, count: saved.length });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// UPAC PDF scanner (rule-based, reads the PDF text layer)
// ---------------------------------------------------------------------------
router.post('/pdf/scan', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const files: { name?: string; data?: string }[] = Array.isArray(req.body.files) ? req.body.files : [];
    if (files.length === 0) {
      return res.status(400).json({ error: 'No PDF files provided.' });
    }

    const results: ExtractedForm[] = [];
    const errors: { fileName: string; error: string }[] = [];

    for (const item of files) {
      const fileName = item.name || 'document.pdf';
      const base64 = String(item.data || '').replace(/^data:[^;]*;base64,/, '');
      if (!base64) {
        errors.push({ fileName, error: 'Empty file.' });
        continue;
      }
      try {
        results.push(await extractUpacPdf(Buffer.from(base64, 'base64'), fileName));
      } catch (err: any) {
        errors.push({ fileName, error: err?.message || 'Could not read this PDF.' });
      }
    }

    return res.json({ results, errors });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'PDF scan failed.' });
  }
});

router.delete('/logs/:id', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const success = db.softDeleteLog(id, req.user!);
    return res.json({ ok: success });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Form / bill received marks and admin approvals
// ---------------------------------------------------------------------------
router.get('/approvals', authMiddleware, (_req: Request, res: Response) => {
  return res.json(db.listApprovals());
});

router.post('/approvals/request', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ error: 'Nothing to mark.' });
    return res.json(db.requestMarks(items, req.user!));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/approvals/decide', authMiddleware, adminMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { ids, all, approve } = req.body || {};
    return res.json(db.decideApprovals({ ids: Array.isArray(ids) ? ids.map(String) : [], all: Boolean(all), approve: approve !== false }, req.user!));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete('/approvals/:id', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  return res.json({ ok: db.withdrawApproval(req.params.id, req.user!) });
});

router.post('/logs/clear-all', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const count = db.softDeleteAllLogs(req.user!);
    return res.json({ cleared: count });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/logs/restore', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { logs, merge } = req.body || {};
    if (!Array.isArray(logs)) return res.status(400).json({ error: 'Logs array is required.' });
    const count = db.restoreLogs(logs, Boolean(merge), req.user!);
    return res.json({ total: count });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Resellers CRUD
// ---------------------------------------------------------------------------
router.get('/resellers', authMiddleware, (_req: Request, res: Response) => {
  return res.json(db.getResellers());
});

router.post('/resellers', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const created = db.createReseller(req.body, req.user!);
    return res.json(created);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

router.put('/resellers/:id', authMiddleware, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updated = db.updateReseller(id, req.body);
    return res.json(updated);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

router.delete('/resellers/:id', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const success = db.softDeleteReseller(id, req.user!);
    return res.json({ ok: success });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Admin Bin
// ---------------------------------------------------------------------------
router.get('/bin', authMiddleware, adminMiddleware, (_req: Request, res: Response) => {
  return res.json(db.getBin());
});

router.post('/bin/logs/:id/restore', authMiddleware, adminMiddleware, (req: Request, res: Response) => {
  const ok = db.restoreBinLog(req.params.id);
  return res.json({ ok });
});

router.post('/bin/resellers/:id/restore', authMiddleware, adminMiddleware, (req: Request, res: Response) => {
  const ok = db.restoreBinReseller(req.params.id);
  return res.json({ ok });
});

router.delete('/bin/logs/:id', authMiddleware, adminMiddleware, (req: Request, res: Response) => {
  const ok = db.purgeBinLog(req.params.id);
  return res.json({ ok });
});

router.delete('/bin/resellers/:id', authMiddleware, adminMiddleware, (req: Request, res: Response) => {
  const ok = db.purgeBinReseller(req.params.id);
  return res.json({ ok });
});

router.delete('/bin', authMiddleware, adminMiddleware, (_req: Request, res: Response) => {
  const count = db.emptyBin();
  return res.json({ purged: count });
});

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------
router.get('/suggestions', authMiddleware, (_req: Request, res: Response) => {
  return res.json(db.getSuggestions());
});

router.post('/suggestions', authMiddleware, (req: Request, res: Response) => {
  try {
    db.saveSuggestions(req.body);
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------
router.get('/activity', authMiddleware, (_req: Request, res: Response) => {
  return res.json(db.getActivity());
});

router.post('/activity', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { action, logNo, customer, detail } = req.body || {};
    db.addActivity({
      by: req.user!.displayName,
      action: action || 'edited',
      logNo,
      customer,
      detail,
    });
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Form Maker: Meta, Lookup, and Generate
// ---------------------------------------------------------------------------
const FORM_FIELDS = [
  { key: 'name', label: 'প্রতিষ্ঠানের নাম (Institute Name)', default: '' },
  { key: 'mobile', label: 'মোবাইল নাম্বার (Mobile)', default: '' },
  { key: 'union', label: 'ইউনিয়নের নাম (Union)', default: '' },
  { key: 'upazila', label: 'উপজেলা/থানা (Upazila)', default: '' },
  { key: 'source_no', label: 'EDC Book No. / সুত্র নং', default: '' },
  { key: 'connection_nms', label: 'সংযোগ/NMS আইডি', default: '' },
  { key: 'institution_code', label: 'প্রতিষ্টানের কোড (EMIS/EIIN/OTHERS)', default: '' },
  { key: 'lat_long', label: 'Lat & Long', default: '' },
  { key: 'router_serial', label: 'রাউটার সিরিয়াল নাম্বার', default: '' },
  { key: 'router_mac', label: 'MAC address', default: '' },
  { key: 'cable_brand', label: 'Optical Fiber Cable Brand', default: 'BRB' },
  { key: 'cable_qty', label: 'Optical Fiber Cable Qty (meters)', default: '1500' },
];

router.get('/meta', (_req: Request, res: Response) => {
  return res.json({ fields: FORM_FIELDS });
});

router.get('/lookup', authMiddleware, (req: Request, res: Response) => {
  const edcRaw = req.query.edc as string | undefined;
  const key = normalizeKey(edcRaw);
  if (!key) return res.json({ matches: [] });

  const index = getIndex();
  const matches = index[key] || [];
  return res.json({ matches, source: edcIndexSource(), total: Object.keys(index).length });
});

router.post('/generate', authMiddleware, (req: Request, res: Response) => {
  try {
    const { data, date } = req.body || {};
    if (!date) return res.status(400).json({ error: 'Valid date is required.' });

    const normalizedData: Record<string, string> = {};
    for (const field of FORM_FIELDS) {
      const val = data && data[field.key] !== undefined ? String(data[field.key]).trim() : '';
      normalizedData[field.key] = val || field.default;
    }

    if (normalizedData.router_mac) {
      normalizedData.router_mac = normalizeMac(normalizedData.router_mac);
    }

    const docBuffer = fillEdcDocx(normalizedData, date);
    const baseName = sanitizeFilename(normalizedData.connection_nms || normalizedData.source_no || normalizedData.name || 'form');
    const filename = `${baseName}.docx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Filename', encodeURIComponent(filename));
    res.setHeader('X-Mac', normalizedData.router_mac || '');
    return res.send(docBuffer);
  } catch (err: any) {
    console.error('Docx generation error:', err);
    return res.status(500).json({ error: err.message || 'Failed to generate form.' });
  }
});

export default router;
