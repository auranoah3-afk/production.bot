# Production Revamp Architecture

This revamp treats the old Nexus work as removed legacy infrastructure. New systems should be added through the command platform and module boundaries instead of expanding the monolithic runtime.

## Current Baseline

- `src/index.js` is still the legacy runtime and remains the largest migration target.
- `src/commands.js` is the current Discord slash command source.
- `src/core/command-audit.js` owns pure command runtime audit calculations using live slash/prefix handler registry names.
- `src/core/command-telemetry.js` owns command execution counters, recent/noisy route summaries, and health/audit line rendering.
- `src/core/command-platform.js` owns the first rebuilt foundation layer: command inventory, module ownership, deploy validation, and command route counting.
- `src/core/command-router.js` owns aliases, grouped command routes, guild-only route detection, prefix parsing, and route labels.
- `src/core/command-middleware.js` owns shared command access decisions, permission decisions, developer gates, cooldown tracking, and normalized execution records.
- `src/core/command-registry.js` owns handler registration primitives so command dispatch can move out of the legacy `if` chain in safe batches.
- `src/core/config-repository.js` owns the first repository boundary over the current JSON config: root defaults, root normalization, guild creation, guild updates, guild resets, and root ID-list updates.
- `src/core/memory-limits.js` owns shared bounded-memory pruning helpers for timestamped maps and persisted object entries.
- `src/core/security-policy.js` owns outbound message safety helpers for no-mention payloads, explicit mention allowlists, and AI/community reply content cleanup.
- `src/core/runtime-boundary.js` owns startup task guards, reusable guarded event handlers, guarded recurring intervals, overlap protection, and runtime error normalization.
- `src/core/startup-validation.js` owns shared runtime/deploy environment validation for required Discord credentials, test-guild deploy safety, SMTP setup, Twitch setup, AI provider availability, and presence status warnings.
- `src/modules/automod/automod-config.js` owns AutoMod defaults, thresholds, escalation labels, status summaries, and media-rule normalization.
- `src/modules/logging/log-config.js` owns log categories, default enabled category IDs, category formatting, labels, and title-to-category routing.
- `src/modules/verification/verification-config.js` owns hidden-onboarding verification defaults, channel visibility policy, setup summaries, visible-channel parsing, and CAPTCHA code generation.
- The active UI pass now routes local embed construction through the shared `createBotEmbed` chrome. `/dashboard` is the central community-first control center, while command, setup, and developer dashboards keep select-menu navigation instead of large button grids.
- `src/modules/moderation/moderation-store.js` owns the first moderation module slice: warning records, warning cases, staff notes, combined moderation history, tempban records, tempban expiry selection, retry tracking, and active tempban listing over the existing guild config.
- `src/modules/moderation/lockdown-service.js` owns lockdown role resolution, channel edit checks, community visibility checks, permission overwrite payloads, and server-wide eligible channel iteration.
- Current registry migration coverage includes core commands, the centralized dashboard, optional private case channels, AI join controls, guild-only joke commands, simple info/fun commands, expanded profile/economy/utility/game/media/community suites, setup, diagnostics, logging, socials, sticky messages, creator alerts, verification, reaction roles, welcomer, lockdowns, and core moderation actions.
- Static handler-name lists have been removed from the router; runtime coverage is audited from the live slash and prefix registries.
- `data/config.json` and `data/config.development.json` are still legacy JSON stores until the database phase lands.

## Dashboard-First Control Plane

`/dashboard` is the core control plane for the bot. New setup surfaces, module controls, feature toggles, role/channel selectors, status panels, reset controls, and advanced settings should plug into the dashboard before they become separate commands.

Dashboard rules:

