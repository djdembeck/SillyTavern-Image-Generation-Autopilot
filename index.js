const MODULE_NAME = 'autoMultiImageSwipes'
const defaultSettings = Object.freeze({
    enabled: true,
    targetCount: 4,
    delayMs: 800,
    swipeTimeoutMs: 120000,
    burstMode: false,
    modelQueue: [],
    swipeModel: '',
})

const state = {
    initialized: false,
    seenMessages: new Set(),
    runningMessages: new Map(),
    chatToken: 0,
    ui: null,
    progress: {
        messageId: null,
        container: null,
        statusLabel: null,
        ratioLabel: null,
        progressBar: null,
    },
    modelLabels: new Map(),
    styleInjected: false,
}

function resolveTemplateRoot() {
    /** @type {HTMLScriptElement[]} */
    const candidates = []

    if (document.currentScript instanceof HTMLScriptElement) {
        candidates.push(document.currentScript)
    }

    candidates.push(
        ...Array.from(
            document.querySelectorAll('script[src*="scripts/extensions/"]'),
        ),
    )

    const ranked = [
        (script) => script?.src?.includes('/auto-multi-image-swipes/'),
        (script) => script?.src?.includes('/Multi-Image-Gen/'),
        () => true,
    ]

    for (const predicate of ranked) {
        const script = candidates.find((candidate) => predicate(candidate))
        if (!script) {
            continue
        }

        const match = script.src.match(/scripts\/extensions\/(.+)\/index\.js/)
        if (match?.[1]) {
            return match[1]
        }
    }

    return `third-party/${MODULE_NAME}`
}

