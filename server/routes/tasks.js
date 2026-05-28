const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { responsible, done } = req.query;
    let query = `SELECT t.*, u.name AS responsible_name, u.color AS responsible_color,
      a.name AS account_name FROM tasks t
      JOIN users u ON u.id = t.responsible
      LEFT JOIN accounts a ON a.id = t.account_id WHERE 1=1`;
    const params = [];
    if (responsible !== undefined) { query += ' AND t.responsible = ?'; params.push(responsible); }
    if (done !== undefined) { query += ' AND t.done = ?'; params.push(done === '1' ? 1 : 0); }
    query += ' ORDER BY t.due_date ASC, t.priority DESC';
    res.json(db.prepare(query).all(...params));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', (req, res) => {
  try {
    const db = getDb();
    const { account_id, title, responsible, due_date, priority } = req.body;
    if (!title || !responsible) return res.status(400).json({ error: 'title and responsible required' });
    const result = db.prepare('INSERT INTO tasks (account_id, title, responsible, due_date, priority) VALUES (?, ?, ?, ?, ?)').run(account_id || null, title, responsible, due_date || null, priority || 'Medium');
    res.status(201).json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const { title, responsible, due_date, priority, done, account_id } = req.body;
    db.prepare(`UPDATE tasks SET
      title = COALESCE(?, title), responsible = COALESCE(?, responsible),
      due_date = COALESCE(?, due_date), priority = COALESCE(?, priority),
      done = COALESCE(?, done), account_id = COALESCE(?, account_id) WHERE id = ?`
    ).run(title || null, responsible || null, due_date || null, priority || null,
      done !== undefined ? (done ? 1 : 0) : null,
      account_id !== undefined ? account_id : null, req.params.id);
    res.json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
