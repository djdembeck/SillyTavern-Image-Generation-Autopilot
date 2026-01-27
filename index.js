const MODULE_NAME = 'Image-Generation-Autopilot'
const INSERT_TYPE = Object.freeze({
    DISABLED: 'disabled',
    INLINE: 'inline',
    REPLACE: 'replace',
    NEW_MESSAGE: 'new',
})
const defaultSettings = Object.freeze({
    enabled: true,
    debugMode: false,
    targetCount: 4,
    delayMs: 800,
    swipeTimeoutMs: 120000,
    concurrency: 4,
    modelQueue: [],
    modelQueueEnabled: true,
    swipeModel: '',
    perCharacter: {
        enabled: false,
        globalDefaults: {},
    },
    autoGeneration: {
        enabled: false,
        insertType: INSERT_TYPE.NEW_MESSAGE,
        promptRewrite: {
            enabled: false,
        },
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
    toastPatched: false,
    ui: null,
    progress: {
        messageId: null,
        container: null,
        statusLabel: null,
        ratioLabel: null,
        progressBar: null,
    },
    abortInProgress: false,
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
    components: {
        StateManager: null,
        GenerationDetector: null,
        ParallelGenerator: null,
        ImageSelectionDialog: null,
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

/**
 * Dynamically import and cache component modules.
 * @returns {Promise<{StateManager: Function, GenerationDetector: Function, ParallelGenerator: Function, ImageSelectionDialog: Function}>}
 */
async function initComponents() {
    if (
        state.components.StateManager &&
        state.components.GenerationDetector &&
        state.components.ParallelGenerator &&
        state.components.ImageSelectionDialog
    ) {
        return state.components
    }

    const extensionPath = `scripts/extensions/${TEMPLATE_ROOT}`

    try {
        const [stateModule, eventsModule, generatorModule, dialogModule] =
            await Promise.all([
                import(`/${extensionPath}/src/state-manager.js`),
                import(`/${extensionPath}/src/generation-events.js`),
                import(`/${extensionPath}/src/parallel-generator.js`),
                import(`/${extensionPath}/src/image-dialog.js`),
            ])

        state.components.StateManager = stateModule.StateManager
        state.components.GenerationDetector = eventsModule.GenerationDetector
        state.components.ParallelGenerator = generatorModule.ParallelGenerator
        state.components.ImageSelectionDialog = dialogModule.ImageSelectionDialog

        log('Components initialized:', Object.keys(state.components))
        return state.components
    } catch (error) {
        console.error('[Image-Generation-Autopilot] Failed to load components', error)
        throw error
    }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const log = (...args) => {
    if (!getSettings().debugMode) return
    console.log('[Image-Generation-Autopilot]', ...args)
}

function logPerCharacter(action, payload) {
    const settings = getSettings()
    if (!settings?.debugMode && !settings?.perCharacter?.enabled) {
        return
    }
    console.log('[Image-Generation-Autopilot][PerCharacter]', action, payload)
}

function patchToastrForDebug() {
    if (state.toastPatched || !getSettings().debugMode) {
        return
    }

    if (typeof window.toastr !== 'object') {
        return
    }

    const originalError = window.toastr.error
    const originalWarning = window.toastr.warning

    const wrap = (fn, level) =>
        function wrappedToastr(message, title, options) {
            try {
                if (
                    typeof message === 'string' &&
                    message.includes('Invalid swipe ID')
                ) {
                    console.groupCollapsed(
                        '[Image-Generation-Autopilot] Invalid swipe ID toast',
                    )
                    console.log('message:', message)
                    console.log('title:', title)
                    console.trace('toast stack')
                    console.groupEnd()
                }
            } catch (error) {
                console.warn(
                    '[Image-Generation-Autopilot] Toast debug failed',
                    error,
                )
            }

            return fn?.call?.(window.toastr, message, title, options)
        }

    if (typeof originalError === 'function') {
        window.toastr.error = wrap(originalError, 'error')
    }
    if (typeof originalWarning === 'function') {
        window.toastr.warning = wrap(originalWarning, 'warning')
    }

    state.toastPatched = true
}

function getCtx() {
    if (
        typeof SillyTavern === 'undefined' ||
        typeof SillyTavern.getContext !== 'function'
    ) {
        throw new Error(
            '[Image-Generation-Autopilot] SillyTavern context not available',
        )
    }
    return SillyTavern.getContext()
}

function ensureSettings() {
    try {
        const ctx = getCtx()
        if (!ctx || !ctx.extensionSettings) {
            console.warn(
                '[Image-Generation-Autopilot] Extension settings not available, using defaults',
            )
            return { ...defaultSettings }
        }
        const { extensionSettings } = ctx
        if (!extensionSettings[MODULE_NAME]) {
            extensionSettings[MODULE_NAME] = { ...defaultSettings }
        }

        for (const [key, value] of Object.entries(defaultSettings)) {
            if (typeof extensionSettings[MODULE_NAME][key] === 'undefined') {
                extensionSettings[MODULE_NAME][key] = value
            }
        }
        const settings = extensionSettings[MODULE_NAME]

        // Migration: Clear old presets that contain circular references
        // Only delete presets that have actual circular references (preset.settings.presets === the preset itself)
        if (settings.presets && Object.keys(settings.presets).length > 0) {
            const presetsWithCircularRefs = []
            for (const [presetId, preset] of Object.entries(settings.presets)) {
                if (preset.settings && preset.settings.presets) {
                    // Check if this is a circular reference (the presets property contains the preset itself)
                    if (preset.settings.presets[presetId] === preset) {
                        presetsWithCircularRefs.push(presetId)
                        console.log(
                            '[Image-Generation-Autopilot] Found preset with circular reference:',
                            { presetId, presetName: preset.name },
                        )
                    }
                }
            }
            if (presetsWithCircularRefs.length > 0) {
                console.log(
                    '[Image-Generation-Autopilot] Clearing presets with circular references:',
                    presetsWithCircularRefs,
                )
                for (const presetId of presetsWithCircularRefs) {
                    delete settings.presets[presetId]
                }
            }
        }

        // Migration: Move presets from old location to separate storage key
        // This fixes the race condition between saveSettings() and savePresetToStorage()
        if (settings.presets && Object.keys(settings.presets).length > 0) {
            if (!extensionSettings[PRESET_STORAGE_KEY]) {
                extensionSettings[PRESET_STORAGE_KEY] = {}
            }
            // Only migrate if the new storage is empty or has fewer presets
            if (
                Object.keys(extensionSettings[PRESET_STORAGE_KEY]).length <
                Object.keys(settings.presets).length
            ) {
                console.log(
                    '[Image-Generation-Autopilot] Migrating presets from old location to separate storage key',
                )
                extensionSettings[PRESET_STORAGE_KEY] = JSON.parse(
                    JSON.stringify(settings.presets),
                )
                // Clear the old location after successful migration
                delete settings.presets
                // Save the migrated presets to persist the changes
                ctx.saveSettingsDebounced()
            }
        }

        if (!settings.autoGeneration) {
            settings.autoGeneration = { ...defaultSettings.autoGeneration }
        }

        if (typeof settings.autoGeneration.enabled !== 'boolean') {
            settings.autoGeneration.enabled = false
        }

        if (
            !Object.values(INSERT_TYPE).includes(
                settings.autoGeneration.insertType,
            )
        ) {
            settings.autoGeneration.insertType = INSERT_TYPE.DISABLED
        }

        if (!settings.autoGeneration.promptRewrite) {
            settings.autoGeneration.promptRewrite = {
                ...defaultSettings.autoGeneration.promptRewrite,
            }
        }

        if (
            typeof settings.autoGeneration.promptRewrite.enabled !== 'boolean'
        ) {
            settings.autoGeneration.promptRewrite.enabled =
                defaultSettings.autoGeneration.promptRewrite.enabled
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

        settings.modelQueueEnabled = normalizeModelQueueEnabled(
            settings.modelQueueEnabled,
            defaultSettings.modelQueueEnabled,
        )

        if (!settings.perCharacter) {
            settings.perCharacter = {
                ...defaultSettings.perCharacter,
                globalDefaults: {},
            }
        }

        if (typeof settings.perCharacter.enabled !== 'boolean') {
            settings.perCharacter.enabled = defaultSettings.perCharacter.enabled
        }

        if (!settings.perCharacter.globalDefaults) {
            settings.perCharacter.globalDefaults = {}
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
    } catch (error) {
        console.error(
            '[Image-Generation-Autopilot] Failed to ensure settings:',
            error,
        )
        return { ...defaultSettings }
    }
}

function getSettings() {
    return ensureSettings()
}

function saveSettings() {
    try {
        const ctx = getCtx()
        if (ctx && typeof ctx.saveSettingsDebounced === 'function') {
            ctx.saveSettingsDebounced()
        }
        syncUiFromSettings()
        syncPerCharacterStorage()
    } catch (error) {
        console.error(
            '[Image-Generation-Autopilot] Failed to save settings:',
            error,
        )
    }
}

function setQueueControlsEnabled(panel, enabled) {
    if (!panel) {
        return
    }
    const controls = panel.querySelectorAll('input, select, textarea, button')
    controls.forEach((control) => {
        if (
            control instanceof HTMLInputElement ||
            control instanceof HTMLSelectElement ||
            control instanceof HTMLTextAreaElement ||
            control instanceof HTMLButtonElement
        ) {
            if (control.id === 'auto_multi_model_queue_enabled') {
                return
            }
            control.disabled = !enabled || control.hasAttribute('disabled')
        }
    })
}

function applyQueueEnabledState(queueEnabled) {
    if (!state.ui?.queuePanel) {
        return
    }
    state.ui.queuePanel.classList.toggle('is-queue-disabled', !queueEnabled)
    setQueueControlsEnabled(state.ui.queuePanel, queueEnabled)
}

const PER_CHARACTER_FIELDS = Object.freeze({
    mainPrompt: {
        label: 'Main prompt',
        get: (settings) =>
            settings.autoGeneration.promptInjection.mainPrompt || '',
        set: (settings, value) => {
            settings.autoGeneration.promptInjection.mainPrompt =
                typeof value === 'string' ? value : ''
        },
    },
    promptPositive: {
        label: 'Image prompt instructions (positive)',
        get: (settings) =>
            settings.autoGeneration.promptInjection.instructionsPositive || '',
        set: (settings, value) => {
            settings.autoGeneration.promptInjection.instructionsPositive =
                typeof value === 'string' ? value : ''
        },
    },
    promptNegative: {
        label: 'Image prompt instructions (negative)',
        get: (settings) =>
            settings.autoGeneration.promptInjection.instructionsNegative || '',
        set: (settings, value) => {
            settings.autoGeneration.promptInjection.instructionsNegative =
                typeof value === 'string' ? value : ''
        },
    },
    examplePrompt: {
        label: 'Example prompt',
        get: (settings) =>
            settings.autoGeneration.promptInjection.examplePrompt || '',
        set: (settings, value) => {
            settings.autoGeneration.promptInjection.examplePrompt =
                typeof value === 'string' ? value : ''
        },
    },
    modelQueue: {
        label: 'Model queue',
        get: (settings) => ({
            modelQueue: sanitizeModelQueue(
                settings.modelQueue,
                clampCount(settings.targetCount),
            ),
            modelQueueEnabled: normalizeModelQueueEnabled(
                settings.modelQueueEnabled,
                defaultSettings.modelQueueEnabled,
            ),
        }),
        set: (settings, value) => {
            if (!value || typeof value !== 'object') {
                return
            }
            if (Array.isArray(value.modelQueue)) {
                settings.modelQueue = sanitizeModelQueue(
                    value.modelQueue,
                    clampCount(settings.targetCount),
                )
            }
            if (typeof value.modelQueueEnabled !== 'undefined') {
                settings.modelQueueEnabled = normalizeModelQueueEnabled(
                    value.modelQueueEnabled,
                    defaultSettings.modelQueueEnabled,
                )
            }
        },
    },
    imageCount: {
        label: 'Image count rule + values',
        get: (settings) => ({
            picCountMode: settings.autoGeneration.promptInjection.picCountMode,
            picCountExact:
                settings.autoGeneration.promptInjection.picCountExact,
            picCountMin: settings.autoGeneration.promptInjection.picCountMin,
            picCountMax: settings.autoGeneration.promptInjection.picCountMax,
        }),
        set: (settings, value) => {
            if (!value || typeof value !== 'object') {
                return
            }
            if (value.picCountMode) {
                settings.autoGeneration.promptInjection.picCountMode =
                    value.picCountMode
            }
            settings.autoGeneration.promptInjection.picCountExact =
                clampPicCount(value.picCountExact, 1)
            settings.autoGeneration.promptInjection.picCountMin = clampPicCount(
                value.picCountMin,
                1,
            )
            settings.autoGeneration.promptInjection.picCountMax = clampPicCount(
                value.picCountMax,
                Math.max(
                    settings.autoGeneration.promptInjection.picCountMin,
                    1,
                ),
            )
        },
    },
})

function buildShareableSettingsSnapshot(settings) {
    if (!settings || typeof settings !== 'object') {
        return {}
    }
    let snapshot
    try {
        snapshot = JSON.parse(JSON.stringify(settings))
    } catch (error) {
        snapshot = { ...settings }
    }

    if (snapshot?.perCharacter) {
        delete snapshot.perCharacter.globalDefaults
        delete snapshot.perCharacter.fields
    }

    // Exclude 'presets' property from snapshot to prevent embedded presets in character-specific settings
    if (snapshot?.presets) {
        delete snapshot.presets
    }

    return snapshot
}

function applySettingsSnapshot(target, snapshot) {
    if (!target || typeof target !== 'object') {
        return
    }
    if (!snapshot || typeof snapshot !== 'object') {
        return
    }
    const cloned = buildShareableSettingsSnapshot(snapshot)
    for (const key of Object.keys(target)) {
        delete target[key]
    }
    Object.assign(target, cloned)
}

function resolveCharacterById(ctx, id) {
    if (!ctx?.characters || typeof id === 'undefined' || id === null) {
        return null
    }

    if (Array.isArray(ctx.characters)) {
        if (Number.isInteger(Number(id))) {
            const byIndex = ctx.characters[Number(id)]
            if (byIndex) {
                return byIndex
            }
        }

        return (
            ctx.characters.find(
                (char) =>
                    char?.id === id ||
                    char?.data?.id === id ||
                    char?.avatar === id ||
                    char?.data?.avatar === id,
            ) || null
        )
    }

    if (ctx.characters && ctx.characters[id]) {
        return ctx.characters[id]
    }

    return null
}

function resolveCharacterByName(ctx, name) {
    if (!ctx?.characters || !name) {
        return null
    }
    const needle = String(name).trim().toLowerCase()
    if (!needle) {
        return null
    }

    if (Array.isArray(ctx.characters)) {
        return (
            ctx.characters.find((char) => {
                const label =
                    char?.data?.name || char?.name || char?.data?.displayName
                return label && String(label).trim().toLowerCase() === needle
            }) || null
        )
    }

    return null
}

function normalizeCharacterId(value) {
    if (typeof value === 'undefined' || value === null) {
        return null
    }
    if (typeof value === 'number' && Number.isInteger(value)) {
        return value
    }
    const asNumber = Number(value)
    if (Number.isInteger(asNumber)) {
        return asNumber
    }
    return value
}

function getCharacterRecord() {
    const ctx = getCtx()
    let character = null
    let source = 'unknown'
    let characterId = null

    const idCandidates = [
        ctx?.characterId,
        ctx?.chat_metadata?.character_id,
        ctx?.chatMetadata?.character_id,
        ctx?.chat_metadata?.characterId,
        ctx?.chatMetadata?.characterId,
        ctx?.selectedCharacterId,
    ].filter((value) => typeof value !== 'undefined' && value !== null)
    for (const candidate of idCandidates) {
        const normalizedCandidate = normalizeCharacterId(candidate)
        characterId = normalizedCandidate
        character = resolveCharacterById(ctx, normalizedCandidate)
        if (character) {
            source = 'id'
            break
        }
    }

    if (!character && ctx?.character && typeof ctx.character === 'object') {
        character = ctx.character
        source = 'character'
    }

    if (!character && typeof ctx?.getCurrentCharacter === 'function') {
        try {
            character = ctx.getCurrentCharacter()
            source = 'getCurrentCharacter'
        } catch (error) {
            character = null
        }
    }

    if (!character && typeof ctx?.getCharacter === 'function') {
        try {
            character = ctx.getCharacter()
            source = 'getCharacter'
        } catch (error) {
            return { character: null, source: 'error', characterId }
        }
    }

    if (!character) {
        const nameCandidate = ctx?.name2 || ctx?.character_name
        const resolvedByName = resolveCharacterByName(ctx, nameCandidate)
        if (resolvedByName) {
            character = resolvedByName
            source = 'name'
        }
    }

    return { character, source, characterId }
}

function getCharacterIdentity(character) {
    if (!character || typeof character !== 'object') {
        return 'unknown'
    }
    const dataHost = character.data || character
    const name = dataHost?.name || character?.name || 'unnamed'
    const id =
        dataHost?.id || character?.id || dataHost?.avatar || character?.avatar
    return id ? `${name} (${id})` : name
}

function getCharacterExtensionStore(character) {
    if (!character || typeof character !== 'object') {
        return null
    }
    if (!character.data) {
        character.data = {}
    }
    const dataHost = character.data
    if (!dataHost.extensions) {
        dataHost.extensions = {}
    }
    if (!dataHost.extensions[MODULE_NAME]) {
        dataHost.extensions[MODULE_NAME] = {}
    }
    return dataHost.extensions[MODULE_NAME]
}

function ensurePerCharacterDefaults(settings, forceSnapshot = false) {
    const perCharacter = settings.perCharacter
    const defaults = perCharacter.globalDefaults || {}
    const hasDefaults = Object.keys(defaults).length > 0

    if (!forceSnapshot) {
        if (!hasDefaults) {
            perCharacter.globalDefaults = defaults
        }
        return defaults
    }

    const snapshot = buildShareableSettingsSnapshot(settings)
    perCharacter.globalDefaults = snapshot
    return snapshot
}

function applyPerCharacterOverrides() {
    console.info('[Image-Generation-Autopilot][PerCharacter] apply invoked')
    const settings = getSettings()
    const perCharacter = settings.perCharacter
    if (!perCharacter?.enabled) {
        console.info(
            '[Image-Generation-Autopilot][PerCharacter] apply skipped',
            {
                reason: 'disabled',
            },
        )
        return
    }
    const ctx = getCtx()
    const record = getCharacterRecord()
    const character = record.character
    const canonical = resolveCharacterById(ctx, record.characterId)
    if (!character && !canonical) {
        const defaults = ensurePerCharacterDefaults(settings)
        if (Object.keys(defaults).length) {
            applySettingsSnapshot(settings, defaults)
        }
        console.info(
            '[Image-Generation-Autopilot][PerCharacter] apply skipped',
            {
                reason: 'no-character',
                characterId: record.characterId,
                source: record.source,
                name2: getCtx()?.name2,
                groupId: getCtx()?.groupId,
                chatCharacterId: getCtx()?.chat_metadata?.character_id,
            },
        )
        syncUiFromSettings()
        return
    }
    const store = getCharacterExtensionStore(canonical || character)
    const savedSettings = store?.settings
    let defaults = ensurePerCharacterDefaults(settings)

    if (!Object.keys(defaults).length) {
        defaults = ensurePerCharacterDefaults(settings, true)
    }

    if (!perCharacter.enabled) {
        if (Object.keys(defaults).length) {
            applySettingsSnapshot(settings, defaults)
        }
        logPerCharacter('apply', {
            character: getCharacterIdentity(canonical || character),
            source: record.source,
            characterId: record.characterId,
            enabled: perCharacter.enabled,
            hasSaved: !!savedSettings,
        })
        syncUiFromSettings()
        return
    }

    if (Object.keys(defaults).length) {
        applySettingsSnapshot(settings, defaults)
    }

    if (savedSettings) {
        applySettingsSnapshot(settings, savedSettings)
    }

    if (settings.perCharacter) {
        settings.perCharacter.enabled = true
        settings.perCharacter.globalDefaults = defaults
    }

    logPerCharacter('apply', {
        character: getCharacterIdentity(canonical || character),
        source: record.source,
        characterId: record.characterId,
        enabled: perCharacter.enabled,
        hasSaved: !!savedSettings,
    })

    syncUiFromSettings()
}

function syncPerCharacterStorage() {
    console.info('[Image-Generation-Autopilot][PerCharacter] save invoked')
    const settings = getSettings()
    const perCharacter = settings.perCharacter
    if (!perCharacter?.enabled) {
        console.info(
            '[Image-Generation-Autopilot][PerCharacter] save skipped',
            {
                reason: 'disabled',
            },
        )
        return
    }
    const ctx = getCtx()
    const record = getCharacterRecord()
    const character = record.character
    const canonical = resolveCharacterById(ctx, record.characterId)
    if (!character && !canonical) {
        console.info(
            '[Image-Generation-Autopilot][PerCharacter] save skipped',
            {
                reason: 'no-character',
                characterId: record.characterId,
                source: record.source,
                name2: getCtx()?.name2,
                groupId: getCtx()?.groupId,
                chatCharacterId: getCtx()?.chat_metadata?.character_id,
            },
        )
        return
    }
    const store = getCharacterExtensionStore(canonical || character)
    const snapshot = buildShareableSettingsSnapshot(settings)
    store.settings = snapshot

    if (canonical && canonical !== character) {
        const canonicalStore = getCharacterExtensionStore(canonical)
        canonicalStore.settings = snapshot
    }
    if (character && character !== canonical) {
        const localStore = getCharacterExtensionStore(character)
        localStore.settings = snapshot
    }
    if (
        ctx.character &&
        ctx.character !== character &&
        ctx.character !== canonical
    ) {
        const currentStore = getCharacterExtensionStore(ctx.character)
        currentStore.settings = snapshot
    }

    logPerCharacter('save', {
        character: getCharacterIdentity(canonical || character),
        source: record.source,
        characterId: record.characterId,
        savedKeys: Object.keys(snapshot || {}),
    })

    if (typeof ctx.writeExtensionField === 'function') {
        const writeId = normalizeCharacterId(record.characterId)
        if (Number.isInteger(writeId)) {
            const payload = {
                settings: snapshot,
            }
            Promise.resolve(
                ctx.writeExtensionField(writeId, MODULE_NAME, payload),
            )
                .then(() => {
                    logPerCharacter('writeExtensionField', {
                        character: getCharacterIdentity(canonical || character),
                        characterId: writeId,
                        savedKeys: Object.keys(snapshot || {}),
                    })
                })
                .catch((error) => {
                    console.warn(
                        '[Image-Generation-Autopilot][PerCharacter] writeExtensionField failed',
                        error,
                    )
                })
            return
        }

        console.warn(
            '[Image-Generation-Autopilot][PerCharacter] writeExtensionField skipped (no characterId)',
            {
                characterId: record.characterId,
                source: record.source,
            },
        )
    }

    console.warn(
        '[Image-Generation-Autopilot][PerCharacter] writeExtensionField unavailable',
    )
}

// ==================== PRESET CHARACTER INTEGRATION ====================

function applyPresetToCharacter(presetId) {
    const preset = getPreset(presetId)
    if (!preset) {
        console.warn('[Image-Generation-Autopilot] Preset not found:', presetId)
        return false
    }

    const settings = getSettings()
    const newSettings = JSON.parse(JSON.stringify(preset.settings))

    // Exclude 'presets' property from loaded preset settings
    const { presets: _, ...newSettingsWithoutPresets } = newSettings

    // Update settings - merge but exclude 'presets' property
    const ctx = getCtx()
    if (ctx?.extensionSettings?.[MODULE_NAME]) {
        const { presets, ...settingsWithoutPresets } = settings
        ctx.extensionSettings[MODULE_NAME] = {
            ...settingsWithoutPresets,
            ...newSettingsWithoutPresets,
        }
    }

    // Save to character if per-character is enabled
    if (settings.perCharacter?.enabled) {
        syncPerCharacterStorage()
    }

    // Save and sync UI
    saveSettings()
    return true
}

function savePresetToCharacter(presetId) {
    const preset = getPreset(presetId)
    if (!preset) {
        console.warn('[Image-Generation-Autopilot] Preset not found:', presetId)
        return false
    }

    const settings = getSettings()
    const newSettings = JSON.parse(JSON.stringify(preset.settings))

    // Exclude 'presets' property from loaded preset settings
    const { presets: _, ...newSettingsWithoutPresets } = newSettings

    // Update settings - merge but exclude 'presets' property
    const ctx = getCtx()
    if (ctx?.extensionSettings?.[MODULE_NAME]) {
        const { presets, ...settingsWithoutPresets } = settings
        ctx.extensionSettings[MODULE_NAME] = {
            ...settingsWithoutPresets,
            ...newSettingsWithoutPresets,
        }
    }

    // Save to character if per-character is enabled
    if (settings.perCharacter?.enabled) {
        syncPerCharacterStorage()
    }

    // Save and sync UI
    saveSettings()
    return true
}

function loadPresetToCharacter(presetId) {
    const success = loadPreset(presetId)
    if (success) {
        // Also save to character if per-character is enabled
        const settings = getSettings()
        if (settings.perCharacter?.enabled) {
            syncPerCharacterStorage()
        }
        console.info(
            '[Image-Generation-Autopilot] Preset loaded to character',
            { presetId },
        )
    }
    return success
}

// ==================== END PRESET CHARACTER INTEGRATION ====================

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

function normalizeModelQueueEnabled(
    value,
    fallback = defaultSettings.modelQueueEnabled,
) {
    if (typeof value === 'boolean') {
        return value
    }
    if (typeof value === 'number') {
        return value !== 0
    }
    if (typeof value === 'string') {
        const trimmed = value.trim().toLowerCase()
        if (trimmed === 'true' || trimmed === '1') {
            return true
        }
        if (trimmed === 'false' || trimmed === '0') {
            return false
        }
    }
    return fallback
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
            return new RegExp(
                pattern,
                flags.includes('g') ? flags : `${flags}g`,
            )
        } catch (error) {
            console.warn(
                '[Image-Generation-Autopilot] Invalid regex string',
                error,
            )
            return null
        }
    }

    try {
        return new RegExp(source, 'g')
    } catch (error) {
        console.warn('[Image-Generation-Autopilot] Invalid regex string', error)
        return null
    }
}

function getPicPromptMatches(messageText, regex) {
    if (!messageText || !regex) {
        return []
    }

    return regex.global
        ? [...messageText.matchAll(regex)]
        : messageText.match(regex)
          ? [messageText.match(regex)]
          : []
}

function normalizeRewrittenPrompt(originalPrompt, rewrittenText, regex) {
    const fallback = typeof originalPrompt === 'string' ? originalPrompt : ''
    if (typeof rewrittenText !== 'string') {
        return fallback
    }

    let cleaned = rewrittenText.trim()
    if (!cleaned) {
        return fallback
    }

    cleaned = cleaned.replace(/^['"`]+|['"`]+$/g, '').trim()

    if (regex) {
        const matches = getPicPromptMatches(cleaned, regex)
        if (matches.length && typeof matches[0]?.[1] === 'string') {
            return matches[0][1].trim()
        }
    }

    const promptAttr = cleaned.match(/prompt\s*=\s*"([^"]+)"/i)
    if (promptAttr?.[1]) {
        return promptAttr[1].trim()
    }

    cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '')
    cleaned = cleaned.replace(/<[^>]+>/g, '')
    cleaned = cleaned.trim()

    const firstLine = cleaned.split(/\r?\n/).find((line) => line.trim())
    return firstLine?.trim() || cleaned || fallback
}

async function cleanupRewriteMessages(startLength) {
    const ctx = getCtx()
    const chat = ctx.chat || []
    if (!Number.isFinite(startLength) || chat.length <= startLength) {
        return
    }

    let removed = 0
    for (let index = chat.length - 1; index >= startLength; index -= 1) {
        const message = chat[index]
        if (message?.is_user) {
            continue
        }
        chat.splice(index, 1)
        ctx.eventSource?.emit(ctx.eventTypes.MESSAGE_DELETED, index)
        if (typeof window.deleteMessageBlock === 'function') {
            window.deleteMessageBlock(index)
        }
        removed += 1
    }

    if (removed > 0) {
        await ctx.saveChat?.()
        if (typeof window.updateChat === 'function') {
            window.updateChat()
        }
        log('Removed rewrite chat messages', { removed })
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
    state.abortInProgress = false
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

    const remainingImages = Math.max(
        0,
        unified.totalImages - unified.failedImages,
    )
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
        const modes = field.getAttribute('data-count-mode')?.split(/\s+/) || []
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
    const queueEnabled = normalizeModelQueueEnabled(
        settings?.modelQueueEnabled,
        defaultSettings.modelQueueEnabled,
    )
    const queue = queueEnabled
        ? sanitizeModelQueue(settings?.modelQueue, fallbackCount)
        : []

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
            '[Image-Generation-Autopilot] Could not find extension settings container.',
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
            '[Image-Generation-Autopilot] Failed to load settings template',
            error,
        )
        return
    }

    const template = document.createElement('template')
    template.innerHTML = html.trim()
    const container = template.content.firstElementChild
    if (!container) {
        console.warn('[Image-Generation-Autopilot] Settings template empty')
        return
    }

    root.appendChild(container)

    const enabledInput = /** @type {HTMLInputElement | null} */ (
        container.querySelector('#auto_multi_image_enabled')
    )
    const modelQueueEnabledInput = /** @type {HTMLInputElement | null} */ (
        container.querySelector('#auto_multi_model_queue_enabled')
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
    const summaryPanel = /** @type {HTMLElement | null} */ (
        container.querySelector('#auto_multi_summary_panel')
    )
    const autoGenPanel = /** @type {HTMLElement | null} */ (
        container.querySelector('#auto_multi_autogen_panel')
    )
    const queuePanel = /** @type {HTMLElement | null} */ (
        container.querySelector('#auto_multi_queue_panel')
    )
    const characterPanel = /** @type {HTMLElement | null} */ (
        container.querySelector('#auto_multi_character_panel')
    )
    const characterEnabledInput = /** @type {HTMLInputElement | null} */ (
        container.querySelector('#auto_multi_character_enabled')
    )
    const characterResetButton = /** @type {HTMLButtonElement | null} */ (
        container.querySelector('#auto_multi_character_reset')
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
    const promptInjectionEnabledInput = /** @type {HTMLInputElement | null} */ (
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
    const promptRewriteEnabledInput = /** @type {HTMLInputElement | null} */ (
        container.querySelector('#auto_multi_prompt_rewrite_enabled')
    )
    const promptPositionSelect = /** @type {HTMLSelectElement | null} */ (
        container.querySelector('#auto_multi_prompt_position')
    )
    const promptDepthInput = /** @type {HTMLInputElement | null} */ (
        container.querySelector('#auto_multi_prompt_depth')
    )
    const debugModeInput = /** @type {HTMLInputElement | null} */ (
        container.querySelector('#auto_multi_debug_mode')
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
            summary &&
            modelRowsContainer
        )
    ) {
        console.warn(
            '[Image-Generation-Autopilot] Settings template missing inputs',
        )
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
            promptRewriteEnabledInput &&
            promptPositionSelect &&
            promptDepthInput &&
            debugModeInput &&
            picCountModeSelect &&
            picCountExactInput &&
            picCountMinInput &&
            picCountMaxInput
        )
    ) {
        console.warn(
            '[Image-Generation-Autopilot] Auto-generation inputs missing',
        )
    }

    // Initialize state.ui object early to avoid null reference errors
    state.ui = {
        container,
        enabledInput,
        modelQueueEnabledInput,
        countInput,
        delayInput,
        summary,
        modelRowsContainer,
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
        promptRewriteEnabledInput,
        promptPositionSelect,
        promptDepthInput,
        debugModeInput,
        picCountModeSelect,
        picCountExactInput,
        picCountMinInput,
        picCountMaxInput,
        summaryPanel,
        autoGenPanel,
        queuePanel,
        cadencePanel,
        characterPanel,
        characterEnabledInput,
        characterResetButton,
        presetSaveButton: null,
        presetNameInput: null,
        presetListContainer: null,
    }

    enabledInput.addEventListener('change', () => {
        const current = getSettings()
        current.enabled = enabledInput.checked
        saveSettings()
    })

    modelQueueEnabledInput?.addEventListener('change', () => {
        const current = getSettings()
        current.modelQueueEnabled = modelQueueEnabledInput.checked
        saveSettings()
        applyQueueEnabledState(modelQueueEnabledInput.checked)
    })

    characterEnabledInput?.addEventListener('change', () => {
        const current = getSettings()
        current.perCharacter.enabled = characterEnabledInput.checked
        if (characterEnabledInput.checked) {
            ensurePerCharacterDefaults(current, true)
        }
        console.info('[Image-Generation-Autopilot][PerCharacter] toggle', {
            enabled: characterEnabledInput.checked,
        })
        saveSettings()
        applyPerCharacterOverrides()
    })

    characterResetButton?.addEventListener('click', (event) => {
        event.preventDefault()
        resetPerCharacterSettingsToDefaults()
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
        current.autoGeneration.promptInjection.lengthLimit = clampPromptLimit(
            promptLimitInput.value,
        )
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

    promptRewriteEnabledInput?.addEventListener('change', () => {
        const current = getSettings()
        current.autoGeneration.promptRewrite.enabled =
            promptRewriteEnabledInput.checked
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

    debugModeInput?.addEventListener('change', () => {
        const current = getSettings()
        current.debugMode = debugModeInput.checked
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
        current.autoGeneration.promptInjection.picCountExact = clampPicCount(
            picCountExactInput.value,
            1,
        )
        picCountExactInput.value = String(
            current.autoGeneration.promptInjection.picCountExact,
        )
        saveSettings()
    })

    picCountMinInput?.addEventListener('change', () => {
        const current = getSettings()
        current.autoGeneration.promptInjection.picCountMin = clampPicCount(
            picCountMinInput.value,
            1,
        )
        picCountMinInput.value = String(
            current.autoGeneration.promptInjection.picCountMin,
        )
        saveSettings()
    })

    picCountMaxInput?.addEventListener('change', () => {
        const current = getSettings()
        current.autoGeneration.promptInjection.picCountMax = clampPicCount(
            picCountMaxInput.value,
            3,
        )
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

    // Get preset UI elements
    const presetSaveButton = /** @type {HTMLButtonElement | null} */ (
        container.querySelector('#auto_multi_save_preset_button')
    )
    const presetNameInput = /** @type {HTMLInputElement | null} */ (
        container.querySelector('#auto_multi_new_preset_name')
    )
    const presetListContainer = /** @type {HTMLDivElement | null} */ (
        container.querySelector('#auto_multi_preset_list')
    )

    // Store references
    state.ui.presetSaveButton = presetSaveButton
    state.ui.presetNameInput = presetNameInput
    state.ui.presetListContainer = presetListContainer

    // Add preset management event listeners
    presetSaveButton?.addEventListener('click', handleSavePreset)
    presetNameInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleSavePreset()
        }
    })

    // Initial render of presets
    renderPresets()

    syncModelSelectOptions()
    syncUiFromSettings()
}

// ==================== PRESET UI HANDLERS ====================

function handleSavePreset() {
    const name = state.ui.presetNameInput?.value?.trim()
    if (!name) {
        console.warn('[Image-Generation-Autopilot] Preset name is required')
        return
    }

    const currentSettings = getCurrentSettingsSnapshot()
    const id = 'preset_' + Date.now()

    savePreset(id, name, currentSettings)

    // Clear input and re-render
    state.ui.presetNameInput.value = ''
    renderPresets()

    console.info('[Image-Generation-Autopilot] Preset saved', { id, name })
}

function handleLoadPreset(id) {
    const success = loadPreset(id)
    if (success) {
        renderPresets()
        console.info('[Image-Generation-Autopilot] Preset loaded', { id })
    }
}

function handleDeletePreset(id) {
    if (!confirm('Are you sure you want to delete this preset?')) {
        return
    }

    deletePreset(id)
    renderPresets()
    console.info('[Image-Generation-Autopilot] Preset deleted', { id })
}

function renderPresets() {
    const presets = listPresets()
    const container = state.ui.presetListContainer

    if (!container) {
        return
    }

    if (presets.length === 0) {
        container.innerHTML = `
            <p class="auto-multi-preset-empty" role="status">
                <span class="fa-solid fa-folder-open" aria-hidden="true"></span>
                <span>No presets saved yet. Create one above.</span>
            </p>
        `
        return
    }

    container.innerHTML = presets
        .map((preset) => {
            const createdAt = new Date(preset.createdAt).toLocaleString()
            return `
            <div class="auto-multi-preset-item" data-preset-id="${preset.id}" role="listitem">
                <button
                    type="button"
                    class="auto-multi-preset-body"
                    title="Load this preset"
                    aria-label="Load preset ${escapeHtml(preset.name)}"
                >
                    <div class="auto-multi-preset-info">
                        <div class="auto-multi-preset-name">${escapeHtml(preset.name)}</div>
                        <div class="auto-multi-preset-date">${createdAt}</div>
                    </div>
                </button>
                <div class="auto-multi-preset-actions">
                    <button
                        type="button"
                        class="menu_button auto-multi-preset-load"
                        title="Load this preset"
                        aria-label="Load preset ${escapeHtml(preset.name)}"
                    >
                        <span class="fa-solid fa-download" aria-hidden="true"></span>
                    </button>
                    <button
                        type="button"
                        class="menu_button auto-multi-preset-rename"
                        title="Rename this preset"
                        aria-label="Rename preset ${escapeHtml(preset.name)}"
                    >
                        <span class="fa-solid fa-pen" aria-hidden="true"></span>
                    </button>
                    <button
                        type="button"
                        class="menu_button auto-multi-preset-delete"
                        title="Delete this preset"
                        aria-label="Delete preset ${escapeHtml(preset.name)}"
                    >
                        <span class="fa-solid fa-trash" aria-hidden="true"></span>
                    </button>
                </div>
            </div>
        `
        })
        .join('')

    // Add event listeners to preset buttons
    container.querySelectorAll('.auto-multi-preset-body').forEach((btn) => {
        btn.addEventListener('click', () => {
            const presetId = btn.closest('.auto-multi-preset-item')?.dataset
                .presetId
            if (presetId) {
                handleLoadPreset(presetId)
            }
        })
    })

    container.querySelectorAll('.auto-multi-preset-load').forEach((btn) => {
        btn.addEventListener('click', () => {
            const presetId = btn.closest('.auto-multi-preset-item')?.dataset
                .presetId
            if (presetId) {
                handleLoadPreset(presetId)
            }
        })
    })

    container.querySelectorAll('.auto-multi-preset-delete').forEach((btn) => {
        btn.addEventListener('click', () => {
            const presetId = btn.closest('.auto-multi-preset-item')?.dataset
                .presetId
            if (presetId) {
                handleDeletePreset(presetId)
            }
        })
    })

    container.querySelectorAll('.auto-multi-preset-rename').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.preventDefault()
            e.stopPropagation()
            const presetItem = btn.closest('.auto-multi-preset-item')
            console.log(
                '[Image-Generation-Autopilot] Rename button clicked, presetItem:',
                presetItem,
            )
            const presetId = presetItem?.dataset.presetId
            console.log(
                '[Image-Generation-Autopilot] Rename button clicked, presetId:',
                presetId,
            )
            if (presetId) {
                handleRenamePreset(presetId)
            } else {
                console.error(
                    '[Image-Generation-Autopilot] Could not get presetId from rename button',
                )
            }
        })
    })
}

function escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
}

function resetPerCharacterSettingsToDefaults() {
    console.info('[Image-Generation-Autopilot][PerCharacter] reset invoked')
    const settings = getSettings()
    const perCharacter = settings.perCharacter
    if (!perCharacter?.enabled) {
        console.info(
            '[Image-Generation-Autopilot][PerCharacter] reset skipped',
            {
                reason: 'disabled',
            },
        )
        return
    }
    const ctx = getCtx()
    const record = getCharacterRecord()
    const character = record.character
    const canonical = resolveCharacterById(ctx, record.characterId)
    if (!character && !canonical) {
        console.warn(
            '[Image-Generation-Autopilot][PerCharacter] reset skipped (no character)',
            {
                characterId: record.characterId,
                source: record.source,
            },
        )
        return
    }

    const seenStores = new WeakSet()
    const stores = []
    const collectStore = (target) => {
        if (!target || typeof target !== 'object') {
            return
        }
        const store = getCharacterExtensionStore(target)
        if (!store || seenStores.has(store)) {
            return
        }
        seenStores.add(store)
        stores.push(store)
    }

    collectStore(canonical || character)
    collectStore(character)
    collectStore(ctx.character)

    let cleared = 0
    stores.forEach((store) => {
        if (store && Object.prototype.hasOwnProperty.call(store, 'settings')) {
            delete store.settings
            cleared += 1
        }
    })

    logPerCharacter('reset', {
        character: getCharacterIdentity(canonical || character),
        characterId: record.characterId,
        clearedStores: cleared,
    })

    if (typeof ctx.writeExtensionField === 'function') {
        const writeId = normalizeCharacterId(record.characterId)
        if (Number.isInteger(writeId)) {
            const payload = {
                settings: null,
            }
            Promise.resolve(
                ctx.writeExtensionField(writeId, MODULE_NAME, payload),
            )
                .then(() => {
                    logPerCharacter('writeExtensionField reset', {
                        character: getCharacterIdentity(canonical || character),
                        characterId: writeId,
                    })
                })
                .catch((error) => {
                    console.warn(
                        '[Image-Generation-Autopilot][PerCharacter] writeExtensionField reset failed',
                        error,
                    )
                })
        } else {
            console.warn(
                '[Image-Generation-Autopilot][PerCharacter] writeExtensionField reset skipped (no characterId)',
                {
                    characterId: record.characterId,
                    source: record.source,
                },
            )
        }
    }

    applyPerCharacterOverrides()

    const characterName = getCharacterIdentity(canonical || character)
    console.info(
        `[Image-Generation-Autopilot][PerCharacter] Reset complete for ${characterName}`,
    )
    if (
        typeof window.toastr === 'object' &&
        typeof window.toastr.success === 'function'
    ) {
        const displayName = characterName.replace(/\.png$/, '')
        window.toastr.success(
            `Character settings reset to global defaults for ${displayName}`,
            'Settings Reset',
        )
    }
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

function getActiveSdModelLabel() {
    const select = document.getElementById('sd_model')
    if (!(select instanceof HTMLSelectElement)) {
        return 'active SD model'
    }

    const value = select.value || ''
    const selectedOption = select.options[select.selectedIndex]
    const label = selectedOption?.textContent?.trim()
    return label || value || 'active SD model'
}

function getModelLabel(value) {
    if (!value) {
        return 'active SD model'
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
    const target = event?.target
    if (target instanceof HTMLInputElement) {
        if (target.id === 'auto_multi_model_queue_enabled') {
            const current = getSettings()
            current.modelQueueEnabled = normalizeModelQueueEnabled(
                target.checked,
                defaultSettings.modelQueueEnabled,
            )
            saveSettings()
            applyQueueEnabledState(current.modelQueueEnabled)
        }
        if (target.id === 'auto_multi_character_enabled') {
            const current = getSettings()
            current.perCharacter.enabled = target.checked
            if (target.checked) {
                ensurePerCharacterDefaults(current, true)
            }
            console.info(
                '[Image-Generation-Autopilot][PerCharacter] toggle (doc)',
                {
                    enabled: target.checked,
                },
            )
            saveSettings()
            applyPerCharacterOverrides()
        }
        return
    }

    if (!(target instanceof HTMLSelectElement)) {
        return
    }

    if (target.id === 'sd_model') {
        syncModelSelectOptions()
    }
}

function shouldShowPromptRewriteButton(message) {
    const settings = getSettings()
    const autoSettings = settings.autoGeneration
    if (!settings.enabled || !autoSettings?.enabled) {
        return false
    }

    if (autoSettings.insertType === INSERT_TYPE.DISABLED) {
        return false
    }

    const text = message?.mes || ''
    const regex = parseRegexFromString(autoSettings.promptInjection.regex)
    const hasPicPrompts =
        !!regex && !!text ? getPicPromptMatches(text, regex).length > 0 : false
    const hasImages = hasGeneratedMedia(message)

    return hasPicPrompts || hasImages
}

function syncUiFromSettings() {
    if (!state.ui) return
    const settings = getSettings()
    patchToastrForDebug()
    state.ui.enabledInput.checked = settings.enabled
    state.ui.countInput.value = String(settings.targetCount)
    state.ui.delayInput.value = String(settings.delayMs)

    if (state.ui.autoGenEnabledInput) {
        state.ui.autoGenEnabledInput.checked = settings.autoGeneration.enabled
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
            clampPromptLimit(
                settings.autoGeneration.promptInjection.lengthLimit,
            ),
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
    if (state.ui.promptRewriteEnabledInput) {
        state.ui.promptRewriteEnabledInput.checked =
            settings.autoGeneration.promptRewrite.enabled
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
    if (state.ui.debugModeInput) {
        state.ui.debugModeInput.checked = settings.debugMode
    }
    if (state.ui.characterEnabledInput) {
        state.ui.characterEnabledInput.checked =
            settings.perCharacter?.enabled || false
    }
    const canResetCharacter = settings.enabled && settings.perCharacter?.enabled
    if (state.ui.characterResetButton) {
        state.ui.characterResetButton.disabled = !canResetCharacter
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
            if (
                control instanceof HTMLInputElement ||
                control instanceof HTMLSelectElement ||
                control instanceof HTMLTextAreaElement ||
                control instanceof HTMLButtonElement
            ) {
                control.disabled = !enabled || control.hasAttribute('disabled')
            }
        })
    }

    setPanelEnabled(state.ui.summaryPanel, settings.enabled)
    setPanelEnabled(state.ui.queuePanel, settings.enabled)
    setPanelEnabled(state.ui.cadencePanel, settings.enabled)
    setPanelEnabled(state.ui.autoGenPanel, settings.autoGeneration.enabled)
    setPanelEnabled(state.ui.characterPanel, settings.enabled)
    const queueEnabled = normalizeModelQueueEnabled(
        settings.modelQueueEnabled,
        defaultSettings.modelQueueEnabled,
    )
    if (state.ui.modelQueueEnabledInput) {
        state.ui.modelQueueEnabledInput.checked = queueEnabled
    }
    const configuredQueue = sanitizeModelQueue(
        settings.modelQueue,
        clampCount(settings.targetCount),
    )
    settings.modelQueue = configuredQueue
    renderModelQueueRows(configuredQueue)
    syncModelSelectOptions()
    if (settings.enabled) {
        applyQueueEnabledState(queueEnabled)
    }

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
        segments.push(`auto image gen (${insertLabel}, ${injectionLabel})`)
    }

    const baseStrategyBlurb = settings.delayMs <= 0
          ? 'Swipes run sequentially without pacing between requests.'
          : 'Swipes run sequentially with pacing between requests.'
    const queueBlurb = !queueEnabled
        ? 'Model queue disabled; using default swipes per model.'
        : ''
    const strategyBlurb = [baseStrategyBlurb, queueBlurb]
        .filter(Boolean)
        .join(' ')
    const delayBlurb =
        settings.delayMs <= 0
            ? 'with no delay between swipes.'
            : `with ${settings.delayMs} ms between swipes.`
    state.ui.summary.textContent = `Will queue ${segments.join(', ')} ${delayBlurb} ${strategyBlurb}`
}

function ensureGlobalProgressElement(messageId) {
    const chatRoot = document.getElementById('chat')
    const messageNodes = chatRoot?.querySelectorAll('.mes[mesid]') || []
    const lastMessage = messageNodes.length
        ? messageNodes[messageNodes.length - 1]
        : null
    const ctxHost = document.getElementById('sheld') || document.body
    let container = document.getElementById('auto-multi-global-progress')

    const headerAnchor = document.querySelector(
        '#top-bar, #topbar, #top-menu, header, .topbar, .top-bar, .navbar, .nav-bar, .header',
    )

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
        if (lastMessage?.parentElement) {
            lastMessage.after(container)
        } else if (chatRoot) {
            chatRoot.appendChild(container)
        } else {
            ctxHost.appendChild(container)
        }

        const stopButton = container.querySelector(
            '.auto-multi-global-progress__stop',
        )
        stopButton?.addEventListener('click', () => {
            state.chatToken += 1
            state.abortInProgress = true
            log('Auto swipe queue aborted manually.')
            clearProgress()
        })
    }

    if (headerAnchor && headerAnchor.parentElement) {
        const headerHeight = Math.ceil(
            headerAnchor.getBoundingClientRect().height || 0,
        )
        container.style.setProperty(
            '--auto-multi-global-progress-top',
            `${headerHeight + 8}px`,
        )
        if (headerAnchor.nextElementSibling !== container) {
            headerAnchor.after(container)
        }
    } else if (
        lastMessage?.parentElement &&
        container.previousElementSibling !== lastMessage
    ) {
        container.style.removeProperty('--auto-multi-global-progress-top')
        lastMessage.after(container)
    } else if (
        !lastMessage &&
        chatRoot &&
        container.parentElement !== chatRoot
    ) {
        container.style.removeProperty('--auto-multi-global-progress-top')
        chatRoot.appendChild(container)
    } else if (
        !lastMessage &&
        !chatRoot &&
        container.parentElement !== ctxHost
    ) {
        container.style.removeProperty('--auto-multi-global-progress-top')
        ctxHost.appendChild(container)
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
    if (state.abortInProgress) {
        return
    }
    const entry = ensureGlobalProgressElement(messageId)
    const safeTarget = Math.max(1, target)
    const clampedCurrent = Math.max(0, Math.min(current, safeTarget))
    const displayCurrent = Math.min(clampedCurrent + 1, safeTarget)
    const descriptor =
        labelText ||
        (waiting ? 'Preparing swipe queue…' : 'Image Generation Autopilot')

    entry.container.classList.toggle('waiting', !!waiting)
    entry.statusLabel.textContent = descriptor
    entry.ratioLabel.textContent = `${displayCurrent} / ${safeTarget}`
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
        const module =
            await import('../../../slash-commands/SlashCommandParser.js')
        if (module?.SlashCommandParser?.commands) {
            return module.SlashCommandParser
        }
    } catch (error) {
        console.warn(
            '[Image-Generation-Autopilot] Failed to import SlashCommandParser',
            error,
        )
    }

    return null
}

async function callSdSlash(prompt, quiet) {
    const parser = await resolveSlashCommandParser()
    const command = parser?.commands?.sd
    if (!command?.callback) {
        console.warn(
            '[Image-Generation-Autopilot] SlashCommandParser sd not available',
        )
        return null
    }

    try {
        return await command.callback(
            { quiet: quiet ? 'true' : 'false' },
            prompt,
        )
    } catch (error) {
        console.error(
            '[Image-Generation-Autopilot] Slash command sd failed',
            error,
        )
        return null
    }
}

async function callSdSlashWithModel(prompt, modelId, quiet = true) {
    const restoreModel = await applyModelOverride(modelId)
    try {
        return await callSdSlash(prompt, quiet)
    } finally {
        if (typeof restoreModel === 'function') {
            restoreModel()
        }
    }
}

async function openImageSelectionDialog(prompts, sourceMessageId) {
    const components = await initComponents()
    const settings = getSettings()
    const modelQueue = getSwipePlan(settings)

    const generatorFactory = (options) => {
        const generator = new components.ParallelGenerator({
            concurrencyLimit: settings.concurrency || 4,
            callSdSlash: async (prompt, opts) => {
                const modelId = opts?.modelId
                return callSdSlashWithModel(prompt, modelId, true)
            },
        })
        return generator
    }

    const dialog = new components.ImageSelectionDialog(generatorFactory)
    
    const generatorOptions = {
        modelQueue: modelQueue,
    }

    try {
        const result = await dialog.show(prompts, generatorOptions)
        return {
            selected: result.selected || [],
            destination: result.destination || 'new',
            sourceMessageId,
        }
    } catch (error) {
        if (error?.message === 'Cancelled' || error?.message === 'Closed') {
            log('Image selection dialog cancelled')
            return null
        }
        throw error
    }
}

async function handleDialogResult(dialogResult, triggerMessage) {
    if (!dialogResult || !dialogResult.selected?.length) {
        log('No images selected, skipping insertion')
        return
    }

    const context = getCtx()
    const settings = getSettings()
    const insertType = settings.autoGeneration?.insertType || INSERT_TYPE.NEW_MESSAGE

    if (dialogResult.destination === 'current' && triggerMessage) {
        for (const imageUrl of dialogResult.selected) {
            appendGeneratedMedia(triggerMessage, imageUrl, '', true)
        }
        
        const messageId = dialogResult.sourceMessageId
        let messageElement = document.querySelector(`.mes[mesid="${messageId}"]`)
        if (!messageElement) {
            messageElement = await waitForMessageElement(messageId, 2000)
        }
        
        if (messageElement && typeof window.appendMediaToMessage === 'function') {
            sanitizeMessageMediaState(triggerMessage)
            window.appendMediaToMessage(triggerMessage, messageElement)
        } else if (typeof window.updateMessageBlock === 'function') {
            sanitizeMessageMediaState(triggerMessage)
            window.updateMessageBlock(messageId, triggerMessage)
        }
        
        if (typeof context.saveChat === 'function') {
            await context.saveChat()
        }
        
        log('Images inserted to current message', {
            messageId,
            imageCount: dialogResult.selected.length,
        })
    } else {
        for (const imageUrl of dialogResult.selected) {
            const newMessageId = await createPlaceholderImageMessage('')
            if (Number.isFinite(newMessageId)) {
                const newMessage = context.chat?.[newMessageId]
                if (newMessage) {
                    appendGeneratedMedia(newMessage, imageUrl, '', true)
                    
                    let messageElement = document.querySelector(
                        `.mes[mesid="${newMessageId}"]`,
                    )
                    if (!messageElement) {
                        messageElement = await waitForMessageElement(newMessageId, 2000)
                    }
                    
                    if (messageElement && typeof window.appendMediaToMessage === 'function') {
                        sanitizeMessageMediaState(newMessage)
                        window.appendMediaToMessage(newMessage, messageElement)
                    }
                }
            }
        }
        
        if (typeof context.saveChat === 'function') {
            await context.saveChat()
        }
        
        log('Images inserted as new messages', {
            imageCount: dialogResult.selected.length,
        })
    }
}

function normalizeRewriteResponse(result) {
    if (!result) {
        return ''
    }

    if (typeof result === 'string') {
        return result.trim()
    }

    const candidates = [
        result.text,
        result.content,
        result.reply,
        result.message?.content,
        result.output,
    ]

    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) {
            return candidate.trim()
        }
    }

    try {
        return JSON.stringify(result).trim()
    } catch (error) {
        return ''
    }
}

function buildPromptRewriteSystem(injection) {
    const chunks = [
        'You are a prompt rewriter for Stable Diffusion prompts.',
        'Rewrite the prompt to be concise, focused, and high quality.',
        'Preserve the subject and key details from the original prompt.',
        'Return only the rewritten prompt with no extra text or quotes.',
    ]

    if (injection?.mainPrompt?.trim()) {
        chunks.push(`Global guidance: ${injection.mainPrompt.trim()}`)
    }

    if (injection?.instructionsPositive?.trim()) {
        chunks.push(
            `Positive constraints: ${injection.instructionsPositive.trim()}`,
        )
    }

    if (injection?.instructionsNegative?.trim()) {
        chunks.push(
            `Negative constraints: ${injection.instructionsNegative.trim()}`,
        )
    }

    if (injection?.examplePrompt?.trim()) {
        chunks.push(`Example style: ${injection.examplePrompt.trim()}`)
    }

    const limitValue = clampPromptLimit(injection?.lengthLimit)
    if (limitValue > 0 && injection?.lengthLimitType !== 'none') {
        const limitLabel =
            injection.lengthLimitType === 'words' ? 'words' : 'characters'
        chunks.push(`Keep the prompt within ${limitValue} ${limitLabel}.`)
    }

    return chunks.join('\n')
}

function buildPromptRewriteUser(originalPrompt) {
    return `Rewrite this prompt:\n${originalPrompt}`
}

async function callChatRewrite(originalPrompt, injection) {
    const systemPrompt = buildPromptRewriteSystem(injection)
    const userPrompt = buildPromptRewriteUser(originalPrompt)
    const ctx = getCtx()
    const startLength = ctx.chat?.length || 0

    const attempts = [
        async () => {
            if (typeof ctx.generateText === 'function') {
                return ctx.generateText(`${systemPrompt}\n\n${userPrompt}`)
            }
            return null
        },
        async () => {
            if (typeof ctx.generateRaw === 'function') {
                return ctx.generateRaw([
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ])
            }
            return null
        },
        async () => {
            if (typeof ctx.generate === 'function') {
                return ctx.generate({
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt },
                    ],
                    quiet: true,
                })
            }
            return null
        },
    ]

    for (const attempt of attempts) {
        try {
            const result = await attempt()
            const rewritten = normalizeRewriteResponse(result)
            if (rewritten) {
                await cleanupRewriteMessages(startLength)
                return rewritten
            }
        } catch (error) {
            console.warn(
                '[Image-Generation-Autopilot] Prompt rewrite attempt failed',
                error,
            )
        } finally {
            await cleanupRewriteMessages(startLength)
        }
    }

    return ''
}

