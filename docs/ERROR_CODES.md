# Error Codes

The bot adds an error code to user-facing error embeds and developer error DMs so a public report can be matched with the private developer details.

Error codes are stable fingerprints, not random case numbers. If the same kind of failure happens in the same path, the code will usually stay the same. Small changes in the command, provider response, or error message can create a different suffix.

## Format

```text
ERR_PERMISSION_DENIED-1234
ERR_API_FAILURE-429-1234
```

- `ERR` means the bot caught or reported an error.
- The middle name shows the exact error area.
- `429` is included only when an external API/provider error includes an HTTP status.
- `1234` is a deterministic fingerprint used to match related reports.

## Prefixes

| Code prefix | Meaning | Common cause | What to check |
| --- | --- | --- | --- |
| `ERR_PERMISSION_DENIED-####` | Permission denied | Bot or user lacks a Discord permission | Bot role position, channel overwrites, required staff permission |
| `ERR_MODULE_DISABLED-####` | Module or command disabled | A feature was turned off by the developer or dashboard | `/feature list`, dashboard module status |
| `ERR_INVALID_CHANNEL-####` | Invalid or inaccessible channel | Missing channel, missing access, wrong channel type | Channel selector, channel permissions, deleted channels |
| `ERR_INVALID_ROLE-####` | Invalid or unsafe role | Missing role, managed role, role hierarchy issue | Bot role position, selected role, role permissions |
| `ERR_DATABASE_FAILURE-####` | Config/database failure | Config read/write, JSON, repository, or disk problem | PM2 logs, `data/config*.json`, disk permissions |
| `ERR_INTERACTION_TIMEOUT-####` | Interaction expired | Discord expired a slash command, button, or dropdown before the bot could respond | Retry the command, check slow API calls |
| `ERR_INTERACTION_STATE-####` | Interaction state conflict | Discord says the interaction was already acknowledged | Double replies, old buttons, stale panels |
| `ERR_SETUP_INCOMPLETE-####` | Setup incomplete | A module is missing required role/channel/config | Open `/dashboard` and complete the module setup |
| `ERR_DASHBOARD_ERROR-####` | Dashboard error | Dashboard page, button, dropdown, or selector failed | Stale panel, invalid custom ID, missing role/channel |
| `ERR_VERIFICATION_ERROR-####` | Verification error | Verify role/channel/panel/CAPTCHA failed | Verification role, channel visibility, bot permissions |
| `ERR_MODERATION_ERROR-####` | Moderation error | Warning, timeout, ban, lockdown, purge, or case action failed | Role hierarchy, moderation permissions, target member |
| `ERR_AUTOMOD_FAILURE-####` | AutoMod failure | AutoMod detection, timeout, or escalation failed | AutoMod settings, provider/API status, bot permissions |
| `ERR_API_FAILURE-####` | External API/provider error | Provider failed before an HTTP status was available | API key, provider config, network/API logs |
| `ERR_API_FAILURE-###-####` | External API/provider error with HTTP status | Hugging Face, Together.ai, Twitch, YouTube, TikTok, or another provider returned a 4xx/5xx status | Provider status, API key, credits, model name, rate limits |
| `ERR_INVALID_ARGUMENTS-####` | Invalid arguments or response | Bad command input or Discord rejected a response body | Command options, embed size, field length, input validation |
| `ERR_COOLDOWN-####` | Cooldown active | A command or system was used too fast | Retry after the cooldown |
| `ERR_MISSING_DEPENDENCY-####` | Missing dependency/config | Missing token, API key, SMTP, provider, or runtime dependency | `.env`, startup warnings, package install |
| `ERR_INTERACTION_ERROR-####` | General interaction error | Slash command, button, dropdown, or modal failed | Command handler, permissions, Discord API response |
| `ERR_MESSAGE_ERROR-####` | General message error | Prefix command or message event failed | Prefix command parsing, message content, channel permissions |
| `ERR_UNHANDLED-####` | Unhandled promise rejection | Async code threw outside a local catch block | Recent logs, async task, background monitor |
| `ERR_UNCAUGHT-####` | Uncaught exception | Runtime exception reached the process-level handler | Stack trace, startup/runtime logs |
| `ERR_BOT_FAILURE-####` | General bot error | Error did not match a more specific area | Developer DM details and PM2 logs |

## User-Facing Command Errors

The bot now translates common Discord API failures into cleaner public messages:

- Missing permissions: check the bot role position and channel permissions.
- Missing access: check invite scopes, channel access, and whether the target still exists.
- Unknown interaction: Discord expired the slash command interaction; run it again.
- Already acknowledged: Discord already accepted a response for that command.
- Cannot DM user: the target user likely has DMs closed.
- Rate limits: wait briefly before trying the command again.

Developer alerts still include the exact error code and private context. Repeated copies of the same error code in the same command/channel are throttled for a few minutes so one broken background task does not flood Discord DMs or backup email.

## AI Provider Status Codes

These appear as the middle number in codes like `ERR_API_FAILURE-429-1234`.

| Status | Meaning | Typical fix |
| --- | --- | --- |
| `400` | Bad request | Check model name, request format, prompt size, and provider requirements |
| `401` | Unauthorized | Check missing or invalid API key |
| `402` | Payment or credit limit | Check provider billing, credits, or quota |
| `403` | Forbidden | Check provider account access or model permission |
| `404` | Not found | Check provider endpoint or model name |
| `408` | Request timeout | Retry later or reduce request size |
| `409` | Conflict | Retry later or check provider-side state |
| `429` | Rate limited or queue overloaded | Wait, reduce traffic, or change provider/model |
| `500` | Provider internal error | Retry later and check provider status |
| `502` | Bad gateway | Provider or routing failure; retry later |
| `503` | Service unavailable | Provider overloaded or temporarily down |
| `504` | Gateway timeout | Provider took too long; retry later |

## What To Send The Developer

When reporting an issue, include:

- The error code, exactly as shown.
- The command or feature you used.
- The server and channel.
- What you expected to happen.
- The approximate time.

Example:

```text
Error code: ERR_API_FAILURE-429-1234
Command: joined AI chat
Server/channel: Production Studios / #general
Time: around 1:40 PM
What happened: AI said the feature was locked after provider failure.
```

## Asking The Bot AI

You can ask the bot AI what an error code means. For example:

```text
what does ERR_API_FAILURE-429-1234 mean?
```

The AI can explain the prefix and status code, such as `ERR_API_FAILURE-429` meaning an API/provider rate-limit or queue overload. It cannot see private developer DMs, stack traces, tokens, or hidden logs, so it may still ask you for the command, server, channel, and time.

## Developer Notes

The code is generated by `errorCodeFor(error, context)` in `src/testable-utils.js`.

- Interaction errors use specific codes like `ERR_INTERACTION_TIMEOUT`, `ERR_INTERACTION_STATE`, or `ERR_INTERACTION_ERROR`.
- Prefix/message errors use `ERR_MESSAGE_ERROR` unless a more specific permission, setup, moderation, or module code applies.
- API/provider errors use `ERR_API_FAILURE`, with HTTP status when available.
- Unhandled process errors use `ERR_UNHANDLED` or `ERR_UNCAUGHT`.
- Everything else falls back to `ERR_BOT_FAILURE`.

Developer DMs include the same code shown to the user, plus the formatted error message and context fields.
