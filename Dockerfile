# Use the node image
FROM node:alpine

WORKDIR /app

# Install required packages
RUN apk update && \
    apk --no-cache add bash chromium g++ git make python3-dev py3-flask py3-numpy py3-pip py3-yaml ttf-freefont udev unzip vips-dev wget && \
    rm -rf /var/cache/apk/* && \
    rm -rf /usr/share/man && \
    rm -rf /tmp/*

# Download Chrome extensions
RUN mkdir -p /app/data/browser_extensions/ && \
    wget -O /tmp/adblock.crx "https://clients2.google.com/service/update2/crx?response=redirect&prodversion=112.0.5615.121&acceptformat=crx3,crx4&x=id%3Dcfhdojbkjhnklbpkdaibdccddilifddb%26uc" && \
    wget -O /tmp/nocookie.crx "https://clients2.google.com/service/update2/crx?response=redirect&prodversion=112.0.5615.121&acceptformat=crx3,crx4&x=id%3Dfihnjjcciajhdojfnbdddfaoknhalnja%26uc" && \
    unzip /tmp/adblock.crx -d /app/data/browser_extensions/adblock || true && \
    unzip /tmp/nocookie.crx -d /app/data/browser_extensions/nocookie || true && \
    rm -rf /tmp/*

# We don't need the standalone Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true
ENV PUPPETEER_EXECUTABLE_PATH "/usr/bin/chromium-browser"

# Download audio samples
RUN mkdir -p /app/data/audio/ && \
    wget -O /app/data/audio/Modular.ogg "https://github.com/akx/Notifications/blob/master/OGG/Modular.ogg" && \
    wget -O /app/data/audio/Unphased.ogg "https://github.com/akx/Notifications/blob/master/OGG/Unphased.ogg"

# Copy package.json
COPY open-chatbot-js/package.json ./

# Install npm packages
RUN npm install --omit=dev

# Copy requirements.txt
COPY gpt4all-rest/requirements.txt ./

# Install pip dependencies
RUN pip install --no-cache-dir -r ./requirements.txt && \
    rm -rf /tmp/*

# Copy chatbot
COPY open-chatbot-js/ ./

# Build TypeScript to JavaScript
RUN npx tsc --project tsconfig.prod.json

# Copy gpt4all-rest
COPY gpt4all-rest/src/ ./gpt4all-rest

# Copy Startup script
COPY startup.sh ./

VOLUME [ "/app/data/settings.json" ]

VOLUME [ "/app/data/models" ]

ENTRYPOINT [ "sh" , "/app/startup.sh" ]
