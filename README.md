# Discord Bot V2

A multi-server Discord community and moderation bot using `discord.js`.

Current version: V2.0.0

## Setup

1. Create a Discord application at <https://discord.com/developers/applications>.
2. Add a bot to the application and copy its token.
3. Copy `.env.example` to `.env`, then fill in:
   - `DISCORD_TOKEN`
   - `DISCORD_CLIENT_ID`
   - Optional `DISCORD_GUILD_ID` to clear old guild-specific slash commands from that server
   - Optional `DEV_USER_IDS` to bootstrap `/dev` tools for specific Discord user IDs. You can also manage dev users from `/devdashboard`.
   - Optional `ERROR_DM_USER_IDS` to send runtime error notifications as clean embeds to your DMs.
   - Optional `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` for Twitch live alerts
4. Install dependencies:

```powershell
npm.cmd install
```

5. Deploy slash commands globally:

```powershell
npm.cmd run deploy
```

6. Start the bot:

```powershell
npm.cmd start
```

> Note: Do not run `npm.cmd start` while the bot is already managed by PM2. The bot now uses a lock file to prevent duplicate local instances.

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

Global slash commands work in every server where the bot is invited with the `applications.commands` scope. The deploy script also clears guild-specific commands for `DISCORD_GUILD_ID` if it is set, which prevents duplicate global plus test-guild command sets.

## Invite Permissions

Use the OAuth2 URL Generator in the Discord Developer Portal with:

- Scopes: `bot`, `applications.commands`
- Bot permissions: `Send Messages`, `Read Message History`, `View Channels`, `Manage Messages`, `Kick Members`, `Ban Members`, `Moderate Members`, `Manage Channels`, `Manage Roles`, `Manage Nicknames`, `Manage Server`

## Command Groups

`/commands` only shows community commands:

- `!join` / `/join` - starts beta chat reply mode in the current channel
- `!ping` / `/ping`
- `!serverinfo` / `/serverinfo`
- `!userinfo [@user]` / `/userinfo [user]`
- `!avatar [@user]` / `/avatar [user]`
- `!coinflip`, `!roll`, `!8ball`, `!poll`, `!choose`, `!rate`, `!ship`
- `!topic`, `!quote`, `!password`, `!number`, `!uptime`, `!membercount`, `!servericon`

`/admincommands` shows staff commands:

- Setup: `/dashboard`, `/setlogchannel`, `/logtest`, `/sticky add`, `/sticky remove`, `/sticky status`, `/twitch`
- Moderation: `/purge`, `/warn`, `/warnings`, `/clearwarns`, `/kick`, `/ban`, `/unban`, `/timeout`, `/mute`, `/unmute`
- Server tools: `/slowmode`, `/nick`, `/role add`, `/role remove`, `/lockdown`, `/unlockdown`, `/lockdownserver`, `/unlockdownserver`, `/say`

`/devcommands` shows permission-gated developer tools:

- Runtime tools: `/dev runtime`, `/dev servers`, `/dev presence`, `/dev renamebot`, `/dev say`
- Control panel: `/devdashboard`, including dev user management
- Harmless prank tools: `/dev bonk`, `/dev fakeban`, `/dev vibecheck`, `/dev reverse`, `/dev vaporwave`, `/dev panic`

## Data

All server settings are stored per guild in `data/config.json`. V2 starts with a reset config:

```json
{
  "version": 2,
  "guilds": {}
}
```
"# discordbot" 
"# discord" 
"# discord" 
