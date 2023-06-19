const messages = document.getElementById("messages");
const messageForm = document.getElementById("messageForm");
const usernameInput = document.getElementById("usernameInput");
const userInput = document.getElementById("userInput");
const resetButton = document.getElementById("resetButton");
const addBotButton = document.getElementById("addBotButton");
const botList = document.getElementById("botList");

const settingsModal = document.getElementById("settingsModal");
const settingsForm = document.getElementById("settingsForm");

const addBotModal = document.getElementById("addBotModal");
const addBotForm = document.getElementById("addBotForm");
const backendDropdown = document.getElementById("backendDropdown");
const backendDropdownButton = document.getElementById("backendDropdownButton");
const turnTemplateDropdown = document.getElementById("turnTemplateDropdown");
const turnTemplateDropdownButton = document.getElementById("turnTemplateDropdownButton");
const characterDropdown = document.getElementById("characterDropdown");
const characterDropdownButton = document.getElementById("characterDropdownButton");

// Initialize connection to backend
const socket = io();
socket.emit("ready");

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

const typingContainer = document.createElement("div", "mb-2");
typingContainer.classList.add("d-flex", "flex-row", "align-items-center");

const typingMessage = document.createElement("p");
typingMessage.classList.add("fst-italic", "mx-1");
typingContainer.appendChild(typingMessage);

const typingSpinner = buildTypingIndicator();
typingContainer.appendChild(typingSpinner);

const typingIndicator = buildMessageContainer(
  buildMessageHeader(buildMessageIcon("fa-solid", "fa-robot"), typingContainer),
  document.createElement("div"),
  "bg-secondary"
);

settingsModal.addEventListener("hide.bs.modal", () => {
  settingsForm.dispatchEvent(new Event("submit"));
});

settingsForm.addEventListener("submit", function (e) {
  e.preventDefault();
  socket.emit("update bot", formToJson(settingsForm));
});

