const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'none',
  secure: true,
  maxAge: 7 * 24 * 60 * 60 * 1000
};

router.get('/users', (req, res) => {
  try {
    const users = getDb().prepare('SELECT id, name, email, role, color FROM users ORDER BY name').all();
    res.json(users);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/login', (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const user = getDb().prepare('SELECT id, name, email, role, color FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    req.session.userId = user.id;
    res.cookie('samecrm_uid', String(user.id), COOKIE_OPTS);
    req.session.save(() => res.json({ user }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/me', (req, res) => {
  try {
    const userId = req.session.userId || req.cookies?.samecrm_uid || req.headers['x-user-id'];
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const user = getDb().prepare('SELECT id, name, email, role, color FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    res.cookie('samecrm_uid', String(user.id), COOKIE_OPTS);
    res.json(user);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/logout', (req, res) => {
  res.clearCookie('samecrm_uid', { sameSite: 'none', secure: true });
  req.session.destroy(() => res.json({ ok: true }));
});

module.exports = router;
