import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {
  ActionRowBuilder,
  ActivityType,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import { commands } from './commands.js';

const token = process.env.DISCORD_TOKEN;

const configPath = path.join(process.cwd(), 'data', 'config.json');
const packageJson = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')
);

const botVersion = packageJson.version;
const prefix = '!';
const footerBrand = 'V2 Community Bot';

const twitchClientId = process.env.TWITCH_CLIENT_ID;
const twitchClientSecret = process.env.TWITCH_CLIENT_SECRET;
const developerIds = parseIdList(process.env.DEV_USER_IDS);
const errorDmIds = parseIdList(process.env.ERROR_DM_USER_IDS ?? process.env.DEV_USER_IDS);

const togetherApiKey = process.env.TOGETHER_API_KEY ?? process.env.GROQ_API_KEY;
const togetherApiKeySource = process.env.TOGETHER_API_KEY
  ? 'TOGETHER_API_KEY'
  : process.env.GROQ_API_KEY
  ? 'GROQ_API_KEY (deprecated fallback)'
  : null;

const huggingFaceApiKey = process.env.HUGGINGFACE_API_KEY;
const huggingFaceDefaultModel = 'openai/gpt-oss-120b:fastest';
const huggingFaceModel = process.env.HUGGINGFACE_MODEL || huggingFaceDefaultModel;
const huggingFaceFallbackModels = ['openai/gpt-oss-120b:fastest', 'gpt2', 'EleutherAI/gpt-neo-125M'];

let joinedChatAiDisabled = false;
let joinedChatAiDisabledReason = null;
let joinedChatAiDisabledAt = null;

const defaultPresenceText =
  process.env.BOT_ACTIVITY || 'V2 community control';

let presenceText = defaultPresenceText;

const colors = {
  blurple: 0x5865f2,
  green: 0x57f287,
  yellow: 0xfee75c,
  red: 0xed4245,
  purple: 0x9b59b6,
  twitch: 0x9146ff
};

const logCategories = [
  { id: 'messages', label: 'Message logs', description: 'Deleted and edited messages' },
  { id: 'members', label: 'Member logs', description: 'Joins, leaves, and member updates' },
  { id: 'moderation', label: 'Moderation logs', description: 'Warnings, kicks, bans, timeouts, purge, lockdown' },
  { id: 'channels', label: 'Channel logs', description: 'Channel create, delete, and updates' },
  { id: 'roles', label: 'Role logs', description: 'Role create, delete, and updates' },
  { id: 'voice', label: 'Voice logs', description: 'Voice channel moves' },
  { id: 'sticky', label: 'Sticky logs', description: 'Sticky message setup changes' },
  { id: 'twitch', label: 'Twitch logs', description: 'Twitch alert setup and checks' },
  { id: 'dashboard', label: 'Dashboard logs', description: 'Dashboard and setup changes' },
  { id: 'dev', label: 'Developer logs', description: 'Private developer utility usage' }
];
const defaultLogCategoryIds = logCategories.map((category) => category.id);
const lockFilePath = path.join(process.cwd(), 'discordbot.lock');

function isProcessRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function removeLockFile() {
  try {
    if (!fs.existsSync(lockFilePath)) return;
    const existingPid = Number(fs.readFileSync(lockFilePath, 'utf8').trim());
    if (existingPid === process.pid) fs.unlinkSync(lockFilePath);
  } catch {
    // ignore any locking cleanup failures
  }
}

function createLockFile() {
  try {
    if (fs.existsSync(lockFilePath)) {
      const existingPid = Number(fs.readFileSync(lockFilePath, 'utf8').trim());
      if (existingPid && existingPid !== process.pid && isProcessRunning(existingPid)) {
        console.error(`Another bot instance is already running (PID ${existingPid}). Exiting.`);
        process.exit(1);
      }
    }

    fs.writeFileSync(lockFilePath, String(process.pid), 'utf8');
    process.on('exit', removeLockFile);
    process.on('SIGINT', () => process.exit(0));
    process.on('SIGTERM', () => process.exit(0));
  } catch (error) {
    console.error('Unable to create startup lock file:', error);
    process.exit(1);
  }
}

if (!token) {
  throw new Error('Missing DISCORD_TOKEN in your .env file.');
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent
  ]
});

const config = loadConfig();
const stickyTimers = new Map();
const joinedChatMemory = new Map();

client.once(Events.ClientReady, (readyClient) => {
  if (togetherApiKeySource && togetherApiKeySource.includes('deprecated')) {
    console.warn('Warning: GROQ_API_KEY is being used as a fallback for Together.ai. Set TOGETHER_API_KEY in .env to avoid invalid key issues.');
  }

  applyBotPresence();
  setTimeout(applyBotPresence, 5_000);
  startTwitchMonitor();
  console.log(`Ready! Logged in as ${readyClient.user.tag} across ${readyClient.guilds.cache.size} server(s).`);
});

client.on(Events.ShardResume, applyBotPresence);

client.on(Events.GuildCreate, async (guild) => {
  getGuildConfig(guild.id);
  saveConfig();
  await sendLog(guild, 'Bot Joined Server', `${client.user?.tag ?? 'Bot'} joined ${guild.name}.`, colors.green, 'dashboard');
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleSlashCommand(interaction);
      return;
    }

    if (interaction.isButton()) {
      await handleDevDashboardButton(interaction);
      return;
    }

    if (interaction.isModalSubmit()) {
      await handleDevDashboardModal(interaction);
    }
  } catch (error) {
    console.error(error);
    const hasBeenAcknowledged = typeof interaction.isAcknowledged === 'function'
      ? interaction.isAcknowledged()
      : interaction.replied || interaction.deferred;

    if (!hasBeenAcknowledged) {
      await notifyDevelopersOfError(error, {
        type: 'Interaction',
        command: interaction.commandName ?? interaction.customId ?? 'Unknown',
        user: interaction.user?.tag,
        server: interaction.guild?.name,
        channel: interaction.channel?.isTextBased() ? interaction.channel.name : undefined,
        extra: 'Failed before sending a reply to the user.'
      });
    }

    const response = { content: 'Something went wrong while running that command.', ephemeral: true };
    if (hasBeenAcknowledged) {
      await interaction.followUp(response).catch(() => null);
    } else {
      await interaction.reply(response).catch(() => null);
    }
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  try {
    if (message.content.startsWith(prefix)) {
      const handled = await handlePrefixCommand(message);
      if (handled) return;
    }

    const joinedChatHandled = await handleJoinedChatMessage(message);
    if (joinedChatHandled) return;

    await scheduleStickyRefresh(message);
  } catch (error) {
    console.error(error);
    if (message.content.startsWith(prefix)) {
      await notifyDevelopersOfError(error, {
        type: 'Message',
        command: 'PrefixCommand',
        user: message.author.tag,
        server: message.guild?.name,
        channel: message.channel?.name,
        extra: `Message content: ${truncate(message.content, 700)}`
      });
    }
    await message.reply('Something went wrong while running that command.').catch(() => null);
  }
});

client.on(Events.MessageDelete, async (message) => {
  if (!message.guild || message.author?.bot) return;

  await sendLog(
    message.guild,
    'Message Deleted',
    [
      `Channel: ${message.channel}`,
      message.author ? `Author: ${message.author.tag}` : 'Author: Unknown',
      message.content ? `Content: ${truncate(message.content, 900)}` : 'Content: Unavailable or embed/attachment only'
    ].join('\n'),
    colors.red
  );
});

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
  if (!newMessage.guild || newMessage.author?.bot) return;
  if (oldMessage.content === newMessage.content) return;

  await sendLog(
    newMessage.guild,
    'Message Edited',
    [
      `Channel: ${newMessage.channel}`,
      `Author: ${newMessage.author.tag}`,
      oldMessage.content ? `Before: ${truncate(oldMessage.content, 450)}` : null,
      newMessage.content ? `After: ${truncate(newMessage.content, 450)}` : null
    ].filter(Boolean).join('\n'),
    colors.yellow
  );
});

client.on(Events.GuildMemberAdd, async (member) => {
  await sendLog(member.guild, 'Member Joined', `${member.user.tag} joined the server.\nUser ID: ${member.id}`, colors.green);
});

client.on(Events.GuildMemberRemove, async (member) => {
  await sendLog(member.guild, 'Member Left', `${member.user.tag} left the server.\nUser ID: ${member.id}`, colors.red);
});

client.on(Events.GuildBanAdd, async (ban) => {
  await sendLog(ban.guild, 'Member Banned', `${ban.user.tag} was banned.\nUser ID: ${ban.user.id}`, colors.red);
});

client.on(Events.GuildBanRemove, async (ban) => {
  await sendLog(ban.guild, 'Member Unbanned', `${ban.user.tag} was unbanned.\nUser ID: ${ban.user.id}`, colors.green);
});

client.on(Events.ChannelCreate, async (channel) => {
  if (!channel.guild) return;
  await sendLog(channel.guild, 'Channel Created', `${channel} (${channel.name})`, colors.green);
});

client.on(Events.ChannelDelete, async (channel) => {
  if (!channel.guild) return;
  await sendLog(channel.guild, 'Channel Deleted', `${channel.name}\nChannel ID: ${channel.id}`, colors.red);
});

client.on(Events.ChannelUpdate, async (oldChannel, newChannel) => {
  if (!newChannel.guild) return;

  const changes = [];
  if (oldChannel.name !== newChannel.name) changes.push(`Name: ${oldChannel.name} -> ${newChannel.name}`);
  if (oldChannel.parentId !== newChannel.parentId) changes.push(`Category changed.`);
  if (!changes.length) return;

  await sendLog(newChannel.guild, 'Channel Updated', changes.join('\n'), colors.yellow);
});

client.on(Events.GuildRoleCreate, async (role) => {
  await sendLog(role.guild, 'Role Created', `${role} (${role.name})`, colors.green);
});

client.on(Events.GuildRoleDelete, async (role) => {
  await sendLog(role.guild, 'Role Deleted', `${role.name}\nRole ID: ${role.id}`, colors.red);
});

client.on(Events.GuildRoleUpdate, async (oldRole, newRole) => {
  const changes = [];
  if (oldRole.name !== newRole.name) changes.push(`Name: ${oldRole.name} -> ${newRole.name}`);
  if (oldRole.color !== newRole.color) changes.push('Color changed.');
  if (!changes.length) return;

  await sendLog(newRole.guild, 'Role Updated', `${newRole}\n${changes.join('\n')}`, colors.yellow);
});

client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  const changes = [];

  if (oldMember.nickname !== newMember.nickname) {
    changes.push(`Nickname: ${oldMember.nickname ?? 'None'} -> ${newMember.nickname ?? 'None'}`);
  }

  const oldRoles = oldMember.roles.cache;
  const newRoles = newMember.roles.cache;
  const addedRoles = newRoles.filter((role) => !oldRoles.has(role.id) && role.id !== newMember.guild.id);
  const removedRoles = oldRoles.filter((role) => !newRoles.has(role.id) && role.id !== newMember.guild.id);

  if (addedRoles.size) changes.push(`Roles added: ${addedRoles.map((role) => role.toString()).join(', ')}`);
  if (removedRoles.size) changes.push(`Roles removed: ${removedRoles.map((role) => role.name).join(', ')}`);
  if (!changes.length) return;

  await sendLog(newMember.guild, 'Member Updated', `${newMember.user.tag}\n${changes.join('\n')}`, colors.yellow);
});

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const guild = newState.guild ?? oldState.guild;
  const member = newState.member ?? oldState.member;
  if (!guild || !member) return;
  if (oldState.channelId === newState.channelId) return;

  const from = oldState.channel ? oldState.channel.toString() : 'None';
  const to = newState.channel ? newState.channel.toString() : 'None';
  await sendLog(guild, 'Voice Channel Updated', `${member.user.tag}\nFrom: ${from}\nTo: ${to}`, colors.blurple);
});

async function handleSlashCommand(interaction) {
  const { commandName } = interaction;

  if (commandName === 'ping') {
    await interaction.reply({ embeds: [pingEmbed(Date.now() - interaction.createdTimestamp, client.ws.ping)] });
    return;
  }

  if (commandName === 'help' || commandName === 'commands') {
    await interaction.reply({ embeds: [commandListEmbed()] });
    return;
  }

  if (commandName === 'join') {
    if (interaction.inGuild()) {
      setJoinChat(interaction.guild.id, interaction.channel.id, interaction.user.id);
    }
    await interaction.reply(joinResponse(interaction.user, interaction.channel));
    return;
  }

  if (commandName === 'serverinfo') {
    if (!interaction.guild) {
      await interaction.reply({ content: 'This command only works in a server.', ephemeral: true });
      return;
    }

    await interaction.reply({ embeds: [serverInfoEmbed(interaction.guild)] });
    return;
  }

  if (commandName === 'userinfo') {
    const user = interaction.options.getUser('user') ?? interaction.user;
    const member = interaction.guild ? await interaction.guild.members.fetch(user.id).catch(() => null) : null;
    await interaction.reply({ embeds: [userInfoEmbed(user, member)] });
    return;
  }

  if (commandName === 'avatar') {
    const user = interaction.options.getUser('user') ?? interaction.user;
    await interaction.reply({ embeds: [avatarEmbed(user)] });
    return;
  }

  if (commandName === 'coinflip') {
    await interaction.reply(coinFlipResponse(interaction.user));
    return;
  }

  if (commandName === 'roll') {
    await interaction.reply(rollResponse(interaction.user, interaction.options.getInteger('sides') ?? 6));
    return;
  }

  if (commandName === 'magic8ball') {
    await interaction.reply({ embeds: [magic8BallEmbed(interaction.user, interaction.options.getString('question', true))] });
    return;
  }

  if (commandName === 'poll') {
    await interaction.reply({ embeds: [pollEmbed(interaction.user, interaction.options.getString('question', true))] });
    const pollMessage = await interaction.fetchReply();
    await addPollReactions(pollMessage);
    return;
  }

  if (commandName === 'uptime') {
    await interaction.reply({ embeds: [communityInfoEmbed('Bot Uptime', formatDuration(client.uptime ?? 0))] });
    return;
  }

  if (commandName === 'membercount') {
    if (!interaction.guild) {
      await interaction.reply({ content: 'This command only works in a server.', ephemeral: true });
      return;
    }

    await interaction.reply({ embeds: [memberCountEmbed(interaction.guild)] });
    return;
  }

  if (commandName === 'servericon') {
    if (!interaction.guild) {
      await interaction.reply({ content: 'This command only works in a server.', ephemeral: true });
      return;
    }

    await interaction.reply({ embeds: [serverIconEmbed(interaction.guild)] });
    return;
  }

  if (commandName === 'choose') {
    await interaction.reply(chooseResponse(interaction.user, interaction.options.getString('options', true)));
    return;
  }

  if (commandName === 'rate') {
    await interaction.reply(rateResponse(interaction.user, interaction.options.getString('thing', true)));
    return;
  }

  if (commandName === 'ship') {
    const first = interaction.options.getUser('first', true);
    const second = interaction.options.getUser('second') ?? interaction.user;
    await interaction.reply(shipResponse(first, second));
    return;
  }

  if (commandName === 'topic') {
    await interaction.reply({ embeds: [communityInfoEmbed('Conversation Starter', randomFrom(conversationTopics))] });
    return;
  }

  if (commandName === 'quote') {
    await interaction.reply({ embeds: [communityInfoEmbed('Quote', randomFrom(communityQuotes))] });
    return;
  }

  if (commandName === 'password') {
    const length = interaction.options.getInteger('length') ?? 16;
    await interaction.reply({ content: `Generated password: ||${generatePassword(length)}||`, ephemeral: true });
    return;
  }

  if (commandName === 'number') {
    await interaction.reply(numberResponse(interaction.user, interaction.options.getInteger('max') ?? 100));
    return;
  }

  if (commandName === 'devcommands') {
    if (!(await requireSlashDev(interaction))) return;
    await interaction.reply({ embeds: [devCommandsEmbed()], ephemeral: true });
    return;
  }

  if (commandName === 'devdashboard') {
    if (!(await requireSlashDev(interaction))) return;
    if (!interaction.inGuild()) {
      await interaction.reply({ content: 'The developer dashboard only works in a server.', ephemeral: true });
      return;
    }

    await interaction.reply({ ...devDashboardPayload(interaction.guild), ephemeral: true });
    return;
  }

  if (!interaction.inGuild()) {
    await interaction.reply({ content: 'Staff commands only work in a server.', ephemeral: true });
    return;
  }

  if (commandName === 'admincommands') {
    if (!(await requireSlashPermission(interaction, PermissionFlagsBits.ManageGuild, 'Manage Server'))) return;
    await interaction.reply({ embeds: [adminCommandsEmbed()], ephemeral: true });
    return;
  }

  if (commandName === 'dashboard') {
    if (!(await requireSlashPermission(interaction, PermissionFlagsBits.ManageGuild, 'Manage Server'))) return;
    await interaction.reply({ embeds: [dashboardEmbed(interaction.guild)], ephemeral: true });
    return;
  }

  if (commandName === 'setlogchannel') {
    if (!(await requireSlashPermission(interaction, PermissionFlagsBits.ManageGuild, 'Manage Server'))) return;
    const channel = interaction.options.getChannel('channel', true);
    setGuildConfig(interaction.guild.id, { logChannelId: channel.id, logsEnabled: true });
    await interaction.reply({ content: `Logs are now enabled in ${channel}.`, ephemeral: true });
    await sendLog(interaction.guild, 'Log Channel Updated', `${interaction.user.tag} set logs to ${channel}.`, colors.green);
    return;
  }

  if (commandName === 'logtest') {
    if (!(await requireSlashPermission(interaction, PermissionFlagsBits.ManageGuild, 'Manage Server'))) return;
    const sent = await sendLog(interaction.guild, 'Test Log', `${interaction.user.tag} sent a test log.`, colors.blurple);
    await interaction.reply({ content: sent ? 'Test log sent.' : 'Set a log channel first with `/setlogchannel`.', ephemeral: true });
    return;
  }

  if (commandName === 'sticky') {
    await handleStickySlash(interaction);
    return;
  }

  if (commandName === 'twitch') {
    await handleTwitchSlash(interaction);
    return;
  }

  if (commandName === 'lockdown') {
    if (!(await requireSlashPermission(interaction, PermissionFlagsBits.ManageChannels, 'Manage Channels'))) return;
    const channel = interaction.options.getChannel('channel', true);
    const changed = await lockdownChannel(channel);
    await sendLockdownAnnouncement(channel, 'channel');
    await interaction.reply({ content: changed ? `Locked down ${channel}.` : `I could not lock ${channel}.`, ephemeral: true });
    await sendLog(interaction.guild, 'Lockdown Enabled', `${interaction.user.tag} locked down ${channel}.`, colors.red);
    return;
  }

  if (commandName === 'unlockdown') {
    if (!(await requireSlashPermission(interaction, PermissionFlagsBits.ManageChannels, 'Manage Channels'))) return;
    const channel = interaction.options.getChannel('channel', true);
    const changed = await unlockChannel(channel);
    await sendUnlockAnnouncement(channel, 'channel');
    await interaction.reply({ content: changed ? `Unlocked ${channel}.` : `I could not unlock ${channel}.`, ephemeral: true });
    await sendLog(interaction.guild, 'Lockdown Disabled', `${interaction.user.tag} unlocked ${channel}.`, colors.green);
    return;
  }

  if (commandName === 'lockdownserver') {
    if (!(await requireSlashPermission(interaction, PermissionFlagsBits.ManageChannels, 'Manage Channels'))) return;
    await interaction.deferReply({ ephemeral: true });
    const result = await lockdownServer(interaction.guild);
    await interaction.editReply(`Locked down ${result.changed} channel(s). Sent lockdown embeds in ${result.announced} channel(s).`);
    await sendLog(interaction.guild, 'Lockdown Enabled', `${interaction.user.tag} locked down the server.`, colors.red);
    return;
  }

  if (commandName === 'unlockdownserver') {
    if (!(await requireSlashPermission(interaction, PermissionFlagsBits.ManageChannels, 'Manage Channels'))) return;
    await interaction.deferReply({ ephemeral: true });
    const result = await unlockServer(interaction.guild);
    await interaction.editReply(`Unlocked ${result.changed} channel(s). Sent unlock embeds in ${result.announced} channel(s).`);
    await sendLog(interaction.guild, 'Lockdown Disabled', `${interaction.user.tag} unlocked the server.`, colors.green);
    return;
  }

  if (commandName === 'purge') {
    if (!(await requireSlashPermission(interaction, PermissionFlagsBits.ManageMessages, 'Manage Messages'))) return;
    const amount = interaction.options.getInteger('amount', true);
    const deleted = await interaction.channel.bulkDelete(amount, true);
    await interaction.reply({ content: `Deleted ${deleted.size} message(s).`, ephemeral: true });
    await sendLog(interaction.guild, 'Messages Purged', `${interaction.user.tag} deleted ${deleted.size} message(s) in ${interaction.channel}.`, colors.yellow);
    return;
  }

  if (commandName === 'say') {
    if (!(await requireSlashPermission(interaction, PermissionFlagsBits.ManageMessages, 'Manage Messages'))) return;
    const channel = interaction.options.getChannel('channel') ?? interaction.channel;
    const text = interaction.options.getString('message', true);
    await channel.send({ content: text, allowedMentions: { parse: [] } });
    await interaction.reply({ content: `Message sent in ${channel}.`, ephemeral: true });
    await sendLog(interaction.guild, 'Bot Message Sent', `${interaction.user.tag} used /say in ${channel}.`, colors.blurple);
    return;
  }

  if (commandName === 'warn') {
    await handleWarnSlash(interaction);
    return;
  }

  if (commandName === 'warnings') {
    if (!(await requireSlashPermission(interaction, PermissionFlagsBits.ModerateMembers, 'Moderate Members'))) return;
    const user = interaction.options.getUser('user', true);
    await interaction.reply({ embeds: [warningsEmbed(interaction.guild.id, user)], ephemeral: true });
    return;
  }

  if (commandName === 'clearwarns') {
    await handleClearWarnsSlash(interaction);
    return;
  }

  if (commandName === 'kick') {
    await handleKickSlash(interaction);
    return;
  }

  if (commandName === 'ban') {
    await handleBanSlash(interaction);
    return;
  }

  if (commandName === 'unban') {
    if (!(await requireSlashPermission(interaction, PermissionFlagsBits.BanMembers, 'Ban Members'))) return;
    const userId = interaction.options.getString('user_id', true);
    const reason = interaction.options.getString('reason') ?? 'No reason provided';
    await interaction.guild.members.unban(userId, reason);
    await interaction.reply({ content: `Unbanned user ID ${userId}. Reason: ${reason}`, ephemeral: true });
    await sendLog(interaction.guild, 'Member Unbanned', `${interaction.user.tag} unbanned user ID ${userId}.\nReason: ${reason}`, colors.green);
    return;
  }

  if (commandName === 'timeout' || commandName === 'mute') {
    await handleTimeoutSlash(interaction, commandName);
    return;
  }

  if (commandName === 'unmute') {
    await handleUnmuteSlash(interaction);
    return;
  }

  if (commandName === 'slowmode') {
    if (!(await requireSlashPermission(interaction, PermissionFlagsBits.ManageChannels, 'Manage Channels'))) return;
    const seconds = interaction.options.getInteger('seconds', true);
    const channel = interaction.options.getChannel('channel') ?? interaction.channel;
    await channel.setRateLimitPerUser(seconds, `Slowmode changed by ${interaction.user.tag}`);
    await interaction.reply({ content: `Slowmode for ${channel} is now ${seconds} second(s).`, ephemeral: true });
    await sendLog(interaction.guild, 'Slowmode Updated', `${interaction.user.tag} set ${channel} slowmode to ${seconds} second(s).`, colors.yellow);
    return;
  }

  if (commandName === 'nick') {
    await handleNickSlash(interaction);
    return;
  }

  if (commandName === 'role') {
    await handleRoleSlash(interaction);
    return;
  }

  if (commandName === 'dev') {
    await handleDevSlash(interaction);
  }
}

