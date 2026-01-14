# ==============================================================================
# VERSION PINNING STRATEGY
# ==============================================================================
# This Dockerfile pins specific versions for reproducibility and security.
# Versions should be updated periodically by checking the following sources:
#
# - Azul Zulu JDK: https://hub.docker.com/r/azul/zulu-openjdk-alpine
# - Bun: https://github.com/oven-sh/bun/releases
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

ARG ZULU_VERSION=21.0.2
ARG PLATFORM=linux/amd64
ARG BUN_VERSION=1.3.6
ARG KTFMT_VERSION=0.55
ARG LYCHEE_VERSION=0.19.1
ARG ANDROID_CMDLINE_TOOLS_VERSION=11076708
ARG ANDROID_PLATFORM_VERSION=36
ARG ANDROID_BUILD_TOOLS_VERSION=35.0.0
ARG ANDROID_INSTALL_EMULATOR=false
ARG ANDROID_EMULATOR_API_LEVEL=36
ARG ANDROID_SYSTEM_IMAGE_VARIANT=google_apis
ARG ANDROID_SYSTEM_IMAGE_ARCH=x86_64
ARG TINI_VERSION=v0.19.0
ARG TINI_SHA256=c5b0666b4cb676901f90dfcb37106783c5fe2077b04590973b885950611b30ee

# ==============================================================================
# BASE STAGE - Shared runtime dependencies and environment
# ==============================================================================
FROM --platform=${PLATFORM} azul/zulu-openjdk-alpine:${ZULU_VERSION} AS base

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

ARG ANDROID_BUILD_TOOLS_VERSION

# Set environment
ENV TERM=dumb
ENV PAGER=cat

