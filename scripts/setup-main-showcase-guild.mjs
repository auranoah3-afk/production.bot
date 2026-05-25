import fs from 'node:fs';
import path from 'node:path';
import {
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  PermissionsBitField,
  REST,
  Routes
} from 'discord.js';
import { loadLocalEnv } from '../src/env.js';

loadLocalEnv();

if (process.env.ALLOW_LEGACY_SHOWCASE_SETUP !== 'true') {
  throw new Error('Legacy showcase auto-setup is disabled for safety. Use scripts/repair-main-server-structure.mjs for non-destructive main-server repair.');
}

const guildId = '1505751652655693926';
const ownerId = '1205738144323080214';
const botVersion = String(process.env.BOT_VERSION || '2').trim();
const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const configPath = path.join(process.cwd(), 'data', process.env.BOT_CONFIG_FILE?.trim() || 'config.json');
const setupColor = 0xff3344;
const successColor = 0x35d07f;
const infoColor = 0x5865f2;
const warningColor = 0xf6c85f;
const now = Date.now();

if (!token) throw new Error('DISCORD_TOKEN is missing.');
if (!clientId) throw new Error('DISCORD_CLIENT_ID is missing.');

const rest = new REST({ version: '10' }).setToken(token);
const apiWarnings = [];
const created = {
  categories: 0,
  channels: 0,
  roles: 0,
  messages: 0,
  patchedMessages: 0
};

let guild = null;
let botUser = null;
let channels = new Map();
let roles = new Map();

const staffRoleNames = [
  '*** Administrator',
  'Production',
  'Production Testing',
  'Developer',
  'Lead Staff',
  'Production Staff'
];

const testingRoleSpecs = [
  { key: 'tester', name: 'V2 Tester', color: 0xff3344 },
  { key: 'automodTester', name: 'AutoMod Tester', color: 0xffb000 },
  { key: 'streamAlerts', name: 'Stream Alerts', color: 0x9146ff },
  { key: 'youtubeAlerts', name: 'YouTube Alerts', color: 0xff0033 },
  { key: 'tiktokAlerts', name: 'TikTok Alerts', color: 0x00f2ea },
  { key: 'giveawayAlerts', name: 'Giveaway Alerts', color: 0x35d07f },
  { key: 'betaUpdates', name: 'Beta Updates', color: 0x5865f2 },
  { key: 'caseStaff', name: 'V2 Case Staff', color: 0x5c6bc0 }
];

const publicInfoChannelSpecs = [
  { key: 'startHere', name: 'v2-start-here', topic: 'Start here for V2 testing server status, links, and onboarding.' },
  { key: 'rules', name: 'ㆍrules', aliases: ['rules'], topic: 'Server rules and testing expectations.' },
  { key: 'announcements', name: 'ㆍannouncements', aliases: ['announcements'], topic: 'Official bot and server announcements.' },
  { key: 'changelog', name: 'ㆍchangelog', aliases: ['changelog'], topic: 'V2 bot changelog and release notes.' },
  { key: 'uptime', name: 'ㆍbot-uptime', aliases: ['bot-uptime'], topic: 'Bot uptime/status mirror.' },
  { key: 'verification', name: 'verification', topic: 'New members verify here to unlock the testing hub.' }
];

const communityChannelSpecs = [
  { key: 'welcome', name: 'v2-welcome', topic: 'Welcome messages and onboarding previews.', readOnly: true },
  { key: 'chat', name: 'v2-community-chat', aliases: ['public-chat'], topic: 'General community testing chat.' },
  { key: 'commands', name: 'commands', aliases: ['v2-commands'], topic: 'Run slash and prefix commands here.' },
  { key: 'dashboard', name: 'v2-dashboard', topic: 'Open and test the /dashboard control center.' },
  { key: 'suggestions', name: 'ㆍsuggestions', aliases: ['suggestions', 'v2-suggestions'], topic: 'Suggestion testing and voting.' },
  { key: 'socials', name: 'v2-socials', topic: 'Official social links and social command testing.', readOnly: true },
  { key: 'roles', name: 'v2-roles', topic: 'Reaction role and role panel testing.', readOnly: true },
  { key: 'giveaways', name: 'v2-giveaways', topic: 'Giveaway and rewards testing.', readOnly: true },
  { key: 'profiles', name: 'v2-profiles', topic: 'Profile, bio, reputation, and social system testing.' },
  { key: 'economy', name: 'v2-economy', topic: 'Economy, XP, shop, rewards, and inventory testing.' },
  { key: 'games', name: 'v2-games', topic: 'Fun command and game testing.' },
  { key: 'sticky', name: 'v2-sticky-test', topic: 'Sticky message behavior testing.' }
];

const labChannelSpecs = [
  { key: 'automod', name: 'v2-automod-test', topic: 'AutoMod testing area. Expect messages here to be evaluated.' },
  { key: 'aiChat', name: 'v2-ai-chat-test', topic: 'Joined AI chat testing area.' },
  { key: 'media', name: 'v2-media-test', topic: 'Media, links, utilities, and creator card testing.' },
  { key: 'utility', name: 'v2-utility-test', topic: 'Utility command testing.' },
  { key: 'counterLab', name: 'v2-counter-lab', topic: 'Counter previews and manual refresh testing.' },
  { key: 'verificationPreview', name: 'v2-verification-preview', topic: 'Verification preview and setup testing.', readOnly: true }
];

const creatorChannelSpecs = [
  { key: 'twitch', name: 'v2-twitch-live', topic: 'Twitch live and stream-ended notification testing.', readOnly: true },
  { key: 'youtube', name: 'v2-youtube-alerts', topic: 'YouTube upload/live notification testing.', readOnly: true },
  { key: 'tiktok', name: 'v2-tiktok-alerts', topic: 'TikTok post notification testing.', readOnly: true },
  { key: 'streamDebug', name: 'v2-stream-debug', topic: 'Creator alert checks, previews, and diagnostics.' }
];

