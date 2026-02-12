# GitHub Actions Workflows

This repository is configured with automated CI/CD workflows for building and publishing VSCode extensions.

## Workflow Descriptions

### 1. Build VSCode Extension (`.github/workflows/build-extension.yml`)

**Trigger Conditions**:

- Push to `main` or `master` branch
- Create/Update Pull Request
- Create version tag (`v*`)

**Tasks**:

- Build under Node.js 20.x environment
- Install dependencies (`npm install -g @vscode/vsce`)
- Compile TypeScript (`npm run compile`)
- Build extension (`npx @vscode/vsce package`)
- Package extension (.vsix file)
- Upload build artifacts

### 2. Publish to VSCode Marketplace (`.github/workflows/publish-extension.yml`)

**Trigger Conditions**:

- Manual trigger (workflow_dispatch)

**Features**:

- Update version number
- Convert icon to PNG format
- Build and package extension
- Publish to VSCode Marketplace
- Create Git tag

### 3. PR Check (`.github/workflows/pr-check.yml`)

**Trigger Conditions**:

- Create/Update Pull Request

**Check Items**:

- TypeScript type check
- Code quality check
- Build testing
- Automated PR status comment

## Usage Guide

### Automatic Build

The extension will automatically build on every push, and build artifacts will be retained for 30 days.

### Publish New Version

1. Visit the repository's Actions page
2. Select "Publish to VSCode Marketplace" workflow
3. Click "Run workflow"
4. Enter version number (e.g.: 0.0.2)
5. Select whether it is a pre-release version
6. Click "Run workflow"

### Required Secrets

Configure the following secrets in the repository settings:

- `VSCE_PAT`: VSCode Marketplace Personal Access Token
  - How to obtain: https://dev.azure.com/

## Publishing Process

1. Automatically build after code is merged to main branch
2. Manually trigger publish workflow
3. Extension automatically published to VSCode Marketplace
4. Automatically create Git tag and Release

## Important Notes

- Ensure that the version information in package.json is correct
- Test functionality locally before publishing
- Pre-release versions can be tested in pre-release mode first
