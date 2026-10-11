const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { requireAuth, requireAdmin, signToken } = require('../middleware/auth');
const { logActivity } = require('../utils/logActivity');

const router = express.Router();

/**
 * Register a brand new clinic (a new paying customer) + its first admin account.
 * This is the "sell it to another clinic" entry point: each clinic gets its
 * own isolated data (patients, bills, staff) scoped by clinic_id.
 */
router.post('/register-clinic', (req, res) => {
  const { clinicName, doctorName, address, phone, adminUsername, adminPassword } = req.body || {};
  if (!clinicName || !adminUsername || !adminPassword) {
    return res.status(400).json({ error: 'clinicName, adminUsername and adminPassword are required' });
  }
  if (String(adminPassword).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const clinicId = uuid();
  const userId = uuid();
  const passwordHash = bcrypt.hashSync(adminPassword, 10);

  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO clinics (id, name, doctor_name, address, phone) VALUES (?,?,?,?,?)`)
      .run(clinicId, clinicName, doctorName || null, address || null, phone || null);
    db.prepare(`INSERT INTO users (id, clinic_id, username, password_hash, role) VALUES (?,?,?,?,'admin')`)
      .run(userId, clinicId, adminUsername, passwordHash);
  });
  tx();

  const token = signToken({ userId, clinicId, username: adminUsername, role: 'admin' });
  logActivity(clinicId, adminUsername, 'admin', 'Clinic registered', clinicName);
  res.status(201).json({ token, clinic: { id: clinicId, name: clinicName }, user: { username: adminUsername, role: 'admin' } });
});

/** Public: tells the app whether this server already has a clinic set up. */
router.get('/status', (req, res) => {
  const rows = db.prepare('SELECT id, name FROM clinics').all();
  res.json({ hasClinic: rows.length > 0, clinicCount: rows.length, clinicName: rows.length === 1 ? rows[0].name : null });
});

/** Staff/admin login. clinicId is optional when the server has exactly one clinic. */
router.post('/login', (req, res) => {
  let { clinicId, username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
  if (!clinicId) {
    const rows = db.prepare('SELECT id FROM clinics').all();
    if (rows.length === 1) clinicId = rows[0].id;
    else return res.status(400).json({ error: 'Clinic ID is required on this server' });
  }
  const user = db.prepare(`SELECT * FROM users WHERE clinic_id = ? AND lower(username) = lower(?)`)
    .get(clinicId, username);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    logActivity(clinicId, username, '—', 'Failed sign-in attempt', '');
    return res.status(401).json({ error: 'Wrong username or password' });
  }

  const token = signToken({ userId: user.id, clinicId: user.clinic_id, username: user.username, role: user.role });
  logActivity(clinicId, user.username, user.role, 'Signed in', '');
  res.json({ token, user: { username: user.username, role: user.role } });
});

/** Change the signed-in user's own password. */
router.post('/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ? AND clinic_id = ?').get(req.user.userId, req.user.clinicId);
  if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, 10), user.id);
  logActivity(req.user.clinicId, req.user.username, req.user.role, 'Changed password', '');
  res.json({ ok: true });
});

/** List staff accounts for the signed-in clinic (admin only). */
router.get('/accounts', requireAuth, requireAdmin, (req, res) => {
  const rows = db.prepare(`SELECT id, username, role, created_at FROM users WHERE clinic_id = ? ORDER BY created_at`)
    .all(req.user.clinicId);
  res.json(rows);
});

/** Add a staff/admin account (admin only). */
router.post('/accounts', requireAuth, requireAdmin, (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password || !['staff', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'username, password and role (staff|admin) are required' });
  }
  const exists = db.prepare(`SELECT 1 FROM users WHERE clinic_id = ? AND lower(username) = lower(?)`)
    .get(req.user.clinicId, username);
  if (exists) return res.status(409).json({ error: 'Username already exists' });

  const id = uuid();
  db.prepare(`INSERT INTO users (id, clinic_id, username, password_hash, role) VALUES (?,?,?,?,?)`)
    .run(id, req.user.clinicId, username, bcrypt.hashSync(password, 10), role);
  logActivity(req.user.clinicId, req.user.username, req.user.role, 'Added account', `${username} (${role})`);
  res.status(201).json({ id, username, role });
});

/** Remove a staff account (admin only; can't remove the last admin). */
router.delete('/accounts/:id', requireAuth, requireAdmin, (req, res) => {
  const target = db.prepare(`SELECT * FROM users WHERE id = ? AND clinic_id = ?`).get(req.params.id, req.user.clinicId);
  if (!target) return res.status(404).json({ error: 'Account not found' });

  if (target.role === 'admin') {
    const adminCount = db.prepare(`SELECT COUNT(*) c FROM users WHERE clinic_id = ? AND role = 'admin'`)
      .get(req.user.clinicId).c;
    if (adminCount <= 1) return res.status(400).json({ error: 'At least one admin account must remain' });
  }

  db.prepare(`DELETE FROM users WHERE id = ?`).run(target.id);
  logActivity(req.user.clinicId, req.user.username, req.user.role, 'Removed account', target.username);
  res.json({ ok: true });
});

module.exports = router;
