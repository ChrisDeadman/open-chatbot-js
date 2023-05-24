const socket = io();
const messages = document.getElementById("messages");
const typing = document.getElementById("typing");
const settingsForm = document.getElementById("settingsForm");
const promptForm = document.getElementById("promptForm");
const messageForm = document.getElementById("messageForm");
const userInput = document.getElementById("userInput");

marked.setOptions({
  breaks: true,
  gfm: true,
  pedantic: false,
  mangle: false,
  headerIds: false,
});

marked.use(
  markedHighlight.markedHighlight({
    langPrefix: "hljs language-", // highlight.js css expects a top-level 'hljs' class.
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : "plaintext";
      return hljs.highlight(code, { language }).value;
    },
  })
);

const typingIndicatorIcon = document.createElement("i");
typingIndicatorIcon.className = "fa-solid fa-spinner fa-spin";
const typingIndicator = createMessage(
  typingIndicatorIcon,
  "fa-solid fa-robot",
  "bg-secondary"
);

settingsForm.addEventListener("submit", function (e) {
  e.preventDefault();
  username = document.getElementById("username").value;
  botname = document.getElementById("botname").value;
  language = document.getElementById("language").value;
  socket.emit("update settings", {
    username,
    botname,
    language,
  });
});

promptForm.addEventListener("submit", function (e) {
  e.preventDefault();
  socket.emit("update prompt", {
    system_message: document.getElementById("systemMessage").value,
    user_message: document.getElementById("userMessage").value,
    assistant_message: document.getElementById("assistantMessage").value,
    suffix: document.getElementById("suffix").value,
    prefix: document.getElementById("prefix").value.split("\n"),
    bot_browser_prompt: document
      .getElementById("botBrowserPrompt")
      .value.split("\n"),
  });
});

messageForm.addEventListener("submit", function (e) {
  e.preventDefault();
  if (userInput.innerText) {
    appendMessage(userInput.innerText, "fa-solid fa-user", "bg-primary");
    socket.emit("chat message", userInput.innerText);
    userInput.innerText = "";
  }
});

userInput.addEventListener("keydown", function (e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    messageForm.dispatchEvent(new Event("submit"));
  }
});

socket.on("chat message", function (msg) {
  // remove the botname from the start
  const botname = document.getElementById("botname").value;
  const botNameMatch = msg.match(new RegExp(`^${botname}: `, "g"));
  var icon;
  if (botNameMatch) {
    msg = msg.replace(botNameMatch[0], "");
    icon = "fa-robot";
  } else {
    icon = "fa-wrench";
  }
  appendMessage(msg, `fa-solid ${icon}`, "bg-secondary");
});

socket.on("typing", function () {
  messages.appendChild(typingIndicator);
  messages.scrollTop = messages.scrollHeight;
});

socket.on("stop typing", function () {
  messages.removeChild(typingIndicator);
});

function appendMessage(messageText, iconClass, messageClass) {
  // ensure code blocks always start at a new line and end with a newline
  messageText = messageText
    .replaceAll(/(?<!^|\n)\`\`\`/g, "\n```")
    .replaceAll(/^\`\`\`\s+/gm, "```\n");
  // parse markdown and append message
  const markedContent = document.createElement("div");
  markedContent.innerHTML = marked.parse(messageText);

  // find all code elements and prepend language title
  markedContent.querySelectorAll("code").forEach(function (code) {
    code.classList.add("hljs", "rounded");
    const languageClass = Array.from(code.classList).find((cls) =>
      cls.startsWith("language-")
    );
    if (languageClass) {
      const languageTitle = document.createElement("div");
      languageTitle.textContent = languageClass.replace("language-", "");
      languageTitle.classList.add(
        "d-inline-block",
        "bg-dark",
        "text-warning",
        "small",
        "rounded",
        "px-1",
        "mb-0"
      );
      code.parentNode.insertBefore(languageTitle, code);
    }
  });

  const message = createMessage(markedContent, iconClass, messageClass);
  messages.appendChild(message);
  messages.scrollTop = messages.scrollHeight;
}

function createMessage(textElement, iconClass, messageClass) {
  // create message element
  const message = document.createElement("div");
  message.className = `d-inline-flex flex-row border rounded align-items-baseline m-2 ${messageClass} bg-opacity-50`;

  // append icon
  icon = document.createElement("i");
  icon.className = `${iconClass} m-3`;
  message.appendChild(icon);

  // append text
  message.appendChild(textElement);

  return message;
}
