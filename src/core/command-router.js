export const slashCommandAliases = Object.freeze({
  help: 'commands',
  lockdownsever: 'lockdownserver',
  mute: 'timeout'
});

export const prefixCommandAliases = Object.freeze({
  '8ball': 'magic8ball',
  help: 'commands',
  lockdownsever: 'lockdownserver',
  mute: 'timeout',
  tt: 'tiktok',
  wyr: 'wouldyourather',
  yt: 'youtube'
});

export const groupedSlashCommandRoutes = deepFreeze({
  info: {
    server: 'serverinfo',
    user: 'userinfo',
    avatar: 'avatar',
    uptime: 'uptime',
    membercount: 'membercount',
    servericon: 'servericon',
    serverbanner: 'serverbanner',
    invite: 'invite',
    bot: 'botinfo',
    role: 'roleinfo',
    channel: 'channelinfo',
    password: 'password'
  },
  fun: {
    coinflip: 'coinflip',
    roll: 'roll',
    magic8ball: 'magic8ball',
    poll: 'poll',
    choose: 'choose',
    rate: 'rate',
    ship: 'ship',
    rps: 'rps',
    compliment: 'compliment',
    truth: 'truth',
    dare: 'dare',
    wouldyourather: 'wouldyourather',
    joke: 'joke',
    fact: 'fact',
    achievement: 'achievement',
    topic: 'topic',
    quote: 'quote',
    number: 'number'
  }
});

export const groupedPrefixCommandRoutes = deepFreeze({
  info: {
    ...groupedSlashCommandRoutes.info,
    serverinfo: 'serverinfo',
    userinfo: 'userinfo',
    botinfo: 'botinfo',
    roleinfo: 'roleinfo',
    channelinfo: 'channelinfo'
  },
  fun: {
    ...groupedSlashCommandRoutes.fun,
    '8ball': 'magic8ball',
    wyr: 'wouldyourather'
  }
});

export const featureControlCommandNames = new Set(['feature', 'featuredisable']);

export function buildCommandRouting({
  commands = [],
  guildSpecificCommands = [],
  extraPrefixCommandNames = ['help', 'protection']
} = {}) {
  const groupedSlashCommandNames = new Set(Object.values(groupedSlashCommandRoutes).flatMap((routes) => Object.values(routes)));
  const slashCommandNames = commands.map((command) => cleanCommandName(command?.name)).filter(Boolean);
  const slashCommandRouteNames = new Set([...slashCommandNames, ...groupedSlashCommandNames]);
  const slashCommandAliasNames = new Set(Object.keys(slashCommandAliases));
  const guildSpecificSlashCommandRoutes = new Set(
    guildSpecificCommands
      .map(({ guildId, command }) => `${String(guildId)}:${cleanCommandName(command?.name)}`)
      .filter((key) => !key.endsWith(':'))
  );
  const guildSpecificSlashCommandNames = new Set(
    guildSpecificCommands.map(({ command }) => cleanCommandName(command?.name)).filter(Boolean)
  );
  const prefixCommandSuggestionNames = [
    ...new Set([
      ...slashCommandNames.filter((name) => name !== 'customcommand'),
      ...groupedSlashCommandNames,
      ...Object.keys(prefixCommandAliases),
      ...Object.values(prefixCommandAliases),
      ...extraPrefixCommandNames
    ])
  ].sort();
  const prefixCommandRouteNames = new Set(prefixCommandSuggestionNames);

  return {
    groupedSlashCommandNames,
    slashCommandNames,
    slashCommandRouteNames,
    slashCommandAliasNames,
    guildSpecificSlashCommandRoutes,
    guildSpecificSlashCommandNames,
    prefixCommandSuggestionNames,
    prefixCommandRouteNames
  };
}

export function resolveSlashCommandRoute(routing, receivedCommandName, guildId = null, interaction = null) {
  const receivedName = cleanCommandName(receivedCommandName);
  const subcommandGroupName = interaction?.options?.getSubcommandGroup?.(false) ?? null;
  const subcommandName = interaction?.options?.getSubcommand?.(false) ?? null;
  const groupedCommandName = groupedSlashCommandRoutes[receivedName]?.[subcommandName] ?? null;
  const commandName = groupedCommandName ?? slashCommandAliases[receivedName] ?? receivedName;
  const guildSpecificRoute = routing.guildSpecificSlashCommandRoutes.has(`${guildId}:${commandName}`);
  const groupedRoute = Boolean(groupedCommandName);

  if (
    !routing.slashCommandRouteNames.has(commandName) &&
    !routing.slashCommandAliasNames.has(receivedName) &&
    !guildSpecificRoute &&
    !groupedRoute
  ) {
    return null;
  }

  return {
    receivedName,
    commandName,
    subcommandGroupName,
    subcommandName,
    aliased: receivedName !== commandName,
    grouped: groupedRoute,
    guildSpecific: guildSpecificRoute
  };
}

export function parsePrefixCommandAttempt(content, prefix = '!') {
  if (!String(content ?? '').startsWith(prefix)) return null;
  const body = String(content).slice(prefix.length).trim();
  if (!body) return null;
  const [rawCommand, ...args] = body.split(/\s+/);
  const cleanRawCommand = cleanCommandName(rawCommand);
  const commandName = prefixCommandAliases[cleanRawCommand] ?? cleanRawCommand;
  return { body, rawCommand: cleanRawCommand, commandName, args };
}

export function normalizeFeatureCommandName(value) {
  const clean = cleanCommandName(String(value ?? '').trim().split(/\s+/)[0]);
  return slashCommandAliases[clean] ?? prefixCommandAliases[clean] ?? clean;
}

export function slashCommandRouteLabel(route) {
  const tags = [
    route.subcommandGroupName,
    route.subcommandName
  ].filter(Boolean).join(' ');
  return `/${route.receivedName}${tags ? ` ${tags}` : ''}${route.receivedName !== route.commandName ? ` -> /${route.commandName}` : ''}`;
}

function cleanCommandName(commandName) {
  return String(commandName ?? '')
    .trim()
    .toLowerCase()
    .replace(/^[!/]+/, '')
    .replace(/[^a-z0-9_-]/g, '');
}

function deepFreeze(value) {
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') deepFreeze(child);
  }
  return Object.freeze(value);
}
