import { ChannelType, SlashCommandBuilder } from 'discord.js';
import { bugSlashCommand } from './commands/bug.js';
import { globalCommunityFunCommandDefinitions } from './modules/community/fun-command-definitions.js';

const textChannelTypes = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const voiceChannelTypes = [ChannelType.GuildVoice, ChannelType.GuildStageVoice];
export const productionExcludedCommandNames = new Set();
const removedSlashCommandNames = new Set(['customcommand', 'lab', 'studio', 'dev', 'devcommands', 'devdiff']);
const collapsedSlashCommandNames = new Set([
  'serverinfo',
  'userinfo',
  'avatar',
  'uptime',
  'membercount',
  'servericon',
  'serverbanner',
  'invite',
  'botinfo',
  'roleinfo',
  'channelinfo',
  'password',
  'coinflip',
  'roll',
  'magic8ball',
  'poll',
  'choose',
  'rate',
  'ship',
  'rps',
  'compliment',
  'truth',
  'dare',
  'wouldyourather',
  'joke',
  'fact',
  'achievement',
  'topic',
  'quote',
  'number',
  'warn',
  'warnings',
  'clearwarns',
  'modnote',
  'modlogs'
]);

function addSimpleSubcommands(command, entries) {
  for (const [name, description] of entries) {
    command.addSubcommand((subcommand) =>
      subcommand
        .setName(name)
        .setDescription(description)
        .addStringOption((option) =>
          option
            .setName('input')
            .setDescription('Optional target, topic, text, value, or note for this action.')
            .setMaxLength(500)
            .setRequired(false)
        )
    );
  }
  return command;
}

function textOption(optionName, description, { required = false, max = 500, min = 1 } = {}) {
  return (option) =>
    option
      .setName(optionName)
      .setDescription(description)
      .setMinLength(min)
      .setMaxLength(max)
      .setRequired(required);
}

function userOption(optionName = 'user', description = 'Target user.', required = false) {
  return (option) =>
    option
      .setName(optionName)
      .setDescription(description)
      .setRequired(required);
}

function counterTypeChoices() {
  return [
    { name: 'Members: Total Members', value: 'total_members' },
    { name: 'Members: Human Members', value: 'human_members' },
    { name: 'Members: Bot Count', value: 'bot_count' },
    { name: 'Members: Online Members', value: 'online_members' },
    { name: 'Members: Active Members', value: 'active_members' },
    { name: 'Members: New Members Today', value: 'new_members_today' },
    { name: 'Activity: Messages Today', value: 'messages_today' },
    { name: 'Activity: Active Voice Users', value: 'active_voice_users' },
    { name: 'Voice: Voice Channels', value: 'voice_channels' },
    { name: 'Activity: Boost Count', value: 'boost_count' },
    { name: 'Activity: Total Roles', value: 'total_roles' },
    { name: 'Activity: Total Channels', value: 'total_channels' },
    { name: 'Activity: Total Emojis', value: 'total_emojis' },
    { name: 'Statistics: Server Age', value: 'server_age_days' },
    { name: 'Community: Verified Users', value: 'verified_users' },
    { name: 'Community: Staff Count', value: 'staff_count' },
    { name: 'Community: Banned Users', value: 'banned_users' },
    { name: 'Community: Tickets Open', value: 'tickets_open' },
    { name: 'Community: Active Giveaways', value: 'active_giveaways' },
    { name: 'Community: Leveling Participants', value: 'leveling_participants' },
    { name: 'Community: Economy Users', value: 'economy_users' },
    { name: 'Community: Premium Members', value: 'premium_members' },
    { name: 'Fun: Level Leaders', value: 'level_leaders' },
    { name: 'Fun: Giveaway Entries', value: 'giveaway_entries' },
    { name: 'Statistics: Server Growth', value: 'server_growth' }
  ];
}

function counterTemplateChoices() {
  return [
    { name: 'Community: Member Growth', value: 'members' },
    { name: 'Community: Community', value: 'community' },
    { name: 'Activity: Activity', value: 'activity' },
    { name: 'Statistics: Server Stats', value: 'statistics' },
    { name: 'Voice: Voice', value: 'voice' },
    { name: 'Moderation: Moderation', value: 'moderation' },
    { name: 'Fun: Fun', value: 'fun' },
    { name: 'Statistics: Growth Pulse', value: 'growth' },
    { name: 'Community: Premium', value: 'premium' },
    { name: 'Custom: Custom Starter', value: 'custom' },
    { name: 'Statistics: Balanced All', value: 'all' }
  ];
}

function counterStyleChoices() {
  return [
    { name: 'Compact', value: 'compact' },
    { name: 'Fancy', value: 'fancy' },
    { name: 'Minimal', value: 'minimal' },
    { name: 'Boxed', value: 'boxed' },
    { name: 'Stacked', value: 'stacked' }
  ];
}

const polishedCommandDescriptions = Object.freeze({
  ping: 'Check bot latency and Discord websocket health.',
  commands: 'Open the polished command guide and module directory.',
  owner: 'View bot ownership, support, and contact information.',
  admincommands: 'Show setup, staff, and admin command shortcuts.',
  devdashboard: 'Open the private developer control center.',
  feature: 'Enable, disable, and audit command availability.',
  featuredisable: 'Quickly disable a command across configured servers.',
  join: 'Start joined AI chat mode in the current channel.',
  unjoin: 'Stop joined AI chat mode for this server.',
  info: 'Look up server, member, role, channel, bot, and invite info.',
  fun: 'Run lightweight community games, prompts, and social tools.',
  suggestion: 'Send a community suggestion to the developer queue.',
  bug: 'Report a bot bug to the developer bug tracker.',
  notify: 'Subscribe to important bot update DMs.',
  preview: 'View the current public preview message.',
  leak: 'Post a controlled preview or teaser to a server channel.',
  social: 'Manage and post a clean server social-links directory.',
  profile: 'Customize profiles, bios, reputation, and social cards.',
  economy: 'Use coins, rewards, inventory, XP, and shop systems.',
  utility: 'Run text, randomizer, timer, and helper utilities.',
  games: 'Play interactive community games and fun challenges.',
  voice: 'Inspect and manage voice activity, channels, and members.',
  media: 'Preview media, creator links, and content discovery cards.',
  security: 'Review protection, raid, risk, and recovery controls.',
  staff: 'Manage reports, appeals, staff notes, and queues.',
  serveradmin: 'Plan server backups, cleanup, templates, and sync tasks.',
  automation: 'Build triggers, scheduled posts, and auto-response flows.',
  analytics: 'View server growth, activity, retention, and mod analytics.',
  rolesystem: 'Manage role panels, temporary roles, and role automation.',
  dashboard: 'Open the central community-first setup dashboard.',
  config: 'Shortcut to the central setup dashboard.',
  counter: 'Create, repair, and refresh dynamic voice stat counters.',
  setup: 'Open the guided setup dashboard.',
  permissions: 'Check bot permissions and setup blockers.',
  modstats: 'View a compact moderation and setup health snapshot.',
  moderation: 'Open warnings, notes, history, and member moderation tools.',
  case: 'Create and manage private staff case channels.',
  verification: 'Configure and send the lightweight verify button panel.',
  reactionrole: 'Create and maintain self-assign role panels.',
  welcome: 'Configure, preview, and manage welcome messages.',
  setlogchannel: 'Set the main server log channel.',
  logtest: 'Send a test log to confirm logging is working.',
  sticky: 'Create sticky messages that stay at the bottom of a channel.',
  twitch: 'Manage Twitch live and stream-ended alerts.',
  youtube: 'Manage YouTube upload and live-video alerts.',
  tiktok: 'Manage TikTok creator post alerts.',
  lockdown: 'Lock the current channel for the configured member role.',
  unlockdown: 'Unlock the current channel and remove the lockdown notice.',
  lockdownserver: 'Lock all eligible community-visible channels.',
  unlockdownserver: 'Unlock all eligible channels and removes lockdown embeds.',
  purge: 'Bulk-delete recent messages with safe filters.',
  say: 'Send a controlled message as the bot.',
  clean: 'Delete recent messages from one member.',
  softban: 'Ban then unban a member to clear recent messages.',
  banid: 'Ban a user by ID with logging and reason support.',
  massban: 'Ban multiple user IDs with confirmation-safe logging.',
  tempban: 'Temporarily ban a member for a set duration.',
  tempbans: 'List active temporary bans.',
  lockdownrole: 'Choose which role lockdown commands should target.',
  kick: 'Kick a member with permission and hierarchy checks.',
  ban: 'Ban a member with permission and hierarchy checks.',
  unban: 'Unban a user ID with logging.',
  timeout: 'Timeout a member for a set duration.',
  unmute: 'Remove a member timeout.',
  slowmode: 'Set channel slowmode.',
  nick: 'Change or reset a member nickname.',
  role: 'Add or remove a member role safely.'
});

