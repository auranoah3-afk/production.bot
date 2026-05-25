import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { commands } from './commands.js';

const defaultPort = 3030;
const defaultHost = '127.0.0.1';
const maxPresenceLength = 128;
const sensitiveEnvKeys = new Set([
  'DISCORD_TOKEN',
  'DISCORD_CLIENT_SECRET',
  'DISCORD_OAUTH_CLIENT_SECRET',
  'SESSION_SECRET',
  'TOGETHER_API_KEY',
  'GROQ_API_KEY',
  'HUGGINGFACE_API_KEY',
  'TWITCH_CLIENT_SECRET',
  'SMTP_PASS'
]);

export function createPreviewPayload(cwd = process.cwd()) {
  const packageJson = readJson(path.join(cwd, 'package.json'), {});
  const config = readJson(path.join(cwd, 'data', 'config.json'), {});
  const devConfig = readJson(path.join(cwd, 'data', 'config.development.json'), {});
  const changelog = readText(path.join(cwd, 'CHANGELOG.md'));
  const env = parseEnvFile(readText(path.join(cwd, '.env')));
  const devEnv = parseEnvFile(readText(path.join(cwd, '.env.development')));
  const commandRows = commands.map((command) => normalizeCommand(command));
  const commandDocs = createCommandDocs(commandRows);
  const duplicateNames = findDuplicates(commandRows.map((command) => command.name));
  const categories = commandRows.reduce((grouped, command) => {
    grouped[command.category] ??= [];
    grouped[command.category].push(command);
    return grouped;
  }, {});
  const latestChangelog = parseLatestChangelog(changelog);
  const publicEnv = Object.fromEntries(
    Object.entries(env)
      .filter(([key]) => !sensitiveEnvKeys.has(key))
      .map(([key, value]) => [key, redactEnvValue(key, value)])
  );
  const rawAdminUserIds = normalizeIdList([
    ...splitIdList(env.ADMIN_USER_IDS),
    ...(config.adminUserIds ?? [])
  ]);
  const legacyDevUserIds = normalizeIdList([
    ...splitIdList(env.DEV_USER_IDS),
    ...(config.devUserIds ?? [])
  ]);
  const adminUserIds = normalizeIdList([...rawAdminUserIds, ...legacyDevUserIds]);
  const devUserIds = adminUserIds;
  const effectiveAdminIds = adminUserIds;
  const errorDmIds = normalizeIdList([
    ...splitIdList(env.ERROR_DM_USER_IDS),
    ...(config.errorDmUserIds ?? [])
  ]);
  const errorEmailRecipients = splitEmailList(env.ERROR_EMAIL_TO ?? env.ERROR_EMAIL_RECIPIENTS ?? env.EMAIL_ALERT_TO);
  const smtpAuthConfigured = (!env.SMTP_USER && !env.SMTP_PASS) || Boolean(env.SMTP_USER && env.SMTP_PASS);
  const emailAlertsConfigured = Boolean(env.SMTP_HOST && (env.SMTP_FROM || env.SMTP_USER) && errorEmailRecipients.length && smtpAuthConfigured);
  const status = createStatusPayload({ cwd, config, packageJson, commandRows, env });
  const guilds = createGuildDashboardRows(config);
  const oauth = createOAuthPayload(env);
  const featureFlags = createFeatureFlagSummary(config);

  return {
    generatedAt: new Date().toISOString(),
    package: {
      name: packageJson.name ?? 'discordbot',
      version: packageJson.version ?? 'unknown',
      description: packageJson.description ?? ''
    },
    latestChangelog,
    config: {
      guildCount: Object.keys(config.guilds ?? {}).length,
      lastBotVersion: config.lastBotVersion ?? null,
      explicitAdminUserCount: rawAdminUserIds.length,
      adminUserCount: effectiveAdminIds.length,
      adminUsers: effectiveAdminIds.map(redactId),
      editableAdminUsers: (config.adminUserIds ?? []).join('\n'),
      devUserCount: devUserIds.length,
      devUsers: devUserIds.map(redactId),
      editableDevUsers: (config.devUserIds ?? []).join('\n'),
      errorDmUserCount: errorDmIds.length,
      errorDmUsers: errorDmIds.map(redactId),
      editableErrorDmUsers: (config.errorDmUserIds ?? []).join('\n'),
      errorEmailRecipientCount: errorEmailRecipients.length,
      errorEmailRecipients: errorEmailRecipients.map(redactEmail),
      errorEmailConfigured: emailAlertsConfigured,
      updateSubscriberCount: (config.updateSubscribers ?? []).length,
      presence: env.BOT_ACTIVITY || 'Default bot activity'
    },
    testingBot: createTestingBotPayload(devConfig, devEnv),
    commands: {
      total: commandRows.length,
      duplicates: duplicateNames,
      categories,
      docs: commandDocs,
      explorerCategories: groupCommandDocs(commandDocs)
    },
    status,
    metrics: createMetricsPayload({ config, commandRows, status }),
    guilds,
    featureFlags,
    oauth,
    security: {
      authRequiredForGuildConfig: true,
      rbac: 'Administrator or Manage Server',
      csrf: 'SameSite session cookies and JSON-only mutating API routes',
      rateLimit: 'Per-IP API throttling on preview server'
    },
    checks: [
      {
        label: 'Command names',
        ok: duplicateNames.length === 0,
        detail: duplicateNames.length ? `Duplicates: ${duplicateNames.join(', ')}` : `${commandRows.length} unique slash commands`
      },
      {
        label: 'Access users',
        ok: effectiveAdminIds.length > 0,
        detail: `${effectiveAdminIds.length} admin/developer user(s)`
      },
      {
        label: 'Presence source',
        ok: Boolean(env.BOT_ACTIVITY),
        detail: env.BOT_ACTIVITY ? `Reads .env: ${env.BOT_ACTIVITY}` : 'BOT_ACTIVITY is not set in .env'
      },
      {
        label: 'Version tracking',
        ok: !config.lastBotVersion || config.lastBotVersion === packageJson.version,
        detail: config.lastBotVersion
          ? `Config has ${config.lastBotVersion}; package has ${packageJson.version}`
          : 'No deployed version has been recorded yet'
      }
    ],
    env: publicEnv,
    localOnly: true
  };
}

export function savePreviewPresence(cwd, presence) {
  const cleanPresence = sanitizePresence(presence);
  updateEnvValue(path.join(cwd, '.env'), 'BOT_ACTIVITY', cleanPresence);
  return cleanPresence;
}

export function savePreviewAccessUsers(cwd, { adminUsers, devUsers, errorDmUsers }) {
  const configPath = path.join(cwd, 'data', 'config.json');
  const config = readJson(configPath, { version: 2, guilds: {} });
  config.version ??= 2;
  config.guilds ??= {};
  const adminUserIds = extractUserIds(`${adminUsers ?? ''}\n${devUsers ?? ''}`);
  config.adminUserIds = adminUserIds;
  config.devUserIds = adminUserIds;
  config.errorDmUserIds = extractUserIds(errorDmUsers);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return {
    adminUserIds: config.adminUserIds,
    devUserIds: config.devUserIds,
    errorDmUserIds: config.errorDmUserIds
  };
}

