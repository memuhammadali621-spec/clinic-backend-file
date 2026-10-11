const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

/** GET /api/reports/revenue?from=YYYY-MM-DD&to=YYYY-MM-DD */
router.get('/revenue', (req, res) => {
  const { from, to } = req.query;
  let sql = `SELECT * FROM bills WHERE clinic_id = ?`;
  const params = [req.user.clinicId];
  if (from) { sql += ` AND bill_date >= ?`; params.push(from); }
  if (to) { sql += ` AND bill_date <= ?`; params.push(to); }
  const rows = db.prepare(sql).all(...params);

  const totalRevenue = rows.reduce((s, b) => s + b.total, 0);
  const totalDiscount = rows.reduce((s, b) => s + b.discount, 0);
  const unpaid = rows.filter(b => b.status !== 'Paid').reduce((s, b) => s + b.total, 0);

  const svcMap = {};
  rows.forEach(b => {
    JSON.parse(b.items_json).forEach(it => {
      if (!svcMap[it.name]) svcMap[it.name] = { qty: 0, amount: 0 };
      svcMap[it.name].qty += Number(it.qty);
      svcMap[it.name].amount += Number(it.qty) * Number(it.price);
    });
  });

  res.json({
    billCount: rows.length,
    totalRevenue,
    totalDiscount,
    unpaid,
    byService: Object.entries(svcMap).map(([name, v]) => ({ name, ...v })).sort((a,b)=>b.amount-a.amount)
  });
});

/** GET /api/reports/activity — admin only, the "see all staff activity" dashboard feed */
router.get('/activity', requireAuth, requireAdmin, (req, res) => {
  const rows = db.prepare(`SELECT * FROM activity_log WHERE clinic_id = ? ORDER BY created_at DESC LIMIT 300`)
    .all(req.user.clinicId);
  res.json(rows);
});

/** POST /api/reports/log — lets the app record actions like printing or sharing a bill */
router.post('/log', (req, res) => {
  const { logActivity } = require('../utils/logActivity');
  const { action, details } = req.body || {};
  if (!action) return res.status(400).json({ error: 'action is required' });
  logActivity(req.user.clinicId, req.user.username, req.user.role, String(action).slice(0, 80), String(details || '').slice(0, 300));
  res.json({ ok: true });
});

module.exports = router;
