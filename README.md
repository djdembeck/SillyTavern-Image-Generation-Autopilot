# Auto Multi-Image Swipes

Automatically queue Stable Diffusion message swipes so that every visible image generation request produces a predictable batch (default: four images). This UI extension watches for new media posts created by SillyTavern's built‑in **Image Generation** module (including NanoGPT providers) and reuses the existing paintbrush button to request additional swipes on the same message.

## Features

- Fire off extra swipes immediately after an image message is rendered so you always get the desired batch size.
- Works with any provider supported by the core Stable Diffusion extension (NanoGPT, NovelAI, Horde, etc.).
- Adjustable default swipe count (1‒12) and delay between requests to avoid rate limits.
- Queue multiple Stable Diffusion models with independent swipe counts so one prompt can explore several favorites automatically.
- Optional burst mode dispatches every swipe instantly so fast models don't get held up by slower ones.
- Respects manual overrides: stop/abort buttons, disabling the extension, or editing the message halts the automation.
- No new API keys or server plugins required.
- Inline drawer UI inside **Settings → Extensions** for quick toggles and live summaries.
- Global, sticky progress pill in the chat column mirrors SillyTavern MessageSummarize's UX so you always know what is running (with an inline stop button).

## Requirements

- SillyTavern v1.12.0 or newer.
- The built-in `stable-diffusion` extension must be enabled and configured (Chat Completion → NanoGPT is fine).

## Installation

### Recommended: Install via GitHub

1. In SillyTavern open **Settings → Extensions** and click **Install extension**.
2. Choose the **GitHub** tab, then paste `https://github.com/djdembeck/SillyTavern-auto-multi-image-swipes` as the repository URL.
3. Click **Install**, allow SillyTavern to reload scripts, then enable **Auto Multi-Image Swipes** from the extensions list.

## Configuration

The settings block exposes several knobs:

| Option                       | Description                                                                                                                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Enabled**                  | Master switch. Turn off to return to manual swiping.                                                                                                                                    |
| **Default swipes per model** | Number of automated swipes to queue for any new model entry (and the fallback when the queue is empty). Default `4`.                                                                    |
| **Delay between swipes**     | Milliseconds to wait between swipe requests. Useful if your backend enforces cooldowns. Default `800`.                                                                                  |
| **Burst mode**               | When enabled, every swipe is dispatched immediately and the extension waits in the background for the results. Disable it to run swipes sequentially using the configured delay.        |
| **Model queue**              | Add one or more SD models, each with its own swipe count. They run sequentially (order shown in the list). Leave the list empty to keep using the model that is active in the SD panel. |

The extension only touches messages whose media attachments have the `generated` source and the gallery display mode, so uploads or captions are ignored.

## How It Works

1. Listens for `CHARACTER_MESSAGE_RENDERED` events emitted by the Stable Diffusion extension.
2. When a qualifying message appears, it triggers the built-in `.sd_message_gen` button to request another swipe.
3. Repeats until the configured swipe plan (per-model counts) finishes, or until a request fails/gets canceled. Burst mode issues every swipe first and then monitors completion; sequential mode waits for each image before requesting the next.
4. Honors the global stop button, chat switches, and manual deletions by aborting outstanding queues.
5. Shows a small progress bar below the message while the queue is active.

## Credits

- The refreshed drawer and panel styling were inspired by Pathweaver, the beautifully polished SillyTavern extension UI. Huge thanks to its creators for the design spark.

## Troubleshooting

- **Nothing happens:** Ensure the Stable Diffusion extension is enabled and its paintbrush icon appears on generated messages. The manifest declares a dependency, so SillyTavern will refuse to load this extension if SD is missing.
- **Too many requests:** Increase the delay or lower the target count.
- **NanoGPT throttling:** NanoGPT's image endpoints can be touchy. Start with `delay = 1500ms` and work downward.
- **Old chats auto-swipe on load:** This should not happen because the extension filters for new `extension`-sourced renders. If you notice otherwise, file an issue.

## Development Notes

- No bundler needed; `index.js` runs directly in the browser context.
- Settings are stored under `extensionSettings.autoMultiImageSwipes`.
- Licensed under MIT (see `LICENSE`).