export function renderPreviewHtml(payload, options = {}) {
  return renderProductionPortalHtml(payload, options);

  const commandTabs = ['community', 'admin', 'developer'].map((category) => {
    const rows = payload.commands.categories[category] ?? [];
    return `
      <section class="command-panel" data-panel="${category}">
        <div class="group-heading">
          <h2>${titleCase(category)} Commands</h2>
          <span>${rows.length} commands</span>
        </div>
        <div class="command-grid">
          ${rows.map(renderCommand).join('')}
        </div>
      </section>`;
  }).join('');
  const savedBanner = options.saved === 'presence'
    ? `
    <section class="save-banner" role="status">
      <strong>Presence saved.</strong>
      <span>The live bot will use this after a restart or runtime presence update.</span>
    </section>`
    : options.saved === 'access-users'
    ? `
    <section class="save-banner" role="status">
      <strong>Access users saved.</strong>
      <span>Admin users can run bot admin commands. Developer users can run private dev tools. Error DM users receive error alerts.</span>
    </section>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(payload.package.name)} Local Preview</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7fb;
      --surface: #ffffff;
      --surface-strong: #eef2ff;
      --text: #1f2430;
      --muted: #5e6676;
      --line: #d9deea;
      --blue: #3563e9;
      --green: #168a52;
      --red: #ce2f3f;
      --yellow: #946200;
      --shadow: 0 12px 32px rgba(27, 39, 71, 0.12);
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.45;
    }

    header {
      border-bottom: 1px solid var(--line);
      background: var(--surface);
    }

    .wrap {
      width: min(1180px, calc(100% - 32px));
      margin: 0 auto;
    }

    .topbar {
      min-height: 82px;
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: 18px;
    }

    h1, h2, h3, p { margin: 0; }
    h1 { font-size: 1.35rem; font-weight: 750; }
    h2 { font-size: 1rem; }
    h3 { font-size: 0.92rem; }
    p, li, td, th { font-size: 0.94rem; }
    small { color: var(--muted); }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: flex-end;
    }

    button, a.button {
      border: 1px solid var(--line);
      border-radius: 7px;
      background: var(--surface);
      color: var(--text);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      min-height: 36px;
      padding: 0 12px;
      text-decoration: none;
      font-weight: 650;
    }

    button.primary, a.button.primary {
      border-color: var(--blue);
      background: var(--blue);
      color: #fff;
    }

    main {
      padding: 22px 0 42px;
    }

    .notice {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 12px;
      align-items: center;
      border: 1px solid var(--line);
      border-left: 4px solid var(--blue);
      border-radius: 7px;
      background: var(--surface);
      padding: 14px 16px;
      box-shadow: var(--shadow);
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin: 18px 0;
    }

    .stat, .panel, .command-item {
      border: 1px solid var(--line);
      border-radius: 7px;
      background: var(--surface);
    }

    .stat {
      padding: 14px;
    }

    .stat strong {
      display: block;
      font-size: 1.3rem;
      margin-top: 3px;
    }

    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1.35fr) minmax(300px, 0.65fr);
      gap: 16px;
      align-items: start;
    }

    .panel {
      padding: 16px;
      margin-bottom: 16px;
    }

    .panel-heading, .group-heading {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      border-bottom: 1px solid var(--line);
      padding-bottom: 10px;
      margin-bottom: 12px;
    }

    .panel-heading span, .group-heading span, .tag {
      color: var(--muted);
      font-size: 0.82rem;
      font-weight: 650;
    }

    .checks {
      display: grid;
      gap: 10px;
    }

    .check {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 10px;
      align-items: start;
    }

    .dot {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      margin-top: 5px;
      background: var(--red);
    }

    .dot.ok { background: var(--green); }

    .save-banner {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      border: 1px solid rgba(22, 138, 82, 0.35);
      border-left: 4px solid var(--green);
      border-radius: 7px;
      background: #f0fbf6;
      padding: 12px 14px;
      margin: 14px 0 0;
    }

    .save-banner span, .hint {
      color: var(--muted);
      font-size: 0.9rem;
    }

    .presence-form {
      display: grid;
      gap: 10px;
    }

    .field {
      display: grid;
      gap: 6px;
    }

    .field label {
      color: var(--muted);
      font-size: 0.78rem;
      font-weight: 700;
      text-transform: uppercase;
    }

    input[type="text"], textarea, select {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 7px;
      color: var(--text);
      background: var(--surface);
      padding: 9px 10px;
      font: inherit;
    }

    input[type="text"], select {
      min-height: 40px;
    }

    textarea {
      min-height: 86px;
      resize: vertical;
    }

    input[type="text"]:focus, textarea:focus, select:focus {
      outline: 2px solid rgba(53, 99, 233, 0.2);
      border-color: var(--blue);
    }

    .inline-form {
      margin: 0;
    }

    button.danger {
      border-color: rgba(206, 47, 63, 0.4);
      color: var(--red);
      background: #fff5f6;
    }

    pre {
      white-space: pre-wrap;
      word-break: break-word;
      margin: 0;
      color: #242936;
      background: #f8fafc;
      border: 1px solid var(--line);
      border-radius: 7px;
      padding: 12px;
      font: 0.9rem/1.5 Consolas, "SFMono-Regular", monospace;
    }

    .tabs {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 12px;
    }

    .tab[aria-selected="true"] {
      border-color: var(--blue);
      color: var(--blue);
      background: var(--surface-strong);
    }

    .command-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .command-item {
      padding: 12px;
      min-height: 94px;
    }

    .command-name {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 6px;
    }

    code {
      background: #eef1f6;
      border-radius: 5px;
      padding: 2px 5px;
      font-family: Consolas, "SFMono-Regular", monospace;
      font-size: 0.86em;
    }

    .env-table {
      width: 100%;
      border-collapse: collapse;
    }

    .env-table th, .env-table td {
      border-bottom: 1px solid var(--line);
      padding: 8px 0;
      text-align: left;
      vertical-align: top;
    }

    .env-table th {
      color: var(--muted);
      font-size: 0.78rem;
      text-transform: uppercase;
    }

    [data-panel] { display: none; }
    [data-panel].active { display: block; }

    @media (max-width: 840px) {
      .topbar, .notice, .layout {
        grid-template-columns: 1fr;
      }

      .actions {
        justify-content: flex-start;
      }

      .stats, .command-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <header>
    <div class="wrap topbar">
      <div>
        <h1>${escapeHtml(payload.package.name)} Local Update Preview</h1>
        <small>Generated ${formatDateTime(payload.generatedAt)}. Local browser preview only; Discord is not touched.</small>
      </div>
      <div class="actions">
        <a class="button" href="/api/preview">JSON</a>
        <button class="primary" type="button" onclick="window.location.reload()">Refresh</button>
      </div>
    </div>
  </header>

  <main class="wrap">
    <section class="notice">
      <div>
        <h2>Preview before live</h2>
        <p>This page reads your local files on each refresh, so you can review notes, commands, and safe config status before deploying slash commands or restarting PM2.</p>
      </div>
      <span class="tag">Local only</span>
    </section>
    ${savedBanner}

    <section class="stats" aria-label="Preview summary">
      ${renderStat('Package version', payload.package.version)}
      ${renderStat('Slash commands', payload.commands.total)}
      ${renderStat('Servers in config', payload.config.guildCount)}
      ${renderStat('Presence', payload.config.presence)}
    </section>

    <div class="layout">
      <div>
        <section class="panel">
          <div class="panel-heading">
            <h2>Latest Changelog</h2>
            <span>${escapeHtml(payload.latestChangelog.title)}</span>
          </div>
          <pre>${escapeHtml(payload.latestChangelog.body || 'No changelog entry found.')}</pre>
        </section>

        <section class="panel">
          <div class="panel-heading">
            <h2>Command Preview</h2>
            <span>${payload.commands.total} deployable commands</span>
          </div>
          <div class="tabs" role="tablist" aria-label="Command groups">
            <button class="tab" type="button" data-tab="community" aria-selected="true">Community</button>
            <button class="tab" type="button" data-tab="admin" aria-selected="false">Admin</button>
            <button class="tab" type="button" data-tab="developer" aria-selected="false">Developer</button>
          </div>
          ${commandTabs}
        </section>

      </div>

      <aside>
        <section class="panel">
          <div class="panel-heading">
            <h2>Admin Access</h2>
            <span>Admin + Dev</span>
          </div>
          <form class="presence-form" action="/api/access-users" method="post">
            <div class="field">
              <label for="adminUsers">Admin/developer user IDs</label>
              <textarea id="adminUsers" name="adminUsers" spellcheck="false" placeholder="123456789012345678">${escapeHtml(payload.config.editableAdminUsers)}</textarea>
            </div>
            <div class="field">
              <label for="errorDmUsers">Error DM user IDs</label>
              <textarea id="errorDmUsers" name="errorDmUsers" spellcheck="false" placeholder="1205738144323080214">${escapeHtml(payload.config.editableErrorDmUsers)}</textarea>
            </div>
            <button class="primary" type="submit">Save Admin Access</button>
            <p class="hint">Admin users can use bot admin commands and count as developer users. Server-specific admin roles are changed inside the Discord setup dashboard.</p>
          </form>
        </section>

        <section class="panel">
          <div class="panel-heading">
            <h2>Edit Presence</h2>
            <span>.env</span>
          </div>
          <form class="presence-form" action="/api/presence" method="post">
            <div class="field">
              <label for="presence">BOT_ACTIVITY</label>
              <input id="presence" name="presence" type="text" maxlength="${maxPresenceLength}" value="${escapeHtml(payload.config.presence)}" autocomplete="off" required>
            </div>
            <button class="primary" type="submit">Save Presence</button>
            <p class="hint">Saves to local <code>.env</code>. It does not deploy commands or restart the live bot.</p>
          </form>
        </section>

        <section class="panel">
          <div class="panel-heading">
            <h2>Preflight Checks</h2>
            <span>${payload.checks.filter((check) => check.ok).length}/${payload.checks.length} passing</span>
          </div>
          <div class="checks">
            ${payload.checks.map(renderCheck).join('')}
          </div>
        </section>

        <section class="panel">
          <div class="panel-heading">
            <h2>Safe Config</h2>
            <span>No secrets shown</span>
          </div>
          <table class="env-table">
            <tbody>
              ${renderConfigRow('Admin/developer users', `${payload.config.adminUserCount} (${payload.config.adminUsers.join(', ') || 'none'})`)}
              ${renderConfigRow('Error DM users', `${payload.config.errorDmUserCount} (${payload.config.errorDmUsers.join(', ') || 'none'})`)}
              ${renderConfigRow('Update subscribers', payload.config.updateSubscriberCount)}
              ${renderConfigRow('Last live version', payload.config.lastBotVersion ?? 'not recorded')}
              ${Object.entries(payload.env).map(([key, value]) => renderConfigRow(key, value)).join('')}
            </tbody>
          </table>
        </section>
      </aside>
    </div>
  </main>

  <script>
    const tabs = [...document.querySelectorAll('[data-tab]')];
    const panels = [...document.querySelectorAll('[data-panel]')];
    function setTab(name) {
      tabs.forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.tab === name)));
      panels.forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === name));
    }
    tabs.forEach((tab) => tab.addEventListener('click', () => setTab(tab.dataset.tab)));
    setTab('community');
  </script>
</body>
</html>`;
}