const TEMPLATE_ROOT = resolveTemplateRoot()
const STYLE_ELEMENT_ID = 'auto-multi-image-swipes-style'
const SETTINGS_STYLE_ELEMENT_ID = 'auto-multi-image-settings-style'
const BURST_MODEL_SETTLE_MS = 120
const SETTINGS_PANEL_STYLES = `
    @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600&family=DM+Sans:wght@400;500&display=swap');

    .auto-multi-image-settings {
        font-family: 'Space Grotesk', 'DM Sans', 'Segoe UI', sans-serif;
        --autoMultiBg: rgba(255, 255, 255, 0.03);
        --autoMultiBorder: rgba(255, 255, 255, 0.12);
        --autoMultiAccent: #7b7dff;
        --autoMultiAccentAlt: #56c5ff;
        --autoMultiShadow: 0 20px 45px rgba(0, 0, 0, 0.35);
    }

    .auto-multi-image-settings .inline-drawer-content {
        padding: 0;
    }

    .auto-multi-image-settings .auto-multi-drawer {
        border-radius: 22px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background:
            linear-gradient(135deg, rgba(5, 8, 25, 0.85), rgba(9, 13, 35, 0.65)),
            radial-gradient(circle at top left, rgba(123, 181, 255, 0.25), transparent 55%);
        box-shadow: 0 25px 60px rgba(0, 0, 0, 0.45);
        overflow: hidden;
    }

    .auto-multi-image-settings .auto-multi-drawer__toggle {
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        padding: 18px 20px;
        background:
            linear-gradient(120deg, rgba(123, 125, 255, 0.15), rgba(12, 15, 35, 0.6));
        backdrop-filter: blur(8px);
    }

    .auto-multi-image-settings .auto-multi-drawer__toggle h4 {
        font-size: 1.15rem;
    }

    .auto-multi-image-settings .auto-multi-drawer__toggle .extension_descr {
        opacity: 0.82;
    }

    .auto-multi-image-settings .auto-multi-drawer__toggle i.fa-images {
        font-size: 1.35rem;
        color: var(--autoMultiAccentAlt);
        filter: drop-shadow(0 4px 12px rgba(86, 197, 255, 0.45));
    }

    .auto-multi-image-settings .auto-multi-drawer__header {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: nowrap;
    }

    .auto-multi-image-settings .auto-multi-drawer__header-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
    }

    .auto-multi-image-settings .auto-multi-drawer__icon {
        font-size: 1.2rem;
        color: rgba(255, 255, 255, 0.85);
        background: rgba(0, 0, 0, 0.25);
        border-radius: 999px;
        width: 32px;
        height: 32px;
        display: grid;
        place-items: center;
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
    }

    .auto-multi-image-settings .auto-multi-ui {
        display: flex;
        flex-direction: column;
        gap: 20px;
        padding: 16px;
        background: rgba(0, 0, 0, 0.25);
        border-radius: 0 0 18px 18px;
    }

    .auto-multi-image-settings .auto-multi-hero {
        border-radius: 18px;
        padding: 24px;
        background:
            radial-gradient(
                circle at 25% 0%,
                rgba(123, 181, 255, 0.38),
                rgba(12, 15, 35, 0.95)
            ),
            linear-gradient(
                135deg,
                rgba(86, 197, 255, 0.25),
                rgba(123, 125, 255, 0.35)
            );
        border: 1px solid rgba(255, 255, 255, 0.15);
        box-shadow: var(--autoMultiShadow);
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .auto-multi-image-settings .auto-multi-hero__badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 5px 14px;
        border-radius: 999px;
        background: rgba(0, 0, 0, 0.35);
        font-size: 0.78rem;
        letter-spacing: 0.12em;
        text-transform: uppercase;
    }

    .auto-multi-image-settings .auto-multi-hero h4 {
        margin: 0;
        font-size: 1.4rem;
    }

    .auto-multi-image-settings .auto-multi-hero p {
        margin: 0;
        opacity: 0.9;
        max-width: 560px;
    }

    .auto-multi-image-settings .auto-multi-hero__chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    }

    .auto-multi-image-settings .auto-multi-hero__chips span {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 12px;
        border-radius: 999px;
        background: rgba(0, 0, 0, 0.35);
        font-size: 0.78rem;
    }

    .auto-multi-image-settings .auto-multi-panel {
        border-radius: 16px;
        padding: 18px;
        background: var(--autoMultiBg);
        border: 1px solid var(--autoMultiBorder);
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.25);
        position: relative;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .auto-multi-image-settings .auto-multi-panel::after {
        content: '';
        position: absolute;
        top: 0;
        right: 0;
        width: 160px;
        height: 160px;
        background: radial-gradient(
            circle,
            rgba(123, 125, 255, 0.15),
            transparent 60%
        );
        pointer-events: none;
    }

    .auto-multi-image-settings .auto-multi-panel header {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
    }

    .auto-multi-image-settings .auto-multi-panel h5 {
        margin: 4px 0 0;
        font-size: 1.1rem;
    }

    .auto-multi-image-settings .eyebrow {
        margin: 0;
        text-transform: uppercase;
        font-size: 0.7rem;
        letter-spacing: 0.18em;
        opacity: 0.65;
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .auto-multi-image-settings .auto-multi-panel .caption {
        margin: 0;
        font-size: 0.85rem;
        opacity: 0.8;
        max-width: 420px;
    }

    .auto-multi-image-settings .auto-multi-toggle {
        margin: 0;
        padding: 12px 14px;
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: rgba(255, 255, 255, 0.02);
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .auto-multi-image-settings .auto-multi-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 14px;
    }

    .auto-multi-image-settings .auto-multi-grid label > span {
        display: block;
        margin-bottom: 4px;
        font-size: 0.85rem;
        opacity: 0.85;
    }

    .auto-multi-image-settings .auto-multi-panel--queue header {
        align-items: center;
    }

    .auto-multi-image-settings .auto-multi-model-queue__actions .menu_button {
        display: flex;
        align-items: center;
        gap: 6px;
        background: rgba(123, 125, 255, 0.2);
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.12);
    }

    .auto-multi-image-settings .auto-multi-model-rows {
        margin-top: 12px;
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .auto-multi-image-settings .auto-multi-model-row {
        padding: 12px;
        border-radius: 10px;
        background: rgba(0, 0, 0, 0.35);
        border: 1px solid rgba(255, 255, 255, 0.08);
        box-shadow: 0 8px 18px rgba(0, 0, 0, 0.25);
    }

    .auto-multi-image-settings .auto-multi-model-field > span {
        display: block;
        font-size: 0.7rem;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        margin-bottom: 4px;
        opacity: 0.75;
    }

    .auto-multi-image-settings .auto-multi-remove-model {
        align-self: flex-end;
        min-width: 38px;
    }

    .auto-multi-image-settings .auto-multi-model-empty {
        margin-top: 6px;
        font-style: italic;
        opacity: 0.8;
    }

    .auto-multi-image-settings .auto-multi-model-count {
        width: 100%;
    }

    .auto-multi-image-settings .auto-multi-add-model .fa-solid {
        font-size: 0.85rem;
    }

    .auto-multi-image-settings .auto-multi-summary {
        padding: 14px;
        border-radius: 12px;
        border: 1px dashed rgba(255, 255, 255, 0.3);
        background: rgba(0, 0, 0, 0.3);
        min-height: 48px;
        margin: 0;
        font-size: 0.9rem;
    }

    .auto-multi-image-settings .auto-multi-inline {
        margin: 0;
    }

    .auto-multi-image-settings .auto-multi-credit {
        margin: 0;
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.18em;
        opacity: 0.6;
        text-align: center;
    }
`

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const log = (...args) => console.log('[AutoMultiImage]', ...args)

