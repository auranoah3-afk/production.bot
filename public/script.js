const SITE_CONFIG = {
  discordClientId: '1505663558187221042',
  apiBase: '',
  botPermissions: '8',
  commandDocs: [
    { name: 'dashboard', category: 'utility', description: 'Open the bot control center.', usage: '/dashboard', cooldown: '3s', options: 'none', example: '/dashboard' },
    { name: 'twitch', category: 'stream', description: 'Manage Twitch live alerts and previews.', usage: '/twitch status', cooldown: '5s staff', options: 'set, add, status, check, preview, reset, remove', example: '/twitch preview event:live' },
    { name: 'youtube', category: 'stream', description: 'Manage YouTube upload notifications.', usage: '/youtube status', cooldown: '5s staff', options: 'set, status, check, preview, reset, remove', example: '/youtube check' },
    { name: 'tiktok', category: 'stream', description: 'Manage TikTok creator post alerts.', usage: '/tiktok status', cooldown: '5s staff', options: 'set, status, check, preview, reset, remove', example: '/tiktok preview' },
    { name: 'counter', category: 'utility', description: 'Create and repair dynamic voice counters.', usage: '/counter list', cooldown: '5s staff', options: 'create, edit, delete, list, refresh, category, template, preview', example: '/counter template template:Community' },
    { name: 'fun', category: 'fun', description: 'Run community games, polls, prompts, and quick replies.', usage: '/fun coinflip', cooldown: '3s', options: 'coinflip, roll, poll, rps, joke, topic', example: '/fun poll question:Pizza tonight?' },
    { name: 'suggestion', category: 'fun', description: 'Send a suggestion to the community vote queue.', usage: '/suggestion <text>', cooldown: '3s', options: 'text', example: '/suggestion text:Add more games' },
    { name: 'bug', category: 'utility', description: 'Report a bot bug to the developer bug tracker.', usage: '/bug <description> <urgency>', cooldown: '10s', options: 'description, urgency, steps', example: '/bug urgency:High description:Dashboard failed' },
    { name: 'moderation', category: 'moderation', description: 'Open warnings, notes, history, and member moderation tools.', usage: '/moderation history', cooldown: '5s staff', options: 'warn, warnings, clear, history, case, notes', example: '/moderation warn' },
    { name: 'verification', category: 'moderation', description: 'Configure and send the lightweight verify panel.', usage: '/verification setup', cooldown: '5s staff', options: 'setup', example: '/verification setup' },
    { name: 'dev announceupdate', category: 'dev', description: 'Send release notes to update subscribers.', usage: '/dev announceupdate', cooldown: 'owner only', options: 'none', example: '/dev announceupdate' },
    { name: 'dev health', category: 'dev', description: 'View private runtime and provider health.', usage: '/dev health', cooldown: 'owner only', options: 'none', example: '/dev health' }
  ]
};