const staffChannelSpecs = [
  { key: 'botLogs', name: 'v2-bot-logs', aliases: ['moderator-only'], topic: 'Central bot logs for the testing server.' },
  { key: 'modLogs', name: 'v2-mod-logs', topic: 'Moderation logs and AutoMod outcomes.' },
  { key: 'devLogs', name: 'v2-dev-logs', topic: 'Developer logs and runtime diagnostics.' },
  { key: 'dashboardLogs', name: 'v2-dashboard-logs', topic: 'Dashboard setup and module change logs.' },
  { key: 'security', name: 'v2-security-lab', topic: 'Anti-raid, lockdown, and protection testing.' },
  { key: 'reports', name: 'v2-reports', topic: 'Report queue and staff workflow testing.' },
  { key: 'caseLogs', name: 'v2-case-logs', topic: 'Private case system logs.' }
];

const categorySpecs = [
  { key: 'info', name: 'V2 Information' },
  { key: 'community', name: 'V2 Community Testing' },
  { key: 'labs', name: 'V2 Module Labs' },
  { key: 'creator', name: 'V2 Creator Alerts' },
  { key: 'staff', name: 'V2 Staff And Logs' },
  { key: 'cases', name: 'V2 Private Cases' },
  { key: 'counters', name: 'V2 Counters' }
];

function bigintPermissions(names) {
  return names.reduce((total, name) => total | BigInt(PermissionFlagsBits[name]), 0n).toString();
}

function roleOverwrite(id, allow = [], deny = []) {
  return {
    id,
    type: 0,
    allow: bigintPermissions(allow),
    deny: bigintPermissions(deny)
  };
}

function userOverwrite(id, allow = [], deny = []) {
  return {
    id,
    type: 1,
    allow: bigintPermissions(allow),
    deny: bigintPermissions(deny)
  };
}

function uniqueIds(values) {
  return [...new Set(values.filter((value) => /^\d{17,22}$/.test(String(value ?? ''))).map(String))];
}

function channelIconUrl(guildRecord) {
  if (!guildRecord?.icon) return null;
  return `https://cdn.discordapp.com/icons/${guildRecord.id}/${guildRecord.icon}.png?size=128`;
}

function embed(title, description, fields = [], color = setupColor) {
  const iconUrl = channelIconUrl(guild);
  return {
    color,
    author: {
      name: guild.name,
      icon_url: iconUrl ?? undefined
    },
    title,
    description,
    fields: fields.filter(Boolean).slice(0, 25),
    thumbnail: iconUrl ? { url: iconUrl } : undefined,
    footer: { text: `V2 Community Bot | Showcase setup` },
    timestamp: new Date().toISOString()
  };
}

async function refreshGuildState() {
  [guild, botUser] = await Promise.all([
    rest.get(Routes.guild(guildId)),
    rest.get(Routes.user())
  ]);
  const [channelList, roleList] = await Promise.all([
    rest.get(Routes.guildChannels(guildId)),
    rest.get(Routes.guildRoles(guildId))
  ]);
  channels = new Map(channelList.map((channel) => [channel.id, channel]));
  roles = new Map(roleList.map((role) => [role.id, role]));
}

function roleByName(name) {
  const clean = name.toLowerCase();
  return [...roles.values()].find((role) => role.name.toLowerCase() === clean) ?? null;
}

function channelByName(name, type = null) {
  const clean = name.toLowerCase();
  return [...channels.values()].find((channel) =>
    channel.name?.toLowerCase() === clean && (type === null || channel.type === type)
  ) ?? null;
}

function channelBySpec(spec, type = ChannelType.GuildText) {
  const names = [spec.name, ...(spec.aliases ?? [])];
  for (const name of names) {
    const found = channelByName(name, type);
    if (found) return found;
  }
  return null;
}

async function ensureRole(spec) {
  const existing = roleByName(spec.name);
  if (existing) return existing;

  const role = await rest.post(Routes.guildRoles(guildId), {
    body: {
      name: spec.name,
      color: spec.color ?? 0,
      hoist: false,
      mentionable: spec.mentionable ?? false,
      permissions: new PermissionsBitField(spec.permissions ?? []).bitfield.toString()
    },
    reason: 'Provision V2 showcase testing roles'
  });
  roles.set(role.id, role);
  created.roles += 1;
  return role;
}

async function patchChannel(channel, body, reason) {
  try {
    const patched = await rest.patch(Routes.channel(channel.id), { body, reason });
    channels.set(patched.id, patched);
    return patched;
  } catch (error) {
    apiWarnings.push(`Could not update #${channel.name}: ${error.message}`);
    return channel;
  }
}

async function ensureCategory(name, permissionOverwrites) {
  const existing = channelByName(name, ChannelType.GuildCategory);
  if (existing) {
    return patchChannel(existing, { permission_overwrites: permissionOverwrites }, 'Update V2 showcase category permissions');
  }

  const category = await rest.post(Routes.guildChannels(guildId), {
    body: {
      name,
      type: ChannelType.GuildCategory,
      permission_overwrites: permissionOverwrites
    },
    reason: 'Create V2 showcase category'
  });
  channels.set(category.id, category);
  created.categories += 1;
  return category;
}

async function ensureTextChannel(spec, parentId, permissionOverwrites) {
  const existing = channelBySpec(spec, ChannelType.GuildText);
  const body = {
    parent_id: parentId,
    topic: spec.topic,
    permission_overwrites: permissionOverwrites,
    rate_limit_per_user: spec.slowmodeSeconds ?? 0
  };

  if (existing) {
    return patchChannel(existing, body, 'Update V2 showcase channel layout');
  }

  const channel = await rest.post(Routes.guildChannels(guildId), {
    body: {
      name: spec.name,
      type: ChannelType.GuildText,
      ...body
    },
    reason: 'Create V2 showcase text channel'
  });
  channels.set(channel.id, channel);
  created.channels += 1;
  return channel;
}

async function fetchRecentMessages(channelId, limit = 30) {
  try {
    return await rest.get(Routes.channelMessages(channelId), {
      query: new URLSearchParams([['limit', String(limit)]])
    });
  } catch (error) {
    apiWarnings.push(`Could not read recent messages for ${channelId}: ${error.message}`);
    return [];
  }
}

async function ensureBotMessage(channelId, title, bodyBuilder) {
  const messages = await fetchRecentMessages(channelId, 50);
  const existing = messages.find((message) =>
    message.author?.id === botUser.id &&
    message.embeds?.some((messageEmbed) => messageEmbed.title === title)
  );
  const body = await bodyBuilder(existing);

  if (existing) {
    const patched = await rest.patch(Routes.channelMessage(channelId, existing.id), {
      body,
      reason: 'Refresh V2 showcase bot panel'
    });
    created.patchedMessages += 1;
    return patched;
  }

  const sent = await rest.post(Routes.channelMessages(channelId), {
    body,
    reason: 'Post V2 showcase bot panel'
  });
  created.messages += 1;
  return sent;
}

