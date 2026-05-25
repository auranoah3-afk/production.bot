export function createCommandHandlerRegistry({ kind = 'command' } = {}) {
  const handlers = new Map();

  return {
    kind,
    register(names, handler, metadata = {}) {
      if (typeof handler !== 'function') {
        throw new TypeError(`${kind} handler must be a function.`);
      }

      for (const rawName of Array.isArray(names) ? names : [names]) {
        const name = normalizeCommandName(rawName);
        if (!name) throw new Error(`${kind} handler name is required.`);
        if (handlers.has(name)) throw new Error(`Duplicate ${kind} handler registered for ${name}.`);
        handlers.set(name, Object.freeze({
          name,
          handler,
          moduleId: normalizeCommandName(metadata.moduleId) || 'uncategorized',
          description: String(metadata.description ?? '').trim()
        }));
      }

      return this;
    },
    get(name) {
      return handlers.get(normalizeCommandName(name)) ?? null;
    },
    has(name) {
      return handlers.has(normalizeCommandName(name));
    },
    names() {
      return [...handlers.keys()].sort();
    },
    entries() {
      return [...handlers.values()].sort((left, right) => left.name.localeCompare(right.name));
    },
    size() {
      return handlers.size;
    }
  };
}

export function validateHandlerRegistry(registry, expectedNames = []) {
  const registeredNames = new Set(registry.names());
  const expected = [...new Set(expectedNames.map(normalizeCommandName).filter(Boolean))];
  return {
    missing: expected.filter((name) => !registeredNames.has(name)),
    extra: registry.names().filter((name) => !expected.includes(name))
  };
}

function normalizeCommandName(commandName) {
  return String(commandName ?? '')
    .trim()
    .toLowerCase()
    .replace(/^[!/]+/, '')
    .replace(/[^a-z0-9_-]/g, '');
}
