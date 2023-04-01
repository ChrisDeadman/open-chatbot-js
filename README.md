# Deads Discod Bot

Discord Chatbot based on ChatGPT 3.5.


## Build docker image

```
docker build -t deads-discord-bot .
```

## Run docker image

### Discord Mode
```
docker run -v ./config/:/app/config/ --name deads-discord-bot deads-discord-bot discord
```

### Terminal Mode
```
docker run -it -v ./config/:/app/config/ --name deads-discord-bot deads-discord-bot terminal
```
