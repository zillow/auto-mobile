# Docker Hub Publishing

This guide explains how to set up automated Docker image publishing to Docker Hub from GitHub Actions.

## Overview

AutoMobile automatically publishes Docker images to Docker Hub in two scenarios:

1. **Release Publishing**: When a new version tag (e.g., `v0.0.7`) is pushed, the `release.yml` workflow publishes versioned images (tags are created by the Prepare Release workflow on merge)
2. **Main Branch Updates**: When changes are merged to `main`, the `docker-publish.yml` workflow updates the `latest` tag

## Prerequisites

- Docker Hub account (free tier is sufficient)
- Repository maintainer access to configure GitHub secrets
- Git command line tools

## Step 1: Create Docker Hub Access Token

Access tokens are more secure than using your Docker Hub password directly.

1. Log in to [Docker Hub](https://hub.docker.com/)
2. Click your username in the top right → **Account Settings**
3. Navigate to **Security** → **New Access Token**
4. Configure the token:
   - **Description**: `github-actions-auto-mobile` (or similar)
   - **Access permissions**: **Read & Write** (required for pushing images)
5. Click **Generate**
6. **IMPORTANT**: Copy the token immediately - you cannot view it again!

## Step 2: Add GitHub Secrets

Store your Docker Hub credentials as GitHub repository secrets:

1. Navigate to your GitHub repository
2. Go to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret** and add each of these:

### DOCKERHUB_USERNAME

- **Name**: `DOCKERHUB_USERNAME`
- **Value**: Your Docker Hub username (e.g., `kaeawc`)

### DOCKERHUB_TOKEN

- **Name**: `DOCKERHUB_TOKEN`
- **Value**: The access token you generated in Step 1

## Step 3: Verify Configuration

After adding the secrets, you can verify they're configured correctly:

1. Go to **Settings** → **Secrets and variables** → **Actions**
2. You should see two secrets listed:
   - `DOCKERHUB_USERNAME`
   - `DOCKERHUB_TOKEN`

## Step 4: Test the Workflows

### Testing Manual Publishing

The `docker-publish.yml` workflow can be triggered manually:

1. Go to **Actions** tab in GitHub
2. Select **Publish Docker Image** workflow
3. Click **Run workflow** → **Run workflow**
4. Monitor the workflow execution
5. Once complete, check [Docker Hub](https://hub.docker.com/r/kaeawc/auto-mobile/tags) for the `latest` tag

### Testing Release Publishing

The release workflow is automatically triggered by version tags:

```bash
# Create and push a release tag
git tag v0.0.8
git push origin v0.0.8
```

This will trigger the `release.yml` workflow which:
- Builds and tests the project
- Publishes to npm
- Builds and pushes Docker images with multiple tags
- Creates a GitHub release

## Published Docker Images

### Image Repository

Images are published to: `kaeawc/auto-mobile`

View all tags at: https://hub.docker.com/r/kaeawc/auto-mobile/tags

### Tag Strategy

Each release publishes multiple tags for different use cases:

#### Version Tags
- `0.0.7` - Exact version number (from git tag `v0.0.7`)
- `0.0` - Major.minor version (updated with each release in that series)

#### SHA Tags
- `main-abc1234` - Git commit SHA for precise tracking

#### Latest Tag
- `latest` - Always points to the newest release
- Updated on every release and every main branch merge

### Usage Examples

```bash
# Pull specific version (recommended for production)
docker pull kaeawc/auto-mobile:0.0.7

# Pull major.minor version (gets updates for patch releases)
docker pull kaeawc/auto-mobile:0.0

# Pull latest (gets all updates, including breaking changes)
docker pull kaeawc/auto-mobile:latest

# Pull specific commit
docker pull kaeawc/auto-mobile:main-abc1234
```

## Platform Support

The published images are built for:
- **linux/amd64** (x86_64 only)

**Note**: ARM64/Apple Silicon is not supported because the Android SDK and tools are only available for x86_64 architecture.

When running on Apple Silicon, use:
```bash
docker pull --platform=linux/amd64 kaeawc/auto-mobile:latest
```

## Troubleshooting

### Authentication Failed

If you see authentication errors in GitHub Actions:

1. Verify secrets are named exactly:
   - `DOCKERHUB_USERNAME` (not `DOCKER_USERNAME`)
   - `DOCKERHUB_TOKEN` (not `DOCKER_PASSWORD` or `DOCKERHUB_PASSWORD`)

2. Regenerate your Docker Hub access token:
   - Tokens can expire or be revoked
   - Create a new token following Step 1
   - Update the `DOCKERHUB_TOKEN` secret

3. Verify the token has **Read & Write** permissions

### Build Failed

If the Docker build fails:

1. Test the build locally:
   ```bash
   docker build --platform=linux/amd64 -t auto-mobile:test .
   ```

2. Check the Dockerfile syntax:
   ```bash
   ./scripts/docker/validate_dockerfile.sh
   ```

3. Review the build logs in GitHub Actions for specific errors

### Images Not Appearing on Docker Hub

1. Check the workflow completed successfully in GitHub Actions
2. Verify you're looking at the correct repository: `kaeawc/auto-mobile`
3. Check that the workflow had permissions to push:
   - Workflow needs `packages: write` permission
   - Docker Hub token needs Read & Write access

### Rate Limiting

GitHub-hosted runners have preferential rate limits with Docker Hub through a partnership, so you should not encounter rate limit issues. If you do:

1. Check your Docker Hub account status
2. Verify you're using GitHub-hosted runners (not self-hosted)
3. Consider using Docker Hub's authenticated pulls in your workflows

## Security Best Practices

1. **Use Access Tokens**: Never use your Docker Hub password directly
2. **Limit Token Scope**: Only grant Read & Write permissions (not Delete)
3. **Rotate Tokens**: Regenerate tokens periodically (e.g., every 6-12 months)
4. **Separate Tokens**: Use different tokens for different purposes
5. **Monitor Usage**: Check Docker Hub's audit logs for unexpected activity

## Additional Resources

- [Docker Hub Documentation](https://docs.docker.com/docker-hub/)
- [GitHub Actions Docker Login](https://github.com/docker/login-action)
- [GitHub Actions Docker Build & Push](https://github.com/docker/build-push-action)
- [Docker Metadata Action](https://github.com/docker/metadata-action)

## Maintenance

### Updating Workflows

The workflows are located at:
- `.github/workflows/prepare-release.yml` - Prepare release PRs and tags
- `.github/workflows/release.yml` - Release publishing (with Docker)
- `.github/workflows/docker-publish.yml` - Main branch publishing

### Changing Repository Name

If you need to change the Docker Hub repository:

1. Update the `images` field in both workflows:
   ```yaml
   images: your-username/new-repo-name
   ```

2. Update documentation references:
   - `DOCKER.md`
   - `README.md`
   - This file

### Adding Additional Registries

To publish to additional registries (e.g., GitHub Container Registry):

1. Add additional login steps
2. Add additional metadata configurations
3. Update the build step to push to multiple registries

Example for GitHub Container Registry:
```yaml
- name: Log in to GitHub Container Registry
  uses: docker/login-action@v3
  with:
    registry: ghcr.io
    username: ${{ github.actor }}
    password: ${{ secrets.GITHUB_TOKEN }}

- name: Extract Docker metadata
  id: docker_meta
  uses: docker/metadata-action@v5
  with:
    images: |
      kaeawc/auto-mobile
      ghcr.io/${{ github.repository }}
```
