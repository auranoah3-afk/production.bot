import { PermissionFlagsBits } from 'discord.js';

export function resolveLockdownRole(guild, guildConfig = {}) {
  return guildConfig.lockdownRoleId
    ? guild.roles?.cache?.get(guildConfig.lockdownRoleId) ?? guild.roles?.everyone
    : guild.roles?.everyone;
}

export function canEditLockdownChannel(channel) {
  if (!channel?.permissionOverwrites?.edit || !channel.guild?.roles?.everyone) return false;
  const botMember = channel.guild.members?.me;
  if (!botMember) return true;
  const permissions = channel.permissionsFor(botMember);
  return Boolean(
    permissions?.has?.(PermissionFlagsBits.ManageChannels) ||
      permissions?.has?.(PermissionFlagsBits.Administrator)
  );
}

export function canLockdownRoleViewChannel(channel, lockdownRole) {
  return Boolean(lockdownRole && channel?.permissionsFor?.(lockdownRole)?.has?.(PermissionFlagsBits.ViewChannel));
}

export function isLockdownEligibleChannel(channel, lockdownRole) {
  return Boolean(
    channel?.isTextBased?.() &&
      canEditLockdownChannel(channel) &&
      canLockdownRoleViewChannel(channel, lockdownRole)
  );
}

export async function lockChannelPermissions(channel, lockdownRole) {
  if (!canEditLockdownChannel(channel)) return false;
  if (!canLockdownRoleViewChannel(channel, lockdownRole)) return false;
  await channel.permissionOverwrites.edit(lockdownRole, lockdownDenyPermissions());
  return true;
}

export async function unlockChannelPermissions(channel, lockdownRole) {
  if (!canEditLockdownChannel(channel)) return false;
  await channel.permissionOverwrites.edit(lockdownRole, lockdownAllowPermissions());
  return true;
}

export function lockdownDenyPermissions() {
  return {
    SendMessages: false,
    SendMessagesInThreads: false,
    CreatePublicThreads: false,
    CreatePrivateThreads: false,
    SendTTSMessages: false,
    AddReactions: false
  };
}

export function lockdownAllowPermissions() {
  return {
    SendMessages: null,
    SendMessagesInThreads: null,
    CreatePublicThreads: null,
    CreatePrivateThreads: null,
    SendTTSMessages: null,
    AddReactions: null
  };
}

export async function applyToEligibleServerChannels(guild, lockdownRole, action) {
  let changed = 0;
  let failed = 0;

  for (const channel of guild.channels?.cache?.values?.() ?? []) {
    if (!isLockdownEligibleChannel(channel, lockdownRole)) continue;

    try {
      const didChange = await action(channel);
      if (didChange) changed += 1;
    } catch {
      failed += 1;
    }
  }

  return { changed, failed };
}
