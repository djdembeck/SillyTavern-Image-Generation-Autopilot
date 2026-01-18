const MODULE_NAME = 'autoMultiImageSwipes'
const INSERT_TYPE = Object.freeze({
    DISABLED: 'disabled',
    INLINE: 'inline',
    REPLACE: 'replace',
    NEW_MESSAGE: 'new',
})
const defaultSettings = Object.freeze({
    enabled: true,
    targetCount: 4,
    delayMs: 800,
    swipeTimeoutMs: 120000,
    burstMode: false,
    burstThrottleMs: 250,
    modelQueue: [],
    swipeModel: '',
    autoGeneration: {
        enabled: false,
        insertType: INSERT_TYPE.DISABLED,
        promptInjection: {
            enabled: true,
            mainPrompt:
                'Insert <pic prompt="detailed scene description"> tags at the end of each reply.',
            instructionsPositive: '',
            instructionsNegative: '',
            examplePrompt: '',
            lengthLimit: 0,
            lengthLimitType: 'none',
            picCountMode: 'exact',
            picCountExact: 1,
            picCountMin: 1,
            picCountMax: 3,
            regex: '/<pic[^>]*\\sprompt="([^"]*)"[^>]*?>/g',
            position: 'deep_system',
            depth: 0,
        },
    },
})