function renderProductionPortalHtml(payload, options = {}) {
  const route = normalizeWebRoute(options.route ?? 'home');
  const session = options.session ?? null;
  const manageableGuilds = session?.guilds?.length
    ? session.guilds.map((guild) => mergeDashboardGuild(guild, payload.guilds.find((row) => row.id === guild.id)))
    : payload.guilds;
  const activeGuildId = options.guildId ?? manageableGuilds[0]?.id ?? payload.guilds[0]?.id ?? '';
  const activeGuild = payload.guilds.find((guild) => guild.id === activeGuildId)
    ?? manageableGuilds.find((guild) => guild.id === activeGuildId)
    ?? manageableGuilds[0]
    ?? payload.guilds[0]
    ?? null;
  const inviteUrl = botInviteUrl(payload);
  const loginUrl = payload.oauth.configured ? '/login' : '/login?demo=1';
  const userAvatar = session?.user?.avatarUrl ?? '';
  const csrfToken = session?.csrfToken ?? '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(payload.package.name)} Control Platform</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0b0b0f;
      --bg2: #0a0a0a;
      --panel: rgba(20, 10, 14, 0.78);
      --panel-strong: rgba(33, 12, 18, 0.92);
      --line: rgba(209, 26, 58, 0.24);
      --line-strong: rgba(209, 26, 58, 0.5);
      --red: #d11a3a;
      --red-deep: #b3122f;
      --red-muted: #7a0f1f;
      --amber: #ffb020;
      --green: #36b36f;
      --text: #ffffff;
      --muted: #a1a1aa;
      --shadow: 0 24px 80px rgba(0, 0, 0, 0.38);
      --glow: 0 0 32px rgba(209, 26, 58, 0.28);
    }

    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      color: var(--text);
      background:
        radial-gradient(circle at 20% 0%, rgba(209, 26, 58, 0.2), transparent 34rem),
        radial-gradient(circle at 80% 20%, rgba(122, 15, 31, 0.18), transparent 30rem),
        linear-gradient(180deg, #0b0b0f 0%, #08070a 48%, #0a0a0a 100%);
      font-family: Inter, Geist, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.45;
      min-height: 100vh;
    }

    body::before {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      background-image:
        linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
      background-size: 42px 42px;
      mask-image: linear-gradient(180deg, rgba(0,0,0,0.75), transparent 76%);
    }

    a { color: inherit; }
    h1, h2, h3, p { margin: 0; }
    h1 { font-size: clamp(2.7rem, 8vw, 6.8rem); line-height: 0.92; letter-spacing: 0; }
    h2 { font-size: clamp(1.45rem, 3vw, 2.35rem); line-height: 1.05; letter-spacing: 0; }
    h3 { font-size: 1rem; letter-spacing: 0; }
    p, li, td, th, input, select, textarea, button { font-size: 0.95rem; }
    small, .muted { color: var(--muted); }

    .wrap { width: min(1180px, calc(100% - 32px)); margin: 0 auto; }
    .topbar {
      position: sticky;
      top: 0;
      z-index: 20;
      backdrop-filter: blur(18px);
      background: rgba(11, 11, 15, 0.76);
      border-bottom: 1px solid var(--line);
    }
    .nav {
      min-height: 72px;
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 18px;
    }
    .brand { display: inline-flex; gap: 10px; align-items: center; text-decoration: none; font-weight: 850; }
    .logo {
      width: 38px;
      height: 38px;
      display: grid;
      place-items: center;
      border-radius: 8px;
      border: 1px solid var(--line-strong);
      background: linear-gradient(145deg, #1b090d, #0c0c11);
      box-shadow: var(--glow);
      color: #fff;
      font-weight: 950;
    }
    .navlinks { display: flex; justify-content: center; gap: 6px; flex-wrap: wrap; }
    .navlinks a, .button, button {
      min-height: 38px;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 8px;
      background: rgba(255,255,255,0.045);
      color: var(--text);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 0 13px;
      text-decoration: none;
      font-weight: 750;
      transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
      cursor: pointer;
    }
    .navlinks a.active, .button.primary, button.primary {
      border-color: rgba(209,26,58,0.76);
      background: linear-gradient(180deg, #d11a3a, #9d132a);
      box-shadow: 0 0 28px rgba(209,26,58,0.24);
    }
    .button.secondary { border-color: var(--line); background: rgba(122,15,31,0.22); }
    .button:hover, button:hover, .navlinks a:hover {
      transform: translateY(-1px);
      border-color: var(--line-strong);
      box-shadow: var(--glow);
    }

    main { padding-bottom: 56px; }
    .hero {
      min-height: calc(100vh - 72px);
      display: grid;
      grid-template-columns: 1fr;
      gap: 34px;
      align-items: center;
      justify-items: center;
      text-align: center;
      padding: 56px 0 36px;
    }
    .eyebrow, .label {
      color: #ffccd5;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      font-size: 0.72rem;
      font-weight: 850;
    }
    .hero-copy { display: grid; gap: 22px; justify-items: center; max-width: 940px; }
    .hero-copy p { color: var(--muted); max-width: 64ch; font-size: 1.06rem; }
    .hero-actions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
    .status-strip {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      padding: 10px;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: rgba(255,255,255,0.035);
      width: fit-content;
    }
    .status-pill, .badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 30px;
      padding: 0 10px;
      border-radius: 999px;
      background: rgba(255,255,255,0.055);
      border: 1px solid rgba(255,255,255,0.08);
      color: var(--muted);
      font-weight: 750;
    }
    .dot {
      width: 9px;
      height: 9px;
      border-radius: 999px;
      background: var(--red);
      box-shadow: 0 0 0 rgba(209,26,58,0.5);
      animation: pulse 1.8s infinite;
    }
    .dot.ok { background: var(--green); box-shadow: 0 0 0 rgba(54,179,111,0.5); }
    .dot.warn { background: var(--amber); box-shadow: 0 0 0 rgba(255,176,32,0.45); }
    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 currentColor; }
      70% { box-shadow: 0 0 0 9px transparent; }
      100% { box-shadow: 0 0 0 0 transparent; }
    }

    .ops-visual, .panel, .metric, .feature-card, .command-card, .guild-card, .doc-block {
      border: 1px solid var(--line);
      background: linear-gradient(180deg, rgba(30, 13, 18, 0.82), rgba(10, 10, 12, 0.78));
      box-shadow: var(--shadow);
      backdrop-filter: blur(18px);
    }
    .ops-visual { border-radius: 14px; padding: 18px; display: grid; gap: 14px; width: min(900px, 100%); text-align: left; }
    .ops-head { display: flex; justify-content: space-between; align-items: center; gap: 14px; }
    .ops-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .metric { border-radius: 10px; padding: 14px; }
    .metric strong { display: block; font-size: 1.45rem; margin-top: 3px; }
    .log-lines { display: grid; gap: 8px; font-family: Consolas, "SFMono-Regular", monospace; color: #f5d7dd; }
    .log-lines span { border-left: 2px solid var(--red); padding-left: 10px; color: var(--muted); }

    .section { padding: 42px 0; }
    .section-head { display: flex; justify-content: space-between; align-items: end; gap: 18px; margin-bottom: 16px; }
    .section-head p { max-width: 64ch; color: var(--muted); }
    .feature-grid, .status-grid, .dashboard-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
    .feature-card, .command-card, .guild-card, .doc-block, .panel { border-radius: 12px; padding: 16px; }
    .feature-card { min-height: 154px; display: grid; align-content: start; gap: 9px; }
    .feature-card .icon { width: 34px; height: 34px; border-radius: 8px; display: grid; place-items: center; background: rgba(209,26,58,0.15); border: 1px solid var(--line); color: #fff; font-weight: 900; }

    .page { display: none; padding-top: 34px; }
    .page.active { display: block; }
    .page-title { display: grid; gap: 10px; margin-bottom: 18px; }
    .page-title p { color: var(--muted); max-width: 76ch; }
    .two-col { display: grid; grid-template-columns: minmax(0, 0.72fr) minmax(330px, 0.28fr); gap: 16px; align-items: start; }
    .sidebar-layout { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 16px; align-items: start; }
    .sidebar { position: sticky; top: 90px; display: grid; gap: 8px; }
    .side-link { justify-content: flex-start; width: 100%; }
    .search {
      width: 100%;
      min-height: 44px;
      border: 1px solid var(--line);
      border-radius: 10px;
      color: var(--text);
      background: rgba(255,255,255,0.055);
      padding: 0 13px;
      font: inherit;
      outline: none;
    }
    .search:focus, input:focus, select:focus, textarea:focus { border-color: var(--line-strong); box-shadow: var(--glow); }
    .command-list { display: grid; gap: 10px; margin-top: 12px; }
    .command-card { display: grid; gap: 8px; }
    .command-meta { display: flex; flex-wrap: wrap; gap: 8px; }
    code { color: #ffd5dc; background: rgba(209,26,58,0.13); border: 1px solid rgba(209,26,58,0.22); border-radius: 6px; padding: 2px 6px; }

    .dashboard-shell { display: grid; grid-template-columns: 250px minmax(0, 1fr); gap: 16px; }
    .profile { display: flex; align-items: center; gap: 12px; }
    .avatar { width: 42px; height: 42px; border-radius: 10px; object-fit: cover; background: var(--red-muted); border: 1px solid var(--line); }
    .guild-list { display: grid; gap: 10px; }
    .guild-card { display: flex; align-items: center; justify-content: space-between; gap: 12px; text-decoration: none; }
    .quick-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
    .quick-tile { min-height: 104px; justify-content: flex-start; align-items: flex-start; flex-direction: column; text-align: left; border-color: var(--line); background: rgba(122,15,31,0.18); }
    .settings-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .setting-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 0; border-top: 1px solid rgba(255,255,255,0.06); }
    .switch { width: 46px; height: 25px; border-radius: 999px; padding: 3px; border: 1px solid var(--line); background: rgba(255,255,255,0.08); }
    .switch span { display: block; width: 17px; height: 17px; border-radius: 999px; background: var(--muted); transition: transform 160ms ease, background 160ms ease; }
    .switch.on { background: rgba(209,26,58,0.24); }
    .switch.on span { transform: translateX(20px); background: var(--red); box-shadow: 0 0 18px rgba(209,26,58,0.45); }
    .field { display: grid; gap: 6px; margin-top: 12px; }
    .field label { color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.72rem; font-weight: 850; }
    input, select, textarea {
      width: 100%;
      min-height: 40px;
      border: 1px solid var(--line);
      border-radius: 8px;
      color: var(--text);
      background: rgba(255,255,255,0.055);
      padding: 9px 10px;
      font: inherit;
    }
    textarea { resize: vertical; min-height: 86px; }
    .toast {
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 40;
      display: none;
      max-width: 340px;
      border: 1px solid var(--line-strong);
      border-radius: 10px;
      background: rgba(18, 9, 13, 0.94);
      padding: 12px 14px;
      box-shadow: var(--glow);
    }
    .toast.show { display: block; }

    .save-banner {
      margin: 16px 0 0;
      border: 1px solid rgba(54,179,111,0.35);
      border-left: 4px solid var(--green);
      border-radius: 10px;
      background: rgba(54,179,111,0.08);
      padding: 12px 14px;
    }
    .hide-mobile { display: inline-flex; }

    @media (max-width: 920px) {
      .nav { grid-template-columns: 1fr; padding: 12px 0; }
      .navlinks { justify-content: flex-start; }
      .hero, .two-col, .sidebar-layout, .dashboard-shell { grid-template-columns: 1fr; }
      .feature-grid, .status-grid, .dashboard-grid, .settings-grid, .ops-grid, .quick-grid { grid-template-columns: 1fr; }
      .sidebar { position: static; }
      h1 { font-size: clamp(2.45rem, 15vw, 4.7rem); }
    }
  </style>
</head>
<body data-route="${escapeHtml(route)}">
  <header class="topbar">
    <nav class="wrap nav" aria-label="Main navigation">
      <a class="brand" href="/" data-route-link="home"><span class="logo">P</span><span>${escapeHtml(payload.package.name)}</span></a>
      <div class="navlinks">
        ${navLink('home', 'Home', route)}
        ${navLink('status', 'Status', route)}
        ${navLink('commands', 'Commands', route)}
        ${navLink('docs', 'Docs', route)}
        ${navLink('dashboard', 'Dashboard', route)}
      </div>
      <div class="hero-actions">
        <a class="button secondary" href="${escapeHtml(inviteUrl)}">Invite Bot</a>
        ${session ? `<a class="button" href="/logout">Logout</a>` : `<a class="button primary" href="${escapeHtml(loginUrl)}">Login with Discord</a>`}
      </div>
    </nav>
  </header>

  <main class="wrap">
    ${options.saved ? renderSavedBanner(options.saved) : ''}
    <section class="page ${route === 'home' ? 'active' : ''}" data-page="home">
      <div class="hero">
        <div class="hero-copy">
          <span class="eyebrow">Production bot platform</span>
          <h1>Run your Discord server like a live control room.</h1>
          <p>${escapeHtml(payload.package.description || 'A premium Discord bot platform for community systems, creator alerts, moderation, counters, and operational visibility.')}</p>
          <div class="hero-actions">
            <a class="button primary" href="${escapeHtml(inviteUrl)}">Invite Bot</a>
            <a class="button secondary" href="${escapeHtml(loginUrl)}">Login with Discord</a>
            <a class="button" href="/commands" data-route-link="commands">View Commands</a>
          </div>
          <div class="status-strip">
            <span class="status-pill"><span class="dot ${payload.status.online ? 'ok' : ''}" data-live-dot></span><span data-live-status>${payload.status.online ? 'Bot online' : 'Bot offline'}</span></span>
            <span class="status-pill">Uptime <span data-live-uptime>${escapeHtml(payload.status.uptimeLabel)}</span></span>
            <span class="status-pill"><span data-live-guilds>${payload.status.guildCount}</span> guilds</span>
          </div>
        </div>
        <aside class="ops-visual" aria-label="Live operations preview">
          <div class="ops-head">
            <div>
              <span class="label">Live system</span>
              <h2>Operations Console</h2>
            </div>
            <span class="badge"><span class="dot ${payload.status.online ? 'ok' : 'warn'}"></span>${escapeHtml(payload.status.overallHealth)}</span>
          </div>
          <div class="ops-grid">
            ${renderMetric('Commands', payload.commands.total)}
            ${renderMetric('Guild Configs', payload.config.guildCount)}
            ${renderMetric('Error Rate', `<span data-live-error>${escapeHtml(payload.metrics.errorRate)}</span>`, { raw: true })}
            ${renderMetric('Last Event', payload.status.lastEventLabel)}
          </div>
          <div class="log-lines">
            <span>[streams] twitch/youtube/tiktok monitors synced</span>
            <span>[counters] voice channel stats ready</span>
            <span>[dashboard] guild config bridge online</span>
          </div>
        </aside>
      </div>

      <section class="section">
        <div class="section-head">
          <div>
            <span class="eyebrow">Modules</span>
            <h2>Everything server owners expect.</h2>
          </div>
          <p>Stream tracking, counters, moderation, analytics, and community commands are presented as one clean operating system.</p>
        </div>
        <div class="feature-grid">${renderFeatureCards()}</div>
      </section>
    </section>

    <section class="page ${route === 'status' ? 'active' : ''}" data-page="status">
      ${renderStatusPage(payload)}
    </section>

    <section class="page ${route === 'commands' ? 'active' : ''}" data-page="commands">
      ${renderCommandsPage(payload)}
    </section>

    <section class="page ${route === 'docs' ? 'active' : ''}" data-page="docs">
      ${renderDocsPage(payload)}
    </section>

    <section class="page ${route === 'dashboard' ? 'active' : ''}" data-page="dashboard">
      ${renderDashboardPage(payload, { session, manageableGuilds, activeGuild, userAvatar })}
    </section>
  </main>

  <div class="toast" id="toast" role="status"></div>

  <script>
    const initialRoute = ${JSON.stringify(route)};
    const csrfToken = ${JSON.stringify(csrfToken)};
    const commandSearch = document.querySelector('[data-command-search]');
    const commandCards = [...document.querySelectorAll('[data-command-card]')];
    const toast = document.getElementById('toast');

    function showToast(message) {
      toast.textContent = message;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2800);
    }

    function setRoute(route) {
      document.querySelectorAll('[data-page]').forEach((page) => page.classList.toggle('active', page.dataset.page === route));
      document.querySelectorAll('[data-route-link]').forEach((link) => link.classList.toggle('active', link.dataset.routeLink === route));
      history.replaceState(null, '', route === 'home' ? '/' : '/' + route);
    }

    document.querySelectorAll('[data-route-link]').forEach((link) => {
      link.addEventListener('click', (event) => {
        const route = link.dataset.routeLink;
        if (!route) return;
        event.preventDefault();
        setRoute(route);
      });
    });
    setRoute(initialRoute);

    if (commandSearch) {
      commandSearch.addEventListener('input', () => {
        const query = commandSearch.value.trim().toLowerCase();
        commandCards.forEach((card) => {
          const haystack = card.dataset.search || '';
          card.style.display = haystack.includes(query) ? '' : 'none';
        });
      });
    }

    document.querySelectorAll('[data-api-post]').forEach((button) => {
      button.addEventListener('click', async () => {
        const payload = JSON.parse(button.dataset.payload || '{}');
        const response = await fetch(button.dataset.apiPost, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json', 'x-csrf-token': csrfToken },
          body: JSON.stringify(payload)
        });
        const data = await response.json().catch(() => ({}));
        showToast(data.ok ? 'Settings synced.' : (data.error || 'Request failed.'));
      });
    });

    if (window.EventSource) {
      const events = new EventSource('/events');
      events.addEventListener('status', (event) => {
        const status = JSON.parse(event.data);
        document.querySelectorAll('[data-live-status]').forEach((node) => {
          node.textContent = status.online ? 'Bot online' : 'Bot offline';
        });
        document.querySelectorAll('[data-live-dot]').forEach((node) => {
          node.classList.toggle('ok', Boolean(status.online));
          node.classList.toggle('warn', !status.online);
        });
        document.querySelectorAll('[data-live-uptime]').forEach((node) => { node.textContent = status.uptimeLabel; });
        document.querySelectorAll('[data-live-guilds]').forEach((node) => { node.textContent = status.guildCount; });
        document.querySelectorAll('[data-live-error]').forEach((node) => { node.textContent = status.errorRate; });
      });
    }
  </script>
