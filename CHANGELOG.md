# Changelog

All notable changes to this project are documented in this file.

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
