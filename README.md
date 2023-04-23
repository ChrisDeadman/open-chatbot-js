# 🤖 Open Chat Bot

Chatbot based on ChatGPT 3.5 or 4 with a 'sort-of' long-term memory 🧠.

Implements the following clients:

- `terminal`: 💻 terminal based chats
- `sttts`: 🗣️ Speech-To-Text & Text-To-Speech
- `discord`: 🎮 a discord bot you can add to your server

## 📦 Dependencies

### Required

- **Redis with Redi🔍**: `docker run -p 6379:6379 redis/redis-stack`.
- 📄 Refer to [Dockerfile](Dockerfile) for OS dependencies.

### Optional

- **[GPT4All Models](data/models/README.md)**.
- **[Audio Samples](data/audio/README.md)**.
- **[Browser Extensions](data/browser_extensions/README.md)**.

## 🛠️ Configuration

Copy an example configuration from `data/settings.example.*.json` to `data/settings.json`.

## 🚀 Build and run docker image

```
docker build -t deads-inc/open-chatbot-js .
```

`<mode>` is one of the implemented clients, e.g. `terminal`.

```
docker run -it --rm --net=host -v ./data/settings.json:/app/data/settings.json -v ./data/models:/app/data/models deads-inc/open-chatbot-js <mode>
```

## 🏗️ Build locally

```
cd ./open-chatbot-js
npm install --omit=dev
npx tsc --project tsconfig.prod.json
```

## 🐞 Run/Debug locally

_see [launch.json](.vscode/launch.json)_
