import { SlashCommandBuilder } from '@discordjs/builders';
import { DiscordClient } from '../discord_client.js';

export const data = new SlashCommandBuilder().setName('reset').setDescription('Reset the bot');

export async function execute(client: DiscordClient, interaction: any) {
    const response = 'Bot conversation state reset.';
    client.getConversation(interaction.channelId).clear();
    console.log(`[${interaction.channelId}] ${response}`);
    await interaction.reply(response);
}
