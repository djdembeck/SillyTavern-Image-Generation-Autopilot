const MODULE_NAME = 'autoMultiImageSwipes';
const defaultSettings = Object.freeze({
    enabled: true,
    targetCount: 4,
    delayMs: 800,
    swipeTimeoutMs: 120000,
    swipeModel: '',
});

const state = {
    initialized: false,
    seenMessages: new Set(),
    runningMessages: new Map(),
    chatToken: 0,
    ui: null,
    progress: new Map(),
    modelLabels: new Map(),
    styleInjected: false,
};

function resolveTemplateRoot() {
    /** @type {HTMLScriptElement[]} */
    const candidates = [];

    if (document.currentScript instanceof HTMLScriptElement) {
        candidates.push(document.currentScript);
    }

    candidates.push(...Array.from(document.querySelectorAll('script[src*="scripts/extensions/"]')));

    const ranked = [
        (script) => script?.src?.includes('/auto-multi-image-swipes/'),
        (script) => script?.src?.includes('/Multi-Image-Gen/'),
        () => true,
    ];

    for (const predicate of ranked) {
        const script = candidates.find(candidate => predicate(candidate));
        if (!script) {
            continue;
        }

        const match = script.src.match(/scripts\/extensions\/(.+)\/index\.js/);
        if (match?.[1]) {
            return match[1];
        }
    }

    return `third-party/${MODULE_NAME}`;
}

const TEMPLATE_ROOT = resolveTemplateRoot();
const STYLE_ELEMENT_ID = 'auto-multi-image-swipes-style';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const log = (...args) => console.log('[AutoMultiImage]', ...args);

function injectStyles() {
    if (state.styleInjected || document.getElementById(STYLE_ELEMENT_ID)) {
        state.styleInjected = true;
        return;
    }

    const style = document.createElement('style');
    style.id = STYLE_ELEMENT_ID;
    style.textContent = `
        .auto-multi-progress {
            margin-top: 6px;
            padding: 8px;
            border-radius: 6px;
            background: rgba(0, 0, 0, 0.35);
            border: 1px solid rgba(255, 255, 255, 0.08);
            font-size: 0.8rem;
        }

        .auto-multi-progress__label {
            margin: 0;
            font-weight: 600;
            letter-spacing: 0.02em;
        }

        .auto-multi-progress__track {
            position: relative;
            width: 100%;
            height: 4px;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.15);
            overflow: hidden;
            margin-top: 6px;
        }

        .auto-multi-progress__bar {
            position: absolute;
            top: 0;
            left: 0;
            height: 100%;
            width: 0;
            background-image: linear-gradient(90deg, #7bb5ff, #8a7bff);
            transition: width 0.25s ease;
        }

        .auto-multi-progress.waiting .auto-multi-progress__bar {
            background-image: repeating-linear-gradient(
                120deg,
                rgba(123, 181, 255, 0.9),
                rgba(123, 181, 255, 0.9) 10px,
                rgba(138, 123, 255, 0.8) 10px,
                rgba(138, 123, 255, 0.8) 20px
            );
            animation: auto-multi-progress-stripes 1.2s linear infinite;
        }

        @keyframes auto-multi-progress-stripes {
            from { transform: translateX(-20px); }
            to { transform: translateX(0); }
        }
    `;

    document.head.appendChild(style);
    state.styleInjected = true;
}

function getCtx() {
    return SillyTavern.getContext();
}

function ensureSettings() {
    const { extensionSettings } = getCtx();
    if (!extensionSettings[MODULE_NAME]) {
        extensionSettings[MODULE_NAME] = { ...defaultSettings };
    }

    for (const [key, value] of Object.entries(defaultSettings)) {
        if (typeof extensionSettings[MODULE_NAME][key] === 'undefined') {
            extensionSettings[MODULE_NAME][key] = value;
        }
    }

    return extensionSettings[MODULE_NAME];
}

function getSettings() {
    return ensureSettings();
}

function saveSettings() {
    getCtx().saveSettingsDebounced();
    syncUiFromSettings();
}

function clampCount(value) {
    const numeric = Number(value);
    if (Number.isNaN(numeric)) {
        return defaultSettings.targetCount;
    }
    return Math.max(1, Math.min(12, Math.round(numeric)));
}

