# Setup Guide

This guide takes the bot from a fresh folder to a running Discord bot with commands, logs, developer access, and local preview.

## Prerequisites

- Node.js 20 or newer.
- A Discord account that can create applications.
- Permission to invite bots into your test server.
- PowerShell on Windows.

## 1. Create The Discord App

1. Open <https://discord.com/developers/applications>.
2. Create a new application.
3. Open **Bot** and create the bot user.
4. Copy the bot token. Keep it private.
5. Open **OAuth2** and copy the application client ID.
6. In **Bot > Privileged Gateway Intents**, enable:
   - Server Members Intent
   - Message Content Intent

The bot uses message commands like `!help`, moderation events, member events, and joined chat, so those intents matter.

## 2. Configure `.env`

Copy the example file:

```powershell
Copy-Item .env.example .env
```

Fill in these required values:

```dotenv
DISCORD_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_application_client_id_here
DEV_USER_IDS=your_discord_user_id_here
```

Recommended values:

```dotenv
ADMIN_USER_IDS=your_discord_user_id_here
BOT_ACTIVITY=Beta Testing New Commands !
BOT_ACTIVITY_TYPE=watching
BOT_STATUS=online
DISCORD_GUILD_ID=your_main_test_server_id
```

`BOT_ACTIVITY_TYPE` supports `playing`, `streaming`, `listening`, `watching`, and `competing`. Discord requires `BOT_ACTIVITY_URL` when the type is `streaming`.

Optional integrations:

```dotenv
TWITCH_CLIENT_ID=your_twitch_client_id_here
TWITCH_CLIENT_SECRET=your_twitch_client_secret_here
TOGETHER_API_KEY=your_together_ai_api_key_here
HUGGINGFACE_API_KEY=your_huggingface_api_key_here
```

Use Discord user IDs, not usernames. In Discord, enable Developer Mode, right-click yourself, then choose **Copy User ID**.

## 3. Install And Deploy

Install dependencies:

```powershell
npm.cmd install
```

Deploy slash commands:

```powershell
npm.cmd run deploy
```

The deploy script registers global slash commands and clears old guild-specific command copies in servers the bot can access. If one server says `Missing Access`, invite the bot there again with the right scopes or ignore it if you do not manage that server.

Start with PM2:

```powershell
npm.cmd run start:pm2
```

Check status:

```powershell
npx.cmd pm2 list
npx.cmd pm2 logs discordbot --lines 50 --nostream
```

## 4. Optional Development Bot

For testing Discord features before publishing them to the live bot, create a second Discord application named something like **Production Development**.

Copy the development example:

```powershell
Copy-Item .env.development.example .env.development
```

Fill in the development bot values:

```dotenv
DISCORD_TOKEN=your_development_bot_token_here
DISCORD_CLIENT_ID=your_development_application_client_id_here
DISCORD_GUILD_ID=your_test_server_id_here
DEV_USER_IDS=your_discord_user_id_here
ADMIN_USER_IDS=your_discord_user_id_here
BOT_ACTIVITY=Production Development testing
BOT_ACTIVITY_TYPE=watching
BOT_STATUS=dnd
```

Deploy development slash commands to only that test server:

```powershell
npm.cmd run deploy:dev
```

Start the development bot separately:

```powershell
npm.cmd run start:dev
npx.cmd pm2 logs discordbot-dev --lines 50 --nostream
```

The development bot reads `.env.development`, stores its server memory and settings in `data/config.development.json`, and runs as PM2 app `discordbot-dev`. The normal `npm.cmd run deploy` command still deploys the Production bot globally.

## 5. Invite The Bot

Use the Discord Developer Portal OAuth2 URL Generator.

Scopes:

- `bot`
- `applications.commands`

Bot permissions:

- Administrator
- View Channels
- Send Messages
- Read Message History
- Manage Messages
- Manage Channels
- Manage Roles
- Manage Nicknames
- Manage Server
- Moderate Members
- Kick Members
- Ban Members

