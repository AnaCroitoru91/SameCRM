const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

const SYSTEM_PROMPT = `You are a B2B contact research expert for Sameday, an international courier and logistics company operating in Romania, Bulgaria, and Hungary. Your job is to help the international sales team find the right decision-makers at ecommerce companies and prepare personalised outreach.

When given a company name, URL, or social media handles, search the web and return a complete intelligence profile as a valid JSON object.

Contact priority order:
1. International or Global logistics roles: Head of International Logistics, VP/Director of Global Operations, International Supply Chain Manager, Cross-border Logistics Manager, Export/Import Director
2. C-Level executives: CEO, COO, Managing Director, General Manager
3. Regional roles covering multiple markets as last resort

Avoid purely domestic/local logistics roles. The goal is to find the person who makes decisions about international shipping.

For outreach drafts: be specific, not generic. Reference something real about the company — a recent expansion, a funding round, a new market they entered, their social media scale. Generic messages get ignored.

Important: Return ONLY valid JSON. No markdown, no backticks, no explanation. Start with { and end with }.`;

router.post('/research', async (req, res) => {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'Prospecting not configured', hint: 'Add PERPLEXITY_API_KEY to environment' });
  const { company, website, instagram, tiktok, facebook, linkedin } = req.body;
  if (!company) return res.status(400).json({ error: 'company is required' });
  const userMessage = `Research this company for Sameday's B2B logistics sales team:\nCompany: ${company}\n${website ? `Website: ${website}` : ''}\n${instagram ? `Instagram: ${instagram}` : ''}\n${tiktok ? `TikTok: ${tiktok}` : ''}\n${facebook ? `Facebook: ${facebook}` : ''}\n${linkedin ? `LinkedIn: ${linkedin}` : ''}\nReturn ONLY valid JSON with fields: company, website, hq, revenue, employees, markets, summary, sameday_relevance, social, news, contacts, outreach.`;
  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'sonar-pro', messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userMessage }], max_tokens: 4000, temperature: 0.2 }),
    });
    if (!response.ok) return res.status(502).json({ error: 'Research service unavailable', details: await response.text().catch(() => null) });
    const data = await response.json();
    const text = data.choices[0].message.content;
    try {
      res.json(JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()));
    } catch (e) { res.status(502).json({ error: 'Could not parse research results', raw: text }); }
  } catch (err) { res.status(502).json({ error: 'Research service unavailable', details: err.message }); }
});

router.post('/add-to-crm', async (req, res) => {
  const { company, website, contactName, contactRole, contactEmail } = req.body;
  if (!company) return res.status(400).json({ error: 'company is required' });
  const db = getDb();
  const sessionUserId = (req.session && req.session.userId) || req.headers['x-user-id'];
  const responsibleId = sessionUserId || db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get()?.id;
  if (!responsibleId) return res.status(500).json({ error: 'No users found in system' });
  const existing = db.prepare('SELECT * FROM accounts WHERE name = ?').get(company);
  if (existing) return res.status(409).json({ error: 'already_exists', account: existing });
  try {
    const accountId = db.prepare('INSERT INTO accounts (name, website) VALUES (?, ?)').run(company, website || null).lastInsertRowid;
    const dealId = db.prepare('INSERT INTO deals (account_id, responsible, type_of_goods, competition) VALUES (?, ?, ?, ?)').run(accountId, responsibleId, 'Unknown', null).lastInsertRowid;
    db.prepare('INSERT INTO deal_markets (deal_id, market, stage) VALUES (?, ?, ?)').run(dealId, 'RO', 'Lead');
    const due = new Date(); due.setDate(due.getDate() + 7);
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(db.prepare('INSERT INTO tasks (account_id, title, responsible, due_date, priority) VALUES (?, ?, ?, ?, ?)').run(accountId, `Follow up with ${contactName || company} — intro outreach`, responsibleId, due.toISOString().slice(0, 10), 'Medium').lastInsertRowid);
    if (contactName) db.prepare('INSERT INTO contacts (account_id, name, role, email) VALUES (?, ?, ?, ?)').run(accountId, contactName, contactRole || null, contactEmail || null);
    res.json({ account: db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId), deal: db.prepare('SELECT * FROM deals WHERE id = ?').get(dealId), task });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
