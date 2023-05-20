FROM python:3.11

WORKDIR /app

# enable non-free component of Debian repository
RUN sed -i '/^deb/ s/$/ non-free/' /etc/apt/sources.list && \
    sed -i '/^deb-src/ s/$/ non-free/' /etc/apt/sources.list

# install system packages
RUN apt update && \
    apt dist-upgrade -y && \
    apt install -y git curl hydra sudo nikto nmap sqlmap wget zip unzip -y --no-install-recommends && \
    rm -rf /tmp/*

# install python packages
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir beautifulsoup4 imageio matplotlib numpy pandas openai requests wikipedia && \
    rm -rf /tmp/*

COPY app.py ./

WORKDIR /data

VOLUME [ "/data" ]

CMD ["python", "/app/app.py"]
