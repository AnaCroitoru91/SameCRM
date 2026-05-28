const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'samecrm.db');
let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initDb() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL CHECK(role IN ('director','manager','admin')),
      color TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      website TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      role TEXT,
      email TEXT
    );
    CREATE TABLE IF NOT EXISTS deals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      responsible INTEGER NOT NULL REFERENCES users(id),
      type_of_goods TEXT,
      competition TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS deal_markets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      market TEXT NOT NULL CHECK(market IN ('RO','HU','BG')),
      stage TEXT NOT NULL CHECK(stage IN ('Lead','Qualified','Proposal','Negotiation','Live','Lost')),
      last_action TEXT,
      last_action_date DATE,
      go_live_date DATE,
      est_volume INTEGER DEFAULT 0,
      est_sameday_volume INTEGER DEFAULT 0,
      UNIQUE(deal_id, market)
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      responsible INTEGER NOT NULL REFERENCES users(id),
      due_date DATE,
      priority TEXT NOT NULL DEFAULT 'Medium' CHECK(priority IN ('High','Medium','Low')),
      done INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      author INTEGER NOT NULL REFERENCES users(id),
      text TEXT NOT NULL,
      date DATE NOT NULL DEFAULT (date('now'))
    );
    CREATE TABLE IF NOT EXISTS reminder_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      sent_date DATE NOT NULL,
      UNIQUE(user_id, sent_date)
    );
  `);
  console.log('Database initialized');
}

function runSeed() {
  const db = getDb();
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get();
  if (userCount.c > 0) { console.log('Database already seeded, skipping'); return; }

  const insertUser = db.prepare('INSERT INTO users (name, email, role, color) VALUES (?, ?, ?, ?)');
  const users = [
    { name: 'George Iordache', email: 'iordache.george@sameday.ro', role: 'director', color: '#6366f1' },
    { name: 'Ana Croitoru', email: 'ana.croitoru@sameday.ro', role: 'manager', color: '#FF6200' },
    { name: 'Florin Ciocaniu', email: 'florin.ciocaniu@sameday.ro', role: 'manager', color: '#0ea5e9' },
    { name: 'Mihaela Tudorache', email: 'mihaela.tudorache1@sameday.ro', role: 'manager', color: '#a855f7' },
    { name: 'Ileana-Luminita Comanescu', email: 'ileana.comanescu@sameday.ro', role: 'manager', color: '#14b8a6' },
    { name: 'Carmina Constantin', email: 'anamaria.constantin@sameday.ro', role: 'admin', color: '#f43f5e' },
  ];

  const seedTx = db.transaction(() => {
    for (const u of users) insertUser.run(u.name, u.email, u.role, u.color);

    const g = (email) => db.prepare('SELECT id FROM users WHERE email = ?').get(email).id;
    const anaId = g('ana.croitoru@sameday.ro');
    const florinId = g('florin.ciocaniu@sameday.ro');
    const mihaelaId = g('mihaela.tudorache1@sameday.ro');
    const ileanaId = g('ileana.comanescu@sameday.ro');

    const insertAccount = db.prepare('INSERT INTO accounts (name, website) VALUES (?, ?)');
    for (const a of [['Modivo','modivo.ro'],['Temu','temu.com'],['eMAG','emag.ro'],['Fashion Days','fashiondays.ro'],['Answear','answear.ro']]) insertAccount.run(...a);

    const ga = (name) => db.prepare('SELECT id FROM accounts WHERE name = ?').get(name).id;
    const insertDeal = db.prepare('INSERT INTO deals (account_id, responsible, type_of_goods, competition) VALUES (?, ?, ?, ?)');
    const insertDM = db.prepare('INSERT INTO deal_markets (deal_id, market, stage, est_volume, est_sameday_volume) VALUES (?, ?, ?, ?, ?)');

    const d1 = insertDeal.run(ga('Modivo'), anaId, 'fashion goods', 'DPD').lastInsertRowid;
    insertDM.run(d1,'RO','Negotiation',15000,8000); insertDM.run(d1,'HU','Live',8000,3500); insertDM.run(d1,'BG','Proposal',5000,2000);
    const d2 = insertDeal.run(ga('Temu'), anaId, 'mixed goods', 'FAN Courier').lastInsertRowid;
    insertDM.run(d2,'RO','Live',50000,20000); insertDM.run(d2,'BG','Live',30000,12000);
    const d3 = insertDeal.run(ga('eMAG'), florinId, 'electronics', 'Cargus').lastInsertRowid;
    insertDM.run(d3,'RO','Qualified',25000,10000);
    const d4 = insertDeal.run(ga('Fashion Days'), mihaelaId, 'fashion', 'DHL').lastInsertRowid;
    insertDM.run(d4,'RO','Live',12000,5000); insertDM.run(d4,'HU','Proposal',6000,2500);
    const d5 = insertDeal.run(ga('Answear'), ileanaId, 'fashion', 'DPD').lastInsertRowid;
    insertDM.run(d5,'RO','Lead',8000,0); insertDM.run(d5,'HU','Lead',5000,0);

    const insertTask = db.prepare('INSERT INTO tasks (account_id, title, responsible, due_date, priority) VALUES (?, ?, ?, ?, ?)');
    insertTask.run(ga('Modivo'),'Follow up on Modivo counter-offer',anaId,'2026-06-01','High');
    insertTask.run(ga('Fashion Days'),'Send updated tariff to Fashion Days HU',mihaelaId,'2026-05-29','Medium');
    insertTask.run(ga('Answear'),'Schedule intro call with Answear',ileanaId,'2026-05-31','Medium');

    const insertNote = db.prepare('INSERT INTO notes (account_id, author, text, date) VALUES (?, ?, ?, ?)');
    insertNote.run(ga('Modivo'),anaId,"Had a productive negotiation call with the logistics manager. They're comparing our Negotiation-stage RO offer against DPD's latest pricing. Looking positive — they asked for a revised SLA document.",'2026-05-25');
    insertNote.run(ga('Fashion Days'),mihaelaId,"Fashion Days HU team requested updated tariffs for Q3. They're interested in expanding the Sameday volume if we can beat DHL on transit time to Budapest.",'2026-05-26');
    insertNote.run(ga('Answear'),ileanaId,"Initial intro call with Answear procurement. They're currently evaluating logistics partners for HU expansion. Asked us to send a one-pager on our B2B offer.",'2026-05-27');
  });
  seedTx();
  console.log('Database seeded successfully');
}

module.exports = { getDb, initDb, runSeed };
