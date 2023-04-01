import mime from "mime-types";
import fetch from "node-fetch";

import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import { getChannelData } from "./channelData.js";

import { settings } from "./settings.js";

import { getInitialPrompt } from "./functions/getInitialPrompt.js";

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        //GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMessageTyping,
        //
        GatewayIntentBits.DirectMessages,
        //GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.DirectMessageTyping,
        GatewayIntentBits.MessageContent,
    ],
    partials: [
        Partials.Channel, Partials.Message, Partials.Reaction
    ]
});
(await import("./functions/refreshCommands.js")).default(client);
(await import("./functions/loadCommands.js")).default(client);

let processChannelFunction;
let askChatGPTFunction;

export async function startup(_processChannelFunction, _askChatGPTFunction) {
    processChannelFunction = _processChannelFunction;
    askChatGPTFunction = _askChatGPTFunction;

    console.log("Loading commands...");
    await client.loadCommands("../commands");

    console.log("Logging in...");
    client.login(settings.discord_bot_token);
}

export async function shutdown() {
    // Set bot presence to invisible before shutting down
    client.user.setPresence({ status: "invisible" });
    client.user.setActivity("OFFLINE", { type: 3 });
    // Wait a bit before destroying the discord instance
    await new Promise(resolve => setTimeout(resolve, 1000));
    client.destroy();
    console.log("Bot has been shut down.");
}

client.on(Events.ClientReady, async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    console.log("Refreshing commands...");
    await client.refreshCommands(client.application.id);

    console.log("Generating status message...");
    const question = [getInitialPrompt(settings.status_language)].concat({ role: "system", content: settings.status_prompt });
    const statusMessage = await askChatGPTFunction(question);
    console.log(`Status message: ${statusMessage.content}`);

    console.log("Setting bot status...");
    client.user.setPresence({ status: "online" });
    client.user.setActivity(statusMessage.content, { type: 3 });

    console.log("Bot startup complete.");
});

client.on(Events.Error, (error) => {
    console.error("Discord client error:", error);
});

client.on(Events.MessageCreate, async (message) => {
    // Ignore messages from other bots
    if (message.author.bot) {
        return;
    }

    // Add to channel messages
    const channelData = getChannelData(message.channel);
    channelData.addUserMessage({ role: "user", content: `${message.author.username}:${message.content}` })
    console.log(`[${message.channelId}] ${message.author.username}: ${message.content}`);

    // Handle attachments
    if (message.attachments.size > 0) {
        for (const attachment of message.attachments.values()) {
            // Only process text files
            const isText = (mime.contentType(attachment.name) || "").startsWith("text/");
            if (isText) {
                try {
                    // Fetch the attachment text
                    const response = await fetch(attachment.url);
                    const textContent = await response.text();
                    // Add the attachment text to the channel messages
                    channelData.addUserMessage({ role: "user", content: `${message.author.username} (attachment):${textContent}` });
                    console.log(`[${message.channelId}] ${message.author.username} (attachment): ${attachment.name}`);
                } catch (error) {
                    console.error(`Error reading attachment ${attachment.name}:`, error);
                }
            }
        }
    }

    // process channel data
    await processChannelFunction(channelData, message.content);
});

client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }
        try {
            console.log(`[${interaction.channelId}] ${interaction.user.username}: ${interaction.commandName}()`);
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            const message = { content: "There was an error while executing this command!", ephemeral: true };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(message);
            } else {
                await interaction.reply(message);
            }
        }
    }
});
