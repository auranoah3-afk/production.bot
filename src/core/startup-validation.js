const discordIdPattern = /^\d{17,22}$/;
const emailishPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const allowedBotEnvironments = new Set(['production', 'development', 'test']);
const allowedPresenceStatuses = new Set(['online', 'idle', 'dnd', 'invisible']);

export function validateStartupEnvironment(env = {}, {
  requireToken = true,
  requireClientId = false,
  requireGuildIds = false
} = {}) {
  const errors = [];
  const warnings = [];
  const botEnv = cleanEnvironmentName(env.BOT_ENV) || 'production';
  const guildIds = parseIdList(env.DISCORD_GUILD_ID);

  if (requireToken && !cleanValue(env.DISCORD_TOKEN)) {
    errors.push('Missing DISCORD_TOKEN in the selected environment file.');
  }

  const clientId = cleanValue(env.DISCORD_CLIENT_ID);
  if (requireClientId && !clientId) {
    errors.push('Missing DISCORD_CLIENT_ID in the selected environment file.');
  } else if (requireClientId && !discordIdPattern.test(clientId)) {
    errors.push('DISCORD_CLIENT_ID must be a valid Discord application ID.');
  } else if (clientId && !discordIdPattern.test(clientId)) {
    warnings.push('DISCORD_CLIENT_ID does not look like a Discord application ID.');
  }

  if (cleanValue(env.BOT_ENV) && !allowedBotEnvironments.has(botEnv)) {
    warnings.push(`BOT_ENV "${env.BOT_ENV}" is unusual; expected production, development, or test.`);
  }

  if (requireGuildIds && guildIds.length === 0) {
    errors.push('DISCORD_GUILD_ID must include at least one guild ID for guild-only command deploys.');
  } else if (botEnv === 'development' && guildIds.length === 0) {
    warnings.push('BOT_ENV=development is running without DISCORD_GUILD_ID, so test-bot commands are not guild locked.');
  }

  const invalidGuildIds = parseRawList(env.DISCORD_GUILD_ID).filter((id) => id && !discordIdPattern.test(id));
  if (invalidGuildIds.length) {
    warnings.push(`DISCORD_GUILD_ID contains invalid ID(s): ${invalidGuildIds.join(', ')}.`);
  }

  const botStatus = cleanValue(env.BOT_STATUS);
  if (botStatus && !allowedPresenceStatuses.has(botStatus.toLowerCase())) {
    warnings.push(`BOT_STATUS "${botStatus}" is not supported; using online instead.`);
  }

  if (cleanValue(env.ERROR_EMAIL_TO) || cleanValue(env.ERROR_EMAIL_RECIPIENTS) || cleanValue(env.EMAIL_ALERT_TO)) {
    if (!cleanValue(env.SMTP_HOST)) warnings.push('Error email recipients are configured, but SMTP_HOST is missing.');
    if (!cleanValue(env.SMTP_FROM) && !cleanValue(env.SMTP_USER)) warnings.push('Error email recipients are configured, but SMTP_FROM or SMTP_USER is missing.');
  }

  if ((cleanValue(env.SMTP_USER) && !cleanValue(env.SMTP_PASS)) || (!cleanValue(env.SMTP_USER) && cleanValue(env.SMTP_PASS))) {
    warnings.push('SMTP_USER and SMTP_PASS should be configured together.');
  }

  const invalidEmails = parseRawList(env.ERROR_EMAIL_TO ?? env.ERROR_EMAIL_RECIPIENTS ?? env.EMAIL_ALERT_TO)
    .filter((email) => email && !emailishPattern.test(email));
  if (invalidEmails.length) {
    warnings.push(`Error email recipient value(s) look invalid: ${invalidEmails.join(', ')}.`);
  }

  if ((cleanValue(env.TWITCH_CLIENT_ID) && !cleanValue(env.TWITCH_CLIENT_SECRET)) || (!cleanValue(env.TWITCH_CLIENT_ID) && cleanValue(env.TWITCH_CLIENT_SECRET))) {
    warnings.push('TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET should be configured together.');
  }

  if (!cleanValue(env.TOGETHER_API_KEY) && !cleanValue(env.HUGGINGFACE_API_KEY)) {
    warnings.push('No AI provider key is configured; AI chat and AI AutoMod provider checks will be unavailable.');
  }

  return Object.freeze({
    ok: errors.length === 0,
    botEnv,
    guildIds,
    errors,
    warnings
  });
}

export function formatStartupValidation(report) {
  const lines = [];
  if (report.errors?.length) lines.push(`Errors: ${report.errors.join(' | ')}`);
  if (report.warnings?.length) lines.push(`Warnings: ${report.warnings.join(' | ')}`);
  return lines.join('\n') || 'Startup environment validation passed.';
}

function cleanEnvironmentName(value) {
  return cleanValue(value).toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

function cleanValue(value) {
  return String(value ?? '').trim();
}

function parseIdList(value) {
  return parseRawList(value).filter((id) => discordIdPattern.test(id));
}

function parseRawList(value) {
  return String(value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}
