export function randomFrom(values) {
  return values[Math.floor(Math.random() * values.length)];
}

export function stableScore(value, max) {
  let hash = 0;
  for (const character of value) {
    hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  }
  return Math.abs(hash) % max;
}

export function errorCodeFor(error, context = {}) {
  const message = String(error?.message ?? error ?? 'Unknown error');
  const type = String(context.type ?? 'Bot');
  const category = errorCodeCategory(error, context);
  const status = String(error?.status ?? error?.statusCode ?? '').match(/\b([45]\d{2})\b/)?.[1]
    ?? message.match(/\b([45]\d{2})\b/)?.[1];
  const fingerprint = [
    type,
    context.command ?? '',
    context.channel ?? '',
    error?.name ?? '',
    message
  ].join(':');
  const hash = String(stableScore(fingerprint, 10000)).padStart(4, '0');

  return category.includeStatus && status
    ? `${category.code}-${status}-${hash}`
    : `${category.code}-${hash}`;
}

export function errorCodeCategory(error, context = {}) {
  const message = String(error?.message ?? error ?? '');
  const lowerMessage = message.toLowerCase();
  const type = String(context.type ?? 'Bot').toLowerCase();
  const command = String(context.command ?? '').toLowerCase();
  const discordCode = Number(error?.code ?? error?.rawError?.code ?? 0);
  const status = Number(error?.status ?? error?.statusCode ?? 0);
  const combined = `${type} ${command} ${lowerMessage}`;
  const isProviderFailure = /\b(ai|provider|hugging face|together\.ai|openai|api|fetch|request failed)\b/i.test(combined) ||
    [400, 401, 402, 403, 404, 408, 409, 429, 500, 502, 503, 504].includes(status);

  if (type.includes('unhandled')) return { code: 'ERR_UNHANDLED', label: 'Unhandled async task', includeStatus: false };
  if (type.includes('uncaught')) return { code: 'ERR_UNCAUGHT', label: 'Runtime exception', includeStatus: false };
  if (discordCode === 50013 || /missing permissions|permission denied|manage roles|manage channels|manage messages/i.test(combined)) {
    return { code: 'ERR_PERMISSION_DENIED', label: 'Permission denied', includeStatus: false };
  }
  if (discordCode === 50001 || /missing access|unknown channel|channel.*missing|invalid channel|cannot access/i.test(combined)) {
    return { code: 'ERR_INVALID_CHANNEL', label: 'Invalid or inaccessible channel', includeStatus: false };
  }
  if (/unknown role|invalid role|role.*missing|role hierarchy|above my role|managed role/i.test(combined)) {
    return { code: 'ERR_INVALID_ROLE', label: 'Invalid or unsafe role', includeStatus: false };
  }
  if (discordCode === 10062 || /unknown interaction|interaction.*expired|expired interaction|token.*expired/i.test(combined)) {
    return { code: 'ERR_INTERACTION_TIMEOUT', label: 'Interaction expired', includeStatus: false };
  }
  if (discordCode === 40060 || /already been acknowledged|already acknowledged/i.test(combined)) {
    return { code: 'ERR_INTERACTION_STATE', label: 'Interaction state conflict', includeStatus: false };
  }
  if (discordCode === 50035 || /invalid form body|invalid argument|bad option|required option|validation/i.test(combined)) {
    return { code: 'ERR_INVALID_ARGUMENTS', label: 'Invalid arguments or response', includeStatus: false };
  }
  if (/database|config|json|saveconfig|writefile|readfile|repository|eacces|enoent|eperm/i.test(combined)) {
    return { code: 'ERR_DATABASE_FAILURE', label: 'Config or database failure', includeStatus: false };
  }
  if (/module disabled|disabled module|disabled command|feature disabled|command disabled/i.test(combined)) {
    return { code: 'ERR_MODULE_DISABLED', label: 'Module or command disabled', includeStatus: false };
  }
  if (/setup incomplete|not configured|choose .* first|missing setup|partial setup|no log channel|set a log channel/i.test(combined)) {
    return { code: 'ERR_SETUP_INCOMPLETE', label: 'Setup incomplete', includeStatus: false };
  }
  if (/cooldown|cooling down|rate limited by cooldown/i.test(combined)) {
    return { code: 'ERR_COOLDOWN', label: 'Cooldown active', includeStatus: false };
  }
  if (isProviderFailure && status) {
    return { code: 'ERR_API_FAILURE', label: 'External API or provider failure', includeStatus: true };
  }
  if (/missing dependency|not installed|no .* configured|api key|token|smtp|provider configured/i.test(combined)) {
    return { code: 'ERR_MISSING_DEPENDENCY', label: 'Missing dependency or configuration', includeStatus: false };
  }
  if (/dashboard|dash:/i.test(combined)) {
    return { code: 'ERR_DASHBOARD_ERROR', label: 'Dashboard error', includeStatus: false };
  }
  if (/verification|verify|captcha/i.test(combined)) {
    return { code: 'ERR_VERIFICATION_ERROR', label: 'Verification error', includeStatus: false };
  }
  if (/automod|auto moderation|profanity|spam detection/i.test(combined)) {
    return { code: 'ERR_AUTOMOD_FAILURE', label: 'AutoMod failure', includeStatus: false };
  }
  if (/moderation|warn|kick|ban|timeout|mute|lockdown|purge|case/i.test(combined)) {
    return { code: 'ERR_MODERATION_ERROR', label: 'Moderation error', includeStatus: false };
  }
  if (isProviderFailure) {
    return { code: 'ERR_API_FAILURE', label: 'External API or provider failure', includeStatus: true };
  }
  if (type.includes('interaction')) return { code: 'ERR_INTERACTION_ERROR', label: 'Slash, button, or modal error', includeStatus: false };
  if (type.includes('message')) return { code: 'ERR_MESSAGE_ERROR', label: 'Message or prefix command error', includeStatus: false };
  return { code: 'ERR_BOT_FAILURE', label: 'General bot runtime error', includeStatus: false };
}