const staticStatus = {
  online: true,
  uptimeLabel: 'Live',
  guildCount: 'Public',
  errorRate: '0.0%',
  lastEvent: 'Static shell ready',
  systems: {
    stream: 'Operational',
    counter: 'Operational',
    event: 'Operational'
  },
  apis: {
    discord: 'Operational',
    twitch: 'Standby',
    youtube: 'Standby',
    tiktok: 'Standby'
  }
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function inviteUrl() {
  const params = new URLSearchParams({
    client_id: SITE_CONFIG.discordClientId,
    permissions: SITE_CONFIG.botPermissions,
    scope: 'bot applications.commands'
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 3000);
}

function loginNotice() {
  showToast('Static site deployed. Connect the API bridge before enabling secure Discord dashboard login.');
}

function applyStatus(status) {
  const online = Boolean(status.online);
  const statusText = online ? 'Bot online' : 'Bot offline';
  $$('[data-status-label], [data-status-label-copy]').forEach((node) => { node.textContent = statusText; });
  $$('[data-status-dot], [data-health-dot]').forEach((node) => {
    node.classList.toggle('online', online);
    node.classList.toggle('warning', !online);
  });
  $$('[data-uptime], [data-uptime-copy]').forEach((node) => { node.textContent = status.uptimeLabel; });
  $$('[data-guild-count], [data-guild-count-copy]').forEach((node) => { node.textContent = status.guildCount; });
  $('[data-error-rate]').textContent = status.errorRate;
  $('[data-last-event]').textContent = status.lastEvent;
  $('[data-health-label]').textContent = online ? 'Operational' : 'Degraded';
  $('[data-stream-health]').textContent = status.systems.stream;
  $('[data-counter-health]').textContent = status.systems.counter;
  $('[data-event-health]').textContent = status.systems.event;
  $('[data-stream-health-copy]').textContent = status.systems.stream;
  $('[data-counter-health-copy]').textContent = status.systems.counter;
  $('[data-event-health-copy]').textContent = status.systems.event;
  $('[data-api-discord]').textContent = status.apis.discord;
  $('[data-api-twitch]').textContent = status.apis.twitch;
  $('[data-api-youtube]').textContent = status.apis.youtube;
  $('[data-api-tiktok]').textContent = status.apis.tiktok;
}

async function loadStatus() {
  if (!SITE_CONFIG.apiBase) {
    applyStatus(staticStatus);
    return;
  }
  try {
    const response = await fetch(`${SITE_CONFIG.apiBase}/status`, { headers: { accept: 'application/json' } });
    const data = await response.json();
    applyStatus({
      online: data.online,
      uptimeLabel: data.uptimeLabel ?? '--',
      guildCount: data.guildCount ?? '--',
      errorRate: data.errorRate ?? '0.0%',
      lastEvent: data.lastEventLabel ?? 'Waiting',
      systems: {
        stream: data.systems?.stream?.state ?? 'Standby',
        counter: data.systems?.counter?.state ?? 'Standby',
        event: data.systems?.event?.state ?? 'Standby'
      },
      apis: {
        discord: data.apis?.discord?.state ?? 'Unknown',
        twitch: data.apis?.twitch?.state ?? 'Unknown',
        youtube: data.apis?.youtube?.state ?? 'Unknown',
        tiktok: data.apis?.tiktok?.state ?? 'Unknown'
      }
    });
  } catch {
    applyStatus({ ...staticStatus, online: false, lastEvent: 'API bridge unreachable' });
  }
}

function commandCard(command) {
  return `
    <article class="command-card" data-command-card data-category="${command.category}" data-search="${[
      command.name,
      command.category,
      command.description,
      command.usage,
      command.options
    ].join(' ').toLowerCase()}">
      <div>
        <span class="eyebrow">${command.category}</span>
        <h3><code>/${command.name}</code></h3>
      </div>
      <p>${command.description}</p>
      <div class="command-meta">
        <span class="pill">Usage ${command.usage}</span>
        <span class="pill">Cooldown ${command.cooldown}</span>
        <span class="pill">Options ${command.options}</span>
        <span class="pill">Example ${command.example}</span>
      </div>
    </article>`;
}

function renderCommands() {
  $('#commandList').innerHTML = SITE_CONFIG.commandDocs.map(commandCard).join('');
}

function filterCommands() {
  const query = $('#commandSearch').value.trim().toLowerCase();
  const active = $('.filter.active')?.dataset.filter ?? 'all';
  $$('[data-command-card]').forEach((card) => {
    const categoryOk = active === 'all' || card.dataset.category === active;
    const searchOk = !query || card.dataset.search.includes(query);
    card.style.display = categoryOk && searchOk ? '' : 'none';
  });
}

function wireUi() {
  const invite = inviteUrl();
  ['#inviteTop', '#inviteHero'].forEach((selector) => { $(selector).href = invite; });
  ['#loginTop', '#loginHero', '#loginDashboard'].forEach((selector) => {
    $(selector).addEventListener('click', loginNotice);
  });
  $('#commandSearch').addEventListener('input', filterCommands);
  $$('.filter').forEach((button) => {
    button.addEventListener('click', () => {
      $$('.filter').forEach((node) => node.classList.remove('active'));
      button.classList.add('active');
      filterCommands();
    });
  });
}

renderCommands();
wireUi();
loadStatus();
window.setInterval(loadStatus, 30000);
