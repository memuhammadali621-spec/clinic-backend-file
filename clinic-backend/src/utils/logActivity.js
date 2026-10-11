const { v4: uuid } = require('uuid');
const db = require('../db');

function logActivity(clinicId, username, role, action, details) {
  try {
    db.prepare(
      `INSERT INTO activity_log (id, clinic_id, username, role, action, details) VALUES (?,?,?,?,?,?)`
    ).run(uuid(), clinicId, username || 'unknown', role || '—', action, details || '');
  } catch (e) {
    // Logging must never break the main request (e.g. an unknown clinicId on a failed login attempt).
    console.error('activity log failed:', e.message);
  }
}

module.exports = { logActivity };
