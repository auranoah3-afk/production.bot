import { SlashCommandBuilder } from 'discord.js';

export const bugSlashCommand = new SlashCommandBuilder()
  .setName('bug')
  .setDescription('Report a bot bug to the developer bug tracker.')
  .addStringOption((option) =>
    option
      .setName('description')
      .setDescription('What broke? Include the command, page, or feature if you can.')
      .setMinLength(5)
      .setMaxLength(1024)
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName('urgency')
      .setDescription('How serious is this bug?')
      .setRequired(true)
      .addChoices(
        { name: 'Low', value: 'LOW' },
        { name: 'Medium', value: 'MEDIUM' },
        { name: 'High', value: 'HIGH' },
        { name: 'Critical', value: 'CRITICAL' }
      )
  )
  .addStringOption((option) =>
    option
      .setName('steps')
      .setDescription('Optional steps to reproduce the issue.')
      .setMaxLength(1024)
      .setRequired(false)
  );