export function truncate(value, maxLength) {
  if (!value || value.length <= maxLength) return value ?? '';
  return `${value.slice(0, maxLength - 3)}...`;
}

export function formatDeveloperErrorMessage(error) {
  const message = String(error?.message ?? error ?? 'Unknown error');
  const providerMatch = message.match(/^([^:]+?error\s+\d+):\s*(\{.*\})$/i);

  if (!providerMatch) return message;

  try {
    const [, prefix, rawJson] = providerMatch;
    const parsed = JSON.parse(rawJson);
    const cleanMessage = parsed.message ?? parsed.error?.message ?? rawJson;
    const details = [parsed.type, parsed.param, parsed.code].filter(Boolean).join(' | ');

    return details ? `${prefix}: ${cleanMessage}\nDetails: ${details}` : `${prefix}: ${cleanMessage}`;
  } catch {
    return message;
  }
}

export function cleanAiReplyFormatting(value) {
  return String(value ?? '')
    .replace(/\\\(([\s\S]*?)\\\)/g, '$1')
    .replace(/\\\[([\s\S]*?)\\\]/g, '$1')
    .replace(/\\left|\\right/g, '')
    .replace(/\\(?:text|boxed)\{([^{}]*)\}/g, '$1')
    .replace(/\{,\}/g, ',')
    .replace(/\\times|\\cdot/g, ' x ')
    .replace(/\\div/g, '/')
    .replace(/\\approx/g, 'about')
    .replace(/\\leq?|≤/g, '<=')
    .replace(/\\geq?|≥/g, '>=')
    .replace(/\\neq|≠/g, '!=')
    .replace(/([A-Za-z0-9)])\^\{([^{}]+)\}/g, '$1^$2')
    .replace(/([A-Za-z0-9)])_\{([^{}]+)\}/g, '$1_$2')
    .replace(/\\[,;:! ]/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .trim();
}

export function commandErrorUserMessage(error) {
  const discordCode = Number(error?.code ?? error?.rawError?.code ?? 0);
  const status = Number(error?.status ?? error?.statusCode ?? 0);
  const message = String(error?.message ?? error ?? '');

  if (discordCode === 50013 || /missing permissions/i.test(message)) {
    return 'I do not have the Discord permission needed to finish that command. Check my role position and channel permissions, then try again.';
  }

  if (discordCode === 50001 || /missing access/i.test(message)) {
    return 'I cannot access the server, channel, message, or member that command needs. Check my invite scopes and channel access.';
  }

  if (discordCode === 10062 || /unknown interaction/i.test(message)) {
    return 'Discord marked that interaction as expired before I could answer. Try the command again.';
  }

  if (discordCode === 40060 || /already been acknowledged/i.test(message)) {
    return 'Discord already received a response for that command. Try again if the message did not update.';
  }

  if (discordCode === 50007 || /cannot send messages to this user/i.test(message)) {
    return 'I could not DM that user. They may have DMs closed or may not share a server with the bot.';
  }

  if (discordCode === 50035 || /invalid form body/i.test(message)) {
    return 'Discord rejected part of the command response. I alerted the developer with the exact error code.';
  }

  if (status === 429 || /rate limit/i.test(message)) {
    return 'Discord rate-limited that action. Wait a moment, then try again.';
  }

  return 'Something went wrong while running that command.';
}

