const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const DEFAULTS = [
  ['Consultation Fee', 1500],
  ['Sugar & Diabetes Checkup', 800],
  ['Blood Pressure Check', 500],
  ['Chronic Pain Relief Session', 2000],
  ['Stress & Anxiety Counseling', 2500],
  ['Family Healthcare Checkup', 1500],
  ['Weight & Nutrition Consultation', 2000],
  ['Elderly Complex Care', 3000],
  ['Cholesterol Control Test', 1200],
];

/** Seed a clinic's price list with sensible defaults the first time it's opened. */
function ensureSeeded(clinicId) {
  const count = db.prepare(`SELECT COUNT(*) c FROM services WHERE clinic_id = ?`).get(clinicId).c;
  if (count > 0) return;
  const insert = db.prepare(`INSERT INTO services (id, clinic_id, name, price) VALUES (?,?,?,?)`);
  const tx = db.transaction(() => {
    for (const [name, price] of DEFAULTS) insert.run(uuid(), clinicId, name, price);
  });
  tx();
}

router.get('/', (req, res) => {
  ensureSeeded(req.user.clinicId);
  const rows = db.prepare(`SELECT * FROM services WHERE clinic_id = ? AND active = 1 ORDER BY name`).all(req.user.clinicId);
  res.json(rows);
});

router.post('/', (req, res) => {
  const { name, price } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });
  const id = uuid();
  db.prepare(`INSERT INTO services (id, clinic_id, name, price) VALUES (?,?,?,?)`)
    .run(id, req.user.clinicId, name, Number(price) || 0);
  res.status(201).json({ id, name, price: Number(price) || 0 });
});

router.put('/:id', (req, res) => {
  const { name, price } = req.body || {};
  const row = db.prepare(`SELECT * FROM services WHERE id = ? AND clinic_id = ?`).get(req.params.id, req.user.clinicId);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare(`UPDATE services SET name = ?, price = ? WHERE id = ?`)
    .run(name ?? row.name, price != null ? Number(price) : row.price, row.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const row = db.prepare(`SELECT * FROM services WHERE id = ? AND clinic_id = ?`).get(req.params.id, req.user.clinicId);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare(`UPDATE services SET active = 0 WHERE id = ?`).run(row.id); // soft delete so old bills still read correctly
  res.json({ ok: true });
});

module.exports = router;