// Add event listener to update slider display values
Array.from(document.querySelectorAll('input[type="range"]')).forEach(function (slider) {
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

messageForm.addEventListener("submit", function (e) {
  e.preventDefault();
  if (userInput.innerText) {
    socket.emit("chat message", usernameInput.value, userInput.innerText);
    userInput.innerText = "";
  }
});

userInput.addEventListener("keydown", function (e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    messageForm.dispatchEvent(new Event("submit"));
  }
});

resetButton.addEventListener("click", function (e) {
  e.preventDefault();
  socket.emit("reset");
});

usernameInput.addEventListener("blur", function (e) {
  e.preventDefault();
  socket.emit("update username", usernameInput.value);
});

addBotButton.addEventListener("click", () => {
  socket.emit("new bot");
});

addBotForm.addEventListener("submit", function (e) {
  e.preventDefault();
  socket.emit("add bot", {
    backend: backendDropdownButton.textContent,
    turnTemplate: turnTemplateDropdownButton.textContent,
    character: characterDropdownButton.textContent,
  });
});

document.addEventListener("click", (event) => {
  // Attach the event listener for all delete bot buttons
  if (event.target.matches(".delete-bot") || event.target.parentElement?.matches(".delete-bot")) {
    const targetBtn = event.target.matches(".delete-bot")
      ? event.target
      : event.target.parentElement;

    const botElement = targetBtn.closest(".bot-element");
    const botName = botElement.querySelector(".badge").innerText;

    // Emit the delete bot event
    socket.emit("delete bot", botName);
    return;
  }

  // Attach the event listener for all edit bot buttons
  if (event.target.matches(".edit-bot") || event.target.parentElement?.matches(".edit-bot")) {
    const targetBtn = event.target.matches(".edit-bot") ? event.target : event.target.parentElement;

    const botElement = targetBtn.closest(".bot-element");
    const botName = botElement.querySelector(".badge").innerText;

    // Emit the edit bot event
    socket.emit("edit bot", botName);
    return;
  }
});

// Listen for new bot event to receive .json files
socket.on("new bot", (files) => {
  const updateDropdown = (dd, ddButton, options) => {
    dd.innerHTML = "";
    options.forEach((option) => {
      let listItem = document.createElement("li");
      let anchor = document.createElement("a");
      anchor.classList.add("dropdown-item");
      anchor.href = "#";
      anchor.innerHTML = option;
      anchor.addEventListener("click", function () {
        ddButton.textContent = option;
      });
      listItem.appendChild(anchor);
      dd.appendChild(listItem);
    });
  };

  updateDropdown(backendDropdown, backendDropdownButton, files.backends);
  updateDropdown(turnTemplateDropdown, turnTemplateDropdownButton, files.turnTemplates);
  updateDropdown(characterDropdown, characterDropdownButton, files.characters);

  // Show the modal
  new bootstrap.Modal(addBotModal).show();
});

// Listen for 'reset' event to clear conversation
socket.on("reset", () => {
  while (messages.firstChild) {
    messages.removeChild(messages.firstChild);
  }
});

// Listen for 'add bot' event
socket.on("add bot", (botName) => {
  // Skip if the bot element already exists
  const id = getBotElementId(botName);
  if (document.getElementById(getBotElementId(botName))) {
    return;
  }

  // Create new bot element
  const botElement = document.createElement("div");
  botElement.id = id;
  botElement.classList.add(
    "nav-item",
    "h4",
    "bot-element",
    "bg-success",
    "position-relative",
    "d-flex",
    "rounded",
    "border",
    "flex-row",
    "flex-grow-0",
    "align-items-center",
    "bg-opacity-25",
    "mx-1",
    "my-0"
  );

  // Create settings button (hidden by default)
  const settingsButton = document.createElement("button");
  settingsButton.classList.add(
    "btn",
    "btn-warning",
    "edit-bot",
    "position-absolute",
    "start-0",
    "invisible"
  );
  const cogIcon = document.createElement("i");
  cogIcon.classList.add("fa-solid", "fa-cog", "p-0");
  settingsButton.appendChild(cogIcon);
  botElement.appendChild(settingsButton);

  // Create bot name label
  const botLabel = document.createElement("span");
  botLabel.classList.add("badge", "flex-grow-1");
  botLabel.innerText = botName;
  botElement.appendChild(botLabel);

  // Create delete button (hidden by default)
  const deleteButton = document.createElement("button");
  deleteButton.classList.add(
    "btn",
    "btn-danger",
    "delete-bot",
    "position-absolute",
    "end-0",
    "invisible"
  );
  const deleteIcon = document.createElement("i");
  deleteIcon.classList.add("fa-solid", "fa-x", "p-0");
  deleteButton.appendChild(deleteIcon);
  botElement.appendChild(deleteButton);

  botList.prepend(botElement);
});

// Listen for 'edit bot' event
socket.on("edit bot", (settings) => {
  // Fill the form
  jsonToForm(settings, settingsForm);
  // Set display values to match sliders
  Array.from(document.querySelectorAll('input[type="range"]')).forEach(updateDisplayField);
  // Show the modal
  new bootstrap.Modal(settingsModal).show();
});

// Listen for 'delete bot' event to remove bot name
socket.on("delete bot", (botName) => {
  document.getElementById(getBotElementId(botName))?.remove();
});

socket.on("chat message", function (sender, message) {
  var iconClass;
  switch (sender) {
    case usernameInput.value:
      iconClass = "fa-user";
      break;
    case "system":
      iconClass = "fa-wrench";
      break;
    default:
      iconClass = "fa-robot";
      break;
  }

  hideTypingIndicator();

  const bgStyle = messages.children.length % 2 == 0 ? "bg-secondary" : "bg-primary";

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

  if (typingMessage.textContent.length > 0) {
    showTypingIndicator();
  }
});

socket.on("typing", function (message) {
  typingMessage.textContent = message;
  showTypingIndicator();
});

socket.on("stop typing", function () {
  typingMessage.textContent = "";
  hideTypingIndicator();
});

function showTypingIndicator() {
  const scroll = shouldScroll(messages, 1);
  const indicatorShown = messages.contains(typingIndicator);
  const numMessages = messages.children.length;
  if ((numMessages + (indicatorShown ? 0 : 1)) % 2 === 0) {
    typingIndicator.classList.remove("bg-secondary");
    typingIndicator.classList.add("bg-primary");
  } else {
    typingIndicator.classList.remove("bg-primary");
    typingIndicator.classList.add("bg-secondary");
  }
  if (!indicatorShown) {
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

function getBotElementId(botname) {
  let id = `botElement${botname}`.replace(/\W/g, "_");
  return id.charAt(0).match(/[\d_]/g)?.length ? `id_${id}` : id;
}

function shouldScroll(element, stepsFromBottom) {
  let totalSteps = 20;
  let stepSize = element.scrollHeight / totalSteps;
  let stepsAway = (element.scrollHeight - (element.scrollTop + element.clientHeight)) / stepSize;
  return stepsAway < stepsFromBottom;
}

function buildMessageElement(messageText) {
  // ensure code blocks always start at a new line and end with a newline
  messageText = messageText
    .replaceAll(/(?<=[\p{P}\s]+)\s*[`]{2,}(\w+)\s*/gu, "\n```$1\n")
    .replaceAll(/(?<![\t\f\v\r ]+)\n*[`]{2,}(?!\`|\w|\s*\n)/gm, "\n```\n");

  // parse message as markdown
  const element = document.createElement("div");
  element.classList.add("px-3", "pt-2");
  element.innerHTML = marked.parse(messageText);

  // find all code elements and prepend language title
  element.querySelectorAll("code").forEach(function (code) {
    code.classList.add("hljs", "rounded");
    const languageClass = Array.from(code.classList).find((cls) => cls.startsWith("language-"));
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
  const element = document.createElement("div");
  const spinner = document.createElement("i");
  spinner.classList.add("fa-solid", "fa-spinner", "fa-spin", "ms-1");
  element.appendChild(spinner);
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
  element.classList.add("rounded", "flex-shrink-0", "ms-1", "px-2", bgStyle, "bg-opacity-50");
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
        // String special chars are converted
        value = String(el.value).replaceAll("\\r", "\r").replaceAll("\\n", "\n");
      }

      // Set the value at the deepest level
      currentLevel[keys[keys.length - 1]] = value;

      return acc;
    }, {});
}

function jsonToForm(json, form) {
  // Flatten the json object into a key-value pair where key is a string of nested keys
  function flattenObj(obj, prefix = "", res = {}) {
    for (const k in obj) {
      const pre = prefix.length ? prefix + "." : "";
      if (typeof obj[k] === "object" && !Array.isArray(obj[k])) flattenObj(obj[k], pre + k, res);
      else res[pre + k] = obj[k];
    }
    return res;
  }
  const flatJson = flattenObj(json);

  // Loop through all form elements
  Array.from(form.elements).forEach((el) => {
    if (!el.id) {
      return;
    }
    // If element has an id and id exists in json
    if (el.id in flatJson) {
      if (el.tagName === "TEXTAREA") {
        // If textarea, join the array elements into a string with '\n'
        el.value = Array.isArray(flatJson[el.id]) ? flatJson[el.id].join("\n") : flatJson[el.id];
      } else if (el.type === "number" || el.type === "range") {
        // If number or range, parse the value to a float
        el.value = parseFloat(flatJson[el.id]);
      } else {
        // String special chars are converted
        el.value = String(flatJson[el.id]).replaceAll("\r", "\\r").replaceAll("\n", "\\n");
      }
      // make the element visible
      const group = el.closest(".form-group");
      if (group) {
        group.style.display = "";
      }
    } else {
      if (!el.id.endsWith("_display")) {
        // hide the element if it does not exist in the json object
        const group = el.closest(".form-group");
        if (group) {
          group.style.setProperty("display", "none", "important");
        }
      }
    }
  });
}
