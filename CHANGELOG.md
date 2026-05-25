# Changelog

All notable changes to this project are documented in this file.

## [2.0.0-revamp.0] - 2026-05-24
### Added
- Started the production revamp foundation with a shared command platform layer.
- Added expanded grouped suites for `/profile`, `/economy`, `/utility`, `/games`, `/voice`, `/media`, `/security`, `/staff`, `/serveradmin`, `/automation`, `/analytics`, `/rolesystem`, and `/dashboard`.
- Added server-scoped profile data for bios, status, friends, partner, socials, portfolio, likes, thanks, vouches, endorsements, collectibles, themes, colors, and backgrounds.
- Added an economy MVP with XP, levels, wallets, bank transfers, cooldown rewards, crate/lootbox inventory, item use/sell/gift actions, leaderboards, and quick economy games.
- Added staff report queue and automation draft storage inside the current guild config backend.
- Added `/counter` dynamic voice-channel stat counters with expanded templates, custom labels/emojis/styles, hidden counters, category setup, duplicate-channel cleanup, existing-channel reattachment, auto-repair, manual refresh, activity tracking, cached expensive stats, and guarded batched updates.
- Added a shared command router for slash aliases, prefix aliases, grouped commands, guild-only command routing, and route labels.
- Added command middleware primitives for access decisions, permission policies, developer gates, cooldown tracking, and normalized command execution records.
- Added command handler registry primitives for gradually replacing the legacy dispatcher.
- Added module ownership for every global and guild-only slash command.
- Added deploy-time command validation for duplicate names, guild/global collisions, and missing module ownership.
- Added production revamp architecture documentation with the target module, database, and test-bot-first migration plan.

### Removed
- Removed the public `/embed`, `/panel`, and `/utility embedjson` builder surfaces while keeping the shared internal embed styling layer for normal bot responses.
- Removed the old setup-wizard interaction surface and legacy verification setup alias so setup now routes through `/dashboard`, `/setup`, or `!verification setup`.

### Changed
- Simplified public verification setup to `/verification setup role:@Member channel:#verify` while keeping advanced backend settings and prefix power-user paths intact.
- Consolidated public warning/history/note slash commands into the cleaner `/moderation` hub so the bot feels more community-focused and less like a staff dashboard.

### Improved
- Moved command route resolution out of the legacy runtime so future middleware can sit behind one router.
- Wired slash and prefix revamp/disabled-command gates through the shared command middleware layer.
- Wired slash and prefix permission checks through the shared command middleware layer while preserving configured admin user/role bypasses.
- Moved the first slash/prefix handler batch into registries: core commands, AI join controls, guild-only joke commands, and simple info/fun commands.
- Moved the second handler batch into registries: setup/dashboard, admin command help, diagnostics, logging, social links, sticky messages, and creator alerts.
- Moved the third handler batch into registries: verification, reaction roles, welcomer, protection, lockdowns, utility moderation, and core moderation actions.
- Added a runtime boundary for guarded startup tasks, reaction event handlers, and normalized process-level errors.
- Moved recurring background jobs onto guarded intervals with overlap protection and shared per-server monitor error handling.
- Added the first config repository layer over the existing JSON backend for root defaults, guild config normalization, guild updates, resets, and root ID-list updates.
- Started the moderation module split with a dedicated store for warning records, warning cases, staff notes, and combined moderation history.
- Moved tempban records, expiry scans, failed unban retry tracking, and active tempban listing into the moderation store.
- Moved lockdown role resolution, channel edit checks, community visibility checks, permission overwrite payloads, and server-wide iteration into a moderation service.
- Added shared bounded-memory pruning helpers for joined-chat, direct-message, and persisted AI memory limits.
- Added shared outbound mention-safety helpers for AI/community replies with explicit mention allowlists.
- Moved command runtime audit calculations into a pure helper that checks the live slash/prefix handler registries.
- Removed old static command handler-name lists now that handler coverage is audited from the live registries.
- Added shared startup/deploy environment validation for Discord credentials, guild-only deploy safety, SMTP, Twitch, AI provider, and presence settings.
- Moved command execution telemetry into a shared core helper for developer health and command audit views.
- Moved AutoMod defaults, thresholds, labels, status summaries, and media-rule normalization into an AutoMod module.
- Moved logging categories, category labels, formatting, and normalization into a logging module.
- Rebuilt verification around hidden onboarding: optional visible info channels, new-channel auto-sync, CAPTCHA modal checks, account-age holds, timeout kicks, unverified-role cleanup, and admin-role bypass visibility.
- Started the global embed/dashboard revamp: command center, setup, and developer dashboards now use select-menu navigation, cleaner mobile-first quick actions, compact status fields, and the shared embed chrome.
- Updated the Command Center and admin docs to show the expanded suite commands while keeping the top-level registry below Discord's 100-command cap.
- Changed `/dashboard` from a legacy `/setup` alias into its own modern dashboard suite route.
- Development command deploys now validate the command catalog before touching Discord.
- Command tests now verify module ownership, route resolution, aliases, command path counting, middleware access gates, permission decisions, cooldowns, handler registries, guild-only command isolation, and deploy helper behavior.

