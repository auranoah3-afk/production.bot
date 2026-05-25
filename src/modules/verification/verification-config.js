export const verificationTimeoutMaxMinutes = 10_080;

export function defaultVerificationConfig() {
  return {
    enabled: false,
    roleId: null,
    channelId: null,
    messageId: null,
    message: null,
    visibleChannelIds: [],
    autoHideChannels: true,
    autoSyncNewChannels: true,
    captchaEnabled: false,
    timeoutMinutes: 0,
    autoKickUnverified: false,
    minAccountAgeDays: 0,
    unverifiedRoleId: null,
    updatedBy: null,
    updatedAt: null
  };
}

export function normalizeVerificationConfig(verification) {
  const normalized = { ...defaultVerificationConfig(), ...(verification ?? {}) };
  normalized.enabled = Boolean(normalized.enabled && normalized.roleId);
  normalized.roleId = cleanDiscordId(normalized.roleId);
  normalized.channelId = cleanDiscordId(normalized.channelId);
  normalized.messageId = cleanDiscordId(normalized.messageId);
  normalized.message = truncate(String(normalized.message ?? '').trim(), 500) || null;
  normalized.visibleChannelIds = uniqueDiscordIds(normalized.visibleChannelIds)
    .filter((id) => id !== normalized.channelId);
  normalized.autoHideChannels = normalized.autoHideChannels !== false;
  normalized.autoSyncNewChannels = normalized.autoSyncNewChannels !== false;
  normalized.captchaEnabled = Boolean(normalized.captchaEnabled);
  normalized.timeoutMinutes = clampInteger(normalized.timeoutMinutes, 0, verificationTimeoutMaxMinutes);
  normalized.autoKickUnverified = Boolean(normalized.autoKickUnverified);
  normalized.minAccountAgeDays = clampInteger(normalized.minAccountAgeDays, 0, 365);
  normalized.unverifiedRoleId = cleanDiscordId(normalized.unverifiedRoleId);
  if (normalized.unverifiedRoleId === normalized.roleId) normalized.unverifiedRoleId = null;
  normalized.updatedBy = normalized.updatedBy ?? null;
  normalized.updatedAt = normalized.updatedAt ?? null;
  return normalized;
}

export function parseVerificationVisibleChannelIds(value, extraIds = []) {
  return uniqueDiscordIds([
    ...String(value ?? '').matchAll(/\d{17,22}/g)
  ].map((match) => match[0]).concat(extraIds));
}

export function verificationExtraVisibleChannelIds(verification) {
  return new Set(normalizeVerificationConfig(verification).visibleChannelIds);
}

export function verificationVisibleChannelIds(verification) {
  const normalized = normalizeVerificationConfig(verification);
  return new Set([
    normalized.channelId,
    ...normalized.visibleChannelIds
  ].filter(Boolean));
}

export function verificationChannelAccessIntent(channel, verification) {
  const normalized = normalizeVerificationConfig(verification);
  const channelId = String(channel?.id ?? '');
  const parentId = String(channel?.parentId ?? '');
  const extraVisibleIds = verificationExtraVisibleChannelIds(normalized);
  const isVerifyChannel = Boolean(normalized.channelId && channelId === normalized.channelId);
  const isExtraVisible = extraVisibleIds.has(channelId) || extraVisibleIds.has(parentId);

  if (isVerifyChannel) {
    return {
      shouldApply: true,
      everyoneCanView: true,
      verifiedRoleCanView: false,
      mode: 'verification'
    };
  }

  if (isExtraVisible) {
    return {
      shouldApply: true,
      everyoneCanView: true,
      verifiedRoleCanView: true,
      mode: 'visible'
    };
  }

  if (!normalized.autoHideChannels) {
    return {
      shouldApply: false,
      everyoneCanView: null,
      verifiedRoleCanView: null,
      mode: 'unchanged'
    };
  }

  return {
    shouldApply: true,
    everyoneCanView: false,
    verifiedRoleCanView: true,
    mode: 'hidden'
  };
}

export function verificationSetupSummary(verification) {
  const normalized = normalizeVerificationConfig(verification);
  return [
    `Hidden onboarding: ${normalized.autoHideChannels ? 'On' : 'Off'}`,
    `Auto-sync new channels: ${normalized.autoSyncNewChannels ? 'On' : 'Off'}`,
    `Visible info channels: ${normalized.visibleChannelIds.length}`,
    `CAPTCHA: ${normalized.captchaEnabled ? 'On' : 'Off'}`,
    `Anti-alt age: ${normalized.minAccountAgeDays ? `${normalized.minAccountAgeDays} day(s)` : 'Off'}`,
    `Timeout kick: ${normalized.autoKickUnverified && normalized.timeoutMinutes ? `${normalized.timeoutMinutes} minute(s)` : 'Off'}`
  ].join('\n');
}

export function verificationAccessLine(intent) {
  if (intent.mode === 'verification') return 'Verify area: unverified can see it, verified members are moved past it.';
  if (intent.mode === 'visible') return 'Visible info area: everyone can see it before and after verification.';
  if (intent.mode === 'hidden') return 'Member area: invisible until verification unlocks it.';
  return 'Unchanged: auto-hide is off for this channel.';
}

export function createVerificationCaptchaCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let index = 0; index < 5; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function uniqueDiscordIds(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => cleanDiscordId(value))
      .filter(Boolean)
  )];
}

function cleanDiscordId(value) {
  const clean = String(value ?? '').trim();
  return /^\d{17,22}$/.test(clean) ? clean : null;
}

function clampInteger(value, min, max) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function truncate(value, maxLength) {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}