async function handlePrefixCommand(message) {
  const body = message.content.slice(prefix.length).trim();
  if (!body) return false;

  const [rawCommand, ...args] = body.split(/\s+/);
  const commandName = rawCommand.toLowerCase();

  if (commandName === 'ping') {
    const sent = await message.reply('Pinging...');
    const roundTrip = sent.createdTimestamp - message.createdTimestamp;
    await sent.edit({ content: null, embeds: [pingEmbed(roundTrip, client.ws.ping)] });
    return true;
  }

  if (commandName === 'help' || commandName === 'commands') {
    await message.reply({ embeds: [commandListEmbed()] });
    return true;
  }

  if (commandName === 'join') {
    if (message.guild) {
      setJoinChat(message.guild.id, message.channel.id, message.author.id);
    }
    await message.reply(joinResponse(message.author, message.channel));
    return true;
  }

  if (commandName === 'serverinfo') {
    if (!message.guild) {
      await message.reply('This command only works in a server.');
      return true;
    }

    await message.reply({ embeds: [serverInfoEmbed(message.guild)] });
    return true;
  }

  if (commandName === 'userinfo') {
    const member = message.mentions.members.first() ?? message.member;
    await message.reply({ embeds: [userInfoEmbed(member.user, member)] });
    return true;
  }

  if (commandName === 'avatar') {
    const user = message.mentions.users.first() ?? message.author;
    await message.reply({ embeds: [avatarEmbed(user)] });
    return true;
  }

  if (commandName === 'coinflip') {
    await message.reply(coinFlipResponse(message.author));
    return true;
  }

  if (commandName === 'roll') {
    const sides = Number.parseInt(args[0], 10) || 6;
    if (!Number.isInteger(sides) || sides < 2 || sides > 1000) {
      await message.reply('Usage: `!roll [2-1000]`');
      return true;
    }

    await message.reply(rollResponse(message.author, sides));
    return true;
  }

  if (commandName === 'magic8ball' || commandName === '8ball') {
    const question = args.join(' ');
    if (!question) {
      await message.reply('Usage: `!8ball <question>`');
      return true;
    }

    await message.reply({ embeds: [magic8BallEmbed(message.author, question)] });
    return true;
  }

  if (commandName === 'poll') {
    const question = args.join(' ');
    if (!question) {
      await message.reply('Usage: `!poll <yes/no question>`');
      return true;
    }

    const pollMessage = await message.reply({ embeds: [pollEmbed(message.author, question)] });
    await addPollReactions(pollMessage);
    return true;
  }

  if (commandName === 'uptime') {
    await message.reply({ embeds: [communityInfoEmbed('Bot Uptime', formatDuration(client.uptime ?? 0))] });
    return true;
  }

  if (commandName === 'membercount') {
    if (!message.guild) {
      await message.reply('This command only works in a server.');
      return true;
    }

    await message.reply({ embeds: [memberCountEmbed(message.guild)] });
    return true;
  }

  if (commandName === 'servericon') {
    if (!message.guild) {
      await message.reply('This command only works in a server.');
      return true;
    }

    await message.reply({ embeds: [serverIconEmbed(message.guild)] });
    return true;
  }

  if (commandName === 'choose') {
    const options = args.join(' ');
    if (!options) {
      await message.reply('Usage: `!choose pizza, burgers, tacos`');
      return true;
    }

    await message.reply(chooseResponse(message.author, options));
    return true;
  }

  if (commandName === 'rate') {
    const thing = args.join(' ');
    if (!thing) {
      await message.reply('Usage: `!rate <thing>`');
      return true;
    }

    await message.reply(rateResponse(message.author, thing));
    return true;
  }

  if (commandName === 'ship') {
    const users = [...message.mentions.users.values()];
    const first = users[0] ?? message.author;
    const second = users[1] ?? message.author;
    await message.reply(shipResponse(first, second));
    return true;
  }

  if (commandName === 'topic') {
    await message.reply({ embeds: [communityInfoEmbed('Conversation Starter', randomFrom(conversationTopics))] });
    return true;
  }

  if (commandName === 'quote') {
    await message.reply({ embeds: [communityInfoEmbed('Quote', randomFrom(communityQuotes))] });
    return true;
  }

  if (commandName === 'password') {
    const length = Number.parseInt(args[0], 10) || 16;
    if (length < 8 || length > 64) {
      await message.reply('Usage: `!password [8-64]`');
      return true;
    }

    await message.reply(`Generated password: ||${generatePassword(length)}||`);
    return true;
  }

  if (commandName === 'number') {
    const max = Number.parseInt(args[0], 10) || 100;
    if (max < 2 || max > 1_000_000) {
      await message.reply('Usage: `!number [2-1000000]`');
      return true;
    }

    await message.reply(numberResponse(message.author, max));
    return true;
  }

  if (commandName === 'testerror') {
    throw new Error('Test error triggered by !testerror');
  }

  if (!message.guild) return false;

  if (commandName === 'admincommands') {
    if (!(await requirePrefixPermission(message, PermissionFlagsBits.ManageGuild, 'Manage Server'))) return true;
    await message.reply({ embeds: [adminCommandsEmbed()] });
    return true;
  }

  if (commandName === 'devcommands') {
    if (!(await requirePrefixDev(message))) return true;
    await message.reply({ embeds: [devCommandsEmbed()] });
    return true;
  }

  if (commandName === 'dashboard') {
    if (!(await requirePrefixPermission(message, PermissionFlagsBits.ManageGuild, 'Manage Server'))) return true;
    await message.reply({ embeds: [dashboardEmbed(message.guild)] });
    return true;
  }

  if (commandName === 'setlogchannel') {
    if (!(await requirePrefixPermission(message, PermissionFlagsBits.ManageGuild, 'Manage Server'))) return true;
    const channel = message.mentions.channels.first() ?? message.channel;
    setGuildConfig(message.guild.id, { logChannelId: channel.id, logsEnabled: true });
    await message.reply(`Logs are now enabled in ${channel}.`);
    await sendLog(message.guild, 'Log Channel Updated', `${message.author.tag} set logs to ${channel}.`, colors.green);
    return true;
  }

  if (commandName === 'logtest') {
    if (!(await requirePrefixPermission(message, PermissionFlagsBits.ManageGuild, 'Manage Server'))) return true;
    const sent = await sendLog(message.guild, 'Test Log', `${message.author.tag} sent a test log.`, colors.blurple);
    await message.reply(sent ? 'Test log sent.' : 'Set a log channel first with `!setlogchannel #channel`.');
    return true;
  }

  if (commandName === 'sticky') {
    await handleStickyPrefix(message, args);
    return true;
  }

  if (commandName === 'twitch') {
    await handleTwitchPrefix(message, args);
    return true;
  }

  if (commandName === 'lockdown') {
    if (!(await requirePrefixPermission(message, PermissionFlagsBits.ManageChannels, 'Manage Channels'))) return true;
    const channel = message.mentions.channels.first();
    if (!channel) {
      await message.reply('Usage: `!lockdown #channel`');
      return true;
    }

    const changed = await lockdownChannel(channel);
    await sendLockdownAnnouncement(channel, 'channel');
    await message.reply(changed ? `Locked down ${channel}.` : `I could not lock ${channel}.`);
    await sendLog(message.guild, 'Lockdown Enabled', `${message.author.tag} locked down ${channel}.`, colors.red);
    return true;
  }

  if (commandName === 'unlockdown') {
    if (!(await requirePrefixPermission(message, PermissionFlagsBits.ManageChannels, 'Manage Channels'))) return true;
    const channel = message.mentions.channels.first();
    if (!channel) {
      await message.reply('Usage: `!unlockdown #channel`');
      return true;
    }

    const changed = await unlockChannel(channel);
    await sendUnlockAnnouncement(channel, 'channel');
    await message.reply(changed ? `Unlocked ${channel}.` : `I could not unlock ${channel}.`);
    await sendLog(message.guild, 'Lockdown Disabled', `${message.author.tag} unlocked ${channel}.`, colors.green);
    return true;
  }

  if (commandName === 'lockdownserver' || commandName === 'lockdownsever') {
    if (!(await requirePrefixPermission(message, PermissionFlagsBits.ManageChannels, 'Manage Channels'))) return true;
    const status = await message.reply('Locking down the server...');
    const result = await lockdownServer(message.guild);
    await status.edit(`Locked down ${result.changed} channel(s). Sent lockdown embeds in ${result.announced} channel(s).`);
    await sendLog(message.guild, 'Lockdown Enabled', `${message.author.tag} locked down the server.`, colors.red);
    return true;
  }

  if (commandName === 'unlockdownserver') {
    if (!(await requirePrefixPermission(message, PermissionFlagsBits.ManageChannels, 'Manage Channels'))) return true;
    const status = await message.reply('Unlocking the server...');
    const result = await unlockServer(message.guild);
    await status.edit(`Unlocked ${result.changed} channel(s). Sent unlock embeds in ${result.announced} channel(s).`);
    await sendLog(message.guild, 'Lockdown Disabled', `${message.author.tag} unlocked the server.`, colors.green);
    return true;
  }

  if (commandName === 'purge') {
    if (!(await requirePrefixPermission(message, PermissionFlagsBits.ManageMessages, 'Manage Messages'))) return true;
    const amount = Number.parseInt(args[0], 10);
    if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
      await message.reply('Usage: `!purge <1-100>`');
      return true;
    }

    const deleted = await message.channel.bulkDelete(amount, true);
    await message.channel.send(`Deleted ${deleted.size} message(s).`);
    await sendLog(message.guild, 'Messages Purged', `${message.author.tag} deleted ${deleted.size} message(s) in ${message.channel}.`, colors.yellow);
    return true;
  }

  if (commandName === 'say') {
    if (!(await requirePrefixPermission(message, PermissionFlagsBits.ManageMessages, 'Manage Messages'))) return true;
    const channel = message.mentions.channels.first() ?? message.channel;
    const text = stripLeadingChannelMention(args.join(' '), channel.id);
    if (!text) {
      await message.reply('Usage: `!say [#channel] <message>`');
      return true;
    }

    await message.delete().catch(() => null);
    await channel.send({ content: text, allowedMentions: { parse: [] } });
    await sendLog(message.guild, 'Bot Message Sent', `${message.author.tag} used !say in ${channel}.`, colors.blurple);
    return true;
  }

  if (commandName === 'warn') {
    await handleWarnPrefix(message, args);
    return true;
  }

  if (commandName === 'warnings') {
    if (!(await requirePrefixPermission(message, PermissionFlagsBits.ModerateMembers, 'Moderate Members'))) return true;
    const member = message.mentions.members.first();
    if (!member) {
      await message.reply('Usage: `!warnings @user`');
      return true;
    }

    await message.reply({ embeds: [warningsEmbed(message.guild.id, member.user)] });
    return true;
  }

  if (commandName === 'clearwarns') {
    await handleClearWarnsPrefix(message, args);
    return true;
  }

  if (commandName === 'kick') {
    await handleKickPrefix(message, args);
    return true;
  }

  if (commandName === 'ban') {
    await handleBanPrefix(message, args);
    return true;
  }

  if (commandName === 'unban') {
    if (!(await requirePrefixPermission(message, PermissionFlagsBits.BanMembers, 'Ban Members'))) return true;
    const userId = args[0];
    const reason = args.slice(1).join(' ') || 'No reason provided';
    if (!/^\d{17,20}$/.test(userId ?? '')) {
      await message.reply('Usage: `!unban <user_id> [reason]`');
      return true;
    }

    await message.guild.members.unban(userId, reason);
    await message.reply(`Unbanned user ID ${userId}. Reason: ${reason}`);
    await sendLog(message.guild, 'Member Unbanned', `${message.author.tag} unbanned user ID ${userId}.\nReason: ${reason}`, colors.green);
    return true;
  }

  if (commandName === 'timeout' || commandName === 'mute') {
    await handleTimeoutPrefix(message, args, commandName);
    return true;
  }

  if (commandName === 'unmute') {
    await handleUnmutePrefix(message, args);
    return true;
  }

  if (commandName === 'slowmode') {
    if (!(await requirePrefixPermission(message, PermissionFlagsBits.ManageChannels, 'Manage Channels'))) return true;
    const seconds = Number.parseInt(args[0], 10);
    const channel = message.mentions.channels.first() ?? message.channel;
    if (!Number.isInteger(seconds) || seconds < 0 || seconds > 21600) {
      await message.reply('Usage: `!slowmode <0-21600> [#channel]`');
      return true;
    }

    await channel.setRateLimitPerUser(seconds, `Slowmode changed by ${message.author.tag}`);
    await message.reply(`Slowmode for ${channel} is now ${seconds} second(s).`);
    await sendLog(message.guild, 'Slowmode Updated', `${message.author.tag} set ${channel} slowmode to ${seconds} second(s).`, colors.yellow);
    return true;
  }

  if (commandName === 'nick') {
    await handleNickPrefix(message, args);
    return true;
  }

  if (commandName === 'role') {
    await handleRolePrefix(message, args);
    return true;
  }

  if (commandName === 'dev') {
    await handleDevPrefix(message, args);
    return true;
  }

  return false;
}

async function handleStickySlash(interaction) {
  if (!(await requireSlashPermission(interaction, PermissionFlagsBits.ManageMessages, 'Manage Messages'))) return;

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'add') {
    const channel = interaction.options.getChannel('channel', true);
    const content = interaction.options.getString('message', true);
    setStickyMessage(interaction.guild.id, channel.id, content, interaction.user.id);
    await refreshStickyMessage(interaction.guild, channel);
    await interaction.reply({ content: `Sticky message saved for ${channel}.`, ephemeral: true });
    await sendLog(interaction.guild, 'Sticky Message Updated', `${interaction.user.tag} updated the sticky message in ${channel}.`, colors.green, 'sticky');
    return;
  }

  if (subcommand === 'remove') {
    const channel = interaction.options.getChannel('channel', true);
    const removed = await removeStickyMessage(interaction.guild, channel);
    await interaction.reply({ content: removed ? `Sticky message removed from ${channel}.` : `No sticky message was set in ${channel}.`, ephemeral: true });
    await sendLog(interaction.guild, 'Sticky Message Removed', `${interaction.user.tag} removed the sticky message in ${channel}.`, colors.red, 'sticky');
    return;
  }

  await interaction.reply({ embeds: [stickyStatusEmbed(interaction.guild)], ephemeral: true });
}

