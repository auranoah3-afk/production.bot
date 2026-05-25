import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { commands, guildSpecificCommandsForGuild, productionExcludedCommandNames } from '../src/commands.js';
import { guildSpecificCommands } from '../src/commands.js';
import {
  commandModuleCatalog,
  commandModuleFor,
  commandRoutePaths,
  createCommandInventory,
  publicDeployCommands,
  validateCommandInventory
} from '../src/core/command-platform.js';
import { createCommandRuntimeAudit } from '../src/core/command-audit.js';
import { globalCommunityFunCommandNames } from '../src/modules/community/fun-command-definitions.js';
import {
  buildCommandRouting,
  normalizeFeatureCommandName,
  parsePrefixCommandAttempt,
  resolveSlashCommandRoute,
  slashCommandRouteLabel
} from '../src/core/command-router.js';
import {
  createCommandExecutionRecord,
  createCooldownTracker,
  evaluateCommandAccess,
  evaluateDeveloperAccess,
  evaluatePermissionAccess
} from '../src/core/command-middleware.js';
import {
  commandExecutionNoisyLines,
  commandExecutionRecentLines,
  commandExecutionSummaryLines,
  createCommandTelemetry
} from '../src/core/command-telemetry.js';
import {
  createCommandHandlerRegistry,
  validateHandlerRegistry
} from '../src/core/command-registry.js';
import {
  newestObjectEntriesByTimestamp,
  pruneMapByTimestamp
} from '../src/core/memory-limits.js';
import {
  safeAllowedMentions,
  safeContentPayload,
  safeOutboundContent
} from '../src/core/security-policy.js';
import {
  createConfigRepository,
  createDefaultRootConfig,
  normalizeRootConfig
} from '../src/core/config-repository.js';
import {
  createGuardedEventHandler,
  normalizeRuntimeError,
  reportGuardedEventError,
  runGuardedTask,
  startGuardedInterval
} from '../src/core/runtime-boundary.js';
import {
  formatStartupValidation,
  validateStartupEnvironment
} from '../src/core/startup-validation.js';
import {
  applyToEligibleServerChannels,
  canEditLockdownChannel,
  canLockdownRoleViewChannel,
  lockChannelPermissions,
  lockdownAllowPermissions,
  lockdownDenyPermissions,
  resolveLockdownRole,
  unlockChannelPermissions
} from '../src/modules/moderation/lockdown-service.js';
import {
  autoModBadWordStrikeThreshold,
  autoModBadWordTimeoutMs,
  autoModEscalationLabel,
  autoModEscalationLevels,
  autoModEscalationSummary,
  autoModIntensityLabel,
  autoModIntensityLevels,
  autoModStatusSummary,
  defaultAutoModConfig,
  mediaRuleSummary,
  normalizeAutoModConfig
} from '../src/modules/automod/automod-config.js';
import {
  defaultLogCategoryIds,
  formatLogCategories,
  logCategories,
  logCategoryForTitle,
  logCategoryLabel,
  normalizeLogCategoryIds
} from '../src/modules/logging/log-config.js';
import {
  defaultVerificationConfig,
  normalizeVerificationConfig,
  parseVerificationVisibleChannelIds,
  verificationChannelAccessIntent,
  verificationSetupSummary
} from '../src/modules/verification/verification-config.js';
import {
  addModNoteRecord,
  addWarningRecord,
  clearWarningRecords,
  expiredTempBanRecords,
  markTempBanUnbanFailure,
  modNoteRecordsFor,
  moderationHistoryFor,
  removeModNoteRecord,
  removeTempBanRecord,
  tempBanRecords,
  upsertTempBanRecord,
  warningCaseFor,
  warningRecordsFor
} from '../src/modules/moderation/moderation-store.js';
import { createBugRepository } from '../src/database/bugs.js';
import {
  bugActionRow,
  bugReportChannelId,
  bugReportEmbed,
  bugReportGuildId
} from '../src/events/interactionCreate.js';
import { loadLocalEnv, resolveLocalEnvPath } from '../src/env.js';
import {
  createPreviewPayload,
  renderPreviewHtml,
  savePreviewAccessUsers,
  savePreviewPresence
} from '../src/local-preview-server.js';
import {
  cleanAiReplyFormatting,
  closestCommandNames,
  commandErrorUserMessage,
  errorCodeCategory,
  errorCodeFor,
  randomFrom,
  stableScore,
  truncate,
  detectJoinedChatTopic,
  detectHostileProfanity,
  nextAutoModEscalationAction,
  nextAutoModStrikeState,
  formatDeveloperErrorMessage
} from '../src/testable-utils.js';

console.log('Running basic unit tests...');

// randomFrom
const options = ['a', 'b', 'c'];
const pick = randomFrom(options);
assert(options.includes(pick), 'randomFrom should return one of the input values');

// stableScore deterministic-ish
assert(typeof stableScore('test', 100) === 'number', 'stableScore should return a number');
assert(stableScore('a', 10) >= 0 && stableScore('a', 10) < 10, 'stableScore within range');

// truncate
assert(truncate('hello', 10) === 'hello', 'truncate keeps short values');
assert(truncate('abcdefghijklmnopqrstuvwxyz', 10).endsWith('...'), 'truncate shortens long values');

// detectJoinedChatTopic
assert(detectJoinedChatTopic('How do I deploy the bot?') === 'the bot', 'detectJoinedChatTopic should detect bot topic');
assert(detectJoinedChatTopic('Let us play a game') === 'gaming or streaming', 'detectJoinedChatTopic should detect gaming topic');

// deterministic AutoMod profanity checks
assert.equal(detectHostileProfanity('Fuck off')?.action, 'delete', 'AutoMod should catch direct hostile profanity');
assert.equal(detectHostileProfanity('Bitch')?.category, 'hostile_profanity', 'AutoMod should catch standalone profanity insults');
assert.equal(detectHostileProfanity('\u{1f595}')?.category, 'obscene_gesture', 'AutoMod should catch obscene gesture emoji');
assert.equal(detectHostileProfanity('f u c k')?.category, 'strong_profanity', 'AutoMod should catch spaced profanity');
assert.equal(detectHostileProfanity('b!tch')?.category, 'hostile_profanity', 'AutoMod should catch leetspeak profanity');
assert.equal(detectHostileProfanity('s h 1 t')?.category, 'strong_profanity', 'AutoMod should catch spaced leetspeak profanity');
assert.equal(detectHostileProfanity('faggot')?.category, 'hate_slur', 'AutoMod should catch anti-LGBTQ slurs');
assert.equal(detectHostileProfanity('f 4 g g 0 t')?.category, 'hate_slur', 'AutoMod should catch spaced leetspeak anti-LGBTQ slurs');
assert.equal(detectHostileProfanity('nigger')?.category, 'hate_slur', 'AutoMod should catch anti-Black slurs');
assert.equal(detectHostileProfanity('n 1 g g e r')?.category, 'hate_slur', 'AutoMod should catch spaced leetspeak anti-Black slurs');
assert.equal(detectHostileProfanity('what the h3ll'), null, 'Low AutoMod should not block mild profanity');
assert.equal(detectHostileProfanity('what the h3ll', 'medium')?.category, 'mild_profanity', 'Medium AutoMod should catch mild leetspeak profanity');
assert.equal(detectHostileProfanity('this update is hard'), null, 'AutoMod profanity guard should not flag normal text');
assert.equal(detectHostileProfanity('class assignment'), null, 'AutoMod profanity guard should avoid substring false positives');
assert.equal(detectHostileProfanity('sniggering at a joke'), null, 'AutoMod slur guard should avoid substring false positives');

let strikeState = nextAutoModStrikeState([], 1_000, 600_000, 3);
assert.equal(strikeState.count, 1, 'First AutoMod bad-word strike should be tracked');
assert.equal(strikeState.shouldTimeout, false, 'First AutoMod bad-word strike should not timeout');
strikeState = nextAutoModStrikeState(strikeState.strikes, 2_000, 600_000, 3);
assert.equal(strikeState.shouldTimeout, false, 'Second AutoMod bad-word strike should not timeout');
strikeState = nextAutoModStrikeState(strikeState.strikes, 3_000, 600_000, 3);
assert.equal(strikeState.shouldTimeout, true, 'Third AutoMod bad-word strike should timeout');
strikeState = nextAutoModStrikeState([1_000, 2_000], 700_000, 600_000, 3);
assert.equal(strikeState.count, 1, 'Old AutoMod bad-word strikes should expire from the rolling window');
assert.deepEqual(
  nextAutoModEscalationAction('delete', 7),
  { type: 'none', threshold: 5 },
  'Delete-only AutoMod escalation should never timeout or ban'
);
assert.equal(nextAutoModEscalationAction('timeout', 3).durationMs, 5 * 60_000, 'Timeout mode should start with a 5 minute timeout');
assert.equal(nextAutoModEscalationAction('timeout', 5).durationMs, 30 * 60_000, 'Timeout mode should escalate repeated violations');
assert.equal(nextAutoModEscalationAction('strict', 5).durationMs, 60 * 60_000, 'Strict mode should apply a longer timeout before bans');
assert.equal(nextAutoModEscalationAction('strict', 7).type, 'ban', 'Strict AutoMod should ban only after repeated severe violations');
assert.deepEqual(autoModIntensityLevels, ['off', 'low', 'medium', 'high'], 'AutoMod module should own intensity levels');
assert.deepEqual(autoModEscalationLevels, ['delete', 'timeout', 'strict'], 'AutoMod module should own escalation levels');
assert.equal(autoModBadWordStrikeThreshold, 3, 'AutoMod module should own bad-word strike threshold');
assert.equal(autoModBadWordTimeoutMs, 5 * 60_000, 'AutoMod module should own default bad-word timeout');
assert.equal(autoModIntensityLabel('medium'), 'Medium', 'AutoMod module should label intensity');
assert.equal(autoModEscalationLabel('strict'), 'Strict: timeouts and bans', 'AutoMod module should label escalation');
assert(autoModEscalationSummary('timeout').includes('5m timeout'), 'AutoMod module should explain timeout escalation');
assert.deepEqual(defaultAutoModConfig().mediaRules, { channels: {}, categories: {} }, 'AutoMod module should create default media rules');
assert.deepEqual(
  normalizeAutoModConfig({
    intensity: 'bad',
    escalationMode: 'bad',
    testUserIds: ['bad', '1505751652655693926', '1505751652655693926'],
    mediaRules: { channels: { c1: { allowImages: false, bad: true } } }
  }),
  {
    intensity: 'off',
    escalationMode: 'timeout',
    testUserIds: ['1505751652655693926'],
    mediaRules: { channels: { c1: { allowImages: false } }, categories: {} }
  },
  'AutoMod module should normalize config, test users, and media rules'
);
assert(autoModStatusSummary(normalizeAutoModConfig({ intensity: 'high', mediaRules: { channels: { c1: { allowImages: false } } } })).includes('AI intensity: High'), 'AutoMod module should summarize status');
assert.equal(mediaRuleSummary('#media', { allowImages: false }), '#media - Images: Blocked, GIFs: Inherited', 'AutoMod module should summarize media rules');
assert(logCategories.some((category) => category.id === 'moderation'), 'Logging module should own known log categories');
assert(defaultLogCategoryIds.includes('messages') && defaultLogCategoryIds.includes('dev'), 'Logging module should expose default category IDs');
assert.deepEqual(normalizeLogCategoryIds(['messages', 'bad', 'messages', 'dev']), ['messages', 'dev'], 'Logging module should normalize category IDs');
assert.equal(formatLogCategories(['messages', 'dev']), 'Message logs, Developer logs', 'Logging module should format enabled categories');
assert.equal(logCategoryLabel('moderation'), 'Moderation', 'Logging module should label categories without the logs suffix');
assert.equal(logCategoryForTitle('Member Banned'), 'moderation', 'Logging module should infer moderation logs');
assert.equal(logCategoryForTitle('YouTube Alerts Updated'), 'youtube', 'Logging module should infer creator alert logs');
assert.deepEqual(defaultVerificationConfig().visibleChannelIds, [], 'Verification module should default to hidden onboarding with no extra visible channels');
assert.deepEqual(
  normalizeVerificationConfig({
    enabled: true,
    roleId: '111111111111111111',
    channelId: '222222222222222222',
    visibleChannelIds: ['333333333333333333', '333333333333333333', 'bad'],
    captchaEnabled: true,
    timeoutMinutes: 999999
  }).visibleChannelIds,
  ['333333333333333333'],
  'Verification module should normalize visible channel IDs'
);
const verificationPolicy = normalizeVerificationConfig({
  enabled: true,
  roleId: '111111111111111111',
  channelId: '222222222222222222',
  visibleChannelIds: ['333333333333333333', '444444444444444444']
});
assert.deepEqual(
  verificationChannelAccessIntent({ id: '222222222222222222' }, verificationPolicy),
  { shouldApply: true, everyoneCanView: true, verifiedRoleCanView: false, mode: 'verification' },
  'Verification channel should stay visible to unverified users and disappear after verify'
);
assert.deepEqual(
  verificationChannelAccessIntent({ id: '555555555555555555', parentId: '444444444444444444' }, verificationPolicy),
  { shouldApply: true, everyoneCanView: true, verifiedRoleCanView: true, mode: 'visible' },
  'Visible categories should keep child channels visible before verification'
);
assert.deepEqual(
  verificationChannelAccessIntent({ id: '666666666666666666' }, verificationPolicy),
  { shouldApply: true, everyoneCanView: false, verifiedRoleCanView: true, mode: 'hidden' },
  'Normal channels should be invisible until verification'
);
assert.deepEqual(
  parseVerificationVisibleChannelIds('<#777777777777777777> 888888888888888888 bad'),
  ['777777777777777777', '888888888888888888'],
  'Verification visible-channel parser should accept mentions and raw IDs'
);
assert(verificationSetupSummary(verificationPolicy).includes('Hidden onboarding: On'), 'Verification module should summarize hidden onboarding policy');

// developer error formatting
const providerError = new Error('Hugging Face error 429: {"message":"High traffic right now","type":"too_many_requests_error","param":"queue","code":"queue_exceeded"}');
assert.equal(
  formatDeveloperErrorMessage(providerError),
  'Hugging Face error 429: High traffic right now\nDetails: too_many_requests_error | queue | queue_exceeded',
  'provider JSON errors should be formatted for clean developer DMs'
);
assert.equal(
  cleanAiReplyFormatting(String.raw`\(1{,}000{,}000{,}000 \times 1{,}000{,}000{,}000 = 1{,}000{,}000{,}000{,}000{,}000{,}000\) (that's 10^{18}).`),
  "1,000,000,000 x 1,000,000,000 = 1,000,000,000,000,000,000 (that's 10^18).",
  'AI reply cleanup should convert LaTeX-style math into Discord-readable text'
);
const aiProviderCode = errorCodeFor(providerError, { type: 'AI Chat' });
assert.match(aiProviderCode, /^ERR_API_FAILURE-429-\d{4}$/, 'API/provider errors should include provider status in the error code');
assert.equal(
  errorCodeFor(providerError, { type: 'AI Chat' }),
  aiProviderCode,
  'error codes should be deterministic for the same error context'
);
assert.match(
  errorCodeFor(new Error('Slash command failed'), { type: 'Interaction', command: 'preview' }),
  /^ERR_INTERACTION_ERROR-\d{4}$/,
  'interaction errors should get interaction-scoped codes'
);
assert.match(
  errorCodeFor(new Error('Prefix command failed'), { type: 'Message', command: 'PrefixCommand' }),
  /^ERR_MESSAGE_ERROR-\d{4}$/,
  'prefix command errors should get message-scoped codes'
);
assert.match(
  errorCodeFor({ code: 50013, message: 'Missing Permissions' }, { type: 'Interaction', command: '/role add' }),
  /^ERR_PERMISSION_DENIED-\d{4}$/,
  'permission failures should get a specific code'
);
assert.match(
  errorCodeFor({ code: 10062, message: 'Unknown interaction' }, { type: 'Interaction', command: 'dash:select' }),
  /^ERR_INTERACTION_TIMEOUT-\d{4}$/,
  'expired interactions should get a specific code'
);
assert.equal(
  errorCodeCategory(new Error('Choose a verification role and text channel first.'), { type: 'Dashboard', command: 'dash:verification:send' }).code,
  'ERR_SETUP_INCOMPLETE',
  'setup/dashboard validation failures should classify as incomplete setup'
);
assert(
  commandErrorUserMessage({ code: 50013, message: 'Missing Permissions' }).includes('permission'),
  'Discord missing-permission errors should get a clear user message'
);
assert(
  commandErrorUserMessage({ code: 10062, message: 'Unknown interaction' }).includes('expired'),
  'Expired slash interactions should get a clear user message'
);
assert.deepEqual(
  closestCommandNames('socail', ['setup', 'social', 'tiktok']),
  ['social'],
  'Unknown command fallback should suggest close command names'
);

// Discord slash command descriptions must be <= 100 characters.
for (const command of commands) {
  assert(
    command.description.length <= 100,
    `/${command.name} description should be 100 characters or fewer`
  );
}

const commandNames = new Set(commands.map((command) => command.name));
const commandInventory = createCommandInventory({ commands, guildSpecificCommands });
const commandRouting = buildCommandRouting({ commands, guildSpecificCommands });
assert.deepEqual(validateCommandInventory(commandInventory), [], 'Command inventory should validate before deploy');
assert.equal(commandInventory.globalCommandCount, commands.length, 'Command inventory should count global commands');
assert.equal(commandInventory.guildCommandCount, guildSpecificCommands.length, 'Command inventory should count guild commands');
assert(commandInventory.commandPathCount > commandInventory.globalCommandCount, 'Command inventory should include subcommand paths');
assert.deepEqual(commandInventory.duplicateGlobalNames, [], 'Command inventory should reject duplicate global names');
assert.deepEqual(commandInventory.globalGuildNameCollisions, [], 'Guild-only commands should not collide with global commands');
assert.deepEqual(commandInventory.uncategorizedNames, [], 'Every registered command should have module ownership');
for (const module of commandModuleCatalog) {
  assert.deepEqual(
    module.commandNames,
    [...new Set(module.commandNames)],
    `${module.id} command module catalog should not duplicate command names`
  );
}
assert.equal(commandModuleFor('warn'), 'moderation', '/warn should belong to the moderation module');
assert.equal(commandModuleFor('social'), 'community', '/social should belong to the community module');
assert.equal(commandModuleFor('deploy'), 'community', '/deploy should belong to the community module');
assert.equal(commandModuleFor('bug'), 'community', '/bug should belong to the community module');
assert.deepEqual(
  publicDeployCommands(commands, productionExcludedCommandNames).map((command) => command.name),
  commands.map((command) => command.name),
  'Public deploy command helper should preserve the current production command set'
);
assert(
  commandModuleCatalog.some((module) => module.id === 'server-custom' && module.commandNames.includes('bmas') && module.commandNames.includes('timmysudo') && module.commandNames.includes('timmy')),
  'Guild-only commands should have explicit module ownership'
);
const groupedInfoRoute = resolveSlashCommandRoute(commandRouting, 'info', null, {
  options: {
    getSubcommandGroup: () => null,
    getSubcommand: () => 'server'
  }
});
assert.equal(groupedInfoRoute.commandName, 'serverinfo', 'Slash router should resolve /info server to serverinfo');
assert.equal(slashCommandRouteLabel(groupedInfoRoute), '/info server -> /serverinfo', 'Slash route labels should show grouped command traces');
assert.equal(resolveSlashCommandRoute(commandRouting, 'dashboard')?.commandName, 'dashboard', 'Slash router should route /dashboard to the modern dashboard suite');
assert.equal(
  resolveSlashCommandRoute(commandRouting, 'bmas', '1405063177124970516')?.guildSpecific,
  true,
  'Slash router should recognize guild-specific commands only in their guild'
);
assert.equal(resolveSlashCommandRoute(commandRouting, 'bmas', '1116194748223475742'), null, 'Slash router should reject guild-only commands outside their guild');
assert.equal(
  resolveSlashCommandRoute(commandRouting, 'timmysudo', '1340204978341675019')?.guildSpecific,
  true,
  'Slash router should recognize /timmysudo only in the TimmySudo guild'
);
assert.equal(resolveSlashCommandRoute(commandRouting, 'timmysudo', '1116194748223475742'), null, 'Slash router should reject /timmysudo outside its guild');
assert.equal(
  resolveSlashCommandRoute(commandRouting, 'timmy', '1340204978341675019')?.guildSpecific,
  true,
  'Slash router should recognize /timmy only in the TimmySudo guild'
);
assert.equal(resolveSlashCommandRoute(commandRouting, 'timmy', '1116194748223475742'), null, 'Slash router should reject /timmy outside its guild');
assert.deepEqual(
  parsePrefixCommandAttempt('!yt status'),
  { body: 'yt status', rawCommand: 'yt', commandName: 'youtube', args: ['status'] },
  'Prefix parser should normalize command aliases before dispatch'
);
assert.equal(normalizeFeatureCommandName('/mute 123'), 'timeout', 'Feature gates should normalize aliases through the shared router');
assert.deepEqual(
  evaluateCommandAccess({ commandName: 'ping', receivedName: 'ping' }),
  { allowed: true, reason: 'allowed', commandName: 'ping', receivedName: 'ping' },
  'Command middleware should allow normal commands'
);
assert.equal(
  evaluateCommandAccess({ commandName: 'ping', receivedName: 'ping', disabled: true }).reason,
  'disabled',
  'Command middleware should block disabled commands'
);
assert.equal(
  evaluateCommandAccess({ commandName: 'preview', receivedName: 'preview', revamping: true, disabled: true }).reason,
  'revamping',
  'Command middleware should preserve revamp-lock priority over disabled gates'
);
let fakeNow = 1_000;
const cooldowns = createCooldownTracker({ now: () => fakeNow });
assert.deepEqual(cooldowns.check('user:ping', 5_000), { limited: false, retryAfterMs: 0, expiresAt: 6_000 }, 'Cooldown tracker should allow first use');
fakeNow = 2_500;
assert.deepEqual(cooldowns.check('user:ping', 5_000), { limited: true, retryAfterMs: 3_500, expiresAt: 6_000 }, 'Cooldown tracker should block repeated use inside the window');
fakeNow = 6_500;
assert.equal(cooldowns.check('user:ping', 5_000).limited, false, 'Cooldown tracker should allow after expiry');
assert.deepEqual(
  createCommandExecutionRecord({ kind: 'Slash', commandName: '/Ping', status: 'ok', startedAt: 10, endedAt: 25 }),
  { kind: 'slash', commandName: 'ping', status: 'ok', durationMs: 15, errorName: null, errorMessage: null },
  'Command execution records should normalize analytics fields'
);
const fakePermissions = (...allowed) => ({ has: (permission) => allowed.includes(permission) });
assert.deepEqual(
  evaluatePermissionAccess({
    permissions: fakePermissions('ManageGuild'),
    permission: 'ManageGuild',
    label: 'Manage Server',
    administratorPermission: 'Administrator'
  }),
  { allowed: true, reason: 'permission', permission: 'ManageGuild', label: 'Manage Server' },
  'Permission middleware should allow members with the requested Discord permission'
);
assert.equal(
  evaluatePermissionAccess({
    permissions: fakePermissions('Administrator'),
    permission: 'ManageGuild',
    label: 'Manage Server',
    administratorPermission: 'Administrator'
  }).allowed,
  true,
  'Permission middleware should honor Administrator as a bypass'
);
assert.equal(
  evaluatePermissionAccess({
    permissions: fakePermissions(),
    permission: 'ManageGuild',
    label: 'Manage Server',
    configuredAdmin: true,
    administratorPermission: 'Administrator'
  }).reason,
  'configured_admin',
  'Permission middleware should honor configured bot admin users and roles'
);
assert.deepEqual(
  evaluatePermissionAccess({
    permissions: fakePermissions(),
    permission: 'ManageGuild',
    label: 'Manage Server',
    administratorPermission: 'Administrator'
  }),
  { allowed: false, reason: 'missing_permission', permission: 'ManageGuild', label: 'Manage Server' },
  'Permission middleware should block missing permissions with a stable reason'
);
assert.deepEqual(evaluateDeveloperAccess({ developer: true }), { allowed: true, reason: 'developer' }, 'Developer middleware should allow configured developers');
assert.deepEqual(evaluateDeveloperAccess({ developer: false }), { allowed: false, reason: 'not_developer' }, 'Developer middleware should block non-developers');
const registry = createCommandHandlerRegistry({ kind: 'test' });
const noopHandler = () => null;
registry
  .register('Ping', noopHandler, { moduleId: 'Core', description: 'Health check' })
  .register(['join', '!unjoin'], noopHandler, { moduleId: 'AI' });
