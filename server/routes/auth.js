const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

router.get('/users', (req, res) => {
  try {
    const db = getDb();
    const users = db.prepare('SELECT id, name, email, role, color FROM users ORDER BY name').all();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/login', (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const db = getDb();
    const user = db.prepare('SELECT id, name, email, role, color FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    req.session.userId = user.id;
    req.session.save(() => {
      res.json({ user });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/me', (req, res) => {
  try {
    const userId = req.session.userId || req.headers['x-user-id'];
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const db = getDb();
    const user = db.prepare('SELECT id, name, email, role, color FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

module.exports = router;
