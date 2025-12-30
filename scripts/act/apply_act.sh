#!/usr/bin/env bash

INSTALL_ACT_WHEN_MISSING=${INSTALL_ACT_WHEN_MISSING:-false}
ACT_EVENT=${ACT_EVENT:-"push"}
ACT_JOB=${ACT_JOB:-""}
USE_CUSTOM_DOCKERFILE=${USE_CUSTOM_DOCKERFILE:-false}

# Check if act is installed
if ! command -v act &>/dev/null; then
    echo "act missing"
    if [[ "${INSTALL_ACT_WHEN_MISSING}" == "true" ]]; then
      scripts/act/install_act.sh
      # Ensure act is in PATH for subsequent commands
      export PATH="$HOME/bin:$PATH"
    else
      if [[ "$OSTYPE" == "darwin"* ]]; then
        # macos specific advice
        echo "Try 'brew install act' or run with INSTALL_ACT_WHEN_MISSING=true"
      else
        echo "Consult your OS package manager or run with INSTALL_ACT_WHEN_MISSING=true"
      fi
      exit 1
    fi
fi

# Verify act is available
if ! command -v act &>/dev/null; then
    echo "Error: act is not available in PATH"
    exit 1
fi

# Check if Docker is available (required for act)
if ! command -v docker &>/dev/null; then
    echo "Error: Docker is required for act but is not installed"
    echo "Please install Docker and ensure it's running"
    exit 1
fi

# Check if Docker daemon is running
if ! docker info &>/dev/null; then
    echo "Error: Docker daemon is not running"
    echo "Please start Docker and try again"
    exit 1
fi

# Start the timer
start_time=$(bash -c "$(pwd)/scripts/utils/get_timestamp.sh")

# Check if .github/workflows directory exists
if [ ! -d ".github/workflows" ]; then
    echo "No .github/workflows directory found"
    exit 0
fi

# Check if there are any workflow files
workflow_files=$(find .github/workflows -name "*.yml" -o -name "*.yaml" 2>/dev/null)
if [[ -z "$workflow_files" ]]; then
    echo "No workflow files found in .github/workflows"
    exit 0
fi

echo "Running GitHub Actions workflows locally with act..."

# Build act command
act_cmd="act"

# Add event if specified
if [[ -n "$ACT_EVENT" ]]; then
    act_cmd="$act_cmd $ACT_EVENT"
fi

# Add job filter if specified
if [[ -n "$ACT_JOB" ]]; then
    act_cmd="$act_cmd --job $ACT_JOB"
fi

# Add platform specification to use our custom Dockerfile if it exists and USE_CUSTOM_DOCKERFILE is set to true
if [[ "$USE_CUSTOM_DOCKERFILE" == "true" && -f "ci/Dockerfile" ]]; then
    act_cmd="$act_cmd -P ubuntu-latest=dockerfile://$(pwd)/ci/Dockerfile"
fi

# Add verbosity for better output
act_cmd="$act_cmd --verbose"

# Run act
echo "Running: $act_cmd"
if ! eval "$act_cmd"; then
    echo "Error: act execution failed"
    # Calculate total elapsed time
    end_time=$(bash -c "$(pwd)/scripts/utils/get_timestamp.sh")
    total_elapsed=$((end_time - start_time))
    echo "Total time elapsed: $total_elapsed ms."
    exit 1
fi

# Calculate total elapsed time
end_time=$(bash -c "$(pwd)/scripts/utils/get_timestamp.sh")
total_elapsed=$((end_time - start_time))

echo "GitHub Actions workflows completed successfully."
echo "Total time elapsed: $total_elapsed ms."
