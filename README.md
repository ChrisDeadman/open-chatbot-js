# 🤖 Open Chat Bot

Chatbot based on ChatGPT 3.5 or 4 with a 'sort-of' long-term memory 🧠.

Implements the following clients:

- `terminal`: 💻 terminal based chats
- `sttts`: 🗣️ Speech-To-Text & Text-To-Speech
- `discord`: 🎮 a discord bot you can add to your server

## 📦 Dependencies

- **Redis with Redi🔍**: `docker run -p 6379:6379 redis/redis-stack`
- _For rest of dependencies see `Dockerfile` 📄._

## 🛠️ Build docker image

```
docker build -t deads-inc/open-chatbot-js .
```

## 🚀 Run docker image

`<mode>` is one of the implemented clients, e.g. `terminal`.

```
docker run -it --rm --net=host -v ./config:/app/config/ deads-inc/open-chatbot-js <mode>
```

## 🏗️ Build locally

```
cd ./open-chatbot-js
npm install --omit=dev
npx tsc --project tsconfig.prod.json
```

## ▶️ Run/Debug locally

_see `.vscode/launch.json` 🐞_
