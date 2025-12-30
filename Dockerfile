# Dockerfile for AutoMobile - Android automation MCP server
# This image includes all tools needed for Android development and testing

# Use Ubuntu 24.04 as base for better package availability
FROM ubuntu:24.04

# Avoid prompts from apt
ENV DEBIAN_FRONTEND=noninteractive

# Set up environment variables for Android SDK
ENV ANDROID_HOME=/opt/android-sdk
ENV ANDROID_SDK_ROOT=/opt/android-sdk
ENV PATH=${PATH}:${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/platform-tools:${ANDROID_HOME}/build-tools/35.0.0

# Install base system dependencies
RUN apt-get update && apt-get install -y \
    # Build essentials
    build-essential \
    curl \
    wget \
    git \
    unzip \
    zip \
    tar \
    # Java 21 (required for Android build tools and ktfmt)
    openjdk-21-jdk \
    # Development tools
    ripgrep \
    shellcheck \
    xmlstarlet \
    jq \
    # Required for better-sqlite3 and other native modules
    python3 \
    python3-pip \
    make \
    g++ \
    # Android emulator dependencies (if needed)
    libgl1-mesa-dev \
    libpulse0 \
    # Utilities
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 24.x
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install ktfmt (Kotlin formatter)
ENV KTFMT_VERSION=0.55
RUN mkdir -p /opt/ktfmt \
    && curl -L -o /opt/ktfmt/ktfmt.jar \
       "https://repo1.maven.org/maven2/com/facebook/ktfmt/${KTFMT_VERSION}/ktfmt-${KTFMT_VERSION}-jar-with-dependencies.jar" \
    && printf '#!/bin/bash\njava -jar /opt/ktfmt/ktfmt.jar "$@"\n' > /usr/local/bin/ktfmt \
    && chmod +x /usr/local/bin/ktfmt

# Install lychee (link checker)
ENV LYCHEE_VERSION=0.19.1
RUN ARCH=$(uname -m) \
    && if [ "$ARCH" = "x86_64" ]; then \
         LYCHEE_ARCH="x86_64"; \
       elif [ "$ARCH" = "aarch64" ]; then \
         LYCHEE_ARCH="aarch64"; \
       else \
         echo "Unsupported architecture: $ARCH"; exit 1; \
       fi \
    && curl -L -o /tmp/lychee.tar.gz \
       "https://github.com/lycheeverse/lychee/releases/download/lychee-v${LYCHEE_VERSION}/lychee-lychee-v${LYCHEE_VERSION}-${LYCHEE_ARCH}-unknown-linux-gnu.tar.gz" \
    && tar -xzf /tmp/lychee.tar.gz -C /tmp \
    && mv /tmp/lychee /usr/local/bin/lychee \
    && chmod +x /usr/local/bin/lychee \
    && rm -rf /tmp/lychee.tar.gz

# Install Android SDK Command Line Tools
ENV ANDROID_CMDLINE_TOOLS_VERSION=11076708
RUN mkdir -p ${ANDROID_HOME}/cmdline-tools \
    && curl -L -o /tmp/commandlinetools.zip \
       "https://dl.google.com/android/repository/commandlinetools-linux-${ANDROID_CMDLINE_TOOLS_VERSION}_latest.zip" \
    && unzip -q /tmp/commandlinetools.zip -d /tmp/cmdline-tools \
    && mv /tmp/cmdline-tools/cmdline-tools ${ANDROID_HOME}/cmdline-tools/latest \
    && rm -rf /tmp/commandlinetools.zip /tmp/cmdline-tools

# Accept Android SDK licenses
RUN yes | sdkmanager --licenses || true

# Install Android SDK components
# Based on libs.versions.toml: compileSdk=36, buildTools=35.0.0, targetSdk=36
RUN sdkmanager --install \
    "platform-tools" \
    "platforms;android-36" \
    "build-tools;35.0.0" \
    "cmdline-tools;latest" \
    "emulator" \
    "system-images;android-36;google_apis;x86_64" \
    && sdkmanager --update

# Set working directory
WORKDIR /workspace

# Copy package files first for better caching
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci

# Copy the rest of the application
COPY . .

# Build the application
RUN npm run build

# Create a non-root user for running the application
RUN useradd -m -u 1000 automobile \
    && chown -R automobile:automobile /workspace \
    && mkdir -p /home/automobile/.android \
    && chown -R automobile:automobile /home/automobile/.android

# Switch to non-root user
USER automobile

# Verify installations
RUN node --version \
    && npm --version \
    && java -version \
    && adb version \
    && sdkmanager --list_installed \
    && rg --version \
    && ktfmt --version || echo "ktfmt installed" \
    && lychee --version \
    && shellcheck --version \
    && xmlstarlet --version

# Install tini for proper signal handling (PID 1 problem)
# This is critical for stdio-based MCP servers
USER root
RUN curl -L -o /usr/local/bin/tini https://github.com/krallin/tini/releases/download/v0.19.0/tini-amd64 \
    && chmod +x /usr/local/bin/tini
USER automobile

# Entrypoint for proper signal handling
ENTRYPOINT ["/usr/local/bin/tini", "--"]

# Default command - Run MCP server in stdio mode (default)
# For other transports, override with: docker run ... npm run dev:sse
CMD ["node", "dist/src/index.js"]
