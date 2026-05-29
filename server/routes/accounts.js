const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

router.get('/', (req, res) => {
  try {
    const db = getDb();
    const accounts = db.prepare(`
      SELECT a.*,
        (SELECT COUNT(*) FROM contacts c WHERE c.account_id = a.id) as contact_count,
        (SELECT COUNT(*) FROM deals d WHERE d.account_id = a.id) as deal_count
      FROM accounts a ORDER BY a.name
    `).all();
    for (const acc of accounts) {
     acc.markets = db.prepare(`
  SELECT DISTINCT dm.market FROM deal_markets dm
  JOIN deals d ON d.id = dm.deal_id WHERE d.account_id = ?
`).all(acc.id).map(r => r.market).join(', ');
      acc.owners = db.prepare(`
        SELECT DISTINCT u.id, u.name, u.color FROM users u
        JOIN deals d ON d.responsible = u.id WHERE d.account_id = ?
      `).all(acc.id);
    }
    res.json(accounts);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
    if (!account) return res.status(404).json({ error: 'Not found' });
    account.contacts = db.prepare('SELECT * FROM contacts WHERE account_id = ?').all(account.id);
    account.deals = db.prepare('SELECT * FROM deals WHERE account_id = ?').all(account.id).map(deal => ({
  ...deal,
  markets: db.prepare('SELECT market FROM deal_markets WHERE deal_id = ?').all(deal.id).map(m => m.market).join(', ')
}));
    res.json(account);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', (req, res) => {
  try {
    const db = getDb();
    const { name, website, contacts = [] } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const result = db.prepare('INSERT INTO accounts (name, website) VALUES (?, ?)').run(name, website || null);
    const accountId = result.lastInsertRowid;
    for (const c of contacts) {
      if (c.name) db.prepare('INSERT INTO contacts (account_id, name, role, email) VALUES (?, ?, ?, ?)').run(accountId, c.name, c.role || null, c.email || null);
    }
    res.json(db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const { name, website, contacts = [] } = req.body;
    db.prepare('UPDATE accounts SET name = ?, website = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(name, website || null, req.params.id);
    db.prepare('DELETE FROM contacts WHERE account_id = ?').run(req.params.id);
    for (const c of contacts) {
      if (c.name) db.prepare('INSERT INTO contacts (account_id, name, role, email) VALUES (?, ?, ?, ?)').run(req.params.id, c.name, c.role || null, c.email || null);
    }
    res.json(db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