export function closestCommandNames(input, commandNames, max = 3) {
  const needle = normalizeCommandName(input);
  if (!needle) return [];

  const uniqueNames = [...new Set(commandNames.map((name) => normalizeCommandName(name)).filter(Boolean))];
  return uniqueNames
    .map((name) => ({
      name,
      distance: levenshteinDistance(needle, name)
    }))
    .filter(({ name, distance }) => {
      const threshold = Math.max(2, Math.ceil(Math.max(needle.length, name.length) * 0.35));
      return distance <= threshold || name.includes(needle) || needle.includes(name);
    })
    .sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name))
    .slice(0, Math.max(0, max))
    .map(({ name }) => name);
}

function normalizeCommandName(value) {
  return String(value ?? '').trim().toLowerCase().replace(/^[!/]+/, '').replace(/[^a-z0-9_-]/g, '');
}

function levenshteinDistance(left, right) {
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array(right.length + 1).fill(0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + cost
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length];
}

export function detectHostileProfanity(text, intensity = 'low') {
  const normalized = normalizeModerationText(text);
  if (!normalized.raw.trim()) return null;

  const match = localModerationRules.find((rule) => localModerationRuleMatches(rule, normalized));
  if (!match) return null;
  if (match.severity < localModerationMinimumSeverity(intensity)) return null;

  return {
    source: 'profanity',
    action: 'delete',
    severity: match.severity,
    category: match.category,
    reason: match.reason
  };
}

export function nextAutoModStrikeState(previousStrikes, now, windowMs, threshold) {
  const cutoff = now - windowMs;
  const strikes = [...(previousStrikes ?? [])]
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp > cutoff);
  strikes.push(now);
  return {
    strikes,
    count: strikes.length,
    shouldTimeout: strikes.length >= threshold
  };
}

export function nextAutoModEscalationAction(mode, count) {
  const cleanMode = ['delete', 'timeout', 'strict'].includes(mode) ? mode : 'timeout';
  const cleanCount = Number.isFinite(count) ? count : 0;

  if (cleanMode === 'delete' || cleanCount < 3) {
    return { type: 'none', threshold: cleanMode === 'strict' ? 7 : 5 };
  }

  if (cleanMode === 'strict') {
    if (cleanCount >= 7) return { type: 'ban', threshold: 7 };
    if (cleanCount >= 5) return { type: 'timeout', durationMs: 60 * 60_000, threshold: 5 };
    return { type: 'timeout', durationMs: 10 * 60_000, threshold: 3 };
  }

  if (cleanCount >= 5) return { type: 'timeout', durationMs: 30 * 60_000, threshold: 5 };
  return { type: 'timeout', durationMs: 5 * 60_000, threshold: 3 };
}

function localModerationMinimumSeverity(intensity) {
  return {
    low: 90,
    medium: 70,
    high: 50,
    off: 101
  }[intensity] ?? 90;
}

