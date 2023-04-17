# Use the node image
FROM node:alpine

WORKDIR /app

# Install required packages
RUN apk update && \
    apk --no-cache add bash chromium g++ git make python3-dev py3-pip ttf-freefont udev unzip vips-dev wget && \
    rm -rf /var/cache/apk/* && \
    rm -rf /usr/share/man && \
    rm -rf /tmp/*

# Download Chrome extensions
RUN mkdir -p /app/extensions/ && \
    wget -O /tmp/adblock.crx "https://clients2.google.com/service/update2/crx?response=redirect&prodversion=112.0.5615.121&acceptformat=crx3,crx4&x=id%3Dcfhdojbkjhnklbpkdaibdccddilifddb%26uc" && \
    wget -O /tmp/nocookie.crx "https://clients2.google.com/service/update2/crx?response=redirect&prodversion=112.0.5615.121&acceptformat=crx3,crx4&x=id%3Dfihnjjcciajhdojfnbdddfaoknhalnja%26uc" && \
    unzip /tmp/adblock.crx -d /app/extensions/adblock || true && \
    unzip /tmp/nocookie.crx -d /app/extensions/nocookie || true && \
    rm -rf /tmp/*

# We don't need the standalone Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true
ENV PUPPETEER_EXECUTABLE_PATH "/usr/bin/chromium-browser"

# Copy package.json
COPY open-chatbot-js/package.json ./

# Install npm packages
RUN npm install --omit=dev

# Copy chatbot
COPY open-chatbot-js/ ./

# Build TypeScript to JavaScript
RUN npx tsc --project tsconfig.prod.json

# Copy Startup script
COPY startup.sh ./

VOLUME [ "/app/config" ]

ENTRYPOINT [ "sh" , "/app/startup.sh" ]