function polishCommandJson(commandJson) {
  const description = polishedCommandDescriptions[commandJson.name];
  return {
    ...commandJson,
    description: description ?? commandJson.description,
    options: polishCommandOptions(commandJson.options)
  };
}

function polishCommandOptions(options = []) {
  if (!Array.isArray(options)) return options;
  return options.map((option) => ({
    ...option,
    description: polishOptionDescription(option),
    options: polishCommandOptions(option.options)
  }));
}

function polishOptionDescription(option) {
  const description = String(option?.description ?? '').trim();
  if (option?.name === 'input' && description === 'Optional target, topic, text, value, or note for this action.') {
    return 'Optional text, target, value, or note for this action.';
  }
  if (description === 'Target user.') return 'User to inspect or update.';
  if (description === 'Target member.') return 'Member to inspect or update.';
  if (description === 'The target. Defaults to you.') return 'Member to use. Defaults to you.';
  return description;
}

export const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Shows bot latency.'),
  new SlashCommandBuilder()
    .setName('commands')
    .setDescription('Shows the community command list.'),
  new SlashCommandBuilder()
    .setName('owner')
    .setDescription('Owner profile and contact info.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('info')
        .setDescription('Shows who owns the bot and how to reach them.')
    ),
  new SlashCommandBuilder()
    .setName('admincommands')
    .setDescription('Shows staff commands, with developer tools for the owner.'),
  new SlashCommandBuilder()
    .setName('devdashboard')
    .setDescription('Opens the private developer control dashboard.'),
  new SlashCommandBuilder()
    .setName('feature')
    .setDescription('Owner-only feature controls.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('disable')
        .setDescription('Disables a bot command.')
        .addStringOption((option) =>
          option
            .setName('command')
            .setDescription('Command name to disable, without slash or prefix.')
            .setMaxLength(32)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('enable')
        .setDescription('Enables a disabled bot command.')
        .addStringOption((option) =>
          option
            .setName('command')
            .setDescription('Command name to enable, without slash or prefix.')
            .setMaxLength(32)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('list')
        .setDescription('Lists disabled bot commands.')
    ),
  new SlashCommandBuilder()
    .setName('featuredisable')
    .setDescription('Owner-only shortcut to disable a bot command.')
    .addStringOption((option) =>
      option
        .setName('command')
        .setDescription('Command name to disable, without slash or prefix.')
        .setMaxLength(32)
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('join')
    .setDescription('Starts beta chat reply mode in this channel.'),
  new SlashCommandBuilder()
    .setName('unjoin')
    .setDescription('Stops beta chat reply mode in this server.'),
  new SlashCommandBuilder()
    .setName('info')
    .setDescription('Server, member, bot, and utility lookup commands.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('server')
        .setDescription('Shows details about this server.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('user')
        .setDescription('Shows details about a user.')
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('The user to inspect.')
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('avatar')
        .setDescription('Shows a user avatar.')
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('The user whose avatar you want to see.')
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('uptime')
        .setDescription('Shows how long the bot has been online.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('membercount')
        .setDescription('Shows the server member count.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('servericon')
        .setDescription('Shows the server icon.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('serverbanner')
        .setDescription('Shows the server banner if one is set.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('invite')
        .setDescription('Gets the bot invite link.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('bot')
        .setDescription('Shows bot version, uptime, and command stats.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('role')
        .setDescription('Shows details about a server role.')
        .addRoleOption((option) =>
          option
            .setName('role')
            .setDescription('The role to inspect.')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('channel')
        .setDescription('Shows details about a server channel.')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('The channel to inspect. Defaults to this channel.')
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('password')
        .setDescription('Generates a random password privately.')
        .addIntegerOption((option) =>
          option
            .setName('length')
            .setDescription('Password length.')
            .setMinValue(8)
            .setMaxValue(64)
            .setRequired(false)
        )
    ),
  new SlashCommandBuilder()
    .setName('fun')
    .setDescription('Games, prompts, ratings, polls, and quick replies.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('coinflip')
        .setDescription('Flips a coin.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('roll')
        .setDescription('Rolls a die.')
        .addIntegerOption((option) =>
          option
            .setName('sides')
            .setDescription('How many sides the die has.')
            .setMinValue(2)
            .setMaxValue(1000)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('magic8ball')
        .setDescription('Answers a yes-or-no question.')
        .addStringOption((option) =>
          option
            .setName('question')
            .setDescription('Your question.')
            .setMaxLength(300)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('poll')
        .setDescription('Starts a simple yes/no poll.')
        .addStringOption((option) =>
          option
            .setName('question')
            .setDescription('The poll question.')
            .setMaxLength(250)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('choose')
        .setDescription('Chooses between comma-separated options.')
        .addStringOption((option) =>
          option
            .setName('options')
            .setDescription('Example: pizza, burgers, tacos')
            .setMaxLength(500)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('rate')
        .setDescription('Rates anything from 0 to 100.')
        .addStringOption((option) =>
          option
            .setName('thing')
            .setDescription('What should I rate?')
            .setMaxLength(200)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('ship')
        .setDescription('Calculates a fake compatibility score.')
        .addUserOption((option) =>
          option
            .setName('first')
            .setDescription('First user.')
            .setRequired(true)
        )
        .addUserOption((option) =>
          option
            .setName('second')
            .setDescription('Second user. Defaults to you.')
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('rps')
        .setDescription('Play rock, paper, scissors.')
        .addStringOption((option) =>
          option
            .setName('choice')
            .setDescription('Your move.')
            .addChoices(
              { name: 'Rock', value: 'rock' },
              { name: 'Paper', value: 'paper' },
              { name: 'Scissors', value: 'scissors' }
            )
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('compliment')
        .setDescription('Sends a friendly compliment.')
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('Who should receive the compliment?')
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('truth')
        .setDescription('Drops a safe truth question.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('dare')
        .setDescription('Drops a safe dare prompt.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('wouldyourather')
        .setDescription('Drops a would-you-rather prompt.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('joke')
        .setDescription('Drops a clean community joke.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('fact')
        .setDescription('Drops a quick community fact.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('achievement')
        .setDescription('Creates a fake achievement unlock.')
        .addStringOption((option) =>
          option
            .setName('title')
            .setDescription('Achievement title.')
            .setMaxLength(80)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('topic')
        .setDescription('Drops a conversation starter.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('quote')
        .setDescription('Drops a short motivational quote.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('number')
        .setDescription('Picks a random number.')
        .addIntegerOption((option) =>
          option
            .setName('max')
            .setDescription('Highest possible number.')
            .setMinValue(2)
            .setMaxValue(1000000)
            .setRequired(false)
        )
    ),
  new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Shows details about this server.'),
  new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Shows details about a user.')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The user to inspect.')
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Shows a user avatar.')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The user whose avatar you want to see.')
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('coinflip')
    .setDescription('Flips a coin.'),
  new SlashCommandBuilder()
    .setName('roll')
    .setDescription('Rolls a die.')
    .addIntegerOption((option) =>
      option
        .setName('sides')
        .setDescription('How many sides the die has.')
        .setMinValue(2)
        .setMaxValue(1000)
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('magic8ball')
    .setDescription('Answers a yes-or-no question.')
    .addStringOption((option) =>
      option
        .setName('question')
        .setDescription('Your question.')
        .setMaxLength(300)
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Starts a simple yes/no poll.')
    .addStringOption((option) =>
      option
        .setName('question')
        .setDescription('The poll question.')
        .setMaxLength(250)
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('uptime')
    .setDescription('Shows how long the bot has been online.'),
  new SlashCommandBuilder()
    .setName('membercount')
    .setDescription('Shows the server member count.'),
  new SlashCommandBuilder()
    .setName('servericon')
    .setDescription('Shows the server icon.'),
  new SlashCommandBuilder()
    .setName('serverbanner')
    .setDescription('Shows the server banner if one is set.'),
  new SlashCommandBuilder()
    .setName('invite')
    .setDescription('Gets the bot invite link.'),
  new SlashCommandBuilder()
    .setName('botinfo')
    .setDescription('Shows bot version, uptime, and command stats.'),
  new SlashCommandBuilder()
    .setName('roleinfo')
    .setDescription('Shows details about a server role.')
    .addRoleOption((option) =>
      option
        .setName('role')
        .setDescription('The role to inspect.')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('channelinfo')
    .setDescription('Shows details about a server channel.')
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('The channel to inspect. Defaults to this channel.')
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('choose')
    .setDescription('Chooses between comma-separated options.')
    .addStringOption((option) =>
      option
        .setName('options')
        .setDescription('Example: pizza, burgers, tacos')
        .setMaxLength(500)
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('rate')
    .setDescription('Rates anything from 0 to 100.')
    .addStringOption((option) =>
      option
        .setName('thing')
        .setDescription('What should I rate?')
        .setMaxLength(200)
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('ship')
    .setDescription('Calculates a fake compatibility score.')
    .addUserOption((option) =>
      option
        .setName('first')
        .setDescription('First user.')
        .setRequired(true)
    )
    .addUserOption((option) =>
      option
        .setName('second')
        .setDescription('Second user. Defaults to you.')
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('rps')
    .setDescription('Play rock, paper, scissors.')
    .addStringOption((option) =>
      option
        .setName('choice')
        .setDescription('Your move.')
        .addChoices(
          { name: 'Rock', value: 'rock' },
          { name: 'Paper', value: 'paper' },
          { name: 'Scissors', value: 'scissors' }
        )
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('compliment')
    .setDescription('Sends a friendly compliment.')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('Who should receive the compliment?')
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('truth')
    .setDescription('Drops a safe truth question.'),
  new SlashCommandBuilder()
    .setName('dare')
    .setDescription('Drops a safe dare prompt.'),
  new SlashCommandBuilder()
    .setName('wouldyourather')
    .setDescription('Drops a would-you-rather prompt.'),
  new SlashCommandBuilder()
    .setName('joke')
    .setDescription('Drops a clean community joke.'),
  new SlashCommandBuilder()
    .setName('fact')
    .setDescription('Drops a quick community fact.'),
  new SlashCommandBuilder()
    .setName('achievement')
    .setDescription('Creates a fake achievement unlock.')
    .addStringOption((option) =>
      option
        .setName('title')
        .setDescription('Achievement title.')
        .setMaxLength(80)
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('topic')
    .setDescription('Drops a conversation starter.'),
  new SlashCommandBuilder()
    .setName('quote')
    .setDescription('Drops a short motivational quote.'),
  new SlashCommandBuilder()
    .setName('password')
    .setDescription('Generates a random password privately.')
    .addIntegerOption((option) =>
      option
        .setName('length')
        .setDescription('Password length.')
        .setMinValue(8)
        .setMaxValue(64)
        .setRequired(false)
    ),
  ...globalCommunityFunCommandDefinitions.map((command) =>
    new SlashCommandBuilder()
      .setName(command.name)
      .setDescription(command.description)
  ),
  new SlashCommandBuilder()
    .setName('suggestion')
    .setDescription('[BETA] Post a suggestion to the community vote queue.')
    .addStringOption((option) =>
      option
        .setName('text')
        .setDescription('Your suggestion for the bot or server.')
        .setRequired(true)
    ),
  bugSlashCommand,
  new SlashCommandBuilder()
    .setName('notify')
    .setDescription('Subscribe to DMs for big bot feature releases.'),
  new SlashCommandBuilder()
    .setName('preview')
    .setDescription('Shows a read-only preview of upcoming bot updates.'),
  new SlashCommandBuilder()
    .setName('leak')
    .setDescription('Developer-only public teaser for upcoming bot commands.')
    .addStringOption((option) =>
      option
        .setName('feature')
        .setDescription('Feature, command, or update to tease.')
        .setMaxLength(100)
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('details')
        .setDescription('Optional public-safe hint or note.')
        .setMaxLength(500)
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('commands')
        .setDescription('Optional command names to reveal, comma-separated.')
        .setMaxLength(300)
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('style')
        .setDescription('Leak style.')
        .addChoices(
          { name: 'Teaser', value: 'teaser' },
          { name: 'Command Drop', value: 'command' },
          { name: 'Mystery', value: 'mystery' },
          { name: 'Patch Notes', value: 'patch' },
          { name: 'Coming Soon', value: 'soon' }
        )
        .setRequired(false)
    )
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('Where to post the leak. Defaults to this channel.')
        .addChannelTypes(...textChannelTypes)
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('number')
    .setDescription('Picks a random number.')
    .addIntegerOption((option) =>
      option
        .setName('max')
        .setDescription('Highest possible number.')
        .setMinValue(2)
        .setMaxValue(1000000)
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('social')
    .setDescription('Development bot social link hub manager.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('add')
        .setDescription('Add or update a social link.')
        .addStringOption((option) =>
          option
            .setName('label')
            .setDescription('Link label, like TikTok, Discord, Website, or YouTube.')
            .setMinLength(2)
            .setMaxLength(40)
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('url')
            .setDescription('The full https:// link.')
            .setMaxLength(500)
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('description')
            .setDescription('Short note shown under the link.')
            .setMaxLength(120)
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('emoji')
            .setDescription('Optional emoji shown beside the link.')
            .setMaxLength(24)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('remove')
        .setDescription('Remove a social link.')
        .addStringOption((option) =>
          option
            .setName('label')
            .setDescription('The label to remove.')
            .setMinLength(2)
            .setMaxLength(40)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('bulk')
        .setDescription('Add a pasted list of social links at once.')
        .addStringOption((option) =>
          option
            .setName('links')
            .setDescription('One per line: Label | https://link | optional note.')
            .setMaxLength(3500)
            .setRequired(true)
        )
        .addBooleanOption((option) =>
          option
            .setName('replace')
            .setDescription('Clear saved links before importing this list.')
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('list')
        .setDescription('Preview the saved social link hub privately.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('post')
        .setDescription('Post the social link hub in this channel.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('set')
        .setDescription('Set the social hub title and intro text.')
        .addStringOption((option) =>
          option
            .setName('title')
            .setDescription('Embed title.')
            .setMaxLength(80)
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('description')
            .setDescription('Embed intro text.')
            .setMaxLength(500)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('clear')
        .setDescription('Remove every saved social link.')
    ),
  new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Profile cards, bios, socials, reputation, and member introductions.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('view')
        .setDescription('Shows a polished member profile card.')
        .addUserOption(userOption('user', 'Member to view. Defaults to you.'))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('bio')
        .setDescription('Sets your profile bio.')
        .addStringOption(textOption('text', 'Your public profile bio.', { required: true, max: 300 }))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('status')
        .setDescription('Sets your short profile status.')
        .addStringOption(textOption('text', 'Short status line.', { required: true, max: 120 }))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('aboutme')
        .setDescription('Sets your longer about-me section.')
        .addStringOption(textOption('text', 'About-me text.', { required: true, max: 600 }))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('friend')
        .setDescription('Adds a friend connection.')
        .addUserOption(userOption('user', 'Member to add as a friend.', true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('unfriend')
        .setDescription('Removes a friend connection.')
        .addUserOption(userOption('user', 'Member to remove from friends.', true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('friends')
        .setDescription('Shows your friend list.')
        .addUserOption(userOption('user', 'Member whose friends to view. Defaults to you.'))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('relationship')
        .setDescription('Shows relationship and partner status.')
        .addUserOption(userOption('user', 'Member to inspect. Defaults to you.'))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('partner')
        .setDescription('Sets a profile partner.')
        .addUserOption(userOption('user', 'Partner to display on your profile.', true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('profiletheme')
        .setDescription('Sets your profile theme name.')
        .addStringOption(textOption('theme', 'Theme name, like midnight, crimson, or ocean.', { required: true, max: 40 }))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('profilebackground')
        .setDescription('Sets a profile background URL.')
        .addStringOption(textOption('url', 'Safe image URL for your profile background.', { required: true, max: 500 }))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('profilecolor')
        .setDescription('Sets your profile accent color.')
        .addStringOption(textOption('hex', 'Hex color like #ff3344.', { required: true, max: 7, min: 4 }))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('showcase')
        .setDescription('Sets a profile showcase line.')
        .addStringOption(textOption('text', 'What should your showcase say?', { required: true, max: 180 }))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('collectibles')
        .setDescription('Shows profile badges and collectibles.')
        .addUserOption(userOption('user', 'Member to view. Defaults to you.'))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('likes')
        .setDescription('Likes a member profile.')
        .addUserOption(userOption('user', 'Member to like.', true))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('thanks')
        .setDescription('Thanks a member and adds reputation.')
        .addUserOption(userOption('user', 'Member to thank.', true))
        .addStringOption(textOption('reason', 'Optional thank-you reason.', { max: 180 }))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('vouch')
        .setDescription('Vouches for a member.')
        .addUserOption(userOption('user', 'Member to vouch for.', true))
        .addStringOption(textOption('reason', 'Reason for the vouch.', { max: 180 }))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('endorse')
        .setDescription('Endorses a member skill.')
        .addUserOption(userOption('user', 'Member to endorse.', true))
        .addStringOption(textOption('skill', 'Skill or trait to endorse.', { required: true, max: 80 }))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('socials')
        .setDescription('Sets or views profile social links.')
        .addStringOption(textOption('links', 'Optional social links to save.', { max: 500 }))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('portfolio')
        .setDescription('Sets or views portfolio links.')
        .addStringOption(textOption('links', 'Optional portfolio links to save.', { max: 500 }))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('introduce')
        .setDescription('Posts a clean introduction card.')
    ),
  new SlashCommandBuilder()
    .setName('economy')
    .setDescription('XP, wallet, rewards, shop, inventory, and economy games.')
    .addSubcommandGroup((group) =>
      group
        .setName('xp')
        .setDescription('XP and level tools.')
        .addSubcommand((subcommand) =>
          subcommand
            .setName('view')
            .setDescription('Shows XP and level.')
            .addUserOption(userOption('user', 'Member to view. Defaults to you.'))
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName('leaderboard')
            .setDescription('Shows the XP leaderboard.')
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName('givexp')
            .setDescription('Admin: gives XP to a member.')
            .addUserOption(userOption('user', 'Member to update.', true))
            .addIntegerOption((option) => option.setName('amount').setDescription('XP amount.').setMinValue(1).setMaxValue(100000).setRequired(true))
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName('setlevel')
            .setDescription('Admin: sets a member level.')
            .addUserOption(userOption('user', 'Member to update.', true))
            .addIntegerOption((option) => option.setName('level').setDescription('New level.').setMinValue(0).setMaxValue(1000).setRequired(true))
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName('setxp')
            .setDescription('Admin: sets a member XP total.')
            .addUserOption(userOption('user', 'Member to update.', true))
            .addIntegerOption((option) => option.setName('xp').setDescription('New XP total.').setMinValue(0).setMaxValue(10000000).setRequired(true))
        )
    )
    .addSubcommandGroup((group) =>
      group
        .setName('wallet')
        .setDescription('Money and bank tools.')
        .addSubcommand((subcommand) => subcommand.setName('balance').setDescription('Shows wallet and bank balance.').addUserOption(userOption('user', 'Member to view. Defaults to you.')))
        .addSubcommand((subcommand) => subcommand.setName('pay').setDescription('Pays another member.').addUserOption(userOption('user', 'Member to pay.', true)).addIntegerOption((option) => option.setName('amount').setDescription('Amount to pay.').setMinValue(1).setMaxValue(1000000).setRequired(true)))
        .addSubcommand((subcommand) => subcommand.setName('deposit').setDescription('Moves coins into the bank.').addIntegerOption((option) => option.setName('amount').setDescription('Amount to deposit.').setMinValue(1).setMaxValue(1000000).setRequired(true)))
        .addSubcommand((subcommand) => subcommand.setName('withdraw').setDescription('Moves coins out of the bank.').addIntegerOption((option) => option.setName('amount').setDescription('Amount to withdraw.').setMinValue(1).setMaxValue(1000000).setRequired(true)))
    )
    .addSubcommandGroup((group) =>
      group
        .setName('earn')
        .setDescription('Rewards and risk jobs.')
        .addSubcommand((subcommand) => subcommand.setName('work').setDescription('Works for coins.'))
        .addSubcommand((subcommand) => subcommand.setName('crime').setDescription('Attempts a risky coin job.'))
        .addSubcommand((subcommand) => subcommand.setName('rob').setDescription('Attempts to rob another member.').addUserOption(userOption('user', 'Target member.', true)))
        .addSubcommand((subcommand) => subcommand.setName('dailyreward').setDescription('Claims the daily reward.'))
        .addSubcommand((subcommand) => subcommand.setName('weeklyreward').setDescription('Claims the weekly reward.'))
        .addSubcommand((subcommand) => subcommand.setName('monthlyreward').setDescription('Claims the monthly reward.'))
    )
    .addSubcommandGroup((group) =>
      group
        .setName('items')
        .setDescription('Shop and inventory tools.')
        .addSubcommand((subcommand) => subcommand.setName('shop').setDescription('Opens the economy shop.'))
        .addSubcommand((subcommand) => subcommand.setName('inventory').setDescription('Shows inventory.').addUserOption(userOption('user', 'Member to view. Defaults to you.')))
        .addSubcommand((subcommand) => subcommand.setName('use').setDescription('Uses an inventory item.').addStringOption(textOption('item', 'Item name.', { required: true, max: 60 })))
        .addSubcommand((subcommand) => subcommand.setName('sell').setDescription('Sells an inventory item.').addStringOption(textOption('item', 'Item name.', { required: true, max: 60 })))
        .addSubcommand((subcommand) => subcommand.setName('gift').setDescription('Gifts an item to another member.').addUserOption(userOption('user', 'Member to gift.', true)).addStringOption(textOption('item', 'Item name.', { required: true, max: 60 })))
        .addSubcommand((subcommand) => subcommand.setName('crate').setDescription('Opens a reward crate.'))
        .addSubcommand((subcommand) => subcommand.setName('lootbox').setDescription('Opens a mystery lootbox.'))
    )
    .addSubcommandGroup((group) =>
      group
        .setName('games')
        .setDescription('Economy games.')
        .addSubcommand((subcommand) => subcommand.setName('gamble').setDescription('Gambles coins.').addIntegerOption((option) => option.setName('amount').setDescription('Amount to risk.').setMinValue(1).setMaxValue(250000).setRequired(true)))
        .addSubcommand((subcommand) => subcommand.setName('slots').setDescription('Plays slots.').addIntegerOption((option) => option.setName('amount').setDescription('Amount to risk.').setMinValue(1).setMaxValue(250000).setRequired(true)))
        .addSubcommand((subcommand) => subcommand.setName('blackjack').setDescription('Starts a quick blackjack hand.').addIntegerOption((option) => option.setName('amount').setDescription('Amount to risk.').setMinValue(1).setMaxValue(250000).setRequired(true)))
    ),
  addSimpleSubcommands(new SlashCommandBuilder().setName('utility').setDescription('AI helpers, text tools, conversions, timers, and encoding.'), [
    ['ai', 'Asks the configured AI helper a short prompt.'],
    ['summarize', 'Summarizes text into clean bullet points.'],
    ['rewrite', 'Rewrites text in a cleaner tone.'],
    ['grammar', 'Cleans grammar and punctuation.'],
    ['paraphrase', 'Paraphrases text.'],
    ['define', 'Defines a word or phrase.'],
    ['synonym', 'Suggests synonyms.'],
    ['timezoneconvert', 'Converts a time between time zones.'],
    ['password', 'Generates a private password.'],
    ['randomnumber', 'Picks a random number.'],
    ['choose', 'Chooses between options.'],
    ['countdown', 'Creates a countdown timestamp.'],
    ['todo', 'Shows or adds a personal todo item.'],
    ['task', 'Creates a task card.'],
    ['convert', 'Converts common units.'],
    ['color', 'Shows color information.'],
    ['hex', 'Validates a hex color.'],
    ['base64', 'Encodes or decodes Base64 text.'],
    ['screenshot', 'Builds a screenshot request card.']
  ]),
  addSimpleSubcommands(new SlashCommandBuilder().setName('games').setDescription('Community games, duels, prompts, streaks, and lightweight rewards.'), [
    ['fight', 'Runs a quick fight simulation.'],
    ['duel', 'Challenges another member to a duel.'],
    ['tictactoe', 'Starts a tic-tac-toe board preview.'],
    ['connect4', 'Starts a Connect 4 board preview.'],
    ['hangman', 'Starts a hangman prompt.'],
    ['guess', 'Starts a number guessing game.'],
    ['higherlower', 'Plays higher or lower.'],
    ['truth', 'Gets a truth prompt.'],
    ['dare', 'Gets a safe dare prompt.'],
    ['fact', 'Gets a quick fact.'],
    ['cat', 'Shows a cat prompt card.'],
    ['dog', 'Shows a dog prompt card.'],
    ['pickupline', 'Gets a clean pickup line.'],
    ['ascii', 'Creates simple ASCII text.'],
    ['emojiify', 'Turns text into emoji-style text.'],
    ['captcha', 'Creates a test CAPTCHA code.'],
    ['magic8ball', 'Asks the magic 8 ball.'],
    ['mysterybox', 'Opens a mystery box.'],
    ['battle', 'Runs a battle card.'],
    ['raid', 'Starts a raid event card.'],
    ['bossfight', 'Starts a boss fight card.']
  ]),
  addSimpleSubcommands(new SlashCommandBuilder().setName('voice').setDescription('Voice analytics, moderation, temporary channels, and voice panels.'), [
    ['voiceinfo', 'Shows voice channel information.'],
    ['voicetime', 'Shows tracked voice time.'],
    ['joinvc', 'Shows voice join guidance.'],
    ['moveall', 'Moves everyone between voice channels.'],
    ['pull', 'Pulls a member into your voice channel.'],
    ['disconnectall', 'Disconnects everyone from a voice channel.'],
    ['voicekick', 'Disconnects one member.'],
    ['voiceban', 'Adds a voice restriction record.'],
    ['voiceunban', 'Removes a voice restriction record.'],
    ['voicemute', 'Server-mutes a voice member.'],
    ['voiceunmute', 'Removes server voice mute.'],
    ['tempvoice', 'Creates a temporary voice setup card.'],
    ['voicepanel', 'Opens voice management panel.'],
    ['voicelimit', 'Sets a voice channel user limit.'],
    ['voicepermit', 'Permits a user into a managed voice channel.']
  ]),
  addSimpleSubcommands(new SlashCommandBuilder().setName('media').setDescription('Media discovery, preview cards, creator links, and content dashboards.'), [
    ['image', 'Builds an image search card.'],
    ['gif', 'Builds a GIF search card.'],
    ['wallpaper', 'Builds a wallpaper prompt card.'],
    ['thumbnail', 'Creates a thumbnail preview card.'],
    ['spotifyprofile', 'Creates a Spotify profile card.'],
    ['songshare', 'Creates a song share card.'],
    ['album', 'Creates an album card.'],
    ['artist', 'Creates an artist card.'],
    ['stream', 'Creates a stream promo card.'],
    ['clip', 'Creates a clip share card.'],
    ['podcast', 'Creates a podcast card.'],
    ['news', 'Creates a news topic card.'],
    ['reddit', 'Creates a Reddit topic card.'],
    ['steam', 'Creates a Steam game card.'],
    ['epicgames', 'Creates an Epic Games card.'],
    ['minecraft', 'Creates a Minecraft server card.'],
    ['roblox', 'Creates a Roblox profile/game card.']
  ]),
  addSimpleSubcommands(new SlashCommandBuilder().setName('security').setDescription('Anti-raid, anti-nuke, risk checks, quarantine, and recovery tools.'), [
    ['antinuke', 'Shows anti-nuke status and recommendations.'],
    ['antiraid', 'Shows anti-raid status and recommendations.'],
    ['panic', 'Enables emergency protection mode.'],
    ['panicoff', 'Disables emergency protection mode.'],
    ['suspicious', 'Reviews suspicious members.'],
    ['alts', 'Shows alt-detection guidance.'],
    ['joinhistory', 'Shows recent join risk summary.'],
    ['risk', 'Scores a member risk level.'],
    ['securityscan', 'Scans server safety posture.'],
    ['raidmode', 'Toggles raid-mode guidance.'],
    ['verificationcheck', 'Checks verification safety.'],
    ['captcha-force', 'Forces verification review guidance.'],
    ['bypass', 'Shows bypass roles/users.'],
    ['whitelist', 'Shows whitelist controls.'],
    ['blacklist', 'Shows blacklist controls.']
  ]),
  addSimpleSubcommands(new SlashCommandBuilder().setName('staff').setDescription('Staff reports, appeals, anonymous messages, and queue dashboards.'), [
    ['echo', 'Repeats a staff message safely.'],
    ['staffsay', 'Sends a staff announcement card.'],
    ['anonymous', 'Creates an anonymous staff note.'],
    ['staffpoll', 'Creates a staff-only poll card.'],
    ['staffping', 'Builds a staff ping card.'],
    ['report', 'Submits a member report.'],
    ['reports', 'Shows report queue.'],
    ['resolve', 'Resolves a report.'],
    ['escalate', 'Escalates a report.'],
    ['appeals', 'Shows appeal queue.'],
    ['appealaccept', 'Accepts an appeal record.'],
    ['appealdeny', 'Denies an appeal record.']
  ]),
  addSimpleSubcommands(new SlashCommandBuilder().setName('serveradmin').setDescription('Server backups, templates, sync tools, cleanup, and automation controls.'), [
    ['serverbackup', 'Creates a backup summary.'],
    ['serverclone', 'Creates a clone plan.'],
    ['templates', 'Shows server templates.'],
    ['autorename', 'Shows autorename rules.'],
    ['autothreads', 'Shows autothread rules.'],
    ['autoslowmode', 'Shows autoslowmode settings.'],
    ['autodelete', 'Shows autodelete settings.'],
    ['cleanup', 'Builds a cleanup plan.'],
    ['mirror', 'Shows mirror channel plan.'],
    ['syncroles', 'Shows role sync plan.'],
    ['syncchannels', 'Shows channel sync plan.'],
    ['permissionsync', 'Shows permission sync plan.'],
    ['categorysync', 'Shows category sync plan.']
  ]),
  addSimpleSubcommands(new SlashCommandBuilder().setName('automation').setDescription('Triggers, autoresponders, scheduled posts, and automation builder.'), [
    ['autoresponder', 'Shows autoresponder controls.'],
    ['trigger', 'Creates a trigger card.'],
    ['keyword', 'Creates a keyword rule card.'],
    ['reactiontrigger', 'Creates a reaction trigger card.'],
    ['automessage', 'Creates an automated message card.'],
    ['schedule', 'Creates a schedule card.'],
    ['scheduler', 'Shows scheduler dashboard.'],
    ['autopublish', 'Shows autopublish controls.'],
    ['autoarchive', 'Shows autoarchive controls.'],
    ['autopost', 'Shows autopost controls.']
  ]),
  addSimpleSubcommands(new SlashCommandBuilder().setName('analytics').setDescription('Audit, growth, activity, retention, engagement, and mod analytics.'), [
    ['audit', 'Shows audit summary.'],
    ['analytics', 'Shows server analytics overview.'],
    ['growth', 'Shows growth summary.'],
    ['activity', 'Shows activity summary.'],
    ['retention', 'Shows retention guidance.'],
    ['engagement', 'Shows engagement score.'],
    ['invitelogs', 'Shows invite log summary.'],
    ['messagelogs', 'Shows message log summary.'],
    ['voicelogs', 'Shows voice log summary.'],
    ['memberlogs', 'Shows member log summary.'],
    ['modanalytics', 'Shows moderation analytics.']
  ]),
  addSimpleSubcommands(new SlashCommandBuilder().setName('rolesystem').setDescription('Role panels, autorank, temporary roles, permissions, and role automation.'), [
    ['rolemenu', 'Shows role menu builder.'],
    ['rolepanel', 'Shows role panel builder.'],
    ['autorank', 'Shows autorank settings.'],
    ['roleupgrade', 'Shows role upgrade path.'],
    ['roledowngrade', 'Shows role downgrade path.'],
    ['temporaryrole', 'Creates a temporary role plan.'],
    ['persistroles', 'Shows persistent role settings.'],
    ['roleconnections', 'Shows role connection settings.'],
    ['rolepermissions', 'Shows role permission preview.'],
    ['roleicon', 'Shows role icon guidance.']
  ]),
  new SlashCommandBuilder()
    .setName('dashboard')
    .setDescription('Opens the main community-first bot control center.'),
  new SlashCommandBuilder()
    .setName('config')
    .setDescription('Opens the dashboard configuration hub.'),
  new SlashCommandBuilder()
    .setName('counter')
    .setDescription('Dynamic voice-channel server stat counters.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('create')
        .setDescription('Creates a dynamic voice counter.')
        .addStringOption((option) =>
          option
            .setName('type')
            .setDescription('Statistic to show.')
            .setRequired(true)
            .addChoices(...counterTypeChoices())
        )
        .addStringOption(textOption('label', 'Custom label text.', { required: false, max: 60 }))
        .addStringOption(textOption('emoji', 'Custom emoji or symbol.', { required: false, max: 40 }))
        .addStringOption((option) =>
          option
            .setName('style')
            .setDescription('Counter display style.')
            .setRequired(false)
            .addChoices(...counterStyleChoices())
        )
        .addChannelOption((option) =>
          option
            .setName('category')
            .setDescription('Category to place the counter in.')
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(false)
        )
        .addBooleanOption((option) =>
          option
            .setName('hidden')
            .setDescription('Hide this counter from @everyone.')
            .setRequired(false)
        )
        .addIntegerOption((option) =>
          option
            .setName('interval')
            .setDescription('Refresh interval in minutes. Minimum 5.')
            .setMinValue(5)
            .setMaxValue(1440)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('edit')
        .setDescription('Edits a dynamic counter.')
        .addStringOption(textOption('id', 'Counter ID from /counter list.', { required: true, max: 40 }))
        .addStringOption(textOption('label', 'New label text.', { required: false, max: 60 }))
        .addStringOption(textOption('emoji', 'New emoji or symbol.', { required: false, max: 40 }))
        .addStringOption((option) =>
          option
            .setName('style')
            .setDescription('Counter display style.')
            .setRequired(false)
            .addChoices(...counterStyleChoices())
        )
        .addChannelOption((option) =>
          option
            .setName('category')
            .setDescription('Move the counter to this category.')
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(false)
        )
        .addBooleanOption((option) =>
          option
            .setName('hidden')
            .setDescription('Hide this counter from @everyone.')
            .setRequired(false)
        )
        .addIntegerOption((option) =>
          option
            .setName('interval')
            .setDescription('Refresh interval in minutes. Minimum 5.')
            .setMinValue(5)
            .setMaxValue(1440)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('delete')
        .setDescription('Deletes a counter channel and config.')
        .addStringOption(textOption('id', 'Counter ID from /counter list.', { required: true, max: 40 }))
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('list')
        .setDescription('Lists configured dynamic counters.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('refresh')
        .setDescription('Repairs and refreshes all counter channels now.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('category')
        .setDescription('Creates or updates the default counter category.')
        .addStringOption(textOption('name', 'Category name.', { required: false, max: 80 }))
        .addBooleanOption((option) =>
          option
            .setName('hidden')
            .setDescription('Hide counters in this category from @everyone by default.')
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('template')
        .setDescription('Installs a one-click counter template.')
        .addStringOption((option) =>
          option
            .setName('template')
            .setDescription('Template to install.')
            .setRequired(true)
            .addChoices(...counterTemplateChoices())
        )
        .addChannelOption((option) =>
          option
            .setName('category')
            .setDescription('Category to place counters in.')
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('preview')
        .setDescription('Previews a counter name without creating it.')
        .addStringOption((option) =>
          option
            .setName('type')
            .setDescription('Statistic to preview.')
            .setRequired(true)
            .addChoices(...counterTypeChoices())
        )
        .addStringOption(textOption('label', 'Custom label text.', { required: false, max: 60 }))
        .addStringOption(textOption('emoji', 'Custom emoji or symbol.', { required: false, max: 40 }))
        .addStringOption((option) =>
          option
            .setName('style')
            .setDescription('Counter display style.')
            .setRequired(false)
            .addChoices(...counterStyleChoices())
        )
    ),
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Opens the dashboard setup hub.'),
  new SlashCommandBuilder()
    .setName('permissions')
    .setDescription('Checks the bot permissions in a channel.')
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('Channel to check. Defaults to this channel.')
        .addChannelTypes(...textChannelTypes)
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('modstats')
    .setDescription('Shows moderation and setup stats for this server.'),
  new SlashCommandBuilder()
    .setName('moderation')
    .setDescription('Clean moderation hub for warnings, notes, and member history.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('warn')
        .setDescription('Adds a lightweight warning to a member.')
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('The member to warn.')
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('reason')
            .setDescription('Short reason shown to staff.')
            .setMaxLength(500)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('warnings')
        .setDescription('Shows stored warnings for a member.')
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('The member to review.')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('clear')
        .setDescription('Clears one warning or all warnings for a member.')
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('The member to update.')
            .setRequired(true)
        )
        .addIntegerOption((option) =>
          option
            .setName('case')
            .setDescription('Optional warning number to remove.')
            .setMinValue(1)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('history')
        .setDescription('Shows a compact member moderation history.')
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('The member to review.')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('case')
        .setDescription('Shows one warning entry for a member.')
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('The member to review.')
            .setRequired(true)
        )
        .addIntegerOption((option) =>
          option
            .setName('number')
            .setDescription('Warning number.')
            .setMinValue(1)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('note-add')
        .setDescription('Adds a private note for staff.')
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('The member to note.')
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('note')
            .setDescription('Private staff note.')
            .setMaxLength(500)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('notes')
        .setDescription('Lists private staff notes for a member.')
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('The member to review.')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('note-remove')
        .setDescription('Removes one private staff note.')
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('The member to update.')
            .setRequired(true)
        )
        .addIntegerOption((option) =>
          option
            .setName('number')
            .setDescription('Note number to remove.')
            .setMinValue(1)
            .setRequired(true)
        )
    ),
  new SlashCommandBuilder()
    .setName('case')
    .setDescription('Private staff case channels for investigations and reports.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('create')
        .setDescription('Creates a private moderation case channel.')
        .addStringOption((option) =>
          option
            .setName('title')
            .setDescription('Short case title.')
            .setMaxLength(80)
            .setRequired(true)
        )
        .addUserOption((option) =>
          option
            .setName('member')
            .setDescription('Optional member connected to the case.')
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('reason')
            .setDescription('Private context for staff.')
            .setMaxLength(500)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('close')
        .setDescription('Archives or closes the current/private case.')
        .addStringOption((option) =>
          option
            .setName('case_id')
            .setDescription('Case ID. Defaults to the current case channel.')
            .setMaxLength(32)
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('reason')
            .setDescription('Close reason.')
            .setMaxLength(500)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('add')
        .setDescription('Adds a staff member to a private case.')
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('Staff member to add.')
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('case_id')
            .setDescription('Case ID. Defaults to the current case channel.')
            .setMaxLength(32)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('remove')
        .setDescription('Removes a staff member from a private case.')
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('Staff member to remove.')
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('case_id')
            .setDescription('Case ID. Defaults to the current case channel.')
            .setMaxLength(32)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('status')
        .setDescription('Shows private case-system status.')
    ),
  new SlashCommandBuilder()
    .setName('verification')
    .setDescription('Sets up a verify button that gives a configured role.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('setup')
        .setDescription('Posts a verification embed with a role button.')
        .addRoleOption((option) =>
          option
            .setName('role')
            .setDescription('Role members receive after clicking Verify.')
            .setRequired(true)
        )
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Channel where the verify embed should be posted.')
            .addChannelTypes(...textChannelTypes)
            .setRequired(true)
        )
    ),
  new SlashCommandBuilder()
    .setName('reactionrole')
    .setDescription('Manages reaction role panels.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('setup')
        .setDescription('Creates a reaction role panel with the first role.')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Channel where the reaction role panel should be posted.')
            .addChannelTypes(...textChannelTypes)
            .setRequired(true)
        )
        .addRoleOption((option) =>
          option
            .setName('role')
            .setDescription('Role members receive when they react.')
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('emoji')
            .setDescription('Emoji members react with. Unicode or custom emoji mention.')
            .setMaxLength(80)
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('title')
            .setDescription('Panel title.')
            .setMaxLength(100)
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('description')
            .setDescription('Panel description.')
            .setMaxLength(1500)
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('mode')
            .setDescription('Whether members can have many roles or one from this panel.')
            .addChoices(
              { name: 'Toggle many roles', value: 'toggle' },
              { name: 'Unique one role', value: 'unique' }
            )
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('label')
            .setDescription('Optional display label for this role.')
            .setMaxLength(80)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('add')
        .setDescription('Adds or updates a role on an existing reaction role panel.')
        .addStringOption((option) =>
          option
            .setName('message_id')
            .setDescription('Reaction role panel message ID.')
            .setMinLength(17)
            .setMaxLength(20)
            .setRequired(true)
        )
        .addRoleOption((option) =>
          option
            .setName('role')
            .setDescription('Role members receive when they react.')
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('emoji')
            .setDescription('Emoji members react with. Unicode or custom emoji mention.')
            .setMaxLength(80)
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('label')
            .setDescription('Optional display label for this role.')
            .setMaxLength(80)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('remove')
        .setDescription('Removes one emoji/role mapping from a panel.')
        .addStringOption((option) =>
          option
            .setName('message_id')
            .setDescription('Reaction role panel message ID.')
            .setMinLength(17)
            .setMaxLength(20)
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('emoji')
            .setDescription('Emoji mapping to remove.')
            .setMaxLength(80)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('list')
        .setDescription('Shows reaction role panels for this server.')
        .addStringOption((option) =>
          option
            .setName('message_id')
            .setDescription('Optional panel message ID to inspect.')
            .setMinLength(17)
            .setMaxLength(20)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('clear')
        .setDescription('Deletes a reaction role panel from bot tracking.')
        .addStringOption((option) =>
          option
            .setName('message_id')
            .setDescription('Reaction role panel message ID.')
            .setMinLength(17)
            .setMaxLength(20)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('refresh')
        .setDescription('Refreshes a panel embed and its configured reactions.')
        .addStringOption((option) =>
          option
            .setName('message_id')
            .setDescription('Reaction role panel message ID.')
            .setMinLength(17)
            .setMaxLength(20)
            .setRequired(true)
        )
    ),
  new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('Sets up the member welcome embed.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('setup')
        .setDescription('Enables welcome embeds in a channel.')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Channel where welcome embeds should be sent.')
            .addChannelTypes(...textChannelTypes)
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('message')
            .setDescription('Optional message. Supports {user}, {server}, {count}, and {tag}.')
            .setMaxLength(500)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('status')
        .setDescription('Shows the current welcome setup.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('test')
        .setDescription('Sends a welcome preview using you as the member.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('disable')
        .setDescription('Disables welcome embeds.')
    ),
  new SlashCommandBuilder()
    .setName('setlogchannel')
    .setDescription('Sets the channel where bot logs are sent.')
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('The channel to use for bot logs.')
        .addChannelTypes(...textChannelTypes)
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('logtest')
    .setDescription('Sends a test message to the configured log channel.'),
  new SlashCommandBuilder()
    .setName('sticky')
    .setDescription('Manages sticky messages.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('add')
        .setDescription('Adds or updates a sticky message in a channel.')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('The channel where the sticky message should live.')
            .addChannelTypes(...textChannelTypes)
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('message')
            .setDescription('The sticky message text.')
            .setMaxLength(1800)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('remove')
        .setDescription('Removes a sticky message from a channel.')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('The channel to remove the sticky message from.')
            .addChannelTypes(...textChannelTypes)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('status')
        .setDescription('Shows sticky message setup for this server.')
    ),
  new SlashCommandBuilder()
    .setName('twitch')
    .setDescription('Manages Twitch live alerts.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('set')
        .setDescription('Replaces Twitch alerts with one primary streamer.')
        .addStringOption((option) =>
          option
            .setName('channel')
            .setDescription('The Twitch username or twitch.tv URL to watch.')
            .setRequired(true)
        )
        .addChannelOption((option) =>
          option
            .setName('announce_channel')
            .setDescription('Where live alerts should be posted.')
            .addChannelTypes(...textChannelTypes)
            .setRequired(true)
        )
        .addRoleOption((option) =>
          option
            .setName('mention_role')
            .setDescription('Optional role to mention when the streamer goes live.')
            .setRequired(false)
        )
        .addBooleanOption((option) =>
          option
            .setName('everyone')
            .setDescription('Ping @everyone when the streamer goes live. Ignored if a role is selected.')
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('message')
            .setDescription('Custom text. Supports {streamer}, {title}, {game}, {viewers}, {started}, and {url}.')
            .setMaxLength(300)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('add')
        .setDescription('Adds or updates a Twitch streamer without removing others.')
        .addStringOption((option) =>
          option
            .setName('channel')
            .setDescription('The Twitch username or twitch.tv URL to watch.')
            .setRequired(true)
        )
        .addChannelOption((option) =>
          option
            .setName('announce_channel')
            .setDescription('Where live alerts should be posted.')
            .addChannelTypes(...textChannelTypes)
            .setRequired(true)
        )
        .addRoleOption((option) =>
          option
            .setName('mention_role')
            .setDescription('Optional role to mention when the streamer goes live.')
            .setRequired(false)
        )
        .addBooleanOption((option) =>
          option
            .setName('everyone')
            .setDescription('Ping @everyone when the streamer goes live. Ignored if a role is selected.')
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('message')
            .setDescription('Custom text. Supports {streamer}, {title}, {game}, {viewers}, {started}, and {url}.')
            .setMaxLength(300)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('status')
        .setDescription('Shows the current Twitch alert setup.')
        .addStringOption((option) =>
          option
            .setName('streamer')
            .setDescription('Optional streamer to inspect.')
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('check')
        .setDescription('Checks Twitch immediately.')
        .addStringOption((option) =>
          option
            .setName('streamer')
            .setDescription('Optional streamer to check.')
            .setRequired(false)
        )
        .addBooleanOption((option) =>
          option
            .setName('announce')
            .setDescription('Post an alert if the streamer is live and not already announced.')
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('preview')
        .setDescription('Previews the Twitch alert message without pinging anyone.')
        .addStringOption((option) =>
          option
            .setName('event')
            .setDescription('Preview the live-start alert or stream-ended VOD alert.')
            .addChoices(
              { name: 'Live start', value: 'live' },
              { name: 'Stream ended', value: 'end' }
            )
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('streamer')
            .setDescription('Optional streamer to preview.')
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('reset')
        .setDescription('Forgets the last Twitch alert so the next live stream can announce again.')
        .addStringOption((option) =>
          option
            .setName('streamer')
            .setDescription('Optional streamer to reset.')
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('remove')
        .setDescription('Disables Twitch live alerts.')
        .addStringOption((option) =>
          option
            .setName('streamer')
            .setDescription('Optional streamer to remove. Leave blank to remove all.')
            .setRequired(false)
        )
    ),
  new SlashCommandBuilder()
    .setName('youtube')
    .setDescription('Manages YouTube upload alerts.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('set')
        .setDescription('Enables YouTube upload alerts for one channel.')
        .addStringOption((option) =>
          option
            .setName('channel')
            .setDescription('The YouTube channel ID, /channel URL, or @handle to watch.')
            .setRequired(true)
        )
        .addChannelOption((option) =>
          option
            .setName('announce_channel')
            .setDescription('Where upload alerts should be posted.')
            .addChannelTypes(...textChannelTypes)
            .setRequired(true)
        )
        .addRoleOption((option) =>
          option
            .setName('mention_role')
            .setDescription('Optional role to mention when a new video posts.')
            .setRequired(false)
        )
        .addBooleanOption((option) =>
          option
            .setName('everyone')
            .setDescription('Ping @everyone for new videos. Ignored if a role is selected.')
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('message')
            .setDescription('Custom text. Supports {channel}, {title}, {published}, and {url}.')
            .setMaxLength(300)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('status')
        .setDescription('Shows the current YouTube alert setup.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('check')
        .setDescription('Checks YouTube immediately.')
        .addBooleanOption((option) =>
          option
            .setName('announce')
            .setDescription('Post an alert if the latest video was not already announced.')
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('preview')
        .setDescription('Previews the YouTube upload alert without pinging anyone.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('reset')
        .setDescription('Forgets the last YouTube video so the latest upload can announce again.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('remove')
        .setDescription('Disables YouTube upload alerts.')
    ),
  new SlashCommandBuilder()
    .setName('tiktok')
    .setDescription('Manages TikTok new post alerts.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('set')
        .setDescription('Enables TikTok post alerts for one creator.')
        .addStringOption((option) =>
          option
            .setName('creator')
            .setDescription('The TikTok @username or profile URL to watch.')
            .setRequired(true)
        )
        .addChannelOption((option) =>
          option
            .setName('announce_channel')
            .setDescription('Where TikTok alerts should be posted.')
            .addChannelTypes(...textChannelTypes)
            .setRequired(true)
        )
        .addRoleOption((option) =>
          option
            .setName('mention_role')
            .setDescription('Optional role to mention when a new TikTok posts.')
            .setRequired(false)
        )
        .addBooleanOption((option) =>
          option
            .setName('everyone')
            .setDescription('Ping @everyone for new TikToks. Ignored if a role is selected.')
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('message')
            .setDescription('Custom text. Supports {creator}, {title}, {posted}, and {url}.')
            .setMaxLength(300)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('status')
        .setDescription('Shows the current TikTok alert setup.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('check')
        .setDescription('Checks TikTok immediately.')
        .addBooleanOption((option) =>
          option
            .setName('announce')
            .setDescription('Post an alert if the latest TikTok was not already announced.')
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('preview')
        .setDescription('Previews the TikTok alert without pinging anyone.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('reset')
        .setDescription('Forgets the last TikTok so the latest post can announce again.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('remove')
        .setDescription('Disables TikTok post alerts.')
    ),
  new SlashCommandBuilder()
    .setName('lockdown')
    .setDescription('Locks one visible channel so members cannot send messages.')
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('The channel to lock.')
        .addChannelTypes(...textChannelTypes)
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('unlockdown')
    .setDescription('Unlocks one channel.')
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('The channel to unlock.')
        .addChannelTypes(...textChannelTypes)
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('lockdownserver')
    .setDescription('Locks every community-visible text channel and posts an embed.'),
  new SlashCommandBuilder()
    .setName('unlockdownserver')
    .setDescription('Unlocks visible text channels and removes lockdown embeds.'),
  new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Deletes recent messages from this channel.')
    .addIntegerOption((option) =>
      option
        .setName('amount')
        .setDescription('How many messages to delete.')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('say')
    .setDescription('Sends a message as the bot.')
    .addStringOption((option) =>
      option
        .setName('message')
        .setDescription('The message for the bot to send.')
        .setMaxLength(1900)
        .setRequired(true)
    )
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('Optional channel. Defaults to this channel.')
        .addChannelTypes(...textChannelTypes)
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('clean')
    .setDescription('Deletes recent messages from one member in this channel.')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('Whose messages should be cleaned.')
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName('amount')
        .setDescription('How many recent messages to scan.')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('softban')
    .setDescription('Bans then unbans a member to clear recent messages.')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The member to softban.')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('reason')
        .setDescription('Why this member is being softbanned.')
        .setMaxLength(500)
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('banid')
    .setDescription('Bans a user by Discord ID, even if they are not in the server.')
    .addStringOption((option) =>
      option
        .setName('user_id')
        .setDescription('Discord user ID to ban.')
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName('delete_days')
        .setDescription('Days of messages to delete, 0-7.')
        .setMinValue(0)
        .setMaxValue(7)
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('reason')
        .setDescription('Why this user is being banned.')
        .setMaxLength(500)
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('massban')
    .setDescription('Bans up to 25 user IDs at once.')
    .addStringOption((option) =>
      option
        .setName('user_ids')
        .setDescription('User IDs or mentions separated by spaces, commas, or lines.')
        .setMaxLength(1000)
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName('delete_days')
        .setDescription('Days of messages to delete, 0-7.')
        .setMinValue(0)
        .setMaxValue(7)
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('reason')
        .setDescription('Why these users are being banned.')
        .setMaxLength(500)
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('tempban')
    .setDescription('Temporarily bans a member, then auto-unbans later.')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The member to tempban.')
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName('hours')
        .setDescription('Ban duration in hours.')
        .setMinValue(1)
        .setMaxValue(720)
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName('delete_days')
        .setDescription('Days of messages to delete, 0-7.')
        .setMinValue(0)
        .setMaxValue(7)
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('reason')
        .setDescription('Why this member is being tempbanned.')
        .setMaxLength(500)
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('tempbans')
    .setDescription('Shows active temporary bans for this server.'),
  new SlashCommandBuilder()
    .setName('lockdownrole')
    .setDescription('Sets which role lockdown commands should restrict.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('set')
        .setDescription('Uses a specific role for lockdown permissions.')
        .addRoleOption((option) =>
          option
            .setName('role')
            .setDescription('Role that lockdown should restrict.')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('reset')
        .setDescription('Resets lockdown to target @everyone.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('status')
        .setDescription('Shows the current lockdown target role.')
    ),
  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kicks a member from the server.')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The member to kick.')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('reason')
        .setDescription('Why this member is being kicked.')
        .setMaxLength(500)
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Bans a member from the server.')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The member to ban.')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('reason')
        .setDescription('Why this member is being banned.')
        .setMaxLength(500)
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unbans a user by ID.')
    .addStringOption((option) =>
      option
        .setName('user_id')
        .setDescription('The Discord user ID to unban.')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('reason')
        .setDescription('Why this user is being unbanned.')
        .setMaxLength(500)
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Temporarily times out a member.')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The member to timeout.')
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName('minutes')
        .setDescription('Timeout length in minutes.')
        .setMinValue(1)
        .setMaxValue(40320)
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('reason')
        .setDescription('Why this member is being timed out.')
        .setMaxLength(500)
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Removes a member timeout.')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The member to unmute.')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('reason')
        .setDescription('Why this member is being unmuted.')
        .setMaxLength(500)
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Sets channel slowmode.')
    .addIntegerOption((option) =>
      option
        .setName('seconds')
        .setDescription('Slowmode seconds. Use 0 to disable.')
        .setMinValue(0)
        .setMaxValue(21600)
        .setRequired(true)
    )
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('Optional channel. Defaults to this channel.')
        .addChannelTypes(...textChannelTypes)
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('nick')
    .setDescription('Changes or resets a member nickname.')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The member to update.')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('nickname')
        .setDescription('New nickname. Leave blank to reset.')
        .setMaxLength(32)
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('role')
    .setDescription('Adds or removes a role from a member.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('add')
        .setDescription('Adds a role to a member.')
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('The member to update.')
            .setRequired(true)
        )
        .addRoleOption((option) =>
          option
            .setName('role')
            .setDescription('The role to add.')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('remove')
        .setDescription('Removes a role from a member.')
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('The member to update.')
            .setRequired(true)
        )
        .addRoleOption((option) =>
          option
            .setName('role')
            .setDescription('The role to remove.')
            .setRequired(true)
        )
    ),
  new SlashCommandBuilder()
    .setName('dev')
    .setDescription('Private developer utilities.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('runtime')
        .setDescription('Shows runtime stats.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('servers')
        .setDescription('Lists servers this bot is in.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('health')
        .setDescription('Shows provider, config, and runtime health.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('commandaudit')
        .setDescription('Shows command registration and cleanup status.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('announceupdate')
        .setDescription('DMs update subscribers with the current release notes.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('bonk')
        .setDescription('Runs a harmless bonk gag.')
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('The user to bonk.')
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('reason')
            .setDescription('Optional reason.')
            .setMaxLength(200)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('fakeban')
        .setDescription('Posts a clearly fake ban gag.')
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('The target.')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('vibecheck')
        .setDescription('Runs a fake vibe check.')
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('The target. Defaults to you.')
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('reverse')
        .setDescription('Reverses text.')
        .addStringOption((option) =>
          option
            .setName('text')
            .setDescription('Text to reverse.')
            .setMaxLength(400)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('vaporwave')
        .setDescription('Turns text into wide text.')
        .addStringOption((option) =>
          option
            .setName('text')
            .setDescription('Text to convert.')
            .setMaxLength(120)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('panic')
        .setDescription('Posts a fake emergency sequence that resolves itself.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('renamebot')
        .setDescription('Changes this bot nickname in the current server.')
        .addStringOption((option) =>
          option
            .setName('nickname')
            .setDescription('New bot nickname.')
            .setMinLength(2)
            .setMaxLength(32)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('botrole')
        .setDescription('Syncs the Discord-managed bot role without creating a duplicate.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('presence')
        .setDescription('Sets the bot presence text.')
        .addStringOption((option) =>
          option
            .setName('text')
            .setDescription('New presence text.')
            .setMaxLength(80)
            .setRequired(true)
        )
    )
]
  .filter((command) => !removedSlashCommandNames.has(command.name))
  .filter((command) => !collapsedSlashCommandNames.has(command.name))
  .map((command) => polishCommandJson(command.toJSON()));

export const guildSpecificCommands = [
  {
    guildId: '1405063177124970516',
    command: new SlashCommandBuilder()
      .setName('bmas')
      .setDescription('Summons Bmas with the server joke ping.')
      .toJSON()
  },
  {
    guildId: '1405063177124970516',
    command: new SlashCommandBuilder()
      .setName('mascoin')
      .setDescription('Flips the official Mas coin.')
      .toJSON()
  },
  {
    guildId: '1405063177124970516',
    command: new SlashCommandBuilder()
      .setName('masfortune')
      .setDescription('Drops a certified Mas fortune.')
      .toJSON()
  },
  {
    guildId: '1405063177124970516',
    command: new SlashCommandBuilder()
      .setName('mashype')
      .setDescription('Runs a Mas hype check.')
      .toJSON()
  },
  {
    guildId: '1405063177124970516',
    command: new SlashCommandBuilder()
      .setName('mslate')
      .setDescription('Pings the stream reminder target.')
      .toJSON()
  },
  {
    guildId: '1405063177124970516',
    command: new SlashCommandBuilder()
      .setName('faulty')
      .setDescription('Sends the Faulty appreciation ping.')
      .toJSON()
  },
  {
    guildId: '1340204978341675019',
    command: new SlashCommandBuilder()
      .setName('timmysudo')
      .setDescription('Drops the official TimmySudo go-live reminder.')
      .toJSON()
  },
  {
    guildId: '1340204978341675019',
    command: new SlashCommandBuilder()
      .setName('timmy')
      .setDescription('Runs the Timmy go-live check.')
      .toJSON()
  }
];

export function guildSpecificCommandsForGuild(guildId) {
  return guildSpecificCommands
    .filter((entry) => entry.guildId === String(guildId))
    .map((entry) => entry.command);
}
