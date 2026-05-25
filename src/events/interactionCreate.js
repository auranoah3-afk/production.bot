import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits
} from 'discord.js';
import {
  createBug,
  getBug,
  updateBugMessageLocation,
  updateBugStatus
} from '../database/bugs.js';
import { truncate } from '../testable-utils.js';

export const bugReportGuildId = '1505751652655693926';
export const bugReportChannelId = '1508487355324170260';

const statusDetails = Object.freeze({
  OPEN: { label: 'Open', icon: '🔵', color: 0x5865f2 },
  ASSIGNED: { label: 'Assigned', icon: '🆔', color: 0x8b5cf6 },
  IN_PROGRESS: { label: 'In Progress', icon: '🟡', color: 0xf6c85f },
  FIXED: { label: 'Fixed', icon: '🟢', color: 0x35d07f },
  REJECTED: { label: 'Rejected', icon: '🔴', color: 0xff3344 }
});

const urgencyDetails = Object.freeze({
  LOW: { label: 'Low', icon: '🟢' },
  MEDIUM: { label: 'Medium', icon: '🟡' },
  HIGH: { label: 'High', icon: '🟠' },
  CRITICAL: { label: 'Critical', icon: '🔴' }
});

const bugActions = Object.freeze({
  fixed: { status: 'FIXED', label: 'Mark Fixed' },
  progress: { status: 'IN_PROGRESS', label: 'In Progress' },
  reject: { status: 'REJECTED', label: 'Reject' },
  assign: { status: 'ASSIGNED', label: 'Assign to Me' }
});

export async function handleBugSlashCommand(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const bug = createBug({
      userId: interaction.user.id,
      username: interaction.user.tag ?? interaction.user.username,
      description: interaction.options.getString('description', true),
      urgency: interaction.options.getString('urgency', true),
      steps: interaction.options.getString('steps') || 'Not provided.'
    });

    const reportMessage = await sendBugReportToChannel(interaction, bug);
    if (reportMessage) {
      updateBugMessageLocation(bug.bugId, {
        guildId: bugReportGuildId,
        channelId: bugReportChannelId,
        messageId: reportMessage.id
      });
    }

    await interaction.editReply({
      embeds: [bugSubmittedEmbed(bug, Boolean(reportMessage))],
      allowedMentions: { parse: [] }
    });
  } catch (error) {
    console.error('Bug report submission failed:', error);
    await interaction.editReply({
      embeds: [bugErrorEmbed('Bug Report Failed', 'The report could not be saved right now. Please try again in a moment.')],
      allowedMentions: { parse: [] }
    }).catch(() => null);
  }
}

export async function handleBugButtonInteraction(interaction) {
  if (!interaction.customId?.startsWith('bug:')) return false;

  const parsed = parseBugActionCustomId(interaction.customId);
  if (!parsed) {
    await interaction.reply({
      embeds: [bugErrorEmbed('Unknown Bug Action', 'That bug action is no longer valid.')],
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] }
    });
    return true;
  }

  if (!canUseBugAdminPanel(interaction.memberPermissions)) {
    await interaction.reply({
      embeds: [bugErrorEmbed('Admin Action Required', 'You need **Administrator** or **Manage Server** to update bug reports.')],
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] }
    });
    return true;
  }

  try {
    const bug = getBug(parsed.bugId);
    if (!bug) {
      await interaction.reply({
        embeds: [bugErrorEmbed('Bug Not Found', `No database record exists for \`${parsed.bugId}\`.`)],
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] }
      });
      return true;
    }

    const nextAction = bugActions[parsed.action];
    if (isClosedBugStatus(bug.status)) {
      await interaction.reply({
        embeds: [bugErrorEmbed('Bug Already Closed', `\`${bug.bugId}\` is already **${statusLabel(bug.status)}**.`)],
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] }
      });
      return true;
    }

    if (isDuplicateBugAction(bug, nextAction.status, interaction.user.id)) {
      await interaction.reply({
        embeds: [bugErrorEmbed('No Change Needed', `\`${bug.bugId}\` is already **${statusLabel(bug.status)}**.`)],
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] }
      });
      return true;
    }

    const updatedBug = nextAction.status === 'ASSIGNED'
      ? updateBugStatus(bug.bugId, nextAction.status, interaction.user.id, { assignedToUsername: interaction.user.tag ?? interaction.user.username })
      : updateBugStatus(bug.bugId, nextAction.status);

    await interaction.update({
      embeds: [bugReportEmbed(updatedBug, interaction.client.user)],
      components: [bugActionRow(updatedBug)],
      allowedMentions: { parse: [] }
    });
    return true;
  } catch (error) {
    console.error('Bug report button update failed:', error);
    await interaction.reply({
      embeds: [bugErrorEmbed('Bug Update Failed', 'The bug status could not be updated. The developer logs have the full error.')],
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] }
    }).catch(() => null);
    return true;
  }
}

