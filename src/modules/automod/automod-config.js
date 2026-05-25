export const autoModIntensityLevels = Object.freeze(['off', 'low', 'medium', 'high']);
export const autoModThresholds = Object.freeze({
  off: 101,
  low: 90,
  medium: 72,
  high: 55
});
export const autoModEscalationLevels = Object.freeze(['delete', 'timeout', 'strict']);
export const autoModBadWordStrikeThreshold = 3;
export const autoModBadWordStrikeWindowMs = 10 * 60_000;
export const autoModBadWordTimeoutMs = 5 * 60_000;
export const autoModEscalationWindowMs = 30 * 60_000;

export function defaultAutoModConfig() {
  return {
    intensity: 'off',
    escalationMode: 'timeout',
    testUserIds: [],
    mediaRules: {
      channels: {},
      categories: {}
    }
  };
}

export function normalizeAutoModConfig(automod) {
  const normalized = { ...defaultAutoModConfig(), ...(automod ?? {}) };
  if (!autoModIntensityLevels.includes(normalized.intensity)) normalized.intensity = 'off';
  if (!autoModEscalationLevels.includes(normalized.escalationMode)) normalized.escalationMode = 'timeout';
  normalized.testUserIds = uniqueDiscordIds(normalized.testUserIds ?? []);
  normalized.mediaRules = {
    channels: normalizeMediaRuleMap(normalized.mediaRules?.channels),
    categories: normalizeMediaRuleMap(normalized.mediaRules?.categories)
  };
  return normalized;
}

export function normalizeMediaRuleMap(map) {
  return Object.fromEntries(
    Object.entries(map ?? {}).map(([id, rule]) => {
      const normalized = {};
      if (typeof rule?.allowImages === 'boolean') normalized.allowImages = rule.allowImages;
      if (typeof rule?.allowGifs === 'boolean') normalized.allowGifs = rule.allowGifs;
      return [id, normalized];
    })
  );
}

export function autoModIntensityLabel(intensity) {
  return {
    off: 'Off',
    low: 'Low',
    medium: 'Medium',
    high: 'High'
  }[intensity] ?? 'Off';
}

export function autoModEscalationLabel(mode) {
  return {
    delete: 'Delete only',
    timeout: 'Timeout ladder',
    strict: 'Strict: timeouts and bans'
  }[mode] ?? 'Timeout ladder';
}

export function autoModEscalationSummary(mode) {
  return {
    delete: 'Deletes matching messages but does not punish members.',
    timeout: '3 severe removals: 5m timeout. 5 severe removals: 30m timeout.',
    strict: '3 severe removals: 10m timeout. 5 severe removals: 1h timeout. 7 severe removals: ban.'
  }[mode] ?? '3 severe removals: 5m timeout. 5 severe removals: 30m timeout.';
}

export function autoModStatusSummary(automod) {
  const intensity = autoModIntensityLabel(automod?.intensity ?? 'off');
  const escalation = autoModEscalationLabel(automod?.escalationMode ?? 'timeout');
  const channelRules = Object.keys(automod?.mediaRules?.channels ?? {}).length;
  const categoryRules = Object.keys(automod?.mediaRules?.categories ?? {}).length;
  return [
    `AI intensity: ${intensity}`,
    `Escalation: ${escalation}`,
    `Media rules: ${channelRules} channel(s), ${categoryRules} categor${categoryRules === 1 ? 'y' : 'ies'}`
  ].join('\n');
}

export function mediaRuleSummary(label, rule) {
  return `${label} - Images: ${mediaRuleValueLabel(rule?.allowImages)}, GIFs: ${mediaRuleValueLabel(rule?.allowGifs)}`;
}

export function mediaRuleValueLabel(value) {
  if (value === false) return 'Blocked';
  if (value === true) return 'Allowed';
  return 'Inherited';
}

function uniqueDiscordIds(values) {
  return [...new Set(values.map((value) => cleanDiscordId(value)).filter(Boolean))];
}

function cleanDiscordId(value) {
  const clean = String(value ?? '').trim();
  return /^\d{17,22}$/.test(clean) ? clean : null;
}
