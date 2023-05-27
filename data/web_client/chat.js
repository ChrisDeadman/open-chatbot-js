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

const typingIndicator = buildMessageContainer(
  buildMessageHeader(
    buildMessageIcon("fa-solid", "fa-robot"),
    buildTypingIndicator()
  ),
  document.createElement("div"),
  "bg-secondary"
);

settingsForm.addEventListener("submit", function (e) {
  e.preventDefault();
  username = document.getElementById("username").value;
  bot_name = document.getElementById("botname").value;
  language = document.getElementById("language").value;
  socket.emit("update settings", {
    username,
    bot_name,
    language,
  });
});

promptForm.addEventListener("submit", function (e) {
  e.preventDefault();
  socket.emit("update prompt", {
    system_message: document.getElementById("systemMessage").value,
    user_message: document.getElementById("userMessage").value,
    assistant_message: document.getElementById("assistantMessage").value,
    suffix: document.getElementById("suffix").value.split("\n"),
    prefix: document.getElementById("prefix").value.split("\n"),
    history: document.getElementById("history").value.split("\n"),
    tools: document.getElementById("tools").value.split("\n"),
    bot_browser: document.getElementById("botBrowserPrompt").value.split("\n"),
  });
});

messageForm.addEventListener("submit", function (e) {
  e.preventDefault();
  if (userInput.innerText) {
    const bgStyle =
      messages.children.length % 2 == 0 ? "bg-secondary" : "bg-primary";

    messages.appendChild(
      buildMessageContainer(
        buildMessageHeader(
          buildMessageIcon("fa-solid", "fa-user"),
          buildMessageSender(document.getElementById("username").value, bgStyle)
        ),
        buildMessageElement(userInput.innerText),
        bgStyle
      )
    );
    messages.scrollTop = messages.scrollHeight;

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

socket.on("chat message", function (message) {
  // remove the botname from the start
  const botname = document.getElementById("botname").value;
  const senderMatch = message.match(new RegExp(`^\\s*([\\w\\s]+)\\s*:\\s*`));
  var iconClass;
  var sender;
  if (senderMatch) {
    message = message.replace(senderMatch[0], "");
    sender = senderMatch[1];
    if (sender === botname) {
      iconClass = "fa-robot";
    } else {
      iconClass = "fa-user-secret";
    }
  } else {
    sender = "system";
    iconClass = "fa-wrench";
  }
  const bgStyle =
    messages.children.length % 2 == 0 ? "bg-secondary" : "bg-primary";

  messages.appendChild(
    buildMessageContainer(
      buildMessageHeader(
        buildMessageIcon("fa-solid", iconClass),
        buildMessageSender(sender, bgStyle)
      ),
      buildMessageElement(message),
      bgStyle
    )
  );
  messages.scrollTop = messages.scrollHeight;
});

socket.on("typing", function () {
  if (messages.children.length % 2 == 0) {
    typingIndicator.classList.remove("bg-primary");
    typingIndicator.classList.add("bg-secondary");
  } else {
    typingIndicator.classList.remove("bg-secondary");
    typingIndicator.classList.add("bg-primary");
  }
  messages.appendChild(typingIndicator);
  messages.scrollTop = messages.scrollHeight;
});

socket.on("stop typing", function () {
  messages.removeChild(typingIndicator);
});

function buildMessageElement(messageText) {
  // ensure code blocks always start at a new line and end with a newline
  messageText = messageText
    .replaceAll(/(?<!^|\n)\`\`\`/g, "\n```")
    .replaceAll(/^\`\`\`\s+/gm, "```\n");

  // parse message as markdown
  const element = document.createElement("div");
  element.classList.add("px-3", "pt-2");
  element.innerHTML = marked.parse(messageText);

  // find all code elements and prepend language title
  element.querySelectorAll("code").forEach(function (code) {
    code.classList.add("hljs", "rounded");
    const languageClass = Array.from(code.classList).find((cls) =>
      cls.startsWith("language-")
    );
    if (languageClass) {
      code.parentNode.insertBefore(
        buildLanguageTitle(languageClass.replace("language-", "")),
        code
      );
    }
  });
  return element;
}

function buildTypingIndicator() {
  const element = document.createElement("i");
  element.classList.add("fa-solid", "fa-spinner", "fa-spin", "ms-1");
  return element;
}

function buildMessageIcon(...iconClasses) {
  const element = document.createElement("i");
  element.classList.add(...iconClasses, "p-1", "mx-1", "rounded", "border");
  return element;
}

function buildMessageSender(sender, bgStyle) {
  const element = document.createElement("div");
  element.textContent = sender;
  element.classList.add(
    "rounded",
    "flex-shrink-0",
    "ms-1",
    "px-2",
    bgStyle,
    "bg-opacity-50"
  );
  return element;
}

function buildMessageHeader(...elements) {
  const element = document.createElement("div");
  element.classList.add("d-flex", "align-items-center", "flex-row", "px-2");
  elements.forEach((e) => element.appendChild(e));
  return element;
}

function buildMessageContainer(header, messageElement, bgStyle) {
  // create message element
  const element = document.createElement("div");
  element.classList.add(
    "d-inline-flex",
    "flex-column",
    "border",
    "rounded",
    "m-2",
    "p-2",
    bgStyle,
    "bg-opacity-25"
  );
  element.appendChild(header);
  element.appendChild(messageElement);
  return element;
}

function buildLanguageTitle(language) {
  const element = document.createElement("div");
  element.textContent = language;
  element.classList.add(
    "d-inline-block",
    "bg-dark",
    "text-warning",
    "small",
    "rounded",
    "px-1",
    "mb-0"
  );
  return element;
}
