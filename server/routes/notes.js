const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { account_id } = req.query;

    let query = `
      SELECT n.*, u.name AS author_name, u.color AS author_color, a.name AS account_name
      FROM notes n
      JOIN users u ON u.id = n.author
      JOIN accounts a ON a.id = n.account_id
      WHERE 1=1
    `;
    const params = [];

    if (account_id) {
      query += ' AND n.account_id = ?';
      params.push(account_id);
    }

    query += ' ORDER BY n.date DESC, n.id DESC';
    const notes = db.prepare(query).all(...params);

    res.json(notes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const db = getDb();
    const { account_id, author, text, date } = req.body;

    if (!account_id || !author || !text) {
      return res.status(400).json({ error: 'account_id, author, and text are required' });
    }

    const result = db.prepare('INSERT INTO notes (account_id, author, text, date) VALUES (?, ?, ?, ?)').run(
      account_id,
      author,
      text,
      date || new Date().toISOString().split('T')[0]
    );

    const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(note);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM notes WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
