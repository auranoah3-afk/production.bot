export function normalizeRuntimeError(reason) {
  if (reason instanceof Error) return reason;

  const message = typeof reason === 'string'
    ? reason
    : safeStringify(reason) || 'Unknown runtime error';
  const error = new Error(message);
  error.name = 'RuntimeError';
  return error;
}

export function runGuardedTask(name, task, onFailure = () => {}) {
  const taskName = cleanTaskName(name);

  try {
    const result = task();
    if (result && typeof result.catch === 'function') {
      const promise = result.catch((error) => onFailure(taskName, normalizeRuntimeError(error)));
      return { started: true, async: true, promise };
    }
    return { started: true, async: false, promise: Promise.resolve(result) };
  } catch (error) {
    void onFailure(taskName, normalizeRuntimeError(error));
    return { started: false, async: false, promise: Promise.resolve() };
  }
}

export function createGuardedEventHandler(handler, onFailure = () => {}) {
  if (typeof handler !== 'function') {
    throw new TypeError('Guarded event handler must be a function.');
  }

  return async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      return onFailure(normalizeRuntimeError(error), ...args);
    }
  };
}

export function startGuardedInterval({
  name = 'Interval Task',
  task,
  intervalMs,
  initialDelayMs = 0,
  onFailure = () => {},
  preventOverlap = true,
  setTimeoutFn = setTimeout,
  setIntervalFn = setInterval,
  clearTimeoutFn = clearTimeout,
  clearIntervalFn = clearInterval
} = {}) {
  if (typeof task !== 'function') {
    throw new TypeError('Guarded interval task must be a function.');
  }

  const taskName = cleanTaskName(name);
  const cleanIntervalMs = positiveMilliseconds(intervalMs, 'intervalMs');
  const cleanInitialDelayMs = Math.max(0, Number(initialDelayMs) || 0);
  const timers = [];
  let running = false;

  const run = () => {
    if (preventOverlap && running) {
      return { started: false, async: false, skipped: true };
    }

    running = true;
    try {
      const result = task();
      if (result && typeof result.then === 'function') {
        result
          .catch((error) => onFailure(taskName, normalizeRuntimeError(error)))
          .finally(() => {
            running = false;
          });
        return { started: true, async: true, skipped: false };
      }

      running = false;
      return { started: true, async: false, skipped: false };
    } catch (error) {
      running = false;
      void onFailure(taskName, normalizeRuntimeError(error));
      return { started: false, async: false, skipped: false };
    }
  };

  if (cleanInitialDelayMs > 0) {
    timers.push({ kind: 'timeout', id: setTimeoutFn(run, cleanInitialDelayMs) });
  } else {
    run();
  }

  timers.push({ kind: 'interval', id: setIntervalFn(run, cleanIntervalMs) });
  for (const timer of timers) {
    timer.id?.unref?.();
  }

  return {
    name: taskName,
    intervalMs: cleanIntervalMs,
    initialDelayMs: cleanInitialDelayMs,
    timers,
    run,
    stop() {
      for (const timer of timers.splice(0)) {
        if (timer.kind === 'timeout') clearTimeoutFn(timer.id);
        if (timer.kind === 'interval') clearIntervalFn(timer.id);
      }
    }
  };
}

export async function reportGuardedEventError(error, {
  eventName = 'Event',
  logMessage = null,
  context = {},
  notifyDevelopersOfError = null,
  logger = console.error,
  notifyErrorLogger = logger,
  notifyFailureMessage = 'Failed to report event error:'
} = {}) {
  const normalizedError = normalizeRuntimeError(error);
  logger(logMessage ?? `${eventName} failed:`, normalizedError);

  if (typeof notifyDevelopersOfError === 'function') {
    await notifyDevelopersOfError(normalizedError, {
      type: 'Bot',
      command: eventName,
      ...context
    }).catch((notifyError) => notifyErrorLogger(notifyFailureMessage, notifyError));
  }

  return normalizedError;
}

function cleanTaskName(name) {
  return String(name ?? 'Task').trim() || 'Task';
}

function positiveMilliseconds(value, label) {
  const milliseconds = Number(value);
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    throw new RangeError(`${label} must be a positive number of milliseconds.`);
  }
  return milliseconds;
}

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