## [1.8.0-test] - 2026-05-24
### Added
- Rebuilt `/commands` and `!help` into a full Command Center with section buttons for Overview, Community, Moderation, Admin, Creator, Safety, and Testing.
- Added live command-health context to the command center so the command menu shows registry and route coverage instead of acting like a static list.
- Added a default All view that generates command pages from the live slash-command registry, including grouped subcommands.
- Expanded the Command Center sections so they list the full current public, staff, moderation, creator, safety, and testing command surface.

### Improved
- Remapped command-menu embeds onto the shared branded embed system with stronger sections, cleaner command families, and clearer staff/member boundaries.
- Removed the deprecated development command-suite experiment from the active registry, runtime routes, command audit, and docs so the next production revamp starts from a clean foundation.
- Updated README command groups to match the grouped `/info`, `/fun`, `/social`, creator-alert, feature-gate, and moderation command registry.

## [1.4.4] - 2026-05-23
### Added
- Added `/owner info` and `!owner` so members can see the bot owner profile and contact path.
- Added owner-controlled feature gates with `/feature disable`, `/feature enable`, `/feature list`, and `/featuredisable`.
- Added the community suggestion queue with checkmark voting and developer DMs when suggestions reach the configured vote goal.
- Added developer-only `/leak` for public-safe command teasers with mention blocking.

### Improved
- Updated `/preview`, `!preview`, DM preview, and release DMs to announce the V2 feature rollup.
- AutoMod now has escalation modes: Delete Only, Timeout Ladder, and Strict timeouts/bans for repeat severe violations.
- Removed the custom command builder, lab command group, and `/studio` from both bot command registries and live routes.
- Cleaned command docs and help embeds so removed commands no longer appear as available.
- Shared bot embeds keep the polished branded style across owner info, previews, feature notices, and community tools.

### Fixed
- Twitch stream-ended alerts delete the matching live-now embed before posting the ended/VOD embed.

## [1.4.3] - 2026-05-23
### Added
- Added owner-only `/feature disable`, `/feature enable`, `/feature list`, and `/featuredisable` controls for temporarily disabling built-in commands.
- Added community suggestion queue voting: suggestions post to the main suggestion channel and DM developers after reaching the checkmark goal.
- Added `/owner info` so communities can see who owns the bot and how to reach them.

### Improved
- Shared bot embeds now use safer title, description, and field formatting with consistent bot branding and thumbnails.
- AI chat replies now clean Discord-unfriendly math formatting before sending.
- Disabled-command notices now explain that the devs temporarily disabled the command across servers without exposing internal control details.
- Removed the custom-command dashboard surface; staff should use `/customcommand add`, `/customcommand list`, `/customcommand remove`, `/customcommand run`, or the matching `!custom` shortcuts.

### Fixed
- Twitch stream-ended alerts now delete the matching live-now embed before posting the ended/VOD embed.

## [1.4.2] - 2026-05-23
### Added
- Added the Production Development social link hub with `/social add`, `/social list`, `/social post`, `/social set`, `/social remove`, `/social clear`, and matching `!social` shortcuts.

### Improved
- Social hub embeds now auto-detect common app links, show platform badges, add matching button icons, and use the first link's app logo as the embed thumbnail.
- Social hub previews now use clean link-card embeds and support `/social bulk` for importing many links from a pasted list.
- `/social list` now shows a clean icon-and-link directory without setup text, counts, or management clutter in the main view.
- TikTok social links now prefer a real `tiktok_logo` custom emoji instead of the music-note fallback.
- YouTube social links now prefer a real `youtube_logo` custom emoji instead of the generic play-button fallback.
- Social link embeds now show the server icon and server name in the header.
- `/social` is now available to public servers while `/customcommand` remains development-only.
- `/social list` now groups links by platform with a cleaner custom embed and no bot footer clutter.
- `/social list` no longer adds bottom link buttons, and the top-right image now uses the server icon.
- Added social-logo emoji support for Twitch, Instagram, X, and Linktree links.

### Fixed
- Re-synced the Production Development command registry so the testing custom-command dashboard flow is available through `/customcommand`.