async function handleIncomingMessage(messageId) {
    const settings = getSettings()
    const autoSettings = settings.autoGeneration
    if (!autoSettings?.enabled) {
        return
    }

    const token = state.chatToken

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

    const matches = getPicPromptMatches(message.mes, regex)
    if (!matches.length) {
        return
    }

    const prompts = matches
        .map((m) => (typeof m?.[1] === 'string' ? m[1] : ''))
        .filter((p) => p.trim())

    if (!prompts.length) {
        return
    }

    state.autoGenMessages.add(resolvedId)

    try {
        const result = await openImageSelectionDialog(prompts, resolvedId)
        await handleDialogResult(result, message)
    } catch (error) {
        console.warn('[Image-Generation-Autopilot] Auto-generation failed', error)
    }
}

    const token = state.chatToken

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

    const matches = getPicPromptMatches(message.mes, regex)

    if (!matches.length) {
        return
    }

    const totalImages = matches.length
    let completedImages = 0
    let failedImages = 0
    const swipesPerImage = getSwipeTotal(settings)
    const modelLabel = getActiveSdModelLabel()
    const modelSuffix = modelLabel ? ` • ${modelLabel}` : ''
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
            `${formatUnifiedImageLabel(1)}${modelSuffix}`,
        )
    } else {
        updateProgressUi(
            resolvedId,
            0,
            totalImages,
            true,
            `Starting SD image generation (1/${totalImages})${modelSuffix}`,
        )
    }

    state.autoGenMessages.add(resolvedId)
    setTimeout(async () => {
        for (let index = 0; index < matches.length; index += 1) {
            if (token !== state.chatToken) {
                break
            }
            const match = matches[index]
            const prompt = typeof match?.[1] === 'string' ? match[1] : ''
            if (!prompt.trim()) {
                continue
            }

            const rewriteEnabled =
                !!autoSettings?.promptRewrite?.enabled &&
                !!autoSettings?.promptInjection

            if (
                !updateUnifiedProgress(
                    resolvedId,
                    true,
                    `${formatUnifiedImageLabel(index + 1)}${modelSuffix}`,
                )
            ) {
                updateProgressUi(
                    resolvedId,
                    completedImages,
                    Math.max(1, totalImages - failedImages),
                    true,
                    `Generating image ${index + 1}/${totalImages}${modelSuffix}`,
                )
            }

            if (autoSettings.insertType === INSERT_TYPE.NEW_MESSAGE) {
                if (token !== state.chatToken) {
                    break
                }
                let result = await callSdSlash(prompt, false)
                let finalPrompt = prompt

                if (!result && rewriteEnabled) {
                    const rewriteLabel = `Rewriting prompt ${index + 1}/${totalImages}`
                    if (
                        !updateUnifiedProgress(
                            resolvedId,
                            true,
                            `${rewriteLabel}${modelSuffix}`,
                        )
                    ) {
                        updateProgressUi(
                            resolvedId,
                            completedImages,
                            Math.max(1, totalImages - failedImages),
                            true,
                            `${rewriteLabel}${modelSuffix}`,
                        )
                    }

                    const rewritten = await callChatRewrite(
                        prompt,
                        autoSettings.promptInjection,
                    )
                    if (rewritten) {
                        finalPrompt = normalizeRewrittenPrompt(
                            prompt,
                            rewritten,
                            regex,
                        )
                        if (token !== state.chatToken) {
                            break
                        }
                        result = await callSdSlash(finalPrompt, false)
                    }
                }

                if (!result) {
                    let placeholderMessageId = null
                    if (autoSettings.insertType === INSERT_TYPE.NEW_MESSAGE) {
                        placeholderMessageId =
                            await createPlaceholderImageMessage(finalPrompt)
                        if (Number.isFinite(placeholderMessageId)) {
                            const button = await waitForPaintbrush(
                                placeholderMessageId,
                                3000,
                            )
                            if (button) {
                                queueAutoFill(placeholderMessageId, button)
                            } else {
                                log('Placeholder created without paintbrush', {
                                    placeholderMessageId,
                                })
                            }

                            completedImages += 1
                            state.unifiedProgress.completedImages =
                                completedImages
                            if (
                                !updateUnifiedProgress(
                                    resolvedId,
                                    false,
                                    `${formatUnifiedSwipeLabel(index + 1, 'Queued swipes')}${modelSuffix}`,
                                )
                            ) {
                                updateProgressUi(
                                    resolvedId,
                                    completedImages,
                                    Math.max(1, totalImages - failedImages),
                                    false,
                                    `Queued swipes for failed image ${index + 1}/${totalImages}${modelSuffix}`,
                                )
                            }

                            continue
                        }
                    }

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
                    if (
                        !updateUnifiedProgress(
                            resolvedId,
                            false,
                            `${formatUnifiedSwipeLabel(index + 1, 'Failed image')}${modelSuffix}`,
                        )
                    ) {
                        updateProgressUi(
                            resolvedId,
                            completedImages,
                            Math.max(1, totalImages - failedImages),
                            false,
                            `Failed image ${index + 1}/${totalImages}${modelSuffix}`,
                        )
                    }
                } else {
                    completedImages += 1
                    state.unifiedProgress.completedImages = completedImages
                    log('Image generation completed', {
                        messageId: resolvedId,
                        imageIndex: index + 1,
                        totalImages,
                        completedImages,
                        failedImages,
                        prompt: finalPrompt,
                        insertType: autoSettings.insertType,
                    })
                    if (
                        !updateUnifiedProgress(
                            resolvedId,
                            false,
                            `${formatUnifiedSwipeLabel(index + 1, 'Completed image')}${modelSuffix}`,
                        )
                    ) {
                        updateProgressUi(
                            resolvedId,
                            completedImages,
                            Math.max(1, totalImages - failedImages),
                            false,
                            `Completed image ${index + 1}/${totalImages}${modelSuffix}`,
                        )
                    }
                }
                continue
            }

            let imageUrl = await callSdSlash(prompt, true)
            let finalPrompt = prompt
            if ((!imageUrl || typeof imageUrl !== 'string') && rewriteEnabled) {
                const rewriteLabel = `Rewriting prompt ${index + 1}/${totalImages}`
                if (
                    !updateUnifiedProgress(
                        promptMessageId,
                        true,
                        `${rewriteLabel}${modelSuffix}`,
                    )
                ) {
                    updateProgressUi(
                        promptMessageId,
                        completedImages,
                        Math.max(1, totalImages - failedImages),
                        true,
                        `${rewriteLabel}${modelSuffix}`,
                    )
                }

                const rewritten = await callChatRewrite(
                    prompt,
                    autoSettings.promptInjection,
                )
                if (rewritten) {
                    finalPrompt = normalizeRewrittenPrompt(
                        prompt,
                        rewritten,
                        regex,
                    )
                    if (token !== state.chatToken) {
                        break
                    }
                    imageUrl = await callSdSlash(finalPrompt, true)
                }
            }
            if (!imageUrl || typeof imageUrl !== 'string') {
                failedImages += 1
                state.unifiedProgress.failedImages = failedImages
                if (
                    state.unifiedProgress.active &&
                    state.unifiedProgress.insertType === INSERT_TYPE.NEW_MESSAGE
                ) {
                    state.unifiedProgress.expectedSwipes = Math.max(
                        0,
                        state.unifiedProgress.expectedSwipes -
                            state.unifiedProgress.swipesPerImage,
                    )
                }
                if (
                    !updateUnifiedProgress(
                        resolvedId,
                        false,
                        `${formatUnifiedSwipeLabel(index + 1, 'Failed image')}${modelSuffix}`,
                    )
                ) {
                    updateProgressUi(
                        resolvedId,
                        completedImages,
                        Math.max(1, totalImages - failedImages),
                        false,
                        `Failed image ${index + 1}/${totalImages}${modelSuffix}`,
                    )
                }
                continue
            }

            if (!message.extra) {
                message.extra = {}
            }

            if (autoSettings.insertType === INSERT_TYPE.INLINE) {
                appendGeneratedMedia(message, imageUrl, finalPrompt, true)
            }

            if (autoSettings.insertType === INSERT_TYPE.REPLACE) {
                const originalTag =
                    typeof match?.[0] === 'string' ? match[0] : ''
                if (originalTag) {
                    const escapedUrl = escapeHtmlAttribute(imageUrl)
                    const escapedPrompt = escapeHtmlAttribute(finalPrompt)
                    const newTag = `<img src="${escapedUrl}" title="${escapedPrompt}" alt="${escapedPrompt}">`
                    message.mes = message.mes.replace(originalTag, newTag)
                }
                appendGeneratedMedia(message, imageUrl, finalPrompt, true)
            }

            if (typeof window.appendMediaToMessage === 'function') {
                let messageElement = document.querySelector(
                    `.mes[mesid="${resolvedId}"]`,
                )
                if (!messageElement) {
                    messageElement = await waitForMessageElement(
                        resolvedId,
                        2000,
                    )
                }
                sanitizeMessageMediaState(message)
                log('Append media to message', {
                    messageId: resolvedId,
                    state: getMessageSwipeState(resolvedId),
                })
                window.appendMediaToMessage(message, messageElement)
            } else if (typeof window.updateMessageBlock === 'function') {
                sanitizeMessageMediaState(message)
                log('Update message block', {
                    messageId: resolvedId,
                    state: getMessageSwipeState(resolvedId),
                })
                window.updateMessageBlock(resolvedId, message)
            }

            context.eventSource?.emit(
                context.eventTypes.MESSAGE_UPDATED,
                resolvedId,
            )
            await context.saveChat?.()
            completedImages += 1
            state.unifiedProgress.completedImages = completedImages
            log('Image generation completed', {
                messageId: resolvedId,
                imageIndex: index + 1,
                totalImages,
                completedImages,
                failedImages,
                prompt: finalPrompt,
                imageUrl,
                insertType: autoSettings.insertType,
            })
            if (
                !updateUnifiedProgress(
                    resolvedId,
                    false,
                    `${formatUnifiedSwipeLabel(index + 1, 'Completed image')}${modelSuffix}`,
                )
            ) {
                updateProgressUi(
                    resolvedId,
                    completedImages,
                    Math.max(1, totalImages - failedImages),
                    false,
                    `Completed image ${index + 1}/${totalImages}${modelSuffix}`,
                )
            }
        }

        setTimeout(() => {
            if (
                !state.unifiedProgress.active ||
                state.unifiedProgress.expectedSwipes === 0
            ) {
                clearProgress(resolvedId)
            }
            finalizeUnifiedProgress()
        }, 1200)
    }, 0)
}

