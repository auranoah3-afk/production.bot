import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const counterName = 'bugs';
const validBugStatuses = new Set(['OPEN', 'IN_PROGRESS', 'FIXED', 'REJECTED', 'ASSIGNED']);

let defaultDatabase = null;

export function bugDatabasePath() {
  return process.env.BUG_DATABASE_PATH?.trim() || path.join(process.cwd(), 'data', 'bugs.sqlite');
}

export function getNextBugId(database = getBugDatabase()) {
  return runImmediateTransaction(database, () => formatBugId(reserveNextBugNumber(database)));
}

export function createBug(data, database = getBugDatabase()) {
  return runImmediateTransaction(database, () => {
    const now = new Date().toISOString();
    const bugId = formatBugId(reserveNextBugNumber(database));
    database.prepare(`
      INSERT INTO bugs (
        bugId,
        userId,
        username,
        description,
        urgency,
        steps,
        status,
        createdAt,
        updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)
    `).run(
      bugId,
      cleanText(data?.userId, 32),
      cleanText(data?.username, 100),
      cleanText(data?.description, 1024),
      normalizeUrgency(data?.urgency),
      cleanText(data?.steps || 'Not provided.', 1024),
      now,
      now
    );

    return getBug(bugId, database);
  });
}

export function updateBugStatus(bugId, status, assignedTo = null, options = {}, database = getBugDatabase()) {
  const cleanBugId = normalizeBugId(bugId);
  const cleanStatus = normalizeBugStatus(status);
  const existing = getBug(cleanBugId, database);
  if (!existing) return null;

  const assignedUserId = assignedTo === undefined
    ? existing.assignedTo
    : cleanNullableText(assignedTo, 32);
  const assignedUsername = options.assignedToUsername === undefined
    ? existing.assignedToUsername
    : cleanNullableText(options.assignedToUsername, 100);

  database.prepare(`
    UPDATE bugs
    SET status = ?,
        assignedTo = ?,
        assignedToUsername = ?,
        updatedAt = ?
    WHERE bugId = ?
  `).run(cleanStatus, assignedUserId, assignedUsername, new Date().toISOString(), cleanBugId);

  return getBug(cleanBugId, database);
}

export function updateBugMessageLocation(bugId, location = {}, database = getBugDatabase()) {
  const cleanBugId = normalizeBugId(bugId);
  database.prepare(`
    UPDATE bugs
    SET reportGuildId = ?,
        reportChannelId = ?,
        reportMessageId = ?,
        updatedAt = ?
    WHERE bugId = ?
  `).run(
    cleanNullableText(location.guildId, 32),
    cleanNullableText(location.channelId, 32),
    cleanNullableText(location.messageId, 32),
    new Date().toISOString(),
    cleanBugId
  );

  return getBug(cleanBugId, database);
}

export function getBug(bugId, database = getBugDatabase()) {
  const cleanBugId = normalizeBugId(bugId);
  if (!cleanBugId) return null;
  const row = database.prepare('SELECT * FROM bugs WHERE bugId = ?').get(cleanBugId);
  return normalizeBugRecord(row);
}

export function createBugRepository(databasePath) {
  const database = openBugDatabase(databasePath);
  return {
    database,
    getNextBugId: () => getNextBugId(database),
    createBug: (data) => createBug(data, database),
    updateBugStatus: (bugId, status, assignedTo = null, options = {}) =>
      updateBugStatus(bugId, status, assignedTo, options, database),
    updateBugMessageLocation: (bugId, location = {}) => updateBugMessageLocation(bugId, location, database),
    getBug: (bugId) => getBug(bugId, database),
    close: () => database.close()
  };
}

export function closeBugDatabase() {
  if (!defaultDatabase) return;
  defaultDatabase.close();
  defaultDatabase = null;
}

function getBugDatabase() {
  if (!defaultDatabase) {
    defaultDatabase = openBugDatabase(bugDatabasePath());
  }
  return defaultDatabase;
}

function openBugDatabase(databasePath) {
  if (databasePath !== ':memory:') {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const database = new DatabaseSync(databasePath);
  database.exec('PRAGMA busy_timeout = 5000;');
  if (databasePath !== ':memory:') {
    database.exec('PRAGMA journal_mode = WAL;');
  }
  ensureBugSchema(database);
  return database;
}

function ensureBugSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS bug_counters (
      name TEXT PRIMARY KEY,
      value INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS bugs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bugId TEXT NOT NULL UNIQUE,
      userId TEXT NOT NULL,
      username TEXT NOT NULL,
      description TEXT NOT NULL,
      urgency TEXT NOT NULL,
      steps TEXT,
      status TEXT NOT NULL DEFAULT 'OPEN',
      assignedTo TEXT,
      assignedToUsername TEXT,
      reportGuildId TEXT,
      reportChannelId TEXT,
      reportMessageId TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_bugs_bug_id ON bugs (bugId);
    CREATE INDEX IF NOT EXISTS idx_bugs_status ON bugs (status);
    CREATE INDEX IF NOT EXISTS idx_bugs_created_at ON bugs (createdAt);
  `);

  database.prepare('INSERT OR IGNORE INTO bug_counters (name, value) VALUES (?, 0)').run(counterName);
}

function reserveNextBugNumber(database) {
  const row = database.prepare('SELECT value FROM bug_counters WHERE name = ?').get(counterName);
  const next = Number(row?.value ?? 0) + 1;
  database.prepare('UPDATE bug_counters SET value = ? WHERE name = ?').run(next, counterName);
  return next;
}

function runImmediateTransaction(database, callback) {
  database.exec('BEGIN IMMEDIATE;');
  try {
    const result = callback();
    database.exec('COMMIT;');
    return result;
  } catch (error) {
    try {
      database.exec('ROLLBACK;');
    } catch {
      // Ignore rollback failures so the original database error is preserved.
    }
    throw error;
  }
}

function formatBugId(value) {
  const number = Math.max(1, Number(value) || 1);
  return `BUG-${String(number).padStart(4, '0')}`;
}

function normalizeBugId(value) {
  const clean = String(value ?? '').trim().toUpperCase();
  return /^BUG-\d{4,}$/.test(clean) ? clean : '';
}

function normalizeBugStatus(value) {
  const clean = String(value ?? 'OPEN').trim().toUpperCase();
  if (!validBugStatuses.has(clean)) {
    throw new Error(`Invalid bug status: ${value}`);
  }
  return clean;
}

function normalizeUrgency(value) {
  const clean = String(value ?? 'LOW').trim().toUpperCase();
  return ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(clean) ? clean : 'LOW';
}

function cleanText(value, maxLength) {
  const clean = String(value ?? '').trim();
  return truncateForStorage(clean || 'Not provided.', maxLength);
}

function cleanNullableText(value, maxLength) {
  if (value === null) return null;
  const clean = String(value ?? '').trim();
  return clean ? truncateForStorage(clean, maxLength) : null;
}

function truncateForStorage(value, maxLength) {
  const clean = String(value ?? '');
  return clean.length > maxLength ? clean.slice(0, maxLength) : clean;
}

function normalizeBugRecord(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    bugId: row.bugId,
    userId: row.userId,
    username: row.username,
    description: row.description,
    urgency: row.urgency,
    steps: row.steps || 'Not provided.',
    status: row.status || 'OPEN',
    assignedTo: row.assignedTo || null,
    assignedToUsername: row.assignedToUsername || null,
    reportGuildId: row.reportGuildId || null,
    reportChannelId: row.reportChannelId || null,
    reportMessageId: row.reportMessageId || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}