assert.equal(registry.size(), 3, 'Command handler registry should count registered names');
assert.equal(registry.get('/ping').moduleId, 'core', 'Command handler registry should normalize handler metadata');
assert.equal(registry.has('unjoin'), true, 'Command handler registry should resolve prefixed command names');
assert.deepEqual(registry.names(), ['join', 'ping', 'unjoin'], 'Command handler registry should list normalized names');
assert.deepEqual(validateHandlerRegistry(registry, ['ping', 'join', 'unjoin']), { missing: [], extra: [] }, 'Command handler registry validation should pass for covered names');
assert.deepEqual(validateHandlerRegistry(registry, ['ping', 'join']), { missing: [], extra: ['unjoin'] }, 'Command handler registry validation should flag extra names');
assert.throws(() => registry.register('ping', noopHandler), /Duplicate test handler/, 'Command handler registry should reject duplicate handlers');
const cleanRuntimeAudit = createCommandRuntimeAudit({
  commands: [{ name: 'ping' }, { name: 'info' }],
  groupedSlashCommandRoutes: { info: { server: 'serverinfo' } },
  groupedPrefixCommandRoutes: { info: { server: 'serverinfo' } },
  slashCommandAliases: { help: 'commands' },
  prefixCommandAliases: { help: 'commands' },
  prefixCommandSuggestionNames: ['ping', 'serverinfo', 'help'],
  slashHandlerNames: ['ping', 'serverinfo', 'commands'],
  prefixHandlerNames: ['ping', 'serverinfo', 'commands'],
  execution: { trackedRoutes: 1 }
});
assert.equal(cleanRuntimeAudit.ok, true, 'Command runtime audit should pass when live handlers cover routes and aliases');
assert.equal(cleanRuntimeAudit.slashHandlerCount, 3, 'Command runtime audit should count actual slash handlers');
assert.equal(cleanRuntimeAudit.prefixHandlerCount, 3, 'Command runtime audit should count actual prefix handlers');
assert.deepEqual(
  createCommandRuntimeAudit({
    commands: [{ name: 'ping' }, { name: 'info' }],
    groupedSlashCommandRoutes: { info: { server: 'serverinfo' } },
    groupedPrefixCommandRoutes: { info: { server: 'serverinfo' } },
    slashCommandAliases: { help: 'commands' },
    prefixCommandAliases: { help: 'commands' },
    prefixCommandSuggestionNames: ['ping', 'serverinfo', 'help'],
    slashHandlerNames: ['ping'],
    prefixHandlerNames: ['ping']
  }).missingSlashRoutes,
  ['serverinfo'],
  'Command runtime audit should report missing slash routes from live registry names'
);
let telemetryNow = 1_000;
const telemetry = createCommandTelemetry({
  historyLimit: 2,
  noisyLimit: 1,
  now: () => telemetryNow += 100
});
telemetry.record('slash', '/Ping', 'ok', 25);
telemetry.record('prefix', '!Unknown', 'ignored', 5);
telemetry.record('slash', 'Ping', 'error', 40, new Error('provider failed hard'));
const telemetrySummary = telemetry.summary();
assert.equal(telemetrySummary.trackedRoutes, 2, 'Command telemetry should group routes by normalized scope/name');
assert.equal(telemetrySummary.ok, 1, 'Command telemetry should count successes');
assert.equal(telemetrySummary.errors, 1, 'Command telemetry should count errors');
assert.equal(telemetrySummary.ignored, 1, 'Command telemetry should count ignored attempts');
assert(commandExecutionSummaryLines(telemetrySummary).includes('Tracked routes: 2'), 'Command telemetry should render summary lines');
assert(commandExecutionRecentLines(telemetrySummary).includes('slash:ping'), 'Command telemetry should render recent command lines');
assert(commandExecutionNoisyLines(telemetrySummary).includes('provider failed hard'), 'Command telemetry should render noisy command lines');
const rootDefaults = createDefaultRootConfig({
  uptimeStatus: { guildId: '1505751652655693926', channelId: '1506820166619631636', messageId: null }
});
const normalizedRoot = normalizeRootConfig({
  adminUserIds: ['123', '1505751652655693926', '1505751652655693926'],
  devUserIds: 'bad',
  errorDmUserIds: ['1505751652655693927'],
  guilds: null,
  updateSubscribers: ['1505751652655693928', 'bad'],
  disabledCommands: [' Ping ', 'PING', ''],
  uptimeStatus: { messageId: '999' }
}, rootDefaults);
assert.deepEqual(normalizedRoot.adminUserIds, ['1505751652655693926'], 'Config repository should normalize root admin IDs');
assert.deepEqual(normalizedRoot.devUserIds, [], 'Config repository should recover invalid root ID lists');
assert.deepEqual(normalizedRoot.errorDmUserIds, ['1505751652655693927'], 'Config repository should normalize error DM IDs');
assert.deepEqual(normalizedRoot.updateSubscribers, ['1505751652655693928'], 'Config repository should normalize update subscriber IDs');
assert.deepEqual(normalizedRoot.disabledCommands, ['ping'], 'Config repository should normalize disabled command names');
assert.equal(normalizedRoot.uptimeStatus.guildId, '1505751652655693926', 'Config repository should preserve default uptime guild');
assert.equal(normalizedRoot.uptimeStatus.messageId, '999', 'Config repository should preserve stored uptime message IDs');
let repositoryRoot = createDefaultRootConfig();
let repositorySaveCount = 0;
const repository = createConfigRepository({
  getRoot: () => repositoryRoot,
  setRoot: (nextRoot) => {
    repositoryRoot = nextRoot;
  },
  createDefaultRootConfig,
  createDefaultGuildConfig: () => ({ logsEnabled: false, adminRoleIds: [], nested: { enabled: true } }),
  normalizeGuildConfig: (guildConfig) => {
    guildConfig.adminRoleIds = Array.isArray(guildConfig.adminRoleIds) ? [...new Set(guildConfig.adminRoleIds)] : [];
    guildConfig.nested ??= { enabled: true };
    return guildConfig;
  },
  save: () => {
    repositorySaveCount += 1;
  }
});
assert.equal(repository.getGuild('111').logsEnabled, false, 'Config repository should create missing guild records');
repository.updateGuild('111', { logsEnabled: true, adminRoleIds: ['a', 'a'] });
assert.equal(repository.getGuild('111').logsEnabled, true, 'Config repository should update guild records');
assert.deepEqual(repository.getGuild('111').adminRoleIds, ['a'], 'Config repository should normalize updated guild records');
repository.setIdList('adminUserIds', ['1505751652655693926', 'bad', '1505751652655693926']);
assert.deepEqual(repository.getRoot().adminUserIds, ['1505751652655693926'], 'Config repository should own root ID list updates');
repository.resetGuild('111');
assert.equal(repository.getGuild('111').logsEnabled, false, 'Config repository should reset guild records to defaults');
assert.equal(repositorySaveCount, 3, 'Config repository should save mutating operations');
const moderationConfig = { warnings: {}, modNotes: {} };
const targetUserId = '1505751652655693926';
const moderatorUserId = '1505751652655693927';
assert.equal(
  addWarningRecord(moderationConfig, {
    userId: targetUserId,
    moderatorId: moderatorUserId,
    reason: 'First warning',
    createdAt: 1000
  }),
  1,
  'Moderation store should add warning records'
);
addWarningRecord(moderationConfig, {
  userId: targetUserId,
  moderatorId: moderatorUserId,
  reason: 'Second warning',
  createdAt: 2000
});
assert.equal(warningRecordsFor(moderationConfig, targetUserId).length, 2, 'Moderation store should list warning records');
assert.equal(warningCaseFor(moderationConfig, targetUserId, 2).reason, 'Second warning', 'Moderation store should fetch warning cases by number');
assert.equal(clearWarningRecords(moderationConfig, targetUserId, 1), 1, 'Moderation store should remove a single warning case');
assert.equal(warningRecordsFor(moderationConfig, targetUserId)[0].reason, 'Second warning', 'Moderation store should keep later warning cases after removal');
assert.equal(clearWarningRecords(moderationConfig, targetUserId), 1, 'Moderation store should clear all warning records');
assert.deepEqual(warningRecordsFor(moderationConfig, targetUserId), [], 'Moderation store should delete empty warning buckets');
assert.equal(
  addModNoteRecord(moderationConfig, {
    userId: targetUserId,
    moderatorId: moderatorUserId,
    note: 'A useful staff note',
    createdAt: 3000
  }),
  1,
  'Moderation store should add staff notes'
);
assert.equal(modNoteRecordsFor(moderationConfig, targetUserId)[0].note, 'A useful staff note', 'Moderation store should list staff notes');
assert.equal(moderationHistoryFor(moderationConfig, targetUserId).notes.length, 1, 'Moderation store should combine member moderation history');
assert.equal(removeModNoteRecord(moderationConfig, targetUserId, 1), true, 'Moderation store should remove staff notes by number');
assert.deepEqual(modNoteRecordsFor(moderationConfig, targetUserId), [], 'Moderation store should delete empty note buckets');
upsertTempBanRecord(moderationConfig, {
  userId: targetUserId,
  userTag: 'Test User',
  moderatorId: moderatorUserId,
  reason: 'Temporary timeout via ban',
  bannedAt: 1000,
  expiresAt: 5000
});
upsertTempBanRecord(moderationConfig, {
  userId: '1505751652655693928',
  userTag: 'Other User',
  moderatorId: moderatorUserId,
  reason: 'Later tempban',
  bannedAt: 1000,
  expiresAt: 9000
});
assert.equal(tempBanRecords(moderationConfig)[0].userId, targetUserId, 'Moderation store should list tempbans sorted by expiry');
assert.deepEqual(
  expiredTempBanRecords(moderationConfig, 6000).map((record) => record.userId),
  [targetUserId],
  'Moderation store should select expired tempbans'
);
const tempBanFailure = markTempBanUnbanFailure(moderationConfig, targetUserId, 'Could not unban this member', { now: 6100 });
assert.equal(tempBanFailure.changed, true, 'Moderation store should record tempban unban failures');
assert.equal(tempBanFailure.recentlyTried, false, 'Moderation store should identify first tempban retry attempts');
assert.equal(markTempBanUnbanFailure(moderationConfig, targetUserId, 'Still failing', { now: 6200 }).recentlyTried, true, 'Moderation store should suppress repeated tempban retry alerts inside the retry window');
assert.equal(removeTempBanRecord(moderationConfig, targetUserId).userId, targetUserId, 'Moderation store should remove tempban records');
assert.deepEqual(
  tempBanRecords(moderationConfig).map((entry) => entry.userId),
  ['1505751652655693928'],
  'Moderation store should keep unrelated tempban records after removal'
);
const bugDbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'discordbot-bugs-'));
const bugRepo = createBugRepository(path.join(bugDbDir, 'bugs.sqlite'));
try {
  const firstBug = bugRepo.createBug({
    userId: targetUserId,
    username: 'Reporter#0001',
    description: 'Dashboard button failed to open.',
    urgency: 'HIGH',
    steps: 'Run /dashboard and press Advanced.'
  });
  const secondBug = bugRepo.createBug({
    userId: moderatorUserId,
    username: 'Reporter#0002',
    description: 'Counter channel duplicated after restart.',
    urgency: 'CRITICAL'
  });
  assert.equal(firstBug.bugId, 'BUG-0001', 'Bug database should create the first persisted bug ID');
  assert.equal(secondBug.bugId, 'BUG-0002', 'Bug database should auto-increment bug IDs without duplicates');
  assert.equal(bugRepo.getBug(firstBug.bugId).status, 'OPEN', 'Bug database should default new reports to OPEN');
  const assignedBug = bugRepo.updateBugStatus(firstBug.bugId, 'ASSIGNED', moderatorUserId, { assignedToUsername: 'Admin#0001' });
  assert.equal(assignedBug.status, 'ASSIGNED', 'Bug database should update bug status');
  assert.equal(assignedBug.assignedTo, moderatorUserId, 'Bug database should persist bug assignments');
  const bugEmbedJson = bugReportEmbed(assignedBug).toJSON();
  assert.equal(bugEmbedJson.title, `🐛 New Bug Report - ${firstBug.bugId}`, 'Bug embed should include the generated bug ID');
  assert(bugEmbedJson.fields.some((field) => field.name === 'Assigned To'), 'Bug embed should show assignee details');
  const bugButtonIds = bugActionRow(assignedBug).toJSON().components.map((component) => component.custom_id);
  assert.deepEqual(
    bugButtonIds,
    [`bug:fixed:${firstBug.bugId}`, `bug:progress:${firstBug.bugId}`, `bug:reject:${firstBug.bugId}`, `bug:assign:${firstBug.bugId}`],
    'Bug action row should expose fixed, progress, reject, and assign buttons'
  );
  assert.equal(bugReportGuildId, '1505751652655693926', 'Bug reports should target the main bot server');
  assert.equal(bugReportChannelId, '1508487355324170260', 'Bug reports should target the configured bug channel');
} finally {
  bugRepo.close();
  fs.rmSync(bugDbDir, { recursive: true, force: true });
}
const everyoneRole = { id: 'guild-lock', toString: () => '@everyone' };
const lockdownRole = { id: '1505751652655693929', toString: () => '@lockdown' };
const botMember = { id: '1505751652655693930' };
const lockdownGuild = {
  id: 'guild-lock',
  roles: {
    everyone: everyoneRole,
    cache: new Map([[lockdownRole.id, lockdownRole]])
  },
  members: { me: botMember },
  channels: { cache: new Map() }
};
function fakeLockdownChannel({ text = true, botCanEdit = true, roleCanView = true } = {}) {
  const edits = [];
  return {
    guild: lockdownGuild,
    edits,
    isTextBased: () => text,
    permissionOverwrites: {
      edit: async (role, payload) => {
        edits.push({ role, payload });
      }
    },
    permissionsFor(target) {
      if (target === botMember) return { has: () => botCanEdit };
      if (target === lockdownRole || target === everyoneRole) return { has: () => roleCanView };
      return { has: () => false };
    }
  };
}
assert.equal(resolveLockdownRole(lockdownGuild, { lockdownRoleId: lockdownRole.id }), lockdownRole, 'Lockdown service should resolve configured lockdown roles');
assert.equal(resolveLockdownRole(lockdownGuild, { lockdownRoleId: 'missing' }), everyoneRole, 'Lockdown service should fall back to @everyone');
const lockdownChannel = fakeLockdownChannel();
assert.equal(canEditLockdownChannel(lockdownChannel), true, 'Lockdown service should verify bot channel edit access');
assert.equal(canLockdownRoleViewChannel(lockdownChannel, lockdownRole), true, 'Lockdown service should verify community visibility before locking');
assert.equal(lockdownDenyPermissions().SendMessages, false, 'Lockdown service should deny member sends when locking');
assert.equal(lockdownAllowPermissions().SendMessages, null, 'Lockdown service should clear member send overwrites when unlocking');
assert.equal(await lockChannelPermissions(lockdownChannel, lockdownRole), true, 'Lockdown service should lock eligible channels');
assert.equal(lockdownChannel.edits[0].payload.SendMessages, false, 'Lockdown service should apply deny payloads');
assert.equal(await unlockChannelPermissions(lockdownChannel, lockdownRole), true, 'Lockdown service should unlock editable channels');
assert.equal(lockdownChannel.edits[1].payload.SendMessages, null, 'Lockdown service should apply clear payloads');
assert.equal(await lockChannelPermissions(fakeLockdownChannel({ roleCanView: false }), lockdownRole), false, 'Lockdown service should skip hidden community channels');
const eligibleChannel = fakeLockdownChannel();
const failedChannel = fakeLockdownChannel();
const hiddenChannel = fakeLockdownChannel({ roleCanView: false });
lockdownGuild.channels.cache = new Map([
  ['eligible', eligibleChannel],
  ['failed', failedChannel],
  ['hidden', hiddenChannel]
]);
assert.deepEqual(
  await applyToEligibleServerChannels(lockdownGuild, lockdownRole, async (channel) => {
    if (channel === failedChannel) throw new Error('cannot edit');
    return true;
  }),
  { changed: 1, failed: 1 },
  'Lockdown service should count changed and failed eligible channels while skipping hidden channels'
);
const memoryMap = new Map([
  ['old', { updatedAt: 100 }],
  ['middle', { updatedAt: 200 }],
  ['new', { updatedAt: 300 }]
]);
assert.deepEqual(pruneMapByTimestamp(memoryMap, { maxEntries: 2, pruneCount: 1 }), ['old'], 'Memory limit helper should prune the oldest map entry');
assert.deepEqual([...memoryMap.keys()], ['middle', 'new'], 'Memory limit helper should keep newer map entries');
assert.deepEqual(
  newestObjectEntriesByTimestamp({
    a: { updatedAt: 100 },
    b: { updatedAt: 300 },
    c: { updatedAt: 200 }
  }, { limit: 2 }).map(([key]) => key),
  ['b', 'c'],
  'Memory limit helper should keep newest object entries by timestamp'
);
assert.throws(() => pruneMapByTimestamp(new Map(), { maxEntries: 0 }), /maxEntries must be a positive integer/, 'Memory limit helper should reject invalid limits');
assert.equal(
  safeOutboundContent('@everyone check <@&1505751652655693926> and <@1505751652655693927>'),
  '@\u200beveryone check @\u200brole and @\u200buser',
  'Security policy should neutralize mass, role, and user mentions in outbound content'
);
assert.deepEqual(
  safeAllowedMentions({ userIds: ['1505751652655693926', 'bad', '1505751652655693926'], repliedUser: true }),
  { parse: [], users: ['1505751652655693926'], repliedUser: true },
  'Security policy should only allow explicit validated user mentions'
);
assert.deepEqual(
  safeContentPayload('@here hello', { maxLength: 8 }),
  { content: '@\u200bher...', allowedMentions: { parse: [], repliedUser: false } },
  'Security policy should build clamped no-mention payloads'
);
const validStartupReport = validateStartupEnvironment({
  DISCORD_TOKEN: 'token',
  DISCORD_CLIENT_ID: '1505751652655693926',
  BOT_ENV: 'development',
  DISCORD_GUILD_ID: '1478573374392504504',
  TOGETHER_API_KEY: 'key',
  ERROR_EMAIL_TO: 'owner@example.com',
  SMTP_HOST: 'smtp.example.com',
  SMTP_USER: 'bot@example.com',
  SMTP_PASS: 'secret'
}, { requireClientId: true, requireGuildIds: true });
assert.equal(validStartupReport.ok, true, 'Startup validation should accept complete runtime and deploy env values');
assert.deepEqual(validStartupReport.guildIds, ['1478573374392504504'], 'Startup validation should return normalized guild IDs');
assert.deepEqual(validStartupReport.warnings, [], 'Startup validation should avoid warnings for complete optional config');
const invalidStartupReport = validateStartupEnvironment({
  BOT_ENV: 'development',
  DISCORD_CLIENT_ID: 'bad',
  DISCORD_GUILD_ID: 'bad-id',
  ERROR_EMAIL_TO: 'not-an-email',
  SMTP_USER: 'bot@example.com',
  TWITCH_CLIENT_ID: 'twitch-client'
}, { requireClientId: true, requireGuildIds: true });
assert.equal(invalidStartupReport.ok, false, 'Startup validation should fail missing required env values');
assert(invalidStartupReport.errors.some((line) => line.includes('DISCORD_TOKEN')), 'Startup validation should report missing tokens');
assert(invalidStartupReport.errors.some((line) => line.includes('DISCORD_CLIENT_ID')), 'Startup validation should report missing deploy client IDs');
assert(invalidStartupReport.errors.some((line) => line.includes('DISCORD_GUILD_ID')), 'Startup validation should report missing guild deploy IDs');
assert(invalidStartupReport.warnings.some((line) => line.includes('TWITCH_CLIENT_ID')), 'Startup validation should warn on partial Twitch config');
assert(formatStartupValidation(invalidStartupReport).includes('Errors:'), 'Startup validation should format errors for startup logs');
const normalizedRuntimeError = normalizeRuntimeError({ code: 'boom' });
assert(normalizedRuntimeError instanceof Error, 'Runtime boundary should normalize thrown objects into Errors');
assert.equal(normalizedRuntimeError.name, 'RuntimeError', 'Runtime boundary should label non-Error failures');
const taskFailures = [];
const syncTaskResult = runGuardedTask(' Sync Task ', () => {
  throw 'sync boom';
}, (name, error) => taskFailures.push({ name, error }));
assert.equal(syncTaskResult.started, false, 'Runtime boundary should report sync startup task failures');
assert.equal(syncTaskResult.async, false, 'Runtime boundary should report sync startup task failures as non-async');
assert.equal(typeof syncTaskResult.promise?.then, 'function', 'Runtime boundary should expose a settled promise for shutdown tracking');
assert.equal(taskFailures[0].name, 'Sync Task', 'Runtime boundary should clean startup task names');
assert.equal(taskFailures[0].error.message, 'sync boom', 'Runtime boundary should pass normalized sync errors');
const asyncTaskFailures = [];
const asyncTaskResult = runGuardedTask('Async Task', () => Promise.reject(new Error('async boom')), (name, error) => {
  asyncTaskFailures.push({ name, error });
});
assert.equal(asyncTaskResult.started, true, 'Runtime boundary should identify async startup tasks');
assert.equal(asyncTaskResult.async, true, 'Runtime boundary should identify async startup tasks');
assert.equal(typeof asyncTaskResult.promise?.then, 'function', 'Runtime boundary should expose async startup task promises for shutdown tracking');
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(asyncTaskFailures[0].error.message, 'async boom', 'Runtime boundary should report async startup task failures');
let guardedEventContext = null;
const guardedEventHandler = createGuardedEventHandler(
  async () => {
    throw new Error('event boom');
  },
  async (error, payload) => {
    guardedEventContext = { error, payload };
  }
);
await guardedEventHandler('payload');
assert.equal(guardedEventContext.error.message, 'event boom', 'Guarded event handlers should route thrown errors to the event boundary');
assert.equal(guardedEventContext.payload, 'payload', 'Guarded event handlers should keep original event arguments for context');
let reportedContext = null;
const reportedLogs = [];
await reportGuardedEventError('plain event failure', {
  eventName: 'MessageReactionAdd',
  logMessage: 'Reaction handler failed:',
  context: { extra: 'Reaction message: 123' },
  notifyDevelopersOfError: async (error, context) => {
    reportedContext = { error, context };
  },
  logger: (...args) => reportedLogs.push(args)
});
assert.equal(reportedContext.error.name, 'RuntimeError', 'Event reporter should normalize non-Error failures before notification');
assert.equal(reportedContext.context.command, 'MessageReactionAdd', 'Event reporter should include the event name as command context');
assert.equal(reportedContext.context.extra, 'Reaction message: 123', 'Event reporter should preserve extra event context');
assert.equal(reportedLogs[0][0], 'Reaction handler failed:', 'Event reporter should use the supplied log message');
const scheduledTimers = [];
const clearedTimers = [];
let intervalRuns = 0;
const guardedInterval = startGuardedInterval({
  name: ' Poller ',
  task: () => {
    intervalRuns += 1;
  },
  initialDelayMs: 250,
  intervalMs: 1000,
  setTimeoutFn: (fn, ms) => {
    const timer = { kind: 'timeout', fn, ms };
    scheduledTimers.push(timer);
    return timer;
  },
  setIntervalFn: (fn, ms) => {
    const timer = { kind: 'interval', fn, ms };
    scheduledTimers.push(timer);
    return timer;
  },
  clearTimeoutFn: (timer) => clearedTimers.push(timer),
  clearIntervalFn: (timer) => clearedTimers.push(timer)
});
assert.equal(guardedInterval.name, 'Poller', 'Guarded intervals should clean task names');
assert.deepEqual(scheduledTimers.map((timer) => [timer.kind, timer.ms]), [['timeout', 250], ['interval', 1000]], 'Guarded intervals should schedule initial delay and interval timers');
scheduledTimers[0].fn();
scheduledTimers[1].fn();
assert.equal(intervalRuns, 2, 'Guarded intervals should expose scheduled task runners');
guardedInterval.stop();
assert.equal(clearedTimers.length, 2, 'Guarded intervals should stop all scheduled timers');
let overlapRuns = 0;
let resolveOverlapTask;
const overlapInterval = startGuardedInterval({
  name: 'Overlap Guard',
  task: () => {
    overlapRuns += 1;
    return new Promise((resolve) => {
      resolveOverlapTask = resolve;
    });
  },
  intervalMs: 1000,
  setIntervalFn: () => ({ kind: 'interval' }),
  clearIntervalFn: () => {}
});
const skippedOverlap = overlapInterval.run();
assert.equal(skippedOverlap.skipped, true, 'Guarded intervals should skip overlapping async runs by default');
resolveOverlapTask();
await new Promise((resolve) => setTimeout(resolve, 0));
overlapInterval.run();
assert.equal(overlapRuns, 2, 'Guarded intervals should allow another run after the async task settles');
overlapInterval.stop();
assert.throws(
  () => startGuardedInterval({ task: () => null, intervalMs: 0 }),
  /intervalMs must be a positive number/,
  'Guarded intervals should reject invalid intervals'
);
const groupedInfoCommands = [
  'botinfo',
  'roleinfo',
  'channelinfo',
  'serverbanner',
  'invite'
];
const groupedFunCommands = [
  'rps',
  'compliment',
  'truth',
  'dare',
  'wouldyourather',
  'joke',
  'fact',
  'achievement'
];
const groupedLabCommands = [
  'vibe',
  'fortune',
  'roast',
  'hug',
  'highfive',
  'cookie',
  'challenge',
  'hotseat',
  'thisorthat',
  'aura',
  'quest',
  'lore',
  'combo',
  'emojify',
  'mock',
  'clap'
];
const newAdminCommands = ['permissions', 'modstats', 'verification', 'moderation', 'case', 'reactionrole', 'welcome', 'youtube', 'tiktok', 'clean', 'softban', 'banid', 'massban', 'tempban', 'tempbans', 'lockdownrole'];
const expansionSuiteCommands = ['profile', 'economy', 'utility', 'games', 'voice', 'media', 'security', 'staff', 'serveradmin', 'automation', 'analytics', 'rolesystem'];
assert(commands.length >= 60 && commands.length <= 80, 'The expanded suite release should stay comfortably below Discord\'s 100 top-level command cap');
assert.equal(commandNames.size, commands.length, 'Slash command names should be unique');
const commandsWithRegistryPermissionGates = commands
  .map((command) => typeof command.toJSON === 'function' ? command.toJSON() : command)
  .filter((command) => command.default_member_permissions)
  .map((command) => command.name);