function clampDelay(value) {
    const numeric = Number(value);
    if (Number.isNaN(numeric)) {
        return defaultSettings.delayMs;
    }
    return Math.max(0, Math.min(10000, Math.round(numeric)));
}

async function buildSettingsPanel() {
    const root = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    if (!root) {
        console.warn('[AutoMultiImage] Could not find extension settings container.');
        return;
    }

    const existing = document.getElementById('auto_multi_image_container');
    if (existing) {
        existing.remove();
    }

    let html = '';
    try {
        html = await getCtx().renderExtensionTemplateAsync(TEMPLATE_ROOT, 'settings');
    } catch (error) {
        console.error('[AutoMultiImage] Failed to load settings template', error);
        return;
    }

    const template = document.createElement('template');
    template.innerHTML = html.trim();
    const container = template.content.firstElementChild;
    if (!container) {
        console.warn('[AutoMultiImage] Settings template empty');
        return;
    }

    root.appendChild(container);

    const enabledInput = /** @type {HTMLInputElement | null} */ (container.querySelector('#auto_multi_image_enabled'));
    const countInput = /** @type {HTMLInputElement | null} */ (container.querySelector('#auto_multi_image_target'));
    const delayInput = /** @type {HTMLInputElement | null} */ (container.querySelector('#auto_multi_image_delay'));
    const modelSelect = /** @type {HTMLSelectElement | null} */ (container.querySelector('#auto_multi_image_model'));
    const summary = /** @type {HTMLParagraphElement | null} */ (container.querySelector('#auto_multi_image_summary'));
    const refreshModelsButton = /** @type {HTMLButtonElement | null} */ (container.querySelector('#auto_multi_refresh_models'));

    if (!(enabledInput && countInput && delayInput && modelSelect && summary)) {
        console.warn('[AutoMultiImage] Settings template missing inputs');
        return;
    }

    enabledInput.addEventListener('change', () => {
        const current = getSettings();
        current.enabled = enabledInput.checked;
        saveSettings();
    });

    countInput.addEventListener('change', () => {
        const current = getSettings();
        current.targetCount = clampCount(countInput.value);
        countInput.value = String(current.targetCount);
        saveSettings();
    });

    delayInput.addEventListener('change', () => {
        const current = getSettings();
        current.delayMs = clampDelay(delayInput.value);
        delayInput.value = String(current.delayMs);
        saveSettings();
    });

    modelSelect.addEventListener('change', () => {
        const current = getSettings();
        current.swipeModel = modelSelect.value;
        saveSettings();
    });

    refreshModelsButton?.addEventListener('click', (event) => {
        event.preventDefault();
        syncModelSelectOptions(true);
    });

    state.ui = { container, enabledInput, countInput, delayInput, modelSelect, summary };
    syncModelSelectOptions();
    syncUiFromSettings();
}

function getSdModelOptions() {
    const select = document.getElementById('sd_model');
    if (!(select instanceof HTMLSelectElement)) {
        return [];
    }

    return Array.from(select.options).map((option) => ({
        value: option.value,
        label: option.textContent?.trim() || option.value || 'Unnamed model',
    })).filter(option => option.value);
}

function getModelLabel(value) {
    if (!value) {
        return 'the active Stable Diffusion model';
    }

    if (state.modelLabels.has(value)) {
        return state.modelLabels.get(value);
    }

    return value;
}

function syncModelSelectOptions(showFeedback = false) {
    if (!state.ui?.modelSelect) {
        return;
    }

    const select = state.ui.modelSelect;
    const { swipeModel } = getSettings();
    const options = getSdModelOptions();
    state.modelLabels = new Map(options.map(option => [option.value, option.label]));

    const previousSelection = swipeModel || '';
    select.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Use current Stable Diffusion model';
    select.appendChild(placeholder);

    for (const option of options) {
        const element = document.createElement('option');
        element.value = option.value;
        element.textContent = option.label;
        select.appendChild(element);
    }

    if (previousSelection && !state.modelLabels.has(previousSelection)) {
        const fallback = document.createElement('option');
        fallback.value = previousSelection;
        fallback.textContent = `${previousSelection} (missing)`;
        select.appendChild(fallback);
    }

    select.value = previousSelection;

    if (showFeedback) {
        log('Model list refreshed. Entries:', options.length);
    }
}