async function handleManualPromptRewrite(messageId) {
    const settings = getSettings()
    const autoSettings = settings.autoGeneration
    log('Rewrite button invoked', { messageId })
    if (!autoSettings?.enabled) {
        log('Rewrite ignored (auto generation disabled)')
        return
    }

    const token = state.chatToken

    if (autoSettings.insertType === INSERT_TYPE.DISABLED) {
        log('Rewrite ignored (insert mode disabled)')
        return
    }

    const context = getCtx()
    let chat = context.chat || []
    let resolvedId = typeof messageId === 'number' ? messageId : chat.length - 1
    const message = chat?.[resolvedId]
    if (!message || message.is_user || !message.mes) {
        log('Rewrite ignored (invalid message)', { resolvedId })
        return
    }

    const lastImageMessageId = findLastGeneratedImageMessageId()
    if (Number.isFinite(lastImageMessageId)) {
        log('Deleting last generated image message', { lastImageMessageId })
        const deleted = await deleteMessageById(lastImageMessageId)
        log('Delete result', { lastImageMessageId, deleted })
        if (!deleted) {
            log('Rewrite aborted (image message not deleted)', {
                lastImageMessageId,
            })
            return
        }

        const deleteDeadline = performance.now() + 2000
        while (performance.now() < deleteDeadline) {
            const chatStillHas = !!getCtx().chat?.[lastImageMessageId]
            const domStillHas = !!document.querySelector(
                `.mes[mesid="${lastImageMessageId}"]`,
            )
            if (!chatStillHas && !domStillHas) {
                break
            }
            await sleep(100)
        }

        log('Hammer action complete (images message deleted)', {
            lastImageMessageId,
        })
        return
    }

    log('Hammer action ignored (no generated image message found)')
    return
}