async function deleteDuplicateBotPanels(channelId, keepMessageId, predicate) {
  const messages = await fetchRecentMessages(channelId, 50);
  for (const message of messages) {
    if (message.id === keepMessageId || message.author?.id !== botUser.id) continue;
    if (!predicate(message)) continue;
    await rest.delete(Routes.channelMessage(channelId, message.id), {
      reason: 'Remove duplicate V2 showcase panel'
    }).catch((error) => apiWarnings.push(`Could not remove duplicate panel ${message.id}: ${error.message}`));
  }
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return {
      version: 2,
      adminUserIds: [],
      devUserIds: [],
      errorDmUserIds: [],
      guilds: {},
      updateSubscribers: [],
      suggestions: {},
      disabledCommands: [],
      lastBotVersion: null,
      uptimeStatus: {}
    };
  }
}

function writeConfig(config) {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

function platformEmoji(platform) {
  return {
    Twitch: '\u{1F7E3}',
    YouTube: '\u{1F534}',
    TikTok: '\u{1F3B5}',
    Discord: '\u{1F4AC}'
  }[platform] ?? '\u{1F517}';
}

function socialLink(label, url, description) {
  return {
    key: `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Buffer.from(url).toString('base64url').slice(0, 8)}`,
    label,
    url,
    description,
    emoji: platformEmoji(label),
    createdBy: ownerId,
    createdAt: now,
    updatedBy: ownerId,
    updatedAt: now
  };
}

function counterRecord(id, type, label, emoji, categoryId, position, style = 'compact') {
  return {
    id,
    type,
    channelId: null,
    categoryId,
    label,
    emoji,
    style,
    hidden: false,
    enabled: true,
    position,
    refreshIntervalMs: 5 * 60_000,
    lastValue: null,
    lastName: null,
    lastUpdatedAt: null,
    milestones: {}
  };
}

function compactCount(value) {
  const number = Number(value) || 0;
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(number >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(number >= 10_000 ? 0 : 1).replace(/\.0$/, '')}K`;
  return number.toLocaleString();
}

function counterDisplayName(counter, value) {
  const label = counter.label || counter.type;
  const emoji = counter.emoji || '';
  const count = compactCount(value);
  if (/\{count\}/i.test(label)) {
    return label
      .replace(/\{count\}/gi, count)
      .replace(/\{emoji\}/gi, emoji)
      .replace(/\{type\}/gi, counter.type)
      .slice(0, 100);
  }
  if (counter.style === 'fancy') return `${emoji}\u30FB${label}: ${count}`;
  if (counter.style === 'minimal') return `${emoji} ${count} ${label}`;
  if (counter.style === 'boxed') return `\u3010${emoji}\u3011${label}: ${count}`;
  if (counter.style === 'stacked') return `${emoji} ${label} - ${count}`;
  return `${emoji} ${label}: ${count}`;
}

function estimatedCounterValue(type, guildConfig) {
  const currentChannels = [...channels.values()];
  const currentRoles = [...roles.values()];
  const memberCount = guild.approximate_member_count ?? guild.member_count ?? 0;
  const voiceChannels = currentChannels.filter((channel) => channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice).length;
  const textChannels = currentChannels.filter((channel) => channel.type !== ChannelType.GuildCategory).length;
  const activity = guildConfig.counters?.activity ?? {};
  const economyUsers = Object.values(guildConfig.expansion?.economy ?? {})
    .filter((record) => (record.wallet ?? 0) > 0 || (record.bank ?? 0) > 0 || (record.xp ?? 0) > 0)
    .length;

  return {
    total_members: memberCount,
    human_members: memberCount,
    bot_count: 0,
    online_members: 0,
    offline_members: memberCount,
    active_members: activity.activeUserIds?.length ?? 0,
    new_members_today: 0,
    messages_today: activity.messagesToday ?? 0,
    active_voice_users: 0,
    voice_channels: voiceChannels,
    boost_count: guild.premium_subscription_count ?? guild.premiumSubscriptionCount ?? 0,
    boost_level: guild.premium_tier ?? guild.premiumTier ?? 0,
    total_roles: Math.max(0, currentRoles.length - 1),
    total_channels: textChannels,
    total_emojis: guild.emojis?.length ?? 0,
    forum_posts: 0,
    server_growth: 0,
    server_age_days: Math.max(0, Math.floor((Date.now() - Number((BigInt(guild.id) >> 22n) + 1420070400000n)) / 86_400_000)),
    verified_users: 0,
    staff_count: staffRoleNames.length,
    banned_users: 0,
    tickets_open: Object.values(guildConfig.expansion?.reports ?? {}).filter((report) => report.status === 'open').length,
    active_giveaways: 0,
    giveaway_entries: 0,
    leveling_participants: economyUsers,
    level_leaders: Object.values(guildConfig.expansion?.economy ?? {}).filter((record) => (record.level ?? 0) >= 10).length,
    premium_members: 0,
    economy_users: economyUsers
  }[type] ?? 0;
}

async function ensureCounterVoiceChannels(guildConfig, permissionOverwrites) {
  const records = Object.values(guildConfig.counters?.counters ?? {}).sort((left, right) => left.position - right.position);
  let ready = 0;
  for (const counter of records) {
    const value = estimatedCounterValue(counter.type, guildConfig);
    const name = counterDisplayName(counter, value);
    let channel = counter.channelId ? channels.get(counter.channelId) : null;
    if (channel?.type !== ChannelType.GuildVoice) channel = null;
    if (!channel) {
      channel = [...channels.values()].find((candidate) =>
        candidate.type === ChannelType.GuildVoice &&
        candidate.parent_id === guildConfig.counters.categoryId &&
        (candidate.name === name || candidate.name === counter.lastName)
      ) ?? null;
    }

    if (channel) {
      const patched = await patchChannel(channel, {
        parent_id: guildConfig.counters.categoryId,
        name,
        permission_overwrites: permissionOverwrites,
        user_limit: 1
      }, 'Repair V2 counter voice channel');
      counter.channelId = patched.id;
      counter.lastName = patched.name;
      counter.lastValue = value;
      counter.lastUpdatedAt = now;
      ready += 1;
      continue;
    }

    const createdChannel = await rest.post(Routes.guildChannels(guildId), {
      body: {
        name,
        type: ChannelType.GuildVoice,
        parent_id: guildConfig.counters.categoryId,
        user_limit: 1,
        bitrate: 64000,
        permission_overwrites: permissionOverwrites
      },
      reason: `Create V2 counter channel: ${counter.id}`
    });
    channels.set(createdChannel.id, createdChannel);
    counter.channelId = createdChannel.id;
    counter.lastName = createdChannel.name;
    counter.lastValue = value;
    counter.lastUpdatedAt = now;
    created.channels += 1;
    ready += 1;
  }
  return ready;
}

async function resolveYouTubeChannel(handleOrUrl) {
  const raw = String(handleOrUrl ?? '').trim();
  const url = raw.startsWith('http') ? raw : `https://www.youtube.com/${raw.startsWith('@') ? raw : `@${raw}`}`;
  try {
    const response = await fetch(url, {
      headers: {
        'user-agent': `V2CommunityBot/${botVersion} Setup`
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const channelId = html.match(/"channelId":"(UC[a-zA-Z0-9_-]{20,})"/)?.[1]
      ?? html.match(/<meta[^>]+itemprop=["']channelId["'][^>]+content=["'](UC[a-zA-Z0-9_-]{20,})["']/i)?.[1]
      ?? html.match(/\/channel\/(UC[a-zA-Z0-9_-]{20,})/)?.[1]
      ?? null;
    const title = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1]
      ?? raw.replace(/^@/, '');
    return channelId ? { channelId, channelName: decodeHtml(title) } : null;
  } catch (error) {
    apiWarnings.push(`YouTube handle ${raw} could not be resolved: ${error.message}`);
    return null;
  }
}

function decodeHtml(value) {
  return String(value ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function reactionRoleMapping(role, emoji, label) {
  return {
    emojiKey: emoji,
    emojiDisplay: emoji,
    roleId: role.id,
    roleIds: [role.id],
    label,
    createdBy: ownerId,
    createdAt: now,
    updatedBy: ownerId,
    updatedAt: now
  };
}

function reactionRoleComponents(messageId, mappings) {
  const buttons = mappings.map((mapping, index) => ({
    type: 2,
    custom_id: `rr:${messageId}:${index}`,
    style: ButtonStyle.Secondary,
    label: mapping.label,
    emoji: { name: mapping.emojiDisplay }
  }));
  const rows = [];
  for (let index = 0; index < buttons.length; index += 5) {
    rows.push({ type: 1, components: buttons.slice(index, index + 5) });
  }
  return rows;
}

async function main() {
  await refreshGuildState();

  const communityMemberRole = roleByName('Community Member') ?? await ensureRole({
    name: 'Community Member',
    color: successColor
  });
  const testingRoles = {};
  for (const spec of testingRoleSpecs) {
    testingRoles[spec.key] = await ensureRole(spec);
  }

  await refreshGuildState();
  const knownStaffRoles = [...roles.values()].filter((role) =>
    staffRoleNames.includes(role.name) ||
    role.id === testingRoles.caseStaff.id
  );
  const staffRoleIds = uniqueIds(knownStaffRoles
    .filter((role) => !role.managed && role.id !== guildId)
    .map((role) => role.id));

  const botAllow = roleOverwrite(botUser.id, [
    'ViewChannel',
    'SendMessages',
    'ReadMessageHistory',
    'ManageChannels',
    'ManageRoles',
    'UseApplicationCommands',
    'EmbedLinks',
    'AttachFiles'
  ]);
  const staffAllow = staffRoleIds.map((roleId) => roleOverwrite(roleId, [
    'ViewChannel',
    'SendMessages',
    'ReadMessageHistory',
    'UseApplicationCommands',
    'EmbedLinks',
    'AttachFiles',
    'ManageMessages'
  ]));
  const infoOverwrites = [
    roleOverwrite(guildId, ['ViewChannel', 'ReadMessageHistory', 'UseApplicationCommands'], ['SendMessages']),
    roleOverwrite(communityMemberRole.id, ['ViewChannel', 'ReadMessageHistory', 'UseApplicationCommands'], ['SendMessages']),
    botAllow,
    ...staffAllow
  ];
  const verifyOverwrites = [
    roleOverwrite(guildId, ['ViewChannel', 'ReadMessageHistory', 'UseApplicationCommands'], ['SendMessages']),
    roleOverwrite(communityMemberRole.id, [], ['ViewChannel']),
    botAllow,
    ...staffAllow
  ];
  const communityOverwrites = [
    roleOverwrite(guildId, [], ['ViewChannel']),
    roleOverwrite(communityMemberRole.id, ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'UseApplicationCommands', 'EmbedLinks', 'AttachFiles']),
    botAllow,
    ...staffAllow
  ];
  const communityReadOnlyOverwrites = [
    roleOverwrite(guildId, [], ['ViewChannel']),
    roleOverwrite(communityMemberRole.id, ['ViewChannel', 'ReadMessageHistory', 'UseApplicationCommands'], ['SendMessages']),
    botAllow,
    ...staffAllow
  ];
  const staffOverwrites = [
    roleOverwrite(guildId, [], ['ViewChannel']),
    roleOverwrite(communityMemberRole.id, [], ['ViewChannel']),
    userOverwrite(ownerId, ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'UseApplicationCommands', 'EmbedLinks', 'AttachFiles', 'ManageMessages']),
    botAllow,
    ...staffAllow
  ];
  const counterOverwrites = [
    roleOverwrite(guildId, [], ['ViewChannel', 'Connect', 'Speak', 'Stream']),
    roleOverwrite(communityMemberRole.id, ['ViewChannel'], ['Connect', 'Speak', 'Stream']),
    botAllow,
    ...staffAllow
  ];

  const categories = {};
  for (const spec of categorySpecs) {
    const overwrites = spec.key === 'info'
      ? infoOverwrites
      : spec.key === 'community' || spec.key === 'labs' || spec.key === 'creator'
        ? communityOverwrites
        : spec.key === 'counters'
          ? counterOverwrites
          : staffOverwrites;
    categories[spec.key] = await ensureCategory(spec.name, overwrites);
  }

  const channelGroups = {};
  channelGroups.info = {};
  for (const spec of publicInfoChannelSpecs) {
    channelGroups.info[spec.key] = await ensureTextChannel(
      spec,
      categories.info.id,
      spec.key === 'verification' ? verifyOverwrites : infoOverwrites
    );
  }

  channelGroups.community = {};
  for (const spec of communityChannelSpecs) {
    channelGroups.community[spec.key] = await ensureTextChannel(
      spec,
      categories.community.id,
      spec.readOnly ? communityReadOnlyOverwrites : communityOverwrites
    );
  }

  channelGroups.labs = {};
  for (const spec of labChannelSpecs) {
    channelGroups.labs[spec.key] = await ensureTextChannel(
      spec,
      categories.labs.id,
      spec.readOnly ? communityReadOnlyOverwrites : communityOverwrites
    );
  }

  channelGroups.creator = {};
  for (const spec of creatorChannelSpecs) {
    channelGroups.creator[spec.key] = await ensureTextChannel(
      spec,
      categories.creator.id,
      spec.readOnly ? communityReadOnlyOverwrites : communityOverwrites
    );
  }

  channelGroups.staff = {};
  for (const spec of staffChannelSpecs) {
    channelGroups.staff[spec.key] = await ensureTextChannel(spec, categories.staff.id, staffOverwrites);
  }

  const verifyMessage = await ensureBotMessage(channelGroups.info.verification.id, 'Verify To Enter', () => ({
    embeds: [
      embed(
        'Verify To Enter',
        `Click the button below to receive <@&${communityMemberRole.id}> and unlock the V2 testing hub.`,
        [
          { name: 'What opens', value: 'Community testing, module labs, creator alerts, roles, profiles, economy, and games.', inline: false },
          { name: 'Staff areas', value: 'Logs, reports, security, and private cases stay hidden from normal members.', inline: false }
        ],
        successColor
      )
    ],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            custom_id: 'verify:role',
            label: 'Verify Me',
            style: ButtonStyle.Success
          }
        ]
      }
    ],
    allowed_mentions: { parse: [] }
  }));
  await deleteDuplicateBotPanels(channelGroups.info.verification.id, verifyMessage.id, (message) =>
    message.components?.some((row) => row.components?.some((component) => component.custom_id === 'verify:role')) ||
    message.embeds?.some((messageEmbed) => /verify/i.test(messageEmbed.title ?? ''))
  );

  const roleMappings = [
    reactionRoleMapping(testingRoles.streamAlerts, '\u{1F7E3}', 'Stream Alerts'),
    reactionRoleMapping(testingRoles.youtubeAlerts, '\u{1F534}', 'YouTube Alerts'),
    reactionRoleMapping(testingRoles.tiktokAlerts, '\u{1F3B5}', 'TikTok Alerts'),
    reactionRoleMapping(testingRoles.giveawayAlerts, '\u{1F381}', 'Giveaway Alerts'),
    reactionRoleMapping(testingRoles.betaUpdates, '\u2728', 'Beta Updates'),
    reactionRoleMapping(testingRoles.tester, '\u{1F9EA}', 'V2 Tester'),
    reactionRoleMapping(testingRoles.automodTester, '\u{1F6E1}', 'AutoMod Tester')
  ];

  const reactionMessage = await ensureBotMessage(channelGroups.community.roles.id, 'V2 Testing Roles', (existing) => {
    const messageId = existing?.id ?? 'pending';
    return {
      embeds: [
        embed(
          'V2 Testing Roles',
          'Choose the testing roles you want. These roles are safe member roles and can be toggled any time.',
          roleMappings.map((mapping) => ({
            name: `${mapping.emojiDisplay} ${mapping.label}`,
            value: `<@&${mapping.roleId}>`,
            inline: true
          })),
          infoColor
        )
      ],
      components: messageId === 'pending' ? [] : reactionRoleComponents(messageId, roleMappings),
      allowed_mentions: { parse: [] }
    };
  });
  await rest.patch(Routes.channelMessage(channelGroups.community.roles.id, reactionMessage.id), {
    body: {
      embeds: [
        embed(
          'V2 Testing Roles',
          'Choose the testing roles you want. These roles are safe member roles and can be toggled any time.',
          roleMappings.map((mapping) => ({
            name: `${mapping.emojiDisplay} ${mapping.label}`,
            value: `<@&${mapping.roleId}>`,
            inline: true
          })),
          infoColor
        )
      ],
      components: reactionRoleComponents(reactionMessage.id, roleMappings),
      allowed_mentions: { parse: [] }
    },
    reason: 'Attach V2 reaction role button IDs'
  });

  const startMessage = await ensureBotMessage(channelGroups.info.startHere.id, 'V2 Showcase Testing Hub', () => ({
    embeds: [
      embed(
        'V2 Showcase Testing Hub',
        'This server is configured as the official full-module testing environment for V2.',
        [
          { name: 'Start', value: `<#${channelGroups.info.verification.id}> -> verify, then use <#${channelGroups.community.dashboard.id}> and <#${channelGroups.community.commands.id}>.`, inline: false },
          { name: 'Community First', value: 'Profiles, roles, counters, welcomes, socials, suggestions, economy, games, creator alerts, and utility systems are ready to test.', inline: false },
          { name: 'Staff Systems', value: `Logs: <#${channelGroups.staff.botLogs.id}> | Security: <#${channelGroups.staff.security.id}> | Cases: <#${channelGroups.staff.caseLogs.id}>`, inline: false }
        ],
        setupColor
      )
    ],
    allowed_mentions: { parse: [] }
  }));

  await ensureBotMessage(channelGroups.community.dashboard.id, 'Dashboard Ready', () => ({
    embeds: [
      embed(
        'Dashboard Ready',
        'The centralized `/dashboard` hub is the main control center for this server.',
        [
          { name: 'Community', value: 'Welcome, verification, roles, counters, socials, suggestions, profiles, economy, games, and creator alerts.', inline: false },
          { name: 'Advanced', value: 'Moderation, AutoMod, logs, protection, cases, and diagnostics stay behind staff/admin permissions.', inline: false },
          { name: 'Test Flow', value: 'Open `/dashboard`, switch sections, verify buttons/select menus, then check logs in staff channels.', inline: false }
        ],
        infoColor
      )
    ],
    allowed_mentions: { parse: [] }
  }));

  await ensureBotMessage(channelGroups.community.socials.id, 'Official Socials', () => ({
    embeds: [
      embed(
        'Official Socials',
        'Creator and community social links configured for testing.',
        [
          { name: '\u{1F7E3} Twitch', value: '[itsmspro](https://www.twitch.tv/itsmspro)', inline: true },
          { name: '\u{1F534} YouTube', value: '[ItsMsproLive](https://www.youtube.com/@ItsMsproLive)', inline: true },
          { name: '\u{1F3B5} TikTok', value: '[itsmspro_live](https://www.tiktok.com/@itsmspro_live)', inline: true }
        ],
        setupColor
      )
    ],
    allowed_mentions: { parse: [] }
  }));

  await ensureBotMessage(channelGroups.creator.streamDebug.id, 'Creator Alert Testing', () => ({
    embeds: [
      embed(
        'Creator Alert Testing',
        'Twitch, YouTube, and TikTok alerts are configured to use notification roles instead of @everyone.',
        [
          { name: 'Twitch', value: `<#${channelGroups.creator.twitch.id}> using <@&${testingRoles.streamAlerts.id}>`, inline: true },
          { name: 'YouTube', value: `<#${channelGroups.creator.youtube.id}> using <@&${testingRoles.youtubeAlerts.id}>`, inline: true },
          { name: 'TikTok', value: `<#${channelGroups.creator.tiktok.id}> using <@&${testingRoles.tiktokAlerts.id}>`, inline: true },
          { name: 'Safe Checks', value: '`/twitch preview`, `/youtube preview`, `/tiktok preview`, and silent `/check announce:false` are the safest tests.', inline: false }
        ],
        warningColor
      )
    ],
    allowed_mentions: { parse: [] }
  }));

  await ensureBotMessage(channelGroups.labs.automod.id, 'AutoMod Test Area', () => ({
    embeds: [
      embed(
        'AutoMod Test Area',
        'AutoMod is configured on medium intensity with timeout escalation for this server.',
        [
          { name: 'How To Test', value: 'Use controlled test messages here. Staff can review results in mod logs.', inline: false },
          { name: 'Media Rule', value: 'Images and GIFs are blocked in this channel to verify channel-specific media controls.', inline: false }
        ],
        warningColor
      )
    ],
    allowed_mentions: { parse: [] }
  }));

  const youtubeResolved = await resolveYouTubeChannel('@ItsMsproLive');
  const config = readConfig();
  config.version = 2;
  config.adminUserIds = uniqueIds([...(config.adminUserIds ?? []), ownerId]);
  config.devUserIds = uniqueIds([ownerId]);
  config.disabledCommands = [];
  config.guilds ??= {};
  const guildConfig = config.guilds[guildId] ?? {};
  const existingCounters = guildConfig.counters ?? {};
  const existingActivity = existingCounters.activity ?? {};
  const existingCaseSystem = guildConfig.caseSystem ?? {};

  guildConfig.logsEnabled = true;
  guildConfig.logChannelId = channelGroups.staff.botLogs.id;
  guildConfig.enabledLogCategories = [
    'messages',
    'members',
    'moderation',
    'channels',
    'roles',
    'voice',
    'sticky',
    'twitch',
    'youtube',
    'tiktok',
    'dashboard',
    'dev'
  ];
  guildConfig.adminRoleIds = uniqueIds(staffRoleIds);
  guildConfig.lockdownRoleId = communityMemberRole.id;
  guildConfig.disabledCommands = [];

  guildConfig.verification = {
    enabled: true,
    roleId: communityMemberRole.id,
    channelId: channelGroups.info.verification.id,
    messageId: verifyMessage.id,
    message: `Click Verify to receive <@&${communityMemberRole.id}> and unlock the V2 testing hub.`,
    visibleChannelIds: [
      categories.info.id,
      channelGroups.info.startHere.id,
      channelGroups.info.rules.id,
      channelGroups.info.announcements.id,
      channelGroups.info.changelog.id,
      channelGroups.info.uptime.id
    ],
    autoHideChannels: false,
    autoSyncNewChannels: false,
    captchaEnabled: false,
    timeoutMinutes: 0,
    autoKickUnverified: false,
    minAccountAgeDays: 0,
    unverifiedRoleId: null,
    updatedBy: ownerId,
    updatedAt: now
  };

  guildConfig.welcome = {
    enabled: true,
    channelId: channelGroups.community.welcome.id,
    message: `Welcome to {server}, {user}! You are member #{count}. Grab testing roles in <#${channelGroups.community.roles.id}> and try commands in <#${channelGroups.community.commands.id}>.`,
    updatedBy: ownerId,
    updatedAt: now
  };

  guildConfig.joinChat = {
    enabled: true,
    channelId: channelGroups.labs.aiChat.id,
    enabledBy: ownerId,
    enabledAt: now
  };

  guildConfig.automod = {
    intensity: 'medium',
    escalationMode: 'timeout',
    testUserIds: [ownerId],
    mediaRules: {
      channels: {
        [channelGroups.labs.automod.id]: {
          allowImages: false,
          allowGifs: false
        }
      },
      categories: {}
    }
  };

  guildConfig.protection = {
    level: 'watch',
    autoLockdown: true,
    updatedBy: ownerId,
    updatedAt: now
  };

  guildConfig.caseSystem = {
    ...existingCaseSystem,
    enabled: true,
    categoryId: categories.cases.id,
    logChannelId: channelGroups.staff.caseLogs.id,
    staffRoleIds,
    staffUserIds: [ownerId],
    archiveOnClose: true,
    transcriptOnClose: false,
    nextCaseNumber: existingCaseSystem.nextCaseNumber ?? 1,
    cases: existingCaseSystem.cases ?? {}
  };

  guildConfig.socialLinks = {
    title: guild.name,
    description: 'Official Production community links.',
    links: [
      socialLink('Twitch', 'https://www.twitch.tv/itsmspro', 'Live streams and creator updates.'),
      socialLink('YouTube', 'https://www.youtube.com/@ItsMsproLive', 'Live VODs and video updates.'),
      socialLink('TikTok', 'https://www.tiktok.com/@itsmspro_live', 'Short-form clips and highlights.')
    ],
    updatedBy: ownerId,
    updatedAt: now
  };

  guildConfig.twitch = {
    channelName: 'itsmspro',
    announceChannelId: channelGroups.creator.twitch.id,
    enabled: true,
    mentionRoleId: testingRoles.streamAlerts.id,
    notifyEveryone: false,
    customMessage: 'Production live test alert.',
    currentlyLive: false,
    lastStreamId: guildConfig.twitch?.lastStreamId ?? null,
    lastAnnouncedAt: guildConfig.twitch?.lastAnnouncedAt ?? null,
    lastStreamTitle: guildConfig.twitch?.lastStreamTitle ?? null,
    lastStreamGame: guildConfig.twitch?.lastStreamGame ?? null,
    lastStreamStartedAt: guildConfig.twitch?.lastStreamStartedAt ?? null,
    lastLiveMessageId: guildConfig.twitch?.lastLiveMessageId ?? null,
    lastEndedStreamId: guildConfig.twitch?.lastEndedStreamId ?? null,
    lastEndedAt: guildConfig.twitch?.lastEndedAt ?? null,
    lastVodUrl: guildConfig.twitch?.lastVodUrl ?? null,
    lastVodTitle: guildConfig.twitch?.lastVodTitle ?? null,
    streamers: [
      {
        channelName: 'itsmspro',
        announceChannelId: channelGroups.creator.twitch.id,
        enabled: true,
        mentionRoleId: testingRoles.streamAlerts.id,
        notifyEveryone: false,
        customMessage: 'Production live test alert.',
        currentlyLive: false,
        lastStreamId: guildConfig.twitch?.streamers?.find((entry) => entry.channelName === 'itsmspro')?.lastStreamId ?? null,
        lastAnnouncedAt: guildConfig.twitch?.streamers?.find((entry) => entry.channelName === 'itsmspro')?.lastAnnouncedAt ?? null,
        lastStreamTitle: guildConfig.twitch?.streamers?.find((entry) => entry.channelName === 'itsmspro')?.lastStreamTitle ?? null,
        lastStreamGame: guildConfig.twitch?.streamers?.find((entry) => entry.channelName === 'itsmspro')?.lastStreamGame ?? null,
        lastStreamStartedAt: guildConfig.twitch?.streamers?.find((entry) => entry.channelName === 'itsmspro')?.lastStreamStartedAt ?? null,
        lastLiveMessageId: guildConfig.twitch?.streamers?.find((entry) => entry.channelName === 'itsmspro')?.lastLiveMessageId ?? null,
        lastEndedStreamId: guildConfig.twitch?.streamers?.find((entry) => entry.channelName === 'itsmspro')?.lastEndedStreamId ?? null,
        lastEndedAt: guildConfig.twitch?.streamers?.find((entry) => entry.channelName === 'itsmspro')?.lastEndedAt ?? null,
        lastVodUrl: guildConfig.twitch?.streamers?.find((entry) => entry.channelName === 'itsmspro')?.lastVodUrl ?? null,
        lastVodTitle: guildConfig.twitch?.streamers?.find((entry) => entry.channelName === 'itsmspro')?.lastVodTitle ?? null,
        lastDuplicateCleanupStreamId: guildConfig.twitch?.streamers?.find((entry) => entry.channelName === 'itsmspro')?.lastDuplicateCleanupStreamId ?? null
      }
    ]
  };

  guildConfig.youtube = {
    channelId: youtubeResolved?.channelId ?? guildConfig.youtube?.channelId ?? null,
    channelName: youtubeResolved?.channelName ?? guildConfig.youtube?.channelName ?? 'ItsMsproLive',
    announceChannelId: channelGroups.creator.youtube.id,
    enabled: Boolean(youtubeResolved?.channelId ?? guildConfig.youtube?.channelId),
    mentionRoleId: testingRoles.youtubeAlerts.id,
    notifyEveryone: false,
    customMessage: 'New YouTube test alert.',
    lastVideoId: guildConfig.youtube?.lastVideoId ?? null,
    lastVideoTitle: guildConfig.youtube?.lastVideoTitle ?? null,
    lastVideoUrl: guildConfig.youtube?.lastVideoUrl ?? null,
    lastVideoPublishedAt: guildConfig.youtube?.lastVideoPublishedAt ?? null,
    lastAnnouncedAt: guildConfig.youtube?.lastAnnouncedAt ?? null,
    announceNextExisting: false,
    updatedBy: ownerId,
    updatedAt: now
  };

  guildConfig.tiktok = {
    username: 'itsmspro_live',
    displayName: 'itsmspro_live',
    profileUrl: 'https://www.tiktok.com/@itsmspro_live',
    avatarUrl: guildConfig.tiktok?.avatarUrl ?? null,
    announceChannelId: channelGroups.creator.tiktok.id,
    enabled: true,
    mentionRoleId: testingRoles.tiktokAlerts.id,
    notifyEveryone: false,
    customMessage: 'New TikTok test alert.',
    lastVideoId: guildConfig.tiktok?.lastVideoId ?? null,
    lastVideoTitle: guildConfig.tiktok?.lastVideoTitle ?? null,
    lastVideoUrl: guildConfig.tiktok?.lastVideoUrl ?? null,
    lastVideoPublishedAt: guildConfig.tiktok?.lastVideoPublishedAt ?? null,
    lastAnnouncedAt: guildConfig.tiktok?.lastAnnouncedAt ?? null,
    announceNextExisting: false,
    updatedBy: ownerId,
    updatedAt: now
  };

  guildConfig.reactionRoles = {
    panels: {
      [reactionMessage.id]: {
        messageId: reactionMessage.id,
        channelId: channelGroups.community.roles.id,
        title: 'V2 Testing Roles',
        description: 'Choose the testing roles you want. These roles are safe member roles and can be toggled any time.',
        mode: 'toggle',
        removeOnUnreact: true,
        mappings: roleMappings,
        createdBy: ownerId,
        createdAt: now,
        updatedBy: ownerId,
        updatedAt: now
      }
    }
  };

  guildConfig.stickyMessages = {
    ...(guildConfig.stickyMessages ?? {}),
    [channelGroups.community.sticky.id]: {
      content: 'V2 sticky test: this message should repost after every new message in this channel.',
      createdBy: ownerId,
      updatedAt: now,
      lastMessageId: guildConfig.stickyMessages?.[channelGroups.community.sticky.id]?.lastMessageId ?? null,
      lastPostedAt: guildConfig.stickyMessages?.[channelGroups.community.sticky.id]?.lastPostedAt ?? null
    }
  };

  guildConfig.counters = {
    enabled: true,
    categoryId: categories.counters.id,
    refreshIntervalMs: 5 * 60_000,
    hiddenByDefault: false,
    counters: {
      total_members: counterRecord('total_members', 'total_members', 'Members', '\u{1F465}', categories.counters.id, 1),
      human_members: counterRecord('human_members', 'human_members', 'Humans', '\u{1F464}', categories.counters.id, 2),
      bot_count: counterRecord('bot_count', 'bot_count', 'Bots', '\u{1F916}', categories.counters.id, 3),
      online_members: counterRecord('online_members', 'online_members', 'Online', '\u{1F7E2}', categories.counters.id, 4),
      messages_today: counterRecord('messages_today', 'messages_today', 'Messages Today', '\u{1F4AC}', categories.counters.id, 5),
      active_members: counterRecord('active_members', 'active_members', 'Active', '\u26A1', categories.counters.id, 6),
      active_voice_users: counterRecord('active_voice_users', 'active_voice_users', 'In Voice', '\u{1F50A}', categories.counters.id, 7),
      boost_count: counterRecord('boost_count', 'boost_count', 'Boosts', '\u{1F680}', categories.counters.id, 8),
      total_channels: counterRecord('total_channels', 'total_channels', 'Channels', '\u{1F5C2}', categories.counters.id, 9),
      total_roles: counterRecord('total_roles', 'total_roles', 'Roles', '\u{1F3AD}', categories.counters.id, 10),
      verified_users: counterRecord('verified_users', 'verified_users', 'Verified', '\u2705', categories.counters.id, 11),
      staff_count: counterRecord('staff_count', 'staff_count', 'Staff', '\u{1F6E1}', categories.counters.id, 12),
      tickets_open: counterRecord('tickets_open', 'tickets_open', 'Reports Open', '\u{1F39F}', categories.counters.id, 13),
      leveling_participants: counterRecord('leveling_participants', 'leveling_participants', 'Leveling', '\u{1F4C8}', categories.counters.id, 14),
      economy_users: counterRecord('economy_users', 'economy_users', 'Economy', '\u{1FA99}', categories.counters.id, 15)
    },
    activity: {
      date: existingActivity.date ?? new Date().toISOString().slice(0, 10),
      messagesToday: existingActivity.messagesToday ?? 0,
      activeUserIds: existingActivity.activeUserIds ?? [],
      peakOnline: existingActivity.peakOnline ?? 0,
      peakVoice: existingActivity.peakVoice ?? 0,
      history: existingActivity.history ?? []
    },
    lastRefreshAt: existingCounters.lastRefreshAt ?? null
  };

  guildConfig.communityMemory = {
    ...(guildConfig.communityMemory ?? {}),
    tone: 'Production testing hub: upbeat, practical, community-first, and helpful.',
    topics: ['bot testing', 'community setup', 'creator alerts', 'moderation safety', 'dashboard'],
    phrases: ['test it in v2-dashboard', 'check the logs', 'try the role panel'],
    updatedAt: now
  };

  guildConfig.expansion = {
    ...(guildConfig.expansion ?? {}),
    profiles: {
      ...(guildConfig.expansion?.profiles ?? {}),
      [ownerId]: {
        bio: 'Developer and owner of the V2 community bot testing hub.',
        status: 'Testing the full V2 showcase.',
        about: 'This profile is seeded so profile cards, socials, reputation, and community systems have a real test record.',
        theme: 'production-red',
        background: null,
        color: '#FF3344',
        showcase: 'V2 production revamp',
        socials: 'Discord, Twitch, YouTube, TikTok',
        portfolio: 'Discord bot development and server systems.',
        partnerId: null,
        friends: [],
        likes: [],
        thanks: 0,
        vouches: 1,
        endorsements: { developer: 1 },
        collectibles: ['V2 Founder Badge', 'Testing Hub Badge'],
        updatedAt: now
      }
    },
    economy: {
      ...(guildConfig.expansion?.economy ?? {}),
      [ownerId]: {
        wallet: 2500,
        bank: 5000,
        xp: 1250,
        level: 5,
        inventory: {
          'testing-token': 3,
          'v2-crate': 1
        },
        cooldowns: {},
        stats: {
          commands: 1,
          tests: 1
        }
      }
    },
    reports: guildConfig.expansion?.reports ?? {},
    automationRules: {
      ...(guildConfig.expansion?.automationRules ?? {}),
      welcome_hint: {
        id: 'welcome_hint',
        type: 'autoresponder',
        summary: `Point new testers toward <#${channelGroups.community.dashboard.id}> and <#${channelGroups.community.commands.id}>.`,
        createdBy: ownerId,
        createdAt: now
      }
    },
    security: {
      panic: false,
      raidMode: false,
      updatedBy: ownerId,
      updatedAt: now
    }
  };

  const counterChannelsReady = await ensureCounterVoiceChannels(guildConfig, counterOverwrites);

  config.guilds[guildId] = guildConfig;
  config.uptimeStatus = {
    ...(config.uptimeStatus ?? {}),
    guildId,
    channelId: channelGroups.info.uptime.id,
    messageId: config.uptimeStatus?.guildId === guildId ? config.uptimeStatus?.messageId ?? null : null
  };
  config.lastBotVersion = botVersion;
  writeConfig(config);

  console.log(JSON.stringify({
    guild: `${guild.name} (${guild.id})`,
    categoriesCreated: created.categories,
    channelsCreated: created.channels,
    rolesCreated: created.roles,
    messagesCreated: created.messages,
    messagesPatched: created.patchedMessages,
    verificationChannelId: channelGroups.info.verification.id,
    verificationRoleId: communityMemberRole.id,
    reactionPanelMessageId: reactionMessage.id,
    dashboardChannelId: channelGroups.community.dashboard.id,
    logChannelId: channelGroups.staff.botLogs.id,
    counterCategoryId: categories.counters.id,
    counterChannelsReady,
    youtubeResolved: Boolean(youtubeResolved?.channelId),
    warnings: apiWarnings
  }, null, 2));

  void startMessage;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
