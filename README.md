# 🤖 Open Chat Bot

Chatbot with a 'sort-of' long-term memory 🧠 with [Text generation web UI](https://github.com/oobabooga/text-generation-webui) and ChatGPT backend.

Implements the following clients:

- `terminal`: 💻 terminal based chats
- `sttts`: 🗣️ Speech-To-Text & Text-To-Speech
- `discord`: 🎮 a discord bot you can add to your server

## 📦 Dependencies

### Required

- **Redis with Redi🔍**: `docker run -p 6379:6379 redis/redis-stack`.
- 📄 Refer to [Dockerfile](Dockerfile) for OS dependencies.
- **[Text generation web UI](https://github.com/oobabooga/text-generation-webui)** or an OpenAI API key.

### Optional

- **[Audio Samples](data/audio/README.md)**.
- **[Browser Extensions](data/browser_extensions/README.md)**.

## 🛠️ Configuration

- **[Text generation web UI Example](data/settings.example.webui.json)**
- **[OpenAI Example](data/settings.example.openai.json)**

Copy an example configuration from `data/settings.example.*.json` to `data/settings.json`.

## 🚀 Build and run docker image

```
docker build -t deads-inc/open-chatbot-js .
```

`<mode>` is one of the implemented clients, e.g. `terminal`.

```
docker run -it --rm --net=host -v ./data/settings.json:/app/data/settings.json -v deads-inc/open-chatbot-js <mode>
```

## 🏗️ Build locally

```
cd ./open-chatbot-js
npm install --omit=dev
npx tsc --project tsconfig.prod.json
```

## 🐞 Run/Debug locally

_see [launch.json](.vscode/launch.json)_