function shouldAutoFill(message) {
    if (!message || message.is_user) {
        return false
    }

    if (!hasGeneratedMedia(message)) {
        return false
    }

    const mode = (message.extra?.media_display || '').toLowerCase()
    const allowedModes = ['gallery', 'grid', 'carousel', 'stack']
    const isGallery =
        !mode || allowedModes.some((token) => mode.includes(token))
    return isGallery
}

function hasGeneratedMedia(message) {
    const mediaList = message?.extra?.media
    if (!Array.isArray(mediaList) || mediaList.length === 0) {
        return false
    }

    return mediaList.some((item) => item?.source === 'generated')
}

function ensureMessageMediaList(message) {
    if (!message) {
        return []
    }

    const ctx = getCtx()
    if (typeof ctx.ensureMessageMediaIsArray === 'function') {
        ctx.ensureMessageMediaIsArray(message)
    }

    if (!message.extra) {
        message.extra = {}
    }

    if (!Array.isArray(message.extra.media)) {
        message.extra.media = []
    }

    return message.extra.media
}

function appendGeneratedMedia(message, url, prompt, inline = true) {
    if (!message || !url) {
        return
    }

    const mediaList = ensureMessageMediaList(message)
    const mediaAttachment = {
        url,
        type: 'image',
        title: prompt,
        source: 'generated',
    }

    mediaList.push(mediaAttachment)
    message.extra.media_index = Number.isFinite(mediaList.length - 1)
        ? mediaList.length - 1
        : 0
    if (typeof message.extra.media_display !== 'string') {
        message.extra.media_display = 'gallery'
    }
    message.extra.inline_image = inline ? true : !!message.extra.inline_image
    message.extra.title = prompt
}

