import { globalCommunityFunCommandNames } from '../modules/community/fun-command-definitions.js';

const subcommandOptionType = 1;
const subcommandGroupOptionType = 2;

export const commandModuleCatalog = Object.freeze([
  {
    id: 'core',
    label: 'Core',
    description: 'Always-on bot health, command discovery, dashboard, setup, previews, and update controls.',
    commandNames: ['ping', 'commands', 'dashboard', 'config', 'owner', 'notify', 'preview', 'setup', 'permissions']
  },
  {
    id: 'developer',
    label: 'Developer Console',
    description: 'Private developer dashboards and guarded release controls.',
    commandNames: ['admincommands', 'devdashboard', 'feature', 'featuredisable', 'leak']
  },
  {
    id: 'ai',
    label: 'AI Chat',
    description: 'Opt-in AI chat participation and server memory controls.',
    commandNames: ['join', 'unjoin']
  },
  {
    id: 'information',
    label: 'Information',
    description: 'Server, member, role, channel, invite, avatar, utility, and bot lookups.',
    commandNames: ['info']
  },
  {
    id: 'community',
    label: 'Community',
    description: 'Engagement tools, profiles, economy, games, suggestions, welcome messages, reaction roles, socials, and sticky posts.',
    commandNames: ['fun', 'profile', 'economy', 'games', 'suggestion', 'bug', 'social', 'reactionrole', 'welcome', 'sticky', ...globalCommunityFunCommandNames]
  },
  {
    id: 'utility',
    label: 'Utility',
    description: 'Text tools, AI helper surfaces, conversions, and media cards.',
    commandNames: ['utility', 'media']
  },
  {
    id: 'automation',
    label: 'Automation',
    description: 'Scheduled posts, triggers, server automation, counters, analytics, voice controls, and role management systems.',
    commandNames: ['automation', 'analytics', 'voice', 'rolesystem', 'serveradmin', 'counter']
  },
  {
    id: 'alerts',
    label: 'Creator Alerts',
    description: 'Twitch, YouTube, and TikTok notification systems.',
    commandNames: ['twitch', 'youtube', 'tiktok']
  },
  {
    id: 'logging',
    label: 'Logging',
    description: 'Server log channel setup and log delivery checks.',
    commandNames: ['setlogchannel', 'logtest']
  },
  {
    id: 'moderation',
    label: 'Moderation',
    description: 'Compact moderation hub, safety tools, punishments, cleanup, and role/nickname tools.',
    commandNames: [
      'modstats',
      'moderation',
      'case',
      'verification',
      'lockdown',
      'unlockdown',
      'lockdownserver',
      'unlockdownserver',
      'purge',
      'say',
      'clean',
      'softban',
      'banid',
      'massban',
      'tempban',
      'tempbans',
      'lockdownrole',
      'kick',
      'ban',
      'unban',
      'timeout',
      'unmute',
      'slowmode',
      'security',
      'staff',
      'nick',
      'role',
      'warn',
      'warnings',
      'clearwarns',
      'modnote',
      'modlogs'
    ]
  },
  {
    id: 'server-custom',
    label: 'Server Custom',
    description: 'Guild-scoped joke and community commands that never deploy globally.',
    commandNames: ['bmas', 'mascoin', 'masfortune', 'mashype', 'mslate', 'faulty', 'timmysudo', 'timmy']
  }
].map((module) => Object.freeze({
  ...module,
  commandNames: Object.freeze([...module.commandNames])
})));

export const commandModuleMap = Object.freeze(commandModuleCatalog.reduce((map, module) => {
  for (const commandName of module.commandNames) {
    map[commandName] = module.id;
  }
  return map;
}, {}));

export function commandModuleFor(commandName) {
  return commandModuleMap[cleanCommandName(commandName)] ?? 'uncategorized';
}