</body>
</html>`;
}

function navLink(route, label, activeRoute) {
  const href = route === 'home' ? '/' : `/${route}`;
  return `<a href="${href}" data-route-link="${route}" class="${activeRoute === route ? 'active' : ''}">${label}</a>`;
}

function renderSavedBanner(saved) {
  const copy = saved === 'presence'
    ? 'Presence saved to .env.'
    : saved === 'access-users'
      ? 'Access users saved to config.'
      : 'Settings saved.';
  return `<section class="save-banner"><strong>${escapeHtml(copy)}</strong></section>`;
}

function renderMetric(label, value) {
  return `<div class="metric"><small>${escapeHtml(label)}</small><strong>${escapeHtml(String(value))}</strong></div>`;
}

function renderFeatureCards() {
  const features = [
    ['ST', 'Stream Tracking', 'Twitch, YouTube, and TikTok alerts with previewable embeds and one-alert-per-event protection.'],
    ['CT', 'Counter System', 'Dynamic voice counters for members, activity, verification, boosts, and server growth.'],
    ['MD', 'Moderation Tools', 'Warnings, timeouts, lockdowns, AutoMod, and safe staff workflows.'],
    ['LG', 'Logging & Analytics', 'Readable event logs, command telemetry, and setup health snapshots.'],
    ['FN', 'Community Commands', 'Profiles, economy, games, suggestions, socials, and utility commands.']
  ];
  return features.map(([icon, title, copy]) => `
    <article class="feature-card">
      <span class="icon">${icon}</span>
      <h3>${escapeHtml(title)}</h3>
      <p class="muted">${escapeHtml(copy)}</p>
    </article>`).join('');
}

function renderStatusPage(payload) {
  const status = payload.status;
  return `
    <div class="page-title">
      <span class="eyebrow">Public operations</span>
      <h1>System Status</h1>
      <p>Live health summary for bot uptime, API checks, stream monitors, counters, and event processing. Sensitive stack traces stay out of the public view.</p>
    </div>
    <div class="status-grid">
      ${renderMetric('Bot State', status.online ? 'Online' : 'Offline')}
      ${renderMetric('Uptime', status.uptimeLabel)}
      ${renderMetric('Active Guilds', status.guildCount)}
      ${renderMetric('Error Rate', payload.metrics.errorRate)}
    </div>
    <section class="section two-col">
      <div class="panel">
        <div class="section-head"><div><span class="eyebrow">Subsystems</span><h2>Health indicators</h2></div></div>
        ${renderHealthRows(status.systems)}
      </div>
      <aside class="panel">
        <div class="section-head"><div><span class="eyebrow">APIs</span><h2>Provider checks</h2></div></div>
        ${renderHealthRows(status.apis)}
        <div class="setting-row"><span>Last event</span><strong>${escapeHtml(status.lastEventLabel)}</strong></div>
      </aside>
    </section>`;
}

function renderHealthRows(items) {
  return Object.values(items).map((item) => `
    <div class="setting-row">
      <span>${escapeHtml(item.label)}</span>
      <span class="badge"><span class="dot ${item.state === 'operational' ? 'ok' : item.state === 'degraded' ? 'warn' : ''}"></span>${escapeHtml(item.state)}</span>
    </div>`).join('');
}

function renderCommandsPage(payload) {
  const categories = ['Fun', 'Moderation', 'Stream', 'Utility', 'Dev'];
  return `
    <div class="page-title">
      <span class="eyebrow">Command terminal catalog</span>
      <h1>Commands</h1>
      <p>Search the live command registry. Command metadata is generated from the bot command definitions so the docs stay aligned with deploys.</p>
    </div>
    <div class="sidebar-layout">
      <aside class="sidebar panel">
        <input class="search" data-command-search placeholder="Search commands..." autocomplete="off">
        ${categories.map((category) => `<a class="button side-link" href="#cmd-${category.toLowerCase()}">${category}</a>`).join('')}
      </aside>
      <div class="command-list">
        ${categories.map((category) => renderCommandCategory(category, payload.commands.explorerCategories[category.toLowerCase()] ?? [])).join('')}
      </div>
    </div>`;
}

function renderCommandCategory(category, rows) {
  return `
    <section id="cmd-${category.toLowerCase()}" class="panel">
      <div class="section-head"><div><span class="eyebrow">${escapeHtml(category)}</span><h2>${escapeHtml(category)} Commands</h2></div><p>${rows.length} command(s)</p></div>
      <div class="command-list">
        ${rows.map(renderCommandDocCard).join('') || '<p class="muted">No commands in this category yet.</p>'}
      </div>
    </section>`;
}

function renderCommandDocCard(command) {
  const search = `${command.name} ${command.description} ${command.category} ${command.usage}`.toLowerCase();
  return `
    <article class="command-card" data-command-card data-search="${escapeHtml(search)}">
      <div class="section-head">
        <div><h3><code>/${escapeHtml(command.name)}</code></h3><p class="muted">${escapeHtml(command.description)}</p></div>
        <span class="badge">${escapeHtml(command.cooldown)}</span>
      </div>
      <div class="command-meta">
        <span class="badge">Usage ${escapeHtml(command.usage)}</span>
        <span class="badge">Options ${escapeHtml(command.options.join(', ') || 'none')}</span>
        <span class="badge">Example ${escapeHtml(command.examples[0])}</span>
      </div>
    </article>`;
}

function renderDocsPage(payload) {
  return `
    <div class="page-title">
      <span class="eyebrow">Documentation</span>
      <h1>Setup Guide</h1>
      <p>Everything needed to invite, configure, and operate the bot from the web dashboard or Discord dashboard.</p>
    </div>
    <div class="dashboard-grid">
      ${renderDocBlock('Invite Bot', `Use the Invite Bot button, grant bot and applications.commands scopes, then open /dashboard in Discord or this web dashboard.`)}
      ${renderDocBlock('Connect Discord', `Login with Discord OAuth. The dashboard only shows servers where you have Administrator or Manage Server.`)}
      ${renderDocBlock('Configure Modules', `Use guild settings for stream alerts, counters, feature flags, moderation, logging, and safe mode.`)}
      ${renderDocBlock('Troubleshooting', `Check the public status page first. Command and dashboard errors stay summarized publicly while detailed errors remain private.`)}
      ${renderDocBlock('Security', `Secrets are never rendered. Mutating API routes require an authenticated session and guild RBAC.`)}
      ${renderDocBlock('Live Sync', `The browser subscribes to Server-Sent Events for status, counter, stream, and error summary updates.`)}
    </div>
    <section class="panel section">
      <div class="section-head"><div><span class="eyebrow">Release</span><h2>${escapeHtml(payload.latestChangelog.title)}</h2></div></div>
      <pre>${escapeHtml(payload.latestChangelog.body || 'No changelog entry found.')}</pre>
    </section>`;
}

function renderDocBlock(title, body) {
  return `<article class="doc-block"><h3>${escapeHtml(title)}</h3><p class="muted">${escapeHtml(body)}</p></article>`;
}

function renderDashboardPage(payload, { session, manageableGuilds, activeGuild, userAvatar }) {
  if (!session) {
    return `
      <div class="page-title">
        <span class="eyebrow">Secure dashboard</span>
        <h1>Login required for guild management.</h1>
        <p>The public site is open, but server configuration requires Discord OAuth and Manage Server or Administrator permissions.</p>
      </div>
      <a class="button primary" href="${payload.oauth.configured ? '/login' : '/login?demo=1'}">Login with Discord</a>
      ${payload.localOnly ? renderLocalOperatorTools(payload) : ''}`;
  }

  return `
    <div class="dashboard-shell">
      <aside class="panel sidebar">
        <div class="profile">
          ${userAvatar ? `<img class="avatar" src="${escapeHtml(userAvatar)}" alt="">` : '<span class="avatar"></span>'}
          <div><strong>${escapeHtml(session.user.username)}</strong><p class="muted">${escapeHtml(session.user.id)}</p></div>
        </div>
        <div class="guild-list">
          ${manageableGuilds.map((guild) => `<a class="guild-card" href="/dashboard/guild/${guild.id}"><span>${escapeHtml(guild.name)}</span><span class="badge">${guild.manageable ? 'Manage' : 'View'}</span></a>`).join('') || '<p class="muted">No manageable guilds found.</p>'}
        </div>
      </aside>
      <section>
        ${activeGuild ? renderGuildDashboard(activeGuild) : '<section class="panel"><h2>No guild selected</h2><p class="muted">Select a manageable server to configure modules.</p></section>'}
      </section>
    </div>`;
}

function renderLocalOperatorTools(payload) {
  return `
    <section class="section two-col">
      <div class="panel">
        <span class="eyebrow">Local operator tools</span>
        <h2>Preview-safe configuration</h2>
        <p class="muted">These controls only write local preview files. Guild management still requires Discord OAuth through the dashboard APIs, including POST /safe-mode and POST /guild/:id/config.</p>
        <form class="field" action="/api/access-users" method="post">
          <label for="adminUsers">Admin/developer user IDs</label>
          <textarea id="adminUsers" name="adminUsers" spellcheck="false" placeholder="123456789012345678">${escapeHtml(payload.config.editableAdminUsers)}</textarea>
          <label for="errorDmUsers">Error DM user IDs</label>
          <textarea id="errorDmUsers" name="errorDmUsers" spellcheck="false" placeholder="1205738144323080214">${escapeHtml(payload.config.editableErrorDmUsers)}</textarea>
          <button class="button primary" type="submit">Save Admin Access</button>
        </form>
      </div>
      <aside class="panel">
        <span class="eyebrow">Presence</span>
        <h2>Edit bot presence</h2>
        <form class="field" action="/api/presence" method="post">
          <label for="presence">BOT_ACTIVITY</label>
          <input id="presence" name="presence" type="text" maxlength="${maxPresenceLength}" value="${escapeHtml(payload.config.presence)}" autocomplete="off" required>
          <button class="button primary" type="submit">Save Presence</button>
        </form>
      </aside>
    </section>`;
}

function renderGuildDashboard(guild) {
  const safeModePayload = htmlJsonAttribute({ guildId: guild.id, enabled: !guild.safeMode });
  const syncPayload = htmlJsonAttribute({ guildId: guild.id, action: 'sync' });
  return `
    <div class="page-title">
      <span class="eyebrow">Guild control panel</span>
      <h1>${escapeHtml(guild.name)}</h1>
      <p>Member count ${escapeHtml(String(guild.memberCount ?? 'Unknown'))}. Bot status: ${guild.botInGuild ? 'installed' : 'not detected'}.</p>
    </div>
    <div class="settings-grid">
      ${renderSettingsPanel('Stream Notifications', [
        ['Twitch', guild.streams.twitch, 'twitch'],
        ['YouTube', guild.streams.youtube, 'youtube'],
        ['TikTok', guild.streams.tiktok, 'tiktok']
      ], '/feature-flags', guild.id)}
      ${renderSettingsPanel('Counter System', [
        ['Counters Enabled', guild.counters.enabled, 'counters'],
        ['Auto Repair', guild.counters.autoRepair, 'counterRepair'],
        ['Live Updates', true, 'counterLive']
      ], '/feature-flags', guild.id)}
      ${renderSettingsPanel('Feature Flags', Object.entries(guild.featureFlags).map(([name, value]) => [titleCase(name), value, name]), '/feature-flags', guild.id)}
      ${renderSettingsPanel('Moderation Settings', [
        ['AutoMod', guild.moderation.automod, 'automod'],
        ['Logging', guild.moderation.logging, 'logging'],
        ['Warnings', guild.moderation.warnings, 'warnings']
      ], '/guild/' + guild.id + '/config', guild.id)}
      <section class="panel">
        <span class="eyebrow">Safe Mode</span>
        <h2>Risk Kill Switch</h2>
        <p class="muted">Instantly disables risky systems for this guild while keeping public information available.</p>
        <div class="setting-row">
          <span>Safe Mode</span>
          <button class="button ${guild.safeMode ? '' : 'primary'}" data-api-post="/safe-mode" data-payload="${safeModePayload}">${guild.safeMode ? 'Disable' : 'Enable'}</button>
        </div>
      </section>
      <section class="panel">
        <span class="eyebrow">Live Config</span>
        <h2>Quick Sync</h2>
        <div class="field"><label>Notification channel</label><input value="${escapeHtml(guild.streams.channelId ?? '')}" placeholder="Discord channel ID"></div>
        <div class="field"><label>Counter update frequency</label><select><option>${escapeHtml(guild.counters.refreshLabel)}</option><option>5 minutes</option><option>10 minutes</option><option>30 minutes</option></select></div>
        <button class="button primary" data-api-post="/guild/${guild.id}/config" data-payload="${syncPayload}">Sync Settings</button>
      </section>
    </div>`;
}

function renderSettingsPanel(title, rows, endpoint, guildId) {
  return `
    <section class="panel">
      <span class="eyebrow">${escapeHtml(title)}</span>
      <h2>${escapeHtml(title)}</h2>
      ${rows.map(([name, enabled, key]) => `
        <div class="setting-row">
          <span>${escapeHtml(name)}</span>
          <button class="switch ${enabled ? 'on' : ''}" data-api-post="${escapeHtml(endpoint)}" data-payload="${htmlJsonAttribute({ guildId, setting: key ?? name, enabled: !enabled })}" aria-label="Toggle ${escapeHtml(name)}"><span></span></button>
        </div>`).join('')}
    </section>`;
}

function createCommandDocs(commandRows) {
  return commandRows
    .map((command) => {
      const category = commandExplorerCategory(command);
      const optionNames = command.options.slice(0, 8);
      const usage = optionNames.length
        ? `/${command.name} ${optionNames.map((option) => `<${option}>`).join(' ')}`
        : `/${command.name}`;
      return {
        name: command.name,
        description: command.description || 'No description available.',
        category,
        usage,
        options: optionNames,
        cooldown: command.category === 'developer' ? 'Owner only' : command.category === 'admin' ? '5s staff' : '3s',
        examples: createCommandExamples(command.name, usage)
      };
    })
    .sort((left, right) => left.category.localeCompare(right.category) || left.name.localeCompare(right.name));
}

function groupCommandDocs(commandDocs) {
  return commandDocs.reduce((grouped, command) => {
    grouped[command.category.toLowerCase()] ??= [];
    grouped[command.category.toLowerCase()].push(command);
    return grouped;
  }, {});
}

function commandExplorerCategory(command) {
  if (command.category === 'developer' || /^(dev|devdashboard|feature|leak)$/i.test(command.name)) return 'Dev';
  if (/^(twitch|youtube|tiktok|social|stream|notify|preview)$/i.test(command.name)) return 'Stream';
  if (/^(ban|banid|unban|kick|timeout|unmute|warn|warnings|clearwarns|purge|clean|lockdown|unlockdown|lockdownserver|unlockdownserver|case|modnote|modlogs|massban|softban|tempban|tempbans|verification|reactionrole|welcome|sticky|setlogchannel|logtest|permissions|role|slowmode|nick|automod|counter|moderation|security|staff)$/i.test(command.name)) return 'Moderation';
  if (/^(info|serverinfo|userinfo|avatar|uptime|membercount|servericon|serverbanner|invite|botinfo|roleinfo|channelinfo|password|commands|owner|setup|dashboard|admincommands)$/i.test(command.name)) return 'Utility';
  return 'Fun';
}

function createCommandExamples(commandName, usage) {
  const examples = {
    twitch: ['/twitch status', '/twitch preview event:live'],
    youtube: ['/youtube status', '/youtube check'],
    tiktok: ['/tiktok status', '/tiktok preview'],
    counter: ['/counter list', '/counter template template:Community'],
    dashboard: ['/dashboard'],
    verification: ['/verification send'],
    suggestion: ['/suggestion text:Add more community games'],
    bug: ['/bug urgency:High description:Dashboard button failed'],
    fun: ['/fun coinflip', '/fun poll question:Pizza tonight?'],
    info: ['/info server', '/info user'],
    social: ['/social list', '/social bulk']
  };
  return examples[commandName] ?? [usage];
}

function createStatusPayload({ cwd, config, packageJson, commandRows, env = {} }) {
  const lockPath = path.join(cwd, 'discordbot.lock');
  const pid = Number(readText(lockPath).trim());
  const online = Number.isInteger(pid) && pid > 0 && isPidRunning(pid);
  const lockMtime = readFileMtime(lockPath);
  const uptimeMs = online && lockMtime ? Math.max(0, Date.now() - lockMtime.getTime()) : 0;
  const guilds = Object.values(config.guilds ?? {});
  const streamEnabled = guilds.some((guild) => guild?.twitch?.enabled || guild?.youtube?.enabled || guild?.tiktok?.enabled);
  const countersEnabled = guilds.some((guild) => guild?.counters?.enabled !== false && Object.keys(guild?.counters?.counters ?? {}).length);
  const logsEnabled = guilds.some((guild) => guild?.logsEnabled);
  const lastEventAt = latestConfigTimestamp(config) ?? lockMtime?.toISOString() ?? null;

  return {
    online,
    pid: online ? pid : null,
    packageVersion: packageJson.version ?? 'unknown',
    commandCount: commandRows.length,
    guildCount: Object.keys(config.guilds ?? {}).length,
    uptimeMs,
    uptimeLabel: uptimeMs ? formatDuration(uptimeMs) : 'Offline',
    overallHealth: online ? 'operational' : 'degraded',
    lastEventAt,
    lastEventLabel: lastEventAt ? formatRelativeTime(lastEventAt) : 'No recent events',
    systems: {
      stream: { label: 'Stream system', state: streamEnabled ? 'operational' : 'standby' },
      counter: { label: 'Counter system', state: countersEnabled ? 'operational' : 'standby' },
      event: { label: 'Event system', state: online ? 'operational' : 'degraded' },
      logging: { label: 'Logging pipeline', state: logsEnabled ? 'operational' : 'standby' }
    },
    apis: {
      discord: { label: 'Discord', state: env.DISCORD_TOKEN ? 'operational' : 'degraded' },
      twitch: { label: 'Twitch', state: env.TWITCH_CLIENT_ID ? 'operational' : 'standby' },
      youtube: { label: 'YouTube', state: env.YOUTUBE_API_KEY ? 'operational' : 'standby' },
      tiktok: { label: 'TikTok', state: streamEnabled ? 'operational' : 'standby' }
    }
  };
}

function createMetricsPayload({ config, commandRows, status }) {
  const guilds = Object.values(config.guilds ?? {});
  const enabledCounters = guilds.reduce((total, guild) => total + Object.values(guild?.counters?.counters ?? {}).filter((counter) => counter?.enabled !== false).length, 0);
  const streamGuilds = guilds.filter((guild) => guild?.twitch?.enabled || guild?.youtube?.enabled || guild?.tiktok?.enabled).length;
  const automodGuilds = guilds.filter((guild) => guild?.automod?.intensity && guild.automod.intensity !== 'off').length;
  return {
    generatedAt: new Date().toISOString(),
    uptimeMs: status.uptimeMs,
    uptimeLabel: status.uptimeLabel,
    guildCount: status.guildCount,
    commandCount: commandRows.length,
    enabledCounters,
    streamGuilds,
    automodGuilds,
    errorRate: estimateErrorRate(),
    lastEventAt: status.lastEventAt,
    health: status.overallHealth
  };
}

function createGuildDashboardRows(config) {
  return Object.entries(config.guilds ?? {})
    .filter(([guildId]) => /^\d{17,20}$/.test(guildId))
    .map(([guildId, guild]) => mergeDashboardGuild({ id: guildId }, dashboardGuildFromConfig(guildId, guild)));
}

function dashboardGuildFromConfig(guildId, guild = {}) {
  const twitchEnabled = Boolean(guild.twitch?.enabled || guild.twitch?.streamers?.some((streamer) => streamer?.enabled !== false));
  const youtubeEnabled = Boolean(guild.youtube?.enabled);
  const tiktokEnabled = Boolean(guild.tiktok?.enabled);
  const streamsEnabled = twitchEnabled || youtubeEnabled || tiktokEnabled;
  const counters = guild.counters ?? {};
  return {
    id: guildId,
    name: guild.name ?? guild.displayName ?? `Guild ${guildId.slice(-4)}`,
    iconUrl: guild.iconUrl ?? null,
    memberCount: guild.memberCount ?? guild.lastMemberCount ?? null,
    botInGuild: true,
    manageable: true,
    streams: {
      twitch: twitchEnabled,
      youtube: youtubeEnabled,
      tiktok: tiktokEnabled,
      channelId: guild.twitch?.announceChannelId ?? guild.youtube?.announceChannelId ?? guild.tiktok?.announceChannelId ?? null
    },
    counters: {
      enabled: counters.enabled !== false,
      autoRepair: true,
      refreshLabel: formatInterval(counters.refreshIntervalMs ?? 600000)
    },
    featureFlags: {
      streams: streamsEnabled,
      counters: counters.enabled !== false,
      moderation: Boolean(guild.automod?.intensity && guild.automod.intensity !== 'off'),
      logging: Boolean(guild.logsEnabled),
      fun: guild.featureFlags?.funCommands !== false
    },
    moderation: {
      automod: Boolean(guild.automod?.intensity && guild.automod.intensity !== 'off'),
      logging: Boolean(guild.logsEnabled),
      warnings: true
    },
    safeMode: Boolean(guild.safeMode || guild.expansion?.security?.panic)
  };
}

function mergeDashboardGuild(guild, configGuild = null) {
  const base = configGuild ?? dashboardGuildFromConfig(guild.id, {});
  return {
    ...base,
    ...guild,
    name: guild.name ?? base.name,
    iconUrl: guild.iconUrl ?? base.iconUrl,
    memberCount: guild.memberCount ?? base.memberCount,
    botInGuild: guild.botInGuild ?? base.botInGuild,
    manageable: guild.manageable ?? true,
    streams: { ...base.streams, ...(guild.streams ?? {}) },
    counters: { ...base.counters, ...(guild.counters ?? {}) },
    featureFlags: { ...base.featureFlags, ...(guild.featureFlags ?? {}) },
    moderation: { ...base.moderation, ...(guild.moderation ?? {}) },
    safeMode: guild.safeMode ?? base.safeMode
  };
}

function createOAuthPayload(env = {}) {
  const clientId = env.DISCORD_CLIENT_ID ?? env.CLIENT_ID ?? env.DISCORD_APPLICATION_ID ?? '';
  const clientSecret = env.DISCORD_CLIENT_SECRET ?? env.DISCORD_OAUTH_CLIENT_SECRET ?? '';
  const redirectUri = env.DISCORD_REDIRECT_URI ?? env.DISCORD_OAUTH_REDIRECT_URI ?? '';
  return {
    configured: Boolean(clientId && clientSecret),
    clientIdConfigured: Boolean(clientId),
    clientSecretConfigured: Boolean(clientSecret),
    redirectConfigured: Boolean(redirectUri),
    redirectUri: redirectUri ? '[configured]' : 'auto-local',
    loginUrl: '/login',
    inviteUrl: clientId
      ? `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(clientId)}&permissions=8&scope=bot%20applications.commands`
      : '#invite-not-configured'
  };
}

function createFeatureFlagSummary(config) {
  const rows = createGuildDashboardRows(config);
  return {
    guilds: rows.length,
    streams: rows.filter((guild) => guild.featureFlags.streams).length,
    counters: rows.filter((guild) => guild.featureFlags.counters).length,
    moderation: rows.filter((guild) => guild.featureFlags.moderation).length,
    logging: rows.filter((guild) => guild.featureFlags.logging).length,
    fun: rows.filter((guild) => guild.featureFlags.fun).length
  };
}

function normalizeWebRoute(route) {
  const clean = String(route ?? 'home').replace(/^\/+/, '').split('/')[0] || 'home';
  return ['home', 'status', 'commands', 'docs', 'dashboard'].includes(clean) ? clean : 'home';
}

function botInviteUrl(payload) {
  return payload.oauth?.inviteUrl && payload.oauth.inviteUrl !== '#invite-not-configured'
    ? payload.oauth.inviteUrl
    : 'https://discord.com/developers/applications';
}

function htmlJsonAttribute(value) {
  return escapeHtml(JSON.stringify(value));
}

export function createPreviewServer({ cwd = process.cwd() } = {}) {
  const rateLimiter = createRateLimiter();

  return http.createServer(async (request, response) => {
    try {
      setSecurityHeaders(response);
      const url = new URL(request.url ?? '/', 'http://localhost');
      if (url.pathname === '/favicon.ico') {
        response.writeHead(204);
        response.end();
        return;
      }

      if (url.pathname.startsWith('/api/') || ['/status', '/commands', '/metrics', '/guilds', '/feature-flags', '/safe-mode'].includes(url.pathname) || /^\/guild\/\d{17,20}/.test(url.pathname)) {
        rateLimiter(request);
      }

      if (url.pathname === '/health') {
        writeJson(response, { ok: true, localOnly: true });
        return;
      }

      if (url.pathname === '/events') {
        writeEventStream(response, cwd);
        return;
      }

      if (url.pathname === '/api/preview') {
        writeJson(response, createPreviewPayload(cwd));
        return;
      }

      if (url.pathname === '/api/status' || (url.pathname === '/status' && wantsJson(request))) {
        writeJson(response, createPreviewPayload(cwd).status);
        return;
      }

      if (url.pathname === '/api/commands' || (url.pathname === '/commands' && wantsJson(request))) {
        writeJson(response, createPreviewPayload(cwd).commands);
        return;
      }

      if (url.pathname === '/api/metrics' || url.pathname === '/metrics') {
        writeJson(response, createPreviewPayload(cwd).metrics);
        return;
      }

      if (url.pathname === '/login') {
        await handleDiscordLogin(request, response, cwd, url);
        return;
      }

      if (url.pathname === '/auth/discord/callback') {
        await handleDiscordCallback(request, response, cwd, url);
        return;
      }

      if (url.pathname === '/logout') {
        clearSessionCookie(response);
        redirect(response, '/');
        return;
      }

      if (url.pathname === '/guilds') {
        const payload = createPreviewPayload(cwd);
        const session = requireSession(request, cwd, payload);
        writeJson(response, { ok: true, guilds: session.guilds });
        return;
      }

      const guildRoute = url.pathname.match(/^\/guild\/(\d{17,20})(?:\/config)?$/);
      if (guildRoute) {
        const guildId = guildRoute[1];
        const payload = createPreviewPayload(cwd);
        requireGuildAccess(request, cwd, payload, guildId);
        if (request.method === 'GET') {
          writeJson(response, { ok: true, guild: payload.guilds.find((guild) => guild.id === guildId) ?? dashboardGuildFromConfig(guildId, {}) });
          return;
        }
        if (request.method === 'POST' && url.pathname.endsWith('/config')) {
          const body = await readJsonRequest(request);
          const guild = updateGuildDashboardConfig(cwd, guildId, body);
          writeJson(response, { ok: true, guild });
          return;
        }
      }

      if (url.pathname === '/feature-flags') {
        if (request.method !== 'POST') {
          writeMethodNotAllowed(response, 'POST');
          return;
        }
        const body = await readJsonRequest(request);
        const payload = createPreviewPayload(cwd);
        const guildId = cleanDiscordId(body.guildId);
        requireGuildAccess(request, cwd, payload, guildId);
        const guild = updateGuildFeatureFlag(cwd, guildId, body.setting ?? body.feature, Boolean(body.enabled));
        writeJson(response, { ok: true, guild });
        return;
      }

      if (url.pathname === '/safe-mode') {
        if (request.method !== 'POST') {
          writeMethodNotAllowed(response, 'POST');
          return;
        }
        const body = await readJsonRequest(request);
        const payload = createPreviewPayload(cwd);
        const guildId = cleanDiscordId(body.guildId);
        requireGuildAccess(request, cwd, payload, guildId);
        const guild = updateGuildSafeMode(cwd, guildId, Boolean(body.enabled));
        writeJson(response, { ok: true, guild });
        return;
      }

      if (url.pathname === '/api/presence') {
        if (request.method !== 'POST') {
          writeMethodNotAllowed(response, 'POST');
          return;
        }

        const presence = await readPresenceFromRequest(request);
        const savedPresence = savePreviewPresence(cwd, presence);
        if (wantsJson(request)) {
          writeJson(response, { ok: true, presence: savedPresence });
          return;
        }

        response.writeHead(303, { location: '/?saved=presence' });
        response.end();
        return;
      }

      if (url.pathname === '/api/access-users') {
        if (request.method !== 'POST') {
          writeMethodNotAllowed(response, 'POST');
          return;
        }

        const accessUsers = await readAccessUsersFromRequest(request);
        const savedAccessUsers = savePreviewAccessUsers(cwd, accessUsers);
        if (wantsJson(request)) {
          writeJson(response, { ok: true, ...savedAccessUsers });
          return;
        }

        response.writeHead(303, { location: '/?saved=access-users' });
        response.end();
        return;
      }

      const routeInfo = routeFromPath(url.pathname);
      if (!routeInfo) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
      }

      const payload = createPreviewPayload(cwd);
      const session = getSessionFromRequest(request, cwd);
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store'
      });
      response.end(renderPreviewHtml(payload, {
        saved: url.searchParams.get('saved'),
        route: routeInfo.route,
        guildId: routeInfo.guildId,
        session
      }));
    } catch (error) {
      const statusCode = error?.statusCode ?? 500;
      if (wantsJson(request)) {
        writeJson(response, { ok: false, error: error?.message ?? 'Preview server error' }, statusCode);
        return;
      }

      response.writeHead(statusCode, { 'content-type': 'text/plain; charset=utf-8' });
      response.end(error?.message ?? 'Preview server error');
    }
  });
}

export async function startLocalPreviewServer({ cwd = process.cwd(), host = defaultHost, port = defaultPort } = {}) {
  let selectedPort = Number(port) || defaultPort;
  const maxPort = selectedPort + 20;

  while (selectedPort <= maxPort) {
    const server = createPreviewServer({ cwd });
    try {
      await listen(server, selectedPort, host);
      return { server, host, port: selectedPort, url: `http://${host}:${selectedPort}` };
    } catch (error) {
      server.close();
      if (error?.code !== 'EADDRINUSE' || selectedPort === maxPort) throw error;
      selectedPort += 1;
    }
  }

  throw new Error('Could not find an available preview port.');
}

