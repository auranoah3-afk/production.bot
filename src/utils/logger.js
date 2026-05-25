const levelRanks = Object.freeze({
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
});

export function createLogger({ level = 'info', writer = console } = {}) {
  const activeLevel = normalizeLevel(level);

  function write(levelName, source, message, metadata = {}) {
    const cleanLevel = normalizeLevel(levelName);
    if (levelRanks[cleanLevel] < levelRanks[activeLevel]) return false;

    const line = formatLogLine({
      level: cleanLevel,
      source,
      message,
      metadata
    });

    if (cleanLevel === 'error') writer.error(line);
    else if (cleanLevel === 'warn') writer.warn(line);
    else if (cleanLevel === 'debug' && typeof writer.debug === 'function') writer.debug(line);
    else writer.log(line);
    return true;
  }

  return {
    debug: (source, message, metadata) => write('debug', source, message, metadata),
    info: (source, message, metadata) => write('info', source, message, metadata),
    warn: (source, message, metadata) => write('warn', source, message, metadata),
    error: (source, message, metadata) => write('error', source, message, metadata),
    child: (source) => ({
      debug: (message, metadata) => write('debug', source, message, metadata),
      info: (message, metadata) => write('info', source, message, metadata),
      warn: (message, metadata) => write('warn', source, message, metadata),
      error: (message, metadata) => write('error', source, message, metadata)
    })
  };
}

export function formatLogLine({ level, source, message, metadata = {}, now = new Date() }) {
  const context = Object.entries(metadata)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${safeLogValue(value)}`)
    .join(' ');
  const prefix = `[${now.toISOString()}] [${String(level).toUpperCase()}] [${cleanSource(source)}]`;
  return context ? `${prefix} ${message} | ${context}` : `${prefix} ${message}`;
}

export function normalizeLevel(level) {
  const clean = String(level ?? 'info').trim().toLowerCase();
  return Object.hasOwn(levelRanks, clean) ? clean : 'info';
}

function cleanSource(source) {
  return String(source ?? 'bot').trim().replace(/[^\w:.-]+/g, '-') || 'bot';
}

function safeLogValue(value) {
  if (value instanceof Error) return JSON.stringify({ name: value.name, message: value.message, stack: value.stack });
  if (typeof value === 'object') return JSON.stringify(value);
  return JSON.stringify(String(value));
}