function sanitizeMessageMediaState(message) {
    if (!message?.extra) {
        return
    }

    if (!Array.isArray(message.extra.media)) {
        message.extra.media = []
    }

    const count = message.extra.media.length
    const rawIndex = Number(message.extra.media_index)
    if (!Number.isFinite(rawIndex) || rawIndex < 0 || rawIndex >= count) {
        message.extra.media_index = count > 0 ? 0 : 0
    } else {
        message.extra.media_index = rawIndex
    }

    if (typeof message.extra.media_display !== 'string') {
        message.extra.media_display = 'gallery'
    }
}

function getMessageSwipeState(messageId) {
    const ctx = getCtx()
    const message = ctx.chat?.[messageId]
    return {
        messageId,
        hasMessage: !!message,
        swipeId: message?.swipe_id,
        swipesCount: Array.isArray(message?.swipes)
            ? message.swipes.length
            : null,
        mediaIndex: message?.extra?.media_index,
        mediaCount: Array.isArray(message?.extra?.media)
            ? message.extra.media.length
            : null,
        mediaDisplay: message?.extra?.media_display,
        inlineImage: message?.extra?.inline_image,
    }
}

async function createPlaceholderImageMessage(prompt) {
    const ctx = getCtx()
    const name = ctx.groupId
        ? ctx.systemUserName || ctx.name2 || 'System'
        : ctx.name2 || 'Assistant'

    const message = {
        name,
        is_user: false,
        is_system: false,
        send_date: Date.now(),
        mes: prompt || '',
        extra: {
            media: [],
            media_display: 'gallery',
            media_index: 0,
            inline_image: false,
            title: prompt || '',
        },
    }

    if (!Array.isArray(ctx.chat)) {
        return null
    }

    ctx.chat.push(message)
    const messageId = ctx.chat.length - 1
    log('Placeholder message created', {
        prompt: prompt?.slice?.(0, 200) || '',
        state: getMessageSwipeState(messageId),
    })
    ctx.eventSource?.emit(
        ctx.eventTypes.MESSAGE_RECEIVED,
        messageId,
        'extension',
    )
    ctx.addOneMessage?.(message)
    ctx.eventSource?.emit(
        ctx.eventTypes.CHARACTER_MESSAGE_RENDERED,
        messageId,
        'extension',
    )
    await ctx.saveChat?.()
    return messageId
}

