# Discord Bot V2

A multi-server Discord community and moderation bot using `discord.js`.

Current version: V2

## Setup

For the full walkthrough, see [docs/SETUP.md](docs/SETUP.md). For the production revamp architecture, see [docs/PRODUCTION_REVAMP.md](docs/PRODUCTION_REVAMP.md).

Quick start:

1. Create a Discord application at <https://discord.com/developers/applications>.
2. Add a bot to the application and copy its token.
3. Enable **Server Members Intent** and **Message Content Intent** in the bot settings.
4. Copy `.env.example` to `.env`, then fill in:
   - `DISCORD_TOKEN`
   - `DISCORD_CLIENT_ID`
   - `DEV_USER_IDS` / `ADMIN_USER_IDS` for bot admin access by Discord user ID. Admin users also count as developer users.
   - Optional `DISCORD_GUILD_ID` to include one server in duplicate slash-command cleanup.
   - Optional `ERROR_DM_USER_IDS` for runtime error notifications.
   - Optional `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` for Twitch live alerts.
5. Install dependencies:

```powershell
npm.cmd install
```

6. Deploy slash commands globally:

```powershell
npm.cmd run deploy:commands
```

7. Start the bot:

```powershell
npm.cmd start
```

> Note: Do not run `npm.cmd start` while the bot is already managed by PM2. The bot now uses a lock file to prevent duplicate local instances.

After inviting the bot to a server, run `/dashboard` first. It opens the community-first control center for welcome, verification, roles, counters, logs, AutoMod, and advanced settings. `/config` and `/setup` are shortcuts back into that same dashboard-first control plane.

## Development Bot

Use a separate Discord application for testing changes without touching the live Production bot.

1. Copy `.env.development.example` to `.env.development`.
2. Paste the development bot token, development client ID, your test server ID, and your Discord user ID.
3. Deploy commands to only the test server:

```powershell
npm.cmd run deploy:dev
```

4. Start the development PM2 app:

```powershell
npm.cmd run start:dev
```

The development bot reads `.env.development`, stores settings in `data/config.development.json`, and uses the PM2 app name `discordbot-dev`. `npm.cmd run deploy:dev` is guild-only, so it does not publish global commands or update the Production bot command registry.

`/dashboard` opens the main community-first control center. `/commands` and `!help` open the command directory with Home, Popular, Community, Activity, Quick Setup, Utility, Creators, Staff, Advanced, and All Commands views. The All view is generated from the live slash-command registry so it stays aligned with the commands Discord can actually show. `/leak` is registered on both bots, but only configured developers can use it and it disables mentions in the public post.

## Local Preview

Use the local preview before deploying commands or restarting the live bot:

```powershell
npm.cmd run preview
```

Then open `http://127.0.0.1:3030`. The preview page reads local files on refresh and shows release notes, command groups, duplicate-command checks, safe `.env` status, and config counts without logging into Discord or exposing secrets. You can also edit `BOT_ACTIVITY` and admin/developer user IDs there; presence saves to `.env`, and access users save to `data/config.json`.

The **Admin Access** panel also manages Error DM users. Those Discord user IDs receive private DMs when the bot catches command, AI, or runtime errors. Server-specific admin roles are changed from `/dashboard` under Advanced Settings.