const state = {
    initialized: false,
    seenMessages: new Set(),
    autoGenMessages: new Set(),
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
    unifiedProgress: {
        active: false,
        sourceMessageId: null,
        totalImages: 0,
        failedImages: 0,
        completedImages: 0,
        completedSwipes: 0,
        expectedSwipes: 0,
        swipesPerImage: 0,
        insertType: INSERT_TYPE.DISABLED,
    },
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
        (script) =>
            script?.src?.includes('/SillyTavern-Image-Generation-Autopilot/') ||
            script?.src?.includes('/Image-Generation-Autopilot/'),
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
const BURST_MODEL_SETTLE_MS = 120

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const log = (...args) => console.log('[AutoMultiImage]', ...args)

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

    if (!settings.autoGeneration) {
        settings.autoGeneration = { ...defaultSettings.autoGeneration }
    }

    if (typeof settings.autoGeneration.enabled !== 'boolean') {
        settings.autoGeneration.enabled = false
    }

    if (!Object.values(INSERT_TYPE).includes(settings.autoGeneration.insertType)) {
        settings.autoGeneration.insertType = INSERT_TYPE.DISABLED
    }

    if (!settings.autoGeneration.promptInjection) {
        settings.autoGeneration.promptInjection = {
            ...defaultSettings.autoGeneration.promptInjection,
        }
    }

    const promptInjection = settings.autoGeneration.promptInjection
    for (const [key, value] of Object.entries(
        defaultSettings.autoGeneration.promptInjection,
    )) {
        if (typeof promptInjection[key] === 'undefined') {
            promptInjection[key] = value
        }
    }

    if (!Array.isArray(settings.modelQueue)) {
        settings.modelQueue = []
    }

    if (settings.burstMode) {
        settings.burstMode = false
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

function clampBurstThrottle(value) {
    const numeric = Number(value)
    if (Number.isNaN(numeric)) {
        return defaultSettings.burstThrottleMs
    }
    return Math.max(0, Math.min(5000, Math.round(numeric)))
}

function clampDepth(value) {
    const numeric = Number(value)
    if (Number.isNaN(numeric)) {
        return defaultSettings.autoGeneration.promptInjection.depth
    }
    return Math.max(0, Math.min(100, Math.round(numeric)))
}

function normalizeRegexString(value) {
    if (typeof value !== 'string') {
        return ''
    }
    return value.trim()
}

function parseRegexFromString(raw) {
    const source = normalizeRegexString(raw)
    if (!source) {
        return null
    }

    if (source.startsWith('/') && source.lastIndexOf('/') > 0) {
        const lastSlash = source.lastIndexOf('/')
        const pattern = source.slice(1, lastSlash)
        const flags = source.slice(lastSlash + 1) || 'g'
        try {
            return new RegExp(pattern, flags.includes('g') ? flags : `${flags}g`)
        } catch (error) {
            console.warn('[AutoMultiImage] Invalid regex string', error)
            return null
        }
    }

    try {
        return new RegExp(source, 'g')
    } catch (error) {
        console.warn('[AutoMultiImage] Invalid regex string', error)
        return null
    }
}

function escapeHtmlAttribute(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
}

function clampPromptLimit(value) {
    const numeric = Number(value)
    if (Number.isNaN(numeric)) {
        return 0
    }
    return Math.max(0, Math.round(numeric))
}

function getSwipeTotal(settings) {
    if (!settings?.enabled) {
        return 0
    }

    const plan = getSwipePlan(settings)
    return plan.reduce((sum, entry) => sum + entry.count, 0)
}

function formatOrdinal(value) {
    const number = Math.abs(Math.trunc(value))
    const mod100 = number % 100
    if (mod100 >= 11 && mod100 <= 13) {
        return `${number}th`
    }

    switch (number % 10) {
        case 1:
            return `${number}st`
        case 2:
            return `${number}nd`
        case 3:
            return `${number}rd`
        default:
            return `${number}th`
    }
}

function getUnifiedCounts() {
    const totals = getUnifiedTotals()
    if (!totals) {
        return null
    }

    return {
        completed: totals.completed,
        total: totals.total,
    }
}

function formatUnifiedImageLabel(index) {
    const totals = getUnifiedCounts()
    if (!totals) {
        return `Generating image ${index}`
    }

    const ordinal = formatOrdinal(index)
    return `Generating ${ordinal} image ${totals.completed + 1}/${totals.total}`
}

function formatUnifiedSwipeLabel(index, prefix) {
    const totals = getUnifiedCounts()
    if (!totals) {
        return prefix
    }

    const label = prefix ? `${prefix} ` : ''
    return `${label}${totals.completed + 1}/${totals.total}`
}

function startUnifiedProgress({
    messageId,
    totalImages,
    swipesPerImage,
    insertType,
}) {
    const unified = state.unifiedProgress
    const swipeMultiplier =
        insertType === INSERT_TYPE.NEW_MESSAGE ? totalImages : 0
    const expectedSwipes = Math.max(0, swipesPerImage * swipeMultiplier)

    unified.active = expectedSwipes > 0
    unified.sourceMessageId = messageId
    unified.totalImages = Math.max(0, totalImages)
    unified.failedImages = 0
    unified.completedImages = 0
    unified.completedSwipes = 0
    unified.expectedSwipes = expectedSwipes
    unified.swipesPerImage = Math.max(0, swipesPerImage)
    unified.insertType = insertType

    return unified
}

function getUnifiedTotals() {
    const unified = state.unifiedProgress
    if (!unified?.active) {
        return null
    }

    const remainingImages = Math.max(0, unified.totalImages - unified.failedImages)
    const total = Math.max(1, remainingImages + unified.expectedSwipes)
    const completed = unified.completedImages + unified.completedSwipes
    return { total, completed }
}

function updateUnifiedProgress(messageId, waiting, label) {
    const totals = getUnifiedTotals()
    if (!totals) {
        return false
    }

    updateProgressUi(messageId, totals.completed, totals.total, waiting, label)
    return true
}

function finalizeUnifiedProgress() {
    const unified = state.unifiedProgress
    const totals = getUnifiedTotals()
    if (!unified?.active || !totals) {
        return false
    }

    if (totals.completed >= totals.total) {
        unified.active = false
        return true
    }

    return false
}

function clampPicCount(value, fallback = 1) {
    const numeric = Number(value)
    if (Number.isNaN(numeric)) {
        return fallback
    }
    return Math.max(1, Math.min(12, Math.round(numeric)))
}

function buildPicCountInstruction(injection) {
    if (!injection) {
        return ''
    }

    const mode = injection.picCountMode || 'exact'
    const exact = clampPicCount(injection.picCountExact, 1)
    const min = clampPicCount(injection.picCountMin, 1)
    const max = clampPicCount(injection.picCountMax, Math.max(min, 1))

    switch (mode) {
        case 'range':
            return `Insert between ${Math.min(min, max)} and ${Math.max(
                min,
                max,
            )} <pic prompt="..."> tags per reply.`
        case 'min':
            return `Insert at least ${min} <pic prompt="..."> tag${
                min === 1 ? '' : 's'
            } per reply.`
        case 'max':
            return `Insert at most ${max} <pic prompt="..."> tag${
                max === 1 ? '' : 's'
            } per reply.`
        case 'exact':
        default:
            return `Insert exactly ${exact} <pic prompt="..."> tag${
                exact === 1 ? '' : 's'
            } per reply.`
    }
}

function updatePicCountFieldVisibility(container, mode) {
    if (!container) {
        return
    }

    const normalizedMode = mode || 'exact'
    const fields = container.querySelectorAll('.auto-multi-count-field')
    fields.forEach((field) => {
        const modes =
            field.getAttribute('data-count-mode')?.split(/\s+/) || []
        const shouldShow = modes.includes(normalizedMode)
        field.classList.toggle('is-hidden', !shouldShow)
    })
}

function composePromptInjection(injection) {
    if (!injection) {
        return ''
    }

    const chunks = []
    chunks.push('IMAGE PROMPT INSTRUCTIONS')

    const countInstruction = buildPicCountInstruction(injection)
    if (countInstruction) {
        chunks.push(countInstruction)
    }

    if (injection.mainPrompt?.trim()) {
        chunks.push(injection.mainPrompt.trim())
    }

    if (injection.instructionsPositive?.trim()) {
        chunks.push(injection.instructionsPositive.trim())
    }

    if (injection.instructionsNegative?.trim()) {
        chunks.push('NEGATIVE PROMPT INSTRUCTIONS:')
        chunks.push(injection.instructionsNegative.trim())
    }

    const limitValue = clampPromptLimit(injection.lengthLimit)
    if (limitValue > 0 && injection.lengthLimitType !== 'none') {
        const limitLabel =
            injection.lengthLimitType === 'words' ? 'words' : 'characters'
        chunks.push(`MAXIMUM ${limitValue} ${limitLabel} per prompt`)
    }

    if (injection.examplePrompt?.trim()) {
        chunks.push('EXAMPLE STRUCTURE:')
        chunks.push(injection.examplePrompt.trim())
    }

    if (!chunks.length) {
        return ''
    }

    return `<image_generation>\n${chunks.join('\n')}\n</image_generation>`
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
    const burstThrottleInput = /** @type {HTMLInputElement | null} */ (
        container.querySelector('#auto_multi_burst_throttle')
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
    const summaryPanel = /** @type {HTMLElement | null} */ (
        container.querySelector('#auto_multi_summary_panel')
    )
    const autoGenPanel = /** @type {HTMLElement | null} */ (
        container.querySelector('#auto_multi_autogen_panel')
    )
    const queuePanel = /** @type {HTMLElement | null} */ (
        container.querySelector('#auto_multi_queue_panel')
    )
    const cadencePanel = /** @type {HTMLElement | null} */ (
        container.querySelector('#auto_multi_cadence_panel')
    )
    const autoGenEnabledInput = /** @type {HTMLInputElement | null} */ (
        container.querySelector('#auto_multi_auto_gen_enabled')
    )
    const autoGenInsertSelect = /** @type {HTMLSelectElement | null} */ (
        container.querySelector('#auto_multi_auto_gen_insert_type')
    )
    const promptInjectionEnabledInput =
        /** @type {HTMLInputElement | null} */ (
            container.querySelector('#auto_multi_prompt_injection_enabled')
        )
    const promptMainInput = /** @type {HTMLTextAreaElement | null} */ (
        container.querySelector('#auto_multi_prompt_main')
    )
    const promptPositiveInput = /** @type {HTMLTextAreaElement | null} */ (
        container.querySelector('#auto_multi_prompt_positive')
    )
    const promptNegativeInput = /** @type {HTMLTextAreaElement | null} */ (
        container.querySelector('#auto_multi_prompt_negative')
    )
    const promptExampleInput = /** @type {HTMLTextAreaElement | null} */ (
        container.querySelector('#auto_multi_prompt_example')
    )
    const promptLimitInput = /** @type {HTMLInputElement | null} */ (
        container.querySelector('#auto_multi_prompt_limit')
    )
    const promptLimitTypeSelect = /** @type {HTMLSelectElement | null} */ (
        container.querySelector('#auto_multi_prompt_limit_type')
    )
    const promptRegexInput = /** @type {HTMLTextAreaElement | null} */ (
        container.querySelector('#auto_multi_prompt_regex')
    )
    const promptPositionSelect = /** @type {HTMLSelectElement | null} */ (
        container.querySelector('#auto_multi_prompt_position')
    )
    const promptDepthInput = /** @type {HTMLInputElement | null} */ (
        container.querySelector('#auto_multi_prompt_depth')
    )
    const picCountModeSelect = /** @type {HTMLSelectElement | null} */ (
        container.querySelector('#auto_multi_pic_count_mode')
    )
    const picCountExactInput = /** @type {HTMLInputElement | null} */ (
        container.querySelector('#auto_multi_pic_count_exact')
    )
    const picCountMinInput = /** @type {HTMLInputElement | null} */ (
        container.querySelector('#auto_multi_pic_count_min')
    )
    const picCountMaxInput = /** @type {HTMLInputElement | null} */ (
        container.querySelector('#auto_multi_pic_count_max')
    )

    if (
        !(
            enabledInput &&
            countInput &&
            delayInput &&
            burstThrottleInput &&
            summary &&
            modelRowsContainer &&
            burstModeInput
        )
    ) {
        console.warn('[AutoMultiImage] Settings template missing inputs')
        return
    }

    if (
        !(
            autoGenEnabledInput &&
            autoGenInsertSelect &&
            promptInjectionEnabledInput &&
            promptMainInput &&
            promptPositiveInput &&
            promptNegativeInput &&
            promptExampleInput &&
            promptLimitInput &&
            promptLimitTypeSelect &&
            promptRegexInput &&
            promptPositionSelect &&
            promptDepthInput &&
            picCountModeSelect &&
            picCountExactInput &&
            picCountMinInput &&
            picCountMaxInput
        )
    ) {
        console.warn('[AutoMultiImage] Auto-generation inputs missing')
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

    burstThrottleInput.addEventListener('change', () => {
        const current = getSettings()
        current.burstThrottleMs = clampBurstThrottle(burstThrottleInput.value)
        burstThrottleInput.value = String(current.burstThrottleMs)
        saveSettings()
    })

    burstModeInput.addEventListener('change', () => {
        const current = getSettings()
        current.burstMode = burstModeInput.checked
        saveSettings()
    })

    autoGenEnabledInput?.addEventListener('change', () => {
        const current = getSettings()
        current.autoGeneration.enabled = autoGenEnabledInput.checked
        saveSettings()
    })

    autoGenInsertSelect?.addEventListener('change', () => {
        const current = getSettings()
        current.autoGeneration.insertType = autoGenInsertSelect.value
        saveSettings()
    })

    promptInjectionEnabledInput?.addEventListener('change', () => {
        const current = getSettings()
        current.autoGeneration.promptInjection.enabled =
            promptInjectionEnabledInput.checked
        saveSettings()
    })

    promptMainInput?.addEventListener('input', () => {
        const current = getSettings()
        current.autoGeneration.promptInjection.mainPrompt =
            promptMainInput.value
        saveSettings()
    })

    promptPositiveInput?.addEventListener('input', () => {
        const current = getSettings()
        current.autoGeneration.promptInjection.instructionsPositive =
            promptPositiveInput.value
        saveSettings()
    })

    promptNegativeInput?.addEventListener('input', () => {
        const current = getSettings()
        current.autoGeneration.promptInjection.instructionsNegative =
            promptNegativeInput.value
        saveSettings()
    })

    promptExampleInput?.addEventListener('input', () => {
        const current = getSettings()
        current.autoGeneration.promptInjection.examplePrompt =
            promptExampleInput.value
        saveSettings()
    })

    promptLimitInput?.addEventListener('change', () => {
        const current = getSettings()
        current.autoGeneration.promptInjection.lengthLimit =
            clampPromptLimit(promptLimitInput.value)
        promptLimitInput.value = String(
            current.autoGeneration.promptInjection.lengthLimit,
        )
        saveSettings()
    })

    promptLimitTypeSelect?.addEventListener('change', () => {
        const current = getSettings()
        current.autoGeneration.promptInjection.lengthLimitType =
            promptLimitTypeSelect.value
        saveSettings()
    })

    promptRegexInput?.addEventListener('input', () => {
        const current = getSettings()
        current.autoGeneration.promptInjection.regex = promptRegexInput.value
        saveSettings()
    })

    promptPositionSelect?.addEventListener('change', () => {
        const current = getSettings()
        current.autoGeneration.promptInjection.position =
            promptPositionSelect.value
        saveSettings()
    })

    promptDepthInput?.addEventListener('change', () => {
        const current = getSettings()
        current.autoGeneration.promptInjection.depth = clampDepth(
            promptDepthInput.value,
        )
        promptDepthInput.value = String(
            current.autoGeneration.promptInjection.depth,
        )
        saveSettings()
    })

    picCountModeSelect?.addEventListener('change', () => {
        const current = getSettings()
        current.autoGeneration.promptInjection.picCountMode =
            picCountModeSelect.value
        updatePicCountFieldVisibility(
            container,
            current.autoGeneration.promptInjection.picCountMode,
        )
        saveSettings()
    })

    picCountExactInput?.addEventListener('change', () => {
        const current = getSettings()
        current.autoGeneration.promptInjection.picCountExact =
            clampPicCount(picCountExactInput.value, 1)
        picCountExactInput.value = String(
            current.autoGeneration.promptInjection.picCountExact,
        )
        saveSettings()
    })

    picCountMinInput?.addEventListener('change', () => {
        const current = getSettings()
        current.autoGeneration.promptInjection.picCountMin =
            clampPicCount(picCountMinInput.value, 1)
        picCountMinInput.value = String(
            current.autoGeneration.promptInjection.picCountMin,
        )
        saveSettings()
    })

    picCountMaxInput?.addEventListener('change', () => {
        const current = getSettings()
        current.autoGeneration.promptInjection.picCountMax =
            clampPicCount(picCountMaxInput.value, 3)
        picCountMaxInput.value = String(
            current.autoGeneration.promptInjection.picCountMax,
        )
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
        burstThrottleInput,
        summary,
        modelRowsContainer,
        burstModeInput,
        addModelButton,
        refreshModelsButton,
        autoGenEnabledInput,
        autoGenInsertSelect,
        promptInjectionEnabledInput,
        promptMainInput,
        promptPositiveInput,
        promptNegativeInput,
        promptExampleInput,
        promptLimitInput,
        promptLimitTypeSelect,
        promptRegexInput,
        promptPositionSelect,
        promptDepthInput,
        picCountModeSelect,
        picCountExactInput,
        picCountMinInput,
        picCountMaxInput,
        summaryPanel,
        autoGenPanel,
        queuePanel,
        cadencePanel,
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
            'No dedicated models configured. The current SD selection will be reused.'
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
        return 'the active SD model'
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
        placeholder.textContent = 'Use current SD model'
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
    if (state.ui.burstThrottleInput) {
        state.ui.burstThrottleInput.value = String(
            clampBurstThrottle(settings.burstThrottleMs),
        )
    }
    if (settings.burstMode) {
        settings.burstMode = false
        saveSettings()
    }
    state.ui.burstModeInput.checked = false

    if (state.ui.autoGenEnabledInput) {
        state.ui.autoGenEnabledInput.checked =
            settings.autoGeneration.enabled
    }
    if (state.ui.autoGenInsertSelect) {
        state.ui.autoGenInsertSelect.value =
            settings.autoGeneration.insertType || INSERT_TYPE.DISABLED
    }
    if (state.ui.promptInjectionEnabledInput) {
        state.ui.promptInjectionEnabledInput.checked =
            settings.autoGeneration.promptInjection.enabled
    }
    if (state.ui.promptMainInput) {
        state.ui.promptMainInput.value =
            settings.autoGeneration.promptInjection.mainPrompt
    }
    if (state.ui.promptPositiveInput) {
        state.ui.promptPositiveInput.value =
            settings.autoGeneration.promptInjection.instructionsPositive
    }
    if (state.ui.promptNegativeInput) {
        state.ui.promptNegativeInput.value =
            settings.autoGeneration.promptInjection.instructionsNegative
    }
    if (state.ui.promptExampleInput) {
        state.ui.promptExampleInput.value =
            settings.autoGeneration.promptInjection.examplePrompt
    }
    if (state.ui.promptLimitInput) {
        state.ui.promptLimitInput.value = String(
            clampPromptLimit(settings.autoGeneration.promptInjection.lengthLimit),
        )
    }
    if (state.ui.promptLimitTypeSelect) {
        state.ui.promptLimitTypeSelect.value =
            settings.autoGeneration.promptInjection.lengthLimitType
    }
    if (state.ui.promptRegexInput) {
        state.ui.promptRegexInput.value =
            settings.autoGeneration.promptInjection.regex
    }
    if (state.ui.promptPositionSelect) {
        state.ui.promptPositionSelect.value =
            settings.autoGeneration.promptInjection.position
    }
    if (state.ui.promptDepthInput) {
        state.ui.promptDepthInput.value = String(
            clampDepth(settings.autoGeneration.promptInjection.depth),
        )
    }
    if (state.ui.picCountModeSelect) {
        state.ui.picCountModeSelect.value =
            settings.autoGeneration.promptInjection.picCountMode
    }
    if (state.ui.picCountExactInput) {
        state.ui.picCountExactInput.value = String(
            clampPicCount(
                settings.autoGeneration.promptInjection.picCountExact,
                1,
            ),
        )
    }
    if (state.ui.picCountMinInput) {
        state.ui.picCountMinInput.value = String(
            clampPicCount(
                settings.autoGeneration.promptInjection.picCountMin,
                1,
            ),
        )
    }
    if (state.ui.picCountMaxInput) {
        state.ui.picCountMaxInput.value = String(
            clampPicCount(
                settings.autoGeneration.promptInjection.picCountMax,
                3,
            ),
        )
    }

    updatePicCountFieldVisibility(
        state.ui.container,
        settings.autoGeneration.promptInjection.picCountMode,
    )

    const setPanelEnabled = (panel, enabled) => {
        if (!panel) {
            return
        }
        panel.classList.toggle('is-disabled', !enabled)
        const controls = panel.querySelectorAll(
            'input, select, textarea, button',
        )
        controls.forEach((control) => {
            if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement || control instanceof HTMLButtonElement) {
                control.disabled = !enabled || control.hasAttribute('disabled')
            }
        })
    }

    setPanelEnabled(state.ui.summaryPanel, settings.enabled)
    setPanelEnabled(state.ui.queuePanel, settings.enabled)
    setPanelEnabled(state.ui.cadencePanel, settings.enabled)
    setPanelEnabled(state.ui.autoGenPanel, settings.autoGeneration.enabled)
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

    if (settings.autoGeneration.enabled) {
        const insertLabel = settings.autoGeneration.insertType
        const injectionLabel = settings.autoGeneration.promptInjection.enabled
            ? 'prompt injection on'
            : 'prompt injection off'
        segments.push(
            `auto image gen (${insertLabel}, ${injectionLabel})`,
        )
    }

    const strategyBlurb = settings.burstMode
        ? 'Burst mode is deprecated and has been disabled.'
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
        labelText ||
            (waiting ? 'Preparing swipe queue…' : 'Image Generation Autopilot')

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
    state.autoGenMessages.clear()
    state.runningMessages.clear()
    clearProgress()
    setTimeout(() => refreshReswipeButtons(), 0)
}

function getPromptRole(position) {
    switch (position) {
        case 'deep_user':
            return 'user'
        case 'deep_assistant':
            return 'assistant'
        case 'deep_system':
        default:
            return 'system'
    }
}

function insertPromptAtDepth(chat, prompt, role, depth) {
    if (!Array.isArray(chat)) {
        return
    }

    const entry = { role, content: prompt }
    if (!Number.isFinite(depth) || depth <= 0) {
        chat.push(entry)
        return
    }

    const insertIndex = Math.max(0, chat.length - depth)
    chat.splice(insertIndex, 0, entry)
}

async function handlePromptInjection(eventData) {
    const settings = getSettings()
    const autoSettings = settings.autoGeneration
    if (!autoSettings?.enabled) {
        return
    }

    if (autoSettings.insertType === INSERT_TYPE.DISABLED) {
        return
    }

    const injection = autoSettings.promptInjection
    const composedPrompt = composePromptInjection(injection)
    if (!injection?.enabled || !composedPrompt.trim()) {
        return
    }

    const role = getPromptRole(injection.position)
    const depth = clampDepth(injection.depth)
    insertPromptAtDepth(eventData?.chat, composedPrompt, role, depth)
    log('Prompt injected', { role, depth })
}

async function resolveSlashCommandParser() {
    if (window?.SlashCommandParser?.commands) {
        return window.SlashCommandParser
    }

    if (window?.SillyTavern?.SlashCommandParser?.commands) {
        return window.SillyTavern.SlashCommandParser
    }

    try {
        const module = await import(
            '../../../slash-commands/SlashCommandParser.js'
        )
        if (module?.SlashCommandParser?.commands) {
            return module.SlashCommandParser
        }
    } catch (error) {
        console.warn('[AutoMultiImage] Failed to import SlashCommandParser', error)
    }

    return null
}

async function callSdSlash(prompt, quiet) {
    const parser = await resolveSlashCommandParser()
    const command = parser?.commands?.sd
    if (!command?.callback) {
        console.warn('[AutoMultiImage] SlashCommandParser sd not available')
        return null
    }

    try {
        return await command.callback({ quiet: quiet ? 'true' : 'false' }, prompt)
    } catch (error) {
        console.error('[AutoMultiImage] Slash command sd failed', error)
        return null
    }
}

async function handleIncomingMessage(messageId) {
    const settings = getSettings()
    const autoSettings = settings.autoGeneration
    if (!autoSettings?.enabled) {
        return
    }

    if (autoSettings.insertType === INSERT_TYPE.DISABLED) {
        return
    }

    const context = getCtx()
    const resolvedId =
        typeof messageId === 'number' ? messageId : context.chat?.length - 1
    const message = context.chat?.[resolvedId]
    if (!message || message.is_user || !message.mes) {
        return
    }

    if (state.autoGenMessages.has(resolvedId)) {
        return
    }

    const regex = parseRegexFromString(autoSettings.promptInjection.regex)
    if (!regex) {
        return
    }

    const matches = regex.global
        ? [...message.mes.matchAll(regex)]
        : message.mes.match(regex)
            ? [message.mes.match(regex)]
            : []

    if (!matches.length) {
        return
    }

    const totalImages = matches.length
    let completedImages = 0
    let failedImages = 0
    const swipesPerImage = getSwipeTotal(settings)
    const unified = startUnifiedProgress({
        messageId: resolvedId,
        totalImages,
        swipesPerImage,
        insertType: autoSettings.insertType,
    })

    if (unified.active) {
        updateUnifiedProgress(
            resolvedId,
            true,
            formatUnifiedImageLabel(1),
        )
    } else {
        updateProgressUi(
            resolvedId,
            0,
            totalImages,
            true,
            `Starting SD image generation (1/${totalImages})`,
        )
    }

    state.autoGenMessages.add(resolvedId)
    setTimeout(async () => {
        for (let index = 0; index < matches.length; index += 1) {
            const match = matches[index]
            const prompt = typeof match?.[1] === 'string' ? match[1] : ''
            if (!prompt.trim()) {
                continue
            }

            if (!updateUnifiedProgress(
                resolvedId,
                true,
                formatUnifiedImageLabel(index + 1),
            )) {
                updateProgressUi(
                    resolvedId,
                    completedImages,
                    Math.max(1, totalImages - failedImages),
                    true,
                    `Generating image ${index + 1}/${totalImages}`,
                )
            }

            if (autoSettings.insertType === INSERT_TYPE.NEW_MESSAGE) {
                const result = await callSdSlash(prompt, false)
                if (!result) {
                    failedImages += 1
                    state.unifiedProgress.failedImages = failedImages
                    if (
                        state.unifiedProgress.active &&
                        state.unifiedProgress.insertType ===
                            INSERT_TYPE.NEW_MESSAGE
                    ) {
                        state.unifiedProgress.expectedSwipes = Math.max(
                            0,
                            state.unifiedProgress.expectedSwipes -
                                state.unifiedProgress.swipesPerImage,
                        )
                    }
                    if (!updateUnifiedProgress(
                        resolvedId,
                        false,
                        formatUnifiedSwipeLabel(index + 1, 'Failed image'),
                    )) {
                        updateProgressUi(
                            resolvedId,
                            completedImages,
                            Math.max(1, totalImages - failedImages),
                            false,
                            `Failed image ${index + 1}/${totalImages}`,
                        )
                    }
                } else {
                    completedImages += 1
                    state.unifiedProgress.completedImages = completedImages
                    if (!updateUnifiedProgress(
                        resolvedId,
                        false,
                        formatUnifiedSwipeLabel(index + 1, 'Completed image'),
                    )) {
                        updateProgressUi(
                            resolvedId,
                            completedImages,
                            Math.max(1, totalImages - failedImages),
                            false,
                            `Completed image ${index + 1}/${totalImages}`,
                        )
                    }
                }
                continue
            }

            const imageUrl = await callSdSlash(prompt, true)
            if (!imageUrl || typeof imageUrl !== 'string') {
                failedImages += 1
                state.unifiedProgress.failedImages = failedImages
                if (
                    state.unifiedProgress.active &&
                    state.unifiedProgress.insertType ===
                        INSERT_TYPE.NEW_MESSAGE
                ) {
                    state.unifiedProgress.expectedSwipes = Math.max(
                        0,
                        state.unifiedProgress.expectedSwipes -
                            state.unifiedProgress.swipesPerImage,
                    )
                }
                if (!updateUnifiedProgress(
                    resolvedId,
                    false,
                    formatUnifiedSwipeLabel(index + 1, 'Failed image'),
                )) {
                    updateProgressUi(
                        resolvedId,
                        completedImages,
                        Math.max(1, totalImages - failedImages),
                        false,
                        `Failed image ${index + 1}/${totalImages}`,
                    )
                }
                continue
            }

            if (!message.extra) {
                message.extra = {}
            }

            if (autoSettings.insertType === INSERT_TYPE.INLINE) {
                if (!Array.isArray(message.extra.image_swipes)) {
                    message.extra.image_swipes = []
                }
                if (message.extra.image && !message.extra.image_swipes.includes(message.extra.image)) {
                    message.extra.image_swipes.push(message.extra.image)
                }
                message.extra.image_swipes.push(imageUrl)
                message.extra.image = imageUrl
                message.extra.title = prompt
                message.extra.inline_image = true
            }

            if (autoSettings.insertType === INSERT_TYPE.REPLACE) {
                const originalTag = typeof match?.[0] === 'string' ? match[0] : ''
                if (originalTag) {
                    const escapedUrl = escapeHtmlAttribute(imageUrl)
                    const escapedPrompt = escapeHtmlAttribute(prompt)
                    const newTag = `<img src="${escapedUrl}" title="${escapedPrompt}" alt="${escapedPrompt}">`
                    message.mes = message.mes.replace(originalTag, newTag)
                }
            }

            if (typeof window.appendMediaToMessage === 'function') {
                const messageElement = document.querySelector(
                    `.mes[mesid="${resolvedId}"]`,
                )
                window.appendMediaToMessage(message, messageElement)
            } else if (typeof window.updateMessageBlock === 'function') {
                window.updateMessageBlock(resolvedId, message)
            }

            context.eventSource?.emit(
                context.eventTypes.MESSAGE_UPDATED,
                resolvedId,
            )
            await context.saveChat?.()
            completedImages += 1
            state.unifiedProgress.completedImages = completedImages
            if (!updateUnifiedProgress(
                resolvedId,
                false,
                formatUnifiedSwipeLabel(index + 1, 'Completed image'),
            )) {
                updateProgressUi(
                    resolvedId,
                    completedImages,
                    Math.max(1, totalImages - failedImages),
                    false,
                    `Completed image ${index + 1}/${totalImages}`,
                )
            }
        }

        setTimeout(() => {
            if (!state.unifiedProgress.active || state.unifiedProgress.expectedSwipes === 0) {
                clearProgress(resolvedId)
            }
            finalizeUnifiedProgress()
        }, 1200)
    }, 0)
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

function findMessageActionBar(messageId) {
    const root = document.querySelector(`.mes[mesid="${messageId}"]`)
    if (!root) {
        return null
    }

    const candidates = [
        '.mes_buttons .extraMesButtons',
        '.mes_buttons',
        '.mes_buttons_container',
        '.mes_buttons_block',
        '.mes_buttons_holder',
        '.mes_buttons_wrapper',
        '.message_actions',
        '.mes_actions',
    ]

    for (const selector of candidates) {
        const bar = root.querySelector(selector)
        if (bar) {
            return bar
        }
    }

    return null
}

function injectReswipeButtonTemplate() {
    const template = document.querySelector(
        '#message_template .mes_buttons .extraMesButtons',
    )
    const fallback = document.querySelector('#message_template .mes_buttons')
    const target = template || fallback
    if (!target) {
        console.warn('[AutoMultiImage] Message toolbar template not found')
        return
    }

    if (target.querySelector('.auto-multi-reswipe')) {
        return
    }

    const button = document.createElement('div')
    button.className =
        'mes_button auto-multi-reswipe fa-solid fa-angles-right interactable'
    button.title = 'Generate another swipe batch'
    button.setAttribute('tabindex', '0')
    button.style.display = 'none'
    target.prepend(button)
}

function ensureReswipeButton(messageId, shouldShow = true) {
    const root = document.querySelector(`.mes[mesid="${messageId}"]`)
    if (!root) {
        return
    }

    const existing = root.querySelector('.auto-multi-reswipe')
    if (existing) {
        existing.style.display = shouldShow ? '' : 'none'
        return
    }

    if (!shouldShow) {
        return
    }

    const bar = findMessageActionBar(messageId)
    if (!bar) {
        return
    }

    const button = document.createElement('div')
    button.className =
        'mes_button auto-multi-reswipe fa-solid fa-angles-right interactable'
    button.title = 'Generate another swipe batch'
    button.setAttribute('tabindex', '0')
    bar.appendChild(button)
}

function refreshReswipeButtons() {
    const settings = getSettings()
    const chat = getCtx().chat || []
    const messageElements = document.querySelectorAll('.mes[mesid]')

    messageElements.forEach((element) => {
        const messageId = Number(element.getAttribute('mesid'))
        if (!Number.isFinite(messageId)) {
            return
        }

        const message = chat[messageId]
        const hasMedia = getMediaCount(message) > 0
        const shouldShow = settings.enabled && hasMedia
        ensureReswipeButton(messageId, shouldShow)
    })
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
        ? `Generating swipe ${formatUnifiedSwipeLabel(1, '')}`
        : 'Preparing swipe queue…'

    if (!updateUnifiedProgress(messageId, true, initialLabel)) {
        updateProgressUi(messageId, 0, totalSwipes, true, initialLabel)
    }

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
    let failed = 0
    let effectiveTarget = totalSwipes

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
                if (!updateUnifiedProgress(
                    messageId,
                    true,
                    pendingLabel
                        ? `Generating swipe ${formatUnifiedSwipeLabel(completed + 1, '')}`
                        : modelLabel,
                )) {
                    updateProgressUi(
                        messageId,
                        completed,
                        effectiveTarget,
                        true,
                        pendingLabel ? `Waiting on ${pendingLabel}` : modelLabel,
                    )
                }
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
                    failed += 1
                    effectiveTarget = Math.max(1, totalSwipes - failed)
                    const failedLabel = swipeLabels?.[completed]
                    if (state.unifiedProgress.active) {
                        state.unifiedProgress.expectedSwipes = Math.max(
                            0,
                            state.unifiedProgress.expectedSwipes - 1,
                        )
                    }
                    if (!updateUnifiedProgress(
                        messageId,
                        false,
                        failedLabel
                            ? `Failed ${failedLabel}`
                            : `${modelLabel} swipe failed`,
                    )) {
                        updateProgressUi(
                            messageId,
                            completed,
                            effectiveTarget,
                            false,
                            failedLabel
                                ? `Failed ${failedLabel}`
                                : `${modelLabel} swipe failed`,
                        )
                    }
                    continue
                }

                const completedLabel = swipeLabels?.[completed]
                completed += 1
                if (state.unifiedProgress.active) {
                    state.unifiedProgress.completedSwipes += 1
                }
                if (!updateUnifiedProgress(
                    messageId,
                    false,
                    completedLabel
                        ? `Completed ${completedLabel}`
                        : modelLabel,
                )) {
                    updateProgressUi(
                        messageId,
                        completed,
                        effectiveTarget,
                        false,
                        completedLabel
                            ? `Completed ${completedLabel}`
                            : modelLabel,
                    )
                }

                if (settings.delayMs > 0 && completed < effectiveTarget) {
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
    let failedDispatches = 0
    let effectiveTarget = totalSwipes

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
                const throttleMs = clampBurstThrottle(
                    getSettings().burstThrottleMs,
                )
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
                    failedDispatches += 1
                    effectiveTarget = Math.max(1, totalSwipes - failedDispatches)
                    const failedLabel = swipeLabels?.[issued]
                    issued += 1
                    if (state.unifiedProgress.active) {
                        state.unifiedProgress.expectedSwipes = Math.max(
                            0,
                            state.unifiedProgress.expectedSwipes - 1,
                        )
                    }
                    if (!updateUnifiedProgress(
                        messageId,
                        false,
                        failedLabel
                            ? `Failed ${failedLabel}`
                            : `${label} swipe failed`,
                    )) {
                        updateProgressUi(
                            messageId,
                            issued,
                            effectiveTarget,
                            false,
                            failedLabel
                                ? `Failed ${failedLabel}`
                                : `${label} swipe failed`,
                        )
                    }
                    continue
                }

                const issuedLabel = swipeLabels?.[issued]
                issued += 1
                if (state.unifiedProgress.active) {
                    state.unifiedProgress.completedSwipes += 1
                }
                if (!updateUnifiedProgress(
                    messageId,
                    true,
                    `Generating swipe ${formatUnifiedSwipeLabel(issued, '')}`,
                )) {
                    updateProgressUi(
                        messageId,
                        issued,
                        effectiveTarget,
                        true,
                        issuedLabel ? `Queued ${issuedLabel}` : label,
                    )
                }

                if (issued < effectiveTarget) {
                    if (throttleMs > 0) {
                        await sleep(throttleMs)
                    } else {
                        await sleep(BURST_MODEL_SETTLE_MS)
                    }
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
        failedDispatches,
    )
}

async function monitorBurstCompletion(
    messageId,
    baselineCount,
    totalSwipes,
    token,
    swipeLabels,
    failedDispatches = 0,
) {
    const timeout = getSettings().swipeTimeoutMs
    const deadline = performance.now() + timeout
    const effectiveTarget = Math.max(1, totalSwipes - failedDispatches)
    const targetCount = baselineCount + effectiveTarget
    let lastDelivered = 0

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
        lastDelivered = delivered
        const pendingLabel = swipeLabels?.[delivered]
        if (state.unifiedProgress.active) {
            const baseCompleted = state.unifiedProgress.completedSwipes - lastDelivered
            state.unifiedProgress.completedSwipes = Math.max(
                0,
                baseCompleted + delivered,
            )
            updateUnifiedProgress(
                messageId,
                delivered < effectiveTarget,
                pendingLabel
                    ? `Waiting on ${pendingLabel}`
                    : 'Waiting for swipes',
            )
        } else {
            updateProgressUi(
                messageId,
                Math.min(delivered, effectiveTarget),
                effectiveTarget,
                delivered < effectiveTarget,
                pendingLabel
                    ? `Waiting on ${pendingLabel}`
                    : 'Waiting for swipes',
            )
        }

        if (attachments >= targetCount) {
            return
        }

        await sleep(350)
    }

    console.warn(
        '[AutoMultiImage] Burst swipe completion timed out for message',
        messageId,
    )

    const timeoutDelivered = Math.min(lastDelivered, effectiveTarget)
    if (state.unifiedProgress.active) {
        state.unifiedProgress.completedSwipes = Math.max(
            0,
            state.unifiedProgress.completedSwipes - lastDelivered + timeoutDelivered,
        )
        updateUnifiedProgress(
            messageId,
            false,
            timeoutDelivered > 0
                ? `Timed out after ${timeoutDelivered}/${effectiveTarget} swipes`
                : 'Timed out waiting for swipes',
        )
    } else {
        updateProgressUi(
            messageId,
            timeoutDelivered,
            Math.max(1, timeoutDelivered),
            false,
            timeoutDelivered > 0
                ? `Timed out after ${timeoutDelivered}/${effectiveTarget} swipes`
                : 'Timed out waiting for swipes',
        )
    }
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
            if (finalizeUnifiedProgress()) {
                clearProgress(messageId)
                return
            }

            if (!state.unifiedProgress.active) {
                clearProgress(messageId)
            }
        })

    state.runningMessages.set(messageId, job)
}

async function handleMessageRendered(messageId, origin) {
    const settings = getSettings()
    if (!settings.enabled) {
        return
    }

    const message = getCtx().chat?.[messageId]
    const hasMedia = getMediaCount(message) > 0
    ensureReswipeButton(messageId, hasMedia)

    if (!shouldAutoFill(message)) {
        return
    }

    if (origin !== 'extension') {
        return
    }

    if (state.seenMessages.has(messageId)) {
        return
    }

    state.seenMessages.add(messageId)
    const button = await waitForPaintbrush(messageId)
    if (!button) {
        console.warn(
            '[AutoMultiImage] No SD control found for message',
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

    ensureSettings()
    await buildSettingsPanel()
    injectReswipeButtonTemplate()
    refreshReswipeButtons()

    const chat = document.getElementById('chat')
    chat?.addEventListener('click', async (event) => {
        const target = event.target.closest('.auto-multi-reswipe')
        if (!target) {
            return
        }

        event.preventDefault()
        event.stopPropagation()

        const messageElement = target.closest('.mes')
        const messageId = Number(messageElement?.getAttribute('mesid'))
        if (!Number.isFinite(messageId)) {
            return
        }

        const settings = getSettings()
        if (!settings.enabled) {
            return
        }

        const message = getCtx().chat?.[messageId]
        if (!shouldAutoFill(message)) {
            return
        }

        const paintbrush = await waitForPaintbrush(messageId)
        if (!paintbrush) {
            console.warn(
                '[AutoMultiImage] No SD control found for message',
                messageId,
            )
            return
        }

        queueAutoFill(messageId, paintbrush)
    })

    const { eventSource, eventTypes } = getCtx()
    eventSource.on(eventTypes.CHARACTER_MESSAGE_RENDERED, handleMessageRendered)
    eventSource.on(eventTypes.CHAT_CHANGED, resetPerChatState)
    if (eventTypes.MORE_MESSAGES_LOADED) {
        eventSource.on(eventTypes.MORE_MESSAGES_LOADED, refreshReswipeButtons)
    }
    eventSource.on(eventTypes.SETTINGS_UPDATED, syncUiFromSettings)
    if (eventTypes.CHAT_COMPLETION_PROMPT_READY) {
        eventSource.on(
            eventTypes.CHAT_COMPLETION_PROMPT_READY,
            handlePromptInjection,
        )
    }
    if (eventTypes.MESSAGE_RECEIVED) {
        eventSource.on(eventTypes.MESSAGE_RECEIVED, handleIncomingMessage)
    }

    document.addEventListener('change', handleDocumentChange)

    state.initialized = true
    log('Initialized')
}

;(function bootstrap() {
    const ctx = getCtx()
    ctx.eventSource.on(ctx.eventTypes.APP_READY, () => void init())
})()
