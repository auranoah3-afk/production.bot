export function addWarningRecord(guildConfig, {
  userId,
  moderatorId,
  reason,
  createdAt = Date.now()
} = {}) {
  const targetUserId = cleanDiscordId(userId);
  if (!targetUserId) return 0;

  guildConfig.warnings ??= {};
  guildConfig.warnings[targetUserId] ??= [];
  guildConfig.warnings[targetUserId].push({
    moderatorId: cleanDiscordId(moderatorId) || String(moderatorId ?? ''),
    reason: cleanText(reason, 500) || 'No reason provided',
    createdAt: normalizeTimestamp(createdAt)
  });
  return guildConfig.warnings[targetUserId].length;
}

export function clearWarningRecords(guildConfig, userId, caseNumber = null) {
  const targetUserId = cleanDiscordId(userId);
  if (!targetUserId) return 0;

  guildConfig.warnings ??= {};
  const warnings = Array.isArray(guildConfig.warnings[targetUserId])
    ? guildConfig.warnings[targetUserId]
    : [];
  if (!warnings.length) return 0;

  const cleanCaseNumber = Number.parseInt(caseNumber, 10);
  if (Number.isInteger(cleanCaseNumber) && cleanCaseNumber > 0) {
    const index = cleanCaseNumber - 1;
    if (!warnings[index]) return 0;
    warnings.splice(index, 1);
    if (warnings.length) guildConfig.warnings[targetUserId] = warnings;
    else delete guildConfig.warnings[targetUserId];
    return 1;
  }

  delete guildConfig.warnings[targetUserId];
  return warnings.length;
}

export function warningRecordsFor(guildConfig, userId) {
  return recordsFor(guildConfig?.warnings, userId);
}

export function warningCaseFor(guildConfig, userId, caseNumber) {
  const index = Number.parseInt(caseNumber, 10) - 1;
  return Number.isInteger(index) && index >= 0
    ? warningRecordsFor(guildConfig, userId)[index] ?? null
    : null;
}

export function addModNoteRecord(guildConfig, {
  userId,
  moderatorId,
  note,
  createdAt = Date.now()
} = {}) {
  const targetUserId = cleanDiscordId(userId);
  if (!targetUserId) return 0;

  guildConfig.modNotes ??= {};
  guildConfig.modNotes[targetUserId] ??= [];
  guildConfig.modNotes[targetUserId].push({
    moderatorId: cleanDiscordId(moderatorId) || String(moderatorId ?? ''),
    note: cleanText(note, 500) || 'No note provided',
    createdAt: normalizeTimestamp(createdAt)
  });
  return guildConfig.modNotes[targetUserId].length;
}

export function removeModNoteRecord(guildConfig, userId, noteNumber) {
  const targetUserId = cleanDiscordId(userId);
  if (!targetUserId) return false;

  guildConfig.modNotes ??= {};
  const notes = Array.isArray(guildConfig.modNotes[targetUserId])
    ? guildConfig.modNotes[targetUserId]
    : [];
  const index = Number.parseInt(noteNumber, 10) - 1;
  if (!Number.isInteger(index) || index < 0 || !notes[index]) return false;

  notes.splice(index, 1);
  if (notes.length) guildConfig.modNotes[targetUserId] = notes;
  else delete guildConfig.modNotes[targetUserId];
  return true;
}

export function modNoteRecordsFor(guildConfig, userId) {
  return recordsFor(guildConfig?.modNotes, userId);
}

export function moderationHistoryFor(guildConfig, userId) {
  return {
    warnings: warningRecordsFor(guildConfig, userId),
    notes: modNoteRecordsFor(guildConfig, userId)
  };
}

export function upsertTempBanRecord(guildConfig, {
  userId,
  userTag,
  moderatorId,
  reason,
  bannedAt = Date.now(),
  expiresAt,
  lastUnbanAttemptAt = null,
  lastUnbanError = null
} = {}) {
  const targetUserId = cleanDiscordId(userId);
  if (!targetUserId) return null;

  guildConfig.tempBans ??= {};
  const record = {
    userId: targetUserId,
    userTag: cleanText(userTag, 120) || targetUserId,
    moderatorId: cleanDiscordId(moderatorId) || String(moderatorId ?? ''),
    reason: cleanText(reason, 500) || 'No reason provided',
    bannedAt: normalizeTimestamp(bannedAt),
    expiresAt: normalizeTimestamp(expiresAt),
    lastUnbanAttemptAt,
    lastUnbanError
  };
  guildConfig.tempBans[targetUserId] = record;
  return record;
}

export function expiredTempBanRecords(guildConfig, now = Date.now()) {
  const currentTime = normalizeTimestamp(now);
  return Object.entries(guildConfig?.tempBans ?? {})
    .filter(([, entry]) => entry?.expiresAt && entry.expiresAt <= currentTime)
    .map(([userId, entry]) => ({ userId, entry }));
}

export function removeTempBanRecord(guildConfig, userId) {
  const targetUserId = cleanDiscordId(userId);
  if (!targetUserId || !guildConfig?.tempBans?.[targetUserId]) return null;
  const existing = guildConfig.tempBans[targetUserId];
  delete guildConfig.tempBans[targetUserId];
  return existing;
}

export function markTempBanUnbanFailure(guildConfig, userId, errorMessage, {
  now = Date.now(),
  retryWindowMs = 10 * 60_000,
  maxErrorLength = 180
} = {}) {
  const targetUserId = cleanDiscordId(userId);
  const entry = targetUserId ? guildConfig?.tempBans?.[targetUserId] : null;
  if (!entry) return { changed: false, recentlyTried: false, entry: null };

  const currentTime = normalizeTimestamp(now);
  const recentlyTried = Boolean(entry.lastUnbanAttemptAt && currentTime - entry.lastUnbanAttemptAt < retryWindowMs);
  entry.lastUnbanAttemptAt = currentTime;
  entry.lastUnbanError = cleanText(errorMessage, maxErrorLength) || 'Unknown unban error';
  return { changed: true, recentlyTried, entry };
}

export function tempBanRecords(guildConfig, { limit = null } = {}) {
  const records = Object.values(guildConfig?.tempBans ?? {})
    .filter(Boolean)
    .sort((left, right) => Number(left.expiresAt ?? 0) - Number(right.expiresAt ?? 0));
  return Number.isInteger(limit) && limit > 0 ? records.slice(0, limit) : records;
}

function recordsFor(collection, userId) {
  const targetUserId = cleanDiscordId(userId);
  if (!targetUserId || !collection) return [];
  return Array.isArray(collection[targetUserId]) ? collection[targetUserId] : [];
}

function cleanDiscordId(value) {
  const text = String(value ?? '').trim();
  return /^\d{17,20}$/.test(text) ? text : '';
}

function cleanText(value, maxLength) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLength ? text.slice(0, maxLength - 3).trimEnd() + '...' : text;
}

function normalizeTimestamp(value) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now();
}
