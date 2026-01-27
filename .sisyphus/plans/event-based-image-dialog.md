# Event-Based Image Generation with Selection Dialog

## Context

### Original Request
Replace the current DOM-based polling approach with event-based tracking, and replace the sequential swipe workflow with a parallel image generation dialog where users can select which images to keep.

### Interview Summary
**Key Discussions**:
- Event tracking: Use `MESSAGE_RECEIVED` event with source='extension' instead of polling for hourglass CSS classes
- Dialog workflow: Grid-based image selection replaces automated swipes
- Parallel generation: Default 4 concurrent, configurable 1-8
- Model queue: Preserve multi-model support in dialog
- Triggers: Both `<pic prompt>` tags and paintbrush clicks open dialog
- Testing: Add unit tests using bun:test for core logic

**Research Findings**:
- SillyTavern emits `MESSAGE_RECEIVED` after SD adds image (line 4487 of SD module)
- No `SD_GENERATION_COMPLETE` event exists - design for future upstream addition
- SillyTavern `Popup` class supports wide/large modes, custom buttons, onClosing hooks
- Current extension has memory leaks in `state.generationStates` (never cleaned up)
- Current polling uses 250ms intervals with 120s timeout

### Metis Review
**Identified Gaps** (addressed):
- Memory leak in state.generationStates → Task 1 includes cleanup logic
- Race conditions in state updates → Abstraction layer with atomic operations
- No migration plan → Breaking change documented, clean replacement
- Test infrastructure missing → Task 0 sets up bun:test

---

## Work Objectives

### Core Objective
Replace fragile DOM polling with event-based generation tracking, and replace sequential swipe automation with a parallel generation dialog that lets users select which images to keep.

### Concrete Deliverables
- Event-based generation completion detection (MESSAGE_RECEIVED hook)
- Image selection dialog with placeholder grid and live updates
- Parallel generation engine with configurable concurrency
- Model queue integration for multi-model parallel generation
- Unit tests for core logic modules
- Updated settings UI for concurrency configuration

### Definition of Done
- [x] `bun test` passes with all unit tests green
- [x] Dialog opens on `<pic prompt>` tag detection
- [x] Dialog opens on paintbrush button click
- [x] Images generate in parallel (up to concurrency limit)
- [x] Grid shows placeholders → completed images or error states
- [x] User can select/deselect images, use Select All/Deselect All
- [x] "Keep Selected" inserts images to chosen destination
- [x] Close during generation shows confirmation prompt
- [x] Old swipe workflow code removed
- [x] No memory leaks (state cleanup verified)

### Must Have
- Event-based detection replaces all DOM polling
- Dialog with click-to-select grid
- Parallel generation with concurrency limit
- Model queue support (multi-model in same session)
- Error placeholder for failed generations
- Select All / Deselect All buttons
- Destination dropdown (current message / new message)
- Confirmation on close during generation
- State cleanup on chat change / completion

### Must NOT Have (Guardrails)
- **NO** drag-to-reorder in grid (explicitly excluded)
- **NO** carousel/swipe gestures (explicitly excluded)
- **NO** mobile-specific optimizations (unless requested later)
- **NO** over-abstraction (one strategy, not factory pattern)
- **NO** modifications to SillyTavern core files
- **NO** external dependencies beyond what ST provides
- **NO** JSDoc for every private function (only public APIs)
- **NO** per-image model selection (complex, out of scope)

---

## Verification Strategy (MANDATORY)

### Test Decision
- **Infrastructure exists**: NO (setting up)
- **User wants tests**: YES (unit tests for core logic)
- **Framework**: bun:test

### Test Structure

Each core module has corresponding test file:

| Module | Test File | Coverage |
|--------|-----------|----------|
| Generation completion detection | `src/__tests__/generation-events.test.js` | Event subscription, completion detection, cleanup |
| Parallel generation engine | `src/__tests__/parallel-generator.test.js` | Concurrency limits, failure handling, cancellation |
| State management | `src/__tests__/state-manager.test.js` | State updates, cleanup, memory leak prevention |
| Dialog state | `src/__tests__/dialog-state.test.js` | Selection toggle, Select All, confirmation |

---

## Task Flow

```
Task 0 (Test Setup)
       ↓
Task 1 (State Management) ─────→ Task 2 (Event Detection) 
       ↓                                    ↓
Task 3 (Parallel Engine) ←──────────────────┘
       ↓
Task 4 (Dialog UI)
       ↓
Task 5 (Integration) 
       ↓
Task 6 (Cleanup & Polish)
```

## Parallelization

| Group | Tasks | Reason |
|-------|-------|--------|
| A | 1, 2 | Can develop in parallel after Task 0 |