- Community modules appear first and should feel like the default bot experience.
- Moderation and logging stay powerful, but visually secondary.
- Advanced systems stay behind Advanced Settings or a module-specific secondary page.
- `/setup`, `/config`, `!setup`, and similar shortcuts should open `/dashboard` or deep-link to a dashboard section.
- Legacy setup commands such as `/welcome setup`, `/verification setup`, `/reactionrole setup`, and `/counter template` are allowed only as quick shortcuts into the same underlying module configuration.
- New modules should add one dashboard module record, one status summary, and one focused set of controls instead of creating disconnected setup menus.

The active runtime keeps the dashboard module catalog in `src/index.js` while the codebase is still being migrated. When the UI layer is extracted, that catalog should move into a dedicated dashboard module so every feature can register dashboard metadata consistently.

## Module Ownership

Every registered command must belong to one module:

- `core` - health, command discovery, dashboard, setup, previews, permissions, updates
- `developer` - guarded developer dashboards and feature controls
- `ai` - opt-in chat participation and server memory
- `information` - server, member, role, channel, invite, avatar, and basic utility lookups
- `community` - fun commands, profiles, economy, game cards, suggestions, socials, reaction roles, welcome, sticky posts
- `utility` - text tools and media cards
- `automation` - automation drafts, dynamic voice counters, analytics, voice controls, server admin cards, and role-system dashboards
- `alerts` - Twitch, YouTube, and TikTok alert systems
- `logging` - log setup and log tests
- `moderation` - compact member-history hub, punishments, lockdowns, cleanup, verification, role, and nickname tools
- `server-custom` - guild-scoped joke/community commands that must never deploy globally

Deploys now validate this catalog before touching Discord. If a command has no module owner, duplicates another command, or collides between global and guild scope, deployment stops early.

## Target Folder Shape

```text
src/
  app/
    bootstrap.js
    client.js
    env.js
  core/
    command-platform.js
    commands/
    events/
    modules/
    middleware/
    permissions/
    errors/
    logging/
  modules/
    moderation/
    automod/
    verification/
    logs/
    community/
    socials/
    alerts/
    admin/
    developer/
  data/
    repositories/
    migrations/
  ui/
    embeds/
    components/
  jobs/
  web/
```

The project is still JavaScript today. The TypeScript migration should happen after the command platform, error boundary, and repository interfaces are stable so production behavior does not get rewritten twice.

## Database Direction

Move JSON config into a real database behind repository interfaces. The first repository boundary now exists in `src/core/config-repository.js`, but it still uses the same JSON file underneath. PostgreSQL is the preferred long-term store because moderation cases, punishments, suggestions, logs, leveling, economy, reaction roles, and analytics all benefit from relational constraints and indexes.

Initial tables:

- `guild_settings`
- `guild_modules`
- `command_flags`
- `mod_cases`
- `punishments`
- `mod_notes`
- `automod_rules`
- `verification_configs`
- `log_configs`
- `reaction_role_panels`
- `suggestions`
- `profiles`
- `economy_accounts`
- `staff_reports`
- `automation_rules`
- `counter_channels`
- `counter_daily_stats`
- `social_links`
- `alert_sources`
- `command_runs`
- `error_events`

Redis can be added after that for cooldowns, short-lived locks, alert dedupe, and cross-process rate limiting.

## Test-Bot-First Workflow

1. Build foundations in source.
2. Run `npm.cmd test`.
3. Run `npm.cmd run deploy:dev`.
4. Restart only `discordbot-dev`.
5. Validate in the configured test server.
6. Promote to production only after approval.

Production should not receive the full revamp until the test bot proves command registration, permissions, error handling, and module behavior.

## Migration Phases

1. Command platform and deploy validation.
2. Central command middleware: permission checks, cooldowns, feature gates, error boundary, analytics.
3. Event bus and job scheduler extraction.
4. Repository layer over current JSON config.
5. PostgreSQL schema and migration scripts.
6. Moderation, automod, verification, logging, alerts, and community modules.
7. Embed/component UI system.
8. Integration tests and command smoke checks.
9. Test bot deploy, version bump, and production promotion.