async function handleStickyPrefix(message, args) {
  if (!(await requirePrefixPermission(message, PermissionFlagsBits.ManageMessages, 'Manage Messages'))) return;

  const action = args[0]?.toLowerCase();

  if (action === 'add') {
    const channel = message.mentions.channels.first() ?? message.channel;
    const content = stripLeadingChannelMention(args.slice(1).join(' '), channel.id);
    if (!content) {
      await message.reply('Usage: `!sticky add [#channel] <message>`');
      return;
    }

    setStickyMessage(message.guild.id, channel.id, content, message.author.id);
    await refreshStickyMessage(message.guild, channel);
    await message.reply(`Sticky message saved for ${channel}.`);
    await sendLog(message.guild, 'Sticky Message Updated', `${message.author.tag} updated the sticky message in ${channel}.`, colors.green, 'sticky');
    return;
  }

  if (action === 'remove') {
    const channel = message.mentions.channels.first() ?? message.channel;
    const removed = await removeStickyMessage(message.guild, channel);
    await message.reply(removed ? `Sticky message removed from ${channel}.` : `No sticky message was set in ${channel}.`);
    await sendLog(message.guild, 'Sticky Message Removed', `${message.author.tag} removed the sticky message in ${channel}.`, colors.red, 'sticky');
    return;
  }

  if (action === 'status') {
    await message.reply({ embeds: [stickyStatusEmbed(message.guild)] });
    return;
  }

  await message.reply('Usage: `!sticky add [#channel] <message>`, `!sticky remove [#channel]`, or `!sticky status`');
}

async function handleTwitchSlash(interaction) {
  if (!(await requireSlashPermission(interaction, PermissionFlagsBits.ManageGuild, 'Manage Server'))) return;

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'set') {
    const channelName = cleanTwitchName(interaction.options.getString('channel', true));
    const announceChannel = interaction.options.getChannel('announce_channel', true);

    setGuildConfig(interaction.guild.id, {
      twitch: {
        channelName,
        announceChannelId: announceChannel.id,
        enabled: true,
        lastStreamId: null
      }
    });

    await interaction.reply({ embeds: [twitchConfigEmbed(interaction.guild)], ephemeral: true });
    await sendLog(interaction.guild, 'Twitch Alerts Updated', `${interaction.user.tag} set Twitch alerts to twitch.tv/${channelName} in ${announceChannel}.`, colors.twitch, 'twitch');
    await checkTwitchForGuild(interaction.guild, true);
    return;
  }

  if (subcommand === 'remove') {
    setGuildConfig(interaction.guild.id, {
      twitch: {
        channelName: null,
        announceChannelId: null,
        enabled: false,
        lastStreamId: null
      }
    });
    await interaction.reply({ content: 'Twitch live alerts disabled.', ephemeral: true });
    await sendLog(interaction.guild, 'Twitch Alerts Disabled', `${interaction.user.tag} disabled Twitch alerts.`, colors.red, 'twitch');
    return;
  }

  if (subcommand === 'check') {
    const checked = await checkTwitchForGuild(interaction.guild, true);
    await interaction.reply({ content: checked ? 'Twitch check complete.' : twitchSetupHelp(), ephemeral: true });
    return;
  }

  await interaction.reply({ embeds: [twitchConfigEmbed(interaction.guild)], ephemeral: true });
}

async function handleTwitchPrefix(message, args) {
  if (!(await requirePrefixPermission(message, PermissionFlagsBits.ManageGuild, 'Manage Server'))) return;

  const action = args[0]?.toLowerCase();

  if (action === 'remove' || action === 'off') {
    setGuildConfig(message.guild.id, {
      twitch: {
        channelName: null,
        announceChannelId: null,
        enabled: false,
        lastStreamId: null
      }
    });
    await message.reply('Twitch live alerts disabled.');
    await sendLog(message.guild, 'Twitch Alerts Disabled', `${message.author.tag} disabled Twitch alerts.`, colors.red, 'twitch');
    return;
  }

  if (action === 'status') {
    await message.reply({ embeds: [twitchConfigEmbed(message.guild)] });
    return;
  }

  if (action === 'check') {
    const checked = await checkTwitchForGuild(message.guild, true);
    await message.reply(checked ? 'Twitch check complete.' : twitchSetupHelp());
    return;
  }

  const channelName = cleanTwitchName(args[0] ?? '');
  const announceChannel = message.mentions.channels.first() ?? message.channel;
  if (!channelName) {
    await message.reply('Usage: `!twitch <twitch_username> [#announce-channel]`, `!twitch status`, `!twitch check`, or `!twitch remove`');
    return;
  }

  setGuildConfig(message.guild.id, {
    twitch: {
      channelName,
      announceChannelId: announceChannel.id,
      enabled: true,
      lastStreamId: null
    }
  });

  await message.reply({ embeds: [twitchConfigEmbed(message.guild)] });
  await sendLog(message.guild, 'Twitch Alerts Updated', `${message.author.tag} set Twitch alerts to twitch.tv/${channelName} in ${announceChannel}.`, colors.twitch, 'twitch');
  await checkTwitchForGuild(message.guild, true);
}

async function handleWarnSlash(interaction) {
  if (!(await requireSlashPermission(interaction, PermissionFlagsBits.ModerateMembers, 'Moderate Members'))) return;
  const member = await getSlashMember(interaction, 'user');
  if (!member) {
    await interaction.reply({ content: 'I could not find that member.', ephemeral: true });
    return;
  }

  const blocker = await moderationBlocker(interaction.guild, interaction.member, member);
  if (blocker) {
    await interaction.reply({ content: blocker, ephemeral: true });
    return;
  }

  const reason = interaction.options.getString('reason') ?? 'No reason provided';
  const warningNumber = addWarning(interaction.guild.id, member.id, interaction.user.id, reason);
  await interaction.reply(`Warned ${member.user.tag}. Warning #${warningNumber}. Reason: ${reason}`);
  await sendLog(interaction.guild, 'Member Warned', `${interaction.user.tag} warned ${member.user.tag}.\nReason: ${reason}`, colors.yellow);
}

async function handleWarnPrefix(message, args) {
  if (!(await requirePrefixPermission(message, PermissionFlagsBits.ModerateMembers, 'Moderate Members'))) return;
  const member = message.mentions.members.first();
  const reason = args.slice(1).join(' ') || 'No reason provided';
  if (!member) {
    await message.reply('Usage: `!warn @user [reason]`');
    return;
  }

  const blocker = await moderationBlocker(message.guild, message.member, member);
  if (blocker) {
    await message.reply(blocker);
    return;
  }

  const warningNumber = addWarning(message.guild.id, member.id, message.author.id, reason);
  await message.reply(`Warned ${member.user.tag}. Warning #${warningNumber}. Reason: ${reason}`);
  await sendLog(message.guild, 'Member Warned', `${message.author.tag} warned ${member.user.tag}.\nReason: ${reason}`, colors.yellow);
}

async function handleClearWarnsSlash(interaction) {
  if (!(await requireSlashPermission(interaction, PermissionFlagsBits.ModerateMembers, 'Moderate Members'))) return;
  const user = interaction.options.getUser('user', true);
  const caseNumber = interaction.options.getInteger('case');
  const removed = clearWarnings(interaction.guild.id, user.id, caseNumber);
  await interaction.reply({ content: removedMessage(removed, user, caseNumber), ephemeral: true });
  await sendLog(interaction.guild, 'Warnings Cleared', `${interaction.user.tag} cleared warning(s) for ${user.tag}.`, colors.green);
}

async function handleClearWarnsPrefix(message, args) {
  if (!(await requirePrefixPermission(message, PermissionFlagsBits.ModerateMembers, 'Moderate Members'))) return;
  const member = message.mentions.members.first();
  const caseNumber = Number.parseInt(args[1], 10);
  if (!member) {
    await message.reply('Usage: `!clearwarns @user [case]`');
    return;
  }

  const removed = clearWarnings(message.guild.id, member.id, Number.isInteger(caseNumber) ? caseNumber : null);
  await message.reply(removedMessage(removed, member.user, Number.isInteger(caseNumber) ? caseNumber : null));
  await sendLog(message.guild, 'Warnings Cleared', `${message.author.tag} cleared warning(s) for ${member.user.tag}.`, colors.green);
}

async function handleKickSlash(interaction) {
  if (!(await requireSlashPermission(interaction, PermissionFlagsBits.KickMembers, 'Kick Members'))) return;
  const member = await getSlashMember(interaction, 'user');
  const reason = interaction.options.getString('reason') ?? 'No reason provided';

  if (!member) {
    await interaction.reply({ content: 'I could not find that member.', ephemeral: true });
    return;
  }

  const blocker = await moderationBlocker(interaction.guild, interaction.member, member);
  if (blocker || !member.kickable) {
    await interaction.reply({ content: blocker ?? 'I cannot kick that member. Check my role position and permissions.', ephemeral: true });
    return;
  }

  await member.kick(reason);
  await interaction.reply(`Kicked ${member.user.tag}. Reason: ${reason}`);
  await sendLog(interaction.guild, 'Member Kicked', `${interaction.user.tag} kicked ${member.user.tag}.\nReason: ${reason}`, colors.red);
}

async function handleKickPrefix(message, args) {
  if (!(await requirePrefixPermission(message, PermissionFlagsBits.KickMembers, 'Kick Members'))) return;
  const member = message.mentions.members.first();
  const reason = args.slice(1).join(' ') || 'No reason provided';
  if (!member) {
    await message.reply('Usage: `!kick @user [reason]`');
    return;
  }

  const blocker = await moderationBlocker(message.guild, message.member, member);
  if (blocker || !member.kickable) {
    await message.reply(blocker ?? 'I cannot kick that member. Check my role position and permissions.');
    return;
  }

  await member.kick(reason);
  await message.reply(`Kicked ${member.user.tag}. Reason: ${reason}`);
  await sendLog(message.guild, 'Member Kicked', `${message.author.tag} kicked ${member.user.tag}.\nReason: ${reason}`, colors.red);
}

async function handleBanSlash(interaction) {
  if (!(await requireSlashPermission(interaction, PermissionFlagsBits.BanMembers, 'Ban Members'))) return;
  const member = await getSlashMember(interaction, 'user');
  const reason = interaction.options.getString('reason') ?? 'No reason provided';

  if (!member) {
    await interaction.reply({ content: 'I could not find that member.', ephemeral: true });
    return;
  }

  const blocker = await moderationBlocker(interaction.guild, interaction.member, member);
  if (blocker || !member.bannable) {
    await interaction.reply({ content: blocker ?? 'I cannot ban that member. Check my role position and permissions.', ephemeral: true });
    return;
  }

  await member.ban({ reason });
  await interaction.reply(`Banned ${member.user.tag}. Reason: ${reason}`);
  await sendLog(interaction.guild, 'Member Banned', `${interaction.user.tag} banned ${member.user.tag}.\nReason: ${reason}`, colors.red);
}

async function handleBanPrefix(message, args) {
  if (!(await requirePrefixPermission(message, PermissionFlagsBits.BanMembers, 'Ban Members'))) return;
  const member = message.mentions.members.first();
  const reason = args.slice(1).join(' ') || 'No reason provided';
  if (!member) {
    await message.reply('Usage: `!ban @user [reason]`');
    return;
  }

  const blocker = await moderationBlocker(message.guild, message.member, member);
  if (blocker || !member.bannable) {
    await message.reply(blocker ?? 'I cannot ban that member. Check my role position and permissions.');
    return;
  }

  await member.ban({ reason });
  await message.reply(`Banned ${member.user.tag}. Reason: ${reason}`);
  await sendLog(message.guild, 'Member Banned', `${message.author.tag} banned ${member.user.tag}.\nReason: ${reason}`, colors.red);
}

async function handleTimeoutSlash(interaction, commandName) {
  if (!(await requireSlashPermission(interaction, PermissionFlagsBits.ModerateMembers, 'Moderate Members'))) return;
  const member = await getSlashMember(interaction, 'user');
  const minutes = interaction.options.getInteger('minutes', true);
  const reason = interaction.options.getString('reason') ?? 'No reason provided';

  if (!member) {
    await interaction.reply({ content: 'I could not find that member.', ephemeral: true });
    return;
  }

  const blocker = await moderationBlocker(interaction.guild, interaction.member, member);
  if (blocker || !member.moderatable) {
    await interaction.reply({ content: blocker ?? 'I cannot timeout that member. Check my role position and permissions.', ephemeral: true });
    return;
  }

  await member.timeout(minutes * 60_000, reason);
  await interaction.reply(`${commandName === 'mute' ? 'Muted' : 'Timed out'} ${member.user.tag} for ${minutes} minute(s). Reason: ${reason}`);
  await sendLog(interaction.guild, 'Member Timed Out', `${interaction.user.tag} timed out ${member.user.tag} for ${minutes} minute(s).\nReason: ${reason}`, colors.yellow);
}

async function handleTimeoutPrefix(message, args, commandName) {
  if (!(await requirePrefixPermission(message, PermissionFlagsBits.ModerateMembers, 'Moderate Members'))) return;
  const member = message.mentions.members.first();
  const minutes = Number.parseInt(args[1], 10);
  const reason = args.slice(2).join(' ') || 'No reason provided';
  if (!member || !Number.isInteger(minutes) || minutes < 1 || minutes > 40320) {
    await message.reply(`Usage: \`!${commandName} @user <minutes> [reason]\``);
    return;
  }

  const blocker = await moderationBlocker(message.guild, message.member, member);
  if (blocker || !member.moderatable) {
    await message.reply(blocker ?? 'I cannot timeout that member. Check my role position and permissions.');
    return;
  }

  await member.timeout(minutes * 60_000, reason);
  await message.reply(`${commandName === 'mute' ? 'Muted' : 'Timed out'} ${member.user.tag} for ${minutes} minute(s). Reason: ${reason}`);
  await sendLog(message.guild, 'Member Timed Out', `${message.author.tag} timed out ${member.user.tag} for ${minutes} minute(s).\nReason: ${reason}`, colors.yellow);
}

async function handleUnmuteSlash(interaction) {
  if (!(await requireSlashPermission(interaction, PermissionFlagsBits.ModerateMembers, 'Moderate Members'))) return;
  const member = await getSlashMember(interaction, 'user');
  const reason = interaction.options.getString('reason') ?? 'No reason provided';

  if (!member) {
    await interaction.reply({ content: 'I could not find that member.', ephemeral: true });
    return;
  }

  const blocker = await moderationBlocker(interaction.guild, interaction.member, member);
  if (blocker || !member.moderatable) {
    await interaction.reply({ content: blocker ?? 'I cannot unmute that member. Check my role position and permissions.', ephemeral: true });
    return;
  }

  await member.timeout(null, reason);
  await interaction.reply(`Unmuted ${member.user.tag}. Reason: ${reason}`);
  await sendLog(interaction.guild, 'Member Unmuted', `${interaction.user.tag} removed timeout from ${member.user.tag}.\nReason: ${reason}`, colors.green);
}

async function handleUnmutePrefix(message, args) {
  if (!(await requirePrefixPermission(message, PermissionFlagsBits.ModerateMembers, 'Moderate Members'))) return;
  const member = message.mentions.members.first();
  const reason = args.slice(1).join(' ') || 'No reason provided';
  if (!member) {
    await message.reply('Usage: `!unmute @user [reason]`');
    return;
  }

  const blocker = await moderationBlocker(message.guild, message.member, member);
  if (blocker || !member.moderatable) {
    await message.reply(blocker ?? 'I cannot unmute that member. Check my role position and permissions.');
    return;
  }

  await member.timeout(null, reason);
  await message.reply(`Unmuted ${member.user.tag}. Reason: ${reason}`);
  await sendLog(message.guild, 'Member Unmuted', `${message.author.tag} removed timeout from ${member.user.tag}.\nReason: ${reason}`, colors.green);
}

async function handleNickSlash(interaction) {
  if (!(await requireSlashPermission(interaction, PermissionFlagsBits.ManageNicknames, 'Manage Nicknames'))) return;
  const member = await getSlashMember(interaction, 'user');
  const nickname = interaction.options.getString('nickname');

  if (!member) {
    await interaction.reply({ content: 'I could not find that member.', ephemeral: true });
    return;
  }

  const blocker = await moderationBlocker(interaction.guild, interaction.member, member, { allowSelf: true });
  if (blocker || !member.manageable) {
    await interaction.reply({ content: blocker ?? 'I cannot change that nickname. Check my role position and permissions.', ephemeral: true });
    return;
  }

  await member.setNickname(nickname, `Nickname changed by ${interaction.user.tag}`);
  await interaction.reply({ content: nickname ? `Changed ${member.user.tag}'s nickname to **${nickname}**.` : `Reset ${member.user.tag}'s nickname.`, ephemeral: true });
  await sendLog(interaction.guild, 'Nickname Updated', `${interaction.user.tag} updated nickname for ${member.user.tag}.`, colors.blurple);
}

async function handleNickPrefix(message, args) {
  if (!(await requirePrefixPermission(message, PermissionFlagsBits.ManageNicknames, 'Manage Nicknames'))) return;
  const member = message.mentions.members.first();
  const nickname = args.slice(1).join(' ') || null;
  if (!member) {
    await message.reply('Usage: `!nick @user [nickname]`');
    return;
  }

  const blocker = await moderationBlocker(message.guild, message.member, member, { allowSelf: true });
  if (blocker || !member.manageable) {
    await message.reply(blocker ?? 'I cannot change that nickname. Check my role position and permissions.');
    return;
  }

  await member.setNickname(nickname, `Nickname changed by ${message.author.tag}`);
  await message.reply(nickname ? `Changed ${member.user.tag}'s nickname to **${nickname}**.` : `Reset ${member.user.tag}'s nickname.`);
  await sendLog(message.guild, 'Nickname Updated', `${message.author.tag} updated nickname for ${member.user.tag}.`, colors.blurple);
}

async function handleRoleSlash(interaction) {
  if (!(await requireSlashPermission(interaction, PermissionFlagsBits.ManageRoles, 'Manage Roles'))) return;
  const action = interaction.options.getSubcommand();
  const member = await getSlashMember(interaction, 'user');
  const role = interaction.options.getRole('role', true);

  if (!member) {
    await interaction.reply({ content: 'I could not find that member.', ephemeral: true });
    return;
  }

  const blocker = await roleBlocker(interaction.guild, interaction.member, role);
  if (blocker) {
    await interaction.reply({ content: blocker, ephemeral: true });
    return;
  }

  if (action === 'add') {
    await member.roles.add(role, `Role added by ${interaction.user.tag}`);
  } else {
    await member.roles.remove(role, `Role removed by ${interaction.user.tag}`);
  }

  await interaction.reply({ content: `${action === 'add' ? 'Added' : 'Removed'} ${role} ${action === 'add' ? 'to' : 'from'} ${member.user.tag}.`, ephemeral: true });
  await sendLog(interaction.guild, 'Role Updated', `${interaction.user.tag} ${action === 'add' ? 'added' : 'removed'} ${role.name} ${action === 'add' ? 'to' : 'from'} ${member.user.tag}.`, colors.blurple);
}

