#!/bin/sh

# start redis server
redis-server &

# start wayback proxy
(cd WaybackProxy && python3 ./waybackproxy.py&)

# wait until services started up
sleep 3

# start discord bot
node dist/index.js $@
