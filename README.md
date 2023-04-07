# Deads Discod Bot

Discord Chatbot based on ChatGPT 3.5.


## Build docker image

```
docker build -t deads-discord-bot .
```

## Run docker image

### Discord Mode
```
docker run -it --rm -v ./config:/app/config/ deads-discord-bot discord
```

### Terminal Mode
```
docker run -it --rm -v ./config:/app/config/ deads-discord-bot terminal
```
