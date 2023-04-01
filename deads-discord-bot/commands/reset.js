import { SlashCommandBuilder } from "@discordjs/builders";
import { getChannelData } from "../channelData.js";


export const data = new SlashCommandBuilder()
    .setName("reset")
    .setDescription("Reset the bot");

export async function execute(interaction) {
    const response = "Bot conversation state reset.";
    getChannelData(interaction.channel).resetConversationHistory();
    console.log(`[${interaction.channelId}] ${response}`);
    await interaction.reply(response);
}
