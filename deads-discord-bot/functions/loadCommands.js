import { Collection } from "discord.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export default function (client) {
    client.loadCommands = async (commandFolder) => {
        const currentModulePath = fileURLToPath(import.meta.url);
        const currentDir = path.dirname(currentModulePath);
        const commandsPath = path.join(currentDir, commandFolder);

        const commandFiles = await fs.readdir(commandsPath);
        const commandFilesJS = commandFiles.filter(file => file.endsWith(".js"));

        client.commands = new Collection();
        client.commandArray = [];

        for (const file of commandFilesJS) {
            const filePath = path.join(commandsPath, file);
            try {
                // import the command
                const command = await import(filePath);
                //const command = commandModule.default;

                // Set a new item in the Collection with the key as the command name and the value as the exported module
                if ("data" in command && "execute" in command) {
                    client.commands.set(command.data.name, command);
                    client.commandArray.push(command.data.toJSON());
                } else {
                    console.warn(`The command at ${filePath} is missing a required "data" or "execute" property.`);
                }
            } catch (error) {
                console.error(`Error loading command from ${filePath}:`, error);
            }
        }
    };
}
