export function createCommandRuntimeAudit({
  commands = [],
  groupedSlashCommandRoutes = {},
  groupedPrefixCommandRoutes = {},
  slashCommandAliases = {},
  prefixCommandAliases = {},
  prefixCommandSuggestionNames = [],
  slashHandlerNames = [],
  prefixHandlerNames = [],
  execution = null
} = {}) {
  const registeredNames = commands.map((command) => cleanCommandName(command?.name ?? command?.toJSON?.()?.name)).filter(Boolean);
  const duplicateNames = duplicateValues(registeredNames);
  const slashHandlers = new Set(slashHandlerNames.map(cleanCommandName).filter(Boolean));
  const prefixHandlers = new Set(prefixHandlerNames.map(cleanCommandName).filter(Boolean));
  const flatRegisteredNames = registeredNames.filter((name) => !groupedSlashCommandRoutes[name]);
  const groupedRouteNames = [...new Set(Object.values(groupedSlashCommandRoutes).flatMap((routes) => Object.values(routes).map(cleanCommandName).filter(Boolean)))];
  const slashRouteNames = new Set([...flatRegisteredNames, ...groupedRouteNames]);
  const publicPrefixNames = [...new Set(prefixCommandSuggestionNames.map(cleanCommandName).filter(Boolean))]
    .filter((name) => name !== 'customcommand');
  const prefixRouteNames = new Set(publicPrefixNames);
  const missingSlashRoutes = [...slashRouteNames].filter((name) => !slashHandlers.has(name));
  const missingPrefixRoutes = publicPrefixNames.filter((name) => {
    const normalized = cleanCommandName(prefixCommandAliases[name]) || name;
    return !prefixHandlers.has(normalized) && !groupedPrefixCommandRoutes[normalized];
  });
  const staleSlashAliases = Object.values(slashCommandAliases)
    .map(cleanCommandName)
    .filter((name) => name && !slashHandlers.has(name));
  const stalePrefixAliases = Object.values(prefixCommandAliases)
    .map(cleanCommandName)
    .filter((name) => name && !prefixHandlers.has(name));

  return {
    ok: !duplicateNames.length && !missingSlashRoutes.length && !missingPrefixRoutes.length && !staleSlashAliases.length && !stalePrefixAliases.length,
    registeredCount: registeredNames.length,
    publicCount: publicPrefixNames.length,
    slashRouteCount: slashRouteNames.size,
    prefixRouteCount: prefixRouteNames.size,
    slashAliasCount: Object.keys(slashCommandAliases).length,
    prefixAliasCount: Object.keys(prefixCommandAliases).length,
    slashHandlerCount: slashHandlers.size,
    prefixHandlerCount: prefixHandlers.size,
    execution,
    duplicateNames,
    missingSlashRoutes,
    missingPrefixRoutes,
    staleSlashAliases,
    stalePrefixAliases,
    registeredNames
  };
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