function renderCommand(command) {
  const optionText = command.options.length
    ? `<span class="tag">${escapeHtml(command.options.join(', '))}</span>`
    : '<span class="tag">base command</span>';

  return `
    <article class="command-item">
      <div class="command-name">
        <h3><code>/${escapeHtml(command.name)}</code></h3>
        ${optionText}
      </div>
      <p>${escapeHtml(command.description || 'No description.')}</p>
    </article>`;
}

function renderStat(label, value) {
  return `
    <div class="stat">
      <small>${escapeHtml(label)}</small>
      <strong>${escapeHtml(String(value))}</strong>
    </div>`;
}

function renderCheck(check) {
  return `
    <div class="check">
      <span class="dot ${check.ok ? 'ok' : ''}" aria-hidden="true"></span>
      <div>
        <h3>${escapeHtml(check.label)}</h3>
        <p>${escapeHtml(check.detail)}</p>
      </div>
    </div>`;
}

function renderConfigRow(label, value) {
  return `
    <tr>
      <th>${escapeHtml(String(label))}</th>
      <td>${escapeHtml(String(value))}</td>
    </tr>`;
}

function normalizeCommand(command) {
  const json = typeof command.toJSON === 'function'
    ? command.toJSON()
    : { name: command.name, description: command.description, options: command.options ?? [] };
  return {
    name: json.name,
    description: json.description,
    category: categorizeCommand(json),
    options: (json.options ?? []).map((option) => option.name).filter(Boolean)
  };
}