| Task | Depends On | Reason |
|------|------------|--------|
| 1 | 0 | Needs test infrastructure |
| 2 | 0 | Needs test infrastructure |
| 3 | 1, 2 | Uses state manager and event detection |
| 4 | 3 | Needs parallel engine for live updates |
| 5 | 4 | Integration requires all components |
| 6 | 5 | Cleanup after integration |

---

## TODOs

- [x] 0. Set Up Test Infrastructure

  **What to do**:
  - Create `bunfig.toml` with test configuration
  - Create `src/__tests__/` directory structure
  - Add example test to verify setup works
  - Update `package.json` with test script if needed

  **Must NOT do**:
  - Install external test dependencies (use bun:test built-in)
  - Create complex test utilities (keep simple)

  **Parallelizable**: NO (foundation for all other tasks)

  **References**:
  - Bun test docs: https://bun.sh/docs/cli/test
  - Current project structure: `/home/djdembeck/projects/github/SillyTavern-Image-Generation-Autopilot/`

  **Acceptance Criteria**:
  - [x] `bunfig.toml` exists with test config
  - [x] `src/__tests__/example.test.js` exists with passing test
  - [x] `bun test` → 1 test passes

  **Commit**: YES
  - Message: `chore: add bun test infrastructure`
  - Files: `bunfig.toml`, `src/__tests__/example.test.js`

---

- [x] 1. Refactor State Management with Cleanup

  **What to do**:
  - Extract state management into `src/state-manager.js` module
  - Add explicit cleanup methods for all state collections
  - Implement `resetGenerationState()` that clears stale entries
  - Add `onChatChanged` cleanup hook
  - Write unit tests for state lifecycle

  **Must NOT do**:
  - Change the state structure for settings (backward compatibility)
  - Add new dependencies
  - Over-engineer with complex state machine

  **Parallelizable**: YES (with Task 2)

  **References**:
  - Current state definition: `index.js:49-77` - `state` object structure
  - Memory leak location: `index.js:4252-4264` - `state.generationStates` grows indefinitely
  - Cleanup pattern: `index.js:2744` - `resetPerChatState()` function
  - Chat change handling: `index.js:5150` - `CHAT_CHANGED` event subscription

  **Acceptance Criteria**:
  - [x] `src/state-manager.js` exports `StateManager` class
  - [x] `StateManager.cleanup()` clears `generationStates`, `runningMessages`, `seenMessages`
  - [x] `StateManager.resetForChat(chatToken)` handles chat switch
  - [x] `bun test src/__tests__/state-manager.test.js` → all pass
  - [x] No memory growth when switching chats (verify via test)

  **Commit**: YES
  - Message: `refactor(state): extract state manager with cleanup lifecycle`
  - Files: `src/state-manager.js`, `src/__tests__/state-manager.test.js`

---

- [x] 2. Implement Event-Based Generation Detection

  **What to do**:
  - Create `src/generation-events.js` module
  - Subscribe to `MESSAGE_RECEIVED` with source filtering
  - Create abstraction layer `GenerationDetector` class
  - Implement `onGenerationComplete(callback)` API
  - Design for future `SD_GENERATION_COMPLETE` event slot-in
  - Write unit tests for event detection

  **Must NOT do**:
  - Modify SillyTavern core files
  - Keep any DOM polling code in new module
  - Create complex inheritance hierarchy

  **Parallelizable**: YES (with Task 1)

  **References**:
  - SillyTavern events: `/home/djdembeck/projects/github/SillyTavern/public/scripts/events.js:1-99` - `event_types` and `eventSource`
  - SD module event emission: `/home/djdembeck/projects/github/SillyTavern/public/scripts/extensions/stable-diffusion/index.js:4487` - `MESSAGE_RECEIVED` with 'extension' source
  - Current event subscription: `index.js:5141-5174` - existing event hooks
  - Current polling: `index.js:4230-4286` - `isGenerationInProgress()` to replace

  **Acceptance Criteria**:
  - [x] `src/generation-events.js` exports `GenerationDetector` class
  - [x] `detector.onComplete(messageId => ...)` fires when SD adds image
  - [x] `detector.dispose()` unsubscribes from all events
  - [x] Abstraction allows swapping to `SD_GENERATION_COMPLETE` with config change
  - [x] `bun test src/__tests__/generation-events.test.js` → all pass

  **Commit**: YES
  - Message: `feat(events): add event-based generation completion detection`
  - Files: `src/generation-events.js`, `src/__tests__/generation-events.test.js`

---