assert.deepEqual(
  commandsWithRegistryPermissionGates,
  [],
  'No registered slash commands should use Discord registry permission gates'
);
for (const commandName of ['commands', 'dashboard', 'config', 'owner', 'notify', 'preview', 'leak', 'setup', 'suggestion', 'bug', 'unjoin', 'info', 'fun', 'devdashboard', 'social', 'counter', 'feature', 'featuredisable', ...globalCommunityFunCommandNames, ...newAdminCommands, ...expansionSuiteCommands]) {
  assert(commandNames.has(commandName), `/${commandName} should be included in deployable commands`);
}
const dashboardCommand = commands.find((command) => command.name === 'dashboard');
assert.equal(
  dashboardCommand?.options?.length ?? 0,
  0,
  '/dashboard should open the main control center without status/customize subcommands'
);
const configCommand = commands.find((command) => command.name === 'config');
assert.equal(
  configCommand?.options?.length ?? 0,
  0,
  '/config should stay a simple dashboard shortcut'
);
for (const commandName of ['help', 'mute', 'community', 'import', 'customcommand', 'embed', 'panel', 'warn', 'warnings', 'clearwarns', 'modnote', 'modlogs', 'lab', 'studio', 'dev', 'devcommands', 'devdiff', ...groupedInfoCommands, ...groupedFunCommands, ...groupedLabCommands]) {
  assert(!commandNames.has(commandName), `/${commandName} should be consolidated out of the slash command registry`);
}
const infoCommand = commands.find((command) => command.name === 'info');
assert(infoCommand, '/info should group info and utility lookups');
assert(
  commandRoutePaths(infoCommand).includes('info server'),
  'Command inventory should expose /info server as a route path'
);
const infoSubcommands = new Set((infoCommand.options ?? []).map((option) => option.name));
for (const subcommandName of ['server', 'user', 'avatar', 'uptime', 'membercount', 'servericon', 'serverbanner', 'invite', 'bot', 'role', 'channel', 'password']) {
  assert(infoSubcommands.has(subcommandName), `/info ${subcommandName} should be registered`);
}
const utilityCommand = commands.find((command) => command.name === 'utility');
assert(utilityCommand, '/utility should be registered');
assert(
  !(utilityCommand.options ?? []).some((option) => option.name === 'embedjson'),
  '/utility embedjson should stay removed with the public embed builder surface'
);
const funCommand = commands.find((command) => command.name === 'fun');
assert(funCommand, '/fun should group games and prompt commands');
const funSubcommands = new Set((funCommand.options ?? []).map((option) => option.name));
for (const subcommandName of ['coinflip', 'roll', 'magic8ball', 'poll', 'choose', 'rate', 'ship', 'rps', 'compliment', 'truth', 'dare', 'wouldyourather', 'joke', 'fact', 'achievement', 'topic', 'quote', 'number']) {
  assert(funSubcommands.has(subcommandName), `/fun ${subcommandName} should be registered`);
}
const ownerCommand = commands.find((command) => command.name === 'owner');
assert(ownerCommand, '/owner should be registered for public owner info');
assert(
  (ownerCommand.options ?? []).some((option) => option.name === 'info'),
  '/owner info should be registered'
);
assert(!commandNames.has('bmas'), '/bmas should stay out of the global slash command registry');
assert(!commandNames.has('mascoin'), '/mascoin should stay out of the global slash command registry');
assert(!commandNames.has('masfortune'), '/masfortune should stay out of the global slash command registry');
assert(!commandNames.has('mashype'), '/mashype should stay out of the global slash command registry');
assert(!commandNames.has('mslate'), '/mslate should stay out of the global slash command registry');
assert(!commandNames.has('faulty'), '/faulty should stay out of the global slash command registry');
assert(!commandNames.has('timmysudo'), '/timmysudo should stay out of the global slash command registry');
assert(!commandNames.has('timmy'), '/timmy should stay out of the global slash command registry');
for (const commandName of globalCommunityFunCommandNames) {
  assert(commandNames.has(commandName), `/${commandName} should be registered globally as a community fun command`);
}
assert(!commandNames.has('chaos'), '/chaos should stay removed from the slash command registry');
const masGuildCommandNames = new Set(guildSpecificCommandsForGuild('1405063177124970516').map((command) => command.name));
for (const commandName of ['bmas', 'mascoin', 'masfortune', 'mashype', 'mslate', 'faulty']) {
  assert(
    masGuildCommandNames.has(commandName),
    `/${commandName} should be registered as a guild-specific command for server 1405063177124970516`
  );
}
const timmyGuildCommandNames = new Set(guildSpecificCommandsForGuild('1340204978341675019').map((command) => command.name));
assert(timmyGuildCommandNames.has('timmysudo'), '/timmysudo should be registered as a guild-specific command for server 1340204978341675019');
assert(timmyGuildCommandNames.has('timmy'), '/timmy should be registered as a guild-specific command for server 1340204978341675019');
assert(!commands.find((command) => command.name === 'devdiff'), '/devdiff should stay removed from the slash command registry');
assert(!commands.find((command) => command.name === 'nexus'), '/nexus should be fully removed from the slash command registry');
const leakCommand = commands.find((command) => command.name === 'leak');
assert(leakCommand, '/leak should be registered for developer-controlled public command teasers');
const leakOptions = new Set((leakCommand.options ?? []).map((option) => option.name));
for (const optionName of ['feature', 'details', 'commands', 'style', 'channel']) {
  assert(leakOptions.has(optionName), `/leak should register ${optionName}`);
}
assert(!commands.find((command) => command.name === 'devkit'), '/devkit should stay removed from the slash command registry');
assert(!commands.find((command) => command.name === 'adminkit'), '/adminkit should stay removed from the slash command registry');
assert(!commands.find((command) => command.name === 'communitykit'), '/communitykit should stay removed from the slash command registry');
assert.deepEqual(
  [...productionExcludedCommandNames].sort(),
  [],
  'Production deploy should not need legacy development-only command exclusions'
);
const socialCommand = commands.find((command) => command.name === 'social');
assert(socialCommand, '/social should be registered for the Production Development social hub');
const socialSubcommands = new Set((socialCommand.options ?? []).map((option) => option.name));
for (const subcommandName of ['add', 'remove', 'bulk', 'list', 'post', 'set', 'clear']) {
  assert(socialSubcommands.has(subcommandName), `/social ${subcommandName} should be registered`);
}
const socialAddSubcommand = socialCommand.options.find((option) => option.name === 'add');
const socialAddOptions = new Set((socialAddSubcommand?.options ?? []).map((option) => option.name));
for (const optionName of ['label', 'url', 'description', 'emoji']) {
  assert(socialAddOptions.has(optionName), `/social add should register ${optionName}`);
}
const socialBulkSubcommand = socialCommand.options.find((option) => option.name === 'bulk');
const socialBulkOptions = new Set((socialBulkSubcommand?.options ?? []).map((option) => option.name));
for (const optionName of ['links', 'replace']) {
  assert(socialBulkOptions.has(optionName), `/social bulk should register ${optionName}`);
}
const counterCommand = commands.find((command) => command.name === 'counter');
assert(counterCommand, '/counter should be registered for dynamic voice-channel stat counters');
const counterSubcommands = new Set((counterCommand.options ?? []).map((option) => option.name));
for (const subcommandName of ['create', 'edit', 'delete', 'list', 'refresh', 'category', 'template', 'preview']) {
  assert(counterSubcommands.has(subcommandName), `/counter ${subcommandName} should be registered`);
}
const counterCreateSubcommand = counterCommand.options.find((option) => option.name === 'create');
const counterCreateOptions = new Set((counterCreateSubcommand?.options ?? []).map((option) => option.name));
for (const optionName of ['type', 'label', 'emoji', 'style', 'category', 'hidden', 'interval']) {
  assert(counterCreateOptions.has(optionName), `/counter create should register ${optionName}`);
}
const counterTypeOption = counterCreateSubcommand?.options?.find((option) => option.name === 'type');
const counterTypeValues = new Set((counterTypeOption?.choices ?? []).map((choice) => choice.value));
for (const typeName of ['voice_channels', 'server_growth', 'server_age_days', 'premium_members', 'giveaway_entries', 'level_leaders']) {
  assert(counterTypeValues.has(typeName), `/counter create should register ${typeName}`);
}
const counterTemplateSubcommand = counterCommand.options.find((option) => option.name === 'template');
const counterTemplateOption = counterTemplateSubcommand?.options?.find((option) => option.name === 'template');
const counterTemplateValues = new Set((counterTemplateOption?.choices ?? []).map((choice) => choice.value));
for (const templateName of ['members', 'community', 'activity', 'statistics', 'voice', 'moderation', 'fun', 'growth', 'premium', 'custom', 'all']) {
  assert(counterTemplateValues.has(templateName), `/counter template should register ${templateName}`);
}
const featureCommand = commands.find((command) => command.name === 'feature');
assert(featureCommand, '/feature should be registered for owner-only feature gates');
const featureSubcommands = new Set((featureCommand.options ?? []).map((option) => option.name));
for (const subcommandName of ['disable', 'enable', 'list']) {
  assert(featureSubcommands.has(subcommandName), `/feature ${subcommandName} should be registered`);
}
assert(commands.find((command) => command.name === 'featuredisable'), '/featuredisable should be registered as a quick disable shortcut');
const reactionRoleCommand = commands.find((command) => command.name === 'reactionrole');
assert(reactionRoleCommand, '/reactionrole should be registered for production reaction role panels');
const reactionRoleSubcommands = new Set((reactionRoleCommand.options ?? []).map((option) => option.name));
for (const subcommandName of ['setup', 'add', 'remove', 'list', 'clear', 'refresh']) {
  assert(reactionRoleSubcommands.has(subcommandName), `/reactionrole ${subcommandName} should be registered`);
}
const reactionRoleSetupSubcommand = reactionRoleCommand.options.find((option) => option.name === 'setup');
const reactionRoleSetupOptions = new Set((reactionRoleSetupSubcommand?.options ?? []).map((option) => option.name));
for (const optionName of ['channel', 'role', 'emoji', 'title', 'description', 'mode', 'label']) {
  assert(reactionRoleSetupOptions.has(optionName), `/reactionrole setup should register ${optionName}`);
}
const verificationCommand = commands.find((command) => command.name === 'verification');
assert(verificationCommand, '/verification should be registered for hidden onboarding');
const verificationSubcommands = new Set((verificationCommand.options ?? []).map((option) => option.name));
assert.deepEqual([...verificationSubcommands].sort(), ['setup'], '/verification should expose only the lightweight setup flow');
for (const subcommandName of ['setup']) {
  assert(verificationSubcommands.has(subcommandName), `/verification ${subcommandName} should be registered`);
}
const verificationSetupSubcommand = verificationCommand.options.find((option) => option.name === 'setup');
const verificationSetupOptions = new Set((verificationSetupSubcommand?.options ?? []).map((option) => option.name));
assert.deepEqual([...verificationSetupOptions].sort(), ['channel', 'role'], '/verification setup should stay lightweight');
for (const optionName of ['role', 'channel']) {
  assert(verificationSetupOptions.has(optionName), `/verification setup should register ${optionName}`);
}
const moderationCommand = commands.find((command) => command.name === 'moderation');
assert(moderationCommand, '/moderation should be registered as the compact staff hub');
const moderationSubcommands = new Set((moderationCommand.options ?? []).map((option) => option.name));
for (const subcommandName of ['warn', 'warnings', 'clear', 'history', 'case', 'note-add', 'notes', 'note-remove']) {
  assert(moderationSubcommands.has(subcommandName), `/moderation ${subcommandName} should be registered`);
}
const caseCommand = commands.find((command) => command.name === 'case');
assert(caseCommand, '/case should register the optional private case-channel module');
const caseSubcommands = new Set((caseCommand.options ?? []).map((option) => option.name));
for (const subcommandName of ['create', 'close', 'add', 'remove', 'status']) {
  assert(caseSubcommands.has(subcommandName), `/case ${subcommandName} should be registered`);
}

