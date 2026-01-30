# Image Generation Autopilot

**End‑to‑end SD automation: auto image tags ➜ auto image generation ➜ parallel selection dialog.**
This extension guides the assistant to emit `<pic prompt="...">` tags, triggers SD generation automatically, and opens a parallel selection dialog so you can choose the best images from a batch.

**Badges:**

- ✅ SillyTavern v1.12.0+
- ✅ Requires built-in stable-diffusion extension
- ✅ Works with NanoGPT and other SD providers

---

## ✨ What it does

- **Auto image generation** from `<pic prompt>` tags (inline, replace, or new message).
- **Parallel Selection Dialog**: Generates multiple images in parallel and lets you pick which ones to keep.
- **Prompt injection + regex matching** to guide consistent image tags.
- **Preset profiles** to save, load, rename, and delete preset configurations for quick switching between different image generation setups.
- **Global progress HUD** with a stop button.
- **Message toolbar action** to re-run generation on image messages.
- **Concurrency control**: Configure how many images to generate at once.

---

## ✅ Requirements

- SillyTavern v1.12.0 or newer.
- The built-in stable-diffusion extension must be enabled and configured.

---

## 📦 Install (GitHub)

1. In SillyTavern, open **Settings → Extensions** and click **Install extension**.
2. Choose the **GitHub** tab and paste: `https://github.com/djdembeck/SillyTavern-Image-Generation-Autopilot`
3. Click **Install**, allow reloads, then enable **Image Generation Autopilot**.

---

## 🧭 Auto image + selection dialog flow

1. **Prompt injection** nudges the assistant to include `<pic prompt="...">` tags.
2. **Auto generation** detects these tags and opens the **Image Selection Dialog**.
3. **Parallel Generation**: The extension generates multiple images in parallel (respecting your concurrency limit).
4. **Selection**: You see a live grid of images as they arrive. Select the ones you like and click **"Keep Selected"**.
5. **Progress HUD** shows status and lets you stop everything instantly.

**Note:** Only SD-generated gallery messages are automated. Manual uploads are ignored.

---

## ⚙️ Key settings (quick map)

| Area                             | Purpose                                                                |
| -------------------------------- | ---------------------------------------------------------------------- |
| **Enable auto image generation** | Turns the `<pic prompt>` automation on/off.                            |
| **Insert mode**                  | Inline, replace marker, or new message.                                |
| **Concurrency**                  | How many images to generate in parallel (1-8).                         |
| **Default images per model**     | Baseline count when the model queue is empty.                          |
| **Model queue**                  | Run multiple SD models with per-model counts.                          |
| **Prompt injection**             | Main prompt, positive/negative rules, example prompt, and count rules. |
| **Preset profiles**              | Save, load, rename, and delete preset configurations.                  |

---

## 🧪 Prompt guidance tips

Use these fields to keep image tags consistent:

- **Main prompt**: global rules (e.g., restate core traits every time).
- **Positive instructions**: required style or composition details.
- **Negative instructions**: forbidden elements or words.
- **Example prompt**: a single “gold standard” prompt to emulate.
- **Count rules**: exact/min/max `<pic prompt>` tags per reply.

---

## 🆘 Troubleshooting

- **No images**: confirm SD is enabled and the paintbrush appears on generated images.
- **Too many requests**: reduce concurrency or increase delay.
- **Provider throttles**: start with lower concurrency and tune up.
- **Old approach**: The legacy "auto-swipes" approach has been replaced by the new event-based parallel dialog system.

---

## 🙏 Credits

- UI styling inspired by Pathweaver’s extension design.
- Auto-generation behavior inspired by wickedcode01/st-image-auto-generation (clean-room).

---

## 🧰 Development notes

- No bundler needed; the extension runs directly in the browser context.
- Settings live under `extensionSettings.autoMultiImageSwipes`.
- Licensed under MIT (see `LICENSE`).
- AI developer: gemini-3-flash-preview via OhMyOpenCode.
