import { SlashCommandBuilder } from '@discordjs/builders';
import { ConvMessage } from '../../utils/conv_message.js';
import { DiscordClient } from '../discord_client.js';

export const data = new SlashCommandBuilder()
    .setName('system')
    .setDescription('Send a system message to the bot')
    .addStringOption(option =>
        option.setName('message').setDescription('The system message').setRequired(true)
    );

export async function execute(client: DiscordClient, interaction: any) {
    const conversation = client.getConversation(interaction.channelId);
    const content = interaction.options.getString('message');
    conversation.push(new ConvMessage('system', 'system', content));
    console.log(`[${interaction.channelId}] System Message: ${content}`);
    await interaction.reply('System message received.');
}
