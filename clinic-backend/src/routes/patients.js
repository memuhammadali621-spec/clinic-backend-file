const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { logActivity } = require('../utils/logActivity');

const router = express.Router();
router.use(requireAuth);

function nextPatientCode(clinicId) {
  const rows = db.prepare(`SELECT code FROM patients WHERE clinic_id = ?`).all(clinicId);
  const max = rows.reduce((m, r) => Math.max(m, parseInt(String(r.code).replace(/\D/g, ''), 10) || 0), 0);
  return 'PT-' + String(max + 1).padStart(4, '0');
}

router.get('/', (req, res) => {
  const q = (req.query.q || '').trim();
  let rows;
  if (q) {
    const like = `%${q}%`;
    rows = db.prepare(
      `SELECT * FROM patients WHERE clinic_id = ? AND (name LIKE ? OR contact LIKE ? OR code LIKE ?) ORDER BY created_at DESC`
    ).all(req.user.clinicId, like, like, like);
  } else {
    rows = db.prepare(`SELECT * FROM patients WHERE clinic_id = ? ORDER BY created_at DESC`).all(req.user.clinicId);
  }
  res.json(rows);
});

router.post('/', (req, res) => {
  const { name, contact, age, gender, cnic, address, emergencyContact, allergies } = req.body || {};
  if (!name || !contact) return res.status(400).json({ error: 'name and contact are required' });

  const id = uuid();
  const code = nextPatientCode(req.user.clinicId);
  db.prepare(`
    INSERT INTO patients (id, clinic_id, code, name, age, gender, contact, cnic, address, emergency_contact, allergies)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(id, req.user.clinicId, code, name, age || null, gender || null, contact, cnic || null, address || null, emergencyContact || null, allergies || null);

  logActivity(req.user.clinicId, req.user.username, req.user.role, 'Registered patient', `${code} — ${name}`);
  res.status(201).json({ id, code, name, contact });
});

router.delete('/:id', (req, res) => {
  const patient = db.prepare(`SELECT * FROM patients WHERE id = ? AND clinic_id = ?`).get(req.params.id, req.user.clinicId);
  if (!patient) return res.status(404).json({ error: 'Not found' });
  db.prepare(`DELETE FROM patients WHERE id = ?`).run(patient.id);
  logActivity(req.user.clinicId, req.user.username, req.user.role, 'Deleted patient', `${patient.code} — ${patient.name}`);
  res.json({ ok: true });
});

module.exports = router;