function categorizeCommand(command) {
  if (command.name === 'dev' || command.name === 'devcommands' || command.name === 'devdashboard') return 'developer';
  if (adminCommandNames.has(command.name) || command.default_member_permissions) return 'admin';
  return 'community';
}

const adminCommandNames = new Set([
  'admincommands',
  'setup',
  'permissions',
  'modstats',
  'verification',
  'reactionrole',
  'welcome',
  'setlogchannel',
  'logtest',
  'sticky',
  'twitch',
  'youtube',
  'tiktok',
  'social',
  'purge',
  'clean',
  'warn',
  'warnings',
  'clearwarns',
  'case',
  'modnote',
  'modlogs',
  'kick',
  'ban',
  'banid',
  'massban',
  'tempban',
  'tempbans',
  'unban',
  'softban',
  'timeout',
  'unmute',
  'slowmode',
  'nick',
  'role',
  'lockdownrole',
  'lockdown',
  'unlockdown',
  'lockdownserver',
  'unlockdownserver',
  'say'
]);

function createTestingBotPayload(devConfig = {}, devEnv = {}) {
  const testGuildIds = normalizeIdList(splitIdList(devEnv.DISCORD_GUILD_ID));
  const guildIds = testGuildIds.length
    ? testGuildIds
    : Object.keys(devConfig.guilds ?? {}).filter((guildId) => /^\d{17,20}$/.test(guildId));

  return {
    configFile: 'data/config.development.json',
    envFile: '.env.development',
    selectedGuildId: testGuildIds[0] ?? guildIds[0] ?? '',
    lockedToConfiguredGuild: testGuildIds.length > 0
  };
}