- [x] 3. Build Parallel Generation Engine

  **What to do**:
  - Create `src/parallel-generator.js` module
  - Implement concurrency-limited parallel execution
  - Integrate with model queue for multi-model support
  - Handle individual failures without stopping batch
  - Implement abort/cancel functionality
  - Track progress for each generation slot
  - Write unit tests for parallel behavior

  **Must NOT do**:
  - Implement retry logic (keep simple for v1)
  - Add rate limiting detection (future enhancement)
  - Create per-image model selection UI

  **Parallelizable**: NO (depends on Tasks 1 and 2)

  **References**:
  - Model queue logic: `index.js:1394-1434` - `getSwipePlan()` returns array of `{id, count}`
  - Current sequential generation: `index.js:4395-4565` - `runSequentialSwipePlan()` pattern
  - SD slash command call: `index.js:2903-2952` - `callSdSlash(prompt, quiet)` function
  - Concurrency default: 4 parallel (from interview)
  - Abort pattern: `index.js:3063` - `state.chatToken` for cancellation

  **Acceptance Criteria**:
  - [x] `src/parallel-generator.js` exports `ParallelGenerator` class
  - [x] `generator.run(prompts, options)` returns Promise with results array
  - [x] Respects `concurrencyLimit` option (default 4)
  - [x] Model queue integration: cycles through models from queue
  - [x] Failed generations return `{status: 'error', prompt, error}` in results
  - [x] `generator.abort()` cancels pending (not in-flight) generations
  - [x] Progress callback: `onProgress({completed, failed, total, slot})`
  - [x] `bun test src/__tests__/parallel-generator.test.js` → all pass

  **Commit**: YES
  - Message: `feat(generator): add parallel generation engine with concurrency control`
  - Files: `src/parallel-generator.js`, `src/__tests__/parallel-generator.test.js`

---

- [x] 4. Implement Image Selection Dialog

  **What to do**:
  - Create `src/image-dialog.js` module
  - Use SillyTavern's `Popup` class (POPUP_TYPE.TEXT, wide, large)
  - Build grid layout with placeholder slots
  - Implement click-to-toggle selection
  - Add "Select All" / "Deselect All" buttons
  - Add destination dropdown (current message / new message)
  - Implement `onClosing` confirmation when generations pending
  - Update grid slots as images complete (via callback from ParallelGenerator)
  - Show error placeholder for failed slots
  - Create CSS for dialog styling

  **Must NOT do**:
  - Implement drag-to-reorder
  - Add mobile touch gestures
  - Use external gallery libraries (nanogallery2)

  **Parallelizable**: NO (depends on Task 3)

  **References**:
  - SillyTavern Popup: `/home/djdembeck/projects/github/SillyTavern/public/scripts/popup.js:137-400` - `Popup` class with options
  - Popup options: `wide: true`, `large: true`, `customButtons`, `onClosing`
  - Custom buttons pattern: `popup.js:62-68` - `CustomPopupButton` typedef
  - Existing progress UI: `index.js:2670-2760` - `ensureGlobalProgressElement()` pattern
  - Current dialog styling: `style.css` - existing extension styles to match

  **Acceptance Criteria**:
  - [x] `src/image-dialog.js` exports `ImageSelectionDialog` class
  - [x] `dialog.show(prompts, options)` returns Promise with selected images
  - [x] Grid shows N placeholder slots based on total images
  - [x] Clicking image toggles selection (visual border/checkmark)
  - [x] "Select All" / "Deselect All" buttons work
  - [x] Destination dropdown shows "Current Message" / "New Message"
  - [x] Closing during generation shows confirmation popup
  - [x] Error slots show red X or error icon
  - [x] "Keep Selected" returns `{images: [...], destination: 'current'|'new'}`
  - [x] Manual verification: Open dialog, generate 4 images, select 2, confirm → 2 images returned

  **Commit**: YES
  - Message: `feat(dialog): add image selection dialog with grid layout`
  - Files: `src/image-dialog.js`, `src/__tests__/dialog-state.test.js`, `style.css`

---

- [x] 5. Integrate Components and Replace Swipe Workflow

  **What to do**:
  - Wire `GenerationDetector` to `ParallelGenerator` completion tracking
  - Wire `ParallelGenerator` progress to `ImageSelectionDialog` updates
  - Replace `handleIncomingMessage()` to open dialog for `<pic>` tags
  - Replace paintbrush click handler to open dialog
  - Implement image insertion using selected destination
  - Add concurrency setting to settings UI and `defaultSettings`
  - Update `syncUiFromSettings()` for new concurrency input

  **Must NOT do**:
  - Keep old swipe code as fallback (clean break)
  - Break existing settings structure

  **Parallelizable**: NO (depends on Task 4)

  **References**:
  - Current entry point: `index.js:3056-3400` - `handleIncomingMessage()` function
  - Current swipe trigger: `index.js:4846-4870` - `queueAutoFill()` function
  - Settings sync: `index.js:2466-2668` - `syncUiFromSettings()` pattern
  - Default settings: `index.js:8-47` - `defaultSettings` object
  - Message insertion: `index.js:3564-3667` - `createPlaceholderImageMessage()` and media attachment
  - Settings UI: `settings.html` - add concurrency input field

  **Acceptance Criteria**:
  - [x] `<pic prompt="...">` tag in message → dialog opens with that prompt
  - [x] Paintbrush click → dialog opens for that message
  - [x] Concurrency slider in settings (1-8, default 4)
  - [x] "Current Message" destination → images added to triggering message
  - [x] "New Message" destination → new message created with selected images
  - [x] Progress visible in dialog during generation
  - [x] Manual verification:
    - Send message with `<pic prompt="a cat">` → dialog opens
    - Generate 4 images in parallel → all appear in grid
    - Select 2 images → click "Keep Selected"
    - Images inserted to message
  - [x] `bun test` → all tests still pass

  **Commit**: YES
  - Message: `feat(integration): wire dialog workflow replacing swipe automation`
  - Files: `index.js`, `settings.html`, `src/image-dialog.js`

