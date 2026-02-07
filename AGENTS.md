# Agents: Development Guide

This document provides instructions for autonomous agents working on the Image Generation Autopilot SillyTavern extension.

## Repository Structure

This is a SillyTavern browser extension written in vanilla JavaScript with ES modules.

### Key Directories and Files

```
/
├── index.js              # Main extension entry point (4700+ lines)
├── style.css             # All extension styles
├── settings.html         # Settings UI for SillyTavern
├── manifest.json         # SillyTavern extension manifest
├── package.json          # Test infrastructure config (Bun)
├── bunfig.toml           # Bun configuration
├── CHANGELOG.md          # Version history
├── README.md             # User documentation
├── LICENSE               # MIT license
└── src/
    ├── image-dialog.js           # Image Selection Dialog component
    ├── parallel-generator.js     # Parallel generation engine
    ├── generation-events.js      # Event detection system
    ├── state-manager.js          # Generation state management
    └── __tests__/               # Test files (Bun)
        ├── dialog-state.test.js
        ├── generation-events.test.js
        ├── state-manager.test.js
        ├── parallel-generator.test.js
        └── example.test.js
```

### Extension Files

The extension works as a SillyTavern add-on:
- **Entry point**: `index.js` registers the extension with SillyTavern
- **Manifest**: `manifest.json` defines metadata, dependencies, and compatibility
- **Styles**: `style.css` contains all CSS (includes dialog, settings, styles for both)
- **Settings**: `settings.html` provides configuration UI

### Module Architecture

The codebase uses ES6+ modules:
- **export class** for main components (`ImageSelectionDialog`, `ParallelGenerator`, etc.)
- **import** statements with `.js` extensions
- **export const** for constants and utilities
- Constructor dependency injection for testability

Example pattern:
```javascript
const MODULE_NAME = 'ImageSelectionDialog';

function isDebugMode() {
  if (typeof window !== 'undefined' && window.extensionSettings?.autoMultiImageSwipes?.debugMode) {
    return true;
  }
  return false;
}

const logger = {
  debug: (...args) => {
    if (isDebugMode()) {
      console.debug(`[${MODULE_NAME}]`, ...args);
    }
  },
  info: (...args) => console.info(`[${MODULE_NAME}]`, ...args),
  warn: (...args) => console.warn(`[${MODULE_NAME}]`, ...args),
  error: (...args) => console.error(`[${MODULE_NAME}]`, ...args),
};

export class ImageSelectionDialog {
  constructor(dependenciesOrFactory) {
    // Dependency injection pattern for testing
    this.PopupClass = dependencies.PopupClass || window.Popup || class MockPopup { ... };
    this.generatorFactory = dependencies.generatorFactory || ((opts) => new ParallelGenerator(opts));
    // ...
  }
}
```

## Branch Strategy

### Branches

- **`develop`** - Main development branch. All PRs target develop → main
- **`main`** - Default GitHub branch. Receives merges from develop
- **`release`** - CI-managed. **DO NOT MANUALLY MODIFY**
- **`feat/*`** - Feature branches (optional)

### Pull Request Workflow

1. **Development**: Work on `develop` branch
2. **Create PR**: From `develop` → `main`
3. **Review**: Use conventional commit style for PR titles
4. **Merge**: Merge PR to `main` (when ready)
5. **Release**: Create release tag (e.g., `v2.0.1`) from `main`

⚠️ **IMPORTANT**: The `release` branch is automatically managed by CI. NEVER manually push or modify it.

## Release Process

The release workflow is fully automated via GitHub Actions (`.github/workflows/release-branch.yml`):

### Triggering a Release

When `main` is ready for release:

1. **Update version numbers** in:
   - `manifest.json` → `version` field
   - `package.json` → `version` field

2. **Update CHANGELOG.md** with release notes:
   ```markdown
   ## [2.0.1] - 2026-02-07

   ### Fixed
   - Description of fix...

   ### Changed
   - Description of change...
   ```

3. **Create and push a release tag** from `main`:
   ```bash
   git tag -a v2.0.1 -m "Release v2.0.1"
   git push origin v2.0.1
   ```

4. **Create GitHub Release**:
   - Go to GitHub Releases
   - Create new release → select tag
   - Use CHANGELOG as release notes

### What CI Does

When a release tag is published, the workflow:

1. **Fetches** the repository
2. **Creates an orphan branch** named `release`
3. **Copies only production files** to the release branch:
   - `index.js`
   - `style.css`
   - `settings.html`
   - `manifest.json`
   - `README.md`
   - `LICENSE`
   - `src/*.js` (excludes `__tests__/`)

4. **Force pushes** the clean `release` branch

5. **Files NOT included in release**:
   - `package.json` (test infrastructure)
   - `bunfig.toml` (test config)
   - `.github/` (workflows)
   - `src/__tests__/` (test files)
   - Development files

### Release Branch Usage

- **Users install from**: `https://github.com/djdembeck/SillyTavern-Image-Generation-Autopilot/tree/release`
- **README references this** as the production install URL
- The `release` branch contains only what's needed for SillyTavern

## Commit Message Style

Use **conventional commits** for all commits:

### Format

```
<type>: <short description>
```

### Types