function parseLatestChangelog(markdown) {
  const match = markdown.match(/(?:^|\r?\n)## \[([^\]]+)\] - ([^\r\n]+)\r?\n([\s\S]*?)(?=\r?\n## \[|$)/);
  if (!match) {
    return { version: 'unknown', date: 'unknown', title: 'No release entry', body: '' };
  }

  return {
    version: match[1],
    date: match[2],
    title: `${match[1]} - ${match[2]}`,
    body: match[3].trim()
  };
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function parseEnvFile(source) {
  const env = {};
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) continue;
    const key = trimmed.slice(0, equalsIndex).trim();
    const value = parseEnvValue(trimmed.slice(equalsIndex + 1).trim());
    env[key] = value;
  }
  return env;
}

function parseEnvValue(value) {
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }

  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }

  return value;
}

function sanitizePresence(value) {
  const cleanValue = String(value ?? '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleanValue) {
    const error = new Error('Presence cannot be empty.');
    error.statusCode = 400;
    throw error;
  }

  if (cleanValue.length > maxPresenceLength) {
    const error = new Error(`Presence must be ${maxPresenceLength} characters or fewer.`);
    error.statusCode = 400;
    throw error;
  }

  return cleanValue;
}

function truncate(value, maxLength) {
  const text = String(value ?? '');
  return text.length <= maxLength ? text : text.slice(0, Math.max(0, maxLength - 3)).trimEnd() + '...';
}

function updateEnvValue(filePath, key, value) {
  const source = readText(filePath);
  const line = `${key}=${formatEnvValue(value)}`;
  const lines = source ? source.split(/\r?\n/) : [];
  let replaced = false;

  const nextLines = lines.map((existingLine) => {
    if (replaced || existingLine.trim().startsWith('#')) return existingLine;
    const equalsIndex = existingLine.indexOf('=');
    if (equalsIndex === -1) return existingLine;
    const existingKey = existingLine.slice(0, equalsIndex).trim();
    if (existingKey !== key) return existingLine;
    replaced = true;
    return line;
  });

  if (!replaced) {
    if (nextLines.length && nextLines[nextLines.length - 1] !== '') nextLines.push('');
    nextLines.push(line);
  }

  fs.writeFileSync(filePath, `${nextLines.join('\n').replace(/\n+$/g, '')}\n`, 'utf8');
}

function formatEnvValue(value) {
  return /^[A-Za-z0-9 _|!?.:;,+/@#()[\]-]+$/.test(value)
    ? value
    : JSON.stringify(value);
}

async function readPresenceFromRequest(request) {
  const body = await readRequestBody(request, 4096);
  const contentType = request.headers['content-type'] ?? '';

  if (contentType.includes('application/json')) {
    const payload = JSON.parse(body || '{}');
    return payload.presence;
  }

  const form = new URLSearchParams(body);
  return form.get('presence');
}

async function readAccessUsersFromRequest(request) {
  const body = await readRequestBody(request, 8192);
  const contentType = request.headers['content-type'] ?? '';

  if (contentType.includes('application/json')) {
    const payload = JSON.parse(body || '{}');
    return {
      adminUsers: payload.adminUsers,
      devUsers: payload.devUsers,
      errorDmUsers: payload.errorDmUsers
    };
  }

  const form = new URLSearchParams(body);
  return {
    adminUsers: form.get('adminUsers'),
    devUsers: form.get('devUsers'),
    errorDmUsers: form.get('errorDmUsers')
  };
}

async function readJsonRequest(request) {
  const body = await readRequestBody(request, 64 * 1024);
  if (!body.trim()) return {};
  try {
    return JSON.parse(body);
  } catch {
    const error = new Error('Invalid JSON request body.');
    error.statusCode = 400;
    throw error;
  }
}

function createRateLimiter({ windowMs = 60_000, max = 180 } = {}) {
  const buckets = new Map();
  return (request) => {
    const key = request.socket.remoteAddress ?? 'local';
    const now = Date.now();
    const current = buckets.get(key);
    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }

    current.count += 1;
    if (current.count > max) {
      const error = new Error('Too many requests. Slow down and try again.');
      error.statusCode = 429;
      throw error;
    }
  };
}

function setSecurityHeaders(response) {
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('referrer-policy', 'same-origin');
  response.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
}

function writeMethodNotAllowed(response, allow) {
  response.writeHead(405, { allow, 'content-type': 'text/plain; charset=utf-8' });
  response.end('Method not allowed');
}

function writeEventStream(response, cwd) {
  response.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    connection: 'keep-alive'
  });

  const send = () => {
    const payload = createPreviewPayload(cwd);
    response.write(`event: status\n`);
    response.write(`data: ${JSON.stringify({
      online: payload.status.online,
      uptimeLabel: payload.status.uptimeLabel,
      guildCount: payload.status.guildCount,
      errorRate: payload.metrics.errorRate,
      generatedAt: payload.generatedAt
    })}\n\n`);
  };

  send();
  const timer = setInterval(send, 5000);
  response.on('close', () => clearInterval(timer));
}

async function handleDiscordLogin(request, response, cwd, url) {
  const env = parseEnvFile(readText(path.join(cwd, '.env')));
  const oauth = createOAuthPayload(env);
  if (url.searchParams.get('demo') === '1' || !oauth.configured) {
    setSessionCookie(response, cwd, createDemoSession(createPreviewPayload(cwd)), request);
    redirect(response, '/dashboard');
    return;
  }

  const state = createSignedValue(cwd, {
    nonce: crypto.randomBytes(16).toString('hex'),
    createdAt: Date.now()
  });
  const redirectUri = oauthRedirectUri(request, env);
  setCookie(response, 'production_oauth_state', state, { maxAge: 600, httpOnly: true, sameSite: 'Lax' });

  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID ?? env.CLIENT_ID ?? env.DISCORD_APPLICATION_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'identify guilds',
    state
  });
  redirect(response, `https://discord.com/oauth2/authorize?${params.toString()}`);
}

async function handleDiscordCallback(request, response, cwd, url) {
  const env = parseEnvFile(readText(path.join(cwd, '.env')));
  const cookies = parseCookies(request.headers.cookie ?? '');
  const state = url.searchParams.get('state') ?? '';
  const code = url.searchParams.get('code') ?? '';
  if (!code || !state || cookies.production_oauth_state !== state || !verifySignedValue(cwd, state)) {
    const error = new Error('Discord login expired or failed state validation.');
    error.statusCode = 400;
    throw error;
  }

  const clientId = env.DISCORD_CLIENT_ID ?? env.CLIENT_ID ?? env.DISCORD_APPLICATION_ID;
  const clientSecret = env.DISCORD_CLIENT_SECRET ?? env.DISCORD_OAUTH_CLIENT_SECRET;
  const redirectUri = oauthRedirectUri(request, env);
  const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri
    })
  });
  if (!tokenResponse.ok) {
    const error = new Error('Discord OAuth token exchange failed.');
    error.statusCode = 502;
    throw error;
  }

  const token = await tokenResponse.json();
  const [user, guilds] = await Promise.all([
    fetchDiscordApi('/users/@me', token.access_token),
    fetchDiscordApi('/users/@me/guilds', token.access_token)
  ]);
  const session = {
    user: {
      id: user.id,
      username: user.global_name || user.username,
      avatarUrl: discordAvatarUrl(user)
    },
    guilds: filterManageableDiscordGuilds(guilds),
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
  };
  setSessionCookie(response, cwd, session, request);
  clearCookie(response, 'production_oauth_state');
  redirect(response, '/dashboard');
}

