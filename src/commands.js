import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

const textChannelTypes = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

export const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Shows bot latency.'),
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Shows the community command list.'),
  new SlashCommandBuilder()
    .setName('commands')
    .setDescription('Shows the community command list.'),
  new SlashCommandBuilder()
    .setName('admincommands')
    .setDescription('Shows staff/admin commands.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName('devcommands')
    .setDescription('Shows private developer commands.'),
  new SlashCommandBuilder()
    .setName('devdashboard')
    .setDescription('Opens the private developer control dashboard.'),
  new SlashCommandBuilder()
    .setName('join')
    .setDescription('Starts beta chat reply mode in this channel.'),
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
    .setName('dashboard')
    .setDescription('Shows the server dashboard.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName('setlogchannel')
    .setDescription('Sets the channel where bot logs are sent.')
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('The channel to use for bot logs.')
        .addChannelTypes(...textChannelTypes)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName('logtest')
    .setDescription('Sends a test message to the configured log channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
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
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder()
    .setName('twitch')
    .setDescription('Manages Twitch live alerts.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('set')
        .setDescription('Sets the Twitch channel and Discord announcement channel.')
        .addStringOption((option) =>
          option
            .setName('channel')
            .setDescription('The Twitch username to watch.')
            .setRequired(true)
        )
        .addChannelOption((option) =>
          option
            .setName('announce_channel')
            .setDescription('Where live alerts should be posted.')
            .addChannelTypes(...textChannelTypes)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('status')
        .setDescription('Shows the current Twitch alert setup.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('check')
        .setDescription('Checks Twitch immediately.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('remove')
        .setDescription('Disables Twitch live alerts.')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName('lockdown')
    .setDescription('Locks one channel so members cannot send messages.')
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('The channel to lock.')
        .addChannelTypes(...textChannelTypes)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder()
    .setName('unlockdown')
    .setDescription('Unlocks one channel.')
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('The channel to unlock.')
        .addChannelTypes(...textChannelTypes)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder()
    .setName('lockdownserver')
    .setDescription('Locks down every text channel and posts a lockdown embed.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder()
    .setName('unlockdownserver')
    .setDescription('Unlocks every text channel and posts an unlock embed.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
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
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
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
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warns a member and stores it in this server.')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The member to warn.')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('reason')
        .setDescription('Why this member is being warned.')
        .setMaxLength(500)
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('Shows warnings for a member.')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The member to inspect.')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder()
    .setName('clearwarns')
    .setDescription('Clears all warnings or one warning for a member.')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The member whose warnings should be cleared.')
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName('case')
        .setDescription('Optional warning number to remove.')
        .setMinValue(1)
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
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
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
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
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
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
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
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
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Alias for timeout.')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The member to mute.')
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName('minutes')
        .setDescription('Mute length in minutes.')
        .setMinValue(1)
        .setMaxValue(40320)
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('reason')
        .setDescription('Why this member is being muted.')
        .setMaxLength(500)
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
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
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
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
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
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
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames),
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
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
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
        .setName('say')
        .setDescription('Sends a developer message.')
        .addStringOption((option) =>
          option
            .setName('message')
            .setDescription('The message to send.')
            .setMaxLength(1900)
            .setRequired(true)
        )
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Optional channel. Defaults to this channel.')
            .addChannelTypes(...textChannelTypes)
            .setRequired(false)
        )
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
].map((command) => command.toJSON());
