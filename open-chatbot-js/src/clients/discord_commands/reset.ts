import { SlashCommandBuilder } from '@discordjs/builders';
import { DiscordClient } from '../discord_client.js';

export const data = new SlashCommandBuilder().setName('reset').setDescription('Reset the bot');

export async function execute(client: DiscordClient, interaction: any) {
    const conversation = client.getConversation(interaction.channel);
    conversation.clear();
    const response = 'My conversation state is reset.';
    console.log(`[${interaction.channelId}] ${response}`);
    await interaction.reply(response);
}