# Set up environment variables for Android SDK
ENV ANDROID_HOME=/opt/android-sdk
ENV ANDROID_SDK_ROOT=/opt/android-sdk
ENV ANDROID_BUILD_TOOLS_VERSION=${ANDROID_BUILD_TOOLS_VERSION}
ENV PATH=${PATH}:${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/platform-tools:${ANDROID_HOME}/build-tools/${ANDROID_BUILD_TOOLS_VERSION}

# Install runtime dependencies only (no build tools)
RUN apk add --no-cache \
    bash \
    ca-certificates \
    gcompat \
    jemalloc \
    libstdc++ \
    libgcc \
    jq \
    ripgrep \
    shellcheck \
    xmlstarlet \
    git

# Now that bash is installed, set it as the default shell
SHELL ["/bin/bash", "-exo", "pipefail", "-c"]

# ==============================================================================
# BUILDER STAGE - Contains all build-time dependencies
# ==============================================================================
FROM base AS builder

ARG BUN_VERSION
ARG KTFMT_VERSION
ARG LYCHEE_VERSION
ARG ANDROID_CMDLINE_TOOLS_VERSION
ARG ANDROID_PLATFORM_VERSION
ARG ANDROID_BUILD_TOOLS_VERSION
ARG ANDROID_INSTALL_EMULATOR
ARG ANDROID_EMULATOR_API_LEVEL
ARG ANDROID_SYSTEM_IMAGE_VARIANT
ARG ANDROID_SYSTEM_IMAGE_ARCH
ARG TINI_VERSION
ARG TINI_SHA256

# Use bash for pipefail support in build steps
SHELL ["/bin/bash", "-exo", "pipefail", "-c"]

# Install build-time dependencies
RUN apk add --no-cache \
    curl \
    unzip \
    tar \
    gzip

# Install Bun - all-in-one JavaScript runtime and package manager
# Check for updates: https://github.com/oven-sh/bun/releases
RUN curl -fsSL "https://bun.sh/install" | bash -s "bun-v${BUN_VERSION}" \
    && mv /root/.bun/bin/bun /usr/local/bin/bun \
    && chmod +x /usr/local/bin/bun \
    && rm -rf /root/.bun

# Install ktfmt (Kotlin formatter)
# Check for updates: https://github.com/facebook/ktfmt/releases
RUN mkdir -p /opt/ktfmt \
    && curl -L -o /opt/ktfmt/ktfmt.jar \
       "https://repo1.maven.org/maven2/com/facebook/ktfmt/${KTFMT_VERSION}/ktfmt-${KTFMT_VERSION}-jar-with-dependencies.jar" \
    && printf '#!/bin/bash\nexec java -jar /opt/ktfmt/ktfmt.jar "$@"\n' > /usr/local/bin/ktfmt \
    && chmod +x /usr/local/bin/ktfmt

# Install lychee (link checker)
# Check for updates: https://github.com/lycheeverse/lychee/releases
RUN curl -L -o /tmp/lychee.tar.gz \
       "https://github.com/lycheeverse/lychee/releases/download/lychee-v${LYCHEE_VERSION}/lychee-x86_64-unknown-linux-musl.tar.gz" \
    && tar -xzf /tmp/lychee.tar.gz -C /tmp \
    && mv /tmp/lychee /usr/local/bin/lychee \
    && chmod +x /usr/local/bin/lychee \
    && rm -rf /tmp/lychee.tar.gz

# Install Android SDK Command Line Tools
# Check for updates: https://developer.android.com/studio#command-line-tools-only
RUN mkdir -p "${ANDROID_HOME}/cmdline-tools" \
    && curl -L -o /tmp/commandlinetools.zip \
       "https://dl.google.com/android/repository/commandlinetools-linux-${ANDROID_CMDLINE_TOOLS_VERSION}_latest.zip" \
    && unzip -q /tmp/commandlinetools.zip -d /tmp/cmdline-tools \
    && mv /tmp/cmdline-tools/cmdline-tools "${ANDROID_HOME}/cmdline-tools/latest" \
    && rm -rf /tmp/commandlinetools.zip /tmp/cmdline-tools

# Accept Android SDK licenses and install components
# Versions based on android/libs.versions.toml: compileSdk=36, buildTools=35.0.0, targetSdk=36
# Optional emulator/system image install controlled by ANDROID_INSTALL_EMULATOR
RUN yes | sdkmanager --licenses || true \
    && sdkmanager --install \
      "platform-tools" \
      "platforms;android-${ANDROID_PLATFORM_VERSION}" \
      "build-tools;${ANDROID_BUILD_TOOLS_VERSION}" \
    && if [ "${ANDROID_INSTALL_EMULATOR}" = "true" ]; then \
         sdkmanager --install \
           "emulator" \
           "system-images;android-${ANDROID_EMULATOR_API_LEVEL};${ANDROID_SYSTEM_IMAGE_VARIANT};${ANDROID_SYSTEM_IMAGE_ARCH}"; \
       fi \
    && rm -rf /root/.android/cache /tmp/*

# Install tini for proper signal handling (PID 1 problem)
# This is critical for stdio-based MCP servers
# Check for updates: https://github.com/krallin/tini/releases
RUN curl -L -o /usr/local/bin/tini "https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini-static-amd64" \
    && echo "${TINI_SHA256} /usr/local/bin/tini" | sha256sum -c - \
    && chmod +x /usr/local/bin/tini

# Set working directory
WORKDIR /workspace

# Copy package files first for better caching
COPY package.json bun.lock ./

# Install dependencies with Bun (skip dev deps for image build)
RUN bun install --frozen-lockfile --production \
    && rm -rf /root/.bun/install/cache

# Copy the rest of the application
COPY . .

# Build the application
RUN bun run build

# ==============================================================================
# RUNTIME STAGE - Minimal image with only runtime dependencies
# ==============================================================================
FROM base AS runtime

# Preload jemalloc for runtime processes.
ENV LD_PRELOAD=/usr/lib/libjemalloc.so.2

# Copy Android SDK from builder (needed for ADB at runtime)
COPY --from=builder /opt/android-sdk /opt/android-sdk

# Copy Bun from builder
COPY --from=builder /usr/local/bin/bun /usr/local/bin/bun

# Copy ktfmt from builder
COPY --from=builder /opt/ktfmt /opt/ktfmt
COPY --from=builder /usr/local/bin/ktfmt /usr/local/bin/ktfmt

# Copy lychee from builder
COPY --from=builder /usr/local/bin/lychee /usr/local/bin/lychee

# Copy tini from builder
COPY --from=builder /usr/local/bin/tini /usr/local/bin/tini

# Set working directory
WORKDIR /workspace

# Copy package files and node_modules from builder
COPY --from=builder /workspace/package.json ./
COPY --from=builder /workspace/bun.lock ./
COPY --from=builder /workspace/node_modules ./node_modules

# Copy built application from builder
COPY --from=builder /workspace/dist ./dist

# Copy other necessary files (configs, etc.)
COPY --from=builder /workspace/tsconfig.json ./tsconfig.json

# Create a non-root user for running the application
RUN adduser -D automobile \
    && chown -R automobile:automobile /workspace \
    && mkdir -p /home/automobile/.android \
    && mkdir -p /home/automobile/.auto-mobile \
    && chown -R automobile:automobile /home/automobile/.android \
    && chown -R automobile:automobile /home/automobile/.auto-mobile

# Switch to non-root user
USER automobile

# Verify runtime installations
RUN bun --version \
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
# For other transports, override with: docker run ... bun run dev:sse
CMD ["bun", "dist/src/index.js"]
