export function createDefaultRootConfig(overrides = {}) {
  const uptimeStatus = {
    guildId: overrides.uptimeStatus?.guildId ?? null,
    channelId: overrides.uptimeStatus?.channelId ?? null,
    messageId: overrides.uptimeStatus?.messageId ?? null
  };

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
    uptimeStatus,
    ...overrides,
    uptimeStatus: {
      ...uptimeStatus,
      ...(isRecord(overrides.uptimeStatus) ? overrides.uptimeStatus : {})
    }
  };
}

export function normalizeRootConfig(value, defaults = createDefaultRootConfig()) {
  const root = isRecord(value) ? value : createDefaultRootConfig(defaults);
  const fallback = createDefaultRootConfig(defaults);

  root.version = Number.isInteger(root.version) ? root.version : fallback.version;
  root.adminUserIds = normalizeIdList(root.adminUserIds);
  root.devUserIds = normalizeIdList(root.devUserIds);
  root.errorDmUserIds = normalizeIdList(root.errorDmUserIds);
  root.guilds = isRecord(root.guilds) ? root.guilds : {};
  root.updateSubscribers = normalizeIdList(root.updateSubscribers);
  root.suggestions = isRecord(root.suggestions) ? root.suggestions : {};
  root.disabledCommands = normalizeNameList(root.disabledCommands);
  root.lastBotVersion ??= fallback.lastBotVersion;
  root.uptimeStatus = normalizeUptimeStatus(root.uptimeStatus, fallback.uptimeStatus);

  return root;
}

export function createConfigRepository({
  getRoot,
  setRoot,
  createDefaultRootConfig: createDefaultRoot = createDefaultRootConfig,
  createDefaultGuildConfig,
  normalizeGuildConfig = (guildConfig) => guildConfig,
  save = () => {}
} = {}) {
  if (typeof getRoot !== 'function' || typeof setRoot !== 'function') {
    throw new TypeError('Config repository requires getRoot and setRoot functions.');
  }
  if (typeof createDefaultGuildConfig !== 'function') {
    throw new TypeError('Config repository requires createDefaultGuildConfig.');
  }

  const ensureRoot = () => {
    const root = normalizeRootConfig(getRoot(), createDefaultRoot());
    if (root !== getRoot()) setRoot(root);
    return root;
  };

  return {
    getRoot: ensureRoot,
    replaceRoot(nextRoot) {
      setRoot(normalizeRootConfig(nextRoot, createDefaultRoot()));
      return ensureRoot();
    },
    getGuild(guildId) {
      const root = ensureRoot();
      const key = normalizeConfigKey(guildId);
      root.guilds[key] ??= createDefaultGuildConfig();
      root.guilds[key] = normalizeGuildConfig(root.guilds[key]);
      return root.guilds[key];
    },
    updateGuild(guildId, updates = {}) {
      Object.assign(this.getGuild(guildId), isRecord(updates) ? updates : {});
      save(ensureRoot());
      return this.getGuild(guildId);
    },
    resetGuild(guildId) {
      const root = ensureRoot();
      const key = normalizeConfigKey(guildId);
      root.guilds[key] = normalizeGuildConfig(createDefaultGuildConfig());
      save(root);
      return root.guilds[key];
    },
    setIdList(key, ids) {
      const root = ensureRoot();
      root[key] = normalizeIdList(ids);
      save(root);
      return root[key];
    }
  };
}

function normalizeConfigKey(value) {
  return String(value ?? '').trim();
}

function normalizeIdList(value) {
  return [...new Set(
    (Array.isArray(value) ? value : [])
      .map((id) => String(id).trim())
      .filter((id) => /^\d{17,20}$/.test(id))
  )];
}

function normalizeNameList(value) {
  return [...new Set(
    (Array.isArray(value) ? value : [])
      .map((name) => String(name).trim().toLowerCase())
      .filter(Boolean)
  )];
}

function normalizeUptimeStatus(value, fallback) {
  const source = isRecord(value) ? value : {};
  return {
    guildId: source.guildId ?? fallback?.guildId ?? null,
    channelId: source.channelId ?? fallback?.channelId ?? null,
    messageId: source.messageId ?? fallback?.messageId ?? null
  };
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