## [1.4.1] - 2026-05-23
### Improved
- Joined-chat memory now persists per server/channel/user, with bounded anonymized server style memory so AI replies can match each server's tone without impersonating members.
- AI chat now uses server memory as style/context only and is instructed not to copy a member identity or pretend to be a real person.

### Fixed
- Server style memory now skips secrets, contact info, profanity, and slurs so unsafe messages are not learned as community tone.

## [1.4.0] - 2026-05-23
### Added
- Added button verification with `/verification setup`, `/verification status`, `/verification resend`, `/verification disable`, and prefix verification setup.
- Added member welcome embeds with `/welcome setup`, `/welcome status`, `/welcome test`, `/welcome disable`, and prefix `!welcome`.
- Added advanced moderation commands: `/clean`, `/case`, `/modnote`, `/modlogs`, `/softban`, `/banid`, `/massban`, `/tempban`, `/tempbans`, and `/lockdownrole`.
- Added persistent temporary bans that survive restarts and auto-unban when the timer expires.
- Added `/dev botrole` and updated `/invite` so the bot can use a red Administrator bot role where Discord permissions allow it.
- Added richer Twitch preview support with `/twitch preview event:end` and `!twitch preview end` for stream-ended/VOD alerts.
- Added YouTube upload alerts with `/youtube set`, `/youtube status`, `/youtube preview`, `/youtube check`, `/youtube reset`, `/youtube remove`, and prefix `!youtube`.

### Improved
- `/setup`, `/admincommands`, docs, and local preview now show the new verification and moderation tools.
- Lockdown commands can now target a specific community role instead of always targeting `@everyone`.
- The local preview shows the current deployable command count and flags duplicate command registrations before going live.

### Fixed
- Startup background tasks are now guarded so monitor failures report cleanly instead of creating unhandled startup errors.
- AutoMod now catches hate slurs, strong profanity, hostile insults, spacing/leetspeak variants, and obscene gestures locally before falling back to AI review.
- AutoMod now gives a 5-minute timeout after 3 bad-word removals inside 10 minutes.
- Twitch live alerts now lock and save stream state immediately after posting so one live stream cannot announce twice.
- Twitch now cleans duplicate live-alert embeds from the same channel while keeping alerts scoped per server for multi-server setups.
- Joined-chat memory is now persistent per server/channel/user, with bounded anonymized server style memory so AI replies can match each server's tone without impersonating members.
- Re-ran global command deploy and verified Discord command counts with no missing or extra global commands.

## [1.3.0] - 2026-05-22
### Fixed
- Update DMs now use the newest changelog entry instead of repeating old feature notes.
- Bug fixes and small changes can be announced without changing the public bot version.
- Local preview can edit admin users and developer users from one access panel.
- Configured admin users can run bot admin commands, while developer users also count as admins.
- The community command list is registered as `/commands` so it is easier to find in Discord search.
- Added `!unjoin` / `/unjoin` and stopped joined chat from sending random unprompted replies.
- Added a full setup guide and clearer `.env.example` notes for first-time configuration.
- Added optional SMTP backup emails for command, AI, and runtime error alerts.
- Advanced Twitch alerts with role/everyone ping controls, custom message templates, preview, reset, and duplicate-safe live checks.
- Twitch setup now accepts either a username or a `twitch.tv` URL and shows the correct `/twitch set channel:` option name in setup help.
- Twitch alerts now support multiple streamers per server with `/twitch add`, streamer-specific status/check/preview/reset/remove controls, richer live embeds, and extra template tokens like `{viewers}` and `{started}`.
- Twitch live-start embeds now include clearer live status, category, viewer count, started time, channel link, profile thumbnail, preview image, and a Watch Stream button.
- Twitch previews now use the Twitch streamer's profile image instead of falling back to the bot avatar.
- Twitch now posts a one-time stream-ended embed with a latest VOD button, falling back to the streamer's past broadcasts page while Twitch processes the archive.
- Added `/twitch preview event:end` and `!twitch preview end` so stream-ended/VOD alerts can be checked before going live.
- Added setup-dashboard AI AutoMod with Off/Low/Medium/High intensity and channel/category image or GIF media rules.
- Added `/verification setup` with a Verify button that gives the configured verification role.
- Added Dyno-style moderation helpers: `/clean`, `/case`, `/modnote`, `/modlogs`, and `/softban`.
- Added `/dev botrole` and updated `/invite` so the bot role can be red and use Administrator permissions where Discord allows it.
- Added advanced moderation commands: `/banid`, `/massban`, `/tempban`, `/tempbans`, and `/lockdownrole`.

## [1.2.8] - 2026-05-22
### Fixed
- Developer access now requires the configured owner ID and no longer falls back to all server admins.
- Big feature update DMs now keep embed fields inside Discord's length limits.

