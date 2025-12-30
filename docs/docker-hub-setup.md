# Docker Hub Setup Guide

This guide explains how to set up Docker Hub publishing for the AutoMobile project.

## Prerequisites

- A Docker Hub account (free or paid)
- Admin access to the GitHub repository
- The project is already configured to publish to `kaeawc/auto-mobile`

## Step 1: Create Docker Hub Repository

1. **Log in to Docker Hub**
   - Go to https://hub.docker.com/
   - Sign in with your credentials

2. **Create a new repository**
   - Click "Create Repository"
   - **Repository Name**: `auto-mobile`
   - **Namespace**: Should be `kaeawc` (your Docker Hub username)
   - **Visibility**: Public (recommended) or Private
   - **Description**: "AutoMobile - Android automation MCP server with ADB"
   - Click "Create"

3. **Verify repository URL**
   - Your repository should be accessible at: `https://hub.docker.com/r/kaeawc/auto-mobile`

## Step 2: Create Docker Hub Access Token

For security, use an access token instead of your password:

1. **Navigate to Account Settings**
   - Click your profile icon in the top-right
   - Select "Account Settings"

2. **Go to Security**
   - Click "Security" in the left sidebar
   - Find the "Access Tokens" section

3. **Generate New Token**
   - Click "New Access Token"
   - **Description**: `GitHub Actions - auto-mobile`
   - **Access permissions**: Read, Write, Delete (or Read & Write minimum)
   - Click "Generate"

4. **Save the token**
   - ⚠️ **IMPORTANT**: Copy the token immediately - you won't see it again!
   - Save it temporarily in a secure location

## Step 3: Configure GitHub Secrets

1. **Go to GitHub Repository Settings**
   - Navigate to: https://github.com/kaeawc/auto-mobile
   - Click "Settings" tab
   - Click "Secrets and variables" → "Actions" in left sidebar

2. **Add DOCKERHUB_USERNAME secret**
   - Click "New repository secret"
   - **Name**: `DOCKERHUB_USERNAME`
   - **Value**: `kaeawc` (your Docker Hub username)
   - Click "Add secret"

3. **Add DOCKERHUB_TOKEN secret**
   - Click "New repository secret"
   - **Name**: `DOCKERHUB_TOKEN`
   - **Value**: Paste the access token from Step 2
   - Click "Add secret"

4. **Verify secrets are added**
   - You should see both secrets listed (values are hidden for security)

## Step 4: Test the Workflow

### Option A: Merge a PR to Main

The workflow will automatically run when you merge a PR to the `main` branch:

1. Create and merge a PR with Docker-related changes
2. The workflow triggers automatically
3. Check the "Actions" tab to monitor progress
4. Verify the image appears on Docker Hub after success

### Option B: Manual Trigger (If Enabled)

If you want to test without merging:

1. Push a commit to `main` that modifies Docker files
2. The workflow will trigger automatically
3. Monitor in the "Actions" tab

## Step 5: Verify Publication

After the workflow completes successfully:

1. **Check Docker Hub**
   - Go to: https://hub.docker.com/r/kaeawc/auto-mobile/tags
   - You should see tags like:
     - `latest` - Latest build from main
     - `0.0.6` - Version from package.json
     - `0.0` - Major.minor version
     - `0` - Major version
     - `main-<sha>` - Git commit SHA

2. **Test pulling the image**
   ```bash
   docker pull kaeawc/auto-mobile:latest
   docker pull kaeawc/auto-mobile:0.0.6
   ```

3. **Verify the image works**
   ```bash
   docker run -i --rm --init kaeawc/auto-mobile:latest --help
   ```

## Published Image Tags

The workflow automatically creates multiple tags:

| Tag Pattern | Example | Description |
|------------|---------|-------------|
| `latest` | `latest` | Latest build from main branch |
| `{version}` | `0.0.6` | Exact version from package.json |
| `{major}.{minor}` | `0.0` | Major and minor version |
| `{major}` | `0` | Major version only |
| `{branch}-{sha}` | `main-a1b2c3d` | Git commit identifier |

### Multi-platform Support

Images are built for both architectures:
- `linux/amd64` - Intel/AMD x86_64 processors
- `linux/arm64` - ARM processors (Apple Silicon, AWS Graviton, etc.)

Docker automatically pulls the correct architecture for your platform.

## Using the Published Image

### For MCP Clients

Update your MCP client configuration to use the published image:

