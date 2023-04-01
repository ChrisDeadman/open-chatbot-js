import { SlashCommandBuilder } from "@discordjs/builders";
import { getChannelData } from "../channelData.js";


export const data = new SlashCommandBuilder()
    .setName("language")
    .setDescription("Change the language of the bot")
    .addStringOption(option =>
        option.setName("language")
            .setDescription("The new language the bot should reply in")
            .setRequired(true)
    );

export async function execute(interaction) {
    const language = interaction.options.getString("language");
    const response = `Language changed to ${language}`;
    getChannelData(interaction.channel).language = language;
    console.log(`[${interaction.channelId}] ${response}`);
    await interaction.reply(response);
}