async function handleRolePrefix(message, args) {
  if (!(await requirePrefixPermission(message, PermissionFlagsBits.ManageRoles, 'Manage Roles'))) return;
  const action = args[0]?.toLowerCase();
  const member = message.mentions.members.first();
  const role = message.mentions.roles.first();

  if (!['add', 'remove'].includes(action) || !member || !role) {
    await message.reply('Usage: `!role add @user @role` or `!role remove @user @role`');
    return;
  }

  const blocker = await roleBlocker(message.guild, message.member, role);
  if (blocker) {
    await message.reply(blocker);
    return;
  }

  if (action === 'add') {
    await member.roles.add(role, `Role added by ${message.author.tag}`);
  } else {
    await member.roles.remove(role, `Role removed by ${message.author.tag}`);
  }

  await message.reply(`${action === 'add' ? 'Added' : 'Removed'} ${role} ${action === 'add' ? 'to' : 'from'} ${member.user.tag}.`);
  await sendLog(message.guild, 'Role Updated', `${message.author.tag} ${action === 'add' ? 'added' : 'removed'} ${role.name} ${action === 'add' ? 'to' : 'from'} ${member.user.tag}.`, colors.blurple);
}

async function handleDevSlash(interaction) {
  if (!(await requireSlashDev(interaction))) return;

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'runtime') {
    await interaction.reply({ embeds: [devRuntimeEmbed()], ephemeral: true });
    return;
  }

  if (subcommand === 'servers') {
    await interaction.reply({ embeds: [devServersEmbed()], ephemeral: true });
    return;
  }

  if (subcommand === 'say') {
    const channel = interaction.options.getChannel('channel') ?? interaction.channel;
    const text = interaction.options.getString('message', true);
    await channel.send({ content: text, allowedMentions: { parse: [] } });
    await interaction.reply({ content: `Developer message sent in ${channel}.`, ephemeral: true });
    await sendLog(interaction.guild, 'Developer Message Sent', `${interaction.user.tag} used /dev say in ${channel}.`, colors.purple, 'dev');
    return;
  }

  if (subcommand === 'bonk') {
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') ?? 'minor vibe violation';
    await interaction.reply({ content: devBonkResponse(user, reason), allowedMentions: { users: [user.id] } });
    return;
  }

  if (subcommand === 'fakeban') {
    const user = interaction.options.getUser('user', true);
    await interaction.reply(devFakeBanResponse(user));
    return;
  }

  if (subcommand === 'vibecheck') {
    const user = interaction.options.getUser('user') ?? interaction.user;
    await interaction.reply(devVibeCheckResponse(user));
    return;
  }

  if (subcommand === 'reverse') {
    await interaction.reply(reverseText(interaction.options.getString('text', true)));
    return;
  }

  if (subcommand === 'vaporwave') {
    await interaction.reply(wideText(interaction.options.getString('text', true)));
    return;
  }

  if (subcommand === 'panic') {
    await interaction.reply({ content: 'Fake panic sequence sent.', ephemeral: true });
    await runFakePanic(interaction.channel);
    return;
  }

  if (subcommand === 'renamebot') {
    const nickname = interaction.options.getString('nickname', true);
    const me = interaction.guild.members.me ?? await interaction.guild.members.fetchMe().catch(() => null);
    if (!me?.manageable) {
      await interaction.reply({ content: 'I cannot change my nickname here. Check role position and Change Nickname permission.', ephemeral: true });
      return;
    }

    await me.setNickname(nickname, `Bot nickname changed by ${interaction.user.tag}`);
    await interaction.reply({ content: `Bot nickname changed to **${nickname}** in this server.`, ephemeral: true });
    await sendLog(interaction.guild, 'Bot Name Updated', `${interaction.user.tag} changed the bot nickname to ${nickname}.`, colors.purple, 'dev');
    return;
  }

  if (subcommand === 'presence') {
    presenceText = interaction.options.getString('text', true);
    applyBotPresence();
    await interaction.reply({ content: `Presence updated to **${presenceText}**.`, ephemeral: true });
    await sendLog(interaction.guild, 'Developer Presence Updated', `${interaction.user.tag} changed the bot presence.`, colors.purple, 'dev');
  }
}

async function handleDevPrefix(message, args) {
  if (!(await requirePrefixDev(message))) return;

  const action = args[0]?.toLowerCase();

  if (action === 'runtime') {
    await message.reply({ embeds: [devRuntimeEmbed()] });
    return;
  }

  if (action === 'servers') {
    await message.reply({ embeds: [devServersEmbed()] });
    return;
  }

  if (action === 'say') {
    const channel = message.mentions.channels.first() ?? message.channel;
    const text = stripLeadingChannelMention(args.slice(1).join(' '), channel.id);
    if (!text) {
      await message.reply('Usage: `!dev say [#channel] <message>`');
      return;
    }

    await channel.send({ content: text, allowedMentions: { parse: [] } });
    await sendLog(message.guild, 'Developer Message Sent', `${message.author.tag} used !dev say in ${channel}.`, colors.purple, 'dev');
    return;
  }

  if (action === 'bonk') {
    const user = message.mentions.users.first();
    if (!user) {
      await message.reply('Usage: `!dev bonk @user [reason]`');
      return;
    }

    const reason = args.slice(2).join(' ') || 'minor vibe violation';
    await message.reply({ content: devBonkResponse(user, reason), allowedMentions: { users: [user.id] } });
    return;
  }

  if (action === 'fakeban') {
    const user = message.mentions.users.first();
    if (!user) {
      await message.reply('Usage: `!dev fakeban @user`');
      return;
    }

    await message.reply(devFakeBanResponse(user));
    return;
  }

  if (action === 'vibecheck') {
    const user = message.mentions.users.first() ?? message.author;
    await message.reply(devVibeCheckResponse(user));
    return;
  }

  if (action === 'reverse') {
    const text = args.slice(1).join(' ');
    await message.reply(text ? reverseText(text) : 'Usage: `!dev reverse <text>`');
    return;
  }

  if (action === 'vaporwave') {
    const text = args.slice(1).join(' ');
    await message.reply(text ? wideText(text) : 'Usage: `!dev vaporwave <text>`');
    return;
  }

  if (action === 'panic') {
    await runFakePanic(message.channel);
    return;
  }

  if (action === 'renamebot') {
    const nickname = args.slice(1).join(' ');
    const me = message.guild.members.me ?? await message.guild.members.fetchMe().catch(() => null);
    if (!nickname || nickname.length < 2 || nickname.length > 32) {
      await message.reply('Usage: `!dev renamebot <2-32 character nickname>`');
      return;
    }
    if (!me?.manageable) {
      await message.reply('I cannot change my nickname here. Check role position and Change Nickname permission.');
      return;
    }

    await me.setNickname(nickname, `Bot nickname changed by ${message.author.tag}`);
    await message.reply(`Bot nickname changed to **${nickname}** in this server.`);
    await sendLog(message.guild, 'Bot Name Updated', `${message.author.tag} changed the bot nickname to ${nickname}.`, colors.purple, 'dev');
    return;
  }

  if (action === 'presence') {
    const nextPresence = args.slice(1).join(' ');
    if (!nextPresence) {
      await message.reply('Usage: `!dev presence <text>`');
      return;
    }

    presenceText = nextPresence.slice(0, 80);
    applyBotPresence();
    await message.reply(`Presence updated to **${presenceText}**.`);
    await sendLog(message.guild, 'Developer Presence Updated', `${message.author.tag} changed the bot presence.`, colors.purple, 'dev');
    return;
  }

  await message.reply({ embeds: [devCommandsEmbed()] });
}

async function handleDevDashboardButton(interaction) {
  if (!interaction.customId?.startsWith('devdash:')) return;

  if (!(await requireSlashDev(interaction))) return;
  if (!interaction.inGuild()) {
    await interaction.reply({ content: 'The developer dashboard only works in a server.', ephemeral: true });
    return;
  }

  const action = interaction.customId.split(':')[1];

  if (action === 'refresh') {
    await interaction.update(devDashboardPayload(interaction.guild));
    return;
  }

  if (action === 'runtime') {
    await interaction.reply({ embeds: [devRuntimeEmbed()], ephemeral: true });
    return;
  }

  if (action === 'servers') {
    await interaction.reply({ embeds: [devServersEmbed()], ephemeral: true });
    return;
  }

  if (action === 'config') {
    await interaction.reply({ embeds: [devConfigEmbed(interaction.guild)], ephemeral: true });
    return;
  }

  if (action === 'devusers') {
    await interaction.showModal(devUsersModal());
    return;
  }

  if (action === 'adddev') {
    await interaction.showModal(devAddUserModal());
    return;
  }

  if (action === 'commands') {
    await interaction.reply({ embeds: [commandListEmbed(), adminCommandsEmbed(), devCommandsEmbed()], ephemeral: true });
    return;
  }

  if (action === 'presence') {
    await interaction.showModal(devPresenceModal());
    return;
  }

  if (action === 'rename') {
    await interaction.showModal(devRenameModal(interaction.guild.members.me?.displayName ?? client.user?.username ?? 'V2 Bot'));
    return;
  }

  if (action === 'say') {
    await interaction.showModal(devSayModal());
    return;
  }

  if (action === 'testlog') {
    const sent = await sendLog(interaction.guild, 'Developer Dashboard Test', `${interaction.user.tag} sent a dev dashboard test log.`, colors.purple, 'dev');
    await interaction.reply({ content: sent ? 'Test log sent.' : 'Logs are disabled or no log channel is set.', ephemeral: true });
    return;
  }

  if (action === 'twitch') {
    await interaction.reply({ embeds: [twitchConfigEmbed(interaction.guild)], ephemeral: true });
    return;
  }

  if (action === 'togglelogs') {
    const guildConfig = getGuildConfig(interaction.guild.id);
    setGuildConfig(interaction.guild.id, { logsEnabled: !guildConfig.logsEnabled });
    await interaction.update(devDashboardPayload(interaction.guild));
    await sendLog(interaction.guild, 'Developer Dashboard Updated', `${interaction.user.tag} toggled logs ${guildConfig.logsEnabled ? 'off' : 'on'}.`, colors.purple, 'dev');
    return;
  }

  if (action === 'sticky') {
    await interaction.reply({ embeds: [stickyStatusEmbed(interaction.guild)], ephemeral: true });
    return;
  }

  if (action === 'reset') {
    await interaction.showModal(devResetModal(interaction.guild.name));
  }
}

async function handleDevDashboardModal(interaction) {
  if (!interaction.customId?.startsWith('devdash:')) return;

  if (!(await requireSlashDev(interaction))) return;
  if (!interaction.inGuild()) {
    await interaction.reply({ content: 'The developer dashboard only works in a server.', ephemeral: true });
    return;
  }

  const action = interaction.customId.split(':')[1];

  if (action === 'presence') {
    presenceText = interaction.fields.getTextInputValue('presence_text').trim().slice(0, 80) || defaultPresenceText;
    applyBotPresence();
    await interaction.reply({ content: `Presence updated to **${presenceText}**.`, ephemeral: true });
    await sendLog(interaction.guild, 'Developer Presence Updated', `${interaction.user.tag} changed the bot presence from the developer dashboard.`, colors.purple, 'dev');
    return;
  }

  if (action === 'devusers') {
    const rawIds = interaction.fields.getTextInputValue('dev_user_ids');
    const ids = extractUserIds(rawIds);
    setConfiguredDeveloperIds(ids);
    await interaction.reply({
      content: `Developer users updated. ${config.devUserIds.length} saved in the dashboard config.`,
      embeds: [devDashboardEmbed(interaction.guild)],
      components: devDashboardComponents(interaction.guild),
      ephemeral: true
    });
    await sendLog(interaction.guild, 'Developer Users Updated', `${interaction.user.tag} updated the developer user list.`, colors.purple, 'dev');
    return;
  }

  if (action === 'adddev') {
    const rawIds = interaction.fields.getTextInputValue('dev_user_id');
    const ids = extractUserIds(rawIds);
    if (!ids.length) {
      await interaction.reply({ content: 'Paste at least one Discord user ID or mention.', ephemeral: true });
      return;
    }

    const before = new Set(config.devUserIds ?? []);
    setConfiguredDeveloperIds([...(config.devUserIds ?? []), ...ids]);
    const added = config.devUserIds.filter((id) => !before.has(id));

    await interaction.reply({
      content: added.length
        ? `Added ${added.map((id) => `<@${id}>`).join(', ')} as developer user(s).`
        : 'Those users were already in the developer list.',
      embeds: [devDashboardEmbed(interaction.guild)],
      components: devDashboardComponents(interaction.guild),
      ephemeral: true
    });
    await sendLog(interaction.guild, 'Developer Users Updated', `${interaction.user.tag} added developer user IDs from the dashboard.`, colors.purple, 'dev');
    return;
  }

  if (action === 'rename') {
    const nickname = interaction.fields.getTextInputValue('bot_nickname').trim();
    const me = interaction.guild.members.me ?? await interaction.guild.members.fetchMe().catch(() => null);

    if (!me?.manageable) {
      await interaction.reply({ content: 'I cannot change my nickname here. Check role position and Change Nickname permission.', ephemeral: true });
      return;
    }

    await me.setNickname(nickname, `Bot nickname changed by ${interaction.user.tag}`);
    await interaction.reply({ content: `Bot nickname changed to **${nickname}** in this server.`, ephemeral: true });
    await sendLog(interaction.guild, 'Bot Name Updated', `${interaction.user.tag} changed the bot nickname to ${nickname} from the developer dashboard.`, colors.purple, 'dev');
    return;
  }

  if (action === 'say') {
    const text = interaction.fields.getTextInputValue('say_message').trim();
    await interaction.channel.send({ content: text, allowedMentions: { parse: [] } });
    await interaction.reply({ content: 'Developer dashboard message sent in this channel.', ephemeral: true });
    await sendLog(interaction.guild, 'Developer Message Sent', `${interaction.user.tag} used the developer dashboard say control in ${interaction.channel}.`, colors.purple, 'dev');
    return;
  }

  if (action === 'reset') {
    const confirmation = interaction.fields.getTextInputValue('reset_confirmation').trim();
    if (confirmation !== 'RESET') {
      await interaction.reply({ content: 'Reset cancelled. You must type `RESET` exactly to reset everything the bot knows about this server.', ephemeral: true });
      return;
    }

    resetGuildConfig(interaction.guild.id);
    await interaction.reply({ content: 'Everything the bot knows about this server has been reset to clean V2 defaults.', embeds: [devDashboardEmbed(interaction.guild)], components: devDashboardComponents(interaction.guild), ephemeral: true });
  }
}

function applyBotPresence() {
  client.user?.setPresence({
    status: 'online',
    activities: [{ name: presenceText, type: ActivityType.Playing }]
  });
}

function parseIdList(value) {
  return new Set((value ?? '').split(',').map((id) => id.trim()).filter(Boolean));
}

function loadConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    parsed.version ??= 2;
    parsed.devUserIds ??= [];
    parsed.guilds ??= {};
    return parsed;
  } catch {
    return { version: 2, devUserIds: [], guilds: {} };
  }
}

function saveConfig() {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
}

function defaultGuildConfig() {
  return {
    logChannelId: null,
    logsEnabled: false,
    enabledLogCategories: defaultLogCategoryIds,
    lockdownRoleId: null,
    stickyMessages: {},
    warnings: {},
    joinChat: {
      enabled: false,
      channelId: null,
      enabledBy: null,
      enabledAt: null
    },
    twitch: {
      channelName: null,
      announceChannelId: null,
      enabled: false,
      lastStreamId: null
    }
  };
}

function getGuildConfig(guildId) {
  config.version ??= 2;
  config.devUserIds ??= [];
  config.guilds ??= {};
  config.guilds[guildId] ??= defaultGuildConfig();

  const guildConfig = config.guilds[guildId];
  guildConfig.logChannelId ??= null;
  guildConfig.logsEnabled ??= false;
  guildConfig.enabledLogCategories ??= defaultLogCategoryIds;
  guildConfig.lockdownRoleId ??= null;
  guildConfig.stickyMessages ??= {};
  guildConfig.warnings ??= {};
  guildConfig.joinChat ??= {
    enabled: false,
    channelId: null,
    enabledBy: null,
    enabledAt: null
  };
  guildConfig.twitch ??= {
    channelName: null,
    announceChannelId: null,
    enabled: false,
    lastStreamId: null
  };
  return guildConfig;
}

function setGuildConfig(guildId, updates) {
  Object.assign(getGuildConfig(guildId), updates);
  saveConfig();
}

function setJoinChat(guildId, channelId, userId) {
  const guildConfig = getGuildConfig(guildId);
  guildConfig.joinChat = {
    enabled: true,
    channelId,
    enabledBy: userId,
    enabledAt: Date.now()
  };
  saveConfig();
}

function configuredDeveloperIds() {
  config.devUserIds ??= [];
  return new Set([
    ...developerIds,
    ...config.devUserIds.map((id) => String(id).trim()).filter(Boolean)
  ]);
}

function configuredErrorDmIds() {
  config.errorDmUserIds ??= [];
  return new Set([
    ...errorDmIds,
    ...config.errorDmUserIds.map((id) => String(id).trim()).filter(Boolean),
    ...configuredDeveloperIds()
  ]);
}

function createErrorEmbed(error, context = {}) {
  const name = String(error?.name ?? 'Error');
  const message = String(error?.message ?? 'Unknown error');
  const contextLines = [];

  if (context.type) contextLines.push(`Type: ${context.type}`);
  if (context.command) contextLines.push(`Command: ${context.command}`);
  if (context.user) contextLines.push(`User: ${context.user}`);
  if (context.server) contextLines.push(`Server: ${context.server}`);
  if (context.channel) contextLines.push(`Channel: ${context.channel}`);
  if (context.extra) contextLines.push(context.extra);

  const fields = [
    { name: 'Summary', value: truncate(message, 1024), inline: false }
  ];

  if (contextLines.length) {
    fields.push({ name: 'Context', value: contextLines.join('\n'), inline: false });
  }

  const stackText = String(error?.stack ?? '').trim();
  if (stackText) {
    const stackLines = stackText.split('\n').slice(0, 10);
    const truncatedStack = truncate(stackLines.join('\n'), 900);
    fields.push({ name: 'Stack', value: `\`\`\`\n${truncatedStack}\n\`\`\``, inline: false });
  }

  return new EmbedBuilder()
    .setTitle(`Bot Error — ${name}`)
    .setColor(colors.red)
    .setDescription('A major failure was detected. Review the summary, context, and stack below.')
    .setFields(fields)
    .setFooter({ text: embedFooterText('Error notification') })
    .setTimestamp();
}

function shouldNotifyDevelopers(error, context = {}) {
  if (!context.type) return false;
  if (context.type === 'UnhandledRejection' || context.type === 'UncaughtException') return true;
  if (context.type === 'Interaction' && context.extra === 'Failed before sending a reply to the user.') return true;
  if (context.type === 'Message' && context.command === 'PrefixCommand') return true;
  return false;
}