```json
{
  "mcpServers": {
    "auto-mobile": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "--init",
        "--pull=always",
        "--privileged",
        "--network", "host",
        "kaeawc/auto-mobile:latest"
      ]
    }
  }
}
```

The `--pull=always` flag ensures you get the latest version.

### For Development

```bash
# Pull latest
docker pull kaeawc/auto-mobile:latest

# Pull specific version
docker pull kaeawc/auto-mobile:0.0.6

# Run interactively
docker run -it --rm --init kaeawc/auto-mobile:latest bash
```

### For Production

Pin to a specific version in production:

```json
{
  "mcpServers": {
    "auto-mobile": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--init",
        "kaeawc/auto-mobile:0.0.6"
      ]
    }
  }
}
```

## Troubleshooting

### Publishing Fails with "Unauthorized"

**Problem**: GitHub Actions can't authenticate to Docker Hub

**Solutions**:
1. Verify `DOCKERHUB_USERNAME` matches your Docker Hub username exactly
2. Verify `DOCKERHUB_TOKEN` is valid and not expired
3. Regenerate the token if needed (tokens can expire)
4. Check the token has Write permissions

### "Repository not found" Error

**Problem**: Docker Hub repository doesn't exist

**Solutions**:
1. Create the repository on Docker Hub first (Step 1)
2. Verify the repository name is exactly `kaeawc/auto-mobile`
3. Check you're logged into the correct Docker Hub account

### Workflow Doesn't Run on Merge

**Problem**: The publish-docker-hub job doesn't execute

**Solutions**:
1. Verify you merged to the `main` branch (not another branch)
2. Check that Docker-related files were modified (Dockerfile, etc.)
3. Review the workflow conditions in `.github/workflows/docker.yml`

### Multi-platform Build Fails

**Problem**: ARM64 build fails or times out

**Solutions**:
1. This is expected for large images - ARM builds can take 30+ minutes
2. The workflow has appropriate timeouts configured
3. If persistent, you can remove `linux/arm64` from the `platforms` line temporarily

### Docker Hub Description Not Updated

**Problem**: README on Docker Hub doesn't match DOCKER.md

**Solutions**:
1. Verify the `peter-evans/dockerhub-description` action ran successfully
2. Check that `DOCKER.md` exists and has content
3. Token may need additional permissions - regenerate with full permissions

## Monitoring Published Images

### View Build Logs

1. Go to: https://github.com/kaeawc/auto-mobile/actions
2. Click on the "Docker Build and Test" workflow
3. Click on a specific run
4. Expand the "Publish to Docker Hub" job
5. Review each step's logs

### Check Docker Hub Insights

1. Go to: https://hub.docker.com/r/kaeawc/auto-mobile
2. Click "Tags" to see all published versions
3. Click "Analytics" to see pull statistics (if available)

## Security Best Practices

### Rotate Tokens Regularly

- Rotate Docker Hub tokens every 90 days
- Update GitHub secrets when rotating
- Use separate tokens for different purposes

### Limit Token Scope

- Create tokens with minimal required permissions
- Read & Write is sufficient for publishing
- Avoid using Delete permission unless needed

### Monitor for Vulnerabilities

The workflow includes Trivy security scanning:
- Check GitHub Security tab for vulnerability reports
- Address CRITICAL and HIGH severity issues promptly
- Review Trivy results in GitHub Actions logs

### Keep Images Updated

- Rebuild regularly to get security updates
- Consider setting up Dependabot for base image updates
- Monitor Docker Hub for security advisories

## Updating the Workflow

The workflow is defined in `.github/workflows/docker.yml`. Common modifications:

### Change Repository Name

If you want to publish to a different repository:

```yaml
# Find and replace:
images: kaeawc/auto-mobile
# With:
images: your-username/your-repo
```

### Add Additional Tags

Add custom tags in the metadata section:

```yaml
tags: |
  type=raw,value=custom-tag
  type=ref,event=branch
  # ... existing tags
```

### Disable Multi-platform Builds

Remove ARM64 if builds are too slow:

```yaml
platforms: linux/amd64
```

## Next Steps

- [MCP Docker Configuration](mcp-docker-config.md) - Configure MCP clients
- [Docker Documentation](docker.md) - Complete Docker guide
- [GitHub Actions Documentation](https://docs.github.com/en/actions) - Workflow customization

## Support

If you encounter issues:
1. Check the GitHub Actions logs for detailed error messages
2. Review Docker Hub repository settings
3. Verify GitHub secrets are correctly configured
4. See the [Troubleshooting](#troubleshooting) section above
