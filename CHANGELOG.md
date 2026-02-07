# Changelog

All notable changes to this project are documented in this file.

## [2.0.1] - 2026-02-07

### Fixed

- **Mobile dialog close button visibility**: Fixed an issue where the close button (X) was not visible on mobile devices due to z-index conflicts. The button now has:
  - Higher z-index (1000 desktop, 1001 mobile with !important)
  - Semi-transparent background with border for better visibility
  - Larger touch target (44px) for easier mobile interaction
  - Dialog wrapper z-index increased to 9999 to appear above SillyTavern header
- **Model queue cycling bug**: Fixed a bug in the parallel generator that caused all images to use only one model instead of properly cycling through the model queue. The issue was using the entry index for modulo calculation which didn't properly increment across tasks. Fixed by introducing a separate `modelCycleIndex` counter that increments for each task, ensuring proper round-robin distribution across the model queue.

## [2.0.0] - 2026-02-05

### BREAKING CHANGES

- **Replaced sequential swipe workflow with parallel Image Selection Dialog**: The old auto-swipes approach that fired swipes one-by-one has been completely replaced with an event-based parallel generation system.
- **Removed burst mode**: The deprecated burst mode setting and UI have been removed entirely.
- **Removed DOM polling**: Generation detection now uses SillyTavern's native event system instead of polling for CSS classes.

### Added

- **Image Selection Dialog**: A new modal dialog that displays a live grid of images as they generate in parallel. Users can:
  - Watch images appear in real-time as they complete
  - Select one or multiple images to keep
  - Choose where to insert images (current message or new message)
  - See which model generated each image
  - Click on any image to view it in a lightbox
  - Regenerate individual images if you're not satisfied
  - Cancel the entire batch at any time
- **Parallel generation engine**: Images now generate concurrently up to a configurable concurrency limit (1-8, default 4). This dramatically speeds up batch generation by overlapping API calls.
- **Event-based generation detection**: Uses SillyTavern's native event system (`MESSAGE_RECEIVED` and `SD_GENERATION_COMPLETE`) for reliable completion detection instead of fragile DOM polling. This means:
  - More reliable detection of when images finish generating
  - No more missed completions due to timing issues
  - Better integration with SillyTavern's core systems
- **State management with automatic cleanup**: New state manager prevents memory leaks by properly cleaning up generation states on chat change. Switching between chats or characters automatically cancels and cleans up any running generations.
- **Concurrency slider**: New setting to control how many images generate in parallel (1-8). Tune this based on your provider's rate limits and your patience.

### Migration Guide

If you were using the auto-swipes feature in 1.x, here's how the new 2.0 workflow works:

1. **Trigger**: `<pic>` tags in the AI's response or clicking the paintbrush button now open the **Image Selection Dialog** instead of auto-generating images
2. **Parallel Generation**: The extension generates multiple images simultaneously (respecting your concurrency limit)
3. **Selection**: Watch the live grid fill with images as they complete, select the ones you like
4. **Insert**: Click **"Keep Selected"** to insert chosen images into your chosen destination (current message or new message)
5. **Progress**: The global progress HUD shows status and lets you stop everything instantly

The new workflow gives you more control—you see all generated images and pick your favorites instead of accepting whatever comes first.

## [1.3.0] - 2026-01-21

### Added

- **Preset profiles**: save, load, rename, and delete preset configurations for quick switching between different image generation setups.
- Preset profiles card with responsive UI that works at all window sizes and mobile devices.

### Changed

- Presets stored in separate extension storage key to prevent race conditions and avoid circular references.
- Presets excluded from character-specific settings to avoid data bloat.

## [1.2.1] - 2026-01-19

### Added

- Persist full extension settings to Character Cards V2 via `writeExtensionField` so settings are shareable when exporting characters.

### Changed

- Save and restore full extension snapshots per-character (removed per-field checklist).
- Use `MODULE_NAME` consistently for settings and character metadata keys; updated log prefixes accordingly.
- Remove local cache fallback and legacy save methods; `writeExtensionField` is the single persistence path.
- Restore global defaults when no character is active so shareable settings don't leak to the homepage.
- Improve UI summary wording for zero delay between swipes.

### Notes

- This release requires SillyTavern host support for `writeExtensionField` to persist character-card data; without it the extension will log the attempt and continue to operate in-session.

## [1.2.2] - 2026-01-19

### Added

- Per-character reset control: a button in the settings panel to clear saved character snapshots and restore global defaults. When supported by the host, the character card is updated via `writeExtensionField`.

### Fixed

- Improve feedback and logging around per-character reset operations; show a toast on successful reset when `toastr` is available.


## [1.2.0] - 2026-01-18

### Added

- Per-character (shareable) settings: an opt-in feature to save selected prompt and model settings with a character card.
- Multi-select in settings to store any combination of: main prompt, positive/negative prompt instructions, example prompt, model queue (and its enabled state), and image count rule + values.

### Changed

- Settings persistence now supports saving and loading per-character overrides from character card data; selected fields are applied on character/chat change.

### Notes

- This is opt-in (enable per-character settings in the extension settings) and defaults fall back to global settings when a field is not selected.

## [1.1.3] - 2026-01-18

### Added

- `auto_multi_model_queue_enabled` toggle in settings to enable/disable the saved model queue while preserving configured models.
- Visible UI state: model-queue panel now grays out and disables controls when the queue is turned off (toggle remains clickable).

### Changed

- Swipe planning now respects the model-queue toggle and falls back to the default swipe/model when disabled.
- Normalized and hardened `modelQueueEnabled` setting parsing to avoid stale/ambiguous values.
- Progress UI shows the active SD model name when the default model is being used instead of the literal placeholder.

### Misc

- Minor UI polish and bugfixes related to queue controls and summary text.

## [1.1.2] - 2026-01-18

### Fixed

- Improve deletion behavior to avoid "Invalid swipe ID" toasts.
- Ensure the progress HUD hides immediately when stopping queues.
- Add a placeholder message when the first image generation fails so subsequent swipes continue.