async function notifyDevelopersOfError(error, context = {}) {
  if (!shouldNotifyDevelopers(error, context)) return;

  const devIds = [...configuredErrorDmIds()];
  if (!devIds.length) return;

  const embed = createErrorEmbed(error, context);
  for (const devId of devIds) {
    try {
      const user = await client.users.fetch(devId).catch(() => null);
      if (!user) continue;
      await user.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => null);
    } catch {
      // ignore DM failures
    }
  }
}

function setConfiguredDeveloperIds(ids) {
  config.devUserIds = [...new Set(ids.map((id) => String(id).trim()).filter((id) => /^\d{17,20}$/.test(id)))];
  saveConfig();
}

function extractUserIds(value) {
  return [...new Set(String(value ?? '').match(/\d{17,20}/g) ?? [])];
}

function formatDeveloperIds() {
  const ids = [...configuredDeveloperIds()];
  return ids.length ? ids.map((id) => `<@${id}> (${id})`).join('\n') : 'No dev users are set. Server owners and admins can bootstrap this dashboard.';
}

function resetGuildConfig(guildId) {
  config.guilds[guildId] = defaultGuildConfig();
  saveConfig();
}

function getEnabledLogCategories(guildId) {
  const guildConfig = getGuildConfig(guildId);
  return guildConfig.enabledLogCategories?.filter((id) => logCategories.some((category) => category.id === id)) ?? defaultLogCategoryIds;
}

function isLogCategoryEnabled(guildId, category) {
  return getEnabledLogCategories(guildId).includes(category);
}

function formatLogCategories(categoryIds) {
  const enabled = categoryIds?.length ? categoryIds : defaultLogCategoryIds;
  return enabled
    .map((id) => logCategories.find((category) => category.id === id)?.label)
    .filter(Boolean)
    .join(', ') || 'None';
}

async function sendLog(guild, title, description, color = colors.blurple, category = logCategoryForTitle(title)) {
  const guildConfig = getGuildConfig(guild.id);
  if (!guildConfig.logsEnabled || !guildConfig.logChannelId) return false;
  if (!isLogCategoryEnabled(guild.id, category)) return false;

  const channel = await guild.channels.fetch(guildConfig.logChannelId).catch(() => null);
  if (!channel?.isTextBased()) return false;

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(description)
        .setFooter({ text: embedFooterText() })
        .setTimestamp()
    ],
    allowedMentions: { parse: [] }
  }).catch(() => null);

  return true;
}

function logCategoryForTitle(title) {
  if (/message/i.test(title)) return 'messages';
  if (/member joined|member left|member updated/i.test(title)) return 'members';
  if (/warn|kick|ban|unban|timeout|mute|purge|lockdown|slowmode/i.test(title)) return 'moderation';
  if (/channel/i.test(title)) return 'channels';
  if (/role/i.test(title)) return 'roles';
  if (/voice/i.test(title)) return 'voice';
  if (/sticky/i.test(title)) return 'sticky';
  if (/twitch/i.test(title)) return 'twitch';
  if (/developer|dev/i.test(title)) return 'dev';
  return 'dashboard';
}

function isAiProviderError(error) {
  const message = String(error?.message ?? '').toLowerCase();
  return /hugging face error|together\.ai|invalid_api_key|credit_limit|model_not_available|rate_limit|authorization|error \d{3}/.test(message);
}

async function notifyDevelopersOfAiFailure(guild, error, channel) {
  const devIds = [...configuredDeveloperIds()];
  const errorText = String(error?.message ?? 'Unknown AI error');
  const channelName = channel?.name ? `#${channel.name}` : 'unknown channel';
  const description = `AI join chat feature locked due to an AI provider failure in ${guild.name} (${guild.id}) on ${channelName}.\nError: ${errorText}`;

  if (devIds.length) {
    const aiEmbed = new EmbedBuilder()
      .setTitle('AI Provider Error')
      .setColor(colors.red)
      .setDescription('AI join chat has been locked until the next restart due to an AI provider failure.')
      .addFields(
        { name: 'Server', value: `${guild.name} (${guild.id})`, inline: false },
        { name: 'Channel', value: channelName, inline: false },
        { name: 'Error', value: truncate(errorText, 1024), inline: false }
      )
      .setFooter({ text: embedFooterText('AI provider alert') })
      .setTimestamp();

    for (const devId of devIds) {
      try {
        const user = await client.users.fetch(devId).catch(() => null);
        if (user) {
          await user.send({ embeds: [aiEmbed], allowedMentions: { parse: [] } }).catch(() => null);
        }
      } catch {
        // ignore DM failures
      }
    }
  }

  await Promise.all([
    sendLog(guild, 'AI Feature Disabled', description, colors.red, 'dev').catch(() => null)
  ]).catch(() => null);
}

function canUse(permissions, permission) {
  return Boolean(permissions?.has(permission) || permissions?.has(PermissionFlagsBits.Administrator));
}

async function requireSlashPermission(interaction, permission, label) {
  if (canUse(interaction.memberPermissions, permission)) return true;
  await interaction.reply({ content: `You need ${label} to use that.`, ephemeral: true });
  return false;
}

async function requirePrefixPermission(message, permission, label) {
  if (canUse(message.member?.permissions, permission)) return true;
  await message.reply(`You need ${label} to use that.`);
  return false;
}

function isDeveloper(userId, guild, memberOrPermissions) {
  const devIds = configuredDeveloperIds();
  if (devIds.size) return devIds.has(userId);
  const permissions = memberOrPermissions?.permissions ?? memberOrPermissions;
  return guild?.ownerId === userId || canUse(permissions, PermissionFlagsBits.Administrator);
}

async function requireSlashDev(interaction) {
  if (interaction.inGuild() && isDeveloper(interaction.user.id, interaction.guild, interaction.memberPermissions)) return true;
  await interaction.reply({ content: 'Developer commands are locked. Add your Discord user ID in the dev dashboard or set DEV_USER_IDS in .env.', ephemeral: true });
  return false;
}

async function requirePrefixDev(message) {
  if (isDeveloper(message.author.id, message.guild, message.member)) return true;
  await message.reply('Developer commands are locked. Add your Discord user ID in the dev dashboard or set `DEV_USER_IDS` in `.env`.');
  return false;
}

async function handleJoinedChatMessage(message) {
  if (!message.guild || !message.channel?.isTextBased()) return false;
  if (message.author.bot) return false;

  const joinChat = getGuildConfig(message.guild.id).joinChat;
  if (!joinChat?.enabled || joinChat.channelId !== message.channel.id) return false;

  const botId = client.user?.id;
  if (!botId) return false;

  const repliedToBot = await isReplyToBot(message, botId);
  const mentionedBot = message.mentions.users.has(botId);
  const addressedByName = client.user?.username && new RegExp(`^${escapeRegExp(client.user.username)}[,!\\s]`, 'i').test(message.content.trim());
  const shouldRespond = mentionedBot || repliedToBot || addressedByName || Math.random() < 0.15;

  if (!shouldRespond) return false;

  const clean = message.content
    .replaceAll(`<@${client.user.id}>`, '')
    .replaceAll(`<@!${client.user.id}>`, '')
    .trim();
  const memory = getJoinedChatMemory(message);

  if (joinedChatAiDisabled) {
    await message.reply('This feature is down currently. I have alerted the developer and the command is locked until the next restart.');
    return true;
  }

  if (!togetherApiKey && !huggingFaceApiKey) {
    await message.reply('No AI provider is configured. Set TOGETHER_API_KEY or HUGGINGFACE_API_KEY in .env.');
    return true;
  }

  try {
    const aiReply = await generateJoinedChatAiReply(message, clean, memory);
    
    if (aiReply) {
      const reply = rememberJoinedChatReply(message, clean, aiReply, detectJoinedChatTopic(clean), extractQuestion(aiReply));
      const shouldReplyThread = mentionedBot || repliedToBot || addressedByName;
      
      if (shouldReplyThread) {
        await message.reply({
          content: reply,
          allowedMentions: { users: [message.author.id] }
        });
      } else {
        await message.channel.send(reply);
      }
      return true;
    } else {
      if (mentionedBot || repliedToBot || addressedByName) {
        await message.reply('Failed to get a response from the AI provider.');
      }
      return true;
    }
  } catch (error) {
    console.error('Error in handleJoinedChatMessage:', error);
    if (isAiProviderError(error)) {
      joinedChatAiDisabled = true;
      joinedChatAiDisabledReason = String(error.message ?? 'Unknown AI error');
      joinedChatAiDisabledAt = Date.now();

      await message.reply('This feature is down currently. I have alerted the developer and the command is locked until the next restart.');
      await notifyDevelopersOfAiFailure(message.guild, error, message.channel);
      return true;
    }

    await message.reply('Something went wrong while trying AI chat. Please try again later.');
    await notifyDevelopersOfError(error, {
      type: 'AI Chat',
      user: message.author.tag,
      server: message.guild?.name,
      channel: message.channel?.name,
      extra: `Message content: ${truncate(message.content, 700)}`
    });
    return true;
  }
}

async function isReplyToBot(message, botId) {
  if (message.reference?.messageId) {
    const referenced = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
    return referenced?.author?.id === botId;
  }

  return false;
}

async function joinedChatReply(message, trigger = {}) {
  const clean = message.content
    .replaceAll(`<@${client.user.id}>`, '')
    .replaceAll(`<@!${client.user.id}>`, '')
    .trim();
  const lower = clean.toLowerCase();
  const memory = getJoinedChatMemory(message);
  memory.preferredName ??= message.member?.displayName ?? message.author.username;

if ((togetherApiKey || huggingFaceApiKey) && clean) {
  const aiReply = await generateJoinedChatAiReply(message, clean, memory).catch((error) => {
    console.error('AI joined chat failed:', error?.message ?? error);
    return null;
  });

  if (aiReply) {
    return rememberJoinedChatReply(message, clean, aiReply, detectJoinedChatTopic(clean), extractQuestion(aiReply));
  }
}

  return joinedChatLocalReply(message, trigger, clean, lower, memory);
}

function joinedChatLocalReply(message, trigger, clean, lower, memory) {
  const topic = detectJoinedChatTopic(clean);
  const mood = detectJoinedChatMood(lower);
  const askedQuestion = clean.includes('?') || /^(who|what|when|where|why|how|can|could|would|should|do|does|did|is|are|am|will)\b/i.test(clean);
  const followUp = memory.lastBotQuestion && /^(yes|yeah|yep|sure|ok|okay|no|nah|tell me|explain|more|why|how)\b/i.test(lower);
  const userName = memory.preferredName ?? message.member?.displayName ?? message.author.username;
  let response;

  if (/\b(help|commands|what can you do)\b/.test(lower)) {
    response = 'I can chat when you mention me, answer questions, help with commands, pick between options, remember this conversation a little, and ask follow-up questions. What do you want to talk about?';
    return rememberJoinedChatReply(message, clean, response, topic, extractQuestion(response));
  }

  if (/\b(hi|hello|hey|yo)\b/.test(lower)) {
    response = randomFrom([
      `Hey ${userName}, I am here. What are we talking about tonight?`,
      `Hello ${userName}. Want to ask me something, vent, or make me pick between options?`,
      `Yo ${userName}, I am listening. Give me the situation.`
    ]);
    return rememberJoinedChatReply(message, clean, response, topic, extractQuestion(response));
  }

  if (followUp) {
    response = joinedChatFollowUpReply(lower, memory);
    return rememberJoinedChatReply(message, clean, response, topic || memory.lastTopic, extractQuestion(response));
  }

  if (mood === 'bad') {
    response = randomFrom([
      `That sounds rough, ${userName}. Do you want advice, distraction, or just someone to listen?`,
      `I hear you. Want to talk through what happened, or do you want the quick comfort version?`,
      `Yeah, that does not sound fun. What is the main thing bothering you right now?`
    ]);
    return rememberJoinedChatReply(message, clean, response, topic, extractQuestion(response));
  }

  if (mood === 'good') {
    response = randomFrom([
      `Good, I like that energy. What made it go well?`,
      `Nice. Are we celebrating, planning the next step, or just enjoying the win?`,
      `That is solid. What do you want to do with that momentum?`
    ]);
    return rememberJoinedChatReply(message, clean, response, topic, extractQuestion(response));
  }

  if (/\b(my name is|call me|i am called)\b/.test(lower)) {
    const name = clean.replace(/.*\b(my name is|call me|i am called)\b/i, '').trim().split(/\s+/).slice(0, 3).join(' ');
    if (name) memory.preferredName = truncate(name, 40);
    response = name ? `Got it, I will remember you as **${memory.preferredName}** for this chat. What should we talk about?` : 'Tell me what name to use and I will keep it in mind for this chat.';
    return rememberJoinedChatReply(message, clean, response, topic, extractQuestion(response));
  }

  if (/\b(remember this|remember that|keep this in mind)\b/.test(lower)) {
    memory.pinnedThought = truncate(clean.replace(/\b(remember this|remember that|keep this in mind)\b/i, '').trim() || clean, 220);
    response = `I will keep that in mind for this chat: **${memory.pinnedThought}**. Want me to use it for advice, planning, or replies?`;
    return rememberJoinedChatReply(message, clean, response, topic, extractQuestion(response));
  }

  if (/\b(what do you remember|what did i say)\b/.test(lower)) {
    response = memory.pinnedThought
      ? `I remember this from you: **${memory.pinnedThought}**. We were also talking about **${memory.lastTopic ?? 'the current chat'}**.`
      : `I remember the recent flow of this chat, but you have not asked me to pin anything specific yet. Want me to remember something?`;
    return rememberJoinedChatReply(message, clean, response, topic, extractQuestion(response));
  }

  if (/\b(summarize|sum it up|recap)\b/.test(lower)) {
    response = `Quick recap: your last point was **${truncate(memory.lastUserMessage || clean, 120)}**. My read is that the topic is **${topic ?? memory.lastTopic ?? 'still forming'}**. Want me to turn that into a next step?`;
    return rememberJoinedChatReply(message, clean, response, topic, extractQuestion(response));
  }

  if (/\b(give me advice|what should i do|help me decide)\b/.test(lower)) {
    response = `My advice: choose the option that makes the next step clearer, not the one that feels perfect. For **${topic ?? memory.lastTopic ?? 'this'}**, what are the choices on the table?`;
    return rememberJoinedChatReply(message, clean, response, topic || 'advice', extractQuestion(response));
  }

  if (/\b(thanks|thank you|ty|appreciate it)\b/.test(lower)) {
    response = randomFrom([
      'Anytime. Want me to keep helping with this?',
      'You got it. What should we do next?',
      'No problem. Want the short version or the detailed version next time?'
    ]);
    return rememberJoinedChatReply(message, clean, response, topic, extractQuestion(response));
  }

  if (/\b(how are you|how you doing|you good)\b/.test(lower)) {
    response = 'I am running clean and feeling useful. More importantly, how are you doing?';
    return rememberJoinedChatReply(message, clean, response, topic, extractQuestion(response));
  }

  if (/\b(who are you|what are you)\b/.test(lower)) {
    response = 'I am a friendly chat helper for this server. I can answer questions, keep a little context, and help you figure things out. What should I call you?';
    return rememberJoinedChatReply(message, clean, response, topic, extractQuestion(response));
  }

  if (/\b(what time|current time|time is it)\b/.test(lower)) {
    response = `My host time says **${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}**. Need the date too?`;
    return rememberJoinedChatReply(message, clean, response, 'time', extractQuestion(response));
  }

  if (/\b(what day|date today|today's date|todays date)\b/.test(lower)) {
    response = `Today is **${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}**. Planning something?`;
    return rememberJoinedChatReply(message, clean, response, 'date', extractQuestion(response));
  }

  if (/\b(joke|make me laugh)\b/.test(lower)) {
    response = randomFrom([
      'Why did the bot bring a ladder? The server roles were too high.',
      'I tried to make a Discord joke, but it needed more permissions.',
      'My favorite exercise is running commands and then pretending I meant to do that.'
    ]);
    return rememberJoinedChatReply(message, clean, response, 'joke', null);
  }

  if (/\b(pick|choose)\b/.test(lower) && clean.includes(',')) {
    const options = clean.split(',').map((option) => option.replace(/\b(pick|choose)\b/gi, '').trim()).filter(Boolean);
    if (options.length >= 2) {
      response = `I pick **${truncate(randomFrom(options), 120)}**. Want me to explain why, or just trust the beta magic?`;
      return rememberJoinedChatReply(message, clean, response, 'choice', extractQuestion(response));
    }
  }

  if (/\b(yes or no|should i|do you think|is it okay|can i)\b/.test(lower)) {
    response = randomFrom([
      'Short answer: yes. What is the risky part?',
      'Short answer: probably not yet. What are you trying to avoid?',
      'I would say maybe. Give me one more detail and I can make a better call.'
    ]);
    return rememberJoinedChatReply(message, clean, response, topic || 'decision', extractQuestion(response));
  }

  if (/\b(why)\b/.test(lower)) {
    response = joinedChatWhyReply(memory, topic);
    return rememberJoinedChatReply(message, clean, response, topic, extractQuestion(response));
  }

  if (/\b(how)\b/.test(lower)) {
    response = joinedChatHowReply(memory, topic);
    return rememberJoinedChatReply(message, clean, response, topic, extractQuestion(response));
  }

  if (/\b(what)\b/.test(lower)) {
    response = joinedChatWhatReply(memory, topic);
    return rememberJoinedChatReply(message, clean, response, topic, extractQuestion(response));
  }

  if (/\b(who)\b/.test(lower)) {
    response = 'I need a little more context to know who you mean. Are you asking about a user, a role, or the bot?';
    return rememberJoinedChatReply(message, clean, response, topic, extractQuestion(response));
  }

  if (/\b(when)\b/.test(lower)) {
    response = 'If it is a bot update, it happens after deploy plus restart. Are you asking about a command, a log, or a server event?';
    return rememberJoinedChatReply(message, clean, response, topic, extractQuestion(response));
  }

  if (askedQuestion) {
    response = randomFrom([
      `My honest beta answer: probably. What detail should I factor in, ${userName}?`,
      'I can answer that better with one more clue. Is this about the bot, the server, or something else?',
      'I am leaning yes, but I want context. What outcome are you hoping for?',
      'Maybe. Tell me the part you are unsure about and I will take a cleaner guess.'
    ]);
    return rememberJoinedChatReply(message, clean, response, topic, extractQuestion(response));
  }

  if (clean.length > 0) {
    response = joinedChatAiStyleReply(clean, { lower, memory, mood, topic, userName });
    return rememberJoinedChatReply(message, clean, response, topic, extractQuestion(response));
  }

  response = trigger.repliedToBot ? 'I am here. What did you want to ask?' : 'I am here. Mention me or reply to me and I will answer.';
  return rememberJoinedChatReply(message, clean, response, topic, extractQuestion(response));
}

function getJoinedChatMemory(message) {
  const key = `${message.guild.id}:${message.channel.id}:${message.author.id}`;
  const existing = joinedChatMemory.get(key);
  if (existing && Date.now() - existing.updatedAt < 30 * 60_000) return existing;

  const fresh = {
    preferredName: null,
    lastUserMessage: '',
    lastBotReply: '',
    lastBotQuestion: null,
    lastTopic: null,
    pinnedThought: null,
    history: [],
    turns: 0,
    updatedAt: Date.now()
  };
  joinedChatMemory.set(key, fresh);
  return fresh;
}

function rememberJoinedChatReply(message, userMessage, botReply, topic, botQuestion) {
  const memory = getJoinedChatMemory(message);
  memory.lastUserMessage = truncate(userMessage, 300);
  memory.lastBotReply = truncate(botReply, 300);
  memory.lastBotQuestion = botQuestion;
  memory.lastTopic = topic || memory.lastTopic || detectJoinedChatTopic(userMessage);
  memory.history ??= [];
  memory.history.push({ role: 'user', content: truncate(userMessage, 500) });
  memory.history.push({ role: 'assistant', content: truncate(botReply, 500) });
  memory.history = memory.history.slice(-12);
  memory.turns += 1;
  memory.updatedAt = Date.now();
  trimJoinedChatMemory();
  return botReply;
}

function trimJoinedChatMemory() {
  if (joinedChatMemory.size <= 200) return;
  const oldestKeys = [...joinedChatMemory.entries()]
    .sort((first, second) => first[1].updatedAt - second[1].updatedAt)
    .slice(0, 50)
    .map(([key]) => key);
  for (const key of oldestKeys) joinedChatMemory.delete(key);
}

async function generateJoinedChatAiReply(message, clean, memory) {
  if (huggingFaceApiKey) {
    return await generateHuggingFaceJoinedChatAiReply(message, clean, memory);
  }

  if (togetherApiKey) {
    return await generateTogetherAiJoinedChatReply(message, clean, memory);
  }

  throw new Error('No AI provider configured. Set TOGETHER_API_KEY or HUGGINGFACE_API_KEY in .env.');
}

async function generateHuggingFaceJoinedChatAiReply(message, clean, memory) {
  const historyMessages = sanitizeHuggingFaceChatHistory((memory.history ?? []).slice(-10));
  const requestBody = {
    model: huggingFaceModel,
    messages: [
      {
        role: 'system',
        content: huggingFaceCopilotInstructions(message, memory)
      },
      ...historyMessages,
      {
        role: 'user',
        content: clean
      }
    ],
    max_tokens: 220,
    temperature: 0.7,
    stream: false
  };

  const sendRequest = async (modelName) => {
    console.log(`[Hugging Face] Sending chat completion using model ${modelName}...`);
    const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${huggingFaceApiKey}`,
        'HuggingFace-Api-Key': huggingFaceApiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({ ...requestBody, model: modelName })
    });

    console.log(`[Hugging Face] Response status: ${response.status}`);
    const text = await response.text().catch(() => '');

    if (!response.ok) {
      let errorMessage = text;
      try {
        const parsed = JSON.parse(text);
        if (parsed.error) {
          errorMessage = typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error);
        } else {
          errorMessage = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
        }
      } catch {
        // raw text remains
      }
      return { ok: false, status: response.status, errorMessage };
    }

    const data = JSON.parse(text);
    return { ok: true, data };
  };

  let result = await sendRequest(huggingFaceModel);
  if (!result.ok && huggingFaceModel !== huggingFaceDefaultModel && /model_not_found|does not exist|invalid_request_error/i.test(result.errorMessage)) {
    console.warn(`[Hugging Face] Model ${huggingFaceModel} invalid, retrying with fallback model ${huggingFaceDefaultModel}.`);
    result = await sendRequest(huggingFaceDefaultModel);
  }

  if (!result.ok) {
    throw new Error(`Hugging Face error ${result.status}: ${result.errorMessage}`);
  }

  const data = result.data;
  console.log(`[Hugging Face] Response data:`, JSON.stringify(data).substring(0, 200));

  const output = extractHuggingFaceChatOutputText(data);
  console.log(`[Hugging Face] Extracted output: ${output}`);
  return sanitizeJoinedChatAiReply(output);
}

function sanitizeHuggingFaceChatHistory(history) {
  return history
    .map((entry) => ({
      role: String(entry.role || '').toLowerCase(),
      content: String(entry.content ?? '')
    }))
    .filter((entry) => ['system', 'user', 'assistant'].includes(entry.role) && entry.content.trim().length > 0);
}

function huggingFaceCopilotInstructions(message, memory) {
  return [
    'You are a friendly Discord chat assistant that speaks naturally and sounds like a helpful person.',
    'Answer in a casual, human tone appropriate for Discord conversation.',
    'When the user asks about something practical, give simple, useful guidance and examples in everyday language.',
    'If the user asks about feelings or goals, respond with empathy and clear suggestions.',
    'Avoid sounding like a programmer unless the user specifically asks for technical details.',
    'Do not claim to be a human. Be honest that you are an AI assistant if asked directly.',
    memory.preferredName ? `The user likes being called: ${memory.preferredName}.` : null,
    memory.pinnedThought ? `Important thing the user asked you to remember: ${memory.pinnedThought}.` : null,
    memory.lastTopic ? `Recent topic: ${memory.lastTopic}.` : null,
    `Bot version: ${botVersion}.`
  ].filter(Boolean).join('\n');
}

function extractHuggingFaceChatOutputText(data) {
  if (!data || !Array.isArray(data.choices) || data.choices.length === 0) return '';
  const choice = data.choices[0];
  return choice.message?.content ?? choice.text ?? '';
}

async function generateTogetherAiJoinedChatReply(message, clean, memory) {
  const history = (memory.history ?? []).slice(-10).map((entry) => ({
    role: entry.role,
    content: entry.content
  }));

  const modelCandidates = ['gpt-4o-mini', 'togethercomputer/RedPajama-INCITE-Chat-7B-v0', 'togethercomputer/RedPajama-INCITE-Chat-3B-v1'];
  let response = null;
  let lastError = null;

  for (const model of modelCandidates) {
    const requestBody = {
      model,
      messages: [
        {
          role: 'system',
          content: joinedChatAiInstructions(message, memory)
        },
        ...history,
        {
          role: 'user',
          content: [
            `Discord user: ${message.member?.displayName ?? message.author.username}`,
            `Server: ${message.guild.name}`,
            `Channel: #${message.channel.name ?? 'chat'}`,
            `Message: ${clean}`
          ].join('\n')
        }
      ],
      max_tokens: 180,
      temperature: 0.7
    };

    console.log(`[Together.ai] Sending request using model ${model}...`);
    
    response = await fetch(
      'https://api.together.ai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${togetherApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      }
    );

    console.log(`[Together.ai] Response status for ${model}: ${response.status}`);

    if (response.ok) {
      break;
    }

    const errorText = await response.text().catch(() => '');
    let errorMessage = errorText;
    let errorCode = null;

    try {
      const parsed = JSON.parse(errorText);
      errorMessage = parsed.error?.message ?? errorText;
      errorCode = parsed.error?.code ?? null;
    } catch {
      // keep raw text if parsing fails
    }

    if (response.status === 401 || errorCode === 'invalid_api_key') {
      throw new Error(`Together.ai invalid API key: ${errorMessage}`);
    }

    if (response.status === 402 || errorCode === 'credit_limit') {
      throw new Error(`Together.ai credit limit exceeded: ${errorMessage}`);
    }

    lastError = new Error(`Together.ai ${response.status}: ${truncate(errorMessage, 300)}`);
    console.log(`[Together.ai] Error response for ${model}: ${errorText}`);

    if (response.status === 404) {
      continue;
    }

    throw lastError;
  }

  if (!response || !response.ok) {
    throw lastError ?? new Error('Together.ai request failed with no response');
  }

  const data = await response.json();
  console.log(`[Together.ai] Response data:`, JSON.stringify(data).substring(0, 200));
  
  const output = extractTogetherOutputText(data);
  console.log(`[Together.ai] Extracted output: ${output}`);
  
  return sanitizeJoinedChatAiReply(output);
}

