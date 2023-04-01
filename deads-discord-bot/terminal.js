import readline from "readline";

import { settings } from "./settings.js";

import { getChannelData } from "./channelData.js";

const channelData = getChannelData({
    id: "terminal",
    language: settings.default_language,
    send: function () {
        // do nothing
    },
    sendTyping: function () {
        console.info(".");
    }
});

let askChatGPTFunction;
let rlInterface;

export async function startup(processChannelFunction, _askChatGPTFunction) {
    askChatGPTFunction = _askChatGPTFunction;

    rlInterface = readline.createInterface({
        input: process.stdin,
        //output: process.stdout,
        terminal: false
    });

    rlInterface.on("line", async (line) => {
        try {
            channelData.addUserMessage({ role: "user", content: `Konsolero:${line}` });
            await processChannelFunction(channelData, line);
        } catch (error) {
            console.error("Channel processing error:", error);
        }
    });

    console.log("Bot startup complete.");
}

export async function shutdown() {
    rlInterface.close();
    console.log("Bot has been shut down.");
}
