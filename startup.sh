#!/bin/sh

# start GPT4All REST service
python3 gpt4all-rest/gpt4all-rest.py&
sleep 5

# start chatbot
NODE_ENV=production node dist/index.js $@
