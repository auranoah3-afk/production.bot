import { loadLocalEnv } from './env.js';

loadLocalEnv();
import fs from 'node:fs';
import path from 'node:path';
import { REST, Routes } from 'discord.js';
import { commands, guildSpecificCommands, guildSpecificCommandsForGuild, productionExcludedCommandNames } from './commands.js';
import {
  formatStartupValidation,
  validateStartupEnvironment
} from './core/startup-validation.js';
import {
  createCommandInventory,
  guildDeployCommands,
  publicDeployCommands,
  summarizeCommandInventory,
  validateCommandInventory
} from './core/command-platform.js';

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const configuredGuildIds = parseIdList(process.env.DISCORD_GUILD_ID);
const knownGuildIds = readKnownGuildIds();
const commandDeployMode = String(process.env.COMMAND_DEPLOY_MODE ?? 'global').trim().toLowerCase();
const commandInventory = createCommandInventory({ commands, guildSpecificCommands });
const commandInventoryProblems = validateCommandInventory(commandInventory);
const productionCommands = publicDeployCommands(commands, productionExcludedCommandNames);
const startupEnvironmentReport = validateStartupEnvironment(process.env, {
  requireClientId: true,
  requireGuildIds: commandDeployMode === 'guild'
});

if (!startupEnvironmentReport.ok) {
  throw new Error(formatStartupValidation(startupEnvironmentReport));
}

for (const warning of startupEnvironmentReport.warnings) {
  console.log(`Deploy warning: ${warning}`);
}

if (commandInventoryProblems.length) {
  throw new Error(`Command registry failed validation:\n- ${commandInventoryProblems.join('\n- ')}`);
}

const rest = new REST({ version: '10' }).setToken(token);
console.log(`Command registry validated: ${JSON.stringify(summarizeCommandInventory(commandInventory))}`);

if (commandDeployMode === 'guild') {
  if (!configuredGuildIds.length) {
    throw new Error('Guild command deploy requires DISCORD_GUILD_ID in the selected .env file.');
  }

  for (const guildId of configuredGuildIds) {
    const guildCommands = guildDeployCommands(commands, guildId, guildSpecificCommandsForGuild);
    console.log(`Deploying ${guildCommands.length} V2 command(s) to guild ${guildId}...`);
    try {
      await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: guildCommands }
      );
      console.log(`Guild slash commands deployed for ${guildId}.`);
    } catch (error) {
      if (error.code === 50001 || error.status === 403) {
        throw new Error(`Missing access to guild ${guildId}. Invite the development bot with bot and applications.commands scopes, then run npm.cmd run deploy:dev again.`);
      }
      throw error;
    }
  }

  console.log('Guild-only deploy complete. Global production commands were not touched.');
} else {
  console.log(`Deploying ${productionCommands.length} public V2 command(s) globally...`);

  await rest.put(
    Routes.applicationCommands(clientId),
    { body: productionCommands }
  );

  console.log('Global slash commands deployed.');

  const botGuildIds = await readBotGuildIds();
  const candidateGuildIdsToClean = [
    ...new Set([
      ...configuredGuildIds,
      ...knownGuildIds,
      ...botGuildIds
    ])
  ];
  const visibleGuildIds = new Set(botGuildIds);
  const guildIdsToClean = visibleGuildIds.size
    ? candidateGuildIdsToClean.filter((guildId) => visibleGuildIds.has(guildId))
    : candidateGuildIdsToClean;
  const skippedGuildIds = visibleGuildIds.size
    ? candidateGuildIdsToClean.filter((guildId) => !visibleGuildIds.has(guildId))
    : [];

  if (skippedGuildIds.length) {
    console.log(`Skipping ${skippedGuildIds.length} guild command cleanup target(s) the bot is not currently in: ${skippedGuildIds.join(', ')}.`);
  }

  for (const guildId of guildIdsToClean) {
    const guildCommands = guildSpecificCommandsForGuild(guildId);
    console.log(guildCommands.length
      ? `Syncing ${guildCommands.length} server-specific guild command(s) for ${guildId}...`
      : `Clearing duplicate guild slash command copies for ${guildId}...`);
    try {
      await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: guildCommands }
      );
      console.log(guildCommands.length
        ? `Server-specific guild commands synced for ${guildId}.`
        : `Guild slash command copies cleared for ${guildId}.`);
    } catch (error) {
      console.warn(`Could not clear guild commands for ${guildId}: ${error.message}`);
    }
  }

  if (!guildIdsToClean.length) {
    console.log('No known guild IDs found for duplicate guild command cleanup.');
  }
}

function parseIdList(value) {
  return (value ?? '').split(',').map((id) => id.trim()).filter(Boolean);
}

function readKnownGuildIds() {
  try {
    const configPath = path.join(process.cwd(), 'data', configFileName());
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return Object.keys(parsed.guilds ?? {}).filter((id) => /^\d{17,20}$/.test(id));
  } catch {
    return [];
  }
}

function configFileName() {
  if (process.env.BOT_CONFIG_FILE?.trim()) return process.env.BOT_CONFIG_FILE.trim();
  const botEnv = String(process.env.BOT_ENV || 'production').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return botEnv && botEnv !== 'production' ? `config.${botEnv}.json` : 'config.json';
}

async function readBotGuildIds() {
  try {
    const guilds = await rest.get(Routes.userGuilds());
    return guilds.map((guild) => guild.id).filter((id) => /^\d{17,20}$/.test(id));
  } catch (error) {
    console.warn(`Could not read bot guild list for instant command sync: ${error.message}`);
    return [];
  }
}
