# Image Generation Autopilot

**End‑to‑end SD automation: auto image tags ➜ auto image generation ➜ parallel selection dialog.**

This extension guides the AI assistant to emit `<pic prompt="...">` tags, automatically triggers Stable Diffusion generation, and presents a **live parallel selection dialog** so you can choose the best images from a batch.

## 📦 Quick Install

### ⭐ Recommended (Production)
```
https://github.com/djdembeck/SillyTavern-Image-Generation-Autopilot/tree/release
```
Clean install without test files. Copy this URL into SillyTavern: **Settings → Extensions → Install extension → GitHub tab**

### 🛠️ Development (Full repo with tests)
```
https://github.com/djdembeck/SillyTavern-Image-Generation-Autopilot
```
Use this if you're contributing or debugging.

---

## ✅ Requirements

- SillyTavern v1.12.0 or newer
- Built-in stable-diffusion extension enabled and configured
- Active SD provider (local or remote) configured in SillyTavern

---

## ✨ What it does

- **Prompt-driven image generation**: The AI includes `<pic prompt="detailed description">` tags in its responses
- **Automatic detection**: When the AI wants an image, the extension automatically opens the generation dialog
- **Parallel Selection Dialog**: Generates multiple images concurrently and displays them in a live grid as they complete
- **Interactive selection**: Pick your favorite images from the batch, choose where to insert them
- **Prompt injection + regex matching**: Guide the AI to consistently include image tags with customizable rules
- **Preset profiles**: Save, load, rename, and delete preset configurations for quick switching between setups
- **Global progress HUD**: Track generation status with a stop button to cancel all pending images
- **Message toolbar action**: Re-run generation on any image message
- **Concurrency control**: Configure how many images generate simultaneously (1-8)

---

## 🧭 How it works (complete flow)

### 1. Prompt Injection
The extension injects guidance into the AI's context, encouraging it to include `<pic prompt="...">` tags when describing scenes. You control:
- **Main prompt**: Core instructions for when/how to add images
- **Positive/Negative instructions**: Style requirements and things to avoid
- **Example prompt**: A "gold standard" prompt for the AI to emulate
- **Count rules**: Exact, minimum, or maximum number of images per reply

### 2. Automatic Detection
When the AI includes `<pic>` tags in its response, the extension automatically:
- Extracts the prompts using the configured regex
- Opens the **Image Selection Dialog**
- Begins parallel generation

You can also manually trigger generation by clicking the **paintbrush icon** on any message.

### 3. The Image Selection Dialog

This is the heart of the 2.0 experience. The dialog shows:

**Live Generation Grid**
- Images appear in real-time as they complete
- Each slot shows its status: pending, generating, complete, or error
- The model name is displayed for each completed image

**Interactive Controls**
- **Select/Deselect**: Click the checkbox on any image to select it
- **Lightbox view**: Click any image to see it full-size
- **Regenerate**: Not happy with an image? Click the refresh icon to regenerate just that one
- **Destination toggle**: Choose between inserting into the **current message** or a **new message**
- **Keep Selected**: Insert all selected images at once
- **Cancel**: Close the dialog and discard all images

**Parallel Generation**
- Images generate concurrently based on your **concurrency limit** (1-8)
- The progress HUD at the bottom shows: `Generating 3 of 8... (ModelName)`
- A **Stop** button lets you cancel all pending generations instantly

### 4. Image Insertion
After clicking **"Keep Selected"**:
- Selected images are inserted according to your **insert mode** setting:
  - **Inline**: Images appear within the message text
  - **Replace marker**: Replaces a specific marker in the message
  - **New message**: Creates a new message with just the images

### 5. Progress HUD
A global progress indicator appears whenever images are generating:
- Shows current status (e.g., "Generating 3 of 8")
- Displays the active model name
- Includes a **Stop** button to cancel everything

**Note:** Only SD-generated gallery messages are automated. Manual uploads are ignored.

---

## ⚙️ Key settings

| Area                             | Purpose                                                                    |
| -------------------------------- | -------------------------------------------------------------------------- |
| **Enable auto image generation** | Turns the `<pic prompt>` automation on/off.                                |
| **Insert mode**                  | Where images go: inline, replace marker, or new message.                   |
| **Concurrency**                  | How many images generate in parallel (1-8). Higher = faster, more API load.|
| **Default images per model**     | Baseline count when the model queue is empty.                              |
| **Model queue**                  | Run multiple SD models with per-model counts for variety.                  |
| **Prompt injection**             | Main prompt, positive/negative rules, example prompt, and count rules.     |
| **Preset profiles**              | Save, load, rename, and delete preset configurations.                      |
| **Debug mode**                   | Enable verbose logging for troubleshooting.                                |

---

## 🧪 Prompt guidance tips

Use these fields to keep image tags consistent:

- **Main prompt**: Global rules (e.g., "Insert image tags at the end of each reply describing scenes").
- **Positive instructions**: Required style or composition details (e.g., "Always describe lighting and atmosphere").
- **Negative instructions**: Forbidden elements or words (e.g., "Don't describe violent content").
- **Example prompt**: A single "gold standard" prompt to emulate.
- **Count rules**: exact/min/max `<pic prompt>` tags per reply.

### Example main prompt:
```
When describing scenes, insert <pic prompt="detailed scene description"> tags at the end of your reply. Only include the description inside the quotes, no other text.
```

### Example positive instructions:
```
Include lighting details, mood, time of day, and camera angle in each image description.
```

---

## 🆘 Troubleshooting

- **No images generating**: 
  - Confirm SD extension is enabled and configured in SillyTavern
  - Check that the paintbrush icon appears on generated images
  - Verify your SD provider is responding

- **Too many requests / rate limiting**: 
  - Reduce the **concurrency** setting (try 2-3)
  - Increase delay between requests
  - Check your provider's rate limits

- **Provider throttles or errors**: 
  - Start with lower concurrency (1-2) and tune up gradually
  - Some providers limit parallel requests

- **Images not appearing in dialog**: 
  - Check browser console for errors
  - Enable **debug mode** in settings for verbose logging
  - Ensure the SD provider is returning valid images

- **Dialog not opening**: 
  - Verify auto image generation is enabled
  - Check that `<pic>` tags are present in the AI response
  - Try clicking the paintbrush icon manually

---

## 💡 Bonus

**Save on AI costs** with this NanoGPT referral link:

Get a **5% discount** on web usage when you sign up: https://nano-gpt.com/r/NeDEp3UR

NanoGPT provides affordable AI API access and can be used alongside this extension if you experiment with alternative image generation providers.

---

## 🙏 Credits

- UI styling inspired by Pathweaver's extension design.
- Auto-generation behavior inspired by wickedcode01/st-image-auto-generation (clean-room).

---

## 🧰 Development notes

- No bundler needed; the extension runs directly in the browser context.
- Settings live under `extensionSettings.autoMultiImageSwipes`.
- Core components:
  - `ImageSelectionDialog`: Manages the selection UI and user interaction
  - `ParallelGenerator`: Handles concurrent generation with configurable limits
  - `GenerationDetector`: Listens to SillyTavern events for completion detection
  - `StateManager`: Manages generation state and cleanup
- Licensed under MIT (see `LICENSE`).
- AI developer: gemini-3-flash-preview via OhMyOpenCode.
