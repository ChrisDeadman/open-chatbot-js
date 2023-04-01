import { settings } from "../settings.js";

export function getInitialPrompt(language) {
    return {
        role: "system", content: settings.initial_prompt
            .join("\n")
            .replaceAll("$BOT_NAME", settings.bot_name)
            .replaceAll("$LANGUAGE", language)
    }
}