export function bugReportEmbed(bug, clientUser = null) {
  const status = statusDetails[bug?.status] ?? statusDetails.OPEN;
  const urgency = urgencyDetails[bug?.urgency] ?? urgencyDetails.LOW;
  const fields = [
    { name: 'Description', value: safeEmbedValue(bug.description), inline: false },
    { name: 'Urgency', value: `${urgency.icon} ${urgency.label}`, inline: true },
    { name: 'Status', value: `${status.icon} ${status.label}`, inline: true },
    bug.assignedTo ? { name: 'Assigned To', value: bug.assignedToUsername ? `${bug.assignedToUsername} (${bug.assignedTo})` : `<@${bug.assignedTo}>`, inline: false } : null,
    { name: 'Steps', value: safeEmbedValue(bug.steps || 'Not provided.'), inline: false },
    { name: 'Reporter', value: `${safeEmbedValue(bug.username, 100)} (${bug.userId})`, inline: false }
  ].filter(Boolean);

  const embed = new EmbedBuilder()
    .setColor(status.color)
    .setTitle(`🐛 New Bug Report - ${bug.bugId}`)
    .addFields(fields)
    .setFooter({ text: 'V2 Production | Bug Tracking System' })
    .setTimestamp(new Date(bug.createdAt || Date.now()));

  const avatarUrl = clientUser?.displayAvatarURL?.({ size: 128 });
  if (avatarUrl) {
    embed.setThumbnail(avatarUrl);
  }

  return embed;
}

export function bugActionRow(bug) {
  const closed = isClosedBugStatus(bug?.status);
  const status = String(bug?.status ?? 'OPEN').toUpperCase();

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`bug:fixed:${bug.bugId}`)
      .setEmoji('🟢')
      .setLabel('Mark Fixed')
      .setStyle(ButtonStyle.Success)
      .setDisabled(closed || status === 'FIXED'),
    new ButtonBuilder()
      .setCustomId(`bug:progress:${bug.bugId}`)
      .setEmoji('🟡')
      .setLabel('In Progress')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(closed || status === 'IN_PROGRESS'),
    new ButtonBuilder()
      .setCustomId(`bug:reject:${bug.bugId}`)
      .setEmoji('🔴')
      .setLabel('Reject')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(closed || status === 'REJECTED'),
    new ButtonBuilder()
      .setCustomId(`bug:assign:${bug.bugId}`)
      .setEmoji('🆔')
      .setLabel('Assign to Me')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(closed)
  );
}

function bugSubmittedEmbed(bug, postedToChannel) {
  return new EmbedBuilder()
    .setColor(postedToChannel ? 0x35d07f : 0xf6c85f)
    .setTitle(postedToChannel ? 'Bug Report Sent' : 'Bug Saved Locally')
    .setDescription(postedToChannel
      ? `Thanks. Your report was logged as \`${bug.bugId}\` and sent to the developer bug queue.`
      : `Your report was saved as \`${bug.bugId}\`, but the developer bug channel could not be reached.`)
    .addFields(
      { name: 'Urgency', value: `${urgencyDetails[bug.urgency]?.icon ?? '🔵'} ${urgencyDetails[bug.urgency]?.label ?? bug.urgency}`, inline: true },
      { name: 'Status', value: '🔵 Open', inline: true }
    )
    .setFooter({ text: 'V2 Production | Bug Tracking System' })
    .setTimestamp();
}

function bugErrorEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(0xff3344)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: 'V2 Production | Bug Tracking System' })
    .setTimestamp();
}

async function sendBugReportToChannel(interaction, bug) {
  const guild = await interaction.client.guilds.fetch(bugReportGuildId).catch(() => null);
  if (!guild) return null;

  const channel = await guild.channels.fetch(bugReportChannelId).catch(() => null);
  if (!channel?.isTextBased?.()) return null;

  return channel.send({
    embeds: [bugReportEmbed(bug, interaction.client.user)],
    components: [bugActionRow(bug)],
    allowedMentions: { parse: [] }
  }).catch((error) => {
    console.error(`Failed to send bug report ${bug.bugId}:`, error);
    return null;
  });
}

function parseBugActionCustomId(customId) {
  const [, action, bugId] = String(customId ?? '').split(':');
  if (!bugActions[action]) return null;
  if (!/^BUG-\d{4,}$/i.test(String(bugId ?? ''))) return null;
  return { action, bugId: bugId.toUpperCase() };
}

function canUseBugAdminPanel(permissions) {
  return Boolean(
    permissions?.has?.(PermissionFlagsBits.Administrator) ||
    permissions?.has?.(PermissionFlagsBits.ManageGuild)
  );
}

function isClosedBugStatus(status) {
  return ['FIXED', 'REJECTED'].includes(String(status ?? '').toUpperCase());
}

function isDuplicateBugAction(bug, nextStatus, userId) {
  if (bug.status !== nextStatus) return false;
  if (nextStatus !== 'ASSIGNED') return true;
  return bug.assignedTo === userId;
}

function statusLabel(status) {
  return statusDetails[String(status ?? '').toUpperCase()]?.label ?? String(status ?? 'Unknown');
}

function safeEmbedValue(value, maxLength = 1024) {
  const clean = String(value ?? '').trim() || 'Not provided.';
  return truncate(clean, maxLength);
}
