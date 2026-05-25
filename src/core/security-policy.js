const discordIdPattern = /^\d{17,22}$/;

function uniqueDiscordIds(ids = []) {
  return [...new Set(ids.map((id) => String(id ?? '').trim()).filter((id) => discordIdPattern.test(id)))];
}

export function safeAllowedMentions({ userIds = [], roleIds = [], repliedUser = false } = {}) {
  const allowedMentions = { parse: [] };
  const users = uniqueDiscordIds(userIds);
  const roles = uniqueDiscordIds(roleIds);

  if (users.length) allowedMentions.users = users;
  if (roles.length) allowedMentions.roles = roles;
  allowedMentions.repliedUser = Boolean(repliedUser);

  return allowedMentions;
}

export function safeOutboundContent(value, { maxLength = 2_000, fallback = 'I could not format a safe response.' } = {}) {
  if (!Number.isInteger(maxLength) || maxLength < 1) {
    throw new RangeError('maxLength must be a positive integer');
  }

  const clean = String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/@(everyone|here)/gi, '@\u200b$1')
    .replace(/<@&\d{17,22}>/g, '@\u200brole')
    .replace(/<@!?\d{17,22}>/g, '@\u200buser')
    .trim() || fallback;

  if (clean.length <= maxLength) return clean;
  if (maxLength <= 3) return clean.slice(0, maxLength);
  return `${clean.slice(0, maxLength - 3).trimEnd()}...`;
}

export function safeContentPayload(content, options = {}) {
  return {
    content: safeOutboundContent(content, options),
    allowedMentions: safeAllowedMentions(options)
  };
}
