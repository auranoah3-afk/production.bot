import { createCommandExecutionRecord } from './command-middleware.js';

export function createCommandTelemetry({
  historyLimit = 12,
  noisyLimit = 5,
  errorMessageLimit = 160,
  now = () => Date.now()
} = {}) {
  const stats = new Map();

  return {
    record(scope, commandName, status, durationMs, error = null) {
      const record = createCommandExecutionRecord({
        kind: scope,
        commandName,
        status,
        startedAt: 0,
        endedAt: Math.max(0, durationMs),
        error
      });
      const key = `${record.kind}:${record.commandName}`;
      const existing = stats.get(key) ?? {
        scope: record.kind,
        commandName: record.commandName,
        ok: 0,
        errors: 0,
        ignored: 0,
        totalMs: 0,
        maxMs: 0,
        lastStatus: 'never',
        lastAt: 0,
        lastError: ''
      };

      if (record.status === 'ok') existing.ok += 1;
      else if (record.status === 'error') existing.errors += 1;
      else existing.ignored += 1;

      existing.totalMs += record.durationMs;
      existing.maxMs = Math.max(existing.maxMs, record.durationMs);
      existing.lastStatus = record.status;
      existing.lastAt = now();
      existing.lastError = record.errorMessage ? truncateText(record.errorMessage, errorMessageLimit) : existing.lastError;
      stats.set(key, existing);
      return existing;
    },
    summary() {
      return commandExecutionSummary([...stats.values()], { historyLimit, noisyLimit });
    },
    summaryLines(summary = this.summary()) {
      return commandExecutionSummaryLines(summary);
    },
    recentLines(summary = this.summary()) {
      return commandExecutionRecentLines(summary);
    },
    noisyLines(summary = this.summary()) {
      return commandExecutionNoisyLines(summary);
    },
    entries() {
      return [...stats.values()];
    },
    clear() {
      stats.clear();
    }
  };
}

export function commandExecutionSummary(entries = [], { historyLimit = 12, noisyLimit = 5 } = {}) {
  const totals = entries.reduce((summary, entry) => {
    summary.ok += entry.ok;
    summary.errors += entry.errors;
    summary.ignored += entry.ignored;
    summary.maxMs = Math.max(summary.maxMs, entry.maxMs);
    return summary;
  }, { ok: 0, errors: 0, ignored: 0, maxMs: 0 });
  const recent = entries
    .filter((entry) => entry.lastAt)
    .sort((left, right) => right.lastAt - left.lastAt)
    .slice(0, historyLimit);
  const noisy = entries
    .filter((entry) => entry.errors)
    .sort((left, right) => right.errors - left.errors || right.lastAt - left.lastAt)
    .slice(0, noisyLimit);

  return {
    ...totals,
    trackedRoutes: entries.length,
    recent,
    noisy
  };
}

export function commandExecutionSummaryLines(summary = commandExecutionSummary()) {
  return [
    `Tracked routes: ${summary.trackedRoutes}`,
    `Successes: ${summary.ok}`,
    `Errors: ${summary.errors}`,
    `Ignored/unknown prefix attempts: ${summary.ignored}`,
    `Slowest observed command: ${summary.maxMs}ms`
  ].join('\n');
}

export function commandExecutionRecentLines(summary = commandExecutionSummary()) {
  return summary.recent
    .map((entry) => {
      const runs = entry.ok + entry.errors + entry.ignored;
      const avg = runs ? Math.round(entry.totalMs / runs) : 0;
      const label = `${entry.scope}:${entry.commandName}`;
      const status = entry.lastStatus === 'error' ? `error - ${entry.lastError || 'unknown'}` : entry.lastStatus;
      return `\`${label}\` ${status} | avg ${avg}ms | max ${entry.maxMs}ms`;
    })
    .join('\n') || 'No command executions tracked since this process started.';
}

export function commandExecutionNoisyLines(summary = commandExecutionSummary()) {
  return summary.noisy
    .map((entry) => `\`${entry.scope}:${entry.commandName}\` ${entry.errors} error(s) | last: ${entry.lastError || 'unknown'}`)
    .join('\n') || 'No command errors tracked since this process started.';
}

function truncateText(value, maxLength) {
  const text = String(value ?? '');
  if (text.length <= maxLength) return text;
  if (maxLength <= 3) return text.slice(0, maxLength);
  return `${text.slice(0, maxLength - 3).trimEnd()}...`;
}