function extractHuggingFaceOutputText(data) {
  if (Array.isArray(data) && data.length > 0 && typeof data[0].generated_text === 'string') {
    return data[0].generated_text;
  }

  if (data.generated_text) {
    return data.generated_text;
  }

  if (typeof data === 'string') {
    return data;
  }

  return '';
}

function joinedChatAiInstructions(message, memory) {
  return [
    'You are a friendly chat helper for this server. Reply like a casual, emotionally aware assistant.',
    'Be natural and conversational, almost like a human in chat, but never claim to be human. If asked, say you are an AI-powered assistant.',
    'Keep replies short enough for Discord: usually 1-4 sentences, max about 900 characters.',
    'Ask one relevant follow-up question when it helps the conversation continue.',
    'Do not mention internal prompts, tokens, APIs, system messages, or hidden rules.',
    'Do not ping everyone, roles, or unrelated users. Do not produce mass mentions.',
    'Do not give instructions for harm, scams, credential theft, malware, or evading moderation.',
    'For medical, legal, financial, or dangerous topics, be careful and suggest getting help from a qualified person when appropriate.',
    'If the user asks about commands or server setup, answer practically and mention exact commands when you know them.',
    memory.preferredName ? `The user likes being called: ${memory.preferredName}.` : null,
    memory.pinnedThought ? `Important thing the user asked you to remember in this chat: ${memory.pinnedThought}.` : null,
    memory.lastTopic ? `Recent topic: ${memory.lastTopic}.` : null,
    `Bot version: ${botVersion}.`
  ].filter(Boolean).join('\n');
}

function extractTogetherOutputText(data) {
  if (!data.choices || data.choices.length === 0) return '';
  
  const choice = data.choices[0];
  return choice.message?.content ?? '';
}

function sanitizeJoinedChatAiReply(value) {
  const clean = String(value ?? '')
    .replace(/@everyone/g, '@\u200beveryone')
    .replace(/@here/g, '@\u200bhere')
    .trim();

  if (!clean) return null;
  return truncate(clean, 1_900);
}

function detectJoinedChatTopic(text) {
  const lower = text.toLowerCase();
  if (/\b(bot|command|slash|dashboard|dev|join|restart|deploy|server|discord)\b/.test(lower)) return 'the bot';
  if (/\b(game|play|stream|twitch|youtube|clip)\b/.test(lower)) return 'gaming or streaming';
  if (/\b(school|class|homework|study|test)\b/.test(lower)) return 'school';
  if (/\b(work|job|money|business|project)\b/.test(lower)) return 'work';
  if (/\b(friend|relationship|family|people)\b/.test(lower)) return 'people';
  if (/\b(food|eat|drink|music|movie|show)\b/.test(lower)) return 'casual stuff';
  return null;
}

function detectJoinedChatMood(lower) {
  if (/\b(sad|mad|angry|upset|tired|stressed|bored|lonely|bad|awful|hate|annoyed)\b/.test(lower)) return 'bad';
  if (/\b(good|great|happy|excited|nice|awesome|cool|love|fine|better)\b/.test(lower)) return 'good';
  return 'neutral';
}

function joinedChatFollowUpReply(lower, memory) {
  if (/^(yes|yeah|yep|sure|ok|okay)\b/i.test(lower)) {
    return randomFrom([
      `Alright. Since we were talking about **${memory.lastTopic ?? 'that'}**, give me one detail and I will go deeper.`,
      'Good. Do you want the practical answer or the honest answer?',
      'Got you. What is the part you care about most?'
    ]);
  }

  if (/^(no|nah)\b/i.test(lower)) {
    return randomFrom([
      'Fair. Then let us switch angles. What would be more useful?',
      'No worries. Want a different answer, or should I ask a better question?',
      'Okay, scratch that. What is the real thing you want solved?'
    ]);
  }

  if (/^(tell me|explain|more|why|how)\b/i.test(lower)) {
    return randomFrom([
      `Here is the simple version: ${memory.lastTopic ? `for **${memory.lastTopic}**, ` : ''}look for the next clear step, not the perfect whole answer. What step are you on right now?`,
      'I would break it down into what happened, what you want, and what is blocking it. Which one should we start with?',
      'The key is context. Tell me the missing detail and I can give you a sharper reply.'
    ]);
  }

  return 'I am with you. What do you want me to do with that?';
}

function joinedChatWhyReply(memory, topic) {
  if ((topic ?? memory.lastTopic) === 'the bot') {
    return 'For this kind of issue, it is often permissions, command registration, or needing a restart. Which one are you looking at?';
  }

  return randomFrom([
    'My guess: there is a reason underneath the obvious reason. What changed right before it happened?',
    'Usually because something expected one thing and got another. What result were you hoping for?',
    'Could be timing, permissions, or missing context. What part feels confusing?'
  ]);
}

function joinedChatHowReply(memory, topic) {
  if ((topic ?? memory.lastTopic) === 'the bot') {
    return 'For setup changes: update the code, bump the version if needed, deploy commands when they changed, then restart the service. Which step are you on?';
  }

  return randomFrom([
    'Start with the smallest version that works, test it, then improve it. What is the first small step?',
    'I would make a quick plan: goal, blocker, next action. Want me to help make that plan?',
    'Do it in pieces. What part are you trying to figure out first?'
  ]);
}

function joinedChatWhatReply(memory, topic) {
  if ((topic ?? memory.lastTopic) === 'the bot') {
    return 'If this is about commands or setup, tell me the command or behavior you expected and what actually happened.';
  }

  return randomFrom([
    'I can help define it, pick between options, or turn it into a plan. Which mode do you want?',
    'Give me the short version of the situation and I will answer like a normal conversation.',
    'What I need is the goal and the annoying part. What are those?'
  ]);
}

function joinedChatAiStyleReply(clean, context) {
  const { lower, memory, mood, topic, userName } = context;
  const intent = detectJoinedChatIntent(lower);
  const subject = summarizeJoinedChatSubject(clean, topic ?? memory.lastTopic);
  const opener = joinedChatOpener(intent, mood, userName);
  const middle = joinedChatMiddle(intent, subject, memory);
  const question = joinedChatNextQuestion(intent, subject, memory);
  return truncate(`${opener} ${middle} ${question}`, 1_900);
}

function detectJoinedChatIntent(lower) {
  if (/\b(help me|fix|broken|issue|problem|error|not working|stuck)\b/.test(lower)) return 'troubleshoot';
  if (/\b(feel|sad|mad|happy|stressed|tired|bored|lonely|excited)\b/.test(lower)) return 'emotional';
  if (/\b(think|opinion|honest|rate|good idea|bad idea)\b/.test(lower)) return 'opinion';
  if (/\b(plan|make|build|create|start|do next|next step)\b/.test(lower)) return 'planning';
  if (/\b(tell me about|explain|teach|learn)\b/.test(lower)) return 'explain';
  return 'conversation';
}

function summarizeJoinedChatSubject(clean, topic) {
  const compact = clean
    .replace(/\s+/g, ' ')
    .replace(/\b(i mean|like|basically|honestly)\b/gi, '')
    .trim();
  if (compact.length >= 8 && compact.length <= 90) return compact;
  if (topic) return topic;
  return 'that';
}

function joinedChatOpener(intent, mood, userName) {
  if (mood === 'bad') return randomFrom([`I get why that would feel heavy, ${userName}.`, `Yeah, I hear the frustration in that, ${userName}.`]);
  if (mood === 'good') return randomFrom([`That sounds like a good sign, ${userName}.`, `I like where your head is at, ${userName}.`]);

  const openers = {
    troubleshoot: [`Okay ${userName}, let us look at this together.`, `Got it, ${userName}. Let's figure it out.`],
    emotional: [`I am with you, ${userName}.`, `That sounds worth talking through, ${userName}.`],
    opinion: [`My honest take, ${userName}:`, `If you want the real answer, ${userName},`],
    planning: [`We can turn that into a plan, ${userName}.`, `That is workable, ${userName}.`],
    explain: [`I can explain that, ${userName}.`, `Here is the simple version, ${userName}.`],
    conversation: [`I hear you, ${userName}.`, `That makes sense, ${userName}.`, `I am following you, ${userName}.`]
  };

  return randomFrom(openers[intent] ?? openers.conversation);
}

function joinedChatMiddle(intent, subject, memory) {
  const previous = memory.lastTopic ? ` Since we were already around **${memory.lastTopic}**, I am connecting it to that.` : '';
  const lines = {
    troubleshoot: `For **${truncate(subject, 80)}**, I would start by figuring out what you expected and what got in the way.${previous}`,
    emotional: `For **${truncate(subject, 80)}**, the important part is not rushing it. Sometimes the first useful move is naming how you feel before trying to fix anything.`,
    opinion: `On **${truncate(subject, 80)}**, I would judge it by whether it helps you get where you want to go.`,
    planning: `For **${truncate(subject, 80)}**, the easiest path is one small next step, then another. Let us keep it simple.`,
    explain: `For **${truncate(subject, 80)}**, there is often a surface issue and a deeper reason. I can help make that clear.`,
    conversation: `It sounds like **${truncate(subject, 80)}** is the main thing here.${previous}`
  };

  return lines[intent] ?? lines.conversation;
}

function joinedChatNextQuestion(intent, subject, memory) {
  const questions = {
    troubleshoot: [
      'What did you expect to happen, and what happened instead?',
      'Did this start after something changed or after you tried something new?',
      'What part of it feels broken or confusing to you?'
    ],
    emotional: [
      'Do you want advice, comfort, or just space to talk?',
      'What part of it is hitting you the hardest?',
      'Do you want me to help you calm it down or think it through?'
    ],
    opinion: [
      'Do you want my safest answer or my honest answer?',
      'What outcome are you hoping for?',
      'What is making you unsure about it?'
    ],
    planning: [
      'What is the first thing you can do in under five minutes?',
      'Do you want a quick checklist?',
      'What is blocking you from starting?'
    ],
    explain: [
      'Want the short version or the deeper version?',
      'Which part should I unpack first?',
      'Do you want an example?'
    ],
    conversation: [
      'What do you want me to do with that: answer, ask, joke, or help plan?',
      'Say a little more and I will stay with you.',
      memory.turns > 2 ? 'Are we still on the same topic, or did the topic shift?' : 'What part matters most?'
    ]
  };

  return randomFrom(questions[intent] ?? questions.conversation);
}

function extractQuestion(text) {
  const match = text.match(/([^.!?]*\?)/);
  return match ? truncate(match[1].trim(), 180) : null;
}

async function getSlashMember(interaction, optionName) {
  const user = interaction.options.getUser(optionName, true);
  return interaction.guild.members.fetch(user.id).catch(() => null);
}

async function moderationBlocker(guild, actorMember, targetMember, options = {}) {
  const botMember = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
  if (!botMember) return 'I could not load my server member profile. Try again in a moment.';
  if (!targetMember) return 'I could not find that member.';
  if (!options.allowSelf && actorMember?.id === targetMember.id) return 'You cannot target yourself with this command.';
  if (targetMember.id === botMember.id) return 'I cannot target myself with that command.';
  if (guild.ownerId === targetMember.id) return 'I cannot target the server owner.';
  if (targetMember.roles.highest.position >= botMember.roles.highest.position) {
    return 'I cannot manage that member because their highest role is at or above mine.';
  }
  if (actorMember?.id !== guild.ownerId && targetMember.roles.highest.position >= actorMember.roles.highest.position) {
    return 'That member is at or above your highest role.';
  }
  return null;
}

