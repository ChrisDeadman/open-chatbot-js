# Use the node image
FROM node:latest

WORKDIR /app

# Install required packages
RUN export DEBIAN_FRONTEND="noninteractive" && \
    apt update && \
    apt install -y \
        bash chromium curl cython3 fonts-noto fonts-freefont-ttf git graphviz libopenblas-base openssl \
        python3-freetype python3-numpy python3-pip python3-scipy python3-setuptools python3-wheel python3-yaml \
        udev unzip wget && \
    apt autoclean && \
    apt clean && \
    rm -rf /root/.cache && \
    rm -rf /root/.[acpw]* && \
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
ENV PUPPETEER_EXECUTABLE_PATH "/usr/bin/chromium"

# Download audio samples
RUN mkdir -p /app/data/audio/ && \
    wget -O /app/data/audio/Modular.ogg "https://github.com/akx/Notifications/blob/master/OGG/Modular.ogg" && \
    wget -O /app/data/audio/Unphased.ogg "https://github.com/akx/Notifications/blob/master/OGG/Unphased.ogg"

# Copy package.json
COPY open-chatbot-js/package.json ./

# Copy requirements.txt
COPY utils/requirements.txt ./utils/

# install python/npm packages
RUN export DEBIAN_FRONTEND="noninteractive" && \
    export DEV_PACKAGES="build-essential cargo cmake make g++ gfortran rustc libfreetype-dev libffi-dev libjpeg-dev libopenblas-dev libpng-dev libstdc++-10-dev libvips-dev python3-dev" && \
    apt install -y $DEV_PACKAGES && \
    pip install --no-cache-dir -r ./utils/requirements.txt --extra-index-url https://download.pytorch.org/whl/cpu && \
    npm install --omit=dev && \
    apt purge -y $DEV_PACKAGES && \
    apt autoclean && \
    apt clean && \
    rm -rf /root/.cache && \
    rm -rf /root/.[acpw]* && \
    rm -rf /usr/share/man && \
    rm -rf /tmp/*

# Copy utils
COPY utils/ ./utils/

# Copy chatbot
COPY open-chatbot-js/ ./

# Build TypeScript to JavaScript
RUN npx tsc --project tsconfig.prod.json

# Copy Startup script
COPY startup.sh ./

VOLUME [ "/app/data/persistent/" ]

ENTRYPOINT [ "sh" , "/app/startup.sh" ]