async function fetchDiscordApi(pathname, accessToken) {
  const response = await fetch(`https://discord.com/api/v10${pathname}`, {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) {
    const error = new Error('Discord API request failed.');
    error.statusCode = 502;
    throw error;
  }
  return response.json();
}

function createDemoSession(payload) {
  return {
    user: {
      id: 'local-preview',
      username: 'Local Preview Admin',
      avatarUrl: ''
    },
    guilds: payload.guilds.map((guild) => ({ ...guild, manageable: true })),
    demo: true,
    expiresAt: Date.now() + 2 * 60 * 60 * 1000
  };
}

function requireSession(request, cwd, payload) {
  const session = getSessionFromRequest(request, cwd);
  if (session) return session;
  const error = new Error(payload.oauth.configured ? 'Login with Discord to manage guild settings.' : 'Login is not configured. Use /login?demo=1 for local preview mode.');
  error.statusCode = 401;
  throw error;
}

function requireGuildAccess(request, cwd, payload, guildId) {
  const cleanGuildId = cleanDiscordId(guildId);
  const session = requireSession(request, cwd, payload);
  if (session.demo || session.guilds.some((guild) => guild.id === cleanGuildId && guild.manageable !== false)) return session;
  const error = new Error('You need Administrator or Manage Server for this guild.');
  error.statusCode = 403;
  throw error;
}

function getSessionFromRequest(request, cwd) {
  const cookies = parseCookies(request.headers.cookie ?? '');
  const signed = cookies.production_session;
  if (!signed) return null;
  const payload = verifySignedValue(cwd, signed);
  if (!payload || payload.expiresAt <= Date.now()) return null;
  return payload;
}

function setSessionCookie(response, cwd, session, request) {
  const signed = createSignedValue(cwd, session);
  setCookie(response, 'production_session', signed, {
    maxAge: Math.max(1, Math.floor((session.expiresAt - Date.now()) / 1000)),
    httpOnly: true,
    sameSite: 'Lax',
    secure: isHttpsRequest(request)
  });
}

function clearSessionCookie(response) {
  clearCookie(response, 'production_session');
}

function createSignedValue(cwd, payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', sessionSecret(cwd)).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function verifySignedValue(cwd, signed) {
  const [body, signature] = String(signed ?? '').split('.');
  if (!body || !signature) return null;
  const expected = crypto.createHmac('sha256', sessionSecret(cwd)).update(body).digest('base64url');
  const received = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (received.length !== expectedBuffer.length || !crypto.timingSafeEqual(received, expectedBuffer)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function sessionSecret(cwd) {
  const env = parseEnvFile(readText(path.join(cwd, '.env')));
  return env.SESSION_SECRET || crypto.createHash('sha256').update(`${cwd}:production-preview-session`).digest('hex');
}

function setCookie(response, name, value, { maxAge = 3600, httpOnly = true, sameSite = 'Lax', secure = false } = {}) {
  const cookie = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    sameSite ? `SameSite=${sameSite}` : '',
    httpOnly ? 'HttpOnly' : '',
    secure ? 'Secure' : ''
  ].filter(Boolean).join('; ');
  const existing = response.getHeader('set-cookie');
  const next = Array.isArray(existing) ? [...existing, cookie] : existing ? [existing, cookie] : [cookie];
  response.setHeader('set-cookie', next);
}

function clearCookie(response, name) {
  setCookie(response, name, '', { maxAge: 0, httpOnly: true, sameSite: 'Lax' });
}

function parseCookies(source) {
  return Object.fromEntries(String(source).split(';').map((part) => {
    const [key, ...rest] = part.trim().split('=');
    return [key, decodeURIComponent(rest.join('=') || '')];
  }).filter(([key]) => key));
}

function oauthRedirectUri(request, env) {
  return env.DISCORD_REDIRECT_URI
    ?? env.DISCORD_OAUTH_REDIRECT_URI
    ?? `${requestOrigin(request)}/auth/discord/callback`;
}

function requestOrigin(request) {
  const proto = request.headers['x-forwarded-proto'] ?? (isHttpsRequest(request) ? 'https' : 'http');
  return `${proto}://${request.headers.host ?? `${defaultHost}:${defaultPort}`}`;
}

function isHttpsRequest(request) {
  return request.socket.encrypted || request.headers['x-forwarded-proto'] === 'https';
}

function discordAvatarUrl(user) {
  if (!user?.id || !user?.avatar) return '';
  const ext = String(user.avatar).startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=128`;
}

function filterManageableDiscordGuilds(guilds = []) {
  const admin = 8n;
  const manageGuild = 32n;
  return guilds
    .filter((guild) => {
      if (guild.owner) return true;
      try {
        const permissions = BigInt(guild.permissions ?? 0);
        return Boolean(permissions & admin) || Boolean(permissions & manageGuild);
      } catch {
        return false;
      }
    })
    .map((guild) => mergeDashboardGuild({
      id: guild.id,
      name: guild.name,
      iconUrl: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128` : null,
      botInGuild: true,
      manageable: true
    }));
}

function updateGuildDashboardConfig(cwd, guildId, body = {}) {
  return updateGuildConfig(cwd, guildId, (guild) => {
    if (body.setting) applyGuildFeatureSetting(guild, body.setting, Boolean(body.enabled));
    guild.dashboardUpdatedAt = new Date().toISOString();
  });
}

function updateGuildFeatureFlag(cwd, guildId, setting, enabled) {
  return updateGuildConfig(cwd, guildId, (guild) => {
    applyGuildFeatureSetting(guild, setting, enabled);
    guild.dashboardUpdatedAt = new Date().toISOString();
  });
}

function updateGuildSafeMode(cwd, guildId, enabled) {
  return updateGuildConfig(cwd, guildId, (guild) => {
    guild.safeMode = enabled;
    guild.expansion ??= {};
    guild.expansion.security ??= {};
    guild.expansion.security.panic = enabled;
    guild.expansion.security.updatedAt = new Date().toISOString();
  });
}

function updateGuildConfig(cwd, guildId, updater) {
  const cleanGuildId = cleanDiscordId(guildId);
  const configPath = path.join(cwd, 'data', 'config.json');
  const config = readJson(configPath, { version: 2, guilds: {} });
  config.version ??= 2;
  config.guilds ??= {};
  config.guilds[cleanGuildId] ??= defaultGuildConfig();
  updater(config.guilds[cleanGuildId]);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return createGuildDashboardRows(config).find((guild) => guild.id === cleanGuildId) ?? dashboardGuildFromConfig(cleanGuildId, config.guilds[cleanGuildId]);
}

function applyGuildFeatureSetting(guild, setting, enabled) {
  const key = String(setting ?? '').toLowerCase();
  if (['stream', 'streams'].includes(key)) {
    guild.twitch ??= {};
    guild.youtube ??= {};
    guild.tiktok ??= {};
    guild.twitch.enabled = enabled;
    guild.youtube.enabled = enabled;
    guild.tiktok.enabled = enabled;
    return;
  }
  if (['twitch', 'youtube', 'tiktok'].includes(key)) {
    guild[key] ??= {};
    guild[key].enabled = enabled;
    return;
  }
  if (['counter', 'counters', 'counterrepair', 'counterlive'].includes(key)) {
    guild.counters ??= { counters: {} };
    guild.counters.enabled = enabled;
    return;
  }
  if (['moderation', 'automod'].includes(key)) {
    guild.automod ??= {};
    guild.automod.intensity = enabled ? (guild.automod.intensity && guild.automod.intensity !== 'off' ? guild.automod.intensity : 'low') : 'off';
    return;
  }
  if (key === 'logging') {
    guild.logsEnabled = enabled;
    return;
  }
  if (key === 'warnings') {
    guild.warningsEnabled = enabled;
    return;
  }
  guild.featureFlags ??= {};
  guild.featureFlags[key || 'custom'] = enabled;
}

function defaultGuildConfig() {
  return {
    logsEnabled: false,
    twitch: { enabled: false },
    youtube: { enabled: false },
    tiktok: { enabled: false },
    counters: { enabled: true, refreshIntervalMs: 600000, counters: {} },
    automod: { intensity: 'off' },
    expansion: { security: { panic: false } }
  };
}

function routeFromPath(pathname) {
  if (pathname === '/') return { route: 'home' };
  if (['/status', '/commands', '/docs', '/dashboard'].includes(pathname)) {
    return { route: pathname.slice(1) };
  }
  const guildMatch = pathname.match(/^\/dashboard\/guild\/(\d{17,20})$/);
  if (guildMatch) return { route: 'dashboard', guildId: guildMatch[1] };
  return null;
}

function redirect(response, location) {
  response.writeHead(303, { location });
  response.end();
}

function cleanDiscordId(value) {
  const clean = String(value ?? '').match(/\d{17,20}/)?.[0] ?? '';
  if (!clean) {
    const error = new Error('A valid Discord guild ID is required.');
    error.statusCode = 400;
    throw error;
  }
  return clean;
}

function readRequestBody(request, maxBytes) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > maxBytes) {
        const error = new Error('Request body is too large.');
        error.statusCode = 413;
        reject(error);
        request.destroy();
      }
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function splitIdList(value) {
  return String(value ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

function normalizeIdList(ids) {
  return [...new Set(ids.map((id) => String(id).trim()).filter((id) => /^\d{17,20}$/.test(id)))];
}

function extractUserIds(value) {
  return [...new Set(String(value ?? '').match(/\d{17,20}/g) ?? [])];
}

function findDuplicates(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function redactId(id) {
  const value = String(id);
  return value.length > 4 ? `...${value.slice(-4)}` : value;
}

function splitEmailList(value) {
  return String(value ?? '')
    .split(/[,\n;]/)
    .map((email) => email.trim())
    .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
}

function redactEmail(email) {
  const [name, domain] = String(email).split('@');
  if (!name || !domain) return '[hidden]';
  const safeName = name.length <= 2 ? `${name[0] ?? ''}...` : `${name.slice(0, 2)}...${name.slice(-1)}`;
  return `${safeName}@${domain}`;
}

function redactEnvValue(key, value) {
  if (!value) return '';
  if (/IDS?$/.test(key)) {
    return splitIdList(value).map(redactId).join(', ');
  }
  if (/TOKEN|SECRET|KEY|PASS/i.test(key)) return '[hidden]';
  if (/EMAIL|SMTP_(USER|FROM)/i.test(key)) {
    return splitEmailList(value).map(redactEmail).join(', ') || '[hidden]';
  }
  return value;
}

function isPidRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readFileMtime(filePath) {
  try {
    return fs.statSync(filePath).mtime;
  } catch {
    return null;
  }
}

function latestConfigTimestamp(value) {
  let latest = null;
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    for (const [key, child] of Object.entries(node)) {
      if (typeof child === 'string' && /(?:At|Date|Timestamp)$/i.test(key)) {
        const time = Date.parse(child);
        if (Number.isFinite(time) && (!latest || time > latest)) latest = time;
      } else if (child && typeof child === 'object') {
        visit(child);
      }
    }
  };
  visit(value);
  return latest ? new Date(latest).toISOString() : null;
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)}m`;
}

function formatRelativeTime(value) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return 'Unknown';
  const diffMs = Date.now() - time;
  if (diffMs < 60_000) return 'just now';
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  return `${Math.floor(diffMs / 86_400_000)}d ago`;
}

function formatInterval(ms) {
  const minutes = Math.max(1, Math.round(Number(ms || 600000) / 60000));
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}

function estimateErrorRate() {
  const errLog = readText(path.join(process.cwd(), '.bot.err.log'));
  const recentErrors = errLog.split(/\r?\n/).filter((line) => /error|ERR_/i.test(line)).slice(-20).length;
  if (!recentErrors) return '0.0%';
  return `${Math.min(9.9, recentErrors / 10).toFixed(1)}%`;
}

function writeJson(response, payload, statusCode = 200) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  response.end(JSON.stringify(payload, null, 2));
}

function wantsJson(request) {
  const accept = request.headers.accept ?? '';
  const contentType = request.headers['content-type'] ?? '';
  return accept.includes('application/json') || contentType.includes('application/json');
}

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function titleCase(value) {
  return String(value).slice(0, 1).toUpperCase() + String(value).slice(1);
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

const modulePath = fileURLToPath(import.meta.url);
const isMain = [process.argv[1], process.env.pm_exec_path]
  .filter(Boolean)
  .some((entryPath) => path.resolve(entryPath) === modulePath);

if (isMain) {
  const host = readArg('--host') ?? defaultHost;
  const port = Number(readArg('--port') ?? process.env.PREVIEW_PORT ?? defaultPort);
  startLocalPreviewServer({ host, port })
    .then((serverInfo) => {
      console.log(`Local preview running at ${serverInfo.url}`);
      console.log('Refresh the page after local edits. This server does not deploy commands or start the Discord bot.');
    })
    .catch((error) => {
      console.error('Failed to start local preview server:', error);
      process.exit(1);
    });
}

function readArg(name) {
  const exact = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (exact) return exact.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}
