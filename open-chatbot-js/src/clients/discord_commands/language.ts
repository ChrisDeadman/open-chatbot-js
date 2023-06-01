import { SlashCommandBuilder } from '@discordjs/builders';
import { DiscordClient } from '../discord_client.js';

export const data = new SlashCommandBuilder()
    .setName('language')
    .setDescription('Change the language of the bot')
    .addStringOption(option =>
        option
            .setName('language')
            .setDescription('The new language the bot should reply in')
            .setRequired(true)
    );

export async function execute(client: DiscordClient, interaction: any) {
    const language = interaction.options.getString('language');
    const response = `Language changed to ${language}`;
    client.getConversation(interaction.channel).botController.settings.language = language;
    console.log(`[${interaction.channelId}] ${response}`);
    await interaction.reply(response);
}