After inviting, Discord global slash commands can take a little time to appear. Prefix commands like `!help` work immediately if message content intent is enabled.
For existing servers, the configured developer can open `/devdashboard` and use the **Bot Role** button to sync the Discord-managed bot role instead of creating a duplicate admin role. The bot tries to make that managed role red and grant Administrator. If Discord blocks role sync, use `/invite` to reinvite with Administrator and move the bot role high in the role list.

## 6. First Server Setup

Run these in the server:

```text
/commands
/dashboard
/config
/setup
```

Recommended setup flow:

1. Run `/dashboard` (`/config` and `/setup` open the same control center).
2. Start with Community, Welcome, Counters, Roles, and Verification before touching advanced pages.
3. Use Welcome to choose the welcome channel, enable the welcomer, and send a preview.
4. Use Verification to choose the role, choose the channel, and send the Verify panel.
5. Use Counters to pick a category and install a quick template.
6. Optional: configure Twitch, YouTube, TikTok, socials, or utility automations.
7. Advanced: use the Logging page to pick a log channel and send a test log.
8. Advanced: use Advanced Settings to add admin access roles, or `/devdashboard` to review runtime status and admin users.
9. Advanced: use AutoMod to choose moderation intensity and escalation.
10. Advanced: use Advanced Settings or `!protection watch` to enable raid and anti-nuke tripwires.
11. Optional: open `/dashboard` > Moderation > Case System if staff need private case channels.
12. Use `/notify` if you want DMs for big bot updates.

AI AutoMod setup:

- Open `/dashboard`, go to **AutoMod**, then use the intensity button to cycle Off, Low, Medium, and High.
- Use the escalation button to choose Delete Only, Timeout Ladder, or Strict. Strict is the only mode that can ban repeat severe offenders.
- Low only removes severe content. Medium removes likely harmful content. High is stricter for aggressive or spammy messages.
- Hate slurs, strong profanity, hostile insults, spacing/leetspeak variants, and obscene gestures are blocked locally whenever AutoMod is enabled.
- Timeout Ladder uses severe AutoMod strikes inside 30 minutes: 3 removals gives a 5-minute timeout and 5 removals gives a 30-minute timeout.
- Strict uses the same 30-minute strike window: 3 removals gives a 10-minute timeout, 5 removals gives a 1-hour timeout, and 7 removals can ban if the bot has permission.
- Legacy image/GIF buttons may still work on old messages, but the normal setup path is `/dashboard` > AutoMod.
- If no AI provider key is configured, the local profanity guard and image/GIF media rules still work, but broader text AI review stays inactive.

Server protection setup:

- Open `/dashboard`, go to **Advanced Settings**, then use the protection button to cycle Off, Watch, and Strict.
- Watch mode logs suspicious raid, mention-spam, anti-nuke, webhook, and ban-spike tripwires.
- Strict mode deletes mention spam and auto-locks visible channels when raid or anti-nuke tripwires fire.
- Prefix controls: `!protection status`, `!protection watch`, `!protection strict`, and `!protection off`.

Verification setup:

```text
/verification setup role:@Member channel:#verify
!verification setup @Member #verify
```

The slash setup command only asks for a verification role and a verification channel. It posts a Verify button and refreshes `View Channel` permissions so unverified members only see the verify area; normal channels and categories are invisible until the verified role is assigned. Use `/dashboard` or `!verification setup` so setup stays on the dashboard-first path. The verification role must be below the bot role, and the bot needs Manage Roles and Manage Channels.

Prefix setup supports the same core behavior:

```text
!verification setup @Member #verify Welcome in.
!verification setup @Member #verify #rules #welcome --captcha --timeout 30 --autokick --min-age 3
```

Reaction role setup:

```text
/reactionrole setup channel:#roles role:@Updates emoji:âœ… title:Choose Your Roles
/reactionrole add message_id:123456789012345678 role:@Events emoji:ðŸŽ‰ label:Event pings
/reactionrole list
/reactionrole refresh message_id:123456789012345678
/reactionrole clear message_id:123456789012345678
!reactionrole setup #roles @Updates âœ… Choose Your Roles
```