const indexSource = fs.readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const previewServerSource = fs.readFileSync(new URL('../src/local-preview-server.js', import.meta.url), 'utf8');
const commandsSource = fs.readFileSync(new URL('../src/commands.js', import.meta.url), 'utf8');
const deploySource = fs.readFileSync(new URL('../src/deploy-commands.js', import.meta.url), 'utf8');
const commandAuditSource = fs.readFileSync(new URL('../src/core/command-audit.js', import.meta.url), 'utf8');
const commandTelemetrySource = fs.readFileSync(new URL('../src/core/command-telemetry.js', import.meta.url), 'utf8');
const commandRouterSource = fs.readFileSync(new URL('../src/core/command-router.js', import.meta.url), 'utf8');
const commandRegistrySource = fs.readFileSync(new URL('../src/core/command-registry.js', import.meta.url), 'utf8');
const configRepositorySource = fs.readFileSync(new URL('../src/core/config-repository.js', import.meta.url), 'utf8');
const memoryLimitsSource = fs.readFileSync(new URL('../src/core/memory-limits.js', import.meta.url), 'utf8');
const securityPolicySource = fs.readFileSync(new URL('../src/core/security-policy.js', import.meta.url), 'utf8');
const runtimeBoundarySource = fs.readFileSync(new URL('../src/core/runtime-boundary.js', import.meta.url), 'utf8');
const startupValidationSource = fs.readFileSync(new URL('../src/core/startup-validation.js', import.meta.url), 'utf8');
const automodConfigSource = fs.readFileSync(new URL('../src/modules/automod/automod-config.js', import.meta.url), 'utf8');
const logConfigSource = fs.readFileSync(new URL('../src/modules/logging/log-config.js', import.meta.url), 'utf8');
const verificationConfigSource = fs.readFileSync(new URL('../src/modules/verification/verification-config.js', import.meta.url), 'utf8');
const lockdownServiceSource = fs.readFileSync(new URL('../src/modules/moderation/lockdown-service.js', import.meta.url), 'utf8');
const moderationStoreSource = fs.readFileSync(new URL('../src/modules/moderation/moderation-store.js', import.meta.url), 'utf8');
const errorCodeDocs = fs.readFileSync(new URL('../docs/ERROR_CODES.md', import.meta.url), 'utf8');
const setupDocs = fs.readFileSync(new URL('../docs/SETUP.md', import.meta.url), 'utf8');
const productionRevampDocs = fs.readFileSync(new URL('../docs/PRODUCTION_REVAMP.md', import.meta.url), 'utf8');
const readmeDocs = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const changelogDocs = fs.readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const envExample = fs.readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
const devEnvExample = fs.readFileSync(new URL('../.env.development.example', import.meta.url), 'utf8');
const ecosystemSource = fs.readFileSync(new URL('../ecosystem.config.cjs', import.meta.url), 'utf8');
const configSnapshot = JSON.parse(fs.readFileSync(new URL('../data/config.json', import.meta.url), 'utf8'));
const packageSnapshot = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
assert(
  indexSource.includes('counters: defaultCounterConfig()') &&
    indexSource.includes('guildConfig.counters = normalizeCounterConfig(guildConfig.counters)') &&
    indexSource.includes("startReadyTask('Counter monitor', () => startCounterMonitor())") &&
    indexSource.includes('async function refreshGuildCounters') &&
    indexSource.includes('const counterRefreshLocks = new Map()') &&
    indexSource.includes('async function refreshGuildCountersUnlocked') &&
    indexSource.includes("scheduleCounterRefresh(member.guild, 'member join', { force: true })") &&
    indexSource.includes("scheduleCounterRefresh(member.guild, 'member leave', { force: true })") &&
    indexSource.includes("function scheduleCounterRefresh(guild, reason = 'event', { force = false, repair = false } = {})") &&
    indexSource.includes('function nextCounterRefreshDelayMs') &&
    indexSource.includes('compactCounterRefreshReason') &&
    indexSource.includes('return refreshGuildCounters(guild, {') &&
    indexSource.includes('async function resolveCounterChannel') &&
    indexSource.includes('async function dedupeCounterRecords') &&
    indexSource.includes('async function markMissingCounterChannelsForRepair') &&
    indexSource.includes('function isManagedCounterChannel') &&
    indexSource.includes('function markCounterMaintenanceChannel') &&
    indexSource.includes('function syncCounterPermissionsIfNeeded') &&
    indexSource.includes('function counterPermissionOverwriteMatches') &&
    indexSource.includes('structuredLog(') &&
    indexSource.includes('function recordCounterMessageActivity') &&
    indexSource.includes('function counterPermissionOverwrites') &&
    indexSource.includes('const counterTemplateCatalog = Object.freeze') &&
    indexSource.includes('function counterTemplateOptions') &&
    indexSource.includes("dashboardSelectRow('dash:countertemplate'") &&
    indexSource.includes("interaction.customId === 'counter:template'") &&
    indexSource.includes("interaction.customId === 'dash:countertemplate'") &&
    indexSource.includes('voice_channels') &&
    indexSource.includes('server_growth') &&
    indexSource.includes('premium_members'),
  'Counter system should persist config, serialize refreshes, dedupe records, reuse channels, repair safely, and expose expanded dashboard templates'
);
assert(
    indexSource.includes(".register('leak', handleLeakSlash") &&
    indexSource.includes('async function handleLeakSlash') &&
    indexSource.includes('async function handleLeakPrefix') &&
    indexSource.includes('function leakAnnouncementPayload') &&
    indexSource.includes('function sanitizeLeakText') &&
    !indexSource.includes('function sanitizeFunText') &&
    indexSource.includes('const leakStyleConfigs = new Map') &&
    indexSource.includes('allowedMentions: { parse: [] }') &&
    indexSource.includes('Developer Leak Posted') &&
    indexSource.includes('mfa\\.') &&
    indexSource.includes('function parseLeakCommandNames'),
  '/leak should post public command teasers only through developer-gated safe payloads'
);
assert(
  indexSource.includes('Error Code') &&
    indexSource.includes('errorCodeFor(error, errorContext)') &&
    indexSource.includes('commandErrorUserMessage(error)') &&
    indexSource.includes('handleMessagePipelineError(error, message, { stage: messageStage, prefixAttempt })') &&
    indexSource.includes('errorNotificationCooldownMs') &&
    indexSource.includes('function errorCodeSummaryFields') &&
    indexSource.includes('function errorCodeDetails') &&
    indexSource.includes('function errorCodeAreaLabel') &&
    indexSource.includes('function aiProviderStatusLabel') &&
    indexSource.includes('Rate limit or queue overload') &&
    indexSource.includes('Error Code Logged') &&
    indexSource.includes('What to send staff'),
  'runtime error replies, developer embeds, and repeated error notifications should use shared polished error-code handling'
);
assert(
  indexSource.includes('BOT_ACTIVITY_TYPE') &&
    indexSource.includes('BOT_ACTIVITY_URL') &&
    indexSource.includes('BOT_STREAM_URL') &&
    indexSource.includes('function botActivityTypeFor') &&
    indexSource.includes('streaming: ActivityType.Streaming') &&
    indexSource.includes('if (botActivityType === ActivityType.Streaming) activity.url = botActivityUrl') &&
    indexSource.includes('status: botPresenceStatus'),
  'Bot presence should support env-driven activity types, streaming URLs, and status without hardcoding Watching'
);
assert(
  indexSource.includes('function escapeRegExp') &&
    indexSource.includes('escapeRegExp(client.user.username)') &&
    indexSource.includes('escapeRegExp(propertyName)') &&
    indexSource.includes('escapeRegExp(platform.name)'),
  'Dynamic regular expressions should escape user, bot, and metadata strings before matching'
);
assert(
  indexSource.includes('const user = message.mentions.users.first() ?? message.author;') &&
    indexSource.includes('const member = message.guild ? (message.mentions.members.first() ?? message.member) : null;') &&
    indexSource.includes('userInfoEmbed(user, member)'),
  'Prefix !userinfo should work in DMs without requiring a guild member object'
);
for (const expectedText of ['ERR_PERMISSION_DENIED', 'ERR_MODULE_DISABLED', 'ERR_INVALID_CHANNEL', 'ERR_DATABASE_FAILURE', 'ERR_INTERACTION_TIMEOUT', 'ERR_SETUP_INCOMPLETE', 'ERR_API_FAILURE-429-1234']) {
  assert(errorCodeDocs.includes(expectedText), `Error code docs should explain ${expectedText}`);
}
assert(
  errorCodeDocs.includes('You can ask the bot AI what an error code means') &&
    indexSource.includes('const errorCodeAiHelp') &&
    indexSource.includes('errorCodeAiHelp') &&
    indexSource.includes('what does ERR_API_FAILURE-429-1234 mean?'),
  'Error code docs and AI prompts should explain that AI can describe error codes'
);
assert(
  readmeDocs.includes('[docs/SETUP.md](docs/SETUP.md)') &&
    setupDocs.includes('## 1. Create The Discord App') &&
    setupDocs.includes('## 4. Optional Development Bot') &&
    setupDocs.includes('## 6. First Server Setup') &&
    setupDocs.includes('## 7. Error Alerts') &&
    setupDocs.includes('## Troubleshooting') &&
    setupDocs.includes('!unjoin') &&
    setupDocs.includes('Slash command, button, or modal failures') &&
    setupDocs.includes('ERROR_EMAIL_TO') &&
    setupDocs.includes('SMTP_HOST') &&
    readmeDocs.includes('For backup email alerts') &&
    envExample.includes('ERROR_DM_USER_IDS') &&
    envExample.includes('ERROR_EMAIL_TO') &&
    envExample.includes('SMTP_PASS') &&
    devEnvExample.includes('DISCORD_TOKEN=your_development_bot_token_here') &&
    devEnvExample.includes('BOT_ACTIVITY=Production Development testing') &&
    envExample.includes('Access users are Discord user IDs'),
  'Setup docs should cover first install, server setup, troubleshooting, and required env guidance'
);
assert(
  packageSnapshot.dependencies.nodemailer &&
    indexSource.includes("import nodemailer from 'nodemailer'") &&
    indexSource.includes('const errorEmailRecipients = parseEmailList') &&
    indexSource.includes('function isErrorEmailConfigured()') &&
    indexSource.includes('async function notifyErrorEmail') &&
    indexSource.includes('function createErrorEmailText') &&
    indexSource.includes('Failed to send error alert email') &&
    indexSource.includes("['interaction', 'message'].includes(type)") &&
    indexSource.includes('startup|background|dashboard|verification|moderation|automod|api') &&
    indexSource.includes('async function notifyDevelopersOfAiFailure') &&
    indexSource.includes('const devIds = [...configuredErrorDmIds()]'),
  'Configured error DM users and SMTP recipients should receive command, message, AI, and runtime error alerts'
);
const sendLogSource = indexSource.slice(
  indexSource.indexOf('async function sendLog'),
  indexSource.indexOf('function isAiProviderError')
);
assert(
  !sendLogSource.includes("title.endsWith('(beta mode)'") &&
    !sendLogSource.includes('`${title} (beta mode)`') &&
    !indexSource.includes('Logs are now enabled in ${channel}. (beta mode)') &&
    !indexSource.includes('Yes (beta mode)') &&
    sendLogSource.includes('function cleanLogTitle') &&
    sendLogSource.includes(".replace(/\\s*\\(beta mode\\)$/i, '')") &&
    sendLogSource.includes('createBotEmbed({') &&
    sendLogSource.includes('theme: category') &&
    sendLogSource.includes("{ name: 'Category', value: categoryLabel, inline: true }") &&
    sendLogSource.includes("{ name: 'Server', value: `${truncate(guild.name, 80)}\\n${guild.id}`, inline: true }") &&
    sendLogSource.includes("{ name: 'Logged', value: `<t:${createdAt}:F>`, inline: true }") &&
    sendLogSource.includes('footerSuffix: `${categoryLabel} log`'),
  'Server logs should be out of beta wording and include cleaner metadata fields'
);
assert(
  logConfigSource.includes('export const logCategories = Object.freeze') &&
    logConfigSource.includes('export const defaultLogCategoryIds') &&
    logConfigSource.includes('export function normalizeLogCategoryIds') &&
    logConfigSource.includes('export function formatLogCategories') &&
    logConfigSource.includes('export function logCategoryLabel') &&
    logConfigSource.includes('export function logCategoryForTitle') &&
    indexSource.includes("from './modules/logging/log-config.js'") &&
    indexSource.includes('return normalizeLogCategoryIds(guildConfig.enabledLogCategories)') &&
    !indexSource.includes('const logCategories = [') &&
    !indexSource.includes('function logCategoryForTitle(title)'),
  'Logging categories, labels, formatting, and normalization should live in the logging module'
);
assert(
  !indexSource.includes('SMTP_PASS') || envExample.includes('smtp_password_or_app_password'),
  'SMTP password should be documented as an environment secret'
);
const loginSource = indexSource.slice(indexSource.indexOf('client.login(token)'));
const loginSuccessIndex = loginSource.indexOf(".then(() => console.log('Bot logged in successfully.'))");
const loginFailureIndex = loginSource.indexOf(".catch((error) => {");
assert(
  loginSuccessIndex !== -1 &&
    loginFailureIndex !== -1 &&
    loginSuccessIndex < loginFailureIndex &&
    loginSource.includes("console.error('Failed to login:', error);") &&
    loginSource.includes('process.exit(1);'),
  'Bot startup should only log successful login after client.login resolves and should exit on login failure'
);
for (const commandName of [...groupedInfoCommands, ...groupedFunCommands]) {
  assert(
    indexSource.includes(`commandName === '${commandName}'`) ||
      indexSource.includes(`'${commandName}'`),
    `Grouped /${commandName} should still route to a slash handler`
  );
}
const commandHandlerRegistrationSource = indexSource.slice(
  indexSource.indexOf('function registerCommandHandlers'),
  indexSource.indexOf('async function handlePingSlash')
);
for (const commandName of newAdminCommands) {
  assert(
    commandHandlerRegistrationSource.includes(`'${commandName}'`) ||
      indexSource.includes(`commandName === '${commandName}'`),
    `/${commandName} should have a slash handler`
  );
}
assert(
    commandRouterSource.includes("wyr: 'wouldyourather'") &&
    indexSource.includes('Most commands are down for a bit while the bot is being updated.') &&
    indexSource.includes('/help -> /commands') &&
    indexSource.includes('directAiInstructions') &&
    indexSource.includes('sanitizeAiInput'),
  'New commands, duplicate cleanup, and AI improvements should be discoverable and wired'
);
assert(
    indexSource.includes("interaction.customId === 'verify:role'") &&
    indexSource.includes('async function handleVerificationButton') &&
    indexSource.includes('function verificationEmbed') &&
    indexSource.includes('Verify To Enter') &&
    indexSource.includes(".setLabel('Verify Me')") &&
    indexSource.includes('function verificationButtonResultEmbed') &&
    indexSource.includes('function setVerificationConfig') &&
    indexSource.includes("startReadyTask('Verification access refresh', () => refreshConfiguredVerificationAccess())") &&
    indexSource.includes('async function refreshConfiguredVerificationAccess') &&
    indexSource.includes('async function applyVerificationAccess') &&
    indexSource.includes('async function applyVerificationAccessToChannel') &&
    indexSource.includes('function isVerificationAccessSkipError') &&
    indexSource.includes('error?.code === 350003') &&
    indexSource.includes('async function syncVerificationAccessForChannel') &&
    indexSource.includes('async function applyVerificationJoinPolicy') &&
    indexSource.includes('async function handleVerificationCaptchaModal') &&
    indexSource.includes('verificationChannelAccessIntent(channel, verification)') &&
    indexSource.includes('verificationAccessLine(intent)') &&
    indexSource.includes('interaction.customId?.startsWith(\'verify:captcha:\')') &&
    indexSource.includes('visibleChannelIds') &&
    indexSource.includes('captchaEnabled') &&
    indexSource.includes('autoSyncNewChannels') &&
    indexSource.includes('ViewChannel: everyoneCanView') &&
    indexSource.includes('ViewChannel: verifiedRoleCanView') &&
    indexSource.includes('Verification setup: admin bypass role stays visible') &&
    indexSource.includes('formatVerificationAccessResult(accessResult)') &&
    verificationConfigSource.includes('export function defaultVerificationConfig') &&
    verificationConfigSource.includes('export function verificationChannelAccessIntent') &&
    verificationConfigSource.includes('export function createVerificationCaptchaCode') &&
    commandHandlerRegistrationSource.includes("['reactionrole', 'welcome']") &&
    indexSource.includes('async function handleReactionRoleSlash') &&
    indexSource.includes('async function handleReactionRolePrefix') &&
    indexSource.includes('function defaultReactionRolesConfig') &&
    indexSource.includes('function normalizeReactionRolesConfig') &&
    indexSource.includes('async function handleReactionRoleAdd') &&
    indexSource.includes('async function handleReactionRoleRemove') &&
    indexSource.includes('async function handleReactionRoleButton') &&
    indexSource.includes("interaction.customId.startsWith('rr:')") &&
    indexSource.includes('function reactionRoleIdsForMapping') &&
    indexSource.includes('function reactionRoleMappingRoles') &&
    indexSource.includes('function reactionRolePanelComponents') &&
    indexSource.includes('Reaction role panel refresh') &&
    indexSource.includes('roleIds: [role.id]') &&
    indexSource.includes('reactionRoleMentions(mapping)') &&
    indexSource.includes('client.on(Events.MessageReactionRemove') &&
    indexSource.includes('function reactionRolePanelEmbed') &&
    indexSource.includes('Reaction roles are public self-assign roles') &&
    indexSource.includes('guildConfig.reactionRoles = normalizeReactionRolesConfig(guildConfig.reactionRoles)') &&
    commandHandlerRegistrationSource.includes("['reactionrole', 'welcome']") &&
    indexSource.includes('async function handleWelcomeSlash') &&
    indexSource.includes('async function sendWelcomeForMember') &&
    indexSource.includes('function welcomeEmbed') &&
    indexSource.includes('Welcome, ${member.user.username}') &&
    indexSource.includes("name: 'Next Step'") &&
    indexSource.includes('function warningCaseEmbed') &&
    indexSource.includes('function addModNote') &&
    indexSource.includes('function modLogsEmbed') &&
    indexSource.includes('async function cleanUserMessages') &&
    indexSource.includes('async function softbanMember') &&
    indexSource.includes('async function banUserId') &&
    indexSource.includes('async function massBanUserIds') &&
    indexSource.includes('async function tempBanMember') &&
    indexSource.includes('function tempBansEmbed') &&
    indexSource.includes('function lockdownRoleEmbed') &&
    indexSource.includes('startTempBanMonitor') &&
    indexSource.includes('async function syncBotRole') &&
    indexSource.includes('function botManagedRole') &&
    indexSource.includes('no extra bot admin role was created') &&
    !indexSource.includes('guild.roles.create') &&
    !indexSource.includes('me.roles.add(role') &&
    indexSource.includes("startReadyTask('Development bot role sync', () => syncDevelopmentBotAdminRoles())") &&
    indexSource.includes('if (!result.ok || result.changed)') &&
    indexSource.includes('Development bot role sync OK') &&
    indexSource.includes('Bot Role Sync') &&
    setupDocs.includes('sync the Discord-managed bot role instead of creating a duplicate admin role') &&
    setupDocs.includes('/verification setup role:@Member channel:#verify') &&
    setupDocs.includes('normal channels and categories are invisible') &&
    setupDocs.includes('/reactionrole setup channel:#roles role:@Updates emoji:') &&
    setupDocs.includes('self-assign safe member roles with emoji buttons') &&
    setupDocs.includes('/welcome setup channel:#welcome') &&
    setupDocs.includes('Bot Role') &&
    setupDocs.includes('!verification setup @Member #verify') &&
    setupDocs.includes('!welcome setup #welcome') &&
    setupDocs.includes('/moderation note-add') &&
    setupDocs.includes('/massban user_ids') &&
    setupDocs.includes('/tempbans') &&
    readmeDocs.includes('/verification setup') &&
    readmeDocs.includes('/moderation') &&
    readmeDocs.includes('/reactionrole setup') &&
    readmeDocs.includes('self-assign button panel') &&
    readmeDocs.includes('/welcome setup') &&
    readmeDocs.includes('Bot Role') &&
    readmeDocs.includes('syncs the Discord-managed bot role instead of creating a duplicate admin role') &&
    readmeDocs.includes('/massban') &&
    readmeDocs.includes('/lockdownrole') &&
    readmeDocs.includes('/softban'),
  'Verification buttons, bot-role sync, and Dyno-style moderation helpers should be registered, handled, and documented'
);
assert(
    commandRouterSource.includes('export const slashCommandAliases = Object.freeze') &&
    commandRouterSource.includes('export const prefixCommandAliases = Object.freeze') &&
    commandRouterSource.includes('export const groupedSlashCommandRoutes = deepFreeze') &&
    commandRouterSource.includes('const groupedSlashCommandNames = new Set') &&
    commandRouterSource.includes('const slashCommandRouteNames = new Set([...slashCommandNames, ...groupedSlashCommandNames])') &&
    commandRouterSource.includes('const prefixCommandRouteNames = new Set(prefixCommandSuggestionNames)') &&
    commandAuditSource.includes('export function createCommandRuntimeAudit') &&
    commandAuditSource.includes('slashHandlerNames = []') &&
    commandAuditSource.includes('prefixHandlerNames = []') &&
    commandAuditSource.includes('missingSlashRoutes') &&
    commandAuditSource.includes('missingPrefixRoutes') &&
    indexSource.includes('function resolveSlashCommandRoute') &&
    indexSource.includes('resolveSlashCommandRouteFromRouter(commandRouting') &&
    indexSource.includes('async function runSlashCommandHandler') &&
    indexSource.includes('function commandRuntimeAudit') &&
    indexSource.includes("from './core/command-audit.js'") &&
    indexSource.includes('slashHandlerNames: slashCommandHandlerRegistry.names()') &&
    indexSource.includes('prefixHandlerNames: prefixCommandHandlerRegistry.names()') &&
    !commandRouterSource.includes('slashCommandHandlerNames = new Set') &&
    !commandRouterSource.includes('prefixCommandHandlerNames = new Set') &&
    indexSource.includes("startReadyTask('Command runtime audit', () => logCommandRuntimeAudit())") &&
    commandRouterSource.includes("help: 'commands'") &&
    !commandRouterSource.includes("dashboard: 'setup'") &&
    commandNames.has('dashboard') &&
    commandRouterSource.includes("mute: 'timeout'") &&
    commandRouterSource.includes("lockdownsever: 'lockdownserver'") &&
    !commandRouterSource.includes("verifysetup: 'verification'") &&
    indexSource.includes('replyUnknownSlashCommand(interaction, receivedCommandName)') &&
    indexSource.includes('replyUnknownPrefixCommand(message, rawCommand, commandName)'),
  'Cached, mistyped, or stale commands should be aliased or receive a clear fallback reply'
);
assert(
  commandRegistrySource.includes('export function createCommandHandlerRegistry') &&
    indexSource.includes("const slashCommandHandlerRegistry = createCommandHandlerRegistry({ kind: 'slash' })") &&
    indexSource.includes("const prefixCommandHandlerRegistry = createCommandHandlerRegistry({ kind: 'prefix' })") &&
    indexSource.includes('registerCommandHandlers();') &&
    indexSource.includes('slashCommandHandlerRegistry.get(commandName)') &&
    indexSource.includes('prefixCommandHandlerRegistry.get(commandName)') &&
    indexSource.includes(".register('ping', handlePingSlash") &&
    indexSource.includes(".register('devdashboard', handleDevDashboardSlash") &&
    indexSource.includes(".register('admincommands', handleAdminCommandsSlash") &&
    indexSource.includes(".register('setup', handleSetupSlash") &&
    indexSource.includes(".register('dashboard', handleDashboardSlash") &&
    indexSource.includes(".register('config', handleDashboardSlash") &&
    indexSource.includes(".register('permissions', handlePermissionsSlash") &&
    indexSource.includes(".register('social', handleSocialSlash") &&
    indexSource.includes(".register('bug', handleBugSlashCommand") &&
    indexSource.includes(".register(['setlogchannel', 'logtest'], handleLoggingSlash") &&
    indexSource.includes(".register(['twitch', 'youtube', 'tiktok'], handleCreatorAlertSlash") &&
    indexSource.includes(".register(['bmas', 'mascoin', 'masfortune', 'mashype', 'mslate', 'faulty', 'timmysudo', 'timmy'], handleGuildJokeSlash") &&
    indexSource.includes(".register([...globalCommunityFunCommandNames], handleGlobalCommunityFunSlash") &&
    indexSource.includes(".register([...globalCommunityFunCommandNames], handleGlobalCommunityFunPrefix") &&
    indexSource.includes(".register('case', handlePrivateCaseSlash") &&
    indexSource.includes(".register(['join', 'unjoin'], handleJoinControlPrefix"),
  'Command dispatch should start moving from hardcoded conditionals into handler registries'
);
const slashDispatchSource = indexSource.slice(
  indexSource.indexOf('async function runSlashCommandHandler'),
  indexSource.indexOf('async function replyUnknownSlashCommand')
);
const prefixDispatchSource = indexSource.slice(
  indexSource.indexOf('async function handlePrefixCommand'),
  indexSource.indexOf('async function replyUnknownPrefixCommand')
);
assert(
  slashDispatchSource.includes('slashCommandHandlerRegistry.get(commandName)') &&
    slashDispatchSource.includes('await registeredHandler.handler(interaction, route)') &&
    !slashDispatchSource.includes("if (commandName === '") &&
    prefixDispatchSource.includes('prefixCommandHandlerRegistry.get(commandName)') &&
    prefixDispatchSource.includes('return await registeredHandler.handler(message, parsedCommand)') &&
    !prefixDispatchSource.includes("if (commandName === '"),
  'Command dispatch should now use registry handlers instead of duplicate legacy fallback chains'
);
assert(
  indexSource.includes(".register('social', handleSocialPrefixRegistered") &&
    indexSource.includes(".register('admincommands', handleAdminCommandsPrefix") &&
    indexSource.includes(".register('devdashboard', handleDevDashboardPrefixRegistered") &&
    indexSource.includes(".register('setup', handleSetupPrefixRegistered") &&
    indexSource.includes(".register('config', handleDashboardPrefixRegistered") &&
    indexSource.includes(".register(['setlogchannel', 'logtest'], handleLoggingPrefix") &&
    indexSource.includes(".register('sticky', handleStickyPrefixRegistered") &&
    indexSource.includes(".register(['twitch', 'youtube', 'tiktok'], handleCreatorAlertPrefix"),
  'Phase 6 prefix commands should route through handler registries before legacy fallback'
);
assert(
    indexSource.includes(".register('verification', handleVerificationRegisteredSlash") &&
    indexSource.includes(".register(['reactionrole', 'welcome'], handleCommunitySafetySlash") &&
    indexSource.includes(".register('moderation', handleModerationHubSlash") &&
    indexSource.includes(".register(['lockdown', 'unlockdown', 'lockdownserver', 'unlockdownserver', 'purge', 'say', 'warnings', 'tempbans', 'unban', 'slowmode'], handleModerationUtilitySlash") &&
    indexSource.includes(".register('case', handlePrivateCaseSlash") &&
    indexSource.includes(".register(['warn', 'clearwarns', 'modnote', 'modlogs', 'clean', 'softban', 'banid', 'massban', 'tempban', 'kick', 'ban', 'timeout', 'unmute', 'lockdownrole', 'nick', 'role'], handleModerationActionSlash") &&
    indexSource.includes(".register('protection', handleProtectionPrefixRegistered") &&
    indexSource.includes(".register('verification', handleVerificationRegisteredPrefix") &&
    indexSource.includes(".register(['reactionrole', 'welcome'], handleCommunitySafetyPrefix") &&
    indexSource.includes(".register('moderation', handleModerationHubPrefix") &&
    indexSource.includes(".register(['lockdown', 'unlockdown', 'lockdownserver', 'unlockdownserver', 'purge', 'say', 'warnings', 'tempbans', 'unban', 'slowmode'], handleModerationUtilityPrefix") &&
    indexSource.includes(".register('case', handlePrivateCasePrefix") &&
    indexSource.includes(".register(['warn', 'clearwarns', 'modnote', 'modlogs', 'clean', 'softban', 'banid', 'massban', 'tempban', 'kick', 'ban', 'timeout', 'unmute', 'lockdownrole', 'nick', 'role'], handleModerationActionPrefix") &&
    indexSource.includes('async function ensureSlashStaffGuild') &&
    indexSource.includes('async function handleModerationHubSlash') &&
    indexSource.includes('async function handleModerationUtilitySlash') &&
    indexSource.includes('async function handleModerationActionPrefix'),
  'Phase 7 staff, safety, lockdown, and moderation commands should route through handler registries before legacy fallback'
);
assert(
  runtimeBoundarySource.includes('export function normalizeRuntimeError') &&
    runtimeBoundarySource.includes('export function runGuardedTask') &&
    runtimeBoundarySource.includes('export function createGuardedEventHandler') &&
    runtimeBoundarySource.includes('export function startGuardedInterval') &&
    runtimeBoundarySource.includes('export async function reportGuardedEventError') &&
    indexSource.includes("from './core/runtime-boundary.js'") &&
    indexSource.includes('runGuardedTask(name, task, handleReadyTaskFailure)') &&
    indexSource.includes('function onClientEvent') &&
    indexSource.includes('onClientEvent(Events.GuildMemberAdd') &&
    indexSource.includes('onClientEvent(Events.ChannelCreate') &&
    indexSource.includes('async function reportClientEventError') &&
    indexSource.includes('const messageReactionAddHandler = createGuardedEventHandler') &&
    indexSource.includes("trackRuntimeTask('event:MessageReactionAdd'") &&
    indexSource.includes('const messageReactionRemoveHandler = createGuardedEventHandler') &&
    indexSource.includes("trackRuntimeTask('event:MessageReactionRemove'") &&
    indexSource.includes('async function reportReactionEventError') &&
    indexSource.includes('reportGuardedEventError(error, {') &&
    indexSource.includes('const error = normalizeRuntimeError(reason)') &&
    indexSource.includes('const normalizedError = normalizeRuntimeError(error)'),
  'Phase 8 should centralize startup tasks, guarded event handlers, and runtime error normalization'
);
assert(
  indexSource.includes('DEV_BOT_AUTO_SHUTDOWN') &&
    indexSource.includes('[TEST COMPLETE] All tests finished. Shutting down dev bot...') &&
    indexSource.includes('function shutdownRuntime') &&
    indexSource.includes('function performShutdownRuntime') &&
    indexSource.includes('runtimeAcceptingWork = false') &&
    indexSource.includes('runtimeShutdownPromise') &&
    indexSource.includes('persistShutdownState(shutdownReason') &&
    indexSource.includes("process.on('message'") &&
    indexSource.includes("message === 'shutdown'") &&
    indexSource.includes('client.removeAllListeners()') &&
    indexSource.includes('managedIntervals') &&
    indexSource.includes('managedTimeouts') &&
    indexSource.includes('pendingRuntimeTasks') &&
    indexSource.includes('closeBugDatabase()') &&
    indexSource.includes('client.destroy()') &&
    indexSource.includes('Graceful shutdown complete') &&
    ecosystemSource.includes('DEV_BOT_AUTO_SHUTDOWN: "true"') &&
    ecosystemSource.includes('shutdown_with_message: true') &&
    ecosystemSource.includes('kill_timeout: 30000') &&
    ecosystemSource.includes('autorestart: false'),
  'Development bot test mode should shut down once after tracked tasks finish, stopping timers, persisting state, closing resources, and destroying the Discord client'
);
assert(
  indexSource.includes('async function reportBackgroundTaskFailure') &&
    indexSource.includes('async function runGuildBackgroundCheck') &&
    indexSource.includes("name: 'Uptime status refresh'") &&
    indexSource.includes("name: 'Presence refresh'") &&
    indexSource.includes("name: 'Tempban monitor'") &&
    indexSource.includes("name: 'Suggestion vote monitor'") &&
    indexSource.includes("name: 'Config reload watcher'") &&
    indexSource.includes("name: 'Twitch monitor'") &&
    indexSource.includes("name: 'YouTube monitor'") &&
    indexSource.includes("name: 'TikTok monitor'") &&
    indexSource.includes("runGuildBackgroundCheck('Tempban monitor'") &&
    indexSource.includes("runGuildBackgroundCheck('Twitch monitor'") &&
    indexSource.includes("runGuildBackgroundCheck('YouTube monitor'") &&
    indexSource.includes("runGuildBackgroundCheck('TikTok monitor'") &&
    !indexSource.includes("console.error('Twitch monitor error:'") &&
    !indexSource.includes("console.error('YouTube monitor error:'") &&
    !indexSource.includes("console.error('TikTok monitor error:'") &&
    !indexSource.includes("console.error('Failed to reload bot config:'"),
  'Phase 9 recurring background jobs should use guarded intervals and shared guild monitor error handling'
);
assert(
  configRepositorySource.includes('export function createDefaultRootConfig') &&
    configRepositorySource.includes('export function normalizeRootConfig') &&
    configRepositorySource.includes('export function createConfigRepository') &&
    indexSource.includes("from './core/config-repository.js'") &&
    indexSource.includes('const configRepository = createConfigRepository({') &&
    indexSource.includes('createDefaultRootConfig({') &&
    indexSource.includes('normalizeRootConfig(JSON.parse') &&
    indexSource.includes('configRepository.replaceRoot(loadConfig())') &&
    indexSource.includes('function normalizeGuildConfig') &&
    indexSource.includes('return configRepository.getGuild(guildId)') &&
    indexSource.includes('configRepository.updateGuild(guildId, updates)') &&
    indexSource.includes("configRepository.setIdList('devUserIds', ids)") &&
    indexSource.includes("configRepository.setIdList('adminUserIds', ids)") &&
    indexSource.includes('configRepository.resetGuild(guildId)'),
  'Phase 10 config access should move behind a repository layer while preserving the JSON backend'
);
assert(
  moderationStoreSource.includes('export function addWarningRecord') &&
    moderationStoreSource.includes('export function clearWarningRecords') &&
    moderationStoreSource.includes('export function warningRecordsFor') &&
    moderationStoreSource.includes('export function warningCaseFor') &&
    moderationStoreSource.includes('export function addModNoteRecord') &&
    moderationStoreSource.includes('export function removeModNoteRecord') &&
    moderationStoreSource.includes('export function moderationHistoryFor') &&
    indexSource.includes("from './modules/moderation/moderation-store.js'") &&
    indexSource.includes('const count = addWarningRecord(guildConfig') &&
    indexSource.includes('const removed = clearWarningRecords(getGuildConfig(guildId), userId, caseNumber)') &&
    indexSource.includes('const warnings = warningRecordsFor(getGuildConfig(guildId), user.id)') &&
    indexSource.includes('const warning = warningCaseFor(getGuildConfig(guildId), user.id, caseNumber)') &&
    indexSource.includes('const count = addModNoteRecord(guildConfig') &&
    indexSource.includes('const removed = removeModNoteRecord(getGuildConfig(guildId), userId, noteNumber)') &&
    indexSource.includes('const { warnings, notes } = moderationHistoryFor(getGuildConfig(guildId), user.id)'),
  'Phase 11 moderation warning and note storage should move behind a moderation store module'
);
assert(
  moderationStoreSource.includes('export function upsertTempBanRecord') &&
    moderationStoreSource.includes('export function expiredTempBanRecords') &&
    moderationStoreSource.includes('export function removeTempBanRecord') &&
    moderationStoreSource.includes('export function markTempBanUnbanFailure') &&
    moderationStoreSource.includes('export function tempBanRecords') &&
    indexSource.includes('for (const { userId, entry } of expiredTempBanRecords(guildConfig, now))') &&
    indexSource.includes('removeTempBanRecord(guildConfig, userId)') &&
    indexSource.includes('const failure = markTempBanUnbanFailure(guildConfig, userId, error.message, { now })') &&
    indexSource.includes('upsertTempBanRecord(guildConfig, {') &&
    indexSource.includes('const tempBans = tempBanRecords(getGuildConfig(guild.id), { limit: 15 })') &&
    !indexSource.includes('delete guildConfig.tempBans[userId]') &&
    !indexSource.includes('Object.values(getGuildConfig(guild.id).tempBans ?? {})'),
  'Phase 12 tempban records and expiry handling should move behind the moderation store module'
);
assert(
  lockdownServiceSource.includes('export function resolveLockdownRole') &&
    lockdownServiceSource.includes('export function canEditLockdownChannel') &&
    lockdownServiceSource.includes('export function canLockdownRoleViewChannel') &&
    lockdownServiceSource.includes('export async function lockChannelPermissions') &&
    lockdownServiceSource.includes('export async function unlockChannelPermissions') &&
    lockdownServiceSource.includes('export async function applyToEligibleServerChannels') &&
    lockdownServiceSource.includes('channel.permissionsFor(botMember)') &&
    indexSource.includes("from './modules/moderation/lockdown-service.js'") &&
    indexSource.includes('return canEditLockdownChannel(channel)') &&
    indexSource.includes('return resolveLockdownRole(guild, getGuildConfig(guild.id))') &&
    indexSource.includes('return canLockdownRoleViewChannel(channel, getLockdownRole(channel.guild))') &&
    indexSource.includes('return lockChannelPermissions(channel, getLockdownRole(channel.guild))') &&
    indexSource.includes('return unlockChannelPermissions(channel, getLockdownRole(channel.guild))') &&
    indexSource.includes('return applyToEligibleServerChannels(guild, getLockdownRole(guild), action)'),
  'Phase 13 lockdown permission checks and server iteration should move behind a moderation service'
);
assert(
  memoryLimitsSource.includes('export function pruneMapByTimestamp') &&
    memoryLimitsSource.includes('export function newestObjectEntriesByTimestamp') &&
    indexSource.includes("from './core/memory-limits.js'") &&
    indexSource.includes('newestObjectEntriesByTimestamp(communityMemory.joinedChat, { limit: 120 })') &&
    indexSource.includes('pruneMapByTimestamp(directMessageMemory, { maxEntries: 500, pruneCount: 50 })') &&
    indexSource.includes('pruneMapByTimestamp(joinedChatMemory, { maxEntries: 200, pruneCount: 50 })') &&
    !indexSource.includes('directMessageMemory.size > 500') &&
    !indexSource.includes('joinedChatMemory.size <= 200') &&
    !indexSource.includes('const oldestKeys = [...joinedChatMemory.entries()]'),
  'Phase 14 AI memory pruning should use shared bounded-memory helpers'
);
assert(
  securityPolicySource.includes('export function safeAllowedMentions') &&
    securityPolicySource.includes('export function safeOutboundContent') &&
    securityPolicySource.includes('export function safeContentPayload') &&
    securityPolicySource.includes("replace(/@(everyone|here)/gi, '@\\u200b$1')") &&
    securityPolicySource.includes("replace(/<@&\\d{17,22}>/g, '@\\u200brole')") &&
    indexSource.includes("from './core/security-policy.js'") &&
    indexSource.includes('safeContentPayload(reply, { userIds: [message.author.id], repliedUser: true })') &&
    indexSource.includes('message.channel.send(safeContentPayload(reply))') &&
    indexSource.includes('message.reply(safeContentPayload(reply))'),
  'Phase 15 AI and community replies should use shared outbound mention-safety payloads'
);
assert(
  startupValidationSource.includes('export function validateStartupEnvironment') &&
    startupValidationSource.includes('export function formatStartupValidation') &&
    startupValidationSource.includes('DISCORD_TOKEN') &&
    startupValidationSource.includes('DISCORD_CLIENT_ID') &&
    startupValidationSource.includes('DISCORD_GUILD_ID') &&
    startupValidationSource.includes('SMTP_USER and SMTP_PASS should be configured together.') &&
    startupValidationSource.includes('TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET should be configured together.') &&
    indexSource.includes("from './core/startup-validation.js'") &&
    indexSource.includes('const startupEnvironmentReport = validateStartupEnvironment(process.env)') &&
    indexSource.includes('formatStartupValidation(startupEnvironmentReport)') &&
    deploySource.includes("from './core/startup-validation.js'") &&
    deploySource.includes('requireClientId: true') &&
    deploySource.includes("requireGuildIds: commandDeployMode === 'guild'") &&
    deploySource.includes('Deploy warning:'),
  'Startup and deploy environment validation should be centralized before the bot logs in or registers commands'
);
assert(
  commandTelemetrySource.includes('export function createCommandTelemetry') &&
    commandTelemetrySource.includes("import { createCommandExecutionRecord } from './command-middleware.js'") &&
    commandTelemetrySource.includes('export function commandExecutionSummary') &&
    commandTelemetrySource.includes('export function commandExecutionSummaryLines') &&
    commandTelemetrySource.includes('export function commandExecutionRecentLines') &&
    commandTelemetrySource.includes('export function commandExecutionNoisyLines') &&
    indexSource.includes("from './core/command-telemetry.js'") &&
    indexSource.includes('const commandTelemetry = createCommandTelemetry({ historyLimit: commandExecutionHistoryLimit })') &&
    indexSource.includes('commandTelemetry.record(scope, commandName, status, durationMs, error)') &&
    indexSource.includes('return commandTelemetry.summary()') &&
    !indexSource.includes('const commandExecutionStats = new Map()'),
  'Command execution telemetry should be centralized behind a core helper for health and audit views'
);
assert(
  commandRouterSource.includes("export const featureControlCommandNames = new Set(['feature', 'featuredisable'])") &&
    configRepositorySource.includes('root.disabledCommands = normalizeNameList(root.disabledCommands)') &&
    indexSource.includes('async function rejectBlockedSlashCommand') &&
    indexSource.includes('function commandAccessDecision') &&
    indexSource.includes('evaluateCommandAccess({') &&
    indexSource.includes('function isCommandDisabled') &&
    indexSource.includes('function setCommandFeatureState') &&
    indexSource.includes('function featureCommandValidationError') &&
    commandRouterSource.includes('const guildSpecificSlashCommandNames = new Set') &&
    indexSource.includes('guildSpecificSlashCommandNames.has(commandName)') &&
    indexSource.includes('async function handleFeatureSlash') &&
    indexSource.includes('async function handleFeatureDisableSlash') &&
    indexSource.includes('async function handleFeaturePrefix') &&
    indexSource.includes('async function handleFeatureDisablePrefix') &&
    commandHandlerRegistrationSource.includes(".register('feature', handleFeatureSlash") &&
    commandHandlerRegistrationSource.includes(".register('featuredisable', handleFeatureDisableSlash") &&
    indexSource.includes('Feature control commands cannot disable themselves.') &&
    indexSource.includes('The devs have disabled') &&
    indexSource.includes('Maybe something fun is happening.') &&
    indexSource.includes('disabledCommandSet().has(normalized)') &&
    indexSource.includes('Owner-only command feature gates'),
  'Owner-only feature commands should toggle disabled built-in commands and block disabled slash/prefix command execution'
);
assert(
  indexSource.includes('const embedThemes = Object.freeze') &&
    indexSource.includes('function inferEmbedThemeKey') &&
    indexSource.includes('function themedFooterSuffix') &&
    indexSource.includes("theme: 'twitch'") &&
    indexSource.includes("theme: 'youtube'") &&
    indexSource.includes("theme: 'tiktok'") &&
    indexSource.includes("theme: 'moderation'") &&
    indexSource.includes("theme: 'developer'") &&
    indexSource.includes("theme: 'community'"),
  'Bot embeds should use the shared custom theme layer across major command families'
);
assert(
  indexSource.includes('StringSelectMenuBuilder') &&
    indexSource.includes('RoleSelectMenuBuilder') &&
    indexSource.includes('ChannelSelectMenuBuilder') &&
    indexSource.includes('function dashboardSelectRow') &&
    indexSource.includes("interaction.isStringSelectMenu()") &&
    indexSource.includes("interaction.customId === 'commands:select'") &&
    indexSource.includes("interaction.customId === 'dash:select'") &&
    indexSource.includes("dashboardSelectRow('dash:select'") &&
    indexSource.includes('const dashboardModuleCatalog = Object.freeze') &&
    indexSource.includes("id: 'community', label: 'Community'") &&
    indexSource.includes("id: 'welcome', label: 'Welcome'") &&
    indexSource.includes("parent: 'community', showInMenu: false") &&
    indexSource.includes('dashboardModuleCatalog') &&
    indexSource.includes('.filter((module) => module.showInMenu)') &&
    indexSource.includes('function dashboardPayload') &&
    indexSource.includes('Community Dashboard') &&
    indexSource.includes('Welcome Setup') &&
    indexSource.includes('Counter Setup') &&
    indexSource.includes('Advanced Settings') &&
    indexSource.includes('Private Case System') &&
    indexSource.includes('dashboardButton(`dash:commands:${section}:primary`') &&
    indexSource.includes("dashboardButton('dash:section:welcome'") &&
    indexSource.includes("dashboardButton('dash:section:counters'") &&
    indexSource.includes("dashboardChannelSelectRow('dash:channel:welcome'") &&
    indexSource.includes("dashboardChannelSelectRow('dash:channel:counters_category'") &&
    indexSource.includes('await interaction.deferUpdate();') &&
    indexSource.includes('const role = verification.roleId') &&
    indexSource.includes("await interaction.editReply(dashboardPayload(interaction.guild, 'verification'))") &&
    indexSource.includes('function replyUnknownComponentInteraction') &&
    indexSource.includes('function sendEphemeralInteractionNotice') &&
    indexSource.includes('Stale interaction guard') &&
    indexSource.includes("dashboardSelectRow('dash:countertemplate'") &&
    indexSource.includes("dashboardButton('dash:counters:repair'") &&
    indexSource.includes("dashboardButton('dash:section:cases'") &&
    indexSource.includes("dashboardRoleSelectRow('dash:role:cases'") &&
    indexSource.includes("dashboardChannelSelectRow('dash:channel:cases_category'") &&
    indexSource.includes("interaction.customId === 'devdash:select'") &&
    indexSource.includes('Developer Control Center') &&
    readmeDocs.includes('`/config`, `/setup`, and `!setup` open the same dashboard hub') &&
    setupDocs.includes('Use Welcome to choose the welcome channel') &&
    productionRevampDocs.includes('## Dashboard-First Control Plane') &&
    productionRevampDocs.includes('New modules should add one dashboard module record') &&
    !indexSource.includes('function legacySetupDashboardComponents') &&
    !indexSource.includes('function setupDashboardComponents') &&
    !indexSource.includes('function setupWizardPages') &&
    !indexSource.includes('async function handleSetupButton') &&
    !indexSource.includes("interaction.customId === 'setup:jump'") &&
    !indexSource.slice(indexSource.indexOf('function commandCenterComponents'), indexSource.indexOf('async function handleCommandCenterButton')).includes('new ButtonBuilder()'),
  'Dashboards should use the revamped centralized select-menu navigation instead of cluttered setup button grids'
);
assert(
  indexSource.includes('MessageFlags') &&
    indexSource.includes('flags: MessageFlags.Ephemeral') &&
    !indexSource.includes('ephemeral: true'),
  'Private interaction replies should use Discord flags instead of deprecated ephemeral response options'
);
assert(
  !indexSource.includes('[Hugging Face] Response data') &&
    !indexSource.includes('[Hugging Face] Extracted output') &&
    !indexSource.includes('[Together.ai] Response data') &&
    !indexSource.includes('[Together.ai] Extracted output') &&
    indexSource.includes('Response parsed: choices='),
  'AI provider logs should avoid raw response bodies or generated user-facing text'
);
assert(
  indexSource.includes('const applicationClientId = process.env.DISCORD_CLIENT_ID') &&
    indexSource.includes('const inviteClientId = applicationClientId ?? client.user?.id'),
  '/invite should use the configured Discord application client ID'
);
assert(
  indexSource.includes("adminCommandsEmbed({ includeDeveloper: configuredDeveloperIds().has(interaction.user.id) })") &&
    indexSource.includes("adminCommandsEmbed({ includeDeveloper: true })") &&
    indexSource.includes('Admin + Dashboard Commands'),
  'Admin and developer command help should point authorized developers to the dashboard'
);
assert.deepEqual(configSnapshot.devUserIds, ['1205738144323080214'], 'Only the owner Discord ID should be saved as a dashboard dev user');
assert.deepEqual(configSnapshot.adminUserIds, ['1205738144323080214'], 'The owner Discord ID should be saved as the initial bot admin user');
assert(
  indexSource.includes('function configuredAdminIds()') &&
    indexSource.includes('...configuredDeveloperIds()') &&
    indexSource.includes('function configuredAdminRoleIds(guildId)') &&
    indexSource.includes('function hasConfiguredAdminAccess(userId, guildId, member)') &&
    indexSource.includes('function permissionAccessDecision') &&
    indexSource.includes('configuredAdmin: hasConfiguredAdminAccess(userId, guildId, member)') &&
    indexSource.includes('evaluatePermissionAccess({'),
  'Configured admin users and configured admin roles should be able to use admin commands, with developer users unified into admin access'
);
assert(
  indexSource.includes('return devIds.has(String(userId));') &&
    !indexSource.includes('if (!devIds.size) return true;'),
  'Developer access should still require configured IDs and should not fall back to no-config access'
);
const updateNotifierSource = indexSource.slice(
  indexSource.indexOf('async function notifyUpdateSubscribers'),
  indexSource.indexOf('function createErrorEmbed')
);
assert(
  indexSource.includes("const changelogPath = path.join(process.cwd(), 'CHANGELOG.md')") &&
    indexSource.includes('function currentReleaseNotes()') &&
    indexSource.includes('findLatestChangelogEntry(changelog) ?? findChangelogEntry(changelog, botVersion)') &&
    indexSource.includes('function changelogEntryTitle(entry)') &&
    updateNotifierSource.includes('currentReleaseNotes()') &&
    updateNotifierSource.includes('What changed') &&
    !updateNotifierSource.includes('bigFeaturePreview.shipped'),
  'Update notification DMs should use only the current changelog entry instead of repeating old feature notes'
);
assert(
  !commandNames.has('dev') &&
    !commandNames.has('devcommands') &&
    !commandNames.has('devdiff') &&
    commandNames.has('devdashboard') &&
    indexSource.includes("dashboardSelectRow('devdash:select'") &&
    indexSource.includes("value: 'health'") &&
    indexSource.includes("value: 'audit'") &&
    indexSource.includes("value: 'botrole'") &&
    indexSource.includes("if (action === 'health')") &&
    indexSource.includes("if (action === 'audit')") &&
    indexSource.includes("if (action === 'botrole')"),
  'Developer slash commands should be removed in favor of the developer dashboard buttons'
);
const handledSlashCommands = new Set([
  ...[...commandHandlerRegistrationSource.matchAll(/\.register\('([^']+)'/g)].map((match) => match[1]),
  ...[...commandHandlerRegistrationSource.matchAll(/\.register\(\[([^\]]+)\]/g)]
    .flatMap((match) => [...match[1].matchAll(/'([^']+)'/g)].map((nameMatch) => nameMatch[1]))
]);
for (const groupName of ['info', 'fun']) {
  handledSlashCommands.add(groupName);
}
for (const commandName of expansionSuiteCommands) {
  handledSlashCommands.add(commandName);
}
for (const commandName of globalCommunityFunCommandNames) {
  handledSlashCommands.add(commandName);
}
handledSlashCommands.add('counter');
handledSlashCommands.add('moderation');
const missingSlashHandlers = [...commandNames].filter((commandName) => !handledSlashCommands.has(commandName));
assert.deepEqual(missingSlashHandlers, [], 'Every deployable slash command should have a slash handler');
const prefixHandlerSource = indexSource.slice(
  indexSource.indexOf('async function handlePrefixCommand'),
  indexSource.indexOf('async function replyUnknownPrefixCommand')
);
const messageCreateSource = indexSource.slice(
  indexSource.indexOf('client.on(Events.MessageCreate'),
  indexSource.indexOf('client.on(Events.MessageReactionAdd')
);
const stickyRefreshSource = indexSource.slice(
  indexSource.indexOf('async function scheduleStickyRefresh'),
  indexSource.indexOf('async function refreshStickyMessage')
);
const slashPermissionsSource = indexSource.slice(
  indexSource.indexOf("if (commandName === 'permissions')"),
  indexSource.indexOf("if (commandName === 'modstats')")
);
const handledPrefixCommands = new Set([
  ...[...commandHandlerRegistrationSource.matchAll(/\.register\('([^']+)'/g)].map((match) => match[1]),
  ...[...commandHandlerRegistrationSource.matchAll(/\.register\(\[([^\]]+)\]/g)]
    .flatMap((match) => [...match[1].matchAll(/'([^']+)'/g)].map((nameMatch) => nameMatch[1]))
]);
for (const commandName of globalCommunityFunCommandNames) {
  handledPrefixCommands.add(commandName);
}
for (const groupName of ['info', 'fun']) {
  handledPrefixCommands.add(groupName);
}
for (const commandName of expansionSuiteCommands) {
  handledPrefixCommands.add(commandName);
}
handledPrefixCommands.add('counter');
handledPrefixCommands.add('moderation');
const missingPrefixHandlers = [...commandNames]
  .filter((commandName) => !handledPrefixCommands.has(commandName));
assert.deepEqual(missingPrefixHandlers, [], 'Every public slash command should have a matching prefix command handler');
assert(
  commandHandlerRegistrationSource.includes(".register('suggestion', handleSuggestionPrefixRegistered") &&
    indexSource.includes('Usage: `!suggestion <text>`') &&
    commandHandlerRegistrationSource.includes(".register('devdashboard', handleDevDashboardPrefixRegistered") &&
    indexSource.includes('devDashboardPayload(message.guild)'),
  'Prefix suggestion and developer dashboard commands should be handled instead of falling through to unknown-command replies'
);
assert(
  indexSource.includes('function canBotReplyInChannel') &&
    messageCreateSource.includes('if (!canBotReplyInChannel(message)) return;') &&
    messageCreateSource.indexOf('if (!canBotReplyInChannel(message)) return;') < messageCreateSource.indexOf('await runTrackedPrefixCommand(message, prefixAttempt)') &&
    indexSource.includes('async function handlePermissionsSlash') &&
    indexSource.includes('permissionsEmbed(interaction.guild, channel)') &&
    indexSource.includes('async function handlePermissionsPrefix') &&
    indexSource.includes('permissionsEmbed(message.guild, channel)'),
  'Prefix commands should skip channels the bot cannot send in, and /permissions should be open for diagnostics'
);
assert(
  messageCreateSource.includes("messageStage = 'StickyRefresh';") &&
    messageCreateSource.includes('await scheduleStickyRefresh(message);') &&
    messageCreateSource.indexOf('await handlePrefixCommand(message, prefixAttempt)') < messageCreateSource.indexOf("messageStage = 'StickyRefresh';") &&
    stickyRefreshSource.includes('return refreshStickyMessage(message.guild, message.channel);') &&
    !indexSource.includes('const stickyTimers = new Map()') &&
    !stickyRefreshSource.includes('setTimeout'),
  'Sticky messages should repost immediately after each handled channel message'
);
const guildCommandCleanupSource = deploySource.slice(
  deploySource.indexOf('for (const guildId of guildIdsToClean)'),
  deploySource.indexOf('if (!guildIdsToClean.length)')
);
assert(
  deploySource.includes('readKnownGuildIds') &&
    deploySource.includes('readBotGuildIds') &&
    guildCommandCleanupSource.includes('Routes.applicationGuildCommands(clientId, guildId)') &&
    guildCommandCleanupSource.includes('const guildCommands = guildSpecificCommandsForGuild(guildId);') &&
    guildCommandCleanupSource.includes('{ body: guildCommands }') &&
    guildCommandCleanupSource.includes('Clearing duplicate guild slash command copies') &&
    guildCommandCleanupSource.includes('Syncing ${guildCommands.length} server-specific guild command(s)') &&
    !guildCommandCleanupSource.includes('{ body: commands }') &&
    deploySource.includes('candidateGuildIdsToClean') &&
    deploySource.includes('visibleGuildIds') &&
    deploySource.includes('Skipping ${skippedGuildIds.length} guild command cleanup target(s)'),
  'Deploy should keep global slash commands and clear accessible guild command copies without noisy missing-access cleanup warnings'
);
assert(
  packageSnapshot.scripts['deploy:dev'] &&
    packageSnapshot.scripts['start:dev'] &&
    ecosystemSource.includes('name: "discordbot-dev"') &&
    ecosystemSource.includes('BOT_ENV: "development"') &&
  deploySource.includes("import { commands, guildSpecificCommands, guildSpecificCommandsForGuild, productionExcludedCommandNames } from './commands.js';") &&
    deploySource.includes("from './core/command-platform.js'") &&
    commandsSource.includes('export const productionExcludedCommandNames = new Set()') &&
    deploySource.includes('const productionCommands = publicDeployCommands(commands, productionExcludedCommandNames)') &&
    deploySource.includes('validateCommandInventory(commandInventory)') &&
    deploySource.includes('{ body: productionCommands }') &&
    deploySource.includes('COMMAND_DEPLOY_MODE') &&
    deploySource.includes("commandDeployMode === 'guild'") &&
    deploySource.includes('Guild-only deploy complete. Global production commands were not touched.') &&
    deploySource.includes('Invite the development bot with bot and applications.commands scopes') &&
    indexSource.includes('BOT_CONFIG_FILE') &&
    indexSource.includes('config.${botEnvironment}.json') &&
    indexSource.includes('discordbot.${botEnvironment}.lock') &&
    readmeDocs.includes('The development bot reads `.env.development`') &&
    setupDocs.includes('npm.cmd run deploy:dev') &&
    setupDocs.includes('data/config.development.json'),
  'Development bot should use separate env, config, PM2 app, and guild-only slash command deploys'
);

const suggestionHandlerSource = indexSource.slice(
  indexSource.indexOf('async function handleSuggestionSlash'),
  indexSource.indexOf('async function handleNotifySlash')
);
assert(
  suggestionHandlerSource.indexOf('await interaction.deferReply') > -1 &&
    suggestionHandlerSource.indexOf('await interaction.deferReply') < suggestionHandlerSource.indexOf('submitSuggestion') &&
    suggestionHandlerSource.includes('sourceGuild: interaction.guild'),
  '/suggestion should acknowledge the interaction before posting to the suggestion queue'
);
assert(
  indexSource.includes("const suggestionChannelId = process.env.SUGGESTION_CHANNEL_ID?.trim() || '1505983259585282171'") &&
    indexSource.includes('const suggestionVoteThreshold =') &&
    indexSource.includes('GatewayIntentBits.GuildMessageReactions') &&
    indexSource.includes('partials: [Partials.Channel, Partials.Message, Partials.Reaction]') &&
    indexSource.includes("startReadyTask('Suggestion vote monitor', () => startSuggestionVoteMonitor())") &&
    indexSource.includes('client.on(Events.MessageReactionAdd') &&
    indexSource.includes('async function submitSuggestion') &&
    indexSource.includes('sent.react(suggestionCheckmarkEmoji)') &&
    indexSource.includes('config.suggestions[sent.id]') &&
    indexSource.includes('async function notifyDevelopersOfPromotedSuggestion') &&
    indexSource.includes('voteCount >= (record.voteThreshold ?? suggestionVoteThreshold)') &&
    indexSource.includes('Suggestion Hit The Vote Goal') &&
    commandsSource.includes("[BETA] Post a suggestion to the community vote queue."),
  'Suggestions should post to the configured queue channel, track checkmark votes, and DM developers at the vote goal'
);

const previewHandlerSource = indexSource.slice(
  indexSource.indexOf('async function handlePreviewSlash'),
  indexSource.indexOf('async function handleDevDashboardSlash')
);
assert(
  previewHandlerSource.includes("revampingCommandEmbed('preview', interaction.user)") &&
    !previewHandlerSource.includes('betaPreviewEmbed'),
  '/preview should be closed during revamp mode instead of showing release notes'
);

const joinedChatHandlerSource = indexSource.slice(
  indexSource.indexOf('async function handleJoinedChatMessage'),
  indexSource.indexOf('async function handleDirectMessage')
);
const aiConversationInstructionsSource = indexSource.slice(
  indexSource.indexOf('function directAiInstructions'),
  indexSource.indexOf('function sanitizeAiInput')
);
const joinedChatAiInstructionsSource = indexSource.slice(
  indexSource.indexOf('function huggingFaceCopilotInstructions'),
  indexSource.indexOf('function extractTogetherOutputText')
);
const clearJoinChatSource = indexSource.slice(
  indexSource.indexOf('function clearJoinChat'),
  indexSource.indexOf('function configuredDeveloperIds')
);
const joinResponseSource = indexSource.slice(
  indexSource.indexOf('function joinResponse'),
  indexSource.indexOf('function unjoinResponse')
);
assert(
  commandHandlerRegistrationSource.includes("['join', 'unjoin']") &&
    indexSource.includes('function clearJoinChat') &&
    indexSource.includes('function unjoinResponse') &&
    indexSource.includes('const joinedChatAiLocks = new Map()') &&
    !indexSource.includes('let joinedChatAiDisabled = false') &&
    indexSource.includes('function defaultCommunityMemory') &&
    indexSource.includes('function normalizeCommunityMemory') &&
    indexSource.includes('const joinedChatMaintenanceMode = false') &&
    indexSource.includes('if (joinedChatMaintenanceMode) return false;') &&
    indexSource.includes("setJoinChat(interaction.guild.id, interaction.channel.id, interaction.user.id)") &&
    indexSource.includes("setJoinChat(message.guild.id, message.channel.id, message.author.id)") &&
    joinResponseSource.includes('embeds: [') &&
    joinResponseSource.includes('createBotEmbed({') &&
    joinResponseSource.includes("title: 'AI Chat Joined'") &&
    joinResponseSource.includes("theme: 'ai'") &&
    joinResponseSource.includes("name: 'Leave'") &&
    joinResponseSource.includes('Use `!unjoin` or `/unjoin` to turn this off.') &&
    indexSource.includes('function observeServerChatMemory') &&
    indexSource.includes('observeServerChatMemory(message);') &&
    indexSource.indexOf('observeServerChatMemory(message);') < indexSource.indexOf('const joinedChatHandled = await handleJoinedChatMessage(message);') &&
    indexSource.includes("detectHostileProfanity(text, 'high')") &&
    indexSource.includes('function joinedChatMemoryKey(message)') &&
    indexSource.includes('function joinedChatStorageKey(message)') &&
    indexSource.includes('function persistJoinedChatMemory') &&
    indexSource.includes('persistJoinedChatMemory(message, memory);') &&
    indexSource.includes('function communityMemoryPrompt') &&
    indexSource.includes('function joinedChatConversationContext') &&
    indexSource.includes('function joinedChatUserPrompt') &&
    indexSource.includes('await message.channel.sendTyping().catch(() => null);') &&
    indexSource.includes('Do not impersonate specific members') &&
    indexSource.includes('Use this as style/context only') &&
    indexSource.includes('return `${message.guild.id}:${message.channel.id}:${message.author.id}`;') &&
    indexSource.includes('communityMemory.joinedChat[joinedChatStorageKey(message)]') &&
    indexSource.includes('function clearJoinedChatMemoryForGuild') &&
    indexSource.includes('joinedChatAiLocks.delete(String(guildId));') &&
    !clearJoinChatSource.includes('clearJoinedChatMemoryForGuild') &&
    joinedChatHandlerSource.includes('const aiLock = getJoinedChatAiLock(message.guild.id);') &&
    joinedChatHandlerSource.includes('lockJoinedChatAiForGuild(message.guild.id, error, errorCode);') &&
    joinedChatHandlerSource.includes('const shouldRespond = mentionedBot || repliedToBot || addressedByName;') &&
    !joinedChatHandlerSource.includes('Math.random() <') &&
    setupDocs.includes('persistent and isolated by server, channel, and user') &&
    setupDocs.includes('bounded, anonymized server style profile') &&
    readmeDocs.includes('persistent and isolated by server, channel, and user') &&
    changelogDocs.includes('bounded anonymized server style memory'),
  'Joined chat memory, server style memory, and AI locks should be scoped per server/channel/user without random unprompted replies'
);
assert(
  aiConversationInstructionsSource.includes('Default to the user topic') &&
    aiConversationInstructionsSource.includes('Only mention bot commands, bot features, testing, diagnostics, or releases when the user directly asks') &&
    !aiConversationInstructionsSource.includes('Bot version:') &&
    joinedChatAiInstructionsSource.includes('Default to the actual conversation') &&
    joinedChatAiInstructionsSource.includes('Answer the current message first') &&
    joinedChatAiInstructionsSource.includes('Do not end every reply with a question') &&
    joinedChatAiInstructionsSource.includes('Do not sound like customer support') &&
    joinedChatAiInstructionsSource.includes('Most replies should be 1-2 sentences') &&
    indexSource.includes('joinedChatSupportBoilerplatePattern') &&
    indexSource.includes('feel free to ask|let me know|how can i assist') &&
    joinedChatAiInstructionsSource.includes('Recent anonymized channel flow') &&
    joinedChatAiInstructionsSource.includes('Do not make normal chat about yourself, bot updates, testing, release notes, versions, feature flags, or command lists') &&
    !joinedChatAiInstructionsSource.includes('Bot version:') &&
    !indexSource.includes('function joinedChatLocalReply') &&
    !indexSource.includes('function joinedChatAiStyleReply') &&
    !indexSource.includes('function joinedChatFollowUpReply'),
  'AI chat prompts should stay conversation-first without retaining unused local fallback handlers'
);

assert(
    indexSource.includes("await interaction.reply({ ...dashboardPayload(interaction.guild, 'home'), flags: MessageFlags.Ephemeral });") &&
    indexSource.includes("await message.reply(dashboardPayload(message.guild, 'home'))") &&
    indexSource.includes("dashboardRoleSelectRow('dash:role:admin'") &&
    indexSource.includes('Admin Access Roles') &&
    indexSource.includes('Staff/admin access stays under Advanced Settings.'),
  'Setup should now route into /dashboard and expose role-locked admin access through the dashboard'
);
assert(
  indexSource.includes('Command center rebuilt for the command revamp.') &&
    indexSource.includes('function commandCenterPayload') &&
    indexSource.includes('function handleCommandCenterButton'),
  '/commands should use the rebuilt command center during the command revamp'
);
assert(
  indexSource.includes('const botPresenceStatus = allowedBotPresenceStatuses.has(configuredBotPresenceStatus)') &&
    indexSource.includes('status: botPresenceStatus') &&
    indexSource.includes('const uptimeRevampOffline = parseBoolean') &&
    indexSource.includes('Bot offline due to revamp. Check back later.') &&
    indexSource.includes("footerSuffix: 'Revamp monitor'"),
  'Main bot revamp mode should support invisible presence and a revamp offline uptime monitor notice'
);
assert(
  !indexSource.includes('Setup Step 12: Command Import Kits') &&
    !indexSource.includes('setup:importkit-community') &&
    !indexSource.includes("if (action.startsWith('importkit-'))") &&
    !commandsSource.includes(".setName('import')") &&
    !commandNames.has('community'),
  'Import and community kit commands should stay removed from setup and slash registration'
);
assert(
  automodConfigSource.includes('export function defaultAutoModConfig') &&
    automodConfigSource.includes('export function normalizeAutoModConfig') &&
    automodConfigSource.includes('testUserIds: []') &&
    automodConfigSource.includes('normalized.testUserIds = uniqueDiscordIds(normalized.testUserIds ?? [])') &&
    automodConfigSource.includes('export const autoModBadWordStrikeThreshold = 3') &&
    automodConfigSource.includes('export const autoModBadWordTimeoutMs = 5 * 60_000') &&
    automodConfigSource.includes("export const autoModEscalationLevels = Object.freeze(['delete', 'timeout', 'strict'])") &&
    automodConfigSource.includes('export function autoModEscalationLabel') &&
    automodConfigSource.includes('export function mediaRuleSummary') &&
    indexSource.includes("from './modules/automod/automod-config.js'") &&
    !indexSource.includes('function defaultAutoModConfig') &&
    !indexSource.includes('function normalizeAutoModConfig') &&
    indexSource.includes('function isAutoModTestUser') &&
    indexSource.includes('if (isAutoModTestUser(message)) return false') &&
    indexSource.includes('async function handleAutoModeration') &&
    indexSource.includes('async function classifyAutoModMessage') &&
    indexSource.includes('function autoModMediaViolation') &&
    indexSource.includes('detectHostileProfanity(message.content, guildConfig.automod.intensity)') &&
    indexSource.includes('Profanity AutoMod Action') &&
    indexSource.includes('function cycleAutoModEscalation') &&
    indexSource.includes('async function applyAutoModBadWordStrike') &&
    indexSource.includes('async function applyAutoModBanEscalation') &&
    indexSource.includes('await member.timeout(') &&
    indexSource.includes('await member.ban({') &&
    indexSource.includes('dash:automodintensity') &&
    indexSource.includes('dash:automodescalation') &&
    indexSource.includes("dashboardPayload(interaction.guild, 'automod')") &&
    indexSource.includes("title: 'AutoMod'") &&
    indexSource.indexOf('const autoModHandled = await handleAutoModeration(message);') < indexSource.indexOf('const joinedChatHandled = await handleJoinedChatMessage(message);') &&
    setupDocs.includes('AI AutoMod setup') &&
    setupDocs.includes('Strict is the only mode that can ban') &&
    setupDocs.includes('image/GIF media rules still work') &&
    readmeDocs.includes('AI AutoMod'),
  'Dashboard setup should configure AI AutoMod intensity and escalation before joined chat replies'
);
assert(
  indexSource.includes('function defaultProtectionConfig') &&
    indexSource.includes('function normalizeProtectionConfig') &&
    indexSource.includes('async function handleProtectionMemberJoin') &&
    indexSource.includes('async function handleProtectionMessage') &&
    indexSource.includes('async function handleProtectionStructureEvent') &&
    indexSource.includes('async function triggerProtectionIncident') &&
    indexSource.includes('Protection Alert:') &&
    indexSource.includes('dash:protectionlevel') &&
    indexSource.includes('Server Protection') &&
    commandHandlerRegistrationSource.includes(".register('protection', handleProtectionPrefixRegistered") &&
    indexSource.includes('guildConfig.protection = normalizeProtectionConfig(guildConfig.protection)') &&
    indexSource.includes('const protectionHandled = await handleProtectionMessage(message);') &&
    indexSource.indexOf('const protectionHandled = await handleProtectionMessage(message);') < indexSource.indexOf('const autoModHandled = await handleAutoModeration(message);') &&
    setupDocs.includes('Server protection setup') &&
    setupDocs.includes('!protection strict') &&
    readmeDocs.includes('Server protection'),
  'Dashboard setup should configure server protection before AutoMod and joined chat replies'
);
const twitchCommand = commands.find((command) => command.name === 'twitch');
const twitchSubcommands = new Set((twitchCommand.options ?? []).map((option) => option.name));
for (const subcommandName of ['set', 'add', 'status', 'check', 'preview', 'reset', 'remove']) {
  assert(twitchSubcommands.has(subcommandName), `/twitch ${subcommandName} should be registered`);
}
const twitchSetSubcommand = twitchCommand.options.find((option) => option.name === 'set');
const twitchSetOptions = new Set((twitchSetSubcommand?.options ?? []).map((option) => option.name));
for (const optionName of ['channel', 'announce_channel', 'mention_role', 'everyone', 'message']) {
  assert(twitchSetOptions.has(optionName), `/twitch set should register ${optionName}`);
}
const twitchAddSubcommand = twitchCommand.options.find((option) => option.name === 'add');
const twitchAddOptions = new Set((twitchAddSubcommand?.options ?? []).map((option) => option.name));
for (const optionName of ['channel', 'announce_channel', 'mention_role', 'everyone', 'message']) {
  assert(twitchAddOptions.has(optionName), `/twitch add should register ${optionName}`);
}
assert(
  twitchSetSubcommand?.options?.find((option) => option.name === 'channel')?.description.includes('twitch.tv URL'),
  '/twitch set channel should accept pasted Twitch URLs'
);
const twitchCheckSubcommand = twitchCommand.options.find((option) => option.name === 'check');
const twitchCheckOptions = new Set((twitchCheckSubcommand?.options ?? []).map((option) => option.name));
assert(twitchCheckOptions.has('announce'), '/twitch check should register the announce option');
assert(twitchCheckOptions.has('streamer'), '/twitch check should register the streamer filter option');
for (const subcommandName of ['status', 'preview', 'reset', 'remove']) {
  const subcommandOptions = new Set((twitchCommand.options.find((option) => option.name === subcommandName)?.options ?? []).map((option) => option.name));
  assert(subcommandOptions.has('streamer'), `/twitch ${subcommandName} should support a streamer filter`);
}
const twitchPreviewSubcommand = twitchCommand.options.find((option) => option.name === 'preview');
const twitchPreviewOptions = new Set((twitchPreviewSubcommand?.options ?? []).map((option) => option.name));
assert(twitchPreviewOptions.has('event'), '/twitch preview should register the event selector option');
assert(
  twitchPreviewSubcommand?.options?.find((option) => option.name === 'event')?.choices?.some((choice) => choice.value === 'end'),
  '/twitch preview should register a stream-ended preview choice'
);
const twitchPreviewSource = indexSource.slice(
  indexSource.indexOf('async function twitchPreviewPayload'),
  indexSource.indexOf('function twitchMentionSummary')
);
assert(
  indexSource.includes('function twitchAlertContent') &&
    indexSource.includes('function twitchAllowedMentions') &&
    indexSource.includes('function twitchPreviewPayload') &&
    indexSource.includes('async function twitchPreviewUser') &&
    indexSource.includes('async function fetchTwitchUser') &&
    !twitchPreviewSource.includes('client.user?.displayAvatarURL') &&
    indexSource.includes('async function fetchLatestTwitchVod') &&
    indexSource.includes('function twitchEndedEmbed') &&
    indexSource.includes('function twitchEndedComponents') &&
    indexSource.includes('function twitchPreviewEventFromPrefix') &&
    indexSource.includes('async function twitchEndPreviewPayload') &&
    indexSource.includes('function shouldSendTwitchEndedAlert') &&
    indexSource.includes("status: 'ended_announced'") &&
    indexSource.includes('Twitch Stream Ended') &&
    indexSource.includes("setLabel(vod?.url ? 'Watch Latest VOD' : 'Open Past Broadcasts')") &&
    indexSource.includes('lastEndedStreamId') &&
    indexSource.includes('lastLiveMessageId') &&
    indexSource.includes('currentlyLive') &&
    indexSource.includes('function twitchCheckEmbed') &&
    indexSource.includes('function twitchLiveComponents') &&
    indexSource.includes("setLabel('Watch Stream')") &&
    indexSource.includes('Twitch Live Alert') &&
    indexSource.includes('LIVE NOW -') &&
    indexSource.includes('const profileImage = cleanExternalUrl(user?.profile_image_url)') &&
    indexSource.includes('const maxTwitchStreamers = 10') &&
    indexSource.includes('streamers: []') &&
    indexSource.includes('function normalizeTwitchConfig') &&
    indexSource.includes('const twitchLiveAnnouncementLocks = new Set()') &&
    indexSource.includes('const twitchEndedAnnouncementLocks = new Set()') &&
    indexSource.includes('function twitchLiveAnnouncementKey') &&
    indexSource.includes('function twitchEndedAnnouncementKey') &&
    indexSource.includes('function markTwitchStreamAnnounced') &&
    indexSource.includes('function markTwitchStreamEnded') &&
    indexSource.includes('async function findRecentTwitchLiveAlert') &&
    indexSource.includes('async function findRecentTwitchEndedAlert') &&
    indexSource.includes('function isMatchingTwitchLiveAlert') &&
    indexSource.includes('function isMatchingTwitchEndedAlert') &&
    indexSource.includes('twitchLiveAnnouncementLocks.has(announcementKey)') &&
    indexSource.includes('twitchEndedAnnouncementLocks.has(announcementKey)') &&
    indexSource.includes('function cleanupDuplicateTwitchLiveAlerts') &&
    indexSource.includes('async function deleteTwitchLiveAlertsForEndedStream') &&
    indexSource.includes('function endedTwitchStreamSnapshot') &&
    indexSource.includes('deletedLiveAlerts') &&
    indexSource.includes('streamer.lastLiveMessageId = null') &&
    indexSource.includes('markTwitchStreamAnnounced(twitch, streamer, streamData.stream, liveMessage)') &&
    indexSource.includes('lastDuplicateCleanupStreamId') &&
    !indexSource.includes('function reserveTwitchEveryonePing') &&
    !indexSource.includes('function twitchEveryonePingKey') &&
    !indexSource.includes('config.twitchEveryonePings') &&
    !indexSource.includes('allowEveryonePing') &&
    indexSource.includes('syncTwitchPrimary(twitch);') &&
    indexSource.includes('saveConfig();') &&
    indexSource.includes('const candidates = normalized.streamers.length ? [...normalized.streamers, legacyStreamer] : [legacyStreamer];') &&
    indexSource.includes('function upsertTwitchStreamer') &&
    indexSource.includes('function selectTwitchStreamers') &&
    indexSource.includes("status: 'multi_checked'") &&
    indexSource.includes("status: 'already_announced'") &&
    indexSource.includes('mentionRoleId') &&
    indexSource.includes('customMessage') &&
    indexSource.includes('notifyEveryone') &&
    indexSource.includes('/twitch add') &&
    indexSource.includes('streamer:<name>') &&
    indexSource.includes("replace(/^https?:\\/\\/(?:www\\.)?twitch\\.tv\\//i, '')") &&
    setupDocs.includes('/twitch set channel:twitch_username') &&
    !indexSource.includes('channel_name:<name>') &&
    setupDocs.includes('/twitch preview') &&
    setupDocs.includes('/twitch preview event:end') &&
    setupDocs.includes('!twitch preview end') &&
    setupDocs.includes('/twitch check announce:false') &&
    setupDocs.includes('/twitch set channel:twitch_username') &&
    setupDocs.includes('/twitch add channel:second_streamer') &&
    !setupDocs.includes('channel_name:twitch_username') &&
    readmeDocs.includes('role pings') &&
    readmeDocs.includes('multiple streamers') &&
    readmeDocs.includes('twitch.tv'),
  'Twitch alerts should support multi-streamer management, advanced ping controls, previews, custom messages, and duplicate-safe checks'
);
const youtubeCommand = commands.find((command) => command.name === 'youtube');
const youtubeSubcommands = new Set((youtubeCommand.options ?? []).map((option) => option.name));
for (const subcommandName of ['set', 'status', 'check', 'preview', 'reset', 'remove']) {
  assert(youtubeSubcommands.has(subcommandName), `/youtube ${subcommandName} should be registered`);
}
const youtubeSetSubcommand = youtubeCommand.options.find((option) => option.name === 'set');
const youtubeSetOptions = new Set((youtubeSetSubcommand?.options ?? []).map((option) => option.name));
for (const optionName of ['channel', 'announce_channel', 'mention_role', 'everyone', 'message']) {
  assert(youtubeSetOptions.has(optionName), `/youtube set should register ${optionName}`);
}
assert(
  youtubeSetSubcommand?.options?.find((option) => option.name === 'channel')?.description.includes('@handle'),
  '/youtube set channel should accept YouTube handles'
);
const youtubeCheckSubcommand = youtubeCommand.options.find((option) => option.name === 'check');
const youtubeCheckOptions = new Set((youtubeCheckSubcommand?.options ?? []).map((option) => option.name));
assert(youtubeCheckOptions.has('announce'), '/youtube check should register the announce option');
assert(
  packageSnapshot.dependencies['fast-xml-parser'] &&
    indexSource.includes("import { XMLParser } from 'fast-xml-parser'") &&
    indexSource.includes('startReadyTask(\'YouTube monitor\', () => startYouTubeMonitor())') &&
    indexSource.includes('function defaultYouTubeConfig') &&
    indexSource.includes('function normalizeYouTubeConfig') &&
    indexSource.includes('async function handleYouTubeSlash') &&
    indexSource.includes('async function handleYouTubePrefix') &&
    indexSource.includes('async function startYouTubeMonitor') === false &&
    indexSource.includes('function startYouTubeMonitor') &&
    indexSource.includes('async function checkYouTubeForGuild') &&
    indexSource.includes('async function fetchYouTubeChannelFeed') &&
    indexSource.includes('function youtubeVideoEmbed') &&
    indexSource.includes('YouTube Upload Alert') &&
    indexSource.includes('const youtubeUploadAnnouncementLocks = new Set()') &&
    indexSource.includes('function youtubeUploadAnnouncementKey') &&
    indexSource.includes('function markYouTubeVideoAnnounced') &&
    indexSource.includes('async function findRecentYouTubeAlert') &&
    indexSource.includes('function isMatchingYouTubeAlert') &&
    indexSource.includes('function shouldSeedCurrentCreatorPost') &&
    indexSource.includes('status: \'seeded_latest\'') &&
    indexSource.includes('youtube.announceNextExisting = true') &&
    indexSource.includes('seedYouTubeLatestVideo') &&
    indexSource.includes('youtubeUploadAnnouncementLocks.has(announcementKey)') &&
    commandHandlerRegistrationSource.includes("['twitch', 'youtube', 'tiktok']") &&
    commandRouterSource.includes("yt: 'youtube'") &&
    setupDocs.includes('/youtube set channel:@youtube_handle') &&
    setupDocs.includes('/youtube check announce:false') &&
    setupDocs.includes('!youtube @youtube_handle') &&
    readmeDocs.includes('/youtube set') &&
    readmeDocs.includes('YouTube upload alerts') &&
    readmeDocs.includes('@handle'),
  'YouTube upload alerts should register, monitor RSS feeds, avoid duplicate upload posts, and be documented'
);
const tiktokCommand = commands.find((command) => command.name === 'tiktok');
assert(tiktokCommand, '/tiktok should be registered for TikTok post alerts');
const tiktokSubcommands = new Set((tiktokCommand.options ?? []).map((option) => option.name));
for (const subcommandName of ['set', 'status', 'check', 'preview', 'reset', 'remove']) {
  assert(tiktokSubcommands.has(subcommandName), `/tiktok ${subcommandName} should be registered`);
}
const tiktokSetSubcommand = tiktokCommand.options.find((option) => option.name === 'set');
const tiktokSetOptions = new Set((tiktokSetSubcommand?.options ?? []).map((option) => option.name));
for (const optionName of ['creator', 'announce_channel', 'mention_role', 'everyone', 'message']) {
  assert(tiktokSetOptions.has(optionName), `/tiktok set should register ${optionName}`);
}
assert(
  tiktokSetSubcommand?.options?.find((option) => option.name === 'creator')?.description.includes('profile URL'),
  '/tiktok set creator should accept TikTok profile URLs'
);
const tiktokCheckSubcommand = tiktokCommand.options.find((option) => option.name === 'check');
const tiktokCheckOptions = new Set((tiktokCheckSubcommand?.options ?? []).map((option) => option.name));
assert(tiktokCheckOptions.has('announce'), '/tiktok check should register the announce option');
assert(
  indexSource.includes("startReadyTask('TikTok monitor', () => startTikTokMonitor())") &&
    indexSource.includes('function defaultTikTokConfig') &&
    indexSource.includes('function normalizeTikTokConfig') &&
    indexSource.includes('async function handleTikTokSlash') &&
    indexSource.includes('async function handleTikTokPrefix') &&
    indexSource.includes('function startTikTokMonitor') &&
    indexSource.includes('async function checkTikTokForGuild') &&
    indexSource.includes('async function fetchTikTokProfileFeed') &&
    indexSource.includes('function parseTikTokProfileHtml') &&
    indexSource.includes('function tiktokProfileInfoFromObject') &&
    indexSource.includes('function updateTikTokCreatorProfile') &&
    indexSource.includes('function cleanTikTokImageUrl') &&
    indexSource.includes('function tiktokVideoEmbed') &&
    indexSource.includes('avatarUrl') &&
    indexSource.includes('thumbnail: avatarUrl') &&
    indexSource.includes('footerSuffix: `TikTok Post Alert | @${username}`') &&
    indexSource.includes('TikTok Post Alert') &&
    indexSource.includes('const tiktokPostAnnouncementLocks = new Set()') &&
    indexSource.includes('function tiktokPostAnnouncementKey') &&
    indexSource.includes('function markTikTokVideoAnnounced') &&
    indexSource.includes('async function findRecentTikTokAlert') &&
    indexSource.includes('function isMatchingTikTokAlert') &&
    indexSource.includes('function shouldSeedCurrentCreatorPost') &&
    indexSource.includes('status: \'seeded_latest\'') &&
    indexSource.includes('tiktok.announceNextExisting = true') &&
    indexSource.includes('seedTikTokLatestVideo') &&
    indexSource.includes('tiktokPostAnnouncementLocks.has(announcementKey)') &&
    commandHandlerRegistrationSource.includes("['twitch', 'youtube', 'tiktok']") &&
    commandRouterSource.includes("tt: 'tiktok'") &&
    indexSource.includes("value: 'tiktok'") &&
    !indexSource.includes('setup:tiktok') &&
    indexSource.includes('TikTok Alerts Updated') &&
    setupDocs.includes('/tiktok set creator:@tiktok_handle') &&
    setupDocs.includes('/tiktok check announce:false') &&
    setupDocs.includes('!tiktok @tiktok_handle') &&
    readmeDocs.includes('/tiktok set') &&
    readmeDocs.includes('TikTok post alerts'),
  'TikTok post alerts should register, monitor public profiles, avoid duplicate posts, and be documented'
);
const commandListSource = indexSource.slice(
  indexSource.indexOf('function commandCenterPayload'),
  indexSource.indexOf('function groupedPrefixHelpEmbed')
);
assert(
  indexSource.includes("await interaction.reply(commandCenterPayload(interaction.user, 'all', interaction.guild))") &&
    indexSource.includes("await message.reply(commandCenterPayload(message.author, 'all', message.guild))") &&
    commandListSource.includes("all: 'all'") &&
    commandListSource.includes("commands: 'all'") &&
    commandListSource.includes("dashboardSelectRow('commands:select'") &&
    !commandListSource.includes('function commandIndexEmbeds') &&
    commandListSource.includes('function commandOptionPathLines') &&
    commandListSource.includes('productionExcludedCommandNames.has(command.name)') &&
    commandListSource.includes('option.type === 2') &&
    commandListSource.includes('`${option.name} ${subcommand.name}`') &&
    indexSource.includes("interaction.customId.startsWith('commands:')") &&
    indexSource.includes("interaction.customId === 'commands:select'") &&
    indexSource.includes('Command Health') &&
    indexSource.includes('Community Hub') &&
    indexSource.includes('Popular Commands') &&
    indexSource.includes('Advanced Settings'),
  '/commands and !help should show the rebuilt community-first command center with section menu navigation'
);
for (const command of commands) {
  const categorizedBySharedCommunityFunList = globalCommunityFunCommandNames.includes(command.name) &&
    commandListSource.includes('...globalCommunityFunCommandNames');
  assert(
    commandListSource.includes(`'${command.name}'`) || categorizedBySharedCommunityFunList,
    `/commands full index should categorize /${command.name}`
  );
}
assert(
  commandHandlerRegistrationSource.includes(".register('notify', handleNotifySlash") &&
    commandHandlerRegistrationSource.includes(".register('notify', handleNotifyPrefix") &&
    commandsSource.includes(".setName('notify')"),
  'Notify should be available as both a slash command and prefix command'
);
assert(
  indexSource.includes('const revampingCommandNames = new Set') &&
    indexSource.includes("const revampModeAllowedCommandNames = new Set(['mslate'])") &&
    indexSource.includes('function isGlobalRevampModeEnabled') &&
    indexSource.includes('process.env.BOT_REVAMP_MODE') &&
    !indexSource.includes("'preview',\n  'join'") &&
    indexSource.includes('function rejectBlockedSlashCommand') &&
    indexSource.includes('commandAccessDecision(route.commandName, route.receivedName)') &&
    indexSource.includes('function revampingCommandEmbed') &&
    indexSource.includes('Most commands are down for a bit while the bot is being updated.') &&
    indexSource.includes('Commands are locked on the main bot while the production update is being prepared.') &&
    indexSource.includes('The developer will reopen commands when the revamp is done.') &&
    indexSource.includes('closed while the bot is being rebuilt'),
  'Global revamp mode should lock main-bot commands except the explicit emergency allowlist while development stays open'
);
assert(
    commandRouterSource.includes('guildSpecificSlashCommandRoutes') &&
    indexSource.includes('resolveSlashCommandRoute(interaction.commandName, interaction.guildId ?? interaction.guild?.id, interaction)') &&
    indexSource.includes('function communityFunCooldown') &&
    indexSource.includes('function communityFunCommandPayload') &&
    indexSource.includes('function guildJokePayload') &&
    indexSource.includes("if (commandName === 'bmas')") &&
    indexSource.includes("title: 'Bmas Roll Call'") &&
    indexSource.includes("allowedUsers: ['608820949084536874']") &&
    indexSource.includes("if (commandName === 'mascoin')") &&
    indexSource.includes("if (commandName === 'masfortune')") &&
    indexSource.includes("if (commandName === 'mashype')") &&
    indexSource.includes("if (commandName === 'mslate')") &&
    indexSource.includes("description: 'go live ginger, you are late'") &&
    indexSource.includes("allowedUsers: ['536915976038645760']") &&
    indexSource.includes("if (commandName === 'faulty')") &&
    indexSource.includes("description: 'faulty is cool and cute'") &&
    indexSource.includes("allowedUsers: ['933765521319555112']") &&
    indexSource.includes("if (commandName === 'timmysudo')") &&
    indexSource.includes("description: 'timmy sudo go live already bru'") &&
    indexSource.includes("if (commandName === 'timmy')") &&
    indexSource.includes("communityFunCommandPayload('timmy'") &&
    commandsSource.includes("guildId: '1405063177124970516'") &&
    commandsSource.includes("guildId: '1340204978341675019'") &&
    commandsSource.includes(".setName('bmas')") &&
    commandsSource.includes(".setName('mascoin')") &&
    commandsSource.includes(".setName('masfortune')") &&
    commandsSource.includes(".setName('mashype')") &&
    commandsSource.includes(".setName('mslate')") &&
    commandsSource.includes(".setName('faulty')") &&
    commandsSource.includes(".setName('timmysudo')") &&
    commandsSource.includes(".setName('timmy')"),
  'Guild-specific slash commands should be routed only for their configured guilds'
);
assert(
  !commandNames.has('devdiff') &&
    !indexSource.includes("if (commandName === 'devdiff')") &&
    !indexSource.includes("interaction.customId.startsWith('devdiff:')") &&
    indexSource.includes('productionExcludedCommandNames.has(command.name)'),
  '/devdiff should be removed from command routing while production filtering remains intact'
);
assert(
  !commandNames.has('nexus') &&
    !commandsSource.includes(".setName('nexus')") &&
    !commandsSource.includes('nexusCommandSuite') &&
    !indexSource.includes("if (commandName === 'nexus')") &&
    !indexSource.includes('function handleNexusSlash') &&
    !indexSource.includes('function handleNexusPrefix') &&
    !indexSource.includes('function handleNexusButton') &&
    !indexSource.includes('const nextBotPayloadHandlers = new Map') &&
    !indexSource.includes('function nextBotPayload') &&
    !indexSource.includes("interaction.customId.startsWith('nexus:')") &&
    !indexSource.includes('missingNexusRoutes') &&
    !indexSource.includes('Nexus only runs on the Production Development bot.') &&
    !readmeDocs.includes('/nexus'),
  'Legacy Nexus command suite should be fully removed from registry, runtime routing, buttons, audits, and README'
);
assert(
  !commandsSource.includes(".setName('chaos')") &&
    !indexSource.includes("if (commandName === 'chaos')") &&
    !indexSource.includes('function handleChaosSlash') &&
    !indexSource.includes('function handleChaosPrefix') &&
    !indexSource.includes('Chaos Lab') &&
    !indexSource.includes('chaosProphecies') &&
    !indexSource.includes('chaosSnackBases'),
  '/chaos and Chaos Lab helpers should stay removed'
);
assert(
  !indexSource.includes("if (commandName === 'import')") &&
    !commandsSource.includes(".setName('import')") &&
    !commandNames.has('community') &&
    !commandsSource.includes(".setName('ticket')") &&
    !indexSource.includes("commandName === 'ticket'") &&
    !indexSource.includes('handleTicket') &&
    !indexSource.includes('ticket:') &&
    !indexSource.includes('Ticket Desk') &&
    !indexSource.includes('defaultTicketConfig') &&
    !indexSource.includes('normalizeTicketConfig') &&
    !indexSource.includes('ticketTranscript') &&
    !commandsSource.includes(".setName('devkit')") &&
    !commandsSource.includes(".setName('adminkit')") &&
    !commandsSource.includes(".setName('communitykit')") &&
    !indexSource.includes('function handleImportSlash') &&
    !indexSource.includes('function handleImportPrefix') &&
    !indexSource.includes('function importKitHelpEmbed') &&
    !indexSource.includes('function handleDevKitSlash') &&
    !indexSource.includes('function handleAdminKitSlash') &&
    !indexSource.includes('function handleCommunityKitSlash') &&
    !indexSource.includes('function importCustomCommandKit') &&
    !indexSource.includes('function customCommandImportResultEmbed') &&
    !indexSource.includes('function devKitEmbedFor') &&
    !indexSource.includes('function adminKitEmbedFor') &&
    !indexSource.includes('function communityKitEmbedFor'),
  'Import/community kits should stay fully removed and ticket code should not remain registered or wired'
);
assert(
  !commandNames.has('lab') &&
    groupedLabCommands.every((commandName) => !commandNames.has(commandName)) &&
    !indexSource.includes('lab: groupedSlashCommandRoutes.lab') &&
    !indexSource.includes('await handleCommunityLabSlash(interaction)') &&
    !indexSource.includes('await handleCommunityLabPrefix(message'),
  'Community lab commands should stay removed from the registry and live command routes'
);
assert(
  !commandNames.has('customcommand') &&
    !indexSource.includes('customCommands: {}') &&
    indexSource.includes('delete guildConfig.customCommands') &&
    !indexSource.includes('normalizeCustomCommands') &&
    !previewServerSource.includes('normalizeCustomCommands') &&
    !indexSource.includes('Custom command builder only runs on the testing bot.') &&
    !indexSource.includes("if (subcommand === 'dashboard')") &&
    !indexSource.includes("action === 'dashboard' || action === 'panel'") &&
    !indexSource.includes('function customCommandDashboardPayload') &&
    !indexSource.includes('function customCommandDashboardEmbed') &&
    !indexSource.includes('function customCommandDashboardComponents') &&
    !indexSource.includes('function customCommandCreateModal') &&
    !indexSource.includes('function customCommandRemoveModal') &&
    !indexSource.includes('customdash:') &&
    !indexSource.includes('handleCustomCommandDashboard') &&
    !indexSource.includes("interaction.fields.getTextInputValue('custom_command_response')") &&
    !indexSource.includes('await handleCustomCommandSlash(interaction)') &&
    !indexSource.includes('await handleCustomCommandPrefix(message, args)') &&
    !indexSource.includes('handleStoredCustomCommand(message, commandName)') &&
    indexSource.includes('let config = loadConfig()') &&
    indexSource.includes('function reloadConfigFromDiskIfChanged') &&
    indexSource.includes('fs.renameSync(tempPath, configPath)') &&
    indexSource.includes('if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)') &&
    indexSource.includes("startReadyTask('Config reload watcher', () => startConfigReloadWatcher())") &&
    indexSource.includes('const developmentGuildIds = parseIdList(process.env.DISCORD_GUILD_ID)') &&
    indexSource.includes('function shouldBlockDevelopmentGuild') &&
    indexSource.includes('rejectWrongDevelopmentGuildInteraction(interaction)') &&
    indexSource.includes('shouldBlockDevelopmentGuild(message.guild?.id)'),
  'Main and development bots should keep the custom command builder/dashboard removed from live routes'
);
assert(
  indexSource.includes('function handleSocialSlash') &&
    indexSource.includes('async function handleSocialPrefix') &&
    indexSource.includes('socialLinks: defaultSocialLinksConfig()') &&
    indexSource.includes('guildConfig.socialLinks = normalizeSocialLinksConfig(guildConfig.socialLinks)') &&
    indexSource.includes('const socialLinkLimitPerGuild = 50') &&
    !indexSource.includes('function socialLinkButtonRows') &&
    indexSource.includes('const socialPlatformProfiles') &&
    indexSource.includes('function socialPlatformForUrl') &&
    indexSource.includes('GatewayIntentBits.GuildExpressions') &&
    indexSource.includes('const socialTikTokEmojiId') &&
    indexSource.includes('const socialYouTubeEmojiId') &&
    indexSource.includes('const socialTwitchEmojiId') &&
    indexSource.includes('const socialInstagramEmojiId') &&
    indexSource.includes('const socialXEmojiId') &&
    indexSource.includes('const socialLinktreeEmojiId') &&
    indexSource.includes("emojiNames: ['tiktok_logo', 'tiktok', 'tik_tok']") &&
    indexSource.includes("emojiNames: ['youtube_logo', 'youtube', 'yt_logo']") &&
    indexSource.includes("emojiNames: ['twitch_logo', 'twitch']") &&
    indexSource.includes("emojiNames: ['instagram_logo', 'instagram', 'insta']") &&
    indexSource.includes("emojiNames: ['x_logo', 'x_twitter', 'twitter_logo']") &&
    indexSource.includes("emojiNames: ['linktree_logo', 'linktree']") &&
    indexSource.includes('function socialPlatformCustomEmoji') &&
    indexSource.includes('function socialPlatformDisplayEmoji') &&
    indexSource.includes('function socialPlatformTextBadge') &&
    indexSource.includes('function socialLinkDisplayIcon') &&
    indexSource.includes('function cleanSocialInlineIcon') &&
    indexSource.includes("badge: 'YT'") &&
    indexSource.includes("badge: 'IG'") &&
    indexSource.includes("badge: 'TV'") &&
    indexSource.includes("badge: 'TT'") &&
    indexSource.includes('if (!clean || /^\\?+$/.test(clean)) return null;') &&
    !indexSource.includes('return platform.emoji || platform.name;') &&
    !indexSource.includes('platform.emoji || platform.name} ${name}') &&
    !indexSource.includes('function socialPlatformButtonEmoji') &&
    indexSource.includes('function socialHubThumbnailUrl') &&
    !indexSource.includes('payload.components') &&
    !indexSource.includes('button.setEmoji(emoji)') &&
    indexSource.includes('function cleanSocialStoredKey') &&
    indexSource.includes('function socialLinkKeyFor') &&
    indexSource.includes('cleanSocialStoredKey(link?.key) || socialLinkKeyFor(label, url)') &&
    indexSource.includes('function importSocialLinks') &&
    indexSource.includes('function parseSocialBulkLinks') &&
    indexSource.includes('function socialDirectoryEmbeds') &&
    indexSource.includes('return [socialCompactDirectoryEmbed(guild, socialLinks, groups)]') &&
    indexSource.includes('function socialCompactDirectoryEmbed') &&
    indexSource.includes('function socialCompactPlatformField') &&
    indexSource.includes('function socialCompactLinkLine') &&
    indexSource.includes('function socialGuildAuthor') &&
    indexSource.includes('function socialGuildIconUrl') &&
    indexSource.includes('socialGuildIconUrl(guild)') &&
    indexSource.includes('function socialDirectoryGroupsByPlatform') &&
    indexSource.includes('createBotEmbed({') &&
    indexSource.includes("theme: 'social'") &&
    indexSource.includes('author: socialGuildAuthor(guild)') &&
    indexSource.includes('thumbnail') &&
    indexSource.includes('function socialLinkDisplayLabel') &&
    indexSource.includes('function socialLinkProfileLabel') &&
    indexSource.includes("socialLinkKey(label) === socialLinkKey(platform.name)") &&
    indexSource.includes("return `@${cleanSegment}`;") &&
    !indexSource.slice(indexSource.indexOf('function socialDirectoryEmbeds'), indexSource.indexOf('function socialLinkDisplayLabel')).includes('new EmbedBuilder()') &&
    !indexSource.includes('function socialLinkDirectoryLine') &&
    !indexSource.includes('function socialDirectoryGroupEmbeds') &&
    !indexSource.includes('function socialHubEmbeds') &&
    !indexSource.includes('function chunkSocialDirectoryLines') &&
    indexSource.includes('embeds: socialDirectoryEmbeds(guild, socialLinks)') &&
    indexSource.includes("subcommand === 'bulk'") &&
    indexSource.includes("action === 'bulk' || action === 'import' || action === 'addmany'") &&
    !indexSource.includes('The social link hub only runs on the Production Development bot.') &&
    commandHandlerRegistrationSource.includes(".register('social', handleSocialSlash") &&
    commandHandlerRegistrationSource.includes(".register('social', handleSocialPrefixRegistered") &&
    indexSource.includes('`/social add`, `/social bulk`, `/social list`, `/social post`, `/social set`, `/social clear` - Manage server social links.') &&
    indexSource.includes('/social add') &&
    indexSource.includes('/social bulk') &&
    indexSource.includes('/social post') &&
    indexSource.includes('Server Social Hub'),
  '/social should be a public per-server social link hub with staff-managed storage and platform-safe duplicate labels'
);
assert(
  indexSource.includes('function canCommunityViewChannel') &&
    lockdownServiceSource.includes('channel.permissionsFor(botMember)') &&
    indexSource.includes('!canCommunityViewChannel(channel)') &&
    indexSource.includes('deleteLockdownAnnouncement') &&
    indexSource.includes('function lockdownResultEmbed') &&
    indexSource.includes('await deleteLockdownAnnouncement(channel, scope)') &&
    indexSource.includes('Only community-visible text channels are touched.') &&
    indexSource.includes('Old lockdown embeds are removed before unlock notices are posted.'),
  'Lockdown should skip hidden community channels, dedupe public notices, and show polished result embeds'
);

const previewPayload = createPreviewPayload(process.cwd());
assert.equal(previewPayload.package.version, packageSnapshot.version, 'Local preview should reflect the current package version');
assert(
  previewPayload.latestChangelog.title.includes(packageSnapshot.version) &&
    previewPayload.latestChangelog.body.includes('production revamp foundation') &&
    previewPayload.latestChangelog.body.includes('module ownership') &&
    previewPayload.latestChangelog.body.includes('command validation') &&
    previewPayload.latestChangelog.body.includes('architecture documentation'),
  'Local preview should show the full newest revamp changelog entry'
);
assert.equal(previewPayload.commands.total, commands.length, 'Local preview should list every deployable slash command');
assert.deepEqual(previewPayload.commands.duplicates, [], 'Local preview should flag duplicate slash commands');
assert.equal(previewPayload.commands.docs.length, commands.length, 'Local preview should generate public command documentation');
assert(previewPayload.status && typeof previewPayload.status.online === 'boolean', 'Local preview should expose public bot status metrics');
assert(previewPayload.metrics && typeof previewPayload.metrics.errorRate === 'string', 'Local preview should expose public observability metrics');
assert(previewPayload.oauth.loginUrl === '/login', 'Local preview should expose the Discord OAuth login route');
assert(previewPayload.security.authRequiredForGuildConfig, 'Local preview should mark guild configuration APIs as authenticated');
assert.equal(previewPayload.localOnly, true, 'Local preview should be marked as local-only');
const previewHtml = renderPreviewHtml(previewPayload);
assert(
    previewHtml.includes('Control Platform') &&
    previewHtml.includes('Production bot platform') &&
    previewHtml.includes('Invite Bot') &&
    previewHtml.includes('Login with Discord') &&
    previewHtml.includes('System Status') &&
    previewHtml.includes('Command terminal catalog') &&
    previewHtml.includes('Secure dashboard') &&
    previewHtml.includes('Server-Sent Events') &&
    previewHtml.includes('Save Admin Access') &&
    previewHtml.includes('Error DM user IDs') &&
    !previewHtml.includes('Create Testing Commands') &&
    !previewHtml.includes('custom-command-dashboard') &&
    !previewHtml.includes('/api/custom-command') &&
    !previewHtml.includes('Error email alerts') &&
    !previewHtml.includes('Email error alerts') &&
    !previewHtml.includes('Not configured') &&
    previewHtml.includes('Save Presence') &&
    previewHtml.includes(previewPayload.config.presence) &&
    previewHtml.includes('/events') &&
    previewHtml.includes('/safe-mode') &&
    !previewHtml.includes(process.env.DISCORD_TOKEN ?? 'DISCORD_TOKEN_NOT_SET'),
  'Local preview should render the public SaaS dashboard without exposing Discord secrets'
);

const previewEmailDir = fs.mkdtempSync(path.join(os.tmpdir(), 'discordbot-email-'));
try {
  fs.mkdirSync(path.join(previewEmailDir, 'data'), { recursive: true });
  fs.writeFileSync(path.join(previewEmailDir, 'data', 'config.json'), JSON.stringify({ version: 2, guilds: {} }, null, 2), 'utf8');
  fs.writeFileSync(
    path.join(previewEmailDir, '.env'),
    [
      'ERROR_EMAIL_TO=owner@example.com',
      'SMTP_HOST=smtp.example.com',
      'SMTP_FROM=bot@example.com',
      'SMTP_USER=bot@example.com',
      'SMTP_PASS=secret-app-password'
    ].join('\n'),
    'utf8'
  );
  const emailPreviewPayload = createPreviewPayload(previewEmailDir);
  assert.equal(emailPreviewPayload.config.errorEmailConfigured, true, 'Local preview should detect configured backup email alerts');
  assert.equal(emailPreviewPayload.config.errorEmailRecipientCount, 1, 'Local preview should count backup email recipients');
  assert.equal(emailPreviewPayload.env.SMTP_PASS, undefined, 'Local preview should not expose SMTP passwords');
  assert(!JSON.stringify(emailPreviewPayload.env).includes('owner@example.com'), 'Local preview should redact personal email addresses');
} finally {
  fs.rmSync(previewEmailDir, { recursive: true, force: true });
}

const previewEditDir = fs.mkdtempSync(path.join(os.tmpdir(), 'discordbot-preview-'));
try {
  fs.writeFileSync(path.join(previewEditDir, '.env'), 'BOT_ACTIVITY=Old Presence\nDEV_USER_IDS=1205738144323080214\n', 'utf8');
  const savedPresence = savePreviewPresence(previewEditDir, 'New Local Presence');
  const editedEnv = fs.readFileSync(path.join(previewEditDir, '.env'), 'utf8');
  assert.equal(savedPresence, 'New Local Presence', 'Local preview should return the saved presence text');
  assert(editedEnv.includes('BOT_ACTIVITY=New Local Presence'), 'Local preview should update BOT_ACTIVITY in .env');
  assert(editedEnv.includes('DEV_USER_IDS=1205738144323080214'), 'Local preview should preserve other .env keys');
  assert.throws(() => savePreviewPresence(previewEditDir, ''), /Presence cannot be empty/, 'Local preview should reject blank presence text');
} finally {
  fs.rmSync(previewEditDir, { recursive: true, force: true });
}

const previewAccessDir = fs.mkdtempSync(path.join(os.tmpdir(), 'discordbot-access-'));
try {
  fs.mkdirSync(path.join(previewAccessDir, 'data'), { recursive: true });
  fs.writeFileSync(path.join(previewAccessDir, 'data', 'config.json'), JSON.stringify({ version: 2, guilds: {} }, null, 2), 'utf8');
  const savedAccess = savePreviewAccessUsers(previewAccessDir, {
    adminUsers: '111111111111111111\n222222222222222222',
    devUsers: '<@333333333333333333>',
    errorDmUsers: '444444444444444444'
  });
  const editedConfig = JSON.parse(fs.readFileSync(path.join(previewAccessDir, 'data', 'config.json'), 'utf8'));
  assert.deepEqual(savedAccess.adminUserIds, ['111111111111111111', '222222222222222222', '333333333333333333'], 'Local preview should save admin users and migrate legacy developer users into admin users');
  assert.deepEqual(savedAccess.devUserIds, savedAccess.adminUserIds, 'Local preview should keep developer users unified with admin users');
  assert.deepEqual(savedAccess.errorDmUserIds, ['444444444444444444'], 'Local preview should save error DM users');
  assert.deepEqual(editedConfig.guilds, {}, 'Local preview access editing should preserve existing config data');
  assert.deepEqual(editedConfig.adminUserIds, savedAccess.adminUserIds, 'Local preview should persist unified admin users');
  assert.deepEqual(editedConfig.devUserIds, savedAccess.adminUserIds, 'Local preview should persist developer users as the same admin users');
  assert.deepEqual(editedConfig.errorDmUserIds, ['444444444444444444'], 'Local preview should persist error DM users');
} finally {
  fs.rmSync(previewAccessDir, { recursive: true, force: true });
}

const previewCustomCommandDir = fs.mkdtempSync(path.join(os.tmpdir(), 'discordbot-custom-command-'));
try {
  fs.mkdirSync(path.join(previewCustomCommandDir, 'data'), { recursive: true });
  fs.writeFileSync(path.join(previewCustomCommandDir, '.env.development'), 'DISCORD_GUILD_ID=1478573374392504504\n', 'utf8');
  fs.writeFileSync(path.join(previewCustomCommandDir, 'data', 'config.development.json'), JSON.stringify({
    version: 2,
    guilds: {
      '1478573374392504504': {
        customCommands: {
          'welcome-test': {
            name: 'welcome-test',
            response: 'Hi @ everyone {user}, welcome to {server}!',
            uses: 0
          }
        }
      },
      '999999999999999999': {
        customCommands: {
          hidden: {
            name: 'hidden',
            response: 'This should stay hidden from the locked testing config.',
            uses: 0
          }
        }
      }
    }
  }, null, 2), 'utf8');

  const customPayload = createPreviewPayload(previewCustomCommandDir);
  assert.equal(customPayload.testingBot.selectedGuildId, '1478573374392504504', 'Local preview should select the dev test guild');
  assert.equal(customPayload.testingBot.lockedToConfiguredGuild, true, 'Local preview should lock testing commands to .env.development DISCORD_GUILD_ID');
  assert.equal(customPayload.testingBot.customCommandTotal, undefined, 'Local preview should not expose removed custom command totals');
  assert.equal(customPayload.testingBot.customCommandGuilds, undefined, 'Local preview should not expose removed custom command guild rows');
  const customHtml = renderPreviewHtml(customPayload);
  assert(!customHtml.includes('!welcome-test'), 'Local preview should not render removed custom command dashboard rows');
  assert(!customHtml.includes('custom-command-dashboard'), 'Local preview should not render the removed custom command dashboard');
  assert(!customHtml.includes('/api/custom-command'), 'Local preview should not expose removed custom command dashboard endpoints');
  assert(!customHtml.includes('!hidden'), 'Local preview should still hide commands from non-test guilds');
} finally {
  fs.rmSync(previewCustomCommandDir, { recursive: true, force: true });
}

const lockdownServerCommand = commands.find((command) => command.name === 'lockdownserver');
const unlockdownServerCommand = commands.find((command) => command.name === 'unlockdownserver');
assert(lockdownServerCommand.description.includes('community-visible'), '/lockdownserver should describe visible-channel behavior');
assert(unlockdownServerCommand.description.includes('removes lockdown embeds'), '/unlockdownserver should describe embed cleanup');

// The project .env should win over stale values inherited from PM2.
const originalBotActivity = process.env.BOT_ACTIVITY;
const originalBotEnv = process.env.BOT_ENV;
const originalBotEnvFile = process.env.BOT_ENV_FILE;
const envTestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'discordbot-env-'));
try {
  fs.writeFileSync(path.join(envTestDir, '.env'), 'BOT_ACTIVITY=from-dotenv\n', 'utf8');
  process.env.BOT_ACTIVITY = 'from-pm2';
  delete process.env.BOT_ENV;
  delete process.env.BOT_ENV_FILE;
  loadLocalEnv(envTestDir);
  assert.equal(process.env.BOT_ACTIVITY, 'from-dotenv', 'BOT_ACTIVITY should be read from .env');

  fs.writeFileSync(path.join(envTestDir, '.env.development'), 'BOT_ACTIVITY=from-development-dotenv\n', 'utf8');
  process.env.BOT_ACTIVITY = 'from-pm2';
  process.env.BOT_ENV = 'development';
  assert.equal(
    path.basename(resolveLocalEnvPath(envTestDir)),
    '.env.development',
    'BOT_ENV=development should select .env.development when it exists'
  );
  loadLocalEnv(envTestDir);
  assert.equal(process.env.BOT_ACTIVITY, 'from-development-dotenv', 'Development bot should read from .env.development');
} finally {
  if (originalBotActivity === undefined) {
    delete process.env.BOT_ACTIVITY;
  } else {
    process.env.BOT_ACTIVITY = originalBotActivity;
  }
  if (originalBotEnv === undefined) {
    delete process.env.BOT_ENV;
  } else {
    process.env.BOT_ENV = originalBotEnv;
  }
  if (originalBotEnvFile === undefined) {
    delete process.env.BOT_ENV_FILE;
  } else {
    process.env.BOT_ENV_FILE = originalBotEnvFile;
  }
  fs.rmSync(envTestDir, { recursive: true, force: true });
}

console.log('All tests passed.');
process.exit(0);
