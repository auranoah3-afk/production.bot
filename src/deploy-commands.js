import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { commands } from './commands.js';

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildIdsToClear = parseIdList(process.env.DISCORD_GUILD_ID);

if (!token || !clientId) {
  throw new Error('Missing DISCORD_TOKEN or DISCORD_CLIENT_ID in your .env file.');
}

const rest = new REST({ version: '10' }).setToken(token);

console.log(`Deploying ${commands.length} V2 command(s) globally...`);

await rest.put(
  Routes.applicationCommands(clientId),
  { body: commands }
);

console.log('Global slash commands deployed.');

for (const guildId of guildIdsToClear) {
  console.log(`Clearing guild-specific commands for ${guildId} to prevent duplicates...`);
  await rest.put(
    Routes.applicationGuildCommands(clientId, guildId),
    { body: [] }
  );
  console.log(`Guild-specific commands cleared for ${guildId}.`);
}

if (!guildIdsToClear.length) {
  console.log('No guild-specific command cleanup requested.');
}

function parseIdList(value) {
  return (value ?? '').split(',').map((id) => id.trim()).filter(Boolean);
}
