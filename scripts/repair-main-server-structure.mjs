import fs from 'node:fs';
import path from 'node:path';
import {
  ChannelType,
  PermissionFlagsBits,
  PermissionsBitField,
  REST,
  Routes
} from 'discord.js';
import { loadLocalEnv } from '../src/env.js';

loadLocalEnv();

const guildId = '1505751652655693926';
const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const configPath = path.join(process.cwd(), 'data', process.env.BOT_CONFIG_FILE?.trim() || 'config.json');
const now = Date.now();

if (!token) throw new Error('DISCORD_TOKEN is missing.');
if (!clientId) throw new Error('DISCORD_CLIENT_ID is missing.');

const rest = new REST({ version: '10' }).setToken(token);
let guild = null;
let botUser = null;
let channels = [];
let roles = [];
const usedChannelIds = new Set();
const summary = {
  categoriesRenamed: [],
  categoriesCreated: [],
  categoriesDeletedEmpty: [],
  channelsRenamed: [],
  channelsMoved: [],
  channelsCreated: [],
  channelsPreserved: [],
  rolesRenamed: [],
  rolesCreated: [],
  orphanCountersDeleted: [],
  configUpdated: false,
  warnings: []
};

const standardCategoryNames = new Set([
  'INFORMATION',
  'BOT CONTROL',
  'LOGS',
  'TESTING AREA',
  'GENERAL',
  'DEVELOPER ZONE',
  'STATUS COUNTERS'
]);

