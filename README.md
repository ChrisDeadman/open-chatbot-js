# Deads Discod Bot

Discord Chatbot based on ChatGPT 3.5 with long-term memory.


## Build docker image

```
docker build -t deads-discord-bot .
```

## Run docker image

**Discord Mode**:

```
docker run -it --rm --net=host -v ./config:/app/config/ deads-discord-bot discord
```

**Terminal Mode**:

```
docker run -it --rm --net=host -v ./config:/app/config/ deads-discord-bot terminal
```

## Dependencies

### Redis with RedisSearch

```
docker run -p 6379:6379 redis/redis-stack
```
