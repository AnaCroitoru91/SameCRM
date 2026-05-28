const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

router.get('/', (req, res) => {
  try {
    const db = getDb();
    const users = db.prepare('SELECT id, name, email, role, color, created_at FROM users ORDER BY name').all();
    res.json(users);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