function findLastGeneratedImageMessageId() {
    const chat = getCtx().chat || []
    for (let index = chat.length - 1; index >= 0; index -= 1) {
        if (hasGeneratedMedia(chat[index])) {
            return index
        }
    }
    return null
}

async function deleteMediaUrlsFromServer(urls) {
    if (!Array.isArray(urls) || urls.length === 0) {
        return false
    }

    const ctx = getCtx()
    let deletedAny = false
    const uniqueUrls = [
        ...new Set(urls.filter((url) => typeof url === 'string' && url.trim())),
    ]

    for (const url of uniqueUrls) {
        try {
            if (typeof ctx.deleteMediaFromServer === 'function') {
                deletedAny =
                    (await ctx.deleteMediaFromServer(url, true)) || deletedAny
                continue
            }

            if (typeof window.deleteMediaFromServer === 'function') {
                deletedAny =
                    (await window.deleteMediaFromServer(url, true)) ||
                    deletedAny
                continue
            }

            const headers = (typeof ctx.getRequestHeaders === 'function'
                ? ctx.getRequestHeaders()
                : typeof window.getRequestHeaders === 'function'
                  ? window.getRequestHeaders()
                  : { 'Content-Type': 'application/json' }) || {
                'Content-Type': 'application/json',
            }

            const response = await fetch('/api/images/delete', {
                method: 'POST',
                headers,
                body: JSON.stringify({ path: url }),
            })

            if (response.ok) {
                deletedAny = true
            } else {
                log('Media delete failed', {
                    url,
                    status: response.status,
                })
            }
        } catch (error) {
            log('Media delete error', { url, error })
        }
    }

    return deletedAny
}

