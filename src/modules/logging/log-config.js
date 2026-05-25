export const logCategories = Object.freeze([
  { id: 'messages', label: 'Message logs', description: 'Deleted and edited messages' },
  { id: 'members', label: 'Member logs', description: 'Joins, leaves, and member updates' },
  { id: 'moderation', label: 'Moderation logs', description: 'Warnings, kicks, bans, timeouts, purge, lockdown' },
  { id: 'channels', label: 'Channel logs', description: 'Channel create, delete, and updates' },
  { id: 'roles', label: 'Role logs', description: 'Role create, delete, and updates' },
  { id: 'voice', label: 'Voice logs', description: 'Voice channel moves' },
  { id: 'sticky', label: 'Sticky logs', description: 'Sticky message setup changes' },
  { id: 'twitch', label: 'Twitch logs', description: 'Twitch alert setup and checks' },
  { id: 'youtube', label: 'YouTube logs', description: 'YouTube upload alert setup and checks' },
  { id: 'tiktok', label: 'TikTok logs', description: 'TikTok post alert setup and checks' },
  { id: 'dashboard', label: 'Dashboard logs', description: 'Dashboard and setup changes' },
  { id: 'dev', label: 'Developer logs', description: 'Private developer utility usage' }
]);

export const defaultLogCategoryIds = Object.freeze(logCategories.map((category) => category.id));

export function normalizeLogCategoryIds(categoryIds) {
  const source = Array.isArray(categoryIds) && categoryIds.length ? categoryIds : defaultLogCategoryIds;
  const known = new Set(defaultLogCategoryIds);
  return [...new Set(source.map((id) => String(id ?? '').trim()).filter((id) => known.has(id)))];
}

export function formatLogCategories(categoryIds) {
  const enabled = normalizeLogCategoryIds(categoryIds);
  return enabled
    .map((id) => logCategories.find((category) => category.id === id)?.label)
    .filter(Boolean)
    .join(', ') || 'None';
}

export function logCategoryLabel(category) {
  const label = logCategories.find((entry) => entry.id === category)?.label ?? 'Dashboard logs';
  return label.replace(/\s+logs$/i, '');
}

export function logCategoryForTitle(title) {
  if (/message/i.test(title)) return 'messages';
  if (/member joined|member left|member updated/i.test(title)) return 'members';
  if (/warn|kick|ban|unban|timeout|mute|purge|lockdown|slowmode/i.test(title)) return 'moderation';
  if (/channel/i.test(title)) return 'channels';
  if (/role/i.test(title)) return 'roles';
  if (/voice/i.test(title)) return 'voice';
  if (/sticky/i.test(title)) return 'sticky';
  if (/twitch/i.test(title)) return 'twitch';
  if (/youtube/i.test(title)) return 'youtube';
  if (/tiktok/i.test(title)) return 'tiktok';
  if (/developer|dev/i.test(title)) return 'dev';
  return 'dashboard';
}
