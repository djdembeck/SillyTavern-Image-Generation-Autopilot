# Image Generation Autopilot

**End‑to‑end SD automation: auto image tags ➜ auto image generation ➜ auto swipes.**
This extension guides the assistant to emit `<pic prompt="...">` tags, triggers SD generation automatically, and then queues extra swipes so every reply yields a predictable batch of images.

**Badges:**

- ✅ SillyTavern v1.12.0+
- ✅ Requires built-in stable-diffusion extension
- ✅ Works with NanoGPT and other SD providers

---

## ✨ What it does

- **Auto image generation** from `<pic prompt>` tags (inline, replace, or new message).
- **Auto swipes** on each generated image message (per-model counts).
- **Prompt injection + regex matching** to guide consistent image tags.
- **Preset profiles** to save, load, rename, and delete preset configurations for quick switching between different image generation setups.
- **Global progress HUD** with a stop button.
- **Message toolbar action** to re-run auto-swipes on image messages.
- **Rate-limit friendly** with configurable delay.

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

## 🧭 Auto image + auto swipes flow

1. **Prompt injection** nudges the assistant to include `<pic prompt="...">` tags.
2. **Auto generation** uses those tags to request SD images (inline/replace/new message).
3. **Auto swipes** fire extra swipes for each generated image message.
4. **Progress HUD** shows status and lets you stop everything instantly.

**Note:** Only SD-generated gallery messages are automated. Manual uploads are ignored.

---

## ⚙️ Key settings (quick map)

| Area                             | Purpose                                                                |
| -------------------------------- | ---------------------------------------------------------------------- |
| **Enable auto image generation** | Turns the `<pic prompt>` automation on/off.                            |
| **Insert mode**                  | Inline, replace marker, or new message.                                |
| **Enable auto-swipes**           | Triggers swipe queues on SD-generated messages.                        |
| **Default swipes per model**     | Baseline count when the model queue is empty.                          |
| **Model queue**                  | Run multiple SD models with per-model counts.                          |
| **Delay between swipes**         | Protects against provider throttles.                                   |
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
- **Too many requests**: increase delay or reduce swipe counts.
- **Provider throttles**: start with 1500ms delay and tune down.
- **Old chats auto-swipe**: file an issue with repro steps.

---

## 🙏 Credits

- UI styling inspired by Pathweaver’s extension design.
- Auto-generation behavior inspired by wickedcode01/st-image-auto-generation (clean-room).

---

## 🧰 Development notes

- No bundler needed; the extension runs directly in the browser context.
- Settings live under `extensionSettings.autoMultiImageSwipes`.
- Licensed under MIT (see `LICENSE`).
- AI developer: GitHub Copilot (GPT-5.2-Codex).