async function roleBlocker(guild, actorMember, role) {
  const botMember = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
  if (!botMember) return 'I could not load my server member profile. Try again in a moment.';
  if (!role || role.managed || role.id === guild.id) return 'Choose a normal server role.';
  if (role.position >= botMember.roles.highest.position) return 'I cannot manage that role because it is at or above my highest role.';
  if (actorMember?.id !== guild.ownerId && role.position >= actorMember.roles.highest.position) {
    return 'That role is at or above your highest role.';
  }
  return null;
}

function setStickyMessage(guildId, channelId, content, userId) {
  const guildConfig = getGuildConfig(guildId);
  guildConfig.stickyMessages[channelId] = {
    content,
    createdBy: userId,
    updatedAt: Date.now(),
    lastMessageId: guildConfig.stickyMessages[channelId]?.lastMessageId ?? null
  };
  saveConfig();
}

async function removeStickyMessage(guild, channel) {
  const guildConfig = getGuildConfig(guild.id);
  const sticky = guildConfig.stickyMessages[channel.id];
  if (!sticky) return false;

  if (sticky.lastMessageId) {
    const oldMessage = await channel.messages.fetch(sticky.lastMessageId).catch(() => null);
    await oldMessage?.delete().catch(() => null);
  }

  delete guildConfig.stickyMessages[channel.id];
  saveConfig();
  return true;
}

async function scheduleStickyRefresh(message) {
  if (!message.guild || !message.channel?.isTextBased()) return;
  const sticky = getGuildConfig(message.guild.id).stickyMessages[message.channel.id];
  if (!sticky?.content) return;

  const key = `${message.guild.id}:${message.channel.id}`;
  clearTimeout(stickyTimers.get(key));
  stickyTimers.set(key, setTimeout(() => {
    refreshStickyMessage(message.guild, message.channel).catch((error) => console.error('Sticky refresh failed:', error));
    stickyTimers.delete(key);
  }, 2_500));
}

async function refreshStickyMessage(guild, channel) {
  const guildConfig = getGuildConfig(guild.id);
  const sticky = guildConfig.stickyMessages[channel.id];
  if (!sticky?.content || !channel?.isTextBased()) return false;

  if (sticky.lastMessageId) {
    const oldMessage = await channel.messages.fetch(sticky.lastMessageId).catch(() => null);
    await oldMessage?.delete().catch(() => null);
  }

  const sent = await channel.send({
    content: sticky.content,
    allowedMentions: { parse: ['users', 'roles'] }
  }).catch(() => null);

  if (!sent) return false;

  sticky.lastMessageId = sent.id;
  sticky.lastPostedAt = Date.now();
  saveConfig();
  return true;
}

function stickyStatusEmbed(guild) {
  const stickyEntries = Object.entries(getGuildConfig(guild.id).stickyMessages);
  const value = stickyEntries.length
    ? stickyEntries.slice(0, 15).map(([channelId, sticky], index) => `${index + 1}. <#${channelId}> - ${truncate(sticky.content, 90)}`).join('\n')
    : 'No sticky messages are configured.';

  return new EmbedBuilder()
    .setColor(colors.green)
    .setTitle('Sticky Messages')
    .setDescription(value)
    .setFooter({ text: embedFooterText(guild.name) })
    .setTimestamp();
}

function addWarning(guildId, userId, moderatorId, reason) {
  const guildConfig = getGuildConfig(guildId);
  guildConfig.warnings[userId] ??= [];
  guildConfig.warnings[userId].push({
    moderatorId,
    reason,
    createdAt: Date.now()
  });
  saveConfig();
  return guildConfig.warnings[userId].length;
}

function clearWarnings(guildId, userId, caseNumber) {
  const warnings = getGuildConfig(guildId).warnings[userId] ?? [];
  if (!warnings.length) return 0;

  if (caseNumber) {
    const index = caseNumber - 1;
    if (!warnings[index]) return 0;
    warnings.splice(index, 1);
    if (warnings.length) {
      getGuildConfig(guildId).warnings[userId] = warnings;
    } else {
      delete getGuildConfig(guildId).warnings[userId];
    }
    saveConfig();
    return 1;
  }

  delete getGuildConfig(guildId).warnings[userId];
  saveConfig();
  return warnings.length;
}

function removedMessage(removed, user, caseNumber) {
  if (!removed) return caseNumber ? `No warning #${caseNumber} exists for ${user.tag}.` : `${user.tag} has no warnings.`;
  return caseNumber ? `Removed warning #${caseNumber} for ${user.tag}.` : `Cleared ${removed} warning(s) for ${user.tag}.`;
}

function warningsEmbed(guildId, user) {
  const warnings = getGuildConfig(guildId).warnings[user.id] ?? [];
  const description = warnings.length
    ? warnings.map((warning, index) => {
      const timestamp = Math.floor(warning.createdAt / 1000);
      return `**${index + 1}.** ${truncate(warning.reason, 180)}\nModerator: <@${warning.moderatorId}> | <t:${timestamp}:R>`;
    }).join('\n\n')
    : 'No warnings stored for this member.';

  return new EmbedBuilder()
    .setColor(warnings.length ? colors.yellow : colors.green)
    .setTitle(`Warnings for ${user.tag}`)
    .setDescription(description)
    .setFooter({ text: embedFooterText('Moderation') })
    .setTimestamp();
}

function canEditChannelPermissions(channel) {
  return Boolean(channel?.permissionOverwrites?.edit && channel.guild?.roles?.everyone);
}

function getLockdownRole(guild) {
  const guildConfig = getGuildConfig(guild.id);
  return guildConfig.lockdownRoleId
    ? guild.roles.cache.get(guildConfig.lockdownRoleId) ?? guild.roles.everyone
    : guild.roles.everyone;
}

async function lockdownChannel(channel) {
  if (!canEditChannelPermissions(channel)) return false;
  await channel.permissionOverwrites.edit(getLockdownRole(channel.guild), lockdownDenyPermissions());
  return true;
}

async function unlockChannel(channel) {
  if (!canEditChannelPermissions(channel)) return false;
  await channel.permissionOverwrites.edit(getLockdownRole(channel.guild), lockdownAllowPermissions());
  return true;
}

function lockdownDenyPermissions() {
  return {
    SendMessages: false,
    SendMessagesInThreads: false,
    CreatePublicThreads: false,
    CreatePrivateThreads: false,
    SendTTSMessages: false,
    AddReactions: false
  };
}

function lockdownAllowPermissions() {
  return {
    SendMessages: null,
    SendMessagesInThreads: null,
    CreatePublicThreads: null,
    CreatePrivateThreads: null,
    SendTTSMessages: null,
    AddReactions: null
  };
}

async function lockdownServer(guild) {
  const [lockResult, announceResult] = await Promise.all([
    applyToServerChannels(guild, lockdownChannel),
    sendLockdownAnnouncementToServer(guild)
  ]);
  return { ...lockResult, announced: announceResult.changed };
}

async function unlockServer(guild) {
  const [unlockResult, announceResult] = await Promise.all([
    applyToServerChannels(guild, unlockChannel),
    sendUnlockAnnouncementToServer(guild)
  ]);
  return { ...unlockResult, announced: announceResult.changed };
}

async function applyToServerChannels(guild, action) {
  let changed = 0;
  let failed = 0;

  for (const channel of guild.channels.cache.values()) {
    if (!channel.isTextBased?.() || !canEditChannelPermissions(channel)) continue;

    try {
      const didChange = await action(channel);
      if (didChange) changed += 1;
    } catch {
      failed += 1;
    }
  }

  return { changed, failed };
}

async function sendLockdownAnnouncement(channel, scope) {
  if (!channel?.isTextBased()) return false;
  await channel.send({ embeds: [lockdownAnnouncementEmbed(scope)] }).catch(() => null);
  return true;
}

async function sendUnlockAnnouncement(channel, scope) {
  if (!channel?.isTextBased()) return false;
  await channel.send({ embeds: [unlockAnnouncementEmbed(scope)] }).catch(() => null);
  return true;
}

async function sendLockdownAnnouncementToServer(guild) {
  return applyToServerChannels(guild, (channel) => sendLockdownAnnouncement(channel, 'server'));
}

async function sendUnlockAnnouncementToServer(guild) {
  return applyToServerChannels(guild, (channel) => sendUnlockAnnouncement(channel, 'server'));
}

function lockdownAnnouncementEmbed(scope) {
  return new EmbedBuilder()
    .setColor(colors.red)
    .setTitle(scope === 'server' ? 'Server Locked Down' : 'Channel Locked Down')
    .setDescription(scope === 'server'
      ? 'This server is now locked down. Members cannot send messages until staff unlocks it.'
      : 'This channel is now locked down. Members cannot send messages until staff unlocks it.')
    .setFooter({ text: embedFooterText('Lockdown') })
    .setTimestamp();
}

function unlockAnnouncementEmbed(scope) {
  return new EmbedBuilder()
    .setColor(colors.green)
    .setTitle(scope === 'server' ? 'Server Unlocked' : 'Channel Unlocked')
    .setDescription(scope === 'server'
      ? 'The server lockdown has been lifted. Members can talk again.'
      : 'This channel has been unlocked. Members can talk again.')
    .setFooter({ text: embedFooterText('Lockdown') })
    .setTimestamp();
}

let twitchAccessToken = null;
let twitchAccessTokenExpiresAt = 0;
let twitchMonitorStarted = false;

function startTwitchMonitor() {
  if (twitchMonitorStarted) return;
  twitchMonitorStarted = true;
  setTimeout(() => checkAllTwitchChannels(), 10_000);
  setInterval(() => checkAllTwitchChannels(), 60_000);
}

async function checkAllTwitchChannels() {
  for (const guild of client.guilds.cache.values()) {
    await checkTwitchForGuild(guild).catch((error) => console.error('Twitch monitor error:', error));
  }
}

async function checkTwitchForGuild(guild, force = false) {
  const twitch = getGuildConfig(guild.id).twitch;
  if (!twitch?.enabled || !twitch.channelName || !twitch.announceChannelId) return false;
  if (!twitchClientId || !twitchClientSecret) return false;

  const streamData = await fetchTwitchStream(twitch.channelName);
  if (!streamData?.stream) return true;
  if (!force && twitch.lastStreamId === streamData.stream.id) return true;

  const channel = await guild.channels.fetch(twitch.announceChannelId).catch(() => null);
  if (!channel?.isTextBased()) return false;

  await channel.send({
    content: '@everyone',
    embeds: [twitchLiveEmbed(streamData.stream, streamData.user)],
    allowedMentions: { parse: ['everyone'] }
  });

  twitch.lastStreamId = streamData.stream.id;
  saveConfig();
  return true;
}

async function fetchTwitchStream(channelName) {
  const accessToken = await getTwitchAccessToken();
  const login = encodeURIComponent(channelName);
  const [streamResponse, userResponse] = await Promise.all([
    fetch(`https://api.twitch.tv/helix/streams?user_login=${login}`, { headers: twitchHeaders(accessToken) }),
    fetch(`https://api.twitch.tv/helix/users?login=${login}`, { headers: twitchHeaders(accessToken) })
  ]);

  if (!streamResponse.ok || !userResponse.ok) return null;

  const streamJson = await streamResponse.json();
  const userJson = await userResponse.json();

  return {
    stream: streamJson.data?.[0] ?? null,
    user: userJson.data?.[0] ?? { login: channelName, display_name: channelName }
  };
}

async function getTwitchAccessToken() {
  if (twitchAccessToken && Date.now() < twitchAccessTokenExpiresAt) return twitchAccessToken;

  const response = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: twitchClientId,
      client_secret: twitchClientSecret,
      grant_type: 'client_credentials'
    })
  });

  if (!response.ok) throw new Error('Unable to authenticate with Twitch.');

  const data = await response.json();
  twitchAccessToken = data.access_token;
  twitchAccessTokenExpiresAt = Date.now() + Math.max((data.expires_in - 60) * 1000, 60_000);
  return twitchAccessToken;
}

function twitchHeaders(accessToken) {
  return {
    'Client-ID': twitchClientId,
    Authorization: `Bearer ${accessToken}`
  };
}

function twitchConfigEmbed(guild) {
  const twitch = getGuildConfig(guild.id).twitch;

  return new EmbedBuilder()
    .setColor(colors.twitch)
    .setTitle('Twitch Live Alerts')
    .setDescription(twitch?.enabled ? 'Live alerts are enabled.' : 'Live alerts are disabled.')
    .addFields(
      { name: 'Streamer', value: twitch?.channelName ? `twitch.tv/${twitch.channelName}` : 'Not set', inline: true },
      { name: 'Announcement Channel', value: twitch?.announceChannelId ? `<#${twitch.announceChannelId}>` : 'Not set', inline: true },
      { name: 'API Status', value: twitchClientId && twitchClientSecret ? 'Configured' : 'Missing Twitch API credentials', inline: false }
    )
    .setFooter({ text: embedFooterText(guild.name) })
    .setTimestamp();
}

function twitchLiveEmbed(stream, user) {
  const thumbnail = stream.thumbnail_url
    ?.replace('{width}', '1280')
    ?.replace('{height}', '720');

  return new EmbedBuilder()
    .setColor(colors.twitch)
    .setAuthor({ name: `${user.display_name ?? user.login} is live on Twitch`, iconURL: user.profile_image_url })
    .setTitle(stream.title || 'Live now')
    .setURL(`https://twitch.tv/${user.login}`)
    .setDescription(`**${stream.game_name || 'Just Chatting'}**\n${(stream.viewer_count ?? 0).toLocaleString()} viewer(s)`)
    .setImage(thumbnail)
    .setFooter({ text: embedFooterText() })
    .setTimestamp(new Date(stream.started_at));
}

function twitchSetupHelp() {
  if (!twitchClientId || !twitchClientSecret) {
    return 'Twitch alerts need `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` in `.env`. Add those, restart the bot, then run `/twitch set`.';
  }

  return 'Set Twitch alerts with `/twitch set` or `!twitch <username> #channel`.';
}

function cleanTwitchName(value) {
  const clean = value.replace(/^@/, '').trim().toLowerCase();
  return /^[a-z0-9_]{3,25}$/i.test(clean) ? clean : '';
}

function devDashboardPayload(guild) {
  return {
    embeds: [devDashboardEmbed(guild)],
    components: devDashboardComponents(guild)
  };
}

function devDashboardComponents(guild) {
  const logsEnabled = getGuildConfig(guild.id).logsEnabled;

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('devdash:runtime')
        .setLabel('Runtime')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('devdash:servers')
        .setLabel('Servers')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('devdash:config')
        .setLabel('Config')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('devdash:devusers')
        .setLabel('Dev Users')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('devdash:commands')
        .setLabel('Commands')
        .setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('devdash:presence')
        .setLabel('Presence')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('devdash:rename')
        .setLabel('Bot Name')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('devdash:say')
        .setLabel('Say')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('devdash:testlog')
        .setLabel('Test Log')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('devdash:twitch')
        .setLabel('Twitch')
        .setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('devdash:togglelogs')
        .setLabel(logsEnabled ? 'Logs Off' : 'Logs On')
        .setStyle(logsEnabled ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('devdash:sticky')
        .setLabel('Sticky')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('devdash:adddev')
        .setLabel('Add Dev')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('devdash:refresh')
        .setLabel('Refresh')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('devdash:reset')
        .setLabel('Reset Server')
        .setStyle(ButtonStyle.Danger)
    )
  ];
}

function devDashboardEmbed(guild) {
  const guildConfig = getGuildConfig(guild.id);
  const stickyCount = Object.keys(guildConfig.stickyMessages).length;
  const warningCount = Object.values(guildConfig.warnings).reduce((sum, warnings) => sum + warnings.length, 0);
  const twitch = guildConfig.twitch;

  return new EmbedBuilder()
    .setColor(colors.purple)
    .setTitle('Developer Dashboard')
    .setDescription('Private V2 control panel for this bot and the current server.')
    .addFields(
      { name: 'Bot', value: `${client.user?.tag ?? 'Unknown'} | ${presenceText}`, inline: false },
      { name: 'Version', value: `V${botVersion}`, inline: true },
      { name: 'Commands', value: `${commands.length} global`, inline: true },
      { name: 'Servers', value: client.guilds.cache.size.toString(), inline: true },
      { name: 'Dev Users', value: configuredDeveloperIds().size.toString(), inline: true },
      { name: 'Current Server', value: `${guild.name}\n${guild.id}`, inline: false },
      { name: 'Logs', value: guildConfig.logsEnabled ? `Enabled in ${guildConfig.logChannelId ? `<#${guildConfig.logChannelId}>` : 'no channel set'}` : 'Disabled', inline: true },
      { name: 'Sticky Channels', value: stickyCount.toString(), inline: true },
      { name: 'Stored Warnings', value: warningCount.toString(), inline: true },
      { name: 'Twitch', value: twitch?.enabled ? `twitch.tv/${twitch.channelName} -> <#${twitch.announceChannelId}>` : 'Disabled', inline: false }
    )
    .setFooter({ text: embedFooterText('Developer Dashboard') })
    .setTimestamp();
}

function devConfigEmbed(guild) {
  const guildConfig = getGuildConfig(guild.id);
  const stickyChannels = Object.keys(guildConfig.stickyMessages);
  const warningUsers = Object.keys(guildConfig.warnings);

  return new EmbedBuilder()
    .setColor(colors.purple)
    .setTitle('Developer Config View')
    .setDescription('Server config summary. Tokens and environment secrets are never shown.')
    .addFields(
      { name: 'Guild ID', value: guild.id, inline: true },
      { name: 'Log Channel', value: guildConfig.logChannelId ? `<#${guildConfig.logChannelId}>` : 'Not set', inline: true },
      { name: 'Logs Enabled', value: guildConfig.logsEnabled ? 'Yes' : 'No', inline: true },
      { name: 'Log Types', value: formatLogCategories(guildConfig.enabledLogCategories), inline: false },
      { name: 'Developer Users', value: formatDeveloperIds(), inline: false },
      { name: 'Lockdown Role', value: guildConfig.lockdownRoleId ? `<@&${guildConfig.lockdownRoleId}>` : '@everyone', inline: true },
      { name: 'Sticky Channels', value: stickyChannels.length ? stickyChannels.map((id) => `<#${id}>`).join(', ') : 'None', inline: false },
      { name: 'Users With Warnings', value: warningUsers.length ? warningUsers.map((id) => `<@${id}>`).join(', ') : 'None', inline: false },
      { name: 'Twitch', value: guildConfig.twitch?.enabled ? `twitch.tv/${guildConfig.twitch.channelName} in <#${guildConfig.twitch.announceChannelId}>` : 'Disabled', inline: false }
    )
    .setFooter({ text: embedFooterText('Config') })
    .setTimestamp();
}

function devPresenceModal() {
  return new ModalBuilder()
    .setCustomId('devdash:presence')
    .setTitle('Set Bot Presence')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('presence_text')
          .setLabel('Presence text')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(80)
          .setValue(presenceText.slice(0, 80))
          .setRequired(true)
      )
    );
}

