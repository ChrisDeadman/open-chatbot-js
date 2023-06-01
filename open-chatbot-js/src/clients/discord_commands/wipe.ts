import { SlashCommandBuilder } from '@discordjs/builders';
import { DiscordClient } from '../discord_client.js';

export const data = new SlashCommandBuilder()
    .setName('wipe')
    .setDescription('Wipe the bots memory');

export async function execute(client: DiscordClient, interaction: any) {
    if (client.botController.memory) await client.botController.memory.clear();
    const response = 'My memory is wiped.';
    console.log(`[${interaction.channelId}] ${response}`);
    await interaction.reply(response);
}
