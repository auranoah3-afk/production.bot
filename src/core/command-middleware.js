export function evaluateCommandAccess({
  commandName,
  receivedName = commandName,
  revamping = false,
  disabled = false
} = {}) {
  const cleanCommandName = normalizeCommandName(commandName);
  const cleanReceivedName = normalizeCommandName(receivedName) || cleanCommandName;

  if (revamping) {
    return {
      allowed: false,
      reason: 'revamping',
      commandName: cleanCommandName,
      receivedName: cleanReceivedName
    };
  }

  if (disabled) {
    return {
      allowed: false,
      reason: 'disabled',
      commandName: cleanCommandName,
      receivedName: cleanReceivedName
    };
  }

  return {
    allowed: true,
    reason: 'allowed',
    commandName: cleanCommandName,
    receivedName: cleanReceivedName
  };
}

export function createCooldownTracker({ now = () => Date.now(), maxEntries = 500 } = {}) {
  const entries = new Map();

  return {
    check(key, durationMs) {
      const cleanKey = String(key ?? '').trim();
      const cleanDurationMs = Math.max(0, Number(durationMs) || 0);
      const currentTime = now();
      if (!cleanKey || !cleanDurationMs) {
        return { limited: false, retryAfterMs: 0, expiresAt: currentTime };
      }

      const existingExpiresAt = entries.get(cleanKey) ?? 0;
      if (existingExpiresAt > currentTime) {
        return {
          limited: true,
          retryAfterMs: existingExpiresAt - currentTime,
          expiresAt: existingExpiresAt
        };
      }

      const expiresAt = currentTime + cleanDurationMs;
      entries.set(cleanKey, expiresAt);
      sweepExpiredCooldowns(entries, currentTime, maxEntries);
      return { limited: false, retryAfterMs: 0, expiresAt };
    },
    clear(key) {
      entries.delete(String(key ?? '').trim());
    },
    size() {
      return entries.size;
    }
  };
}

export function createCommandExecutionRecord({
  kind,
  commandName,
  status,
  startedAt,
  endedAt = Date.now(),
  error = null
} = {}) {
  const durationMs = Math.max(0, Number(endedAt) - Number(startedAt));
  return {
    kind: String(kind ?? 'unknown').trim().toLowerCase() || 'unknown',
    commandName: normalizeCommandName(commandName) || 'unknown',
    status: ['ok', 'error', 'ignored', 'blocked'].includes(status) ? status : 'unknown',
    durationMs,
    errorName: error?.name ? String(error.name) : null,
    errorMessage: error?.message ? String(error.message) : null
  };
}

export function evaluatePermissionAccess({
  permissions,
  permission,
  label = 'that permission',
  configuredAdmin = false,
  administratorPermission
} = {}) {
  const hasPermission = hasPermissionFlag(permissions, permission) ||
    hasPermissionFlag(permissions, administratorPermission);

  if (configuredAdmin || hasPermission) {
    return {
      allowed: true,
      reason: configuredAdmin && !hasPermission ? 'configured_admin' : 'permission',
      permission,
      label
    };
  }

  return {
    allowed: false,
    reason: 'missing_permission',
    permission,
    label
  };
}

export function evaluateDeveloperAccess({ developer = false } = {}) {
  return developer
    ? { allowed: true, reason: 'developer' }
    : { allowed: false, reason: 'not_developer' };
}

function normalizeCommandName(commandName) {
  return String(commandName ?? '')
    .trim()
    .toLowerCase()
    .replace(/^[!/]+/, '')
    .replace(/[^a-z0-9_-]/g, '');
}

function hasPermissionFlag(permissions, permission) {
  if (!permissions || permission === undefined || permission === null) return false;
  if (typeof permissions.has !== 'function') return false;
  return Boolean(permissions.has(permission));
}

function sweepExpiredCooldowns(entries, currentTime, maxEntries) {
  if (entries.size <= maxEntries) return;
  for (const [key, expiresAt] of entries.entries()) {
    if (expiresAt <= currentTime) entries.delete(key);
  }
}
