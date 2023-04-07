# Use the node image, slim version
FROM node:slim

WORKDIR /app

# Install Google Chrome Stable and fonts
# Note: this installs the necessary libs to make the browser work with Puppeteer.
RUN apt-get update && apt-get install gnupg wget -y && \
    wget --quiet --output-document=- https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor > /etc/apt/trusted.gpg.d/google-archive.gpg && \
    sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' && \
    apt-get update && \
    apt-get install google-chrome-unstable -y --no-install-recommends && \
    rm -rf /usr/include /usr/share/man && \
    rm -rf /var/cache/apk/*&& \
    rm -rf /tmp/*

# Install utils
RUN apt-get install less nano curl nmon python3 -y --no-install-recommends && \
    rm -rf /usr/include /usr/share/man && \
    rm -rf /var/cache/apk/* && \
    rm -rf /tmp/*

# Download Chrome extensions
RUN mkdir -p /app/extensions/ && \
    wget -O app/extensions/adblock.crx https://clients2.google.com/service/update2/crx?response=redirect&prodversion=111.0.5563.146&acceptformat=crx3,crx4&x=id%3Dcfhdojbkjhnklbpkdaibdccddilifddb%26uc && \
    wget -O app/extensions/nocookie.crx https://clients2.google.com/service/update2/crx?response=redirect&prodversion=111.0.5563.146&acceptformat=crx3,crx4&x=id%3Dfihnjjcciajhdojfnbdddfaoknhalnja%26uc

# Copy chrome extensions
COPY extensions/ ./extensions/

# Install redis server
RUN apt-get install redis-server -y --no-install-recommends && \
    rm -rf /usr/include /usr/share/man && \
    rm -rf /var/cache/apk/* && \
    rm -rf /tmp/*

# Prepare Wayback Proxy
COPY WaybackProxy/ ./WaybackProxy
RUN rm /app/WaybackProxy/config.json && \
    ln -s /app/config/wayback_config.json /app/WaybackProxy/config.json

# Copy Discord bot
COPY deads-discord-bot/ ./

# We don't need the standalone Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true
ENV PUPPETEER_EXECUTABLE_PATH "/usr/bin/google-chrome"

# Install npm packages
RUN npm install && \
    rm -rf /usr/include /usr/share/man && \
    rm -rf /var/cache/apk/* /var/lib/apt/lists/* && \
    rm -rf /tmp/*

# Build TypeScript to JavaScript
RUN npx tsc

# Copy Startup script
COPY startup.sh ./

VOLUME [ "/app/config" ]

EXPOSE 8888

ENTRYPOINT [ "sh" , "/app/startup.sh" ]