function handleDocumentChange(event) {
    if (!(event?.target instanceof HTMLSelectElement)) {
        return;
    }

    if (event.target.id === 'sd_model') {
        syncModelSelectOptions();
    }
}

function syncUiFromSettings() {
    if (!state.ui) return;
    const settings = getSettings();
    state.ui.enabledInput.checked = settings.enabled;
    state.ui.countInput.value = String(settings.targetCount);
    state.ui.delayInput.value = String(settings.delayMs);
    if (state.ui.modelSelect) {
        syncModelSelectOptions();
        state.ui.modelSelect.value = settings.swipeModel || '';
    }

    const extras = Math.max(0, settings.targetCount - 1);
    const modelLabel = settings.swipeModel ? getModelLabel(settings.swipeModel) : getModelLabel('');
    state.ui.summary.textContent = settings.enabled
        ? `Will request ${settings.targetCount} image${settings.targetCount === 1 ? '' : 's'} (${extras} extra swipe${extras === 1 ? '' : 's'}) with ${settings.delayMs} ms between swipes using ${modelLabel}.`
        : 'Automation is disabled.';
}

function getMessageElement(messageId) {
    return document.querySelector(`.mes[mesid="${messageId}"]`);
}

function ensureProgressElement(messageId) {
    const existing = state.progress.get(messageId);
    if (existing?.container?.isConnected) {
        return existing;
    }

    const hostMessage = getMessageElement(messageId);
    if (!hostMessage) {
        return null;
    }

    const container = document.createElement('div');
    container.className = 'auto-multi-progress';
    const label = document.createElement('p');
    label.className = 'auto-multi-progress__label';
    label.textContent = 'Preparing swipe queue…';
    const track = document.createElement('div');
    track.className = 'auto-multi-progress__track';
    const bar = document.createElement('div');
    bar.className = 'auto-multi-progress__bar';
    track.appendChild(bar);
    container.append(label, track);

    const textBlock = hostMessage.querySelector('.mes_text') || hostMessage;
    textBlock.appendChild(container);

    const entry = { container, label, bar };
    state.progress.set(messageId, entry);
    return entry;
}

function updateProgressUi(messageId, current, target, waiting) {
    const entry = ensureProgressElement(messageId);
    if (!entry) {
        return;
    }

    const safeTarget = Math.max(1, target);
    const progressValue = Math.min(1, current / safeTarget);
    entry.bar.style.width = `${Math.round(progressValue * 100)}%`;
    entry.label.textContent = `Auto swiping ${Math.min(current, safeTarget)}/${safeTarget}`;
    entry.container.classList.toggle('waiting', !!waiting);
}

function clearProgress(messageId) {
    const entry = state.progress.get(messageId);
    if (entry) {
        entry.container.remove();
        state.progress.delete(messageId);
    }
}

function resetPerChatState() {
    state.chatToken += 1;
    state.seenMessages.clear();
    state.runningMessages.clear();
    for (const messageId of [...state.progress.keys()]) {
        clearProgress(messageId);
    }
}

function shouldAutoFill(message) {
    if (!message || message.is_user) {
        return false;
    }

    const mediaList = message?.extra?.media;
    if (!Array.isArray(mediaList) || mediaList.length === 0) {
        return false;
    }

    const hasGeneratedMedia = mediaList.some(item => item?.source === 'generated');
    const isGallery = message.extra?.media_display ? message.extra.media_display === 'gallery' : true;
    return hasGeneratedMedia && isGallery;
}

async function waitForPaintbrush(messageId, timeoutMs = 2000) {
    const selector = `.mes[mesid="${messageId}"] .sd_message_gen`;
    const deadline = performance.now() + timeoutMs;
    let button = document.querySelector(selector);

    while (!button && performance.now() < deadline) {
        await sleep(100);
        button = document.querySelector(selector);
    }

    return button;
}

function dispatchSwipe(button) {
    if (!button || typeof button.dispatchEvent !== 'function') {
        return false;
    }

    const event = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
    button.dispatchEvent(event);
    return true;
}

function getMediaCount(message) {
    const mediaList = message?.extra?.media;
    return Array.isArray(mediaList) ? mediaList.length : 0;
}