export function createCommandInventory({ commands = [], guildSpecificCommands = [] } = {}) {
  const globalCommands = commands.map(normalizeCommand).filter(Boolean);
  const guildCommands = guildSpecificCommands.map(normalizeGuildCommand).filter(Boolean);
  const globalNames = globalCommands.map((command) => command.name);
  const guildNames = guildCommands.map((entry) => entry.command.name);
  const allNames = [...globalNames, ...guildNames];
  const moduleRows = commandModuleCatalog.map((module) => {
    const registeredNames = module.commandNames.filter((name) => allNames.includes(name));
    return {
      id: module.id,
      label: module.label,
      description: module.description,
      commandNames: registeredNames,
      commandCount: registeredNames.length
    };
  });

  return {
    globalCommands,
    guildCommands,
    globalCommandCount: globalCommands.length,
    guildCommandCount: guildCommands.length,
    commandPathCount: globalCommands.reduce((total, command) => total + commandRoutePaths(command).length, 0),
    globalNames,
    guildNames,
    allNames,
    duplicateGlobalNames: duplicateValues(globalNames),
    duplicateGuildCommandKeys: duplicateValues(guildCommands.map((entry) => `${entry.guildId}:${entry.command.name}`)),
    globalGuildNameCollisions: globalNames.filter((name) => guildNames.includes(name)),
    uncategorizedNames: [...new Set(allNames.filter((name) => commandModuleFor(name) === 'uncategorized'))],
    staleCatalogNames: Object.keys(commandModuleMap).filter((name) => !allNames.includes(name)),
    moduleRows
  };
}

export function validateCommandInventory(inventory) {
  const problems = [];

  if (inventory.duplicateGlobalNames.length) {
    problems.push(`Duplicate global slash commands: ${inventory.duplicateGlobalNames.join(', ')}`);
  }

  if (inventory.duplicateGuildCommandKeys.length) {
    problems.push(`Duplicate guild slash commands: ${inventory.duplicateGuildCommandKeys.join(', ')}`);
  }

  if (inventory.globalGuildNameCollisions.length) {
    problems.push(`Guild commands also registered globally: ${inventory.globalGuildNameCollisions.join(', ')}`);
  }

  if (inventory.uncategorizedNames.length) {
    problems.push(`Commands missing module ownership: ${inventory.uncategorizedNames.join(', ')}`);
  }

  return problems;
}

export function summarizeCommandInventory(inventory) {
  return {
    globalCommands: inventory.globalCommandCount,
    guildCommands: inventory.guildCommandCount,
    commandPaths: inventory.commandPathCount,
    modules: inventory.moduleRows.map((module) => ({
      id: module.id,
      label: module.label,
      commandCount: module.commandCount
    }))
  };
}

export function publicDeployCommands(commands, productionExcludedCommandNames = new Set()) {
  const excluded = new Set([...productionExcludedCommandNames].map(cleanCommandName));
  return commands.filter((command) => !excluded.has(cleanCommandName(command?.name)));
}

export function guildDeployCommands(commands, guildId, guildSpecificCommandsForGuild) {
  return [
    ...commands,
    ...guildSpecificCommandsForGuild(guildId)
  ];
}

export function commandRoutePaths(command) {
  const normalized = normalizeCommand(command);
  if (!normalized) return [];
  const subcommands = [];

  for (const option of normalized.options ?? []) {
    if (option.type === subcommandOptionType) {
      subcommands.push(`${normalized.name} ${option.name}`);
      continue;
    }

    if (option.type === subcommandGroupOptionType) {
      for (const child of option.options ?? []) {
        if (child.type === subcommandOptionType) {
          subcommands.push(`${normalized.name} ${option.name} ${child.name}`);
        }
      }
    }
  }

  return subcommands.length ? subcommands : [normalized.name];
}

function normalizeCommand(command) {
  const json = typeof command?.toJSON === 'function' ? command.toJSON() : command;
  const name = cleanCommandName(json?.name);
  return name ? { ...json, name } : null;
}

function normalizeGuildCommand(entry) {
  const guildId = String(entry?.guildId ?? '').trim();
  const command = normalizeCommand(entry?.command);
  if (!/^\d{17,20}$/.test(guildId) || !command) return null;
  return { guildId, command };
}

function cleanCommandName(commandName) {
  return String(commandName ?? '')
    .trim()
    .toLowerCase()
    .replace(/^[!/]+/, '')
    .replace(/[^a-z0-9_-]/g, '');
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();

  for (const value of values) {
    if (!value) continue;
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }

  return [...duplicates].sort();
}