## [1.2.7] - 2026-05-22
### Updated
- Developer access is limited to the owner Discord ID in `.env` and `data/config.json`.
- `/admincommands` and `/devcommands` now show admin and developer tools together for the configured developer.

## [1.2.6] - 2026-05-22
### Added
- Added `docs/ERROR_CODES.md` with error-code meanings, provider status notes, and reporting guidance.
- Bot AI prompts now include the error-code reference so users can ask what a code means.

## [1.2.5] - 2026-05-22
### Fixed
- Consolidated `/dev say` into `/say` so Discord only shows one bot-message command.

## [1.2.4] - 2026-05-22
### Fixed
- `/invite` now builds the invite link from the configured Discord application ID.

## [1.2.3] - 2026-05-22
### Fixed
- Deploy now clears stale guild-specific slash commands from known accessible guilds to prevent duplicate command entries.

## [1.2.2] - 2026-05-22
### Fixed
- Preview and update notes now list only Discord bot commands, not terminal deployment scripts.

## [1.2.1] - 2026-05-22
### Fixed
- Deploy now syncs slash commands directly into known accessible guilds in addition to global registration.

## [1.2.0] - 2026-05-22
### Added
- Added `/permissions`, `/modstats`, `/serverbanner`, `/invite`, `/joke`, `/fact`, and `/achievement`.
- Added `/dev health`, `/dev commandaudit`, and `/dev announceupdate`.

### Updated
- Consolidated duplicate slash commands by removing `/commands`, `/mute`, and `/dashboard`.
- Improved shared embed branding, AI provider fallback, AI prompt quality, and mention safety.
- Updated `/preview`, `/notify`, and bot presence for the command polish release.

## [1.1.0] - 2026-05-22
### Added
- Added `/botinfo`, `/roleinfo`, `/channelinfo`, `/rps`, `/compliment`, `/truth`, `/dare`, and `/wouldyourather` with matching prefix command support.

### Updated
- Updated `/commands`, `/preview`, and `/notify` release notes for the community command upgrade.

## [1.0.13] - 2026-05-22
### Added
- Runtime error replies and developer alerts now include matching stable error codes.

## [1.0.12] - 2026-05-22
### Fixed
- Server lockdown now only affects community-visible text channels.
- Unlock commands now remove the bot's previous lockdown embed before posting the unlock notice.

## [1.0.11] - 2026-05-22
### Added
- `/notify` and `!notify` subscribe users to DM alerts for major bot feature releases.

### Updated
- `/preview` now includes the current bot version, big-feature highlights, and commands currently in preview.
- Big feature update DMs now reuse the same release notes shown in preview.

## [1.0.10] - 2026-05-22
### Updated
- `/setup` and `!setup` now show a guided setup walkthrough with Back, Overview, and Next buttons on each page.
- `!help` now points staff to the guided setup walkthrough.

## [1.0.9] - 2026-05-22
### Updated
- `/preview`, `!preview`, and DM `preview` now show public users a read-only preview while keeping preview-only interactions locked.

## [1.0.8] - 2026-05-22
### Updated
- Developer DM error alerts now use cleaner structured embeds with readable provider error details.

## [1.0.7] - 2026-05-22
### Fixed
- `/suggestion` now acknowledges the interaction before forwarding developer DMs, preventing Discord timeout failures.
- Added command audit coverage so every deployable slash command has a handler.

## [1.0.6] - 2026-05-22
### Fixed
- Deployed missing new slash commands, including `/preview`, `/setup`, and `/suggestion`.
- Deploy cleanup now continues when an old guild ID cannot be accessed.

## [1.0.5] - 2026-05-22
### Fixed
- Bot startup now loads the project `.env` file explicitly so `BOT_ACTIVITY` overrides stale PM2 environment values.

## [1.0.4] - 2026-05-22
### Fixed
- Added coverage to prevent slash command descriptions from exceeding Discord's 100-character limit.
- Restarted PM2 from the moved Downloads project path.

## [1.0.3] - 2026-05-20
### Added
- Uptime status message posted in channel `1506820166619631636` in the main server.
- Uptime message refreshes automatically every 30 seconds.

## [1.0.2] - 2026-05-20
### Added
- `/setup` command and polished setup dashboard experience.
- Direct DM onboarding for server owners when the bot joins a server.
- DM helper support for `!help`, `help`, and setup-related questions.
- `/suggestion <text>` command to send suggestions directly to developer DMs.

### Updated
- Bot version bumped to `1.0.2`.
- PM2 configuration now uses `watch & reload` for `src`, `package.json`, and `ecosystem.config.cjs`.
- Help menus now include `/setup` and `/suggestion`.

### Fixed
- Restarted PM2 so the latest bot code is actively running.