function applyModelOverride() {
    const overrideModel = getSettings().swipeModel?.trim();
    if (!overrideModel) {
        return null;
    }

    const context = getCtx();
    const sdSettings = context?.extensionSettings?.sd;
    if (!sdSettings) {
        return null;
    }

    const previousModel = sdSettings.model;
    if (previousModel === overrideModel) {
        return null;
    }

    sdSettings.model = overrideModel;
    return () => { sdSettings.model = previousModel; };
}

async function waitForMediaIncrement(messageId, previousCount) {
    const timeout = getSettings().swipeTimeoutMs;
    const deadline = performance.now() + timeout;

    while (performance.now() < deadline) {
        await sleep(250);
        const message = getCtx().chat?.[messageId];
        if (!message) {
            return false;
        }

        const count = getMediaCount(message);
        if (count > previousCount) {
            return true;
        }
    }

    return false;
}

async function requestSwipe(button, messageId) {
    const baselineMessage = getCtx().chat?.[messageId];
    const baselineCount = getMediaCount(baselineMessage);
    const restoreModel = applyModelOverride();

    try {
        if (!dispatchSwipe(button)) {
            return false;
        }

        return await waitForMediaIncrement(messageId, baselineCount);
    } finally {
        if (typeof restoreModel === 'function') {
            restoreModel();
        }
    }
}

async function autoFillMessage(messageId, button, token) {
    while (true) {
        const settings = getSettings();
        const targetCount = clampCount(settings.targetCount);

        if (!settings.enabled || token !== state.chatToken) {
            break;
        }

        const message = getCtx().chat?.[messageId];
        if (!shouldAutoFill(message)) {
            break;
        }

        const currentCount = getMediaCount(message);
        updateProgressUi(messageId, currentCount, targetCount, false);

        if (currentCount >= targetCount) {
            break;
        }

        if (!button.isConnected) {
            button = await waitForPaintbrush(messageId);
            if (!button) {
                console.warn('[AutoMultiImage] Unable to locate paintbrush button for message', messageId);
                break;
            }
        }

        updateProgressUi(messageId, currentCount, targetCount, true);
        const success = await requestSwipe(button, messageId);
        const updatedMessage = getCtx().chat?.[messageId];
        updateProgressUi(messageId, getMediaCount(updatedMessage), targetCount, false);

        if (!success) {
            console.warn('[AutoMultiImage] Swipe request timed out or failed for message', messageId);
            break;
        }

        if (settings.delayMs > 0) {
            await sleep(settings.delayMs);
        }
    }
}

function queueAutoFill(messageId, button) {
    if (state.runningMessages.has(messageId)) {
        return;
    }

    const token = state.chatToken;
    const job = autoFillMessage(messageId, button, token)
        .catch(error => console.error('[AutoMultiImage] Failed to auto-fill images', error))
        .finally(() => {
            state.runningMessages.delete(messageId);
            clearProgress(messageId);
        });

    state.runningMessages.set(messageId, job);
}

async function handleMessageRendered(messageId, origin) {
    const settings = getSettings();
    if (!settings.enabled) {
        return;
    }

    if (origin !== 'extension') {
        return;
    }

    if (state.seenMessages.has(messageId)) {
        return;
    }

    const message = getCtx().chat?.[messageId];
    if (!shouldAutoFill(message)) {
        return;
    }

    state.seenMessages.add(messageId);
    const button = await waitForPaintbrush(messageId);
    if (!button) {
        console.warn('[AutoMultiImage] No Stable Diffusion control found for message', messageId);
        return;
    }

    queueAutoFill(messageId, button);
}

async function init() {
    if (state.initialized) {
        return;
    }

    injectStyles();
    ensureSettings();
    await buildSettingsPanel();

    const { eventSource, eventTypes } = getCtx();
    eventSource.on(eventTypes.CHARACTER_MESSAGE_RENDERED, handleMessageRendered);
    eventSource.on(eventTypes.CHAT_CHANGED, resetPerChatState);
    eventSource.on(eventTypes.SETTINGS_UPDATED, syncUiFromSettings);

    document.addEventListener('change', handleDocumentChange);

    state.initialized = true;
    log('Initialized');
}

(function bootstrap() {
    const ctx = getCtx();
    ctx.eventSource.on(ctx.eventTypes.APP_READY, () => void init());
})();
