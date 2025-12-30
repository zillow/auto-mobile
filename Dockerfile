# ==============================================================================
# VERSION PINNING STRATEGY
# ==============================================================================
# This Dockerfile pins specific versions for reproducibility and security.
# Versions should be updated periodically by checking the following sources:
#
# - Node.js: https://nodejs.org/en/about/previous-releases (LTS versions)
# - ktfmt: https://github.com/facebook/ktfmt/releases
# - lychee: https://github.com/lycheeverse/lychee/releases
# - tini: https://github.com/krallin/tini/releases
# - Android SDK cmdline-tools: https://developer.android.com/studio#command-line-tools-only
# - Android SDK components: Versions based on android/libs.versions.toml
#
# When updating versions, also update any associated checksums for security.
# ==============================================================================
#
# PLATFORM SUPPORT: x86_64 ONLY
# Android SDK and tools are only available for x86_64 architecture.
# This image will NOT work on ARM64 (Apple Silicon, ARM servers, etc.)
# ==============================================================================

# ==============================================================================
# BUILDER STAGE - Contains all build-time dependencies
# ==============================================================================
FROM --platform=linux/amd64 ubuntu:24.04 AS builder

# Metadata labels for Docker Hub
LABEL org.opencontainers.image.title="AutoMobile" \
      org.opencontainers.image.description="Android automation MCP server with ADB (x86_64 only)" \
      org.opencontainers.image.vendor="kaeawc" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.source="https://github.com/kaeawc/auto-mobile" \
      org.opencontainers.image.documentation="https://github.com/kaeawc/auto-mobile/blob/main/DOCKER.md" \
      org.opencontainers.image.platform="linux/amd64" \
      platform.architecture="x86_64-only" \
      platform.note="Android SDK requires x86_64; ARM64 not supported"

# Avoid prompts from apt
ENV DEBIAN_FRONTEND=noninteractive

# Set up environment variables for Android SDK
ENV ANDROID_HOME=/opt/android-sdk
ENV ANDROID_SDK_ROOT=/opt/android-sdk
ENV PATH=${PATH}:${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/platform-tools:${ANDROID_HOME}/build-tools/35.0.0

# Use bash with pipefail for better error handling
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Install base system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
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
# Check for updates: https://nodejs.org/en/about/previous-releases
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install ktfmt (Kotlin formatter)
# Check for updates: https://github.com/facebook/ktfmt/releases
ENV KTFMT_VERSION=0.55
RUN mkdir -p /opt/ktfmt \
    && curl -L -o /opt/ktfmt/ktfmt.jar \
       "https://repo1.maven.org/maven2/com/facebook/ktfmt/${KTFMT_VERSION}/ktfmt-${KTFMT_VERSION}-jar-with-dependencies.jar" \
    && printf '#!/bin/bash\njava -jar /opt/ktfmt/ktfmt.jar "$@"\n' > /usr/local/bin/ktfmt \
    && chmod +x /usr/local/bin/ktfmt

# Install lychee (link checker)
# Check for updates: https://github.com/lycheeverse/lychee/releases
ENV LYCHEE_VERSION=0.19.1
RUN curl -L -o /tmp/lychee.tar.gz \
       "https://github.com/lycheeverse/lychee/releases/download/lychee-v${LYCHEE_VERSION}/lychee-x86_64-unknown-linux-gnu.tar.gz" \
    && tar -xzf /tmp/lychee.tar.gz -C /tmp \
    && mv /tmp/lychee /usr/local/bin/lychee \
    && chmod +x /usr/local/bin/lychee \
    && rm -rf /tmp/lychee.tar.gz

# Install Android SDK Command Line Tools
# Check for updates: https://developer.android.com/studio#command-line-tools-only
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
# Versions based on android/libs.versions.toml: compileSdk=36, buildTools=35.0.0, targetSdk=36
# Check for updates: Review android/libs.versions.toml and https://developer.android.com/tools/releases/platforms
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

# ==============================================================================
# RUNTIME STAGE - Minimal image with only runtime dependencies
# ==============================================================================
FROM --platform=linux/amd64 ubuntu:24.04 AS runtime

# Avoid prompts from apt
ENV DEBIAN_FRONTEND=noninteractive

# Set up environment variables for Android SDK
ENV ANDROID_HOME=/opt/android-sdk
ENV ANDROID_SDK_ROOT=/opt/android-sdk
ENV PATH=${PATH}:${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/platform-tools:${ANDROID_HOME}/build-tools/35.0.0

# Use bash with pipefail for better error handling
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Install runtime dependencies only (no build tools)
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Node.js runtime dependencies
    curl \
    ca-certificates \
    # Java 21 runtime (required for Android tools and ktfmt)
    openjdk-21-jre-headless \
    # Runtime utilities
    ripgrep \
    shellcheck \
    xmlstarlet \
    jq \
    # Android emulator dependencies (if needed at runtime)
    libgl1-mesa-dev \
    libpulse0 \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 24.x
# Check for updates: https://nodejs.org/en/about/previous-releases
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Copy Android SDK from builder (needed for ADB at runtime)
COPY --from=builder /opt/android-sdk /opt/android-sdk

# Copy ktfmt from builder
COPY --from=builder /opt/ktfmt /opt/ktfmt
COPY --from=builder /usr/local/bin/ktfmt /usr/local/bin/ktfmt

# Copy lychee from builder
COPY --from=builder /usr/local/bin/lychee /usr/local/bin/lychee

# Set working directory
WORKDIR /workspace

# Copy package files and node_modules from builder
COPY --from=builder /workspace/package*.json ./
COPY --from=builder /workspace/node_modules ./node_modules

# Copy built application from builder
COPY --from=builder /workspace/dist ./dist

# Copy other necessary files (configs, etc.)
COPY --from=builder /workspace/tsconfig.json ./tsconfig.json

# Install tini for proper signal handling (PID 1 problem)
# This is critical for stdio-based MCP servers
# Check for updates: https://github.com/krallin/tini/releases
ENV TINI_VERSION=v0.19.0
ENV TINI_SHA256=c5b0666b4cb676901f90dfcb37106783c5fe2077b04590973b885950611b30ee
RUN curl -L -o /usr/local/bin/tini "https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini-static-amd64" \
    && echo "${TINI_SHA256} /usr/local/bin/tini" | sha256sum -c - \
    && chmod +x /usr/local/bin/tini

# Create a non-root user for running the application
RUN useradd -m automobile \
    && chown -R automobile:automobile /workspace \
    && mkdir -p /home/automobile/.android \
    && chown -R automobile:automobile /home/automobile/.android

# Switch to non-root user
USER automobile

# Verify runtime installations
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

# Entrypoint for proper signal handling
ENTRYPOINT ["/usr/local/bin/tini", "--"]

# Default command - Run MCP server in stdio mode (default)
# For other transports, override with: docker run ... npm run dev:sse
CMD ["node", "dist/src/index.js"]
