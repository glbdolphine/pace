import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { upazilaKey, splitLegacyName } from '../src/utils/upazilas';
import { resolveCategory, displayCategory, stripCategoryNumber } from '../src/utils/category';
import initSqlJs, { Database, SqlValue } from 'sql.js';

export interface AppUser {
  id: string;
  username: string;
  displayName: string;
  role: 'admin' | 'user';
  disabled?: boolean;
  createdAt?: string;
}

export interface StoredUser extends AppUser {
  password: string;
}

export interface LogChange {
  at: string;
  by: string;
  action: 'created' | 'edited';
  changes?: { field: string; from: string; to: string }[];
}

export interface LogEntry {
  id: string;
  logNo: number | string;
  date: string;
  resellerName: string;
  requestType: string;
  customerName: string;
  nmsId: string;
  issueFound: string;
  missingWrongDetails: string;
  actionTaken: string;
  reasonForAction: string;
  resellerInformed: string;
  followUpNeeded: string;
  status: string;
  supervisorInformed: string;
  remarks: string;
  mac: string;
  edcNo?: string;
  routerSerial?: string;
  formReceivedAt?: string;
  billReceivedAt?: string;
  /** Months ('YYYY-MM') a bill was received for. */
  billMonths?: string[];
  resellerId?: string;
  followUpDate?: string;
  resellerPhone?: string;
  headTeacherName?: string;
  headTeacherPhone?: string;
  lat?: string;
  long?: string;
  unionName?: string;
  upazila?: string;
  fiberLength?: string;
  category?: string;
  nameBn?: string; // institute name in Bangla (shown in logs)
  nameEn?: string; // institute name in English (kept for reference only)
  deletedAt?: string;
  deletedBy?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
  history?: LogChange[];
}

export type MarkKind = 'form' | 'bill';
export type MarkAction = 'received' | 'not_received';

export interface ApprovalRequest {
  id: string;
  logId: string;
  logNo?: number | string;
  customer?: string;
  kind: MarkKind;
  action: MarkAction;
  requestedBy: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  decidedBy?: string;
  decidedAt?: string;
  /** Receiving month ('YYYY-MM') a bill mark is for. */
  month?: string;
  /** Date ('YYYY-MM-DD') a form was received. */
  receivedOn?: string;
}

export interface Reseller {
  id: string;
  name: string;
  area: string;
  phone: string;
  active: boolean;
  createdAt: string;
  deletedAt?: string;
  deletedBy?: string;
}

export interface ActivityEvent {
  id: string;
  at: string;
  by: string;
  action: 'created' | 'edited' | 'deleted' | 'cleared' | 'restored' | 'user_created' | 'user_disabled' | 'user_enabled' | 'purged' | 'password_reset';
  logNo?: number | string;
  customer?: string;
  detail?: string;
}

export type LogFieldKey =
  | 'resellerName'
  | 'resellerPhone'
  | 'requestType'
  | 'customerName'
  | 'nmsId'
  | 'issueFound'
  | 'missingWrongDetails'
  | 'actionTaken'
  | 'reasonForAction'
  | 'resellerInformed'
  | 'followUpNeeded'
  | 'status'
  | 'supervisorInformed'
  | 'remarks'
  | 'mac';

export type FieldSuggestionsMap = Record<LogFieldKey, string[]>;

export const INITIAL_SUGGESTIONS: FieldSuggestionsMap = {
  resellerName: ['Shabul- Balaganj', 'Rahman- Sylhet Sadar', 'Kabir- Beanibazar', 'Alam- Golapganj', 'Faruk- Biswanath'],
  resellerPhone: ['+880 1680-945894', '+880 1711-234567', '+880 1912-345678'],
  requestType: ['New User ID', 'Form Submission', 'Bandwidth Upgrade', 'Router Relocation', 'Profile Modification', 'MAC Binding Reset', 'IP Address Re-assignment'],
  customerName: ['Hasampur Govt. Primary School', 'Radhakona Govt. Primary School', 'Sreemangal Model High School', 'Balaganj Technical Institute'],
  nmsId: [],
  issueFound: ['Same router at two institute', 'MAC address collision in NMS', 'Incorrect package assigned', 'Port link down on OLT', 'VLAN mismatch at reseller switch'],
  missingWrongDetails: ['They previously used the same router in Radhakona Govt. Primary School', 'National ID card copy missing from form', 'Phone number mismatch on application form', 'Previous billing clearance pending'],
  actionTaken: ['Provided the id/form as requested but kept nms entry on hold', 'Created user ID in NMS and notified reseller via WhatsApp', 'Updated MAC binding in authentication server', 'Forwarded ticket to Core NOC team for IP remapping'],
  reasonForAction: ["I did not entry this school in nms because nms doesn't allow two school with same router.", 'Awaiting confirmation of router decommissioning from previous site.', 'Verified payment voucher with accounts before activating profile.'],
  resellerInformed: ['Yes - phone', 'Yes - WhatsApp', 'Yes - email', 'Yes - in-person', 'No - unanswered phone call', 'No - SMS sent'],
  followUpNeeded: ['Yes', 'No', 'Pending reseller callback', 'Pending supervisor review'],
  status: ['Pending - waiting for reseller', 'In Progress', 'Resolved', 'Escalated to Core Team', 'On Hold', 'Closed'],
  supervisorInformed: ['I informed my superiors', 'Approved by Team Lead', 'Informed Operations Manager', 'Escalated to Duty Manager', 'No approval needed (standard request)'],
  remarks: ['Reseller said Radhakona Govt. Primary School is not using the network or the router anymore. So they decided to use it for another school.', 'Reseller promised to submit the formal decommissioning request by tomorrow.', 'Client requested urgent activation before morning classes.'],
  mac: ['20:23:51:78:49:F4', '44:D9:E7:2B:1A:08', 'E4:5F:01:8C:3D:A2'],
};

const DB_DIR = path.resolve(process.cwd(), 'data');
const SQLITE_FILE = path.join(DB_DIR, 'pace_it.sqlite');
const SQLITE_BACKUP = path.join(DB_DIR, 'pace_it.sqlite.backup');
const JSON_LEGACY_FILE = path.join(DB_DIR, 'pace_it_db.json');
const SECRET_FILE = path.join(DB_DIR, 'pace_it_secret.key');

function getOrGenerateSecret(): string {
  if (fs.existsSync(SECRET_FILE)) {
    try {
      const s = fs.readFileSync(SECRET_FILE, 'utf-8').trim();
      if (s) return s;
    } catch {
      /* fallback */
    }
  }
  const newSecret = crypto.randomBytes(32).toString('hex');
  try {
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
    fs.writeFileSync(SECRET_FILE, newSecret, 'utf-8');
  } catch {
    /* non-fatal */
  }
  return newSecret;
}

class SQLiteDatabase extends EventEmitter {
  private sqlite!: Database;
  private secret: string = getOrGenerateSecret();
  private initialized = false;
  private initPromise: Promise<void>;

  constructor() {
    super();
    this.initPromise = this.init();
  }

  public async ready(): Promise<void> {
    return this.initPromise;
  }

  private async init() {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }

    const SQL = await initSqlJs();

    if (fs.existsSync(SQLITE_FILE)) {
      try {
        const fileBuffer = fs.readFileSync(SQLITE_FILE);
        this.sqlite = new SQL.Database(fileBuffer);
      } catch (err) {
        console.error('Failed to load SQLite file, attempting backup:', err);
        if (fs.existsSync(SQLITE_BACKUP)) {
          const backupBuffer = fs.readFileSync(SQLITE_BACKUP);
          this.sqlite = new SQL.Database(backupBuffer);
        } else {
          this.sqlite = new SQL.Database();
        }
      }
    } else {
      this.sqlite = new SQL.Database();
    }

