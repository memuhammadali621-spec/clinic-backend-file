const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'clinic.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  -- One row per paying customer (clinic). Everything else is scoped to clinic_id.
  CREATE TABLE IF NOT EXISTS clinics (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    doctor_name TEXT,
    address TEXT,
    phone TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin','staff')),
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(clinic_id, username)
  );

  CREATE TABLE IF NOT EXISTS services (
    id TEXT PRIMARY KEY,
    clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price REAL NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS patients (
    id TEXT PRIMARY KEY,
    clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    age INTEGER,
    gender TEXT,
    contact TEXT,
    cnic TEXT,
    address TEXT,
    emergency_contact TEXT,
    allergies TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(clinic_id, code)
  );

  CREATE TABLE IF NOT EXISTS bills (
    id TEXT PRIMARY KEY,
    clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    invoice_no INTEGER NOT NULL,
    patient_id TEXT REFERENCES patients(id) ON DELETE SET NULL,
    patient_name TEXT NOT NULL,
    patient_age INTEGER,
    patient_gender TEXT,
    patient_contact TEXT,
    bill_date TEXT NOT NULL,
    items_json TEXT NOT NULL,
    subtotal REAL NOT NULL,
    discount REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'Paid',
    notes TEXT,
    next_visit TEXT,
    created_by TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(clinic_id, invoice_no)
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id TEXT PRIMARY KEY,
    clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    username TEXT,
    role TEXT,
    action TEXT NOT NULL,
    details TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_patients_clinic ON patients(clinic_id);
  CREATE INDEX IF NOT EXISTS idx_bills_clinic ON bills(clinic_id);
  CREATE INDEX IF NOT EXISTS idx_bills_date ON bills(clinic_id, bill_date);
  CREATE INDEX IF NOT EXISTS idx_log_clinic ON activity_log(clinic_id);
`);

try { db.exec('ALTER TABLE bills ADD COLUMN next_visit TEXT'); } catch (e) { /* column already exists */ }

module.exports = db;
