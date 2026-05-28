'use strict';
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err.message);
  console.error(err.stack);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
  process.exit(1);
});

console.log('Starting SameCRM...');
console.log('Node version:', process.version);
console.log('PORT env:', process.env.PORT);

const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');

let cron;
try {
  cron = require('node-cron');
} catch(e) {
  console.warn('node-cron failed to load:', e.message);
}

const { initDb, runSeed } = require('./db');

const app = express();
const PORT = process.env.PORT || 8080;

app.use((req, res, next) => {
  res.removeHeader('X-Frame-Options');
  res.setHeader('Content-Security-Policy', "frame-ancestors *");
  next();
});

app.use(express.json());
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-User-Id'],
}));

app.set('trust proxy', 1);
app.use(session({
  secret: 'samecrm-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'none',
    secure: true
  }
}));

try {
  initDb();
  runSeed();
  console.log('Database ready');
} catch (err) {
  console.error('DB init error:', err.message);
}

try {
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/accounts', require('./routes/accounts'));
  app.use('/api/deals', require('./routes/deals'));
  app.use('/api/tasks', require('./routes/tasks'));
  app.use('/api/notes', require('./routes/notes'));
  app.use('/api/users', require('./routes/users'));
  app.use('/api/prospecting', require('./routes/prospecting'));
  console.log('All routes loaded');
} catch (err) {
  console.error('Route loading error:', err.message);
  console.error(err.stack);
}

const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(publicPath, 'index.html'));
  }
});

if (cron) {
  try {
    cron.schedule('0 6 * * 1-5', async () => {
      try {
        const { sendDailyReminders } = require('./routes/email');
        await sendDailyReminders();
      } catch(e) {
        console.error('Cron job error:', e.message);
      }
    }, { timezone: 'Europe/Bucharest' });
  } catch(e) {
    console.warn('Cron setup failed:', e.message);
  }
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`SameCRM running on port ${PORT}`);
});
