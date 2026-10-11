const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { logActivity } = require('../utils/logActivity');

const router = express.Router();
router.use(requireAuth);

function nextInvoiceNo(clinicId) {
  const row = db.prepare(`SELECT MAX(invoice_no) m FROM bills WHERE clinic_id = ?`).get(clinicId);
  return (row.m || 0) + 1;
}

/** List / search bills: ?q=invoice number, patient name or contact */
router.get('/', (req, res) => {
  const q = (req.query.q || '').trim();
  let rows;
  if (q) {
    const like = `%${q}%`;
    const asNum = q.replace('#', '');
    rows = db.prepare(`
      SELECT * FROM bills
      WHERE clinic_id = ? AND (CAST(invoice_no AS TEXT) LIKE ? OR patient_name LIKE ? OR patient_contact LIKE ?)
      ORDER BY created_at DESC LIMIT 2000
    `).all(req.user.clinicId, `%${asNum}%`, like, like);
  } else {
    rows = db.prepare(`SELECT * FROM bills WHERE clinic_id = ? ORDER BY created_at DESC LIMIT 2000`).all(req.user.clinicId);
  }
  res.json(rows.map(r => ({ ...r, items: JSON.parse(r.items_json) })));
});

/** Fetch one bill by invoice number — the "find by bill number" feature. */
router.get('/by-invoice/:invoiceNo', (req, res) => {
  const row = db.prepare(`SELECT * FROM bills WHERE clinic_id = ? AND invoice_no = ?`)
    .get(req.user.clinicId, Number(req.params.invoiceNo));
  if (!row) return res.status(404).json({ error: 'Invoice not found' });
  res.json({ ...row, items: JSON.parse(row.items_json) });
});

router.post('/', (req, res) => {
  const { patientId, patientName, patientAge, patientGender, patientContact, billDate, items, discount, status, notes, nextVisit } = req.body || {};
  if (!patientName) return res.status(400).json({ error: 'patientName is required' });
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'At least one item is required' });

  const subtotal = items.reduce((s, it) => s + Number(it.price) * Number(it.qty), 0);
  const disc = Math.max(0, Number(discount) || 0);
  const total = Math.max(0, subtotal - disc);
  const invoiceNo = nextInvoiceNo(req.user.clinicId);
  const id = uuid();

  db.prepare(`
    INSERT INTO bills (id, clinic_id, invoice_no, patient_id, patient_name, patient_age, patient_gender, patient_contact,
      bill_date, items_json, subtotal, discount, total, status, notes, next_visit, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(id, req.user.clinicId, invoiceNo, patientId || null, patientName, patientAge || null, patientGender || null,
    patientContact || null, billDate || new Date().toISOString().slice(0,10), JSON.stringify(items),
    subtotal, disc, total, status || 'Paid', notes || null, nextVisit || null, req.user.username);

  logActivity(req.user.clinicId, req.user.username, req.user.role, 'Saved bill', `Invoice #${invoiceNo} — ${patientName} — ${total}`);
  res.status(201).json({ id, invoiceNo, subtotal, discount: disc, total });
});

router.delete('/:id', requireAuth, (req, res) => {
  const bill = db.prepare(`SELECT * FROM bills WHERE id = ? AND clinic_id = ?`).get(req.params.id, req.user.clinicId);
  if (!bill) return res.status(404).json({ error: 'Not found' });
  if (req.user.role !== 'admin' && req.user.username !== bill.created_by) {
    return res.status(403).json({ error: 'Only an admin or the staff member who created this bill can delete it' });
  }
  db.prepare(`DELETE FROM bills WHERE id = ?`).run(bill.id);
  logActivity(req.user.clinicId, req.user.username, req.user.role, 'Deleted bill', `Invoice #${bill.invoice_no} — ${bill.patient_name}`);
  res.json({ ok: true });
});

module.exports = router;
