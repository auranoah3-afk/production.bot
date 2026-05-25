import dotenv from 'dotenv';
import path from 'node:path';

export function loadLocalEnv(cwd = process.cwd()) {
  const envPath = resolveLocalEnvPath(cwd);
  return dotenv.config({
    path: envPath,
    override: true,
    quiet: true
  });
}

export function resolveLocalEnvPath(cwd = process.cwd()) {
  const explicitFile = process.env.BOT_ENV_FILE?.trim();
  if (explicitFile) {
    return path.isAbsolute(explicitFile) ? explicitFile : path.join(cwd, explicitFile);
  }

  const botEnv = cleanBotEnvironmentName(process.env.BOT_ENV);
  if (botEnv && botEnv !== 'production') {
    return path.join(cwd, `.env.${botEnv}`);
  }

  return path.join(cwd, '.env');
}

function cleanBotEnvironmentName(value) {
  const clean = String(value ?? '').trim().toLowerCase();
  return /^[a-z0-9_-]+$/.test(clean) ? clean : '';
}
