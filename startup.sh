#!/bin/sh

(cd WaybackProxy && python3 ./waybackproxy.py&)
sleep 3

node index.js $@