function readConfig() {
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function writeConfig(config) {
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

async function refreshState() {
  [guild, botUser, channels, roles] = await Promise.all([
    rest.get(Routes.guild(guildId)),
    rest.get(Routes.user()),
    rest.get(Routes.guildChannels(guildId)),
    rest.get(Routes.guildRoles(guildId))
  ]);
}

function normalizeName(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[ㆍ・•|#\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function channelTypeName(type) {
  return {
    [ChannelType.GuildCategory]: 'category',
    [ChannelType.GuildText]: 'text',
    [ChannelType.GuildAnnouncement]: 'announcement',
    [ChannelType.GuildVoice]: 'voice',
    [ChannelType.GuildStageVoice]: 'stage',
    [ChannelType.GuildForum]: 'forum'
  }[type] ?? String(type);
}

function roleByName(name, predicate = () => true) {
  const clean = String(name).toLowerCase();
  return roles.find((role) => role.name.toLowerCase() === clean && predicate(role)) ?? null;
}

function findRole(names, predicate = () => true) {
  for (const name of names) {
    const role = roleByName(name, predicate);
    if (role) return role;
  }
  return null;
}

function hasPermission(role, permission) {
  return new PermissionsBitField(BigInt(role.permissions ?? 0)).has(permission);
}

async function ensureRole({ targetName, candidates = [], color = 0, permissions = 0n, predicate = () => true }) {
  const existing = roleByName(targetName, predicate);
  if (existing) return existing;

  const candidate = findRole(candidates, predicate);
  if (candidate && !candidate.managed) {
    const patched = await rest.patch(Routes.guildRole(guildId, candidate.id), {
      body: { name: targetName },
      reason: 'Main server recovery: align role names without duplicating roles'
    });
    summary.rolesRenamed.push(`${candidate.name} -> ${targetName}`);
    await refreshState();
    return roles.find((role) => role.id === patched.id) ?? patched;
  }

  const created = await rest.post(Routes.guildRoles(guildId), {
    body: {
      name: targetName,
      color,
      hoist: false,
      mentionable: false,
      permissions: permissions.toString()
    },
    reason: 'Main server recovery: create missing standard role'
  });
  summary.rolesCreated.push(targetName);
  await refreshState();
  return roles.find((role) => role.id === created.id) ?? created;
}

function findCategory(names) {
  const wanted = names.map(normalizeName);
  return channels.find((channel) =>
    channel.type === ChannelType.GuildCategory &&
    wanted.includes(normalizeName(channel.name))
  ) ?? null;
}

function findChannel(names, allowedTypes = [ChannelType.GuildText, ChannelType.GuildAnnouncement]) {
  const wanted = names.map(normalizeName);
  return channels.find((channel) =>
    allowedTypes.includes(channel.type) &&
    wanted.includes(normalizeName(channel.name)) &&
    !usedChannelIds.has(channel.id)
  ) ?? null;
}

function permissionBits(names) {
  return names.reduce((bits, name) => bits | BigInt(PermissionFlagsBits[name]), 0n).toString();
}

function roleOverwrite(id, allow = [], deny = []) {
  return {
    id,
    type: 0,
    allow: permissionBits(allow),
    deny: permissionBits(deny)
  };
}

function userOverwrite(id, allow = [], deny = []) {
  return {
    id,
    type: 1,
    allow: permissionBits(allow),
    deny: permissionBits(deny)
  };
}

function overwritesFor({ kind, roleIds }) {
  const {
    communityMemberId,
    adminIds,
    developerIds,
    moderatorIds,
    testerIds,
    staffIds
  } = roleIds;
  const botAllow = userOverwrite(botUser.id, [
    'ViewChannel',
    'SendMessages',
    'ReadMessageHistory',
    'UseApplicationCommands',
    'EmbedLinks',
    'AttachFiles',
    'ManageMessages',
    'ManageChannels',
    'ManageRoles'
  ]);
  const staffAllow = (ids) => ids.map((id) => roleOverwrite(id, [
    'ViewChannel',
    'SendMessages',
    'ReadMessageHistory',
    'UseApplicationCommands',
    'EmbedLinks',
    'AttachFiles',
    'ManageMessages'
  ]));

  if (kind === 'info') {
    return [
      roleOverwrite(guildId, ['ViewChannel', 'ReadMessageHistory', 'UseApplicationCommands'], ['SendMessages']),
      communityMemberId ? roleOverwrite(communityMemberId, ['ViewChannel', 'ReadMessageHistory', 'UseApplicationCommands'], ['SendMessages']) : null,
      botAllow,
      ...staffAllow(staffIds)
    ].filter(Boolean);
  }

  if (kind === 'general' || kind === 'testing') {
    return [
      roleOverwrite(guildId, [], ['ViewChannel']),
      communityMemberId ? roleOverwrite(communityMemberId, ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'UseApplicationCommands', 'EmbedLinks', 'AttachFiles']) : null,
      ...staffAllow([...staffIds, ...testerIds]),
      botAllow
    ].filter(Boolean);
  }

  if (kind === 'control') {
    return [
      roleOverwrite(guildId, [], ['ViewChannel']),
      communityMemberId ? roleOverwrite(communityMemberId, [], ['ViewChannel']) : null,
      ...staffAllow([...adminIds, ...developerIds]),
      botAllow
    ].filter(Boolean);
  }

  if (kind === 'logs') {
    return [
      roleOverwrite(guildId, [], ['ViewChannel']),
      communityMemberId ? roleOverwrite(communityMemberId, [], ['ViewChannel']) : null,
      ...staffAllow([...adminIds, ...developerIds, ...moderatorIds]),
      botAllow
    ].filter(Boolean);
  }

  if (kind === 'dev') {
    return [
      roleOverwrite(guildId, [], ['ViewChannel']),
      communityMemberId ? roleOverwrite(communityMemberId, [], ['ViewChannel']) : null,
      ...staffAllow([...adminIds, ...developerIds]),
      botAllow
    ].filter(Boolean);
  }

  if (kind === 'counters') {
    return [
      roleOverwrite(guildId, [], ['ViewChannel', 'Connect', 'Speak', 'Stream']),
      communityMemberId ? roleOverwrite(communityMemberId, ['ViewChannel'], ['Connect', 'Speak', 'Stream']) : null,
      ...staffAllow(staffIds),
      botAllow
    ].filter(Boolean);
  }

  return [];
}

async function ensureCategory({ targetName, candidates, overwrites }) {
  let category = findCategory([targetName]) ?? findCategory(candidates);
  if (category) {
    const previousName = category.name;
    category = await rest.patch(Routes.channel(category.id), {
      body: {
        name: targetName,
        permission_overwrites: overwrites
      },
      reason: 'Main server recovery: align category'
    });
    if (previousName !== targetName) summary.categoriesRenamed.push(`${previousName} -> ${targetName}`);
    await refreshState();
    return channels.find((channel) => channel.id === category.id) ?? category;
  }

  category = await rest.post(Routes.guildChannels(guildId), {
    body: {
      name: targetName,
      type: ChannelType.GuildCategory,
      permission_overwrites: overwrites
    },
    reason: 'Main server recovery: create missing standard category'
  });
  summary.categoriesCreated.push(targetName);
  await refreshState();
  return channels.find((channel) => channel.id === category.id) ?? category;
}

async function ensureTextChannel({ targetName, candidates = [], category, overwrites, topic }) {
  let channel = findChannel([targetName], [ChannelType.GuildText, ChannelType.GuildAnnouncement])
    ?? findChannel(candidates, [ChannelType.GuildText, ChannelType.GuildAnnouncement]);

  if (channel) {
    const previousName = channel.name;
    const previousParent = channel.parent_id;
    channel = await rest.patch(Routes.channel(channel.id), {
      body: {
        name: targetName,
        parent_id: category.id,
        topic,
        permission_overwrites: overwrites
      },
      reason: 'Main server recovery: align channel'
    });
    usedChannelIds.add(channel.id);
    if (previousName !== targetName) summary.channelsRenamed.push(`${previousName} -> ${targetName}`);
    if (previousParent !== category.id) summary.channelsMoved.push(`${targetName} -> ${category.name}`);
    await refreshState();
    return channels.find((entry) => entry.id === channel.id) ?? channel;
  }

  channel = await rest.post(Routes.guildChannels(guildId), {
    body: {
      name: targetName,
      type: ChannelType.GuildText,
      parent_id: category.id,
      topic,
      permission_overwrites: overwrites
    },
    reason: 'Main server recovery: create missing standard channel'
  });
  usedChannelIds.add(channel.id);
  summary.channelsCreated.push(`${targetName} -> ${category.name}`);
  await refreshState();
  return channels.find((entry) => entry.id === channel.id) ?? channel;
}

async function moveVoiceChannel({ targetName, candidates, category, overwrites }) {
  let channel = findChannel([targetName], [ChannelType.GuildVoice, ChannelType.GuildStageVoice])
    ?? findChannel(candidates, [ChannelType.GuildVoice, ChannelType.GuildStageVoice]);
  if (!channel) return null;

  const previousParent = channel.parent_id;
  const previousName = channel.name;
  channel = await rest.patch(Routes.channel(channel.id), {
    body: {
      name: targetName,
      parent_id: category.id,
      permission_overwrites: overwrites
    },
    reason: 'Main server recovery: move existing voice channel'
  });
  usedChannelIds.add(channel.id);
  if (previousName !== targetName) summary.channelsRenamed.push(`${previousName} -> ${targetName}`);
  if (previousParent !== category.id) summary.channelsMoved.push(`${targetName} -> ${category.name}`);
  await refreshState();
  return channels.find((entry) => entry.id === channel.id) ?? channel;
}

async function moveChannelsMatching({ category, overwrites, pattern, excludeIds = [] }) {
  const excluded = new Set(excludeIds);
  const matches = channels.filter((channel) =>
    channel.type !== ChannelType.GuildCategory &&
    !usedChannelIds.has(channel.id) &&
    !excluded.has(channel.id) &&
    pattern.test(normalizeName(channel.name))
  );

  for (const channel of matches) {
    const previousParent = channel.parent_id;
    await rest.patch(Routes.channel(channel.id), {
      body: {
        parent_id: category.id,
        permission_overwrites: overwrites
      },
      reason: 'Main server recovery: preserve related existing channel in closest category'
    }).catch((error) => summary.warnings.push(`Could not move ${channel.name}: ${error.message}`));
    usedChannelIds.add(channel.id);
    if (previousParent !== category.id) summary.channelsMoved.push(`${channel.name} -> ${category.name}`);
  }
  await refreshState();
}

async function deleteEmptyLegacyCategories() {
  await refreshState();
  const childrenByParent = new Map();
  for (const channel of channels) {
    if (channel.type === ChannelType.GuildCategory || !channel.parent_id) continue;
    childrenByParent.set(channel.parent_id, (childrenByParent.get(channel.parent_id) ?? 0) + 1);
  }

  for (const category of channels.filter((channel) => channel.type === ChannelType.GuildCategory)) {
    if (standardCategoryNames.has(category.name)) continue;
    if ((childrenByParent.get(category.id) ?? 0) > 0) continue;
    if (!/^(v2|text channels|voice channels|dashboard|staff team)/i.test(category.name)) continue;
    await rest.delete(Routes.channel(category.id), {
      reason: 'Main server recovery: remove empty legacy category only'
    }).then(() => summary.categoriesDeletedEmpty.push(category.name))
      .catch((error) => summary.warnings.push(`Could not delete empty category ${category.name}: ${error.message}`));
  }
  await refreshState();
}

async function deleteOrphanCounterVoiceChannels(counterCategoryId, referencedCounterChannelIds) {
  const referenced = new Set(referencedCounterChannelIds.filter(Boolean));
  const pattern = /members|humans|bots|online|messages|active|voice|boosts|channels|roles|verified|staff|reports|leveling|economy/i;
  for (const channel of channels) {
    if (channel.type !== ChannelType.GuildVoice) continue;
    if (channel.parent_id !== counterCategoryId) continue;
    if (referenced.has(channel.id)) continue;
    if (!pattern.test(channel.name)) continue;
    await rest.delete(Routes.channel(channel.id), {
      reason: 'Main server recovery: remove orphan duplicate voice counter'
    }).then(() => summary.orphanCountersDeleted.push(`${channel.name} (${channel.id})`))
      .catch((error) => summary.warnings.push(`Could not delete orphan counter ${channel.name}: ${error.message}`));
  }
  await refreshState();
}

function uniqueIds(values) {
  return [...new Set(values.filter(Boolean).map(String).filter((id) => /^\d{17,22}$/.test(id)))];
}

async function main() {
  await refreshState();

  const botManagedRole = roles.find((role) => role.managed && role.tags?.bot_id === botUser.id)
    ?? roles.find((role) => role.managed && role.name === botUser.username);
  const adminRole = await ensureRole({
    targetName: 'Admin',
    candidates: ['Production'],
    color: 0xff3344,
    permissions: BigInt(PermissionFlagsBits.Administrator),
    predicate: (role) => !role.managed && (role.name !== 'Production' || hasPermission(role, PermissionFlagsBits.Administrator))
  });
  const developerRole = await ensureRole({
    targetName: 'Developer',
    candidates: ['Developer'],
    color: 0x8b5cf6
  });
  const testerRole = await ensureRole({
    targetName: 'Tester',
    candidates: ['Production Testing', 'V2 Tester'],
    color: 0x26c6da
  });
  const moderatorRole = await ensureRole({
    targetName: 'Moderator',
    candidates: ['Production Staff', 'Lead Staff'],
    color: 0xf6c85f
  });
  const leadStaffRole = roleByName('Lead Staff') ?? null;
  const communityMemberRole = roleByName('Community Member') ?? null;

  const roleIds = {
    botRoleId: botManagedRole?.id ?? null,
    communityMemberId: communityMemberRole?.id ?? null,
    adminIds: uniqueIds([adminRole.id]),
    developerIds: uniqueIds([developerRole.id]),
    moderatorIds: uniqueIds([moderatorRole.id, leadStaffRole?.id]),
    testerIds: uniqueIds([testerRole.id]),
    staffIds: uniqueIds([adminRole.id, developerRole.id, moderatorRole.id, leadStaffRole?.id])
  };

  const permissions = {
    info: overwritesFor({ kind: 'info', roleIds }),
    control: overwritesFor({ kind: 'control', roleIds }),
    logs: overwritesFor({ kind: 'logs', roleIds }),
    testing: overwritesFor({ kind: 'testing', roleIds }),
    general: overwritesFor({ kind: 'general', roleIds }),
    dev: overwritesFor({ kind: 'dev', roleIds }),
    counters: overwritesFor({ kind: 'counters', roleIds })
  };

  const categories = {
    info: await ensureCategory({ targetName: 'INFORMATION', candidates: ['V2 Information'], overwrites: permissions.info }),
    control: await ensureCategory({ targetName: 'BOT CONTROL', candidates: ['Dashboard'], overwrites: permissions.control }),
    logs: await ensureCategory({ targetName: 'LOGS', candidates: ['V2 Staff And Logs'], overwrites: permissions.logs }),
    testing: await ensureCategory({ targetName: 'TESTING AREA', candidates: ['V2 Module Labs'], overwrites: permissions.testing }),
    general: await ensureCategory({ targetName: 'GENERAL', candidates: ['V2 Community Testing'], overwrites: permissions.general }),
    dev: await ensureCategory({ targetName: 'DEVELOPER ZONE', candidates: ['Staff Team'], overwrites: permissions.dev }),
    counters: await ensureCategory({ targetName: 'STATUS COUNTERS', candidates: ['V2 Counters'], overwrites: permissions.counters })
  };

  const resolved = {};
  resolved.welcome = await ensureTextChannel({ targetName: 'welcome', candidates: ['v2-welcome'], category: categories.info, overwrites: permissions.info, topic: 'Public welcome and onboarding preview.' });
  resolved.botInfo = await ensureTextChannel({ targetName: 'bot-info', candidates: ['v2-start-here', 'start-here'], category: categories.info, overwrites: permissions.info, topic: 'Bot overview, testing hub guide, and useful links.' });
  resolved.commands = await ensureTextChannel({ targetName: 'commands', candidates: ['commands'], category: categories.info, overwrites: permissions.info, topic: 'Read-only command guide. Use command-testing for active testing.' });
  resolved.status = await ensureTextChannel({ targetName: 'status', candidates: ['bot-uptime', 'ㆍbot-uptime', 'uptime'], category: categories.info, overwrites: permissions.info, topic: 'Bot uptime, status, and maintenance information.' });
  resolved.announcements = await ensureTextChannel({ targetName: 'announcements', candidates: ['ㆍannouncements'], category: categories.info, overwrites: permissions.info, topic: 'Official bot and server announcements.' });
  resolved.verification = await ensureTextChannel({ targetName: 'verification', candidates: ['verification'], category: categories.info, overwrites: permissions.info, topic: 'Verification panel for new members.' });
  resolved.rules = await ensureTextChannel({ targetName: 'rules', candidates: ['ㆍrules'], category: categories.info, overwrites: permissions.info, topic: 'Rules and testing expectations.' });
  resolved.changelog = await ensureTextChannel({ targetName: 'changelog', candidates: ['ㆍchangelog'], category: categories.info, overwrites: permissions.info, topic: 'Bot and server changelog.' });

  resolved.dashboardSync = await ensureTextChannel({ targetName: 'dashboard-sync', candidates: ['v2-dashboard'], category: categories.control, overwrites: permissions.control, topic: 'Dashboard sync checks and setup verification.' });
  resolved.featureFlags = await ensureTextChannel({ targetName: 'feature-flags', category: categories.control, overwrites: permissions.control, topic: 'Feature flag notes and command enablement checks.' });
  resolved.safeMode = await ensureTextChannel({ targetName: 'safe-mode', category: categories.control, overwrites: permissions.control, topic: 'Safe mode, maintenance, and emergency controls.' });
  resolved.guildConfig = await ensureTextChannel({ targetName: 'guild-config', category: categories.control, overwrites: permissions.control, topic: 'Guild configuration audit notes.' });
  resolved.systemControls = await ensureTextChannel({ targetName: 'system-controls', category: categories.control, overwrites: permissions.control, topic: 'Internal bot control actions and recovery notes.' });

  resolved.errorLogs = await ensureTextChannel({ targetName: 'error-logs', candidates: ['moderator-only'], category: categories.logs, overwrites: permissions.logs, topic: 'Runtime errors and developer error-code alerts.' });
  resolved.eventLogs = await ensureTextChannel({ targetName: 'event-logs', candidates: ['v2-mod-logs'], category: categories.logs, overwrites: permissions.logs, topic: 'Moderation, member, channel, role, and event logs.' });
  resolved.streamLogs = await ensureTextChannel({ targetName: 'stream-logs', candidates: ['v2-stream-debug'], category: categories.logs, overwrites: permissions.logs, topic: 'Creator-alert diagnostics and stream notification logs.' });
  resolved.counterLogs = await ensureTextChannel({ targetName: 'counter-logs', category: categories.logs, overwrites: permissions.logs, topic: 'Counter repair, refresh, and status notes.' });
  resolved.apiLogs = await ensureTextChannel({ targetName: 'api-logs', candidates: ['v2-dev-logs'], category: categories.logs, overwrites: permissions.logs, topic: 'External API and provider status logs.' });
  resolved.dashboardLogs = await ensureTextChannel({ targetName: 'dashboard-logs', candidates: ['v2-dashboard-logs'], category: categories.logs, overwrites: permissions.logs, topic: 'Dashboard and setup change logs.' });
  resolved.caseLogs = await ensureTextChannel({ targetName: 'case-logs', candidates: ['v2-case-logs'], category: categories.logs, overwrites: permissions.logs, topic: 'Private case activity logs.' });

  resolved.commandTesting = await ensureTextChannel({ targetName: 'command-testing', candidates: ['v2-utility-test'], category: categories.testing, overwrites: permissions.testing, topic: 'Safe area for command testing.' });
  resolved.embedTesting = await ensureTextChannel({ targetName: 'embed-testing', candidates: ['v2-media-test'], category: categories.testing, overwrites: permissions.testing, topic: 'Embed and layout test area.' });
  resolved.streamSimulations = await ensureTextChannel({ targetName: 'stream-simulations', candidates: ['v2-twitch-live'], category: categories.testing, overwrites: permissions.testing, topic: 'Twitch, YouTube, and TikTok notification simulation channel.' });
  resolved.counterSimulations = await ensureTextChannel({ targetName: 'counter-simulations', candidates: ['v2-counter-lab'], category: categories.testing, overwrites: permissions.testing, topic: 'Counter preview, repair, and simulation channel.' });
  resolved.featureTests = await ensureTextChannel({ targetName: 'feature-tests', candidates: ['v2-automod-test'], category: categories.testing, overwrites: permissions.testing, topic: 'Feature and AutoMod test area.' });
  resolved.aiChatTesting = await ensureTextChannel({ targetName: 'ai-chat-testing', candidates: ['v2-ai-chat-test'], category: categories.testing, overwrites: permissions.testing, topic: 'Joined AI chat test area.' });
  resolved.verificationPreview = await ensureTextChannel({ targetName: 'verification-preview', candidates: ['v2-verification-preview'], category: categories.testing, overwrites: permissions.testing, topic: 'Verification panel preview channel.' });
  resolved.youtubeTesting = await ensureTextChannel({ targetName: 'youtube-alert-testing', candidates: ['v2-youtube-alerts'], category: categories.testing, overwrites: permissions.testing, topic: 'Preserved YouTube alert testing history.' });
  resolved.tiktokTesting = await ensureTextChannel({ targetName: 'tiktok-alert-testing', candidates: ['v2-tiktok-alerts'], category: categories.testing, overwrites: permissions.testing, topic: 'Preserved TikTok alert testing history.' });
  resolved.stickyTesting = await ensureTextChannel({ targetName: 'sticky-testing', candidates: ['v2-sticky-test'], category: categories.testing, overwrites: permissions.testing, topic: 'Sticky message behavior tests.' });

  resolved.general = await ensureTextChannel({ targetName: 'general', candidates: ['public-chat'], category: categories.general, overwrites: permissions.general, topic: 'General verified community chat.' });
  resolved.support = await ensureTextChannel({ targetName: 'support', category: categories.general, overwrites: permissions.general, topic: 'Support questions and setup help.' });
  resolved.bugReports = await ensureTextChannel({ targetName: 'bug-reports', category: categories.general, overwrites: permissions.general, topic: 'Bug reports and broken-command notes.' });
  resolved.suggestions = await ensureTextChannel({ targetName: 'suggestions', candidates: ['ㆍsuggestions'], category: categories.general, overwrites: permissions.general, topic: 'Community suggestions and voting.' });
  resolved.socials = await ensureTextChannel({ targetName: 'socials', candidates: ['v2-socials'], category: categories.general, overwrites: permissions.general, topic: 'Server social links.' });
  resolved.roles = await ensureTextChannel({ targetName: 'roles', candidates: ['v2-roles'], category: categories.general, overwrites: permissions.general, topic: 'Reaction role panels.' });
  resolved.giveaways = await ensureTextChannel({ targetName: 'giveaways', candidates: ['v2-giveaways'], category: categories.general, overwrites: permissions.general, topic: 'Giveaway and reward testing.' });
  resolved.profiles = await ensureTextChannel({ targetName: 'profiles', candidates: ['v2-profiles'], category: categories.general, overwrites: permissions.general, topic: 'Profile and reputation testing.' });
  resolved.economy = await ensureTextChannel({ targetName: 'economy', candidates: ['v2-economy'], category: categories.general, overwrites: permissions.general, topic: 'Economy and XP testing.' });
  resolved.games = await ensureTextChannel({ targetName: 'games', candidates: ['v2-games'], category: categories.general, overwrites: permissions.general, topic: 'Games and fun command testing.' });

  await moveVoiceChannel({ targetName: 'General', candidates: ['General'], category: categories.general, overwrites: permissions.general });

  resolved.devChat = await ensureTextChannel({ targetName: 'dev-chat', candidates: ['staff-chat', 'ㆍstaff-chat'], category: categories.dev, overwrites: permissions.dev, topic: 'Private developer and admin discussion.' });
  resolved.deployments = await ensureTextChannel({ targetName: 'deployments', candidates: ['leaks', 'ㆍleaks'], category: categories.dev, overwrites: permissions.dev, topic: 'Deployment notes and release coordination.' });
  resolved.debugConsole = await ensureTextChannel({ targetName: 'debug-console', candidates: ['v2-security-lab'], category: categories.dev, overwrites: permissions.dev, topic: 'Debugging, safety checks, and recovery commands.' });
  resolved.systemHealth = await ensureTextChannel({ targetName: 'system-health', category: categories.dev, overwrites: permissions.dev, topic: 'System health and PM2/runtime notes.' });
  resolved.staffAnnouncements = await ensureTextChannel({ targetName: 'staff-announcements', candidates: ['staff-announcements', 'ㆍstaff-announcements'], category: categories.dev, overwrites: permissions.dev, topic: 'Private staff announcements.' });
  resolved.reports = await ensureTextChannel({ targetName: 'reports', candidates: ['v2-reports'], category: categories.dev, overwrites: permissions.dev, topic: 'Staff report queue and review notes.' });
  await moveChannelsMatching({ category: categories.dev, overwrites: permissions.dev, pattern: /case-\d+|testing-applications/ });

  const config = readConfig();
  const guildConfig = config.guilds?.[guildId] ?? {};
  config.guilds ??= {};
  guildConfig.logChannelId = resolved.errorLogs.id;
  guildConfig.logsEnabled = true;
  guildConfig.adminRoleIds = uniqueIds([adminRole.id, developerRole.id, moderatorRole.id, leadStaffRole?.id]);
  guildConfig.verification ??= {};
  guildConfig.verification.enabled = Boolean(communityMemberRole?.id && resolved.verification.id);
  guildConfig.verification.roleId = communityMemberRole?.id ?? guildConfig.verification.roleId ?? null;
  guildConfig.verification.channelId = resolved.verification.id;
  guildConfig.verification.visibleChannelIds = [
    categories.info.id,
    resolved.welcome.id,
    resolved.botInfo.id,
    resolved.commands.id,
    resolved.status.id,
    resolved.announcements.id,
    resolved.rules.id,
    resolved.changelog.id
  ];
  guildConfig.verification.autoHideChannels = false;
  guildConfig.verification.autoSyncNewChannels = false;
  guildConfig.verification.updatedAt = now;

  guildConfig.welcome ??= {};
  guildConfig.welcome.enabled = true;
  guildConfig.welcome.channelId = resolved.welcome.id;
  guildConfig.welcome.updatedAt = now;

  guildConfig.joinChat ??= {};
  guildConfig.joinChat.enabled = true;
  guildConfig.joinChat.channelId = resolved.commandTesting.id;
  guildConfig.joinChat.enabledAt = now;

  guildConfig.automod ??= {};
  guildConfig.automod.mediaRules = {
    channels: {
      [resolved.featureTests.id]: {
        allowImages: false,
        allowGifs: false
      }
    },
    categories: {}
  };

  guildConfig.twitch ??= {};
  guildConfig.twitch.announceChannelId = resolved.streamSimulations.id;
  guildConfig.twitch.streamers = (guildConfig.twitch.streamers ?? []).map((streamer) => ({
    ...streamer,
    announceChannelId: resolved.streamSimulations.id
  }));
  guildConfig.youtube ??= {};
  guildConfig.youtube.announceChannelId = resolved.streamSimulations.id;
  guildConfig.tiktok ??= {};
  guildConfig.tiktok.announceChannelId = resolved.streamSimulations.id;

  guildConfig.counters ??= {};
  guildConfig.counters.categoryId = categories.counters.id;
  for (const counter of Object.values(guildConfig.counters.counters ?? {})) {
    counter.categoryId = categories.counters.id;
  }

  guildConfig.caseSystem ??= {};
  guildConfig.caseSystem.categoryId = categories.dev.id;
  guildConfig.caseSystem.logChannelId = resolved.caseLogs.id;
  guildConfig.caseSystem.staffRoleIds = uniqueIds([adminRole.id, developerRole.id, moderatorRole.id, leadStaffRole?.id]);

  const stickyEntries = Object.entries(guildConfig.stickyMessages ?? {});
  if (stickyEntries.length) {
    const latest = stickyEntries.at(-1)?.[1] ?? {};
    guildConfig.stickyMessages = {
      [resolved.stickyTesting.id]: {
        ...latest,
        updatedAt: now,
        lastMessageId: latest.lastMessageId ?? null
      }
    };
  }

  config.uptimeStatus = {
    ...(config.uptimeStatus ?? {}),
    guildId,
    channelId: resolved.status.id
  };
  config.guilds[guildId] = guildConfig;
  writeConfig(config);
  summary.configUpdated = true;

  await refreshState();
  const referencedCounterChannelIds = Object.values(guildConfig.counters?.counters ?? {}).map((counter) => counter.channelId);
  await deleteOrphanCounterVoiceChannels(categories.counters.id, referencedCounterChannelIds);
  await deleteEmptyLegacyCategories();

  const finalCategories = channels
    .filter((channel) => channel.type === ChannelType.GuildCategory)
    .map((category) => ({
      name: category.name,
      id: category.id,
      children: channels
        .filter((channel) => channel.parent_id === category.id && channel.type !== ChannelType.GuildCategory)
        .map((channel) => `${channel.name} (${channelTypeName(channel.type)})`)
    }));

  console.log(JSON.stringify({
    guild: `${guild.name} (${guild.id})`,
    roleAlignment: {
      admin: adminRole.id,
      developer: developerRole.id,
      tester: testerRole.id,
      moderator: moderatorRole.id,
      botInternal: botManagedRole?.id ?? null
    },
    summary,
    finalCategories
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