For backup email alerts, set `ERROR_EMAIL_TO`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` in `.env`. Email alerts use the same error codes as Discord DMs.

## Public Static Website

The repository root contains a Cloudflare Pages-ready static site: `index.html`, `style.css`, `script.js`, `.nojekyll`, `_headers`, `_redirects`, and `404.html`.

Cloudflare Pages settings:

- Build command: `exit 0`
- Output directory: `/`

Full deployment notes are in `docs/cloudflare-pages-static-site.md`.

### Keep the bot running after closing VS Code
VS Code closing will end the terminal process, so run the bot with a process manager instead.

1. Install PM2 globally:

```powershell
npm.cmd install -g pm2
```

2. Start the bot with PM2:

```powershell
npm.cmd run start:pm2
```

3. Save the PM2 process list:

```powershell
pm2 save
```

4. (Optional) Keep the bot starting automatically on Windows login:

```powershell
.\pm2-windows-startup.ps1
```

On Windows, `pm2 startup` may fail because it is not supported for this init system. That is okay; closing VS Code will still leave the bot running because PM2 runs as a separate daemon process. If you restart your PC, run `pm2 resurrect` or use the script above to register automatic resurrection.

Global slash commands work in every server where the bot is invited with the `applications.commands` scope. The deploy script keeps commands global-only and clears old guild-specific command copies so Discord does not show duplicate slash commands.

## Error Codes

Runtime error replies and developer DMs include matching error codes like `ERR_PERMISSION_DENIED-1234` or `ERR_API_FAILURE-429-1234`. See [docs/ERROR_CODES.md](docs/ERROR_CODES.md) for the full reference.

You can also ask the bot AI what a code means, such as `what does ERR_API_FAILURE-429-1234 mean?`. The AI can explain the category and provider status, but private stack traces stay in developer logs and DMs.

## Invite Permissions

Use the OAuth2 URL Generator in the Discord Developer Portal with:

- Scopes: `bot`, `applications.commands`
- Bot permissions: `Send Messages`, `Read Message History`, `View Channels`, `Manage Messages`, `Kick Members`, `Ban Members`, `Moderate Members`, `Manage Channels`, `Manage Roles`, `Manage Nicknames`, `Manage Server`

## Command Groups

`/dashboard` is the main server control center and foundation for setup/configuration. It starts on community systems first, with pages for Home, Community, Moderation, Utility, Roles, Logging, Verification, AutoMod, Appearance, and Advanced Settings; Welcome and Counters are managed from the Community page. `/config`, `/setup`, and `!setup` open the same dashboard hub instead of separate setup wizards. `/commands` and `!help` open the community-first Command Center with an All view generated from the live slash-command registry, plus these views:

- All: every registered top-level command and subcommand path the current bot build can expose
- Home: community launchpad for profiles, rewards, welcomes, roles, counters, suggestions, and creator alerts
- Popular: `/profile view`, `/economy wallet balance`, `/fun poll`, `/suggestion`, `/welcome setup`, `/reactionrole setup`, `/counter template`
- Community: `/join`, `/unjoin`, `/profile view`, `/profile bio`, `/profile vouch`, `/economy xp view`, `/economy wallet balance`, `/economy earn work`, `/games duel`
- Fun: `/fun coinflip`, `/fun roll`, `/fun magic8ball`, `/fun poll`, `/fun choose`, `/fun rate`, `/fun ship`, `/fun rps`, `/fun compliment`, `/fun truth`, `/fun dare`, `/fun wouldyourather`, `/fun joke`, `/fun fact`, `/fun achievement`, `/fun topic`, `/fun quote`, `/fun number`
- Social: `/social add`, `/social bulk`, `/social list`, `/social post`, `/social set`, `/social clear`
- Activity: `/welcome`, `/reactionrole`, `/counter`, `/sticky`, `/voice`, and `/analytics` systems
- Utility: grouped `/info` lookups, `/utility`, and `/media`
- Creator alerts: `/twitch set`, `/twitch add`, `/twitch status`, `/twitch preview`, `/twitch check`, `/twitch reset`, `/twitch remove`, plus matching `/youtube` and `/tiktok` setup/status/preview/check/reset/remove commands
- Staff and Advanced: `/moderation`, optional `/case` private staff channels, `/permissions`, `/logtest`, `/modstats`, `/security`, `/staff`, `/feature`, and `/devdashboard` stay available without dominating `/dashboard`.

Joined-chat memory is persistent and isolated by server, channel, and user. The bot also learns a bounded, anonymized server style profile after joined chat is enabled, so one server cannot affect another server's AI chat context.

`/admincommands` shows staff commands. Members with Discord Administrator, configured admin user IDs, or configured admin access roles can control admin bot features. Admin user IDs also count as developer user IDs.

- Setup: `/dashboard` is the central setup path. Use Community for Welcome, Counters, reaction roles, and socials; Verification for the role/channel/panel flow; Logging for log channels; AutoMod for safety settings; and Advanced Settings for admin access and protection. `/config` and `/setup` remain dashboard aliases.
- Private cases: `/case create`, `/case add`, `/case remove`, `/case close`, and `/case status` create optional private staff channels after the module is enabled from `/dashboard` > Moderation > Case System. It is disabled by default and hidden from the main community flow.
- Welcomer: `/welcome setup channel:#welcome message:Welcome {user}` enables a red branded join embed. Use `/welcome test`, `/welcome status`, and `/welcome disable` to manage it. Message placeholders: `{user}`, `{server}`, `{count}`, `{tag}`, `{username}`.
- Verification: `/verification setup role:@Member channel:#verify` posts the Verify button and refreshes `View Channel` permissions so unverified members only see the verify area. Normal channels stay invisible until the verified role unlocks them; stricter hidden options still exist internally for existing servers and prefix power users.
- Reaction roles: `/reactionrole setup channel:#roles role:@Updates emoji:✅` creates a self-assign button panel. Use `/reactionrole add` for more role buttons, `/reactionrole list` to inspect panels, `/reactionrole refresh` to repair the embed/buttons, and `/reactionrole clear` to disable a panel. Roles must be below the bot role and cannot include admin or staff permissions.
- AI AutoMod: `/dashboard` includes an AutoMod page for Low/Medium/High message review and escalation mode. Delete Only removes matching messages, Timeout Ladder escalates repeat severe removals into 5-minute then 30-minute timeouts, and Strict can reach a ban after 7 severe removals in 30 minutes if the bot has permission. Broader AI text review uses the configured AI provider.
- Server protection: `/dashboard` includes protection controls under Advanced Settings, and staff can use `!protection watch`, `!protection strict`, or `!protection off`. Watch logs raid, mention-spam, anti-nuke, webhook, and ban-spike tripwires. Strict deletes mention spam and auto-locks visible channels during raid or anti-nuke spikes.
- Twitch: `/twitch set` configures the primary streamer, while `/twitch add` watches multiple streamers. Alerts accept usernames or `twitch.tv` URLs, role pings, optional `@everyone`, and custom text with `{streamer}`, `{title}`, `{game}`, `{category}`, `{viewers}`, `{started}`, and `{url}`. Use `/twitch status streamer:<name>`, `/twitch preview`, `/twitch preview event:end`, `/twitch check announce:false`, `/twitch reset`, and `/twitch remove` to test safely.
- Twitch go-live alerts include a richer live-start embed with category, viewer count, started time, stream preview image, profile thumbnail, and a Watch Stream button.
- Twitch stream-end alerts post once after a tracked live stream ends and link the newest VOD, falling back to the streamer's past broadcasts page while Twitch is still processing the archive.
- YouTube upload alerts: `/youtube set` watches a YouTube channel ID, `youtube.com/channel/...` URL, or `@handle` and posts one alert per new upload. Alerts support role pings, optional `@everyone`, and custom text with `{channel}`, `{title}`, `{published}`, and `{url}`. Use `/youtube status`, `/youtube preview`, `/youtube check announce:false`, `/youtube reset`, and `/youtube remove` to test safely.
- TikTok post alerts: `/tiktok set` watches a TikTok `@username` or profile URL and posts one alert per new public post. Alerts support role pings, optional `@everyone`, and custom text with `{creator}`, `{username}`, `{title}`, `{posted}`, and `{url}`. Setup seeds the current latest post so old posts do not spam; use `/tiktok status`, `/tiktok preview`, `/tiktok check announce:false`, `/tiktok reset`, and `/tiktok remove` to test safely.
- Profile/economy suites: `/profile` stores server-scoped bios, status, friends, partner, socials, portfolio, likes, thanks, vouches, endorsements, collectibles, themes, backgrounds, and colors. `/economy` adds XP, levels, wallets, bank transfers, cooldown rewards, crate/lootbox inventory, item gifts, and quick economy games.
- Utility/community suites: `/utility`, `/games`, and `/media` add text tools, local AI-style response cards, encoding helpers, game cards with XP rewards, and media preview cards without increasing the top-level command count too aggressively.
- Staff/automation suites: `/staff report`, `/staff reports`, `/staff resolve`, `/staff escalate`, and `/automation` draft rules store server-scoped queue data in the current config backend and log staff usage when logging is enabled.
- Dynamic counters: `/counter create`, `/counter template`, `/counter category`, `/counter preview`, `/counter list`, and `/counter refresh` manage voice-channel stat counters with custom emojis, styles, hidden counters, template presets, duplicate-channel cleanup, category repair, activity tracking, and batched refreshes.
- Moderation: `/moderation` now groups warnings, private notes, warning details, and member history. Direct action commands remain for `/purge`, `/clean`, `/kick`, `/ban`, `/banid`, `/massban`, `/softban`, `/tempban`, `/tempbans`, `/unban`, `/timeout`, and `/unmute`.
- Server tools: `/slowmode`, `/nick`, `/role add`, `/role remove`, `/security panic`, `/security panicoff`, `/security raidmode`, `/lockdownrole`, `/lockdown`, `/unlockdown`, `/lockdownserver`, `/unlockdownserver`, `/say`

`/devdashboard` is the only Discord developer command. It opens the private dashboard for configured admin/developer user IDs:

- Dashboard tools: runtime stats, server list, health, command audit, presence, bot nickname, controlled bot messages, test logs, admin access, sticky status, creator alert setup, and server reset.
- Bot role: the **Bot Role** dashboard button syncs the Discord-managed bot role instead of creating a duplicate admin role. It tries to make that managed role red and grant Administrator; if Discord blocks role sync, use `/invite` to reinvite with Administrator and move the bot role high in the role list.

## Data

All server settings are stored per guild in `data/config.json`. Joined-chat memory and server style memory are also scoped per guild/channel/user. The bot starts with a reset config:

```json
{
  "version": 2,
  "guilds": {}
}
```
"# discordbot" 
"# discord" 
"# discord" 
