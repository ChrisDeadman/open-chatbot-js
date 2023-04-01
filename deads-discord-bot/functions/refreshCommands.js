import { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v9";
import { settings } from "../settings.js";

export default function (client) {
    client.refreshCommands = async (clientId) => {
        const rest = new REST({
            version: "9",
        }).setToken(settings.discord_bot_token);

        (async () => {
            try {
                await rest.put(Routes.applicationCommands(clientId), {
                    body: client.commandArray
                });
            } catch (error) {
                console.error(error);
            }
        })();
    };
}