function injectStyles() {
    if (state.styleInjected || document.getElementById(STYLE_ELEMENT_ID)) {
        state.styleInjected = true
        return
    }

    const style = document.createElement('style')
    style.id = STYLE_ELEMENT_ID
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

        .auto-multi-global-progress {
            position: sticky;
            bottom: 12px;
            margin: 12px;
            padding: 10px 14px;
            border-radius: 10px;
            border: 1px solid rgba(255, 255, 255, 0.12);
            background: rgba(5, 10, 25, 0.85);
            box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
            backdrop-filter: blur(6px);
            display: flex;
            gap: 12px;
            align-items: center;
            z-index: 25;
        }

        .auto-multi-global-progress__meta {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }

        .auto-multi-global-progress__status {
            font-weight: 600;
            letter-spacing: 0.03em;
        }

        .auto-multi-global-progress__ratio {
            font-size: 0.8rem;
            opacity: 0.8;
        }

        .auto-multi-global-progress progress {
            flex: 1;
            height: 6px;
            border-radius: 999px;
        }

        .auto-multi-global-progress__stop {
            min-width: 34px;
        }
    `

    document.head.appendChild(style)
    state.styleInjected = true
}

function injectSettingsPanelStyles() {
    if (document.getElementById(SETTINGS_STYLE_ELEMENT_ID)) {
        return
    }

    const style = document.createElement('style')
    style.id = SETTINGS_STYLE_ELEMENT_ID
    style.textContent = SETTINGS_PANEL_STYLES
    document.head.appendChild(style)
}

function getCtx() {
    return SillyTavern.getContext()
}

function ensureSettings() {
    const { extensionSettings } = getCtx()
    if (!extensionSettings[MODULE_NAME]) {
        extensionSettings[MODULE_NAME] = { ...defaultSettings }
    }

    for (const [key, value] of Object.entries(defaultSettings)) {
        if (typeof extensionSettings[MODULE_NAME][key] === 'undefined') {
            extensionSettings[MODULE_NAME][key] = value
        }
    }
    const settings = extensionSettings[MODULE_NAME]

    if (!Array.isArray(settings.modelQueue)) {
        settings.modelQueue = []
    }

    if (settings.swipeModel?.trim() && settings.modelQueue.length === 0) {
        settings.modelQueue = [
            {
                id: settings.swipeModel.trim(),
                count: clampCount(settings.targetCount),
            },
        ]
        settings.swipeModel = ''
    }

    settings.modelQueue = sanitizeModelQueue(
        settings.modelQueue,
        clampCount(settings.targetCount),
    )
    return settings
}

function getSettings() {
    return ensureSettings()
}

function saveSettings() {
    getCtx().saveSettingsDebounced()
    syncUiFromSettings()
}

function clampCount(value) {
    const numeric = Number(value)
    if (Number.isNaN(numeric)) {
        return defaultSettings.targetCount
    }
    return Math.max(1, Math.min(12, Math.round(numeric)))
}

function clampDelay(value) {
    const numeric = Number(value)
    if (Number.isNaN(numeric)) {
        return defaultSettings.delayMs
    }
    return Math.max(0, Math.min(10000, Math.round(numeric)))
}

function sanitizeModelQueue(
    queue,
    fallbackCount = defaultSettings.targetCount,
) {
    if (!Array.isArray(queue)) {
        return []
    }

    return queue
        .map((entry) => ({
            id: typeof entry?.id === 'string' ? entry.id.trim() : '',
            count: clampCount(
                typeof entry?.count !== 'undefined'
                    ? entry.count
                    : fallbackCount,
            ),
        }))
        .filter((entry) => entry.count > 0)
}

function getSwipePlan(settings) {
    const fallbackCount = clampCount(settings?.targetCount)
    const queue = sanitizeModelQueue(settings?.modelQueue, fallbackCount)

    if (queue.length > 0) {
        return queue
    }

    const fallbackModel = settings?.swipeModel?.trim() || ''
    if (fallbackCount <= 0) {
        return []
    }

    return [{ id: fallbackModel, count: fallbackCount }]
}

async function buildSettingsPanel() {
    const root =
        document.getElementById('extensions_settings2') ||
        document.getElementById('extensions_settings')
    if (!root) {
        console.warn(
            '[AutoMultiImage] Could not find extension settings container.',
        )
        return
    }

    const existing = document.getElementById('auto_multi_image_container')
    if (existing) {
        existing.remove()
    }

    injectSettingsPanelStyles()

    let html = ''
    try {
        html = await getCtx().renderExtensionTemplateAsync(
            TEMPLATE_ROOT,
            'settings',
        )
    } catch (error) {
        console.error(
            '[AutoMultiImage] Failed to load settings template',
            error,
        )
        return
    }

    const template = document.createElement('template')
    template.innerHTML = html.trim()
    const container = template.content.firstElementChild
    if (!container) {
        console.warn('[AutoMultiImage] Settings template empty')
        return
    }

    root.appendChild(container)

    const enabledInput = /** @type {HTMLInputElement | null} */ (
        container.querySelector('#auto_multi_image_enabled')
    )
    const countInput = /** @type {HTMLInputElement | null} */ (
        container.querySelector('#auto_multi_image_target')
    )
    const delayInput = /** @type {HTMLInputElement | null} */ (
        container.querySelector('#auto_multi_image_delay')
    )
    const summary = /** @type {HTMLParagraphElement | null} */ (
        container.querySelector('#auto_multi_image_summary')
    )
    const modelRowsContainer = /** @type {HTMLDivElement | null} */ (
        container.querySelector('#auto_multi_model_rows')
    )
    const addModelButton = /** @type {HTMLButtonElement | null} */ (
        container.querySelector('#auto_multi_add_model')
    )
    const refreshModelsButton = /** @type {HTMLButtonElement | null} */ (
        container.querySelector('#auto_multi_refresh_models')
    )
    const burstModeInput = /** @type {HTMLInputElement | null} */ (
        container.querySelector('#auto_multi_burst_mode')
    )

    if (
        !(
            enabledInput &&
            countInput &&
            delayInput &&
            summary &&
            modelRowsContainer &&
            burstModeInput
        )
    ) {
        console.warn('[AutoMultiImage] Settings template missing inputs')
        return
    }

    enabledInput.addEventListener('change', () => {
        const current = getSettings()
        current.enabled = enabledInput.checked
        saveSettings()
    })

    countInput.addEventListener('change', () => {
        const current = getSettings()
        current.targetCount = clampCount(countInput.value)
        countInput.value = String(current.targetCount)
        saveSettings()
    })

    delayInput.addEventListener('change', () => {
        const current = getSettings()
        current.delayMs = clampDelay(delayInput.value)
        delayInput.value = String(current.delayMs)
        saveSettings()
    })

    burstModeInput.addEventListener('change', () => {
        const current = getSettings()
        current.burstMode = burstModeInput.checked
        saveSettings()
    })

    addModelButton?.addEventListener('click', (event) => {
        event.preventDefault()
        handleAddModelRow()
    })

    refreshModelsButton?.addEventListener('click', (event) => {
        event.preventDefault()
        syncModelSelectOptions(true)
    })

    state.ui = {
        container,
        enabledInput,
        countInput,
        delayInput,
        summary,
        modelRowsContainer,
        burstModeInput,
        addModelButton,
        refreshModelsButton,
    }
    syncModelSelectOptions()
    syncUiFromSettings()
}

function handleAddModelRow() {
    const settings = getSettings()
    const queue = Array.isArray(settings.modelQueue)
        ? [...settings.modelQueue]
        : []
    queue.push({ id: '', count: clampCount(settings.targetCount) })
    settings.modelQueue = queue
    saveSettings()
}

function updateModelQueueEntry(index, patch) {
    const numericIndex = Number(index)
    if (!Number.isInteger(numericIndex)) {
        return
    }

    const settings = getSettings()
    const queue = Array.isArray(settings.modelQueue)
        ? [...settings.modelQueue]
        : []
    if (!queue[numericIndex]) {
        return
    }

    const next = { ...queue[numericIndex] }
    if (typeof patch.id === 'string') {
        next.id = patch.id
    }

    if (typeof patch.count !== 'undefined') {
        next.count = clampCount(patch.count)
    }

    queue[numericIndex] = next
    settings.modelQueue = queue
    saveSettings()
}

function removeModelQueueEntry(index) {
    const numericIndex = Number(index)
    if (!Number.isInteger(numericIndex)) {
        return
    }

    const settings = getSettings()
    const queue = Array.isArray(settings.modelQueue)
        ? [...settings.modelQueue]
        : []
    if (numericIndex < 0 || numericIndex >= queue.length) {
        return
    }

    queue.splice(numericIndex, 1)
    settings.modelQueue = queue
    saveSettings()
}

function renderModelQueueRows(queue) {
    if (!state.ui?.modelRowsContainer) {
        return
    }

    const container = state.ui.modelRowsContainer
    container.innerHTML = ''

    if (!queue.length) {
        const emptyMessage = document.createElement('p')
        emptyMessage.className = 'note auto-multi-model-empty margin0'
        emptyMessage.textContent =
            'No dedicated models configured. The current Stable Diffusion selection will be reused.'
        container.appendChild(emptyMessage)
        return
    }

    queue.forEach((entry, index) => {
        const row = document.createElement('div')
        row.className =
            'auto-multi-model-row flex-container flexGap10 alignitemscenter'
        row.dataset.index = String(index)

        const modelField = document.createElement('div')
        modelField.className = 'auto-multi-model-field flex2'
        const modelLabel = document.createElement('span')
        modelLabel.textContent = 'Model'
        const modelSelect = document.createElement('select')
        modelSelect.className = 'text_pole auto-multi-model-select'
        modelSelect.dataset.selectedValue = entry.id || ''
        modelSelect.addEventListener('change', () =>
            updateModelQueueEntry(index, { id: modelSelect.value }),
        )
        modelField.append(modelLabel, modelSelect)

        const countField = document.createElement('div')
        countField.className = 'auto-multi-model-field flex1'
        const countLabel = document.createElement('span')
        countLabel.textContent = 'Swipes'
        const countInput = document.createElement('input')
        countInput.type = 'number'
        countInput.min = '1'
        countInput.max = '12'
        countInput.step = '1'
        countInput.value = String(entry.count)
        countInput.className = 'text_pole auto-multi-model-count'
        countInput.addEventListener('change', () => {
            const nextValue = clampCount(countInput.value)
            countInput.value = String(nextValue)
            updateModelQueueEntry(index, { count: nextValue })
        })
        countField.append(countLabel, countInput)

        const removeButton = document.createElement('button')
        removeButton.className =
            'menu_button auto-multi-remove-model fa-solid fa-trash-can'
        removeButton.type = 'button'
        removeButton.title = 'Remove this model from the queue'
        removeButton.addEventListener('click', (event) => {
            event.preventDefault()
            removeModelQueueEntry(index)
        })

        row.append(modelField, countField, removeButton)
        container.appendChild(row)
    })
}

function getSdModelOptions() {
    const select = document.getElementById('sd_model')
    if (!(select instanceof HTMLSelectElement)) {
        return []
    }

    return Array.from(select.options)
        .map((option) => ({
            value: option.value,
            label:
                option.textContent?.trim() || option.value || 'Unnamed model',
        }))
        .filter((option) => option.value)
}

function getModelLabel(value) {
    if (!value) {
        return 'the active Stable Diffusion model'
    }

    if (state.modelLabels.has(value)) {
        return state.modelLabels.get(value)
    }

    return value
}

function syncModelSelectOptions(showFeedback = false) {
    const options = getSdModelOptions()
    state.modelLabels = new Map(
        options.map((option) => [option.value, option.label]),
    )

    const selects = state.ui?.modelRowsContainer?.querySelectorAll(
        '.auto-multi-model-select',
    )
    if (!selects?.length) {
        if (showFeedback) {
            log('Model list refreshed. Entries:', options.length)
        }
        return
    }

    const knownValues = new Set(options.map((option) => option.value))

    selects.forEach((select) => {
        const currentValue = select.dataset.selectedValue || select.value || ''
        select.innerHTML = ''

        const placeholder = document.createElement('option')
        placeholder.value = ''
        placeholder.textContent = 'Use current Stable Diffusion model'
        select.appendChild(placeholder)

        for (const option of options) {
            const element = document.createElement('option')
            element.value = option.value
            element.textContent = option.label
            select.appendChild(element)
        }

        if (currentValue && !knownValues.has(currentValue)) {
            const fallback = document.createElement('option')
            fallback.value = currentValue
            fallback.textContent = `${currentValue} (missing)`
            select.appendChild(fallback)
        }

        select.value = currentValue
        select.dataset.selectedValue = currentValue
    })

    if (showFeedback) {
        log('Model list refreshed. Entries:', options.length)
    }
}

function handleDocumentChange(event) {
    if (!(event?.target instanceof HTMLSelectElement)) {
        return
    }

    if (event.target.id === 'sd_model') {
        syncModelSelectOptions()
    }
}

function syncUiFromSettings() {
    if (!state.ui) return
    const settings = getSettings()
    state.ui.enabledInput.checked = settings.enabled
    state.ui.countInput.value = String(settings.targetCount)
    state.ui.delayInput.value = String(settings.delayMs)
    state.ui.burstModeInput.checked = !!settings.burstMode
    const configuredQueue = sanitizeModelQueue(
        settings.modelQueue,
        clampCount(settings.targetCount),
    )
    settings.modelQueue = configuredQueue
    renderModelQueueRows(configuredQueue)
    syncModelSelectOptions()

    if (!settings.enabled) {
        state.ui.summary.textContent = 'Automation is disabled.'
        return
    }

    const plan = getSwipePlan(settings)
    if (!plan.length) {
        state.ui.summary.textContent = 'No swipe queue configured.'
        return
    }

    const segments = plan.map((entry) => {
        const label = getModelLabel(entry.id)
        const suffix = entry.count === 1 ? '' : 's'
        return `${entry.count} swipe${suffix} on ${label}`
    })

    const strategyBlurb = settings.burstMode
        ? 'All swipes fire immediately; completions stream in as they finish.'
        : 'Swipes run sequentially with pacing between requests.'
    state.ui.summary.textContent = `Will queue ${segments.join(', ')} with ${settings.delayMs} ms between swipes. ${strategyBlurb}`
}

function ensureGlobalProgressElement(messageId) {
    const ctxHost = document.getElementById('sheld') || document.body
    let container = document.getElementById('auto-multi-global-progress')

    if (!container) {
        container = document.createElement('div')
        container.id = 'auto-multi-global-progress'
        container.className = 'auto-multi-global-progress'
        container.innerHTML = `
            <div class="auto-multi-global-progress__meta">
                <span class="auto-multi-global-progress__status">Preparing swipe queue…</span>
                <span class="auto-multi-global-progress__ratio">0 / 0</span>
            </div>
            <progress value="0" max="1"></progress>
            <button type="button" class="menu_button fa-solid fa-stop auto-multi-global-progress__stop" title="Abort the current auto swipe queue"></button>
        `
        ctxHost.appendChild(container)

        const stopButton = container.querySelector(
            '.auto-multi-global-progress__stop',
        )
        stopButton?.addEventListener('click', () => {
            state.chatToken += 1
            log('Auto swipe queue aborted manually.')
        })
    }

    container.dataset.messageId = messageId
    state.progress = {
        messageId,
        container,
        statusLabel: container.querySelector(
            '.auto-multi-global-progress__status',
        ),
        ratioLabel: container.querySelector(
            '.auto-multi-global-progress__ratio',
        ),
        progressBar: container.querySelector('progress'),
    }

    return state.progress
}

function updateProgressUi(messageId, current, target, waiting, labelText = '') {
    const entry = ensureGlobalProgressElement(messageId)
    const safeTarget = Math.max(1, target)
    const clampedCurrent = Math.max(0, Math.min(current, safeTarget))
    const descriptor =
        labelText || (waiting ? 'Preparing swipe queue…' : 'Auto Multi-Image')

    entry.container.classList.toggle('waiting', !!waiting)
    entry.statusLabel.textContent = descriptor
    entry.ratioLabel.textContent = `${clampedCurrent} / ${safeTarget}`
    entry.progressBar.value = clampedCurrent
    entry.progressBar.max = safeTarget
}

function buildSwipeLabels(plan, totalSwipes) {
    const labels = []
    let globalIndex = 0

    for (const entry of plan) {
        const modelLabel = getModelLabel(entry.id)
        for (let localIndex = 0; localIndex < entry.count; localIndex += 1) {
            globalIndex += 1
            labels.push(
                `Swipe ${globalIndex}/${totalSwipes} • ${modelLabel} (${localIndex + 1}/${entry.count})`,
            )
        }
    }

    return labels
}

function clearProgress(messageId) {
    const entry = state.progress
    if (!entry?.container) {
        return
    }

    if (messageId && entry.messageId && entry.messageId !== messageId) {
        return
    }

    entry.container.remove()
    state.progress = {
        messageId: null,
        container: null,
        statusLabel: null,
        ratioLabel: null,
        progressBar: null,
    }
}

function resetPerChatState() {
    state.chatToken += 1
    state.seenMessages.clear()
    state.runningMessages.clear()
    clearProgress()
}

function shouldAutoFill(message) {
    if (!message || message.is_user) {
        return false
    }

    const mediaList = message?.extra?.media
    if (!Array.isArray(mediaList) || mediaList.length === 0) {
        return false
    }

    const hasGeneratedMedia = mediaList.some(
        (item) => item?.source === 'generated',
    )
    const mode = (message.extra?.media_display || '').toLowerCase()
    const allowedModes = ['gallery', 'grid', 'carousel', 'stack']
    const isGallery =
        !mode || allowedModes.some((token) => mode.includes(token))
    return hasGeneratedMedia && isGallery
}

async function waitForPaintbrush(messageId, timeoutMs = 2000) {
    const selector = `.mes[mesid="${messageId}"] .sd_message_gen`
    const deadline = performance.now() + timeoutMs
    let button = document.querySelector(selector)

    while (!button && performance.now() < deadline) {
        await sleep(100)
        button = document.querySelector(selector)
    }

    return button
}

function dispatchSwipe(button) {
    if (!button || typeof button.dispatchEvent !== 'function') {
        return false
    }

    const event = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window,
    })
    button.dispatchEvent(event)
    return true
}

function getMediaCount(message) {
    const mediaList = message?.extra?.media
    return Array.isArray(mediaList) ? mediaList.length : 0
}

async function applyModelOverride(modelId) {
    const overrideModel = modelId?.trim()
    if (!overrideModel) {
        return null
    }

    const context = getCtx()
    const sdSettings = context?.extensionSettings?.sd
    const modelSelect = document.getElementById('sd_model')
    const previousSettingsModel = sdSettings?.model
    const previousSelectValue =
        modelSelect instanceof HTMLSelectElement ? modelSelect.value : null
    const selectOptions =
        modelSelect instanceof HTMLSelectElement
            ? Array.from(modelSelect.options)
            : []
    const selectHasOption = selectOptions.some(
        (option) => option.value === overrideModel,
    )
    const needsSettingsChange =
        !!sdSettings && previousSettingsModel !== overrideModel
    const needsSelectChange =
        selectHasOption && previousSelectValue !== overrideModel

    if (!needsSettingsChange && !needsSelectChange) {
        log('Model override skipped (already active)', {
            overrideModel,
            previousSettingsModel,
            previousSelectValue,
        })
        return null
    }

    if (needsSettingsChange) {
        sdSettings.model = overrideModel
        log('Model override applied to settings', {
            overrideModel,
            previousSettingsModel,
        })
    }

    if (needsSelectChange && modelSelect instanceof HTMLSelectElement) {
        modelSelect.value = overrideModel
        modelSelect.dispatchEvent(new Event('change', { bubbles: true }))
        log('Model override applied to select', {
            overrideModel,
            previousSelectValue,
        })
    }

    if (needsSelectChange) {
        await sleep(80)
    }

    return () => {
        if (
            needsSettingsChange &&
            typeof previousSettingsModel !== 'undefined'
        ) {
            sdSettings.model = previousSettingsModel
            log('Model override restored settings', {
                previousSettingsModel,
                overrideModel,
            })
        }

        if (
            needsSelectChange &&
            modelSelect instanceof HTMLSelectElement &&
            previousSelectValue !== null
        ) {
            modelSelect.value = previousSelectValue
            modelSelect.dispatchEvent(new Event('change', { bubbles: true }))
            log('Model override restored select', {
                previousSelectValue,
                overrideModel,
            })
        }
    }
}

async function waitForMediaIncrement(messageId, previousCount) {
    const timeout = getSettings().swipeTimeoutMs
    const deadline = performance.now() + timeout

    while (performance.now() < deadline) {
        await sleep(250)
        const message = getCtx().chat?.[messageId]
        if (!message) {
            return false
        }

        const count = getMediaCount(message)
        if (count > previousCount) {
            return true
        }
    }

    return false
}

async function requestSwipe(button, messageId) {
    const baselineMessage = getCtx().chat?.[messageId]
    const baselineCount = getMediaCount(baselineMessage)
    if (!dispatchSwipe(button)) {
        return false
    }

    return await waitForMediaIncrement(messageId, baselineCount)
}

async function autoFillMessage(messageId, button, token) {
    const initialSettings = getSettings()
    const plan = getSwipePlan(initialSettings)
    const totalSwipes = plan.reduce((sum, entry) => sum + entry.count, 0)

    if (!totalSwipes) {
        return
    }

    const swipeLabels = buildSwipeLabels(plan, totalSwipes)
    const initialLabel = swipeLabels[0]
        ? `Waiting on ${swipeLabels[0]}`
        : 'Preparing swipe queue…'

    updateProgressUi(messageId, 0, totalSwipes, true, initialLabel)

    if (initialSettings.burstMode) {
        await runBurstSwipePlan(
            plan,
            messageId,
            button,
            token,
            totalSwipes,
            swipeLabels,
        )
    } else {
        await runSequentialSwipePlan(
            plan,
            messageId,
            button,
            token,
            totalSwipes,
            swipeLabels,
        )
    }
}

async function runSequentialSwipePlan(
    plan,
    messageId,
    button,
    token,
    totalSwipes,
    swipeLabels,
) {
    let completed = 0

    log('Sequential plan start', {
        messageId,
        totalSwipes,
        models: plan.map((entry) => ({ id: entry.id, count: entry.count })),
    })

    outer: for (const entry of plan) {
        const modelLabel = getModelLabel(entry.id)
        const restoreModel = await applyModelOverride(entry.id)

        try {
            for (
                let swipeIndex = 0;
                swipeIndex < entry.count;
                swipeIndex += 1
            ) {
                const settings = getSettings()
                if (!settings.enabled || token !== state.chatToken) {
                    break outer
                }

                const message = getCtx().chat?.[messageId]
                if (!message) {
                    break outer
                }

                if (!button?.isConnected) {
                    button = await waitForPaintbrush(messageId)
                    if (!button) {
                        console.warn(
                            '[AutoMultiImage] Unable to locate paintbrush button for message',
                            messageId,
                        )
                        break outer
                    }
                }

                const pendingLabel = swipeLabels?.[completed]
                updateProgressUi(
                    messageId,
                    completed,
                    totalSwipes,
                    true,
                    pendingLabel ? `Waiting on ${pendingLabel}` : modelLabel,
                )
                log('Dispatching sequential swipe', {
                    messageId,
                    modelId: entry.id,
                    swipeIndex: swipeIndex + 1,
                    totalForModel: entry.count,
                    completedSoFar: completed,
                })

                const success = await requestSwipe(button, messageId)
                if (!success) {
                    console.warn(
                        '[AutoMultiImage] Swipe request timed out or failed for message',
                        messageId,
                    )
                    break outer
                }

                const completedLabel = swipeLabels?.[completed]
                completed += 1
                updateProgressUi(
                    messageId,
                    completed,
                    totalSwipes,
                    false,
                    completedLabel
                        ? `Completed ${completedLabel}`
                        : modelLabel,
                )

                if (settings.delayMs > 0 && completed < totalSwipes) {
                    await sleep(settings.delayMs)
                }
            }
        } finally {
            if (typeof restoreModel === 'function') {
                restoreModel()
            }
        }
    }
}

async function runBurstSwipePlan(
    plan,
    messageId,
    button,
    token,
    totalSwipes,
    swipeLabels,
) {
    const ctx = getCtx()
    const baselineCount = getMediaCount(ctx.chat?.[messageId])
    let issued = 0

    log('Burst plan start', {
        messageId,
        totalSwipes,
        models: plan.map((entry) => ({ id: entry.id, count: entry.count })),
    })

    for (const entry of plan) {
        const settings = getSettings()
        if (!settings.enabled || token !== state.chatToken) {
            return
        }

        const label = getModelLabel(entry.id)
        const restoreModel = await applyModelOverride(entry.id)

        try {
            for (
                let swipeIndex = 0;
                swipeIndex < entry.count;
                swipeIndex += 1
            ) {
                if (!settings.enabled || token !== state.chatToken) {
                    return
                }

                const message = ctx.chat?.[messageId]
                if (!message) {
                    return
                }

                if (!button?.isConnected) {
                    button = await waitForPaintbrush(messageId)
                    if (!button) {
                        console.warn(
                            '[AutoMultiImage] Unable to locate paintbrush button for message',
                            messageId,
                        )
                        return
                    }
                }

                log('Dispatching burst swipe', {
                    messageId,
                    modelId: entry.id,
                    swipeIndex: swipeIndex + 1,
                    totalForModel: entry.count,
                    issuedSoFar: issued,
                })

                if (!dispatchSwipe(button)) {
                    console.warn(
                        '[AutoMultiImage] Failed to dispatch swipe click for message',
                        messageId,
                    )
                    return
                }

                const issuedLabel = swipeLabels?.[issued]
                issued += 1
                updateProgressUi(
                    messageId,
                    issued,
                    totalSwipes,
                    true,
                    issuedLabel ? `Queued ${issuedLabel}` : label,
                )

                if (settings.delayMs > 0 && issued < totalSwipes) {
                    await sleep(settings.delayMs)
                } else if (issued < totalSwipes) {
                    await sleep(BURST_MODEL_SETTLE_MS)
                }
            }
        } finally {
            if (typeof restoreModel === 'function') {
                restoreModel()
            }
        }
    }

    await monitorBurstCompletion(
        messageId,
        baselineCount,
        totalSwipes,
        token,
        swipeLabels,
    )
}

async function monitorBurstCompletion(
    messageId,
    baselineCount,
    totalSwipes,
    token,
    swipeLabels,
) {
    const timeout = getSettings().swipeTimeoutMs
    const deadline = performance.now() + timeout
    const targetCount = baselineCount + totalSwipes

    while (performance.now() < deadline) {
        if (token !== state.chatToken) {
            return
        }

        const message = getCtx().chat?.[messageId]
        if (!message) {
            break
        }

        const attachments = getMediaCount(message)
        const delivered = Math.max(0, attachments - baselineCount)
        const pendingLabel = swipeLabels?.[delivered]
        updateProgressUi(
            messageId,
            Math.min(delivered, totalSwipes),
            totalSwipes,
            delivered < totalSwipes,
            pendingLabel ? `Waiting on ${pendingLabel}` : 'Waiting for swipes',
        )

        if (attachments >= targetCount) {
            return
        }

        await sleep(350)
    }

    console.warn(
        '[AutoMultiImage] Burst swipe completion timed out for message',
        messageId,
    )
}

function queueAutoFill(messageId, button) {
    if (state.runningMessages.has(messageId)) {
        return
    }

    const token = state.chatToken
    const job = autoFillMessage(messageId, button, token)
        .catch((error) =>
            console.error('[AutoMultiImage] Failed to auto-fill images', error),
        )
        .finally(() => {
            state.runningMessages.delete(messageId)
            clearProgress(messageId)
        })

    state.runningMessages.set(messageId, job)
}

async function handleMessageRendered(messageId, origin) {
    const settings = getSettings()
    if (!settings.enabled) {
        return
    }

    if (origin !== 'extension') {
        return
    }

    if (state.seenMessages.has(messageId)) {
        return
    }

    const message = getCtx().chat?.[messageId]
    if (!shouldAutoFill(message)) {
        return
    }

    state.seenMessages.add(messageId)
    const button = await waitForPaintbrush(messageId)
    if (!button) {
        console.warn(
            '[AutoMultiImage] No Stable Diffusion control found for message',
            messageId,
        )
        return
    }

    queueAutoFill(messageId, button)
}

async function init() {
    if (state.initialized) {
        return
    }

    injectStyles()
    ensureSettings()
    await buildSettingsPanel()

    const { eventSource, eventTypes } = getCtx()
    eventSource.on(eventTypes.CHARACTER_MESSAGE_RENDERED, handleMessageRendered)
    eventSource.on(eventTypes.CHAT_CHANGED, resetPerChatState)
    eventSource.on(eventTypes.SETTINGS_UPDATED, syncUiFromSettings)

    document.addEventListener('change', handleDocumentChange)

    state.initialized = true
    log('Initialized')
}

;(function bootstrap() {
    const ctx = getCtx()
    ctx.eventSource.on(ctx.eventTypes.APP_READY, () => void init())
})()
