# Auto Multi-Image Swipes

Automatically queue Stable Diffusion message swipes so that every visible image generation request produces a predictable batch (default: four images). This UI extension watches for new media posts created by SillyTavern's built‑in **Image Generation** module (including NanoGPT providers) and reuses the existing paintbrush button to request additional swipes on the same message.

## Features

- Fire off extra swipes immediately after an image message is rendered so you always get the desired batch size.
- Works with any provider supported by the core Stable Diffusion extension (NanoGPT, NovelAI, Horde, etc.).
- Adjustable target image count (1‒12) and delay between swipe requests to avoid rate limits.
- Respects manual overrides: stop/abort buttons, disabling the extension, or editing the message halts the automation.
- No new API keys or server plugins required.
- Inline drawer UI inside **Settings → Extensions** for quick toggles and live summaries.
- Visual progress bar injected under each message while queued swipes execute, so you always know how many images remain.
- Optional Stable Diffusion model override so automated swipes can come from a different model than manual generations.

## Requirements

- SillyTavern v1.12.0 or newer.
- The built-in `stable-diffusion` extension must be enabled and configured (Chat Completion → NanoGPT is fine).
- Place this folder inside `SillyTavern/public/scripts/extensions/third-party/auto-multi-image-swipes` (or use the "Install extension" workflow and point it at this repo).

## Installation

1. Copy the entire `auto-multi-image-swipes` directory into `public/scripts/extensions/third-party/` inside your SillyTavern installation.
2. Restart (or reload) SillyTavern.
3. Open **Settings → Extensions**, find **Auto Multi-Image**, and toggle it on.

## Configuration

The settings block exposes two knobs:

| Option | Description |
| --- | --- |
| **Enabled** | Master switch. Turn off to return to manual swiping. |
| **Images per request** | Total media attachments to keep per message (includes the first image). Default `4`. |
| **Delay between swipes** | Milliseconds to wait between swipe requests. Useful if your backend enforces cooldowns. Default `800`. |
| **Image model override** | Select a specific SD model for automated swipes. Leave on the default entry to reuse the currently selected model in the SD panel. |

The extension only touches messages whose media attachments have the `generated` source and the gallery display mode, so uploads or captions are ignored.

## How It Works

1. Listens for `CHARACTER_MESSAGE_RENDERED` events emitted by the Stable Diffusion extension.
2. When a qualifying message appears, it triggers the built-in `.sd_message_gen` button to request another swipe.
3. Repeats until the message holds the configured number of attachments, or until a request fails/gets canceled.
4. Honors the global stop button, chat switches, and manual deletions by aborting outstanding queues.
5. Shows a small progress bar below the message while the queue is active.

## Troubleshooting

- **Nothing happens:** Ensure the Stable Diffusion extension is enabled and its paintbrush icon appears on generated messages. The manifest declares a dependency, so SillyTavern will refuse to load this extension if SD is missing.
- **Too many requests:** Increase the delay or lower the target count.
- **NanoGPT throttling:** NanoGPT's image endpoints can be touchy. Start with `delay = 1500ms` and work downward.
- **Old chats auto-swipe on load:** This should not happen because the extension filters for new `extension`-sourced renders. If you notice otherwise, file an issue.

## Development Notes

- No bundler needed; `index.js` runs directly in the browser context.
- Settings are stored under `extensionSettings.autoMultiImageSwipes`.
- Licensed under MIT (see `LICENSE`).