---

- [x] 6. Remove Legacy Code and Polish

  **What to do**:
  - Remove `runSequentialSwipePlan()` and `runBurstSwipePlan()` functions
  - Remove `isGenerationInProgress()` DOM polling function
  - Remove `waitForMediaIncrement()` polling function
  - Remove `dispatchSwipe()` and related swipe helpers
  - Remove `monitorBurstCompletion()` function
  - Clean up unused state properties (`burstMode`, etc.)
  - Update README.md with new workflow documentation
  - Add CHANGELOG.md entry for breaking changes
  - Final test run and manual verification

  **Must NOT do**:
  - Remove model queue feature (still used)
  - Remove progress HUD (reused by dialog)
  - Remove settings that are still relevant

  **Parallelizable**: NO (final cleanup)

  **References**:
  - Sequential swipe: `index.js:4395-4565` - `runSequentialSwipePlan()` to remove
  - Burst swipe: `index.js:4567-4720` - `runBurstSwipePlan()` to remove
  - DOM polling: `index.js:4230-4297` - `isGenerationInProgress()` to remove
  - Media polling: `index.js:4199-4228` - `waitForMediaIncrement()` to remove
  - Swipe dispatch: `index.js:4099-4111` - `dispatchSwipe()` to remove
  - README: `README.md` - update workflow documentation
  - Settings: `index.js:8-47` - remove `burstMode`, `burstThrottleMs` from defaults

  **Acceptance Criteria**:
  - [x] `runSequentialSwipePlan` function removed
  - [x] `runBurstSwipePlan` function removed
  - [x] `isGenerationInProgress` function removed
  - [x] `waitForMediaIncrement` function removed
  - [x] `dispatchSwipe` function removed
  - [x] `burstMode` setting removed from `defaultSettings`
  - [x] README.md updated with new dialog workflow
  - [x] CHANGELOG.md documents breaking changes
  - [x] `bun test` → all tests pass
  - [x] `grep -r "runSequentialSwipePlan\|runBurstSwipePlan\|isGenerationInProgress" index.js` → no matches
  - [x] Manual verification: Full workflow test (trigger → dialog → select → insert)

  **Commit**: YES
  - Message: `refactor: remove legacy swipe workflow and DOM polling code`
  - Files: `index.js`, `README.md`, `CHANGELOG.md`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 0 | `chore: add bun test infrastructure` | bunfig.toml, src/__tests__/example.test.js | `bun test` |
| 1 | `refactor(state): extract state manager with cleanup lifecycle` | src/state-manager.js, tests | `bun test` |
| 2 | `feat(events): add event-based generation completion detection` | src/generation-events.js, tests | `bun test` |
| 3 | `feat(generator): add parallel generation engine with concurrency control` | src/parallel-generator.js, tests | `bun test` |
| 4 | `feat(dialog): add image selection dialog with grid layout` | src/image-dialog.js, style.css, tests | `bun test` |
| 5 | `feat(integration): wire dialog workflow replacing swipe automation` | index.js, settings.html | `bun test` + manual |
| 6 | `refactor: remove legacy swipe workflow and DOM polling code` | index.js, README.md, CHANGELOG.md | `bun test` + grep |

---

## Success Criteria

### Verification Commands
```bash
# All unit tests pass
bun test

# No legacy polling code remains
grep -r "isGenerationInProgress\|waitForMediaIncrement\|runSequentialSwipePlan" index.js
# Expected: no matches

# No memory leak indicators
grep -r "generationStates\[" index.js
# Expected: only in cleanup code, not growth
```

### Final Checklist
- [x] All "Must Have" features implemented
- [x] All "Must NOT Have" items absent
- [x] All unit tests pass
- [x] README documents new workflow
- [x] CHANGELOG documents breaking changes
- [x] Settings UI includes concurrency slider
- [x] Dialog works for both triggers (pic tags + paintbrush)
- [x] Model queue integration works
- [x] No console errors during normal operation