function collectMessageMediaUrls(message) {
    if (!message?.extra) {
        return []
    }

    const urls = []

    if (Array.isArray(message.extra.media)) {
        for (const media of message.extra.media) {
            if (media?.url) {
                urls.push(media.url)
            }
        }
    }

    return urls
}

async function deleteMessageById(messageId, options = {}) {
    if (!Number.isFinite(messageId)) {
        return false
    }

    const ctx = getCtx()
    const message = ctx.chat?.[messageId]
    let handled = false

    const deleteCommands = [
        `/delmsg ${messageId} --delete_attachments`,
        `/delmsg ${messageId} --delete_attachments true`,
        `/delmsg ${messageId} --delete_attachments=1`,
        `/delmsg ${messageId} --delete_media`,
        `/delmsg ${messageId} --delete_files`,
        `/delmsg ${messageId} --delete_images`,
        `/delmsg ${messageId} --delete_uploads`,
    ]

    try {
        if (message && hasGeneratedMedia(message)) {
            const mediaUrls = collectMessageMediaUrls(message)
            if (mediaUrls.length) {
                const deletedMedia = await deleteMediaUrlsFromServer(mediaUrls)
                log('Media delete attempted', {
                    messageId,
                    count: mediaUrls.length,
                    deletedMedia,
                })
            }

            if (
                Array.isArray(ctx.chat) &&
                messageId >= 0 &&
                messageId < ctx.chat.length
            ) {
                ctx.chat.splice(messageId, 1)
                ctx.eventSource?.emit(ctx.eventTypes.MESSAGE_DELETED, messageId)
                if (typeof window.deleteMessageBlock === 'function') {
                    window.deleteMessageBlock(messageId)
                } else if (typeof window.updateChat === 'function') {
                    window.updateChat()
                }
                handled = true
                await ctx.saveChat?.()
                if (!options.skipReload) {
                    if (typeof ctx.reloadCurrentChat === 'function') {
                        await ctx.reloadCurrentChat()
                    } else if (typeof window.reloadCurrentChat === 'function') {
                        await window.reloadCurrentChat()
                    }
                }
                return handled
            }
        }

        if (message) {
            const rawSwipeId = Number(message.swipe_id)
            if (!Number.isFinite(rawSwipeId)) {
                delete message.swipe_id
            } else if (
                Array.isArray(message.swipes) &&
                message.swipes.length > 0
            ) {
                message.swipe_id = Math.max(
                    0,
                    Math.min(rawSwipeId, message.swipes.length - 1),
                )
            } else {
                message.swipe_id = Math.max(0, rawSwipeId)
            }
        }

        if (typeof ctx.deleteMessage === 'function') {
            await ctx.deleteMessage(messageId, { deleteAttachments: true })
            handled = true
        } else if (typeof ctx.deleteMessageById === 'function') {
            await ctx.deleteMessageById(messageId, { deleteAttachments: true })
            handled = true
        } else if (typeof window.deleteMessage === 'function') {
            await window.deleteMessage(messageId, { deleteAttachments: true })
            handled = true
        } else if (typeof window.deleteMessageById === 'function') {
            await window.deleteMessageById(messageId, {
                deleteAttachments: true,
            })
            handled = true
        }

        if (
            !handled &&
            typeof ctx.executeSlashCommandsWithOptions === 'function'
        ) {
            for (const commandText of deleteCommands) {
                try {
                    await ctx.executeSlashCommandsWithOptions(commandText)
                    handled = true
                    break
                } catch (error) {
                    log('Delete slash command failed', { commandText, error })
                }
            }
        }

        if (!handled) {
            const parser = await resolveSlashCommandParser()
            const command =
                parser?.commands?.delmsg ||
                parser?.commands?.deletemsg ||
                parser?.commands?.del
            if (command?.callback) {
                await command.callback({}, String(messageId))
                handled = true
            }
        }

        if (!handled && Array.isArray(ctx.chat)) {
            if (messageId >= 0 && messageId < ctx.chat.length) {
                ctx.chat.splice(messageId, 1)
                ctx.eventSource?.emit(ctx.eventTypes.MESSAGE_DELETED, messageId)
                if (typeof window.deleteMessageBlock === 'function') {
                    window.deleteMessageBlock(messageId)
                } else if (typeof window.updateChat === 'function') {
                    window.updateChat()
                }
                handled = true
            }
        }

        if (handled) {
            await ctx.saveChat?.()
        }

        const stillExists = !!ctx.chat?.[messageId]
        if (stillExists) {
            log('Delete did not remove message, applying fallback', {
                messageId,
            })
            if (
                Array.isArray(ctx.chat) &&
                messageId >= 0 &&
                messageId < ctx.chat.length
            ) {
                ctx.chat.splice(messageId, 1)
                ctx.eventSource?.emit(ctx.eventTypes.MESSAGE_DELETED, messageId)
                if (typeof window.deleteMessageBlock === 'function') {
                    window.deleteMessageBlock(messageId)
                } else if (typeof window.updateChat === 'function') {
                    window.updateChat()
                }
                handled = true
                await ctx.saveChat?.()
            }

            if (!options.skipReload) {
                if (typeof ctx.reloadCurrentChat === 'function') {
                    await ctx.reloadCurrentChat()
                } else if (typeof window.reloadCurrentChat === 'function') {
                    await window.reloadCurrentChat()
                }
            }
        }
    } catch (error) {
        console.warn(
            '[Image-Generation-Autopilot] Failed to delete message',
            error,
        )
    }

    return handled
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

async function waitForMessageElement(messageId, timeoutMs = 2000) {
    const selector = `.mes[mesid="${messageId}"]`
    const deadline = performance.now() + timeoutMs
    let element = document.querySelector(selector)

    while (!element && performance.now() < deadline) {
        await sleep(100)
        element = document.querySelector(selector)
    }

    return element
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

function findMessageExtraButtonsBar(messageId) {
    const root = document.querySelector(`.mes[mesid="${messageId}"]`)
    if (!root) {
        return null
    }

    const bar = root.querySelector('.mes_buttons .extraMesButtons')
    return bar
}

function getMediaCount(message) {
    const mediaList = message?.extra?.media
    return Array.isArray(mediaList) ? mediaList.length : 0
}

async function queueAutoFill(messageId, button) {
    if (state.runningMessages.has(messageId)) {
        return
    }

    const context = getCtx()
    const message = context.chat?.[messageId]
    if (!message) {
        return
    }

    const settings = getSettings()
    const autoSettings = settings.autoGeneration

    let prompts = []

    if (autoSettings?.promptInjection?.regex) {
        const regex = parseRegexFromString(autoSettings.promptInjection.regex)
        if (regex) {
            const matches = getPicPromptMatches(message.mes, regex)
            prompts = matches
                .map((m) => (typeof m?.[1] === 'string' ? m[1] : ''))
                .filter((p) => p.trim())
        }
    }

    if (!prompts.length) {
        console.warn(
            '[Image-Generation-Autopilot] No prompts found in message for auto-fill',
        )
        return
    }

    state.runningMessages.set(messageId, true)

    try {
        const result = await openImageSelectionDialog(prompts, messageId)
        await handleDialogResult(result, message)
    } catch (error) {
        console.warn('[Image-Generation-Autopilot] Auto-fill failed', error)
    } finally {
        state.runningMessages.delete(messageId)
    }
}

async function handleMessageRendered(messageId, origin) {
    const settings = getSettings()
    if (!settings.enabled) {
        return
    }

    const message = getCtx().chat?.[messageId]
    const hasMedia = getMediaCount(message) > 0
    ensureReswipeButton(messageId, hasMedia)
    ensureRewriteButton(messageId, shouldShowPromptRewriteButton(message))

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
            '[Image-Generation-Autopilot] No SD control found for message',
            messageId,
        )
        return
    }

    queueAutoFill(messageId, button)
}