Reaction role panels let members self-assign safe member roles with emoji buttons. Toggle panels add/remove roles when clicked; unique panels replace the member's previous choice with the newly clicked option. Roles must be below the bot role and cannot include admin or staff permissions.

Welcomer setup:

```text
/welcome setup channel:#welcome message:We hope you enjoy your time here at {server}, {user}.
/welcome status
/welcome test
/welcome disable
!welcome setup #welcome Welcome {user}
```

The welcomer sends a clean red embed when a member joins. The message supports `{user}`, `{server}`, `{count}`, `{tag}`, and `{username}` placeholders. Use `/welcome test` before going live so you can confirm the bot can send embeds in the selected channel.

Moderation hub:

```text
/moderation warn user:@member reason:Slow down on spam
/moderation warnings user:@member
/moderation history user:@member
/moderation note-add user:@member note:Watch for repeat spam
/moderation clear user:@member case:1
/clean user:@member amount:50
/softban user:@member reason:Clean spam raid messages
/banid user_id:123456789012345678 reason:Ban known raider
/massban user_ids:123456789012345678 234567890123456789 reason:Raid cleanup
/tempban user:@member hours:24 reason:Cool down
/tempbans
/lockdownrole set role:@Member
```

`/moderation` keeps warnings, private notes, and member history in one cleaner command. `/clean` removes recent messages from one member in the current channel. `/softban` bans and immediately unbans a member to clear recent messages without keeping them banned.
`/banid` can ban users who already left. `/massban` accepts up to 25 IDs or mentions at once. `/tempban` stores an auto-unban timer in `data/config.json`, and `/tempbans` shows active temporary bans. `/lockdownrole` changes whether lockdown targets @everyone or a specific community role.

Private case channels:

```text
/case create title:Report review member:@member reason:Private staff context
/case add user:@staff
/case remove user:@staff
/case close reason:Resolved
/case status
```

Private cases are disabled by default. Enable them from `/dashboard` > Moderation > Case System, then choose staff roles, an optional category, and an optional case-log channel. Created case channels are hidden from everyone except configured case staff, added staff users, admins, and the bot.

Advanced Twitch alert options:

```text
/twitch set channel:twitch_username announce_channel:#streams mention_role:@Live message:{streamer} is live playing {game}: {url}
/twitch add channel:second_streamer announce_channel:#streams message:{streamer} went live {started}
/twitch status streamer:twitch_username
/twitch preview
/twitch preview event:end
!twitch preview end
/twitch check announce:false
/twitch reset
```

Use `mention_role` for a clean role ping, or use `everyone:true` only if you really want `@everyone`. `/twitch set` replaces the primary Twitch setup, while `/twitch add` adds or updates one streamer without removing the rest. Preview never pings anyone, and checks will not repost the same live stream after it has already been announced.
The `channel` value can be a Twitch username or a `twitch.tv/username` URL.
Message templates support `{streamer}`, `{title}`, `{game}`, `{category}`, `{viewers}`, `{started}`, and `{url}`.
When a stream goes live, the alert embed includes the stream title, category, viewer count, started time, preview image, streamer profile thumbnail, and a Watch Stream button.
When a tracked stream ends, the bot posts one end-of-stream embed with the latest VOD link. If Twitch has not finished processing the VOD yet, the button opens the streamer's past broadcasts page. Use `/twitch preview event:end` or `!twitch preview end` to preview that stream-ended embed.

YouTube upload alert options:

```text
/youtube set channel:@youtube_handle announce_channel:#videos mention_role:@Videos message:{channel} posted {title}: {url}
/youtube status
/youtube preview
/youtube check announce:false
/youtube reset
/youtube remove
!youtube @youtube_handle #videos --message {channel} posted {title}: {url}
!youtube preview
```

The `channel` value can be a YouTube channel ID, a `youtube.com/channel/...` URL, or an `@handle`. Setup seeds the current latest video so old uploads do not repost; only the next new upload is announced. Message templates support `{channel}`, `{title}`, `{published}`, and `{url}`. Preview never pings anyone, and checks will not repost a video after it has already been announced.

TikTok post alert options:

```text
/tiktok set creator:@tiktok_handle announce_channel:#videos mention_role:@Videos message:{creator} posted {title}: {url}
/tiktok status
/tiktok preview
/tiktok check announce:false
/tiktok reset
/tiktok remove
!tiktok @tiktok_handle #videos --message {creator} posted {url}
!tiktok preview
```

The `creator` value can be a TikTok `@username` or a `tiktok.com/@username` profile URL. Setup seeds the current latest public post so old posts do not repost; only the next new post is announced. Message templates support `{creator}`, `{username}`, `{title}`, `{posted}`, and `{url}`. Preview never pings anyone, and checks will not repost a TikTok after it has already been announced. TikTok public profile checks are best-effort because TikTok can rate-limit or challenge public HTML requests; use `/tiktok check announce:false` to see the current lookup status.

## 6.5 Expanded Command Suites

The revamp adds grouped suites instead of hundreds of top-level slash commands. This keeps Discord registration below the 100-command cap while still exposing deeper command paths.

- `/profile` stores server-scoped bios, status, about-me text, friends, partner, socials, portfolio links, likes, thanks, vouches, endorsements, collectibles, profile colors, themes, and backgrounds.
- `/economy` covers XP, levels, wallet/bank balances, transfers, cooldown rewards, crates, lootboxes, inventory use/sell/gift actions, and quick games.
- `/utility`, `/games`, and `/media` add text tools, local response cards, encoding helpers, game cards with XP rewards, and media preview cards.
- `/staff` adds report queue cards with `report`, `reports`, `resolve`, and `escalate`.
- `/automation` stores staff-reviewed automation drafts from trigger, keyword, autoresponder, schedule, autopost, and related actions.
- `/counter` creates dynamic voice-channel stat counters for members, humans, bots, online/offline cache, active users, new members today, messages today, active voice users, voice channels, boosts, roles, channels, emojis, server growth, server age, verified users, staff, bans, open reports, giveaways, premium members, leveling, and economy users.
- `/dashboard` is the central community-first control center. `/security`, `/serveradmin`, `/analytics`, `/rolesystem`, and `/voice` stay available as secondary operational suites.

Prefix versions use the same suite names, such as `!profile bio hello`, `!economy`, `!utility choose red, blue`, and `!staff reports`.

### Dynamic Voice Counters

Use `/counter template template:Member Growth` for a fast starter setup, or `/counter create` for individual counters. The bot creates a `Server Counters` category when needed, reuses existing counter channels before creating new ones, denies Connect so members cannot join stat channels, and can hide counters from `@everyone` when `hidden:true` is used.

Useful commands:

```text
/counter template template:Member Growth
/counter create type:Messages Today style:Fancy
/counter category name:Server Stats hidden:false
/counter preview type:Boost Count style:Boxed
/counter list
/counter refresh
```

Counters refresh on a guarded interval and also batch updates after member, message, voice, channel, and ban events. The bot serializes refreshes per server, deduplicates counter configs by type, reattaches matching existing voice channels, skips channel renames when the value has not changed, and keeps a short cache for expensive stats like ban count.

Dashboard counter presets are grouped by Community, Activity, Statistics, Fun, Voice, Moderation, and Custom. Presets include `members`, `community`, `activity`, `statistics`, `voice`, `moderation`, `fun`, `growth`, `premium`, `custom`, and `all`. Custom labels support `{count}`, `{emoji}`, and `{type}` placeholders for live previews before creation.

Joined chat is off by default. Run `!join` or `/join` in a channel to enable it. Run `!unjoin` or `/unjoin` to disable it again. Joined-chat memory is persistent and isolated by server, channel, and user. After joined chat is enabled, the bot also learns a bounded, anonymized server style profile from public server chat so replies can match the server's tone without impersonating specific members. Resetting one server clears only that server's joined-chat memory.

## 7. Error Alerts

The bot can notify you in Discord DMs and by backup email when it catches runtime errors.

For Discord DMs, add your Discord user ID to `ERROR_DM_USER_IDS` in `.env`, or use the local preview **Admin Access** panel and save yourself under **Error DM user IDs**.

