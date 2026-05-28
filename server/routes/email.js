const { getDb } = require('../db');

const sendEmail = async (to, subject, body) => {
  console.log('EMAIL TO:', to);
  console.log('SUBJECT:', subject);
  console.log('BODY:', body);
  console.log('---');
  // TODO: Replace with Microsoft Graph API call
};

async function sendDailyReminders() {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];

  const tasks = db.prepare(`
    SELECT t.id, t.title, t.due_date, t.priority,
           u.id AS user_id, u.name AS user_name, u.email AS user_email,
           a.name AS account_name
    FROM tasks t
    JOIN users u ON u.id = t.responsible
    LEFT JOIN accounts a ON a.id = t.account_id
    WHERE t.done = 0 AND t.due_date <= ?
    ORDER BY t.due_date ASC
  `).all(today);

  const byUser = {};
  for (const task of tasks) {
    if (!byUser[task.user_id]) {
      byUser[task.user_id] = { user: { id: task.user_id, name: task.user_name, email: task.user_email }, tasks: [] };
    }
    byUser[task.user_id].tasks.push(task);
  }

  for (const userId of Object.keys(byUser)) {
    const alreadySent = db.prepare('SELECT id FROM reminder_log WHERE user_id = ? AND sent_date = ?').get(userId, today);
    if (alreadySent) { console.log(`Reminder already sent to user ${userId} today`); continue; }

    const { user, tasks: userTasks } = byUser[userId];
    const taskList = userTasks.map(t =>
      `- [${t.priority}] ${t.title}${t.account_name ? ` (${t.account_name})` : ''} — due ${t.due_date}`
    ).join('\n');

    const subject = `SameCRM: You have ${userTasks.length} task${userTasks.length > 1 ? 's' : ''} due today`;
    const body = `Hi ${user.name},\n\nHere are your pending tasks due today or overdue:\n\n${taskList}\n\nPlease log in to SameCRM to update them.\n\nBest regards,\nSameCRM`;

    await sendEmail(user.email, subject, body);
    db.prepare('INSERT OR IGNORE INTO reminder_log (user_id, sent_date) VALUES (?, ?)').run(userId, today);
  }

  console.log(`Daily reminders processed for ${Object.keys(byUser).length} user(s)`);
}

module.exports = { sendDailyReminders };
