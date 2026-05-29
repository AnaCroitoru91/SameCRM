const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

const FOLLOWUP_DAYS = {
  'Sent Offer': 7, 'Follow-up Call': 30, 'Sent Contract': 3,
  'Meeting Held': 7, 'No Response': 14, 'Negotiation Round': 5,
  'Intro Email': 7, 'Other': 7,
};

router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { responsible, market, stage } = req.query;
    let query = `SELECT d.*, a.name AS account_name, u.name AS responsible_name, u.color AS responsible_color
      FROM deals d JOIN accounts a ON a.id = d.account_id JOIN users u ON u.id = d.responsible WHERE 1=1`;
    const params = [];
    if (responsible) { query += ' AND d.responsible = ?'; params.push(responsible); }
    const deals = db.prepare(query).all(...params);
    const getDealMarkets = db.prepare('SELECT * FROM deal_markets WHERE deal_id = ?');
    let enriched = deals.map(d => ({
  ...d,
  markets: getDealMarkets.all(d.id).map(m => `${m.market} (${m.stage})`).join(', ')
}));
    if (market || stage) {
      enriched = enriched.filter(d => d.markets.some(m => (!market || m.market === market) && (!stage || m.stage === stage)));
    }
    res.json(enriched);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', (req, res) => {
  try {
    const db = getDb();
    const { account_id, responsible, type_of_goods, competition, markets = [] } = req.body;
    if (!account_id || !responsible) return res.status(400).json({ error: 'account_id and responsible required' });
    const tx = db.transaction(() => {
      const dealId = db.prepare('INSERT INTO deals (account_id, responsible, type_of_goods, competition) VALUES (?, ?, ?, ?)').run(account_id, responsible, type_of_goods || null, competition || null).lastInsertRowid;
      for (const m of markets) {
        db.prepare('INSERT INTO deal_markets (deal_id, market, stage, est_volume, est_sameday_volume) VALUES (?, ?, ?, ?, ?)').run(dealId, m.market, m.stage || 'Lead', m.est_volume || 0, m.est_sameday_volume || 0);
      }
      return db.prepare('SELECT d.*, a.name AS account_name, u.name AS responsible_name, u.color AS responsible_color FROM deals d JOIN accounts a ON a.id = d.account_id JOIN users u ON u.id = d.responsible WHERE d.id = ?').get(dealId);
    });
    res.status(201).json(tx());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const { responsible, type_of_goods, competition } = req.body;
    db.prepare('UPDATE deals SET responsible = COALESCE(?, responsible), type_of_goods = COALESCE(?, type_of_goods), competition = COALESCE(?, competition), updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(responsible || null, type_of_goods || null, competition || null, req.params.id);
    res.json(db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id/markets/:marketId', (req, res) => {
  try {
    const db = getDb();
    const { stage, last_action, go_live_date, est_volume, est_sameday_volume } = req.body;
    db.prepare('UPDATE deal_markets SET stage = COALESCE(?, stage), last_action = COALESCE(?, last_action), go_live_date = COALESCE(?, go_live_date), est_volume = COALESCE(?, est_volume), est_sameday_volume = COALESCE(?, est_sameday_volume) WHERE id = ?').run(stage || null, last_action || null, go_live_date || null, est_volume !== undefined ? est_volume : null, est_sameday_volume !== undefined ? est_sameday_volume : null, req.params.marketId);
    res.json(db.prepare('SELECT * FROM deal_markets WHERE id = ?').get(req.params.marketId));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/log-action', (req, res) => {
  try {
    const db = getDb();
    const { market, actionType, notes, autoFollowup } = req.body;
    if (!market || !actionType) return res.status(400).json({ error: 'market and actionType required' });
    const today = new Date().toISOString().split('T')[0];
    db.prepare('UPDATE deal_markets SET last_action = ?, last_action_date = ? WHERE deal_id = ? AND market = ?').run(actionType, today, req.params.id, market);
    let task = null;
    if (autoFollowup) {
      const deal = db.prepare('SELECT d.responsible, a.name AS account_name FROM deals d JOIN accounts a ON a.id = d.account_id WHERE d.id = ?').get(req.params.id);
      if (deal) {
        const due = new Date();
        due.setDate(due.getDate() + (FOLLOWUP_DAYS[actionType] || 7));
        const result = db.prepare('INSERT INTO tasks (title, responsible, due_date, priority) VALUES (?, ?, ?, ?)').run(`Follow up on ${actionType} — ${deal.account_name} (${market})`, deal.responsible, due.toISOString().split('T')[0], 'Medium');
        task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
      }
    }
    if (notes) {
      const deal = db.prepare('SELECT account_id, responsible FROM deals WHERE id = ?').get(req.params.id);
      if (deal) db.prepare('INSERT INTO notes (account_id, author, text, date) VALUES (?, ?, ?, ?)').run(deal.account_id, deal.responsible, notes, today);
    }
    res.json({ ok: true, task });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
