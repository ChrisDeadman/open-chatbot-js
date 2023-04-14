# Use the node image
FROM node:alpine

WORKDIR /app

# Download Chrome extensions
RUN mkdir -p /app/extensions/ && \
    wget -O app/extensions/adblock.crx https://clients2.google.com/service/update2/crx?response=redirect&prodversion=111.0.5563.146&acceptformat=crx3,crx4&x=id%3Dcfhdojbkjhnklbpkdaibdccddilifddb%26uc && \
    wget -O app/extensions/nocookie.crx https://clients2.google.com/service/update2/crx?response=redirect&prodversion=111.0.5563.146&acceptformat=crx3,crx4&x=id%3Dfihnjjcciajhdojfnbdddfaoknhalnja%26uc

# Install required packages
RUN apk update && \
    apk --no-cache add bash chromium g++ git make python3-dev  py3-pip ttf-freefont udev vips-dev wget && \
    rm -rf /var/cache/apk/* && \
    rm -rf /usr/share/man && \
    rm -rf /tmp/*

# We don't need the standalone Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true
ENV PUPPETEER_EXECUTABLE_PATH "/usr/bin/chromium-browser"

# Copy package.json
COPY deads-discord-bot/package.json ./

# Install npm packages
RUN npm install --omit=dev

# Copy Discord bot
COPY deads-discord-bot/ ./

# Build TypeScript to JavaScript
RUN npx tsc --project tsconfig.prod.json

# Copy Startup script
COPY startup.sh ./

VOLUME [ "/app/config" ]

ENTRYPOINT [ "sh" , "/app/startup.sh" ]
