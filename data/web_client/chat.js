const socket = io();
const messages = document.getElementById("messages");
const settingsForm = document.getElementById("settingsForm");
const promptForm = document.getElementById("promptForm");
const messageForm = document.getElementById("messageForm");
const userInput = document.getElementById("userInput");

let typing = false;

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
  socket.emit("update settings", formToJson(settingsForm));
  // reset display values to match sliders
  Array.from(document.querySelectorAll('input[type="range"]')).forEach(
    updateDisplayField
  );
});

// Add event listener to update slider display values
Array.from(document.querySelectorAll('input[type="range"]')).forEach(function (
  slider
) {
  slider.addEventListener("input", function (e) {
    updateDisplayField(e.target);
  });
});

function updateDisplayField(target) {
  const displayFieldId = target.getAttribute("data-display");
  if (displayFieldId) {
    const displayField = document.getElementById(displayFieldId);
    if (displayField) {
      displayField.value = target.value;
    }
  }
}

promptForm.addEventListener("submit", function (e) {
  e.preventDefault();
  socket.emit("update settings", formToJson(promptForm));
});

messageForm.addEventListener("submit", function (e) {
  e.preventDefault();
  if (userInput.innerText) {
    hideTypingIndicator();

    const bgStyle =
      messages.children.length % 2 == 0 ? "bg-secondary" : "bg-primary";

    addMessage(
      buildMessageContainer(
        buildMessageHeader(
          buildMessageIcon("fa-solid", "fa-user"),
          buildMessageSender(document.getElementById("username").value, bgStyle)
        ),
        buildMessageElement(userInput.innerText),
        bgStyle
      )
    );

    if (typing) {
      showTypingIndicator();
    }

    socket.emit(
      "chat message",
      document.getElementById("username").value,
      userInput.innerText
    );
    userInput.innerText = "";
  }
});

userInput.addEventListener("keydown", function (e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    messageForm.dispatchEvent(new Event("submit"));
  }
});

socket.on("chat message", function (sender, message) {
  const botname = document.getElementById("bot_name").value;
  var iconClass;
  switch (sender) {
    case botname:
      iconClass = "fa-robot";
      break;
    case "system":
      iconClass = "fa-wrench";
      break;
    default:
      iconClass = "fa-user-secret";
      break;
  }

  hideTypingIndicator();

  const bgStyle =
    messages.children.length % 2 == 0 ? "bg-secondary" : "bg-primary";

  addMessage(
    buildMessageContainer(
      buildMessageHeader(
        buildMessageIcon("fa-solid", iconClass),
        buildMessageSender(sender, bgStyle)
      ),
      buildMessageElement(message),
      bgStyle
    )
  );

  if (typing) {
    showTypingIndicator();
  }
});

socket.on("typing", function () {
  typing = true;
  showTypingIndicator();
});

socket.on("stop typing", function () {
  typing = false;
  hideTypingIndicator();
});

function showTypingIndicator() {
  const scroll = shouldScroll(messages, 1);
  messages.scrollHeight - (messages.scrollTop + messages.clientHeight) < 100;
  if (messages.children.length % 2 == 0) {
    typingIndicator.classList.remove("bg-primary");
    typingIndicator.classList.add("bg-secondary");
  } else {
    typingIndicator.classList.remove("bg-secondary");
    typingIndicator.classList.add("bg-primary");
  }
  if (!messages.contains(typingIndicator)) {
    messages.appendChild(typingIndicator);
  }
  if (scroll) {
    messages.scrollTop = messages.scrollHeight;
  }
}

function hideTypingIndicator() {
  if (messages.contains(typingIndicator)) {
    messages.removeChild(typingIndicator);
  }
}

function addMessage(messageContainer) {
  const scroll = shouldScroll(messages, 1);
  messages.appendChild(messageContainer);
  if (scroll) {
    messages.scrollTop = messages.scrollHeight;
  }
}

function shouldScroll(element, stepsFromBottom) {
  let totalSteps = 20;
  let stepSize = element.scrollHeight / totalSteps;
  let stepsAway =
    (element.scrollHeight - (element.scrollTop + element.clientHeight)) /
    stepSize;
  return stepsAway < stepsFromBottom;
}

function buildMessageElement(messageText) {
  // ensure code blocks always start at a new line and end with a newline
  messageText = messageText
    .replaceAll(/(?<=[\p{P}\s]+)\s*[`]{2,}(\w+)\s*/gu, "\n```$1\n")
    .replaceAll(/(?<![\t\f\v\r ]+)\n*[`]{2,}(?!\`|\w|\s*\n)/gm, "\n\`\`\`\n");

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

function formToJson(form) {
  return Array.from(form.elements)
    .filter((el) => el.id) // Exclude elements without id
    .reduce((acc, el) => {
      const keys = el.id.split("."); // Split keys by '.'
      let currentLevel = acc; // Start at top level of the settings object

      // Loop through all keys except the last one
      for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];

        // If key does not exist yet, create an empty object
        if (!currentLevel[key]) {
          currentLevel[key] = {};
        }

        // Move to the next level
        currentLevel = currentLevel[key];
      }

      let value;
      if (el.tagName === "TEXTAREA") {
        // Text areas are converted to a list of lines
        value = el.value.split("\n");
      } else if (el.type === "number" || el.type === "range") {
        // Numbers are parsed as float
        value = parseFloat(el.value);
      } else {
        // Strings stay as they are
        value = el.value;
      }
      
      // Set the value at the deepest level
      currentLevel[keys[keys.length - 1]] = value;

      return acc;
    }, {});
}