const localModerationRules = [
  {
    category: 'obscene_gesture',
    severity: 100,
    reason: 'Obscene gestures are not allowed.',
    patterns: [/\u{1f595}/u]
  },
  {
    category: 'hostile_profanity',
    severity: 100,
    reason: 'Direct hostile profanity is not allowed.',
    phrases: [
      'fuck off',
      'fuck you',
      'fuck u',
      'go fuck yourself',
      'shut the fuck up',
      'stfu',
      'kys'
    ]
  },
  {
    category: 'hostile_profanity',
    severity: 100,
    reason: 'Profanity used as an insult is not allowed.',
    terms: [
      'bitch',
      'bitches',
      'btch',
      'biatch',
      'asshole',
      'arsehole',
      'dumbass',
      'jackass',
      'shithead',
      'dickhead',
      'bastard',
      'whore',
      'slut'
    ]
  },
  {
    category: 'hate_slur',
    severity: 100,
    reason: 'Hate slurs are not allowed.',
    terms: [
      'fag',
      'fags',
      'fagot',
      'fagots',
      'faggot',
      'faggots',
      'dyke',
      'dykes',
      'tranny',
      'trannies',
      'nigger',
      'niggers',
      'nigga',
      'niggas',
      'niggah',
      'niggaz'
    ]
  },
  {
    category: 'strong_profanity',
    severity: 95,
    reason: 'Strong profanity is not allowed.',
    terms: [
      'fuck',
      'fucks',
      'fucked',
      'fucker',
      'fuckers',
      'fucking',
      'motherfucker',
      'motherfucking',
      'fuk',
      'fck',
      'fk',
      'fuq',
      'shit',
      'shits',
      'shitty',
      'bullshit',
      'cunt',
      'kunt',
      'dick',
      'dicks',
      'prick',
      'pussy',
      'wanker',
      'twat',
      'bollocks'
    ]
  },
  {
    category: 'mild_profanity',
    severity: 75,
    reason: 'Profanity is not allowed at this AutoMod intensity.',
    terms: [
      'damn',
      'dammit',
      'hell',
      'crap',
      'piss',
      'pissed'
    ]
  }
];

function normalizeModerationText(text) {
  const raw = String(text ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
  const leet = raw.replace(/[0134578@$!+|]/g, (character) => ({
    '0': 'o',
    '1': 'i',
    '3': 'e',
    '4': 'a',
    '5': 's',
    '7': 't',
    '8': 'b',
    '@': 'a',
    '$': 's',
    '!': 'i',
    '+': 't',
    '|': 'i'
  }[character] ?? character));
  const spaced = leet
    .replace(/['`~^]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const collapsed = spaced
    .split(/\s+/)
    .filter(Boolean)
    .map(collapseRepeatedLetters)
    .join(' ');
  const joined = collapseRepeatedLetters(spaced.replace(/[^a-z0-9]+/g, ''));

  return {
    raw,
    spaced,
    collapsed,
    joined,
    words: collapsed ? collapsed.split(/\s+/) : []
  };
}

function collapseRepeatedLetters(value) {
  return String(value ?? '').replace(/([a-z])\1{2,}/g, '$1$1');
}

function localModerationRuleMatches(rule, normalized) {
  if (rule.patterns?.some((pattern) => pattern.test(normalized.raw))) return true;
  if (rule.phrases?.some((phrase) => moderationPhraseMatches(phrase, normalized))) return true;
  return rule.terms?.some((term) => moderationTermMatches(term, normalized)) ?? false;
}

function moderationPhraseMatches(phrase, normalized) {
  const cleanPhrase = normalizeModerationText(phrase);
  return normalized.collapsed.includes(cleanPhrase.collapsed) ||
    normalized.joined.includes(cleanPhrase.joined);
}

function moderationTermMatches(term, normalized) {
  const cleanTerm = normalizeModerationText(term);
  if (normalized.words.includes(cleanTerm.collapsed)) return true;
  if (cleanTerm.joined.length >= 4 && moderationSeparatedTermMatches(cleanTerm.joined, normalized.words)) return true;
  return false;
}

function moderationSeparatedTermMatches(term, words) {
  for (let start = 0; start < words.length; start += 1) {
    let joined = '';
    for (let index = start; index < words.length; index += 1) {
      const word = words[index];
      if (word.length > 2) break;
      joined += word;
      if (joined === term) return true;
      if (!term.startsWith(joined) || joined.length >= term.length) break;
    }
  }
  return false;
}

export function detectJoinedChatTopic(text) {
  const lower = String(text ?? '').toLowerCase();
  if (/\b(bot|command|slash|dashboard|dev|join|restart|deploy|server|discord)\b/.test(lower)) return 'the bot';
  if (/\b(game|play|stream|twitch|youtube|clip)\b/.test(lower)) return 'gaming or streaming';
  if (/\b(school|class|homework|study|test)\b/.test(lower)) return 'school';
  if (/\b(work|job|money|business|project)\b/.test(lower)) return 'work';
  if (/\b(friend|relationship|family|people)\b/.test(lower)) return 'people';
  if (/\b(food|eat|drink|music|movie|show)\b/.test(lower)) return 'casual stuff';
  return null;
}
