import { SlashCommandBuilder } from '@discordjs/builders';
import { DiscordClient } from '../discord_client.js';

export const data = new SlashCommandBuilder()
    .setName('system')
    .setDescription('Send a system message to the bot')
    .addStringOption(option =>
        option.setName('message').setDescription('The system message').setRequired(true)
    );

export async function execute(client: DiscordClient, interaction: any) {
    const content = interaction.options.getString('message');
    client
        .getConversation(interaction.channelId)
        .addMessage({ role: 'system', content: content }, true);
    console.log(`[${interaction.channelId}] System Message: ${content}`);
    await interaction.reply("Added and pinned system message.");
}
