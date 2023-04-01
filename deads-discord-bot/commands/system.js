import { SlashCommandBuilder } from "@discordjs/builders";
import { getChannelData } from "../channelData.js";


export const data = new SlashCommandBuilder()
    .setName("system")
    .setDescription("Send a system message to the bot")
    .addStringOption(option =>
        option.setName("message")
            .setDescription("The system message")
            .setRequired(true));

export async function execute(interaction) {
    const content = interaction.options.getString("message");
    getChannelData(interaction.channel).addSystemMessage({ role: "system", content: content });
    console.log(`[${interaction.channelId}] System Message: ${content}`);
}