    this.createTables();
    this.autoMigrateExistingLogs();
    this.migrateResellerUpazilas();
    this.seedAllResellers();
    this.saveToDisk();
    this.initialized = true;
  }

  private createTables() {
    this.sqlite.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        disabled INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS logs (
        id TEXT PRIMARY KEY,
        log_no INTEGER NOT NULL,
        date TEXT NOT NULL,
        reseller_name TEXT NOT NULL,
        caller_phone TEXT,
        request_type TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        nms_id TEXT,
        issue_found TEXT,
        missing_wrong_details TEXT,
        action_taken TEXT,
        reason_for_action TEXT,
        reseller_informed TEXT,
        follow_up_needed TEXT,
        status TEXT NOT NULL,
        supervisor_informed TEXT,
        remarks TEXT,
        mac TEXT,
        edc_no TEXT,
        router_serial TEXT,
        form_received_at TEXT,
        reseller_id TEXT,
        follow_up_date TEXT,
        reseller_phone TEXT,
        head_teacher_name TEXT,
        head_teacher_phone TEXT,
        lat TEXT,
        long TEXT,
        union_name TEXT,
        upazila TEXT,
        fiber_length TEXT,
        category TEXT,
        name_bn TEXT,
        name_en TEXT,
        bill_received_at TEXT,
        deleted_at TEXT,
        deleted_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        created_by TEXT,
        updated_by TEXT,
        history TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_logs_deleted ON logs(deleted_at);
      CREATE INDEX IF NOT EXISTS idx_logs_no ON logs(log_no);

      CREATE TABLE IF NOT EXISTS resellers (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        area TEXT,
        phone TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        deleted_at TEXT,
        deleted_by TEXT
      );

      CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY,
        log_id TEXT NOT NULL,
        log_no TEXT,
        customer TEXT,
        kind TEXT NOT NULL,
        action TEXT NOT NULL,
        requested_by TEXT NOT NULL,
        requested_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        decided_by TEXT,
        decided_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);

      CREATE TABLE IF NOT EXISTS suggestions (
        field TEXT PRIMARY KEY,
        values_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS activity (
        id TEXT PRIMARY KEY,
        at TEXT NOT NULL,
        by_user TEXT NOT NULL,
        action TEXT NOT NULL,
        log_no TEXT,
        customer TEXT,
        detail TEXT
      );
    `);

    // Migrate any missing columns in logs table
    try {
      const tableInfo = this.sqlite.exec("PRAGMA table_info(logs)");
      if (tableInfo.length > 0 && tableInfo[0].values) {
        const colNames = new Set(tableInfo[0].values.map((v) => String(v[1])));
        const columnsToAdd: [string, string][] = [
          ['reseller_phone', 'TEXT'],
          ['head_teacher_name', 'TEXT'],
          ['head_teacher_phone', 'TEXT'],
          ['lat', 'TEXT'],
          ['long', 'TEXT'],
          ['union_name', 'TEXT'],
          ['upazila', 'TEXT'],
          ['fiber_length', 'TEXT'],
          ['category', 'TEXT'],
          ['name_bn', 'TEXT'],
          ['name_en', 'TEXT'],
          ['bill_received_at', 'TEXT'],
          ['bill_months', 'TEXT'],
        ];
        for (const [cName, cType] of columnsToAdd) {
          if (!colNames.has(cName)) {
            this.sqlite.run(`ALTER TABLE logs ADD COLUMN ${cName} ${cType}`);
          }
        }
      }
    } catch (migErr) {
      console.warn('[Pace IT] Column migration notice:', migErr);
    }

    // Approvals remember which receiving month a mark belongs to.
    try {
      const ai = this.sqlite.exec('PRAGMA table_info(approvals)');
      const aCols = new Set(ai.length ? ai[0].values.map((v) => String(v[1])) : []);
      if (!aCols.has('month')) this.sqlite.run('ALTER TABLE approvals ADD COLUMN month TEXT');
      if (!aCols.has('received_on')) this.sqlite.run('ALTER TABLE approvals ADD COLUMN received_on TEXT');
    } catch (monthErr) {
      console.warn('[Pace IT] Approvals month column notice:', monthErr);
    }

    // One-time: the 162 bills received so far were the September 2026 bills (PRAGMA user_version 3).
    try {
      const v = Number(this.sqlite.exec('PRAGMA user_version')[0]?.values[0]?.[0] || 0);
      if (v < 3) {
        this.sqlite.run("UPDATE logs SET bill_months = '[\"2026-09\"]' WHERE bill_received_at IS NOT NULL AND bill_received_at <> '' AND bill_months IS NULL");
        this.sqlite.run('PRAGMA user_version = 3');
        this.scheduleSave();
      }
    } catch (tagErr) {
      console.warn('[Pace IT] Receiving-month backfill notice:', tagErr);
    }

    // One-time (PRAGMA user_version 4): Degree Colleges belong under National University.
    // Only logs still on the old automatic result (Secondary Education / no category) are moved.
    try {
      const v = Number(this.sqlite.exec('PRAGMA user_version')[0]?.values[0]?.[0] || 0);
      if (v < 4) {
        const rows = this.sqlite.exec("SELECT id, customer_name, name_bn, name_en, category FROM logs WHERE category IS NULL OR category = '' OR category LIKE '%Secondary Education%'");
        for (const [id, customerName, nameBn, nameEn, category] of rows.length ? rows[0].values : []) {
          const next = resolveCategory({
            customerName: customerName ? String(customerName) : '',
            nameBn: nameBn ? String(nameBn) : '',
            nameEn: nameEn ? String(nameEn) : '',
            category: category ? String(category) : '',
          });
          if (next === 'National University' && next !== stripCategoryNumber(category ? String(category) : '')) {
            this.sqlite.run('UPDATE logs SET category = ? WHERE id = ?', [next, String(id)]);
          }
        }
        this.sqlite.run('PRAGMA user_version = 4');
        this.scheduleSave();
      }
    } catch (degErr) {
      console.warn('[Pace IT] Degree college category notice:', degErr);
    }

    // Backfill: store the auto-detected category (no numbering) on every existing log.
    try {
      // Runs once (PRAGMA user_version), so later manual fixes are never overwritten.
      const ver = Number(this.sqlite.exec('PRAGMA user_version')[0]?.values[0]?.[0] || 0);
      const rows = ver < 2 ? this.sqlite.exec('SELECT id, customer_name, name_bn, name_en, category FROM logs') : [];
      if (ver < 2) this.sqlite.run('PRAGMA user_version = 2');
      if (rows.length) {
        for (const [id, customerName, nameBn, nameEn, category] of rows[0].values) {
          const next = resolveCategory({
            customerName: customerName ? String(customerName) : '',
            nameBn: nameBn ? String(nameBn) : '',
            nameEn: nameEn ? String(nameEn) : '',
            category: category ? String(category) : '',
          });
          if (next && next !== (category ? String(category) : '')) {
            this.sqlite.run('UPDATE logs SET category = ? WHERE id = ?', [next, String(id)]);
          }
        }
      }
    } catch (catErr) {
      console.warn('[Pace IT] Category backfill notice:', catErr);
    }

    // One-time backfill: keep the existing institute name in the right-language field.
    try {
      const rows = this.sqlite.exec("SELECT id, customer_name FROM logs WHERE (name_bn IS NULL OR name_bn = '') AND (name_en IS NULL OR name_en = '') AND customer_name <> ''");
      if (rows.length) {
        for (const [id, nm] of rows[0].values) {
          const name = String(nm);
          const isBangla = /[\u0980-\u09FF]/.test(name);
          this.sqlite.run(`UPDATE logs SET ${isBangla ? 'name_bn' : 'name_en'} = ? WHERE id = ?`, [name, String(id)]);
        }
      }
    } catch (bfErr) {
      console.warn('[Pace IT] Institute name backfill notice:', bfErr);
    }

    // Indexes for fast lookups once there are thousands of records
    for (const [name, col] of [
      ['idx_logs_nms', 'nms_id'],
      ['idx_logs_edc', 'edc_no'],
      ['idx_logs_reseller', 'reseller_id'],
      ['idx_logs_created', 'created_at'],
      ['idx_logs_status', 'status'],
      ['idx_logs_upazila', 'upazila'],
      ['idx_logs_category', 'category'],
    ]) {
      try {
        this.sqlite.run(`CREATE INDEX IF NOT EXISTS ${name} ON logs(${col})`);
      } catch (idxErr) {
        console.warn(`[Pace IT] Could not create index ${name}:`, idxErr);
      }
    }

    // Ensure default admin exists
    const adminCheck = this.sqlite.exec("SELECT id FROM users WHERE username = 'admin'");
    if (adminCheck.length === 0 || adminCheck[0].values.length === 0) {
      this.sqlite.run(
        'INSERT INTO users (id, username, display_name, password, role, disabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [crypto.randomUUID(), 'admin', 'Administrator', 'admin', 'admin', 0, new Date().toISOString()]
      );
    }

    // Ensure initial suggestions exist
    const suggCheck = this.sqlite.exec('SELECT field FROM suggestions LIMIT 1');
    if (suggCheck.length === 0 || suggCheck[0].values.length === 0) {
      for (const [field, values] of Object.entries(INITIAL_SUGGESTIONS)) {
        this.sqlite.run('INSERT OR REPLACE INTO suggestions (field, values_json) VALUES (?, ?)', [
          field,
          JSON.stringify(values),
        ]);
      }
    }
  }

  /**
   * One-time cleanup: turn old-style resellers such as "Shabul- Balaganj" (name with the area typed
   * in) into name "Shabul" + upazila "Balaganj", and normalise free-text areas to the 13 upazilas.
   * Logs that carry the old name are renamed to match. Safe to run repeatedly.
   */
  private migrateResellerUpazilas() {
    try {
      const res = this.sqlite.exec('SELECT id, name, area FROM resellers');
      if (!res.length) return;
      const rows = res[0].values.map(([id, name, area]) => ({ id: String(id), name: String(name), area: String(area || '') }));

      const plan: { id: string; oldName: string; name: string; area: string }[] = [];
      for (const r of rows) {
        let name = r.name;
        let area = upazilaKey(r.area);
        if (!area && r.area) {
          // "Balaganj, Sylhet" -> try each part
          area = r.area.split(/[,/]/).map((p) => upazilaKey(p)).find(Boolean) || '';
        }
        const legacy = splitLegacyName(r.name);
        if (legacy) {
          name = legacy.name;
          if (!area) area = legacy.area;
        }
        if (area && (name !== r.name || area !== r.area)) plan.push({ id: r.id, oldName: r.name, name, area });
      }
      if (!plan.length) return;

      // keep a copy of the database as it was before this one-time change
      try {
        if (fs.existsSync(SQLITE_FILE)) fs.copyFileSync(SQLITE_FILE, `${SQLITE_FILE}.before-upazila`);
      } catch {
        /* non-fatal */
      }

      const taken = new Set(rows.map((r) => `${r.name.toLowerCase()}|${upazilaKey(r.area)}`));
      for (const p of plan) {
        let name = p.name;
        const keyNew = `${name.toLowerCase()}|${p.area}`;
        const keyOld = `${p.oldName.toLowerCase()}|${upazilaKey(rows.find((r) => r.id === p.id)?.area || '')}`;
        if (name !== p.oldName && keyNew !== keyOld && taken.has(keyNew)) name = p.oldName; // would clash: keep old name
        this.sqlite.run('UPDATE resellers SET name = ?, area = ? WHERE id = ?', [name, p.area, p.id]);
        if (name !== p.oldName) {
          this.sqlite.run('UPDATE logs SET reseller_name = ? WHERE reseller_id = ? OR reseller_name = ?', [name, p.id, p.oldName]);
        }
        taken.add(`${name.toLowerCase()}|${p.area}`);
      }
      console.log(`[Pace IT] Updated ${plan.length} reseller(s) to name + upazila.`);
    } catch (err) {
      console.warn('[Pace IT] Reseller upazila migration notice:', err);
    }
  }

  /** Automatically migrates logs from pace_it_db.json or any backup JSON file found in data/ */
  private autoMigrateExistingLogs() {
    const logCountRes = this.sqlite.exec('SELECT COUNT(*) FROM logs');
    const existingCount = Number(logCountRes[0]?.values[0]?.[0] || 0);

    // If SQLite already has logs, don't overwrite
    if (existingCount > 0) return;

    let importedLogs: any[] = [];
    let importedUsers: any[] = [];
    let importedResellers: any[] = [];
    let importedActivity: any[] = [];
    let importedSuggestions: any = null;

    // 1. Try pace_it_db.json
    if (fs.existsSync(JSON_LEGACY_FILE)) {
      try {
        const raw = fs.readFileSync(JSON_LEGACY_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed) {
          if (Array.isArray(parsed.logs)) importedLogs = parsed.logs;
          if (Array.isArray(parsed.users)) importedUsers = parsed.users;
          if (Array.isArray(parsed.resellers)) importedResellers = parsed.resellers;
          if (Array.isArray(parsed.activity)) importedActivity = parsed.activity;
          if (parsed.suggestions) importedSuggestions = parsed.suggestions;
        }
      } catch (err) {
        console.error('Failed reading legacy JSON for auto-migration:', err);
      }
    }

    // 2. Also check for any custom backup files in data/ (e.g. backup.json, supabase_logs.json)
    if (importedLogs.length === 0) {
      try {
        const files = fs.readdirSync(DB_DIR);
        for (const file of files) {
          if (file.endsWith('.json') && file !== 'index.json' && file !== 'pace_it_db.backup.json') {
            const raw = fs.readFileSync(path.join(DB_DIR, file), 'utf-8');
            try {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) {
                importedLogs = parsed;
                break;
              } else if (parsed && Array.isArray(parsed.logs)) {
                importedLogs = parsed.logs;
                if (parsed.suggestions) importedSuggestions = parsed.suggestions;
                break;
              }
            } catch {
              /* ignore invalid json */
            }
          }
        }
      } catch {
        /* non-fatal */
      }
    }

    // Insert imported users if any
    for (const u of importedUsers) {
      if (u.username === 'admin') continue; // admin already created
      this.sqlite.run(
        'INSERT OR IGNORE INTO users (id, username, display_name, password, role, disabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [u.id || crypto.randomUUID(), u.username, u.displayName || u.username, u.password || 'admin1234', u.role || 'user', u.disabled ? 1 : 0, u.createdAt || new Date().toISOString()]
      );
    }

    // Insert imported resellers if any
    for (const r of importedResellers) {
      this.sqlite.run(
        'INSERT OR IGNORE INTO resellers (id, name, area, phone, active, created_at, deleted_at, deleted_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [r.id || crypto.randomUUID(), r.name, r.area || '', r.phone || '', r.active !== false ? 1 : 0, r.createdAt || new Date().toISOString(), r.deletedAt || null, r.deletedBy || null]
      );
    }

    // Insert imported logs
    if (importedLogs.length > 0) {
      for (const item of importedLogs) {
        const data = (item && typeof item.data === 'object' && item.data !== null) ? item.data : item;
        const id = String(data.id || item.id || crypto.randomUUID());
        const logNo = Number(data.logNo ?? data.log_no ?? item.log_no ?? 1);
        const historyJson = Array.isArray(data.history) ? JSON.stringify(data.history) : '[]';

        this.sqlite.run(
          `INSERT OR REPLACE INTO logs (
            id, log_no, date, reseller_name, reseller_phone, request_type, customer_name,
            nms_id, issue_found, missing_wrong_details, action_taken, reason_for_action,
            reseller_informed, follow_up_needed, status, supervisor_informed, remarks, mac,
            edc_no, router_serial, form_received_at, reseller_id, follow_up_date,
            deleted_at, deleted_by, created_at, updated_at, created_by, updated_by, history
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id, logNo, String(data.date || item.date || ''), String(data.resellerName || data.reseller_name || item.reseller_name || ''),
            String(data.resellerPhone || data.reseller_phone || data.callerPhone || data.caller_phone || item.reseller_phone || item.caller_phone || ''), String(data.requestType || data.request_type || item.request_type || ''),
            String(data.customerName || data.customer_name || item.customer_name || ''), String(data.nmsId || data.nms_id || item.nms_id || ''),
            String(data.issueFound || data.issue_found || item.issue_found || ''), String(data.missingWrongDetails || data.missing_wrong_details || item.missing_wrong_details || ''),
            String(data.actionTaken || data.action_taken || item.action_taken || ''), String(data.reasonForAction || data.reason_for_action || item.reason_for_action || ''),
            String(data.resellerInformed || data.reseller_informed || item.reseller_informed || ''), String(data.followUpNeeded || data.follow_up_needed || item.follow_up_needed || ''),
            String(data.status || item.status || 'Resolved'), String(data.supervisorInformed || data.supervisor_informed || item.supervisor_informed || ''),
            String(data.remarks || item.remarks || ''), String(data.mac || item.mac || ''), data.edcNo ?? data.edc_no ?? item.edc_no ?? null,
            data.routerSerial ?? data.router_serial ?? item.router_serial ?? null, data.formReceivedAt ?? data.form_received_at ?? item.form_received_at ?? null,
            data.resellerId ?? data.reseller_id ?? item.reseller_id ?? null, data.followUpDate ?? data.follow_up_date ?? item.follow_up_date ?? null,
            data.deletedAt || item.deleted_at || null, data.deletedBy || item.deleted_by || null,
            String(data.createdAt || data.created_at || item.created_at || new Date().toISOString()),
            String(data.updatedAt || data.updated_at || item.updated_at || new Date().toISOString()),
            data.createdBy || data.created_by || item.created_by_name || 'Imported',
            data.updatedBy || data.updated_by || item.updated_by_name || 'Imported',
            historyJson
          ]
        );
      }
      console.log(`[Pace IT] Successfully auto-migrated ${importedLogs.length} logs into SQLite!`);
    }

    // Insert imported activity
    for (const a of importedActivity) {
      this.sqlite.run(
        'INSERT OR IGNORE INTO activity (id, at, by_user, action, log_no, customer, detail) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [a.id || crypto.randomUUID(), a.at || new Date().toISOString(), a.by || 'Imported', a.action || 'created', String(a.logNo || ''), a.customer || '', a.detail || '']
      );
    }

    // Insert suggestions if provided
    if (importedSuggestions && typeof importedSuggestions === 'object') {
      for (const [field, values] of Object.entries(importedSuggestions)) {
        this.sqlite.run('INSERT OR REPLACE INTO suggestions (field, values_json) VALUES (?, ?)', [
          field,
          JSON.stringify(values),
        ]);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Saving to disk
  //
  // Exporting the whole database is expensive, so changes are written in batches:
  // the first change starts a short timer and every change in that window shares one write.
  // The file is written atomically (temp file + rename), a rolling "last good" copy is kept,
  // and one dated backup per day is stored in data/backups (the newest 30 are kept).
  // The pending write is always flushed when the server stops.
  // -------------------------------------------------------------------------
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;
  private lastBackupAt = 0;
  /** Increases on every change that affects cached API data. Used for HTTP caching. */
  public revision = 0;

  private scheduleSave() {
    this.dirty = true;
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush();
    }, 400);
  }

  /** Write any pending changes to disk right now. */
  flush() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (!this.dirty) return;
    this.dirty = false;
    this.saveToDisk();
  }

  private saveToDisk() {
    try {
      const data = this.sqlite.export();
      const buffer = Buffer.from(data);
      const tempPath = `${SQLITE_FILE}.${Date.now()}.tmp`;
      fs.writeFileSync(tempPath, buffer);
      fs.renameSync(tempPath, SQLITE_FILE);

      const now = Date.now();
      // rolling "last good" copy, at most every 10 minutes
      if (now - this.lastBackupAt > 10 * 60 * 1000) {
        try {
          fs.writeFileSync(SQLITE_BACKUP, buffer);
          this.lastBackupAt = now;
        } catch {
          /* non-fatal */
        }
      }
      this.dailyBackup(buffer);
    } catch (err) {
      console.error('[Pace IT] Failed to write SQLite database to disk:', err);
    }
  }

  private dailyBackup(buffer: Buffer) {
    try {
      const dir = path.join(DB_DIR, 'backups');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const day = new Date().toISOString().slice(0, 10);
      const file = path.join(dir, `pace_it-${day}.sqlite`);
      if (fs.existsSync(file)) return;
      fs.writeFileSync(file, buffer);
      const old = fs
        .readdirSync(dir)
        .filter((f) => /^pace_it-\d{4}-\d{2}-\d{2}\.sqlite$/.test(f))
        .sort()
        .reverse()
        .slice(30);
      for (const f of old) fs.unlinkSync(path.join(dir, f));
    } catch {
      /* non-fatal */
    }
  }

  private notify(type: string, payload?: any) {
    if (type !== 'activity' && type !== 'suggestions' && type !== 'approvals') this.revision++;
    this.scheduleSave();
    this.emit('change', { type, payload, timestamp: new Date().toISOString() });
  }

  // -------------------------------------------------------------------------
  // Auth & Sessions
  // -------------------------------------------------------------------------
  createSession(userId: string): string {
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
    const payload = `${userId}.${expiresAt}`;
    const hmac = crypto.createHmac('sha256', this.secret).update(payload).digest('hex');
    return `${payload}.${hmac}`;
  }

  getUserByToken(token: string): AppUser | null {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [userId, expiresAtStr, signature] = parts;
    const expiresAt = parseInt(expiresAtStr, 10);
    if (isNaN(expiresAt) || expiresAt < Date.now()) return null;

    const expectedHmac = crypto.createHmac('sha256', this.secret).update(`${userId}.${expiresAtStr}`).digest('hex');
    if (signature !== expectedHmac) return null;

    return this.getUserById(userId);
  }

  destroySession(_token: string) {
    // Stateless token, cleared on client
  }

  // -------------------------------------------------------------------------
  // Users
  // -------------------------------------------------------------------------
  getUserById(id: string): StoredUser | null {
    const res = this.sqlite.exec('SELECT id, username, display_name, password, role, disabled, created_at FROM users WHERE id = ?', [id]);
    if (!res.length || !res[0].values.length) return null;
    const [uId, username, displayName, password, role, disabled, createdAt] = res[0].values[0];
    if (Number(disabled) === 1) return null;
    return {
      id: String(uId),
      username: String(username),
      displayName: String(displayName),
      password: String(password),
      role: (role as 'admin' | 'user') || 'user',
      disabled: Boolean(disabled),
      createdAt: String(createdAt),
    };
  }

  getUserByUsername(username: string): StoredUser | null {
    const norm = username.trim().toLowerCase().replace(/\s+/g, '_');
    const res = this.sqlite.exec('SELECT id, username, display_name, password, role, disabled, created_at FROM users WHERE lower(username) = ?', [norm]);
    if (!res.length || !res[0].values.length) return null;
    const [id, uName, displayName, password, role, disabled, createdAt] = res[0].values[0];
    return {
      id: String(id),
      username: String(uName),
      displayName: String(displayName),
      password: String(password),
      role: (role as 'admin' | 'user') || 'user',
      disabled: Boolean(disabled),
      createdAt: String(createdAt),
    };
  }

  listUsers(): (AppUser & { createdAt?: string; disabled?: boolean })[] {
    const res = this.sqlite.exec('SELECT id, username, display_name, role, disabled, created_at FROM users ORDER BY created_at ASC');
    if (!res.length) return [];
    return res[0].values.map(([id, username, displayName, role, disabled, createdAt]) => ({
      id: String(id),
      username: String(username),
      displayName: String(displayName),
      role: (role as 'admin' | 'user') || 'user',
      disabled: Boolean(disabled),
      createdAt: String(createdAt),
    }));
  }

  listCredentials(): Record<string, string> {
    const res = this.sqlite.exec('SELECT id, password FROM users');
    const map: Record<string, string> = {};
    if (res.length) {
      for (const [id, password] of res[0].values) {
        map[String(id)] = String(password);
      }
    }
    return map;
  }

  createUser(username: string, password: string, displayName: string): AppUser {
    const norm = username.trim().toLowerCase().replace(/\s+/g, '_');
    if (!norm) throw new Error('Username is required.');
    if (password.length < 8) throw new Error('Password must be at least 8 characters.');
    if (this.getUserByUsername(norm)) throw new Error('That username already exists.');

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const cleanDisplay = displayName.trim() || norm;

    this.sqlite.run(
      'INSERT INTO users (id, username, display_name, password, role, disabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, norm, cleanDisplay, password, 'user', 0, createdAt]
    );

    this.notify('users');
    return { id, username: norm, displayName: cleanDisplay, role: 'user', disabled: false, createdAt };
  }

  setUserDisabled(userId: string, disabled: boolean): boolean {
    const user = this.getUserById(userId);
    if (!user) throw new Error('User not found.');
    if (user.role === 'admin' && disabled) throw new Error('Cannot disable the administrator account.');

    this.sqlite.run('UPDATE users SET disabled = ? WHERE id = ?', [disabled ? 1 : 0, userId]);
    this.notify('users');
    return true;
  }

  setUserPassword(userId: string, newPassword: string): boolean {
    if (newPassword.length < 8) throw new Error('Password must be at least 8 characters.');
    this.sqlite.run('UPDATE users SET password = ? WHERE id = ?', [newPassword, userId]);
    this.notify('users');
    return true;
  }

  // -------------------------------------------------------------------------
  // Logs
  // -------------------------------------------------------------------------
  private rowToLog(row: SqlValue[], colNames?: string[]): LogEntry {
    let r: Record<string, any> = {};
    if (colNames && colNames.length) {
      for (let i = 0; i < colNames.length; i++) {
        r[colNames[i]] = row[i];
      }
    } else {
      const [
        id, logNo, date, resellerName, callerPhone, requestType, customerName,
        nmsId, issueFound, missingWrongDetails, actionTaken, reasonForAction,
        resellerInformed, followUpNeeded, status, supervisorInformed, remarks, mac,
        edcNo, routerSerial, formReceivedAt, resellerId, followUpDate,
        deletedAt, deletedBy, createdAt, updatedAt, createdBy, updatedBy, history,
        resellerPhone, headTeacherName, headTeacherPhone, lat, long, unionName, upazila, fiberLength, category
      ] = row;
      r = {
        id, log_no: logNo, date, reseller_name: resellerName, caller_phone: callerPhone,
        request_type: requestType, customer_name: customerName, nms_id: nmsId,
        issue_found: issueFound, missing_wrong_details: missingWrongDetails,
        action_taken: actionTaken, reason_for_action: reasonForAction,
        reseller_informed: resellerInformed, follow_up_needed: followUpNeeded,
        status, supervisor_informed: supervisorInformed, remarks, mac,
        edc_no: edcNo, router_serial: routerSerial, form_received_at: formReceivedAt,
        reseller_id: resellerId, follow_up_date: followUpDate, deleted_at: deletedAt,
        deleted_by: deletedBy, created_at: createdAt, updated_at: updatedAt,
        created_by: createdBy, updated_by: updatedBy, history,
        reseller_phone: resellerPhone, head_teacher_name: headTeacherName,
        head_teacher_phone: headTeacherPhone, lat, long, union_name: unionName,
        upazila, fiber_length: fiberLength, category
      };
    }

    let parsedHistory: LogChange[] = [];
    try {
      if (r.history) parsedHistory = JSON.parse(String(r.history));
    } catch {
      /* ignore */
    }

    return {
      id: String(r.id || ''),
      logNo: Number(r.log_no ?? 1),
      date: String(r.date || ''),
      resellerName: String(r.reseller_name || ''),
      requestType: String(r.request_type || ''),
      customerName: String(r.customer_name || ''),
      nmsId: String(r.nms_id || ''),
      issueFound: String(r.issue_found || ''),
      missingWrongDetails: String(r.missing_wrong_details || ''),
      actionTaken: String(r.action_taken || ''),
      reasonForAction: String(r.reason_for_action || ''),
      resellerInformed: String(r.reseller_informed || ''),
      followUpNeeded: String(r.follow_up_needed || ''),
      status: String(r.status || ''),
      supervisorInformed: String(r.supervisor_informed || ''),
      remarks: String(r.remarks || ''),
      mac: String(r.mac || ''),
      edcNo: r.edc_no ? String(r.edc_no) : undefined,
      routerSerial: r.router_serial ? String(r.router_serial) : undefined,
      formReceivedAt: r.form_received_at ? String(r.form_received_at) : undefined,
      resellerId: r.reseller_id ? String(r.reseller_id) : undefined,
      followUpDate: r.follow_up_date ? String(r.follow_up_date) : undefined,
      resellerPhone: (r.reseller_phone || r.caller_phone) ? String(r.reseller_phone || r.caller_phone) : undefined,
      headTeacherName: r.head_teacher_name ? String(r.head_teacher_name) : undefined,
      headTeacherPhone: r.head_teacher_phone ? String(r.head_teacher_phone) : undefined,
      lat: r.lat ? String(r.lat) : undefined,
      long: r.long ? String(r.long) : undefined,
      unionName: r.union_name ? String(r.union_name) : undefined,
      upazila: r.upazila ? String(r.upazila) : undefined,
      fiberLength: r.fiber_length ? String(r.fiber_length) : undefined,
      category: displayCategory({
        nameBn: r.name_bn ? String(r.name_bn) : undefined,
        nameEn: r.name_en ? String(r.name_en) : undefined,
        customerName: String(r.customer_name || ''),
        category: r.category ? String(r.category) : undefined,
      }) || undefined,
      nameBn: r.name_bn ? String(r.name_bn) : undefined,
      nameEn: r.name_en ? String(r.name_en) : undefined,
      billReceivedAt: r.bill_received_at ? String(r.bill_received_at) : undefined,
      billMonths: (() => {
        try {
          const a = r.bill_months ? JSON.parse(String(r.bill_months)) : [];
          return Array.isArray(a) ? a.map(String).sort() : [];
        } catch { return []; }
      })(),
      deletedAt: r.deleted_at ? String(r.deleted_at) : undefined,
      deletedBy: r.deleted_by ? String(r.deleted_by) : undefined,
      createdAt: String(r.created_at || ''),
      updatedAt: String(r.updated_at || ''),
      createdBy: r.created_by ? String(r.created_by) : undefined,
      updatedBy: r.updated_by ? String(r.updated_by) : undefined,
      history: parsedHistory,
    };
  }

  getLogs(): LogEntry[] {
    const res = this.sqlite.exec('SELECT * FROM logs WHERE deleted_at IS NULL ORDER BY log_no ASC');
    if (!res.length) return [];
    const cols = res[0].columns;
    return res[0].values.map((row) => this.rowToLog(row, cols));
  }

  getNextLogNo(): number {
    const res = this.sqlite.exec('SELECT MAX(log_no) FROM logs');
    const maxVal = res[0]?.values[0]?.[0];
    return (Number(maxVal) || 0) + 1;
  }

  saveLog(entry: LogEntry, user: AppUser, existingId?: string, opts: { quiet?: boolean } = {}): LogEntry {
    const now = new Date().toISOString();
    const id = existingId || entry.id || crypto.randomUUID();
    // Keep a hand-picked category; auto-detect from the institute name when it is empty.
    entry = { ...entry, category: stripCategoryNumber(entry.category) || resolveCategory(entry) };
    // sql.js refuses `undefined`; a missing optional value is stored as NULL.
    const clean = (a: any[]) => a.map((v) => (v === undefined ? null : v));

    // Check if exists
    const checkRes = this.sqlite.exec('SELECT * FROM logs WHERE id = ?', [id]);
    const existingRow = checkRes.length && checkRes[0].values.length ? this.rowToLog(checkRes[0].values[0], checkRes[0].columns) : null;

    let saved: LogEntry;

    if (existingRow) {
      const history = [...(existingRow.history || [])];
      const changes: { field: string; from: string; to: string }[] = [];
      const fieldsToCheck: (keyof LogEntry)[] = [
        'resellerName', 'requestType', 'customerName', 'nmsId',
        'issueFound', 'missingWrongDetails', 'actionTaken', 'reasonForAction',
        'resellerInformed', 'followUpNeeded', 'status', 'supervisorInformed',
        'remarks', 'mac', 'edcNo', 'routerSerial', 'formReceivedAt', 'billReceivedAt', 'followUpDate',
        'resellerPhone', 'headTeacherName', 'headTeacherPhone', 'lat', 'long',
        'unionName', 'upazila', 'fiberLength', 'category', 'nameBn', 'nameEn',
      ];

      for (const f of fieldsToCheck) {
        if (f === 'formReceivedAt' || f === 'billReceivedAt') continue;
        const fromVal = String(existingRow[f] ?? '');
        const toVal = String(entry[f] ?? '');
        if (fromVal !== toVal) {
          changes.push({ field: f, from: fromVal, to: toVal });
        }
      }

      if (changes.length > 0) {
        history.push({ at: now, by: user.displayName, action: 'edited', changes });
      }

      saved = {
        ...existingRow,
        ...entry,
        id: existingRow.id,
        createdAt: existingRow.createdAt,
        createdBy: existingRow.createdBy,
        updatedAt: changes.length > 0 ? now : existingRow.updatedAt,
        updatedBy: changes.length > 0 ? user.displayName : existingRow.updatedBy,
        history,
        // Form / bill received marks only change through the approval flow (markLog), never through a normal save.
        formReceivedAt: existingRow.formReceivedAt,
        billReceivedAt: existingRow.billReceivedAt,
        billMonths: existingRow.billMonths,
      };

      this.sqlite.run(
        `UPDATE logs SET
          log_no = ?, date = ?, reseller_name = ?, caller_phone = ?, request_type = ?,
          customer_name = ?, nms_id = ?, issue_found = ?, missing_wrong_details = ?,
          action_taken = ?, reason_for_action = ?, reseller_informed = ?, follow_up_needed = ?,
          status = ?, supervisor_informed = ?, remarks = ?, mac = ?, edc_no = ?,
          router_serial = ?, form_received_at = ?, reseller_id = ?, follow_up_date = ?,
          reseller_phone = ?, head_teacher_name = ?, head_teacher_phone = ?,
          lat = ?, long = ?, union_name = ?, upazila = ?, fiber_length = ?, category = ?,
          updated_at = ?, updated_by = ?, history = ?
        WHERE id = ?`,
        clean([
          Number(saved.logNo), saved.date, saved.resellerName, null, saved.requestType,
          saved.customerName, saved.nmsId, saved.issueFound, saved.missingWrongDetails,
          saved.actionTaken, saved.reasonForAction, saved.resellerInformed, saved.followUpNeeded,
          saved.status, saved.supervisorInformed, saved.remarks, saved.mac, saved.edcNo || null,
          saved.routerSerial || null, saved.formReceivedAt || null, saved.resellerId || null, saved.followUpDate || null,
          saved.resellerPhone || null, saved.headTeacherName || null, saved.headTeacherPhone || null,
          saved.lat || null, saved.long || null, saved.unionName || null, saved.upazila || null, saved.fiberLength || null,
          saved.category || null,
          saved.updatedAt, saved.updatedBy || null, JSON.stringify(saved.history || []), saved.id
        ])
      );

      if (changes.length > 0 && !opts.quiet) {
        this.addActivity({
          by: user.displayName,
          action: 'edited',
          logNo: saved.logNo,
          customer: saved.customerName,
          detail: changes.map(c => c.field).join(', '),
        });
      }
    } else {
      const logNo = entry.logNo || this.getNextLogNo();
      saved = {
        ...entry,
        date: entry.date || '',
        resellerName: entry.resellerName || '',
        requestType: entry.requestType || '',
        customerName: entry.customerName || '',
        status: entry.status || '',
        formReceivedAt: user.role === 'admin' ? entry.formReceivedAt : undefined,
        billReceivedAt: user.role === 'admin' ? entry.billReceivedAt : undefined,
        billMonths: user.role === 'admin' ? entry.billMonths : undefined,
        id,
        logNo,
        createdAt: now,
        updatedAt: now,
        createdBy: user.displayName,
        updatedBy: user.displayName,
        history: [{ at: now, by: user.displayName, action: 'created' }],
      };

      this.sqlite.run(
        `INSERT INTO logs (
          id, log_no, date, reseller_name, caller_phone, request_type, customer_name,
          nms_id, issue_found, missing_wrong_details, action_taken, reason_for_action,
          reseller_informed, follow_up_needed, status, supervisor_informed, remarks, mac,
          edc_no, router_serial, form_received_at, reseller_id, follow_up_date,
          reseller_phone, head_teacher_name, head_teacher_phone, lat, long, union_name, upazila, fiber_length, category,
          deleted_at, deleted_by, created_at, updated_at, created_by, updated_by, history
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        clean([
          saved.id, Number(saved.logNo), saved.date, saved.resellerName, null,
          saved.requestType, saved.customerName, saved.nmsId, saved.issueFound,
          saved.missingWrongDetails, saved.actionTaken, saved.reasonForAction,
          saved.resellerInformed, saved.followUpNeeded, saved.status, saved.supervisorInformed,
          saved.remarks, saved.mac, saved.edcNo || null, saved.routerSerial || null,
          saved.formReceivedAt || null, saved.resellerId || null, saved.followUpDate || null,
          saved.resellerPhone || null, saved.headTeacherName || null, saved.headTeacherPhone || null,
          saved.lat || null, saved.long || null, saved.unionName || null, saved.upazila || null, saved.fiberLength || null,
          saved.category || null,
          null, null, saved.createdAt, saved.updatedAt, saved.createdBy || null, saved.updatedBy || null,
          JSON.stringify(saved.history || [])
        ])
      );

      this.addActivity({
        by: user.displayName,
        action: 'created',
        logNo: saved.logNo,
        customer: saved.customerName,
      });
    }

    this.writeExtras(saved);
    this.harvestSuggestions(saved);
    this.notify('logs', { id: saved.id, action: existingRow ? 'updated' : 'created' });
    return saved;
  }

  /** Columns added after the original schema; written separately so every save path stays in sync. */
  private writeExtras(l: Partial<LogEntry> & { id: string }) {
    this.sqlite.run(
      `UPDATE logs SET head_teacher_name = ?, head_teacher_phone = ?, lat = ?, long = ?, union_name = ?, upazila = ?,
         fiber_length = ?, category = ?, name_bn = ?, name_en = ?, reseller_phone = ?, bill_received_at = ?, bill_months = ? WHERE id = ?`,
      [
        l.headTeacherName || null, l.headTeacherPhone || null, l.lat || null, l.long || null, l.unionName || null,
        l.upazila || null, l.fiberLength || null, l.category || null, l.nameBn || null, l.nameEn || null,
        l.resellerPhone || null, l.billReceivedAt || null,
        l.billMonths && l.billMonths.length ? JSON.stringify([...new Set(l.billMonths)].sort()) : null,
        l.id,
      ]
    );
  }

  /**
   * Silent background save: merge only the given fields into an existing log and write the
   * database to disk straight away (no waiting for the 400 ms batch timer). History is still
   * recorded; the activity feed is not spammed. Returns null if the log does not exist.
   */
  patchLog(id: string, fields: Partial<LogEntry>, user: AppUser): LogEntry | null {
    const res = this.sqlite.exec('SELECT * FROM logs WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!res.length || !res[0].values.length) return null;
    const current = this.rowToLog(res[0].values[0], res[0].columns);
    // never let a patch rewrite identity / audit fields
    const { id: _i, createdAt: _c, createdBy: _cb, updatedAt: _u, updatedBy: _ub, history: _h, deletedAt: _d, deletedBy: _db, ...safe } = fields as any;
    const saved = this.saveLog({ ...current, ...safe }, user, id, { quiet: true });
    this.flush();
    return saved;
  }

  /**
   * Writes one field on many logs at once ("fill a field from a list").
   * Each log is re-read from the database first, so nothing else on it (or edited meanwhile by
   * someone else) is touched; per-log history is recorded and ONE summary line goes to the activity feed.
   */
  bulkFillField(field: string, items: { id: string; value: string }[], user: AppUser): { updated: number; unchanged: number; missing: number } {
    const labels: Record<string, string> = {
      mac: 'MAC address', routerSerial: 'Router serial', edcNo: 'EDC book no.', lat: 'Latitude', long: 'Longitude',
      fiberLength: 'Fiber length', unionName: 'Union / address', upazila: 'Upazila', headTeacherName: 'Head teacher name',
      headTeacherPhone: 'Head teacher phone', nameBn: 'Institute name (Bangla)', nameEn: 'Institute name (English)', remarks: 'Remarks',
    };
    if (!Object.prototype.hasOwnProperty.call(labels, field)) throw new Error('This field cannot be filled in bulk.');

    let updated = 0, unchanged = 0, missing = 0;
    for (const item of items) {
      const res = this.sqlite.exec('SELECT * FROM logs WHERE id = ? AND deleted_at IS NULL', [String(item?.id ?? '')]);
      if (!res.length || !res[0].values.length) { missing++; continue; }
      const current = this.rowToLog(res[0].values[0], res[0].columns);
      const value = String(item.value ?? '').trim().slice(0, 500);
      if (String((current as any)[field] ?? '') === value) { unchanged++; continue; }

      const patch: Partial<LogEntry> = { [field]: value };
      if (field === 'nameBn' || field === 'nameEn') {
        // customerName is the name shown everywhere: Bangla first, then English
        const bn = field === 'nameBn' ? value : (current.nameBn || '');
        const en = field === 'nameEn' ? value : (current.nameEn || '');
        patch.customerName = bn.trim() || en.trim() || current.customerName;
      }
      this.saveLog({ ...current, ...patch }, user, current.id, { quiet: true });
      updated++;
    }
    if (updated) {
      this.addActivity({ by: user.displayName, action: 'edited', detail: `Bulk fill - ${labels[field]}: ${updated} log${updated === 1 ? '' : 's'}` });
      this.flush();
    }
    return { updated, unchanged, missing };
  }

  // -------------------------------------------------------------------------
  // Form / bill received marks and the admin approval queue
  // -------------------------------------------------------------------------
  private rowToApproval(r: SqlValue[]): ApprovalRequest {
    const [id, logId, logNo, customer, kind, action, requestedBy, requestedAt, status, decidedBy, decidedAt, month, receivedOn] = r;
    return {
      id: String(id), logId: String(logId), logNo: logNo ? String(logNo) : undefined,
      customer: customer ? String(customer) : undefined, kind: kind as MarkKind, action: action as MarkAction,
      requestedBy: String(requestedBy), requestedAt: String(requestedAt), status: status as ApprovalRequest['status'],
      decidedBy: decidedBy ? String(decidedBy) : undefined, decidedAt: decidedAt ? String(decidedAt) : undefined,
      month: month ? String(month) : undefined,
      receivedOn: receivedOn ? String(receivedOn) : undefined,
    };
  }

  /** Every pending request plus the 100 most recent decisions. */
  listApprovals(): ApprovalRequest[] {
    const cols = 'id, log_id, log_no, customer, kind, action, requested_by, requested_at, status, decided_by, decided_at, month, received_on';
    const pending = this.sqlite.exec(`SELECT ${cols} FROM approvals WHERE status = 'pending' ORDER BY requested_at ASC`);
    const done = this.sqlite.exec(`SELECT ${cols} FROM approvals WHERE status <> 'pending' ORDER BY decided_at DESC LIMIT 100`);
    return [
      ...(pending.length ? pending[0].values.map((r) => this.rowToApproval(r)) : []),
      ...(done.length ? done[0].values.map((r) => this.rowToApproval(r)) : []),
    ];
  }

  /** 'YYYY-MM' for a date; falls back to the current month. */
  private monthOf(at?: string | null): string {
    const d = at ? new Date(at) : new Date();
    const x = isNaN(d.getTime()) ? new Date() : d;
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
  }

  private cleanMonth(m: unknown, fallbackAt?: string): string {
    return typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : this.monthOf(fallbackAt);
  }

  /** The timestamp stored for a chosen 'YYYY-MM-DD' (noon UTC, so it shows as that day everywhere); now if not valid. */
  private stampOf(dateStr: unknown, fallback: string): string {
    if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const d = new Date(`${dateStr}T12:00:00.000Z`);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
    return fallback;
  }

  /**
   * Writes one received / not-received mark onto a log, with a history entry.
   *  - bill: tracked per receiving month. "received" adds the month, "not received" removes it.
   *  - form: one signed form per institute; "received" stores the date it was received.
   */
  private applyMark(logId: string, kind: MarkKind, action: MarkAction, at: string, by: string, month?: string, receivedOn?: string): boolean {
    const res = this.sqlite.exec('SELECT * FROM logs WHERE id = ? AND deleted_at IS NULL', [logId]);
    if (!res.length || !res[0].values.length) return false;
    const current = this.rowToLog(res[0].values[0], res[0].columns);
    const m = this.cleanMonth(month, at);
    const now = new Date().toISOString();
    let change: { field: string; from: string; to: string };

    if (kind === 'bill') {
      const had = current.billMonths || [];
      const next = action === 'received' ? [...new Set([...had, m])].sort() : had.filter((x) => x !== m);
      if (next.join(',') === had.join(',')) return true;
      // billReceivedAt = when the latest bill came in (empty once no month is left)
      const stamp = next.length ? (action === 'received' ? at : current.billReceivedAt || at) : '';
      this.sqlite.run('UPDATE logs SET bill_months = ?, bill_received_at = ?, updated_at = ?, updated_by = ? WHERE id = ?', [
        next.length ? JSON.stringify(next) : null, stamp || null, now, by, logId,
      ]);
      change = { field: 'billMonths', from: had.join(', '), to: next.join(', ') };
    } else {
      const from = String(current.formReceivedAt ?? '');
      const to = action === 'received' ? this.stampOf(receivedOn, at) : '';
      if (!!from === !!to) return true; // already in that state
      this.sqlite.run('UPDATE logs SET form_received_at = ?, updated_at = ?, updated_by = ? WHERE id = ?', [to || null, now, by, logId]);
      change = { field: 'formReceivedAt', from, to };
    }
    const history = [...(current.history || []), { at: now, by, action: 'edited' as const, changes: [change] }];
    this.sqlite.run('UPDATE logs SET history = ? WHERE id = ?', [JSON.stringify(history), logId]);
    return true;
  }

  /**
   * Mark forms / bills as received or not received.
   * - Bills are marked for a receiving month ('YYYY-MM'); forms for the date they were received ('YYYY-MM-DD').
   * - An administrator's mark is applied at once.
   * - Anyone else's mark becomes a pending request that an administrator approves later.
   * A newer request for the same log + kind (+ month, for bills) replaces the older pending one.
   */
  requestMarks(items: { logId: string; kind: MarkKind; action: MarkAction; month?: string; receivedOn?: string }[], user: AppUser): { applied: number; queued: number; skipped: number } {
    let applied = 0, queued = 0, skipped = 0;
    const now = new Date().toISOString();
    for (const it of items) {
      if ((it.kind !== 'form' && it.kind !== 'bill') || (it.action !== 'received' && it.action !== 'not_received')) { skipped++; continue; }
      const res = this.sqlite.exec('SELECT * FROM logs WHERE id = ? AND deleted_at IS NULL', [it.logId]);
      if (!res.length || !res[0].values.length) { skipped++; continue; }
      const log = this.rowToLog(res[0].values[0], res[0].columns);
      const month = it.kind === 'bill' ? this.cleanMonth(it.month) : null;
      const receivedOn = it.kind === 'form' && typeof it.receivedOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(it.receivedOn) ? it.receivedOn : null;
      const currentlyReceived = it.kind === 'bill' ? (log.billMonths || []).includes(month as string) : Boolean(log.formReceivedAt);
      if (it.kind === 'bill') this.sqlite.run("DELETE FROM approvals WHERE log_id = ? AND kind = 'bill' AND status = 'pending' AND COALESCE(month, '') = ?", [it.logId, month]);
      else this.sqlite.run("DELETE FROM approvals WHERE log_id = ? AND kind = 'form' AND status = 'pending'", [it.logId]);
      if (currentlyReceived === (it.action === 'received')) { skipped++; continue; } // nothing to change
      if (user.role === 'admin') {
        this.applyMark(it.logId, it.kind, it.action, now, user.displayName, month ?? undefined, receivedOn ?? undefined);
        applied++;
      } else {
        this.sqlite.run(
          "INSERT INTO approvals (id, log_id, log_no, customer, kind, action, requested_by, requested_at, status, month, received_on) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)",
          [crypto.randomUUID(), it.logId, String(log.logNo ?? ''), String(log.customerName ?? ''), it.kind, it.action, user.displayName, now, month, receivedOn]
        );
        queued++;
      }
    }
    if (applied) this.notify('logs');
    this.notify('approvals');
    this.flush();
    return { applied, queued, skipped };
  }

  /** Administrator decision on pending requests (a list of ids, or every pending one). */
  decideApprovals(opts: { ids?: string[]; all?: boolean; approve: boolean }, user: AppUser): { approved: number; rejected: number } {
    const res = this.sqlite.exec("SELECT id, log_id, kind, action, requested_at, month, received_on FROM approvals WHERE status = 'pending'");
    const rows = res.length ? res[0].values : [];
    const want = opts.all ? null : new Set(opts.ids || []);
    const now = new Date().toISOString();
    let approved = 0, rejected = 0;
    for (const [id, logId, kind, action, requestedAt, month, receivedOn] of rows) {
      if (want && !want.has(String(id))) continue;
      if (opts.approve) {
        this.applyMark(String(logId), kind as MarkKind, action as MarkAction, String(requestedAt), user.displayName, month ? String(month) : undefined, receivedOn ? String(receivedOn) : undefined);
        this.sqlite.run("UPDATE approvals SET status = 'approved', decided_by = ?, decided_at = ? WHERE id = ?", [user.displayName, now, String(id)]);
        approved++;
      } else {
        this.sqlite.run("UPDATE approvals SET status = 'rejected', decided_by = ?, decided_at = ? WHERE id = ?", [user.displayName, now, String(id)]);
        rejected++;
      }
    }
    if (approved) {
      this.addActivity({ by: user.displayName, action: 'edited', detail: `${approved} form/bill request(s) approved` });
      this.notify('logs');
    }
    this.notify('approvals');
    this.flush();
    return { approved, rejected };
  }

  /** The person who asked (or an administrator) takes a pending request back. */
  withdrawApproval(id: string, user: AppUser): boolean {
    const res = this.sqlite.exec("SELECT requested_by FROM approvals WHERE id = ? AND status = 'pending'", [id]);
    if (!res.length || !res[0].values.length) return false;
    if (user.role !== 'admin' && String(res[0].values[0][0]) !== user.displayName) return false;
    this.sqlite.run('DELETE FROM approvals WHERE id = ?', [id]);
    this.notify('approvals');
    this.flush();
    return true;
  }

  saveBatchLogs(entries: LogEntry[], user: AppUser): LogEntry[] {
    let nextNo = this.getNextLogNo();
    const savedList: LogEntry[] = [];
    for (const entry of entries) {
      const logNo = entry.logNo || nextNo++;
      const saved = this.saveLog({ ...entry, logNo }, user);
      savedList.push(saved);
    }
    return savedList;
  }

  softDeleteLog(id: string, user: AppUser): boolean {
    const res = this.sqlite.exec('SELECT log_no, customer_name FROM logs WHERE id = ?', [id]);
    if (!res.length || !res[0].values.length) return false;
    const [logNo, customerName] = res[0].values[0];

    const now = new Date().toISOString();
    this.sqlite.run('UPDATE logs SET deleted_at = ?, deleted_by = ? WHERE id = ?', [now, user.displayName, id]);

    this.addActivity({
      by: user.displayName,
      action: 'deleted',
      logNo: Number(logNo),
      customer: String(customerName || ''),
    });

    this.notify('logs');
    return true;
  }

  softDeleteAllLogs(user: AppUser): number {
    const now = new Date().toISOString();
    const countRes = this.sqlite.exec('SELECT COUNT(*) FROM logs WHERE deleted_at IS NULL');
    const count = Number(countRes[0]?.values[0]?.[0] || 0);

    if (count > 0) {
      this.sqlite.run('UPDATE logs SET deleted_at = ?, deleted_by = ? WHERE deleted_at IS NULL', [now, user.displayName]);
      this.addActivity({
        by: user.displayName,
        action: 'cleared',
        detail: `All ${count} logs moved to admin bin`,
      });
      this.notify('logs');
    }
    return count;
  }

  restoreLogs(imported: LogEntry[], merge: boolean, user: AppUser): number {
    const now = new Date().toISOString();
    if (!merge) {
      this.sqlite.run('UPDATE logs SET deleted_at = ?, deleted_by = ? WHERE deleted_at IS NULL', [now, user.displayName]);
    }

    for (const item of imported) {
      const id = item.id || crypto.randomUUID();
      const logNo = Number(item.logNo || 1);
      const historyJson = Array.isArray(item.history) ? JSON.stringify(item.history) : '[]';

      this.sqlite.run(
        `INSERT OR REPLACE INTO logs (
          id, log_no, date, reseller_name, reseller_phone, request_type, customer_name,
          nms_id, issue_found, missing_wrong_details, action_taken, reason_for_action,
          reseller_informed, follow_up_needed, status, supervisor_informed, remarks, mac,
          edc_no, router_serial, form_received_at, reseller_id, follow_up_date,
          deleted_at, deleted_by, created_at, updated_at, created_by, updated_by, history
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, logNo, String(item.date || ''), String(item.resellerName || ''),
          String(item.resellerPhone || (item as any).callerPhone || ''), String(item.requestType || ''),
          String(item.customerName || ''), String(item.nmsId || ''),
          String(item.issueFound || ''), String(item.missingWrongDetails || ''),
          String(item.actionTaken || ''), String(item.reasonForAction || ''),
          String(item.resellerInformed || ''), String(item.followUpNeeded || ''),
          String(item.status || 'Resolved'), String(item.supervisorInformed || ''),
          String(item.remarks || ''), String(item.mac || ''), item.edcNo || null,
          item.routerSerial || null, item.formReceivedAt || null, item.resellerId || null,
          item.followUpDate || null, null, null,
          String(item.createdAt || now), String(item.updatedAt || now),
          item.createdBy || user.displayName, item.updatedBy || user.displayName,
          historyJson
        ]
      );
      this.writeExtras({ ...item, id });
      this.harvestSuggestions(item);
    }

    this.addActivity({
      by: user.displayName,
      action: 'restored',
      detail: `${imported.length} logs imported (${merge ? 'merged' : 'replaced'})`,
    });

    this.notify('logs');
    const cnt = this.sqlite.exec('SELECT COUNT(*) FROM logs WHERE deleted_at IS NULL');
    return Number(cnt[0]?.values[0]?.[0] || 0);
  }

  // -------------------------------------------------------------------------
  // Resellers
  // -------------------------------------------------------------------------
  getResellers(): Reseller[] {
    const res = this.sqlite.exec('SELECT id, name, area, phone, active, created_at, deleted_at, deleted_by FROM resellers WHERE deleted_at IS NULL ORDER BY name ASC');
    if (!res.length) return [];
    return res[0].values.map(([id, name, area, phone, active, createdAt, deletedAt, deletedBy]) => ({
      id: String(id),
      name: String(name),
      area: String(area || ''),
      phone: String(phone || ''),
      active: Number(active) === 1,
      createdAt: String(createdAt),
      deletedAt: deletedAt ? String(deletedAt) : undefined,
      deletedBy: deletedBy ? String(deletedBy) : undefined,
    }));
  }

  createReseller(input: { name: string; area?: string; phone?: string }, _user: AppUser): Reseller {
    const name = input.name.trim();
    if (!name) throw new Error('Reseller name is required.');
    const area = upazilaKey(input.area);
    if (!area) throw new Error('Please choose the reseller\'s upazila.');

    const check = this.sqlite.exec(
      'SELECT id, area FROM resellers WHERE lower(name) = ? AND deleted_at IS NULL',
      [name.toLowerCase()]
    );
    if (check.length && check[0].values.some((v) => upazilaKey(String(v[1] || '')) === area)) {
      throw new Error(`${name} already exists in ${area}.`);
    }

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const phone = (input.phone || '').trim();

    this.sqlite.run(
      'INSERT INTO resellers (id, name, area, phone, active, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, name, area, phone, 1, createdAt]
    );

    this.notify('resellers');
    return { id, name, area, phone, active: true, createdAt };
  }

  updateReseller(id: string, input: { name?: string; area?: string; phone?: string; active?: boolean }): Reseller {
    const cur = this.sqlite.exec('SELECT id, name, area, phone, active, created_at FROM resellers WHERE id = ?', [id]);
    if (!cur.length || !cur[0].values.length) throw new Error('Reseller not found.');

    const [, curName, curArea, curPhone, curActive, createdAt] = cur[0].values[0];
    const newName = input.name !== undefined ? input.name.trim() : String(curName);
    let newArea = String(curArea || '');
    if (input.area !== undefined) {
      const key = upazilaKey(input.area);
      if (!key) throw new Error('Please choose the reseller\'s upazila.');
      newArea = key;
    }
    const newPhone = input.phone !== undefined ? input.phone.trim() : String(curPhone || '');
    const newActive = input.active !== undefined ? (input.active ? 1 : 0) : Number(curActive);

    this.sqlite.run(
      'UPDATE resellers SET name = ?, area = ?, phone = ?, active = ? WHERE id = ?',
      [newName, newArea, newPhone, newActive, id]
    );

    this.notify('resellers');
    return { id, name: newName, area: newArea, phone: newPhone, active: newActive === 1, createdAt: String(createdAt) };
  }

  softDeleteReseller(id: string, user: AppUser): boolean {
    const now = new Date().toISOString();
    this.sqlite.run('UPDATE resellers SET deleted_at = ?, deleted_by = ? WHERE id = ?', [now, user.displayName, id]);
    this.notify('resellers');
    return true;
  }

  // -------------------------------------------------------------------------
  // Admin Bin
  // -------------------------------------------------------------------------
  getBin(): { logs: LogEntry[]; resellers: Reseller[] } {
    const logRes = this.sqlite.exec('SELECT * FROM logs WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC');
    const logs = logRes.length ? logRes[0].values.map(r => this.rowToLog(r)) : [];

    const resRes = this.sqlite.exec('SELECT id, name, area, phone, active, created_at, deleted_at, deleted_by FROM resellers WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC');
    const resellers = resRes.length ? resRes[0].values.map(([id, name, area, phone, active, createdAt, deletedAt, deletedBy]) => ({
      id: String(id),
      name: String(name),
      area: String(area || ''),
      phone: String(phone || ''),
      active: Number(active) === 1,
      createdAt: String(createdAt),
      deletedAt: deletedAt ? String(deletedAt) : undefined,
      deletedBy: deletedBy ? String(deletedBy) : undefined,
    })) : [];

    return { logs, resellers };
  }

  restoreBinLog(id: string): boolean {
    this.sqlite.run('UPDATE logs SET deleted_at = NULL, deleted_by = NULL WHERE id = ?', [id]);
    this.notify('logs');
    return true;
  }

  restoreBinReseller(id: string): boolean {
    this.sqlite.run('UPDATE resellers SET deleted_at = NULL, deleted_by = NULL WHERE id = ?', [id]);
    this.notify('resellers');
    return true;
  }

  purgeBinLog(id: string): boolean {
    this.sqlite.run('DELETE FROM logs WHERE id = ?', [id]);
    this.notify('logs');
    return true;
  }

  purgeBinReseller(id: string): boolean {
    this.sqlite.run('DELETE FROM resellers WHERE id = ?', [id]);
    this.notify('resellers');
    return true;
  }

  emptyBin(): number {
    const countLogs = Number(this.sqlite.exec('SELECT COUNT(*) FROM logs WHERE deleted_at IS NOT NULL')[0]?.values[0]?.[0] || 0);
    const countResellers = Number(this.sqlite.exec('SELECT COUNT(*) FROM resellers WHERE deleted_at IS NOT NULL')[0]?.values[0]?.[0] || 0);

    this.sqlite.run('DELETE FROM logs WHERE deleted_at IS NOT NULL');
    this.sqlite.run('DELETE FROM resellers WHERE deleted_at IS NOT NULL');

    this.notify('logs');
    this.notify('resellers');
    return countLogs + countResellers;
  }

  // -------------------------------------------------------------------------
  // Suggestions
  // -------------------------------------------------------------------------
  getSuggestions(): FieldSuggestionsMap {
    const res = this.sqlite.exec('SELECT field, values_json FROM suggestions');
    const map: FieldSuggestionsMap = { ...INITIAL_SUGGESTIONS };
    if (res.length) {
      for (const [field, valuesJson] of res[0].values) {
        try {
          const parsed = JSON.parse(String(valuesJson));
          if (Array.isArray(parsed)) {
            map[field as LogFieldKey] = parsed;
          }
        } catch {
          /* ignore */
        }
      }
    }
    // Legacy: the old "callerPhone" suggestions now belong to reseller phone
    const legacy = (map as Record<string, string[]>)['callerPhone'];
    if (legacy) {
      const merged = [...(map.resellerPhone || [])];
      for (const v of legacy) if (!merged.includes(v)) merged.push(v);
      map.resellerPhone = merged;
      delete (map as Record<string, string[]>)['callerPhone'];
    }
    return map;
  }

  saveSuggestions(suggestions: FieldSuggestionsMap) {
    for (const [field, values] of Object.entries(suggestions)) {
      this.sqlite.run('INSERT OR REPLACE INTO suggestions (field, values_json) VALUES (?, ?)', [
        field,
        JSON.stringify(values),
      ]);
    }
    this.notify('suggestions');
  }

  harvestSuggestions(entry: Partial<LogEntry>): FieldSuggestionsMap {
    const current = this.getSuggestions();
    const keys: LogFieldKey[] = [
      'resellerName', 'resellerPhone', 'requestType', 'customerName', 'nmsId',
      'issueFound', 'missingWrongDetails', 'actionTaken', 'reasonForAction',
      'resellerInformed', 'followUpNeeded', 'status', 'supervisorInformed',
      'remarks', 'mac'
    ];

    let changed = false;
    for (const key of keys) {
      const val = String(entry[key] || '').trim();
      if (!val) continue;
      const existing = current[key] || [];
      if (!existing.some(x => x.toLowerCase() === val.toLowerCase())) {
        current[key] = [val, ...existing];
        this.sqlite.run('INSERT OR REPLACE INTO suggestions (field, values_json) VALUES (?, ?)', [
          key,
          JSON.stringify(current[key]),
        ]);
        changed = true;
      }
    }

    if (changed) {
      this.notify('suggestions');
    }
    return current;
  }

  // -------------------------------------------------------------------------
  // Activity
  // -------------------------------------------------------------------------
  getActivity(): ActivityEvent[] {
    const res = this.sqlite.exec('SELECT id, at, by_user, action, log_no, customer, detail FROM activity ORDER BY at DESC LIMIT 200');
    if (!res.length) return [];
    return res[0].values.map(([id, at, by, action, logNo, customer, detail]) => ({
      id: String(id),
      at: String(at),
      by: String(by),
      action: action as any,
      logNo: logNo ? String(logNo) : undefined,
      customer: customer ? String(customer) : undefined,
      detail: detail ? String(detail) : undefined,
    }));
  }

  addActivity(event: Omit<ActivityEvent, 'id' | 'at'>) {
    const id = crypto.randomUUID();
    const at = new Date().toISOString();
    this.sqlite.run(
      'INSERT INTO activity (id, at, by_user, action, log_no, customer, detail) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, at, event.by, event.action, event.logNo ? String(event.logNo) : null, event.customer || null, event.detail || null]
    );
    this.notify('activity', { id, at, ...event });
  }

  seedAllResellers() {
    const list: { name: string; area: string; phone: string }[] = [
      { name: 'Salam', area: 'Bishwanath', phone: '+880 1712-238545' },
      { name: 'Shuhag', area: 'Beanibazar', phone: '+880 1805-983971' },
      { name: 'Shabul', area: 'Balaganj', phone: '+880 1680-945894' },
      { name: 'Jubayer', area: 'Dakshin Surma', phone: '+880 1748-075240' },
      { name: 'Joshim', area: 'Sylhet Sadar', phone: '+880 1713-476562' },
      { name: 'Jamal', area: 'Zakiganj', phone: '+880 1745-963663' },
      { name: 'Munna', area: 'Sylhet Sadar', phone: '+880 1713-476556' },
      { name: 'Liton', area: 'Sylhet Sadar', phone: '' },
      { name: 'Sultan', area: 'Zakiganj', phone: '' },
      { name: 'Jakir', area: 'Beanibazar', phone: '' },
      { name: 'Javed', area: 'Beanibazar', phone: '' },
      { name: 'Al-amin', area: 'Golapganj', phone: '' },
      { name: 'Mrinal', area: 'Sylhet Sadar', phone: '' },
      { name: 'Kawsar', area: 'Zakiganj', phone: '' },
      { name: 'Monir', area: 'Zakiganj', phone: '' },
      { name: 'Masud', area: 'Beanibazar', phone: '' },
      { name: 'Kuddus', area: 'Beanibazar', phone: '' },
      { name: 'Iqbal', area: 'Beanibazar', phone: '' },
      { name: 'Kalam', area: 'Sylhet Sadar', phone: '' },
      { name: 'Shahel', area: 'Dakshin Surma', phone: '' },
      { name: 'Evan', area: 'Sylhet Sadar', phone: '' },
      { name: 'Khairul', area: 'Jaintiapur', phone: '' },
      { name: 'Nahim', area: 'Kanaighat', phone: '' },
      { name: 'Rubel', area: 'Osmani Nagar', phone: '' },
      { name: 'Rupok', area: 'Zakiganj', phone: '' },
      { name: 'Washim', area: 'Dakshin Surma', phone: '' },
      { name: 'Kashem', area: 'Beanibazar', phone: '' },
      { name: 'Razon', area: 'Sylhet Sadar', phone: '' },
      { name: 'Raton', area: 'Fenchuganj', phone: '' },
      { name: 'Raihan', area: 'Companiganj', phone: '' },
      { name: 'Faisal', area: 'Zakiganj', phone: '' },
      { name: 'Mustaiem', area: 'Golapganj', phone: '' },
      { name: 'Joinal', area: 'Golapganj', phone: '' },
      { name: 'Syed', area: 'Beanibazar', phone: '' },
      { name: 'Faruk', area: 'Fenchuganj', phone: '' },
      { name: 'Anowar', area: 'Zakiganj', phone: '' },
      { name: 'Mursalin', area: 'Fenchuganj', phone: '' },
      { name: 'Sohag-Ahmed', area: 'Beanibazar', phone: '' },
      { name: 'Hassan', area: 'Gowainghat', phone: '' },
      { name: 'Uzzal', area: 'Beanibazar', phone: '' },
      { name: 'Shahab', area: 'Beanibazar', phone: '' },
      { name: 'Nojmul', area: 'Beanibazar', phone: '' },
      { name: 'Zia', area: 'Beanibazar', phone: '' },
      { name: 'Monjur', area: 'Kanaighat', phone: '' },
      { name: 'Ruhel', area: 'Dakshin Surma', phone: '' },
    ];

    const now = new Date().toISOString();
    let addedCount = 0;
    for (const item of list) {
      const area = upazilaKey(item.area) || item.area;
      const check = this.sqlite.exec('SELECT id, area, phone FROM resellers WHERE lower(name) = ?', [item.name.toLowerCase()]);
      if (check.length && check[0].values.length) {
        const [id, exArea, exPhone] = check[0].values[0];
        const newArea = exArea ? String(exArea) : area;
        const newPhone = exPhone ? String(exPhone) : item.phone;
        this.sqlite.run('UPDATE resellers SET area = ?, phone = ? WHERE id = ?', [newArea, newPhone, id]);
      } else {
        const id = crypto.randomUUID();
        this.sqlite.run(
          'INSERT INTO resellers (id, name, area, phone, active, created_at) VALUES (?, ?, ?, ?, 1, ?)',
          [id, item.name, area, item.phone || '', now]
        );
        addedCount++;
      }
    }
    if (addedCount > 0) {
      console.log(`[Pace IT] Seeded ${addedCount} new resellers into database.`);
    }
  }
}

export const db = new SQLiteDatabase();

// Never lose the last few changes when the server is stopped (Ctrl+C, service stop, window closed).
let shuttingDown = false;
const shutdown = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    db.flush();
  } finally {
    process.exit(0);
  }
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGBREAK', shutdown);
process.on('SIGHUP', shutdown); // console window closed
process.on('exit', () => {
  try {
    db.flush();
  } catch {
    /* nothing more to do */
  }
});