// ==================== PRESET MANAGEMENT ====================

const PRESET_STORAGE_KEY = MODULE_NAME + '_presets'

function getPresetStorage() {
    try {
        const ctx = getCtx()
        if (!ctx || !ctx.extensionSettings) {
            console.warn(
                '[Image-Generation-Autopilot] Extension settings not available',
            )
            return {}
        }
        if (!ctx.extensionSettings[PRESET_STORAGE_KEY]) {
            ctx.extensionSettings[PRESET_STORAGE_KEY] = {}
        }
        // Return a deep copy to avoid reference issues
        const presets = JSON.parse(
            JSON.stringify(ctx.extensionSettings[PRESET_STORAGE_KEY]),
        )
        console.log(
            '[Image-Generation-Autopilot] Retrieved presets from extension settings:',
            presets,
        )
        return presets
    } catch (error) {
        console.error(
            '[Image-Generation-Autopilot] Failed to get preset storage:',
            error,
        )
        return {}
    }
}

function savePresetToStorage(presets) {
    try {
        const ctx = getCtx()
        if (!ctx || !ctx.extensionSettings) {
            console.warn(
                '[Image-Generation-Autopilot] Extension settings not available',
            )
            return
        }
        if (!ctx.extensionSettings[PRESET_STORAGE_KEY]) {
            ctx.extensionSettings[PRESET_STORAGE_KEY] = {}
        }
        console.log(
            '[Image-Generation-Autopilot] Saving presets to extension settings:',
            presets,
        )
        // Create a deep copy to avoid reference issues
        const presetsCopy = JSON.parse(JSON.stringify(presets))
        ctx.extensionSettings[PRESET_STORAGE_KEY] = presetsCopy
        ctx.saveSettingsDebounced()
        console.log('[Image-Generation-Autopilot] Presets saved successfully')
    } catch (error) {
        console.error(
            '[Image-Generation-Autopilot] Failed to save preset storage:',
            error,
        )
    }
}

function getAllPresets() {
    return getPresetStorage()
}

function getPreset(id) {
    const presets = getAllPresets()
    return presets[id] || null
}

function savePreset(id, name, settings) {
    const presets = getAllPresets()
    // Exclude 'presets' property from saved preset settings to avoid circular reference
    const { presets: _, ...settingsWithoutPresets } = settings
    presets[id] = {
        id,
        name,
        settings: JSON.parse(JSON.stringify(settingsWithoutPresets)),
        createdAt: new Date().toISOString(),
    }
    savePresetToStorage(presets)
    return presets[id]
}

function deletePreset(id) {
    const presets = getAllPresets()
    delete presets[id]
    savePresetToStorage(presets)
}

function handleRenamePreset(id) {
    const preset = getPreset(id)
    if (!preset) {
        console.warn(
            '[Image-Generation-Autopilot] Preset not found for rename:',
            id,
        )
        return
    }

    const newName = prompt('Enter new name for preset:', preset.name)
    if (!newName || newName.trim() === '') {
        console.info('[Image-Generation-Autopilot] Rename cancelled')
        return
    }

    const trimmedName = newName.trim()
    if (trimmedName === preset.name) {
        console.info('[Image-Generation-Autopilot] Name unchanged')
        return
    }

    const presets = getAllPresets()
    presets[id].name = trimmedName
    savePresetToStorage(presets)
    renderPresets()
    console.info('[Image-Generation-Autopilot] Preset renamed:', {
        id,
        oldName: preset.name,
        newName: trimmedName,
    })
}

function loadPreset(id) {
    const preset = getPreset(id)
    if (!preset) {
        console.warn('[Image-Generation-Autopilot] Preset not found:', id)
        return false
    }

    const currentSettings = getSettings()
    const newSettings = JSON.parse(JSON.stringify(preset.settings))

    // Exclude 'presets' property from loaded preset settings
    const { presets: _, ...newSettingsWithoutPresets } = newSettings

    // Update settings - merge but exclude 'presets' property
    const ctx = getCtx()
    if (ctx?.extensionSettings?.[MODULE_NAME]) {
        const { presets, ...settingsWithoutPresets } = currentSettings
        ctx.extensionSettings[MODULE_NAME] = {
            ...settingsWithoutPresets,
            ...newSettingsWithoutPresets,
        }
    }

    // Save and sync UI
    saveSettings()
    return true
}

function listPresets() {
    const presets = getAllPresets()
    return Object.values(presets).sort((a, b) => {
        // Sort by name, then by creation date
        if (a.name < b.name) return -1
        if (a.name > b.name) return 1
        return new Date(b.createdAt) - new Date(a.createdAt)
    })
}

function getCurrentSettingsSnapshot() {
    return JSON.parse(JSON.stringify(getSettings()))
}

// ==================== END PRESET MANAGEMENT ====================

function injectReswipeButtonTemplate() {
    const target = document.querySelector(
        '#message_template .mes_buttons .extraMesButtons',
    )
    if (!target) {
        console.warn(
            '[Image-Generation-Autopilot] Message toolbar template not found',
        )
        return
    }

    if (!target.querySelector('.auto-multi-reswipe')) {
        const button = document.createElement('div')
        button.className =
            'mes_button auto-multi-reswipe fa-solid fa-angles-right interactable'
        button.title = 'run image auto-swipe'
        button.setAttribute('tabindex', '0')
        button.style.display = 'none'
        target.prepend(button)
    }

    if (!target.querySelector('.auto-multi-rewrite')) {
        const button = document.createElement('div')
        button.className =
            'mes_button auto-multi-rewrite fa-solid fa-hammer interactable'
        button.title = 'rewrite <pic> prompts and regenerate images'
        button.setAttribute('tabindex', '0')
        button.style.display = 'none'
        target.prepend(button)
    }
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

    const bar = findMessageExtraButtonsBar(messageId)
    if (!bar) {
        return
    }

    const button = document.createElement('div')
    button.className =
        'mes_button auto-multi-reswipe fa-solid fa-angles-right interactable'
    button.title = 'run image auto-swipe'
    button.setAttribute('tabindex', '0')
    bar.prepend(button)
}

function ensureRewriteButton(messageId, shouldShow = true) {
    const root = document.querySelector(`.mes[mesid="${messageId}"]`)
    if (!root) {
        return
    }

    const existing = root.querySelector('.auto-multi-rewrite')
    if (existing) {
        existing.style.display = shouldShow ? '' : 'none'
        return
    }

    if (!shouldShow) {
        return
    }

    const bar = findMessageExtraButtonsBar(messageId)
    if (!bar) {
        return
    }

    const button = document.createElement('div')
    button.className =
        'mes_button auto-multi-rewrite fa-solid fa-hammer interactable'
    button.title = 'rewrite <pic> prompts and regenerate images'
    button.setAttribute('tabindex', '0')
    bar.prepend(button)
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

        const shouldShowRewrite = shouldShowPromptRewriteButton(message)
        ensureRewriteButton(messageId, shouldShowRewrite)
    })
}

async function init() {
    if (state.initialized) {
        return
    }

    try {
        await initComponents()

        state.managers = {
            state: new state.components.StateManager(),
            detector: new state.components.GenerationDetector(),
        }

        ensureSettings()
        console.info('[Image-Generation-Autopilot] init', {
            perCharacterEnabled: getSettings()?.perCharacter?.enabled,
        })
        patchToastrForDebug()
        await buildSettingsPanel()
        applyPerCharacterOverrides()
        injectReswipeButtonTemplate()
        refreshReswipeButtons()

        const chat = document.getElementById('chat')
        chat?.addEventListener('click', async (event) => {
            const reswipeTarget = event.target.closest('.auto-multi-reswipe')
            const rewriteTarget = event.target.closest('.auto-multi-rewrite')

            if (!reswipeTarget && !rewriteTarget) {
                return
            }

            event.preventDefault()
            event.stopPropagation()

            const target = reswipeTarget || rewriteTarget
            const messageElement = target.closest('.mes')
            const messageId = Number(messageElement?.getAttribute('mesid'))
            if (!Number.isFinite(messageId)) {
                return
            }

            const settings = getSettings()
            if (!settings.enabled) {
                return
            }

            if (rewriteTarget) {
                await handleManualPromptRewrite(messageId)
                return
            }

            const message = getCtx().chat?.[messageId]
            if (!shouldAutoFill(message)) {
                return
            }

            const paintbrush = await waitForPaintbrush(messageId)
            if (!paintbrush) {
                console.warn(
                    '[Image-Generation-Autopilot] No SD control found for message',
                    messageId,
                )
                return
            }

            queueAutoFill(messageId, paintbrush)
        })

        const { eventSource, eventTypes } = getCtx()
        eventSource.on(
            eventTypes.CHARACTER_MESSAGE_RENDERED,
            handleMessageRendered,
        )
        eventSource.on(eventTypes.CHAT_CHANGED, resetPerChatState)
        eventSource.on(eventTypes.CHAT_CHANGED, applyPerCharacterOverrides)
        const characterEvents = [
            'CHARACTER_SELECTED',
            'CHARACTER_CHANGED',
            'CHARACTER_LOADED',
        ]
        characterEvents.forEach((eventName) => {
            const eventType = eventTypes?.[eventName]
            if (eventType) {
                eventSource.on(eventType, applyPerCharacterOverrides)
            }
        })
        if (eventTypes.MORE_MESSAGES_LOADED) {
            eventSource.on(
                eventTypes.MORE_MESSAGES_LOADED,
                refreshReswipeButtons,
            )
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
    } catch (error) {
        console.error(
            '[Image-Generation-Autopilot] Initialization failed:',
            error,
        )
        // Reset initialization state to allow retry
        state.initialized = false
    }
}

;(function bootstrap() {
    try {
        const ctx = getCtx()
        if (!ctx || !ctx.eventSource || !ctx.eventTypes) {
            console.warn(
                '[Image-Generation-Autopilot] Context not ready, retrying...',
            )
            setTimeout(() => bootstrap(), 100)
            return
        }
        ctx.eventSource.on(ctx.eventTypes.APP_READY, () => void init())
    } catch (error) {
        console.error('[Image-Generation-Autopilot] Bootstrap failed:', error)
        setTimeout(() => bootstrap(), 100)
    }
})()
