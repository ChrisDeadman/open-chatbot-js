import { loadSettings, settings } from "./settings.js";

console.log("Loading settings...");
await loadSettings("config/settings.json");

import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { Configuration, OpenAIApi } from "openai";

const openai = new OpenAIApi(new Configuration({ apiKey: settings.openai_api_key, }))

import { getInitialPrompt } from "./functions/getInitialPrompt.js";
import { readUrlContent } from "./functions/readUrlContent.js";

let shutdownFunction = null;

async function askChatGPT(conversation) {
  try {
    // Post to OpenAI API
    const completion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: conversation,
    });
    // Return message from completion data if any
    return completion.data && completion.data.choices[0].message
      ? completion.data.choices[0].message
      : null;
  } catch (error) {
    const hasErrorMessage =
      error.response && error.response.data && error.response.data.message;
    let errorMessage = hasErrorMessage
      ? `OpenAI API: ${error.response.data.message}`
      : `${error.toString()}`;
    console.error(errorMessage);
    return { role: "system", content: errorMessage };
  }
}

async function respondToChannel(channel, response) {
  const chunkSize = 1000;
  const numChunks = Math.ceil(response.length / chunkSize);
  for (let chunk = 0, idx = 0; chunk < numChunks; ++chunk, idx += chunkSize) {
    await channel.send(response.substring(idx, idx + chunkSize));
  }
  console.log(`[${channel.id}] BOT: ${response}`);
}

async function scheduleProcessChannel(channelData, messageContent) {
  // If processTimeout is set, clear it
  if (channelData.processTimeout) {
    clearTimeout(channelData.processTimeout);
  }

  // Set a new processTimeout
  channelData.processTimeout = setTimeout(async () => {
    await processChannel(channelData, messageContent);
    channelData.processTimeout = null;
  }, settings.process_interval_ms);
}

async function processChannel(channelData, messageContent) {
  // No messages, nothing to do
  if (channelData.conversationHistory.length < 1) {
    return;
  }

  // Reschedule if channel is already being processed
  if (channelData.isProcessing) {
    scheduleProcessChannel(channelData, messageContent);
    return;
  }

  channelData.isProcessing = true;
  try {
    const urlRegex = /((http:\/\/www\.|https:\/\/www\.|http:\/\/|https:\/\/|www\.)+[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,5}(:[0-9]{1,5})?(\/[^!?\s]*)?(\?([^#,;?\s]+))?)/i;

    // If a URL is found, read the URL content and condense it
    const urlMatch = messageContent.match(urlRegex);
    if (urlMatch) {
      // Start typing
      await channelData.channel.sendTyping();

      // Read URL content
      let url = urlMatch[0];
      url = url.replace("https://", "");
      if (url.endsWith(".")) {
        url = url.substring(0, url.length - 1);
      }
      const content = await readUrlContent(url) || "EMPTY";

      // Only generate a summary if content length is big enough
      let summary = content;
      if (content.length > 500) {
        // Generate content chunks
        const chunks = []
        const chunkSize = 4000;
        for (let i = 0; i < content.length; i += chunkSize) {
          chunks.push(content.slice(i, i + chunkSize));
        }

        // Generate a summary over all content chunks
        summary = "Summary:\n\nLinks:";
        for (let idx = 0; idx < Math.min(4, chunks.length); idx++) {
          const chunk = chunks[idx];
          const summaryConversation = [
            {
              role: "system",
              content: `
You are a friend of the group that is refining content from a web-page which includes stories, datapoints, links and all kinds of information.\n
Update the Summary based on the Unrefined Content.\n
Also update the relevant Links starting with "https://" and always keep video links.\n
Try to not forget important information in your updates.\n
${summary}\n\n
Unrefined:\n
${chunk}`
            },
          ];

          // Start typing
          await channelData.channel.sendTyping();

          // Ask ChatGPT about the system response
          const summaryCompletion = await askChatGPT(summaryConversation);
          if (!summaryCompletion || summaryCompletion.content.length < 1) {
            break;
          }

          // Update summary
          summary = summaryCompletion.content;
        }
      }

      if (summary.length > 0) {
        // Store summary in conversation history
        channelData.addUserMessage({ role: "system", content: `${url}:\n${summary}` });
        // Print summary for debugging
        console.debug(`\`\`\`\n[${channelData.channel.id}]: ${summary}\n\`\`\``);
      }
    }

    // Start typing
    await channelData.channel.sendTyping();

    // The conversation always starts with the initial prompt
    const conversation = [getInitialPrompt(channelData.language)].concat(channelData.getConversationHistory());

    // Send conversation to and get response from ChatGPT
    const completion = await askChatGPT(conversation);
    if (!completion || completion.content.length < 1) {
      return;
    }

    // Remove prefix if any
    const prefix = `${settings.bot_name}: `;
    if (completion.content.startsWith(prefix)) {
      completion.content = completion.content.substring(prefix.length);
    }

    // Store bot response in conversation history
    channelData.addUserMessage(completion);

    // respond with bot response
    respondToChannel(channelData.channel, completion.content);
  } catch (error) {
    console.error(`fatal processing error: ${error}`);
  } finally {
    channelData.isProcessing = false;
  }
}

// Normal exit
process.on("beforeExit", async () => {
  await shutdownFunction();
  process.exit();
});

// Catch signals that usually terminate the application, such as SIGINT (Ctrl+C)
process.on("SIGINT", async () => {
  console.log("\nCaught interrupt signal. Shutting down...");
  await shutdownFunction();
  process.exit();
});

// Handle debugger disconnection
process.on("SIGUSR2", async () => {
  console.log("\nDebugger disconnected. Shutting down...");
  await shutdownFunction();
  process.exit();
});

const argv = yargs(hideBin(process.argv))
  .command("terminal", "start the bot in terminal mode")
  .command("discord", "start the bot in discord mode")
  .demandCommand(1)
  .parse()

const command = argv._[0] || "terminal";

if (command === "discord") {
  const discord = await import("./discord.js");
  shutdownFunction = discord.shutdown;
  discord.startup(scheduleProcessChannel, askChatGPT);
} else {
  const terminal = await import("./terminal.js");
  shutdownFunction = terminal.shutdown;
  terminal.startup(processChannel, askChatGPT);
}