function devUsersModal() {
  const input = new TextInputBuilder()
    .setCustomId('dev_user_ids')
    .setLabel('Discord user IDs')
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(1000)
    .setPlaceholder('123456789012345678, 987654321098765432')
    .setRequired(false);
  const savedIds = (config.devUserIds ?? []).join('\n').slice(0, 1000);
  if (savedIds) input.setValue(savedIds);

  return new ModalBuilder()
    .setCustomId('devdash:devusers')
    .setTitle('Set Developer Users')
    .addComponents(
      new ActionRowBuilder().addComponents(input)
    );
}

function devAddUserModal() {
  return new ModalBuilder()
    .setCustomId('devdash:adddev')
    .setTitle('Add Developer User')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('dev_user_id')
          .setLabel('User ID or mention')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(1000)
          .setPlaceholder('123456789012345678 or @username')
          .setRequired(true)
      )
    );
}

function devRenameModal(currentName) {
  return new ModalBuilder()
    .setCustomId('devdash:rename')
    .setTitle('Rename Bot In This Server')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('bot_nickname')
          .setLabel('Bot nickname')
          .setStyle(TextInputStyle.Short)
          .setMinLength(2)
          .setMaxLength(32)
          .setValue(currentName.slice(0, 32))
          .setRequired(true)
      )
    );
}

function devSayModal() {
  return new ModalBuilder()
    .setCustomId('devdash:say')
    .setTitle('Send Developer Message')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('say_message')
          .setLabel('Message for this channel')
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(1)
          .setMaxLength(1900)
          .setRequired(true)
      )
    );
}

function devResetModal(guildName) {
  return new ModalBuilder()
    .setCustomId('devdash:reset')
    .setTitle('Are You Sure?')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reset_confirmation')
          .setLabel('Type RESET to reset everything known')
          .setStyle(TextInputStyle.Short)
          .setMinLength(5)
          .setMaxLength(5)
          .setPlaceholder(`RESET ${guildName.slice(0, 20)} data`)
          .setRequired(true)
      )
    );
}

function dashboardEmbed(guild) {
  const guildConfig = getGuildConfig(guild.id);
  const logChannel = guildConfig.logChannelId ? `<#${guildConfig.logChannelId}>` : 'Not set';
  const stickyCount = Object.keys(guildConfig.stickyMessages).length;
  const warningCount = Object.values(guildConfig.warnings).reduce((sum, warnings) => sum + warnings.length, 0);
  const twitch = guildConfig.twitch;

  return new EmbedBuilder()
    .setColor(colors.blurple)
    .setTitle('V2 Server Dashboard')
    .setDescription('Server-specific settings. This bot can now run cleanly across multiple servers.')
    .addFields(
      { name: 'Logs', value: guildConfig.logsEnabled ? 'Enabled' : 'Disabled', inline: true },
      { name: 'Log Channel', value: logChannel, inline: true },
      { name: 'Log Types', value: formatLogCategories(guildConfig.enabledLogCategories), inline: false },
      { name: 'Sticky Channels', value: stickyCount.toString(), inline: true },
      { name: 'Stored Warnings', value: warningCount.toString(), inline: true },
      { name: 'Twitch Alerts', value: twitch?.enabled ? `Watching twitch.tv/${twitch.channelName} in <#${twitch.announceChannelId}>` : 'Disabled', inline: false }
    )
    .setFooter({ text: embedFooterText(guild.name) })
    .setTimestamp();
}

function pingEmbed(roundTrip, websocketPing) {
  return new EmbedBuilder()
    .setColor(pingColor(roundTrip, websocketPing))
    .setTitle('Pong!')
    .setDescription('Bot latency check')
    .addFields(
      { name: 'Round Trip', value: formatPing(roundTrip), inline: true },
      { name: 'Discord Websocket', value: formatPing(websocketPing), inline: true }
    )
    .setFooter({ text: embedFooterText() })
    .setTimestamp();
}

function formatPing(value) {
  return Number.isFinite(value) && value >= 0 ? `${Math.round(value)}ms` : 'measuring...';
}

function pingColor(roundTrip, websocketPing) {
  const worstPing = Math.max(
    Number.isFinite(roundTrip) ? roundTrip : 0,
    Number.isFinite(websocketPing) ? websocketPing : 0
  );

  if (worstPing < 150) return colors.green;
  if (worstPing < 300) return colors.yellow;
  return colors.red;
}

function commandListEmbed() {
  return new EmbedBuilder()
    .setColor(colors.blurple)
    .setTitle('Community Commands')
    .setDescription('Open commands for everyone. Staff and developer commands are intentionally not listed here.')
    .addFields(
      {
        name: 'Core',
        value: [
          '`!join` / `/join` - Start beta chat reply mode in this channel.',
          '`!ping` / `/ping` - Show bot latency.',
          '`!commands` / `/commands` - Show this menu.',
          '`!avatar [@user]` / `/avatar [user]` - Show an avatar.',
          '`!uptime` / `/uptime` - Show bot uptime.',
          '`!membercount` / `/membercount` - Show member count.',
          '`!servericon` / `/servericon` - Show server icon.'
        ].join('\n')
      },
      {
        name: 'Fun',
        value: [
          '`!coinflip` / `/coinflip` - Flip a coin.',
          '`!roll [sides]` / `/roll [sides]` - Roll a die.',
          '`!8ball <question>` / `/magic8ball question` - Ask the 8 ball.',
          '`!poll <question>` / `/poll question` - Start a yes/no poll.',
          '`!choose a, b, c` / `/choose options` - Pick an option.',
          '`!rate <thing>` / `/rate thing` - Rate something.',
          '`!ship @user @user` / `/ship first second` - Compatibility score.',
          '`!testerror` - Trigger a test error for the developer DM flow.',
          '`!topic` / `/topic` - Conversation starter.',
          '`!quote` / `/quote` - Short quote.',
          '`!password [length]` / `/password [length]` - Private password.',
          '`!number [max]` / `/number [max]` - Random number.'
        ].join('\n')
      },
      {
        name: 'Info',
        value: [
          '`!serverinfo` / `/serverinfo` - Show server details.',
          '`!userinfo [@user]` / `/userinfo [user]` - Show user details.'
        ].join('\n')
      }
    )
    .setFooter({ text: embedFooterText('Prefix: !') })
    .setTimestamp();
}

function adminCommandsEmbed() {
  return new EmbedBuilder()
    .setColor(colors.yellow)
    .setTitle('Admin Commands')
    .setDescription('Staff commands require the matching Discord permission.')
    .addFields(
      {
        name: 'Setup',
        value: [
          '`/dashboard` - Show server setup status.',
          '`/setlogchannel channel` - Set log channel.',
          '`/logtest` - Send a test log.',
          '`/sticky add` / `/sticky remove` / `/sticky status` - Manage sticky messages.',
          '`/twitch set` / `/twitch remove` / `/twitch status` / `/twitch check` - Manage Twitch alerts.'
        ].join('\n')
      },
      {
        name: 'Moderation',
        value: [
          '`/purge` - Delete recent messages.',
          '`/warn`, `/warnings`, `/clearwarns` - Warning system.',
          '`/kick`, `/ban`, `/unban` - Member removal tools.',
          '`/timeout`, `/mute`, `/unmute` - Timeout tools.',
          '`/slowmode`, `/nick`, `/role add`, `/role remove` - Channel/member tools.',
          '`/lockdown`, `/unlockdown`, `/lockdownserver`, `/unlockdownserver` - Emergency locks.',
          '`/say` - Send a controlled bot message.'
        ].join('\n')
      }
    )
    .setFooter({ text: embedFooterText('Admins') })
    .setTimestamp();
}

function devCommandsEmbed() {
  return new EmbedBuilder()
    .setColor(colors.purple)
    .setTitle('Developer Commands')
    .setDescription('Private runtime tools and harmless prank commands. They are not included in `/commands`.')
    .addFields(
      {
        name: 'Runtime',
        value: [
          '`/devdashboard` - Open the interactive private control panel.',
          '`/dev runtime` - Bot runtime stats.',
          '`/dev servers` - Server list.',
          '`/dev presence text` - Change presence.',
          '`/dev renamebot nickname` - Change bot nickname in this server.',
          '`/dev say message` - Send a developer message.'
        ].join('\n')
      },
      {
        name: 'Prank Tools',
        value: [
          '`/dev bonk` - Public bonk gag.',
          '`/dev fakeban` - Clearly fake ban gag.',
          '`/dev vibecheck` - Fake vibe score.',
          '`/dev reverse` - Reverse text.',
          '`/dev vaporwave` - Wide spaced text.',
          '`/dev panic` - Fake panic sequence that resolves itself.'
        ].join('\n')
      }
    )
    .setFooter({ text: embedFooterText('Developer') })
    .setTimestamp();
}

function devRuntimeEmbed() {
  return new EmbedBuilder()
    .setColor(colors.purple)
    .setTitle('Developer Runtime')
    .addFields(
      { name: 'Bot', value: client.user?.tag ?? 'Unknown', inline: true },
      { name: 'Gateway Ping', value: `${Math.round(client.ws.ping)}ms`, inline: true },
      { name: 'Uptime', value: formatDuration(client.uptime ?? 0), inline: true },
      { name: 'Version', value: `V${botVersion}`, inline: true },
      { name: 'Guilds', value: client.guilds.cache.size.toString(), inline: true },
      { name: 'Node', value: process.version, inline: true },
      { name: 'Memory', value: `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`, inline: true }
    )
    .setFooter({ text: embedFooterText() })
    .setTimestamp();
}

function devServersEmbed() {
  const servers = client.guilds.cache
    .map((guild) => `${guild.name} (${guild.memberCount.toLocaleString()} members)`)
    .slice(0, 20)
    .join('\n') || 'No servers cached.';

  return new EmbedBuilder()
    .setColor(colors.purple)
    .setTitle(`Servers (${client.guilds.cache.size})`)
    .setDescription(servers)
    .setFooter({ text: embedFooterText('Developer') })
    .setTimestamp();
}

function serverInfoEmbed(guild) {
  return new EmbedBuilder()
    .setColor(colors.green)
    .setTitle(guild.name)
    .setThumbnail(guild.iconURL({ size: 256 }))
    .addFields(
      { name: 'Members', value: guild.memberCount.toLocaleString(), inline: true },
      { name: 'Roles', value: guild.roles.cache.size.toLocaleString(), inline: true },
      { name: 'Channels', value: guild.channels.cache.size.toLocaleString(), inline: true },
      { name: 'Owner ID', value: guild.ownerId, inline: true },
      { name: 'Server ID', value: guild.id, inline: true },
      { name: 'Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`, inline: false }
    )
    .setFooter({ text: embedFooterText('Server information') })
    .setTimestamp();
}

function userInfoEmbed(user, member) {
  const roles = member?.roles.cache
    .filter((role) => role.id !== member.guild.id)
    .sort((a, b) => b.position - a.position)
    .map((role) => role.toString())
    .slice(0, 10);

  const fields = [
    { name: 'User ID', value: user.id, inline: true },
    { name: 'Bot', value: user.bot ? 'Yes' : 'No', inline: true },
    { name: 'Account Created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:F>`, inline: false },
    member?.joinedTimestamp ? { name: 'Joined Server', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`, inline: false } : null,
    member?.nickname ? { name: 'Nickname', value: member.nickname, inline: true } : null,
    member ? { name: 'Top Roles', value: roles?.length ? roles.join(' ') : 'None', inline: false } : null
  ].filter(Boolean);

  return new EmbedBuilder()
    .setColor(member?.displayHexColor && member.displayHexColor !== '#000000' ? member.displayHexColor : colors.blurple)
    .setTitle(user.tag)
    .setThumbnail(user.displayAvatarURL({ size: 256 }))
    .addFields(fields)
    .setFooter({ text: embedFooterText('User information') })
    .setTimestamp();
}

function avatarEmbed(user) {
  return new EmbedBuilder()
    .setColor(colors.green)
    .setTitle(`${user.tag}'s Avatar`)
    .setImage(user.displayAvatarURL({ size: 1024 }))
    .setFooter({ text: embedFooterText('Community') })
    .setTimestamp();
}

function communityInfoEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(colors.green)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: embedFooterText('Community') })
    .setTimestamp();
}

function memberCountEmbed(guild) {
  const humans = guild.members.cache.filter((member) => !member.user.bot).size;
  const bots = guild.members.cache.filter((member) => member.user.bot).size;

  return new EmbedBuilder()
    .setColor(colors.green)
    .setTitle('Member Count')
    .addFields(
      { name: 'Total', value: guild.memberCount.toLocaleString(), inline: true },
      { name: 'Humans', value: humans.toLocaleString(), inline: true },
      { name: 'Bots', value: bots.toLocaleString(), inline: true }
    )
    .setFooter({ text: embedFooterText(guild.name) })
    .setTimestamp();
}

function serverIconEmbed(guild) {
  const iconUrl = guild.iconURL({ size: 1024 });
  const embed = new EmbedBuilder()
    .setColor(colors.green)
    .setTitle(`${guild.name} Icon`)
    .setFooter({ text: embedFooterText('Community') })
    .setTimestamp();

  return iconUrl ? embed.setImage(iconUrl) : embed.setDescription('This server does not have an icon.');
}

function joinResponse(user, channel) {
  const channelText = channel?.toString?.() ?? 'this chat';
  return `${user} AI chat is now enabled in beta mode. I will respond in ${channelText} when someone mentions me or replies to one of my messages.`;
}

function coinFlipResponse(user) {
  return `${user} flipped **${Math.random() < 0.5 ? 'heads' : 'tails'}**.`;
}

function rollResponse(user, sides) {
  const result = Math.floor(Math.random() * sides) + 1;
  return `${user} rolled **${result}** on a d${sides}.`;
}

function chooseResponse(user, rawOptions) {
  const options = rawOptions.split(',').map((option) => option.trim()).filter(Boolean).slice(0, 20);
  if (options.length < 2) return 'Give me at least two comma-separated options.';
  return `${user}, I choose **${truncate(randomFrom(options), 120)}**.`;
}

function rateResponse(user, thing) {
  const score = stableScore(`${user.id}:${thing.toLowerCase()}`, 101);
  return `${user}, I rate **${truncate(thing, 120)}** a **${score}/100**.`;
}

function shipResponse(first, second) {
  const score = stableScore([first.id, second.id].sort().join(':'), 101);
  const label = score >= 85 ? 'legendary' : score >= 65 ? 'solid' : score >= 40 ? 'complicated' : 'chaotic';
  return `${first} + ${second}: **${score}%** compatibility. Status: **${label}**.`;
}

function numberResponse(user, max) {
  const result = Math.floor(Math.random() * max) + 1;
  return `${user}, your number is **${result}** out of ${max.toLocaleString()}.`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function magic8BallEmbed(user, question) {
  const answers = [
    'Yes.',
    'No.',
    'Absolutely.',
    'Not looking good.',
    'Ask again later.',
    'I would not count on it.',
    'Most likely.',
    'The answer is fuzzy.'
  ];

  return new EmbedBuilder()
    .setColor(colors.blurple)
    .setTitle('Magic 8 Ball')
    .addFields(
      { name: 'Question', value: truncate(question, 300), inline: false },
      { name: 'Answer', value: randomFrom(answers), inline: false }
    )
    .setFooter({ text: embedFooterText(user.tag) })
    .setTimestamp();
}

function pollEmbed(user, question) {
  return new EmbedBuilder()
    .setColor(colors.yellow)
    .setTitle('Community Poll')
    .setDescription(truncate(question, 250))
    .addFields({ name: 'Vote', value: 'Yes: thumbs up\nNo: thumbs down', inline: false })
    .setFooter({ text: embedFooterText(`Started by ${user.tag}`) })
    .setTimestamp();
}

async function addPollReactions(message) {
  await message.react('\u{1F44D}').catch(() => null);
  await message.react('\u{1F44E}').catch(() => null);
}

const conversationTopics = [
  'What is one small win from today?',
  'What game, show, or song has had your attention lately?',
  'What is a skill you want to get weirdly good at?',
  'What is your go-to comfort meal?',
  'What is one server event you would actually show up for?',
  'What is the best advice you have heard recently?',
  'What would you build if time and money were no problem?',
  'What is an unpopular opinion you will defend politely?'
];

const communityQuotes = [
  'Small steps still move the whole story forward.',
  'Consistency beats panic almost every time.',
  'Make it work, then make it clean.',
  'Good energy is built, not found.',
  'You do not need perfect timing to start.',
  'A calm reset counts as progress.',
  'The next version can be better because this one exists.',
  'Do the clear thing first.'
];

function devBonkResponse(user, reason) {
  return `Bonk notice for ${user}: ${truncate(reason, 160)}. Sentence: one minute of thinking about their choices.`;
}

function devFakeBanResponse(user) {
  return `Fake ban simulation: ${user} has been dramatically launched into the moderation void. Result: denied. They are still here.`;
}

function devVibeCheckResponse(user) {
  const score = Math.floor(Math.random() * 101);
  const label = score >= 80 ? 'immaculate' : score >= 55 ? 'stable' : score >= 30 ? 'questionable' : 'needs calibration';
  return `${user} vibe check: **${score}/100**. Status: **${label}**.`;
}

function reverseText(text) {
  return truncate([...text].reverse().join(''), 1900);
}

function wideText(text) {
  return truncate(text.toUpperCase().split('').join(' '), 1900);
}

async function runFakePanic(channel) {
  if (!channel?.isTextBased()) return;
  const sent = await channel.send('DEV PANIC: checking the big red button...');
  await wait(900);
  await sent.edit('DEV PANIC: calibrating imaginary alarm bells...');
  await wait(900);
  await sent.edit('DEV PANIC: false alarm. Everything is normal. Carry on.');
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function stripLeadingChannelMention(text, channelId) {
  return text
    .replace(new RegExp(`^<#${channelId}>\\s*`), '')
    .trim();
}

function generatePassword(length) {
  const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?';
  return Array.from({ length }, () => characters[Math.floor(Math.random() * characters.length)]).join('');
}

function randomFrom(values) {
  return values[Math.floor(Math.random() * values.length)];
}

function stableScore(value, max) {
  let hash = 0;
  for (const character of value) {
    hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  }
  return Math.abs(hash) % max;
}

function truncate(value, maxLength) {
  if (!value || value.length <= maxLength) return value ?? '';
  return `${value.slice(0, maxLength - 3)}...`;
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [
    days ? `${days}d` : null,
    hours ? `${hours}h` : null,
    minutes ? `${minutes}m` : null,
    `${seconds}s`
  ].filter(Boolean).join(' ');
}

function embedFooterText(note) {
  return [footerBrand, `V${botVersion}`, note].filter(Boolean).join(' | ');
}

process.on('unhandledRejection', (reason) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  console.error('Unhandled promise rejection:', error);
  void notifyDevelopersOfError(error, { type: 'UnhandledRejection' });
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  void notifyDevelopersOfError(error, { type: 'UncaughtException' });
});

createLockFile();

client.login(token) .catch((error)=> {console.error('Failed to login:', error)})
  .then(() => console.log('Bot logged in successfully.'));