For backup email, configure SMTP in `.env`:

```dotenv
ERROR_EMAIL_TO=owner@example.com,backup@example.com
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=smtp_username_or_email
SMTP_PASS=smtp_password_or_app_password
SMTP_FROM=V2 Community Bot <bot@example.com>
```

For Gmail, use an app password instead of your normal Google password. For Outlook, iCloud, or another provider, use that provider's SMTP host, port, and app-password guidance.

Error alerts include:

- Slash command, button, or modal failures.
- Prefix command and message-event failures.
- AI provider failures and joined-chat AI errors.
- Unhandled promise rejections and uncaught exceptions.

Each alert includes the same error code shown to users, plus private context like command, server, channel, and the formatted error message. Discord DM failure does not stop email alerts, and email failure does not stop Discord DM alerts.

## 8. Local Preview

Start the local preview:

```powershell
npm.cmd run preview
```

Open:

```text
http://127.0.0.1:3030
```

The preview shows version status, changelog notes, command groups, duplicate-command checks, safe `.env` status, admin/developer users, and presence. It does not expose secrets like the Discord token.

You can edit:

- Presence text, saved to `.env` as `BOT_ACTIVITY`.
- Admin/developer users, saved to `data/config.json`.
- Server admin access roles, changed from `/dashboard` under Advanced Settings.

Restart the production bot after changing `.env` or access users:

```powershell
npx.cmd pm2 restart discordbot --update-env
```

The development bot ignores command activity outside `.env.development` `DISCORD_GUILD_ID` and reloads `data/config.development.json` automatically, so saved testing commands can be used shortly after config changes.

## 9. Release Checklist

Before saying an update is live:

```powershell
npm.cmd test
node --check src\index.js
node --check src\commands.js
```

If slash commands changed:

```powershell
npm.cmd run deploy
```

Restart the bot:

```powershell
npx.cmd pm2 restart discordbot --update-env
```

Confirm:

```powershell
npx.cmd pm2 describe discordbot
npx.cmd pm2 logs discordbot --lines 30 --nostream
```

## Troubleshooting

| Problem | What to check |
| --- | --- |
| Slash command does not show | Run `npm.cmd run deploy`, wait for Discord propagation, and make sure the invite included `applications.commands`. |
| Duplicate slash commands show | Run `npm.cmd run deploy`; it clears known guild command copies where the bot has access. |
| Prefix commands do not work | Enable Message Content Intent in the Discord Developer Portal and restart the bot. |
| Admin command says no permission | Give yourself the Discord permission, add your ID to `ADMIN_USER_IDS`, or add an admin access role from `/dashboard`. |
| Developer command is locked | Add your ID to the admin/developer users list in `.env`, the preview Admin Access panel, or `/devdashboard`, then restart if you changed `.env`. |
| Moderation command fails | Move the bot role above the target role/member and check Manage Roles, Moderate Members, Kick, or Ban permissions. |
| Bot talks when it should not | Use `!unjoin` or `/unjoin`; joined chat is only enabled per server after `!join` or `/join`. |
| AI command fails | Check provider keys, credits, model names, and any `ERR_API_FAILURE` code in `docs/ERROR_CODES.md`. |
| Twitch alerts do not send | Check `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `/twitch set`, channel send permissions, and `/twitch status`. |
| Twitch alert ping is wrong | Use `/twitch set mention_role:@role` or `/twitch add mention_role:@role` for role pings, `everyone:true` for `@everyone`, or omit both for no ping. |
| Twitch alert repeats | Use `/twitch status streamer:<name>` to confirm the last stream ID, and `/twitch reset streamer:<name>` only when you intentionally want the next live check to announce again. |
| TikTok alerts do not send | Run `/tiktok status` and `/tiktok check announce:false`; TikTok may block public profile fetches, so confirm the creator profile is public and the announce channel allows bot messages. |

## Useful Commands

```powershell
npm.cmd test
npm.cmd run deploy
npm.cmd run preview
npx.cmd pm2 list
npx.cmd pm2 restart discordbot --update-env
npx.cmd pm2 logs discordbot --lines 50 --nostream
```