- `fix:` - Bug fixes
- `feat:` - New features
- `docs:` - Documentation changes
- `chore:` - Build/config tasks, version bumps, changelog updates
- `ci:` - CI/CD changes
- `style:` - Code style changes (formatting, no logic change)
- `refactor:` - Code refactoring
- `test:` - Test changes
- `perf:` - Performance improvements

### Examples

```
fix: ensure mobile dialog close button is always visible
fix: fix model queue cycling bug in parallel generator
feat: add preset profiles for quick configuration switching
docs: move install URLs to top of README
chore: bump version to 2.0.1 and update changelog
ci: add automated release branch workflow
style: increase lightbox checkbox tap area for mobile
```

### PR Titles

PR titles from `develop` → `main` MUST use conventional commit style:

```
✓ Good: "chore: sync main branch with develop"
✓ Good: "fix: resolve mobile dialog z-index conflicts"
✗ Bad: "Sync main with develop"
✗ Bad: "Mobile fix"
```

## Code Standards

### Module Pattern

- Use `const MODULE_NAME = 'ComponentName'` at top of files
- Use debug logging controlled by `window.extensionSettings?.autoMultiImageSwipes?.debugMode`
- Export classes and functions; avoid default exports

```javascript
// ✓ Good
const MODULE_NAME = 'GenerationDetector';
export class GenerationDetector {}

// ✗ Bad - default exports
export default class GenerationDetector {}
```

### Class Design

- Constructor dependency injection for testability
- Use `this` for instance state
- Private methods prefix with `_`
- Event handlers bound to maintain context

```javascript
export class ImageSelectionDialog {
  constructor(dependencies = {}) {
    this.generatorFactory = dependencies.generatorFactory;
    this.PopupClass = dependencies.PopupClass;
    // ...
  }

  _handleCancel() { /* private */ }
  _bindEvents() { /* internal */ }
  show(prompts, options) { /* public */ }
}
```

### Testing

Test file location: `src/__tests__/`

Test naming pattern: `<module-name>.test.js`

Run tests: `bun test`

Test configuration: `bunfig.toml`
- Timeout: 30 seconds per test
- Uses Bun's built-in test runner

### Browser API Access

- Check for `window` object before using browser APIs
- SillyTavern provides `window.Popup` for dialogs
- Extension settings at `window.extensionSettings?.autoMultiImageSwipes`

```javascript
function isDebugMode() {
  if (typeof window !== 'undefined' && window.extensionSettings?.autoMultiImageSwipes?.debugMode) {
    return true;
  }
  return false;
}
```

## SillyTavern Integration

### Extension Registration

In `index.js`:
- Check for required SillyTavern dependencies (`stable-diffusion`)
- Register extension settings under `extensionSettings.autoMultiImageSwipes`
- Listen for SillyTavern events: `MESSAGE_RECEIVED`, `SD_GENERATION_COMPLETE`

### Extension Settings

Settings stored in `window.extensionSettings.autoMultiImageSwipes`:
- `enabled`: boolean
- `debugMode`: boolean
- `concurrency`: number
- `modelQueue`: array of model configs
- etc.

### Per-Character Persistence

Settings can be saved to character cards via `writeExtensionField`:
```javascript
context.writeExtensionField(MODULE_NAME, 'presets', presets);
```

## File Size Notes

- `index.js` is large (4700+ lines) - this is expected
- Monolithic entry point that orchestrates the entire extension
- Don't split `index.js` unless there's a clear architectural benefit

## Agent Instructions

### When making changes

1. **Understand the context**:
   - Check if code is part of `index.js` (main entry) or a module
   - Look at existing patterns in the file
   - Check `manifest.json` for minimum SillyTavern version (1.12.0)

2. **Follow conventions**:
   - Use existing MODULE_NAME patterns
   - Use logger with debug mode check
   - Follow ES module import/export style
   - Keep class constructors injectable for testing

3. **Write tests** for new modules in `src/__tests__/`
4. **Update CHANGELOG.md** for user-facing changes
5. **Use conventional commit messages**

### When creating PRs

1. PR from `develop` → `main`
2. Use conventional commit title
3. Include relevant context in description
4. Reference any issues

### When preparing releases

1. Commit changes to `develop`
2. Merge to `main` via PR
3. Update `manifest.json` and `package.json` versions
4. Update `CHANGELOG.md`
5. Tag release: `git tag -a v2.1.0 -m "Release v2.1.0"`
6. Push tag: `git push origin v2.1.0`
7. Create GitHub Release
8. **DO NOT touch `release` branch** - CI handles it

### Important Warnings

⚠️ **NEVER manually modify `release` branch**
- It's recreated from scratch by CI on every release
- Any manual changes will be overwritten

⚠️ **NEVER commit test infrastructure to `release` branch**
- `package.json`, `bunfig.toml`, `.github/` are dev-only
- CI excludes them automatically

⚠️ **ALWAYS use conventional commits**
- Required for automated changelog generation
- Required for consistent commit history

## Testing in This Repo

### Test Framework
- **Bun test runner** (built-in)
- Located in `src/__tests__/`
- Run with `bun test`

### Test Patterns
- Use `describe()` for test suites
- Use `it()` or `test()` for individual tests
- Mock browser APIs where needed
- Test core logic, not browser-specific behavior

### Example Test Structure
```javascript
src/__tests__/state-manager.test.js
```

For more complex testing needs, consult the codebase or use standard Bun test patterns.
