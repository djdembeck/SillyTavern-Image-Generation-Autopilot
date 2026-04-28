import { describe, expect, it, mock, beforeAll, beforeEach } from 'bun:test'

// Mock the summarizer module before importing index.js
mock.module('../../src/summarizer.js', () => ({
    summarizeWithAI: () => Promise.resolve(''),
}))

// Mock browser globals needed by index.js module scope
globalThis.window = globalThis.window || {}
globalThis.window.toastr = { success: () => {}, error: () => {}, warning: () => {}, info: () => {} }
globalThis.toastr = globalThis.window.toastr
globalThis.HTMLScriptElement = class HTMLScriptElement { constructor() { this.src = '' } }
globalThis.document = {
    createElement: () => ({ textContent: '', innerHTML: '', setAttribute: () => {}, appendChild: () => {} }),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
    currentScript: null,
}
globalThis.setTimeout = globalThis.setTimeout || ((fn) => fn())
globalThis.clearTimeout = globalThis.clearTimeout || (() => {})

let validatePresetJSON
let serializePresetForExport
let parsePresetFromImport
let savePreset
let getPreset
let deletePreset
let listPresets
let getCurrentSettingsSnapshot
let handleImportPreset
let handleExportPreset
let applyPresetToCharacter
let savePresetToCharacter
let loadPresetToCharacter
let loadPreset

const MODULE_NAME = 'Image-Generation-Autopilot'
const PRESET_STORAGE_KEY = MODULE_NAME + '_presets'

let mockExtensionSettings
let mockSaveSettingsDebounced

// Valid settings matching defaultSettings shape (index.js lines 30-87)
const VALID_SETTINGS = {
    enabled: true,
    debugMode: false,
    targetCount: 4,
    delayMs: 800,
    swipeTimeoutMs: 120000,
    concurrency: 0,
    modelQueue: [],
    modelQueueEnabled: true,
    swipeModel: '',
    perCharacter: {
        enabled: false,
        globalDefaults: {},
    },
    autoGeneration: {
        enabled: false,
        insertType: 'new',
        promptRewrite: {
            enabled: false,
            modelId: '',
        },
        promptInjection: {
            mainPrompt: 'Create detailed, vivid image descriptions from roleplay scenes.',
            instructionsPositive: '',
            instructionsNegative: '',
            examplePrompt: '',
            lengthLimit: 0,
            lengthLimitType: 'none',
            picCountMode: 'exact',
            picCountExact: 1,
            picCountMin: 1,
            picCountMax: 3,
        },
        summarizer: {
            messageDepth: 1,
            maxTokens: 500,
            characterPercent: 30,
            scenePercent: 70,
            systemPromptTemplate: 'Create image generation prompts from roleplay scenarios.',
        },
    },
}

function createValidPreset(overrides = {}) {
    return {
        schemaVersion: 1,
        name: 'Test Preset',
        settings: JSON.parse(JSON.stringify(VALID_SETTINGS)),
        createdAt: '2026-04-27T00:00:00.000Z',
        ...overrides,
    }
}

function setupMockContext(presets = {}, settings = null) {
    mockExtensionSettings = {
        [MODULE_NAME]: settings || JSON.parse(JSON.stringify(VALID_SETTINGS)),
        [PRESET_STORAGE_KEY]: JSON.parse(JSON.stringify(presets)),
    }
    mockSaveSettingsDebounced = mock(() => {})

    globalThis.SillyTavern = {
        getContext: () => ({
            extensionSettings: mockExtensionSettings,
            saveSettingsDebounced: mockSaveSettingsDebounced,
        }),
    }
}

beforeAll(async () => {
    const mod = await import('../../index.js')
    validatePresetJSON = mod.validatePresetJSON
    serializePresetForExport = mod.serializePresetForExport
    parsePresetFromImport = mod.parsePresetFromImport
    savePreset = mod.savePreset
    getPreset = mod.getPreset
    deletePreset = mod.deletePreset
    listPresets = mod.listPresets
    getCurrentSettingsSnapshot = mod.getCurrentSettingsSnapshot
    handleImportPreset = mod.handleImportPreset
    handleExportPreset = mod.handleExportPreset
    applyPresetToCharacter = mod.applyPresetToCharacter
    savePresetToCharacter = mod.savePresetToCharacter
    loadPresetToCharacter = mod.loadPresetToCharacter
    loadPreset = mod.loadPreset
})

describe('Preset Import/Export', () => {
    describe('validatePresetJSON', () => {
        it('valid preset JSON passes validation', () => {
            const result = validatePresetJSON(createValidPreset())
            expect(result.valid).toBe(true)
            expect(result.data).toBeDefined()
            expect(result.data.name).toBe('Test Preset')
            expect(result.data.settings.targetCount).toBe(4)
        })

        it('missing schemaVersion returns invalid', () => {
            const { schemaVersion, ...noVersion } = createValidPreset()
            const result = validatePresetJSON(noVersion)
            expect(result.valid).toBe(false)
            expect(result.error).toContain('schemaVersion')
        })

        it('schemaVersion 2 returns invalid with newer version message', () => {
            const result = validatePresetJSON(createValidPreset({ schemaVersion: 2 }))
            expect(result.valid).toBe(false)
            expect(result.error).toContain('newer version')
        })

        it('missing name returns invalid', () => {
            const { name, ...noName } = createValidPreset()
            const result = validatePresetJSON(noName)
            expect(result.valid).toBe(false)
            expect(result.error).toContain('name')
        })

        it('empty name returns invalid', () => {
            const result = validatePresetJSON(createValidPreset({ name: '' }))
            expect(result.valid).toBe(false)
            expect(result.error).toContain('name')
        })

        it('name exceeding 100 characters returns invalid', () => {
            const longName = 'A'.repeat(101)
            const result = validatePresetJSON(createValidPreset({ name: longName }))
            expect(result.valid).toBe(false)
            expect(result.error).toContain('name')
        })

        it('missing settings returns invalid', () => {
            const { settings, ...noSettings } = createValidPreset()
            const result = validatePresetJSON(noSettings)
            expect(result.valid).toBe(false)
            expect(result.error).toContain('settings')
        })

        it('settings with wrong types returns invalid', () => {
            const badSettings = JSON.parse(JSON.stringify(VALID_SETTINGS))
            badSettings.targetCount = 'four'
            const result = validatePresetJSON(createValidPreset({ settings: badSettings }))
            expect(result.valid).toBe(false)
            expect(result.error).toContain('targetCount')
        })

        it('settings with unknown extra keys is valid (forward-compatible)', () => {
            const extraSettings = { ...JSON.parse(JSON.stringify(VALID_SETTINGS)), futureFeature: true }
            const result = validatePresetJSON(createValidPreset({ settings: extraSettings }))
            expect(result.valid).toBe(true)
        })

        it('missing createdAt returns invalid', () => {
            const { createdAt, ...noDate } = createValidPreset()
            const result = validatePresetJSON(noDate)
            expect(result.valid).toBe(false)
            expect(result.error).toContain('createdAt')
        })

        it('invalid createdAt returns invalid', () => {
            const result = validatePresetJSON(createValidPreset({ createdAt: 'not-a-date' }))
            expect(result.valid).toBe(false)
            expect(result.error).toContain('createdAt')
        })

        it('XSS in name field is sanitized', () => {
            const result = validatePresetJSON(
                createValidPreset({ name: '<script>alert("xss")</script>Evil' }),
            )
            expect(result.valid).toBe(true)
            expect(result.data.name).not.toContain('<script>')
            expect(result.data.name).not.toContain('</script>')
        })

        it('round-trip: exported JSON passes re-import validation', () => {
            const exported = createValidPreset()
            const result = validatePresetJSON(exported)
            expect(result.valid).toBe(true)
            expect(result.data.name).toBe('Test Preset')
            expect(result.data.settings.targetCount).toBe(4)
            expect(result.data.schemaVersion).toBe(1)
        })
    })

    describe('serializePresetForExport', () => {
        beforeEach(() => {
            setupMockContext({
                preset_001: {
                    id: 'preset_001',
                    name: 'My Preset',
                    settings: JSON.parse(JSON.stringify(VALID_SETTINGS)),
                    createdAt: '2026-04-27T00:00:00.000Z',
                },
            })
        })

        it('produces valid JSON with schemaVersion: 1', () => {
            const json = serializePresetForExport('preset_001')
            const parsed = JSON.parse(json)
            expect(parsed.schemaVersion).toBe(1)
        })

        it('excludes id from output', () => {
            const json = serializePresetForExport('preset_001')
            const parsed = JSON.parse(json)
            expect(parsed.id).toBeUndefined()
        })

        it('preserves name, settings, and createdAt', () => {
            const json = serializePresetForExport('preset_001')
            const parsed = JSON.parse(json)
            expect(parsed.name).toBe('My Preset')
            expect(parsed.settings.targetCount).toBe(4)
            expect(parsed.createdAt).toBe('2026-04-27T00:00:00.000Z')
        })

        it('returns null for non-existent preset', () => {
            expect(serializePresetForExport('nonexistent')).toBeNull()
        })

        it('output passes validatePresetJSON', () => {
            const json = serializePresetForExport('preset_001')
            const parsed = JSON.parse(json)
            const result = validatePresetJSON(parsed)
            expect(result.valid).toBe(true)
        })
    })

    describe('parsePresetFromImport', () => {
        it('returns object with new id from valid JSON', () => {
            const json = JSON.stringify(createValidPreset())
            const result = parsePresetFromImport(json)
            expect(result.id).toMatch(/^preset_\d+$/)
        })

        it('preserves name, settings, and createdAt', () => {
            const json = JSON.stringify(createValidPreset({ name: 'Imported' }))
            const result = parsePresetFromImport(json)
            expect(result.name).toBe('Imported')
            expect(result.settings.targetCount).toBe(4)
            expect(result.createdAt).toBe('2026-04-27T00:00:00.000Z')
        })

        it('throws on invalid JSON string', () => {
            expect(() => parsePresetFromImport('not json')).toThrow('Invalid JSON string')
        })

        it('throws on missing schemaVersion', () => {
            const { schemaVersion, ...noVersion } = createValidPreset()
            expect(() => parsePresetFromImport(JSON.stringify(noVersion))).toThrow('schemaVersion')
        })

        it('throws on missing name', () => {
            const { name, ...noName } = createValidPreset()
            expect(() => parsePresetFromImport(JSON.stringify(noName))).toThrow('name')
        })

        it('throws on empty name', () => {
            expect(() => parsePresetFromImport(JSON.stringify(createValidPreset({ name: '' })))).toThrow('name')
        })

        it('throws on missing settings', () => {
            const { settings, ...noSettings } = createValidPreset()
            expect(() => parsePresetFromImport(JSON.stringify(noSettings))).toThrow('settings')
        })

        it('throws on missing createdAt', () => {
            const { createdAt, ...noDate } = createValidPreset()
            expect(() => parsePresetFromImport(JSON.stringify(noDate))).toThrow('createdAt')
        })
    })

    describe('savePreset (UPDATE mode)', () => {
        beforeEach(() => {
            setupMockContext({
                preset_existing: {
                    id: 'preset_existing',
                    name: 'Original Name',
                    settings: JSON.parse(JSON.stringify(VALID_SETTINGS)),
                    createdAt: '2026-01-01T00:00:00.000Z',
                },
            })
        })

        it('updates existing preset when id matches', () => {
            const updatedSettings = { ...JSON.parse(JSON.stringify(VALID_SETTINGS)), targetCount: 8 }
            const result = savePreset('preset_existing', 'Updated Name', updatedSettings)
            expect(result.name).toBe('Updated Name')
            expect(result.settings.targetCount).toBe(8)
            expect(result.createdAt).toBe('2026-01-01T00:00:00.000Z')
        })

        it('creates new preset when id does not match', () => {
            const result = savePreset('preset_new', 'New Preset', JSON.parse(JSON.stringify(VALID_SETTINGS)))
            expect(result.id).toBe('preset_new')
            expect(result.name).toBe('New Preset')
            expect(result.createdAt).toBeDefined()
        })

        it('does not duplicate preset on update', () => {
            savePreset('preset_existing', 'Updated', JSON.parse(JSON.stringify(VALID_SETTINGS)))
            const allPresets = listPresets()
            const matchingIds = allPresets.filter(p => p.id === 'preset_existing')
            expect(matchingIds.length).toBe(1)
        })
    })

    describe('getCurrentSettingsSnapshot', () => {
        beforeEach(() => {
            const settingsWithPerCharacter = JSON.parse(JSON.stringify(VALID_SETTINGS))
            settingsWithPerCharacter.perCharacter.globalDefaults = { model: 'test-model' }
            settingsWithPerCharacter.perCharacter.fields = { prompt: 'test-prompt' }
            settingsWithPerCharacter.presets = { somePreset: { name: 'should-be-stripped' } }
            setupMockContext({}, settingsWithPerCharacter)
        })

        it('strips perCharacter.globalDefaults', () => {
            const snapshot = getCurrentSettingsSnapshot()
            expect(snapshot.perCharacter.globalDefaults).toBeUndefined()
        })

        it('strips perCharacter.fields', () => {
            const snapshot = getCurrentSettingsSnapshot()
            expect(snapshot.perCharacter.fields).toBeUndefined()
        })

        it('strips presets', () => {
            const snapshot = getCurrentSettingsSnapshot()
            expect(snapshot.presets).toBeUndefined()
        })

        it('preserves other perCharacter properties', () => {
            const snapshot = getCurrentSettingsSnapshot()
            expect(snapshot.perCharacter.enabled).toBe(false)
        })

        it('preserves other settings properties', () => {
            const snapshot = getCurrentSettingsSnapshot()
            expect(snapshot.targetCount).toBe(4)
            expect(snapshot.enabled).toBe(true)
        })
    })

    describe('Round-trip: serialize → parse → save → load', () => {
        beforeEach(() => {
            setupMockContext({
                preset_roundtrip: {
                    id: 'preset_roundtrip',
                    name: 'Round Trip Preset',
                    settings: JSON.parse(JSON.stringify(VALID_SETTINGS)),
                    createdAt: '2026-04-27T00:00:00.000Z',
                },
            })
        })

        it('settings survive full round-trip', () => {
            const json = serializePresetForExport('preset_roundtrip')
            const parsed = parsePresetFromImport(json)
            savePreset(parsed.id, parsed.name, parsed.settings)
            const loaded = getPreset(parsed.id)
            expect(loaded.name).toBe('Round Trip Preset')
            expect(loaded.settings.targetCount).toBe(4)
            expect(loaded.settings.enabled).toBe(true)
            expect(loaded.settings.autoGeneration.promptInjection.picCountMode).toBe('exact')
        })
    })

    describe('Storage CRUD', () => {
        beforeEach(() => {
            setupMockContext({})
        })

        it('getPreset returns null for non-existent preset', () => {
            expect(getPreset('nonexistent')).toBeNull()
        })

        it('getPreset returns preset after save', () => {
            savePreset('preset_crud', 'CRUD Preset', JSON.parse(JSON.stringify(VALID_SETTINGS)))
            const preset = getPreset('preset_crud')
            expect(preset).not.toBeNull()
            expect(preset.name).toBe('CRUD Preset')
        })

        it('deletePreset removes preset from storage', () => {
            savePreset('preset_delete', 'Delete Me', JSON.parse(JSON.stringify(VALID_SETTINGS)))
            expect(getPreset('preset_delete')).not.toBeNull()
            deletePreset('preset_delete')
            expect(getPreset('preset_delete')).toBeNull()
        })

        it('listPresets returns all saved presets', () => {
            savePreset('preset_a', 'A Preset', JSON.parse(JSON.stringify(VALID_SETTINGS)))
            savePreset('preset_b', 'B Preset', JSON.parse(JSON.stringify(VALID_SETTINGS)))
            const all = listPresets()
            expect(all.length).toBe(2)
            const names = all.map(p => p.name).sort()
            expect(names).toEqual(['A Preset', 'B Preset'])
        })

        it('listPresets returns empty array when no presets', () => {
            expect(listPresets()).toEqual([])
        })
    })

    describe('handleImportPreset', () => {
        let mockFileInput
        let changeListeners
        let toastrCalls

        beforeEach(() => {
            setupMockContext({})
            changeListeners = []
            toastrCalls = []

            // Mock toastr to capture calls
            globalThis.window.toastr = {
                success: (msg, title) => toastrCalls.push({ level: 'success', msg, title }),
                error: (msg, title) => toastrCalls.push({ level: 'error', msg, title }),
                warning: (msg, title) => toastrCalls.push({ level: 'warning', msg, title }),
                info: (msg, title) => toastrCalls.push({ level: 'info', msg, title }),
            }
            globalThis.toastr = globalThis.window.toastr

            // Mock file input element
            mockFileInput = {
                click: mock(() => {}),
                addEventListener: mock((event, listener, options) => {
                    if (event === 'change') {
                        changeListeners.push({ listener, options })
                    }
                }),
                value: '',
            }

            // Mock document.getElementById to return our mock file input
            const origGetElementById = globalThis.document.getElementById
            globalThis.document.getElementById = (id) => {
                if (id === 'auto_multi_preset_file_input') return mockFileInput
                return origGetElementById ? origGetElementById.call(globalThis.document, id) : null
            }
        })

        function simulateFileSelect(fileContent) {
            // Simulate the change event with a mock file
            const mockFile = { type: 'application/json' }
            const mockReader = {
                onload: null,
                readAsText: mock(function (file) {
                    // Simulate FileReader completing synchronously
                    if (this.onload) {
                        this.onload({ target: { result: fileContent } })
                    }
                }),
            }

            // Mock FileReader constructor
            const OrigFileReader = globalThis.FileReader
            globalThis.FileReader = mock(function () { return mockReader })

            // Trigger the change listener
            const changeEvent = { target: { files: [mockFile] } }
            for (const { listener } of changeListeners) {
                listener(changeEvent)
            }

            // Restore
            globalThis.FileReader = OrigFileReader
        }

        it('triggers file input click when called', async () => {
            await handleImportPreset()
            expect(mockFileInput.click).toHaveBeenCalled()
        })

        it('registers a change event listener with { once: true }', async () => {
            await handleImportPreset()
            expect(changeListeners.length).toBe(1)
            expect(changeListeners[0].options).toEqual({ once: true })
        })

        it('imports a valid preset and shows success toast', async () => {
            const presetJson = JSON.stringify(createValidPreset({ name: 'Imported Preset' }))
            await handleImportPreset()
            simulateFileSelect(presetJson)

            const allPresets = listPresets()
            expect(allPresets.length).toBe(1)
            expect(allPresets[0].name).toBe('Imported Preset')
            expect(toastrCalls.length).toBe(1)
            expect(toastrCalls[0].level).toBe('success')
            expect(toastrCalls[0].msg).toContain('Imported Preset')
            expect(toastrCalls[0].title).toBe('Preset Imported')
        })

        it('overwrites existing preset with same name and shows warning toast', async () => {
            // Pre-save a preset with the same name
            savePreset('preset_existing', 'Same Name', JSON.parse(JSON.stringify(VALID_SETTINGS)))

            const presetJson = JSON.stringify(createValidPreset({ name: 'Same Name' }))
            await handleImportPreset()
            simulateFileSelect(presetJson)

            const allPresets = listPresets()
            // Should still be 1 preset (overwritten, not duplicated)
            expect(allPresets.length).toBe(1)
            expect(allPresets[0].name).toBe('Same Name')
            expect(toastrCalls.length).toBe(1)
            expect(toastrCalls[0].level).toBe('warning')
            expect(toastrCalls[0].msg).toContain('overwritten')
        })

        it('shows error toast on invalid JSON', async () => {
            await handleImportPreset()
            simulateFileSelect('not valid json')

            expect(toastrCalls.length).toBe(1)
            expect(toastrCalls[0].level).toBe('error')
            expect(toastrCalls[0].title).toBe('Import Failed')
        })

        it('shows error toast on validation failure', async () => {
            const invalidPreset = JSON.stringify({ name: 'Missing fields' })
            await handleImportPreset()
            simulateFileSelect(invalidPreset)

            expect(toastrCalls.length).toBe(1)
            expect(toastrCalls[0].level).toBe('error')
            expect(toastrCalls[0].title).toBe('Import Failed')
        })

        it('resets file input value after import', async () => {
            const presetJson = JSON.stringify(createValidPreset())
            await handleImportPreset()
            simulateFileSelect(presetJson)

            expect(mockFileInput.value).toBe('')
        })

        it('resets file input value even on import failure', async () => {
            await handleImportPreset()
            simulateFileSelect('bad json')

            expect(mockFileInput.value).toBe('')
        })

        it('returns early if file input element not found', async () => {
            globalThis.document.getElementById = () => null
            // Should not throw
            await handleImportPreset()
            expect(changeListeners.length).toBe(0)
        })

        it('does nothing when no file is selected (files array empty)', async () => {
            await handleImportPreset()

            // Simulate change event with no files
            const OrigFileReader = globalThis.FileReader
            globalThis.FileReader = mock(function () { return { onload: null, readAsText: mock(() => {}) } })

            const changeEvent = { target: { files: [] } }
            for (const { listener } of changeListeners) {
                listener(changeEvent)
            }

            globalThis.FileReader = OrigFileReader

            // No presets should be created, no toasts shown
            expect(listPresets().length).toBe(0)
            expect(toastrCalls.length).toBe(0)
        })
    })

    describe('Per-character bridge functions', () => {
        beforeEach(() => {
            setupMockContext({})
        })

        describe('applyPresetToCharacter', () => {
            it('returns false when preset not found', () => {
                const result = applyPresetToCharacter('nonexistent')
                expect(result).toBe(false)
            })

            it('applies preset settings to extensionSettings', () => {
                const presetSettings = JSON.parse(JSON.stringify(VALID_SETTINGS))
                presetSettings.targetCount = 8
                savePreset('preset_apply', 'Apply Preset', presetSettings)

                const result = applyPresetToCharacter('preset_apply')
                expect(result).toBe(true)

                const ctx = SillyTavern.getContext()
                expect(ctx.extensionSettings[MODULE_NAME].targetCount).toBe(8)
            })

            it('excludes presets property from applied settings', () => {
                const presetSettings = JSON.parse(JSON.stringify(VALID_SETTINGS))
                presetSettings.presets = { should: 'be_stripped' }
                savePreset('preset_apply2', 'Apply Preset 2', presetSettings)

                applyPresetToCharacter('preset_apply2')

                const ctx = SillyTavern.getContext()
                expect(ctx.extensionSettings[MODULE_NAME].presets).toBeUndefined()
            })

            it('calls syncPerCharacterStorage when perCharacter.enabled is true', () => {
                const settingsWithPerChar = JSON.parse(JSON.stringify(VALID_SETTINGS))
                settingsWithPerChar.perCharacter.enabled = true
                setupMockContext({}, settingsWithPerChar)

                const presetSettings = JSON.parse(JSON.stringify(VALID_SETTINGS))
                savePreset('preset_apply3', 'Apply Preset 3', presetSettings)

                applyPresetToCharacter('preset_apply3')

                const ctx = SillyTavern.getContext()
                expect(ctx.extensionSettings[MODULE_NAME].targetCount).toBe(4)
            })
        })

        describe('savePresetToCharacter', () => {
            it('returns false when preset not found', () => {
                const result = savePresetToCharacter('nonexistent')
                expect(result).toBe(false)
            })

            it('applies preset settings to extensionSettings', () => {
                const presetSettings = JSON.parse(JSON.stringify(VALID_SETTINGS))
                presetSettings.targetCount = 12
                savePreset('preset_save', 'Save Preset', presetSettings)

                const result = savePresetToCharacter('preset_save')
                expect(result).toBe(true)

                const ctx = SillyTavern.getContext()
                expect(ctx.extensionSettings[MODULE_NAME].targetCount).toBe(12)
            })

            it('excludes presets property from saved settings', () => {
                const presetSettings = JSON.parse(JSON.stringify(VALID_SETTINGS))
                presetSettings.presets = { should: 'be_stripped' }
                savePreset('preset_save2', 'Save Preset 2', presetSettings)

                savePresetToCharacter('preset_save2')

                const ctx = SillyTavern.getContext()
                expect(ctx.extensionSettings[MODULE_NAME].presets).toBeUndefined()
            })
        })

        describe('loadPresetToCharacter', () => {
            it('returns false when preset not found', () => {
                const result = loadPresetToCharacter('nonexistent')
                expect(result).toBe(false)
            })

            it('loads preset settings via loadPreset', () => {
                const presetSettings = JSON.parse(JSON.stringify(VALID_SETTINGS))
                presetSettings.targetCount = 16
                savePreset('preset_load', 'Load Preset', presetSettings)

                const result = loadPresetToCharacter('preset_load')
                expect(result).toBe(true)

                const ctx = SillyTavern.getContext()
                expect(ctx.extensionSettings[MODULE_NAME].targetCount).toBe(16)
            })

            it('excludes presets property from loaded settings', () => {
                const presetSettings = JSON.parse(JSON.stringify(VALID_SETTINGS))
                presetSettings.presets = { should: 'be_stripped' }
                savePreset('preset_load2', 'Load Preset 2', presetSettings)

                loadPresetToCharacter('preset_load2')

                const ctx = SillyTavern.getContext()
                expect(ctx.extensionSettings[MODULE_NAME].presets).toBeUndefined()
            })

            it('calls syncPerCharacterStorage when perCharacter.enabled is true', () => {
                const settingsWithPerChar = JSON.parse(JSON.stringify(VALID_SETTINGS))
                settingsWithPerChar.perCharacter.enabled = true
                setupMockContext({}, settingsWithPerChar)

                const presetSettings = JSON.parse(JSON.stringify(VALID_SETTINGS))
                savePreset('preset_load3', 'Load Preset 3', presetSettings)

                loadPresetToCharacter('preset_load3')

                const ctx = SillyTavern.getContext()
                expect(ctx.extensionSettings[MODULE_NAME].targetCount).toBe(4)
            })
        })

        describe('loadPreset', () => {
            it('returns false when preset not found', () => {
                const result = loadPreset('nonexistent')
                expect(result).toBe(false)
            })

            it('loads preset settings into extensionSettings', () => {
                const presetSettings = JSON.parse(JSON.stringify(VALID_SETTINGS))
                presetSettings.targetCount = 20
                presetSettings.concurrency = 4
                savePreset('preset_load4', 'Load Preset 4', presetSettings)

                const result = loadPreset('preset_load4')
                expect(result).toBe(true)

                const ctx = SillyTavern.getContext()
                expect(ctx.extensionSettings[MODULE_NAME].targetCount).toBe(20)
                expect(ctx.extensionSettings[MODULE_NAME].concurrency).toBe(4)
            })

            it('excludes presets property from loaded settings', () => {
                const presetSettings = JSON.parse(JSON.stringify(VALID_SETTINGS))
                presetSettings.presets = { should: 'be_stripped' }
                savePreset('preset_load5', 'Load Preset 5', presetSettings)

                loadPreset('preset_load5')

                const ctx = SillyTavern.getContext()
                expect(ctx.extensionSettings[MODULE_NAME].presets).toBeUndefined()
            })
        })
    })

    describe('handleExportPreset', () => {
        let toastrCalls
        let mockBlob
        let mockUrl
        let createdElements

        beforeEach(() => {
            setupMockContext({
                preset_export1: {
                    id: 'preset_export1',
                    name: 'Export Test Preset',
                    settings: JSON.parse(JSON.stringify(VALID_SETTINGS)),
                    createdAt: '2026-04-27T00:00:00.000Z',
                },
            })

            toastrCalls = []
            createdElements = []
            mockBlob = null
            mockUrl = 'blob:mock-url'

            globalThis.window.toastr = {
                success: (msg, title) => toastrCalls.push({ level: 'success', msg, title }),
                error: (msg, title) => toastrCalls.push({ level: 'error', msg, title }),
                warning: (msg, title) => toastrCalls.push({ level: 'warning', msg, title }),
                info: (msg, title) => toastrCalls.push({ level: 'info', msg, title }),
            }
            globalThis.toastr = globalThis.window.toastr

            globalThis.Blob = mock(function (parts, opts) {
                mockBlob = { parts, opts }
            })

            globalThis.URL = {
                createObjectURL: mock(() => mockUrl),
                revokeObjectURL: mock(() => {}),
            }

            globalThis.document.body = {
                appendChild: mock(() => {}),
                removeChild: mock(() => {}),
            }

            const origCreateElement = globalThis.document.createElement
            globalThis.document.createElement = (tag) => {
                const el = {
                    tagName: tag,
                    href: '',
                    download: '',
                    textContent: '',
                    innerHTML: '',
                    setAttribute: mock(() => {}),
                    appendChild: mock(() => {}),
                    click: mock(() => {}),
                }
                createdElements.push(el)
                return el
            }

            globalThis.setTimeout = mock((fn) => fn())
        })

        it('creates a download link and triggers click for valid preset', () => {
            handleExportPreset('preset_export1')

            expect(mockBlob).not.toBeNull()
            expect(mockBlob.opts.type).toBe('application/json')
            expect(createdElements.length).toBe(1)
            expect(createdElements[0].download).toBe('Export Test Preset.json')
        })

        it('sanitizes filename with special characters', () => {
            setupMockContext({
                preset_special: {
                    id: 'preset_special',
                    name: 'Test/Name:With*Special?Chars"<>|',
                    settings: JSON.parse(JSON.stringify(VALID_SETTINGS)),
                    createdAt: '2026-04-27T00:00:00.000Z',
                },
            })

            handleExportPreset('preset_special')

            expect(createdElements[0].download).toBe('Test_Name_With_Special_Chars____.json')
        })

        it('truncates filename to 100 characters', () => {
            const longName = 'A'.repeat(120)
            setupMockContext({
                preset_long: {
                    id: 'preset_long',
                    name: longName,
                    settings: JSON.parse(JSON.stringify(VALID_SETTINGS)),
                    createdAt: '2026-04-27T00:00:00.000Z',
                },
            })

            handleExportPreset('preset_long')

            const filename = createdElements[0].download
            expect(filename.length).toBe(105)
            expect(filename.endsWith('.json')).toBe(true)
        })

        it('shows error toast for non-existent preset', () => {
            handleExportPreset('nonexistent')

            expect(toastrCalls.length).toBe(1)
            expect(toastrCalls[0].level).toBe('error')
            expect(toastrCalls[0].msg).toBe('Preset not found')
            expect(toastrCalls[0].title).toBe('Export Failed')
        })

        it('shows success toast with preset name', () => {
            handleExportPreset('preset_export1')

            expect(toastrCalls.length).toBe(1)
            expect(toastrCalls[0].level).toBe('success')
            expect(toastrCalls[0].msg).toContain('Export Test Preset')
            expect(toastrCalls[0].title).toBe('Preset Exported')
        })

        it('exports valid JSON that passes validation', () => {
            handleExportPreset('preset_export1')

            const jsonStr = mockBlob.parts[0]
            const parsed = JSON.parse(jsonStr)
            const result = validatePresetJSON(parsed)
            expect(result.valid).toBe(true)
            expect(result.data.name).toBe('Export Test Preset')
        })

        it('revokes object URL after timeout', () => {
            let revokeCalled = false
            globalThis.setTimeout = mock((fn) => {
                revokeCalled = true
                fn()
            })

            handleExportPreset('preset_export1')

            expect(revokeCalled).toBe(true)
        })
    })

    describe('Integration: Round-trip workflows', () => {
        beforeEach(() => {
            setupMockContext({})
        })

        it('round-trip: create preset, export, import, verify settings match', () => {
            // Create preset with custom settings
            const originalSettings = JSON.parse(JSON.stringify(VALID_SETTINGS))
            originalSettings.targetCount = 7
            originalSettings.concurrency = 3
            originalSettings.autoGeneration.promptInjection.picCountMode = 'range'
            originalSettings.autoGeneration.promptInjection.picCountMin = 2
            originalSettings.autoGeneration.promptInjection.picCountMax = 5
            savePreset('preset_rt1', 'RoundTrip Test', originalSettings)

            // Export
            const exportedJson = serializePresetForExport('preset_rt1')
            expect(exportedJson).not.toBeNull()
            const exported = JSON.parse(exportedJson)
            expect(exported.schemaVersion).toBe(1)
            expect(exported.id).toBeUndefined()

            // Import (will create new ID)
            const imported = parsePresetFromImport(exportedJson)
            savePreset(imported.id, imported.name, imported.settings)

            // Verify settings match original
            const loaded = getPreset(imported.id)
            expect(loaded).not.toBeNull()
            expect(loaded.name).toBe('RoundTrip Test')
            expect(loaded.settings.targetCount).toBe(7)
            expect(loaded.settings.concurrency).toBe(3)
            expect(loaded.settings.autoGeneration.promptInjection.picCountMode).toBe('range')
            expect(loaded.settings.autoGeneration.promptInjection.picCountMin).toBe(2)
            expect(loaded.settings.autoGeneration.promptInjection.picCountMax).toBe(5)
        })

        it('round-trip: deep nested settings survive export+import', () => {
            const deepSettings = JSON.parse(JSON.stringify(VALID_SETTINGS))
            deepSettings.autoGeneration.promptRewrite.enabled = true
            deepSettings.autoGeneration.promptRewrite.modelId = 'test-model-v2'
            deepSettings.autoGeneration.summarizer.messageDepth = 5
            deepSettings.autoGeneration.summarizer.maxTokens = 1000
            deepSettings.autoGeneration.summarizer.characterPercent = 40
            deepSettings.autoGeneration.summarizer.scenePercent = 60
            deepSettings.perCharacter.enabled = true
            savePreset('preset_deep', 'Deep Nested', deepSettings)

            const json = serializePresetForExport('preset_deep')
            const imported = parsePresetFromImport(json)
            savePreset(imported.id, imported.name, imported.settings)

            const loaded = getPreset(imported.id)
            expect(loaded.settings.autoGeneration.promptRewrite.enabled).toBe(true)
            expect(loaded.settings.autoGeneration.promptRewrite.modelId).toBe('test-model-v2')
            expect(loaded.settings.autoGeneration.summarizer.messageDepth).toBe(5)
            expect(loaded.settings.autoGeneration.summarizer.maxTokens).toBe(1000)
            expect(loaded.settings.autoGeneration.summarizer.characterPercent).toBe(40)
            expect(loaded.settings.autoGeneration.summarizer.scenePercent).toBe(60)
            expect(loaded.settings.perCharacter.enabled).toBe(true)
        })

        it('round-trip: model queue settings survive export+import', () => {
            const queueSettings = JSON.parse(JSON.stringify(VALID_SETTINGS))
            queueSettings.modelQueueEnabled = true
            queueSettings.modelQueue = [
                { modelId: 'sd-1.5', count: 3 },
                { modelId: 'sdxl-turbo', count: 2 },
            ]
            savePreset('preset_queue', 'Queue Test', queueSettings)

            const json = serializePresetForExport('preset_queue')
            const imported = parsePresetFromImport(json)
            savePreset(imported.id, imported.name, imported.settings)

            const loaded = getPreset(imported.id)
            expect(loaded.settings.modelQueueEnabled).toBe(true)
            expect(loaded.settings.modelQueue).toHaveLength(2)
            expect(loaded.settings.modelQueue[0].modelId).toBe('sd-1.5')
            expect(loaded.settings.modelQueue[0].count).toBe(3)
            expect(loaded.settings.modelQueue[1].modelId).toBe('sdxl-turbo')
            expect(loaded.settings.modelQueue[1].count).toBe(2)
        })

        it('round-trip: exported JSON is valid for re-import validation', () => {
            savePreset('preset_revalidate', 'Revalidate Test', JSON.parse(JSON.stringify(VALID_SETTINGS)))

            const json = serializePresetForExport('preset_revalidate')
            const parsed = JSON.parse(json)

            // Validate the exported JSON directly
            const result = validatePresetJSON(parsed)
            expect(result.valid).toBe(true)
            expect(result.data.name).toBe('Revalidate Test')

            // Parse it as if importing
            const imported = parsePresetFromImport(json)
            expect(imported.id).toMatch(/^preset_\d+$/)
            expect(imported.name).toBe('Revalidate Test')
        })
    })

    describe('Integration: Edit+resave', () => {
        beforeEach(() => {
            setupMockContext({})
        })

        it('edit+resave: load preset, modify settings, save updates same preset', () => {
            // Create and save
            savePreset('preset_edit1', 'Edit Test', { ...JSON.parse(JSON.stringify(VALID_SETTINGS)), targetCount: 4 })

            // Modify settings and resave with same ID
            const modifiedSettings = { ...JSON.parse(JSON.stringify(VALID_SETTINGS)), targetCount: 8 }
            savePreset('preset_edit1', 'Edit Test', modifiedSettings)

            // Verify updated, not duplicated
            const presets = listPresets()
            const matching = presets.filter(p => p.id === 'preset_edit1')
            expect(matching.length).toBe(1)
            expect(getPreset('preset_edit1').settings.targetCount).toBe(8)
        })

        it('edit+resave: preserves createdAt on update', () => {
            savePreset('preset_edit2', 'Edit Date Test', JSON.parse(JSON.stringify(VALID_SETTINGS)))
            const original = getPreset('preset_edit2')
            const originalCreatedAt = original.createdAt

            // Resave
            savePreset('preset_edit2', 'Edit Date Test Updated', { ...JSON.parse(JSON.stringify(VALID_SETTINGS)), targetCount: 12 })

            const updated = getPreset('preset_edit2')
            expect(updated.createdAt).toBe(originalCreatedAt)
            expect(updated.name).toBe('Edit Date Test Updated')
            expect(updated.settings.targetCount).toBe(12)
        })

        it('edit+resave: multiple sequential updates accumulate correctly', () => {
            savePreset('preset_seq', 'Sequential', { ...JSON.parse(JSON.stringify(VALID_SETTINGS)), targetCount: 1 })

            savePreset('preset_seq', 'Sequential', { ...JSON.parse(JSON.stringify(VALID_SETTINGS)), targetCount: 2 })
            expect(getPreset('preset_seq').settings.targetCount).toBe(2)

            savePreset('preset_seq', 'Sequential', { ...JSON.parse(JSON.stringify(VALID_SETTINGS)), targetCount: 3 })
            expect(getPreset('preset_seq').settings.targetCount).toBe(3)

            // Still only one preset
            expect(listPresets().filter(p => p.id === 'preset_seq').length).toBe(1)
        })

        it('edit+resave: name change preserves settings', () => {
            savePreset('preset_rename', 'Original Name', JSON.parse(JSON.stringify(VALID_SETTINGS)))

            savePreset('preset_rename', 'New Name', JSON.parse(JSON.stringify(VALID_SETTINGS)))

            const preset = getPreset('preset_rename')
            expect(preset.name).toBe('New Name')
            expect(preset.settings.targetCount).toBe(4)
            expect(preset.settings.enabled).toBe(true)
        })
    })

    describe('Integration: Overwrite scenarios', () => {
        beforeEach(() => {
            setupMockContext({})
        })

        it('import with same name overwrites existing preset (same ID, new settings)', () => {
            // Create original
            savePreset('preset_orig', 'Same Name', { ...JSON.parse(JSON.stringify(VALID_SETTINGS)), targetCount: 4 })

            // Import with same name - simulates handleImportPreset logic
            const imported = parsePresetFromImport(JSON.stringify({
                schemaVersion: 1,
                name: 'Same Name',
                settings: { ...JSON.parse(JSON.stringify(VALID_SETTINGS)), targetCount: 8 },
                createdAt: new Date().toISOString(),
            }))

            // Find existing by name and overwrite with its ID
            const existingPresets = listPresets()
            const existing = existingPresets.find(p => p.name === imported.name)
            if (existing) {
                savePreset(existing.id, imported.name, imported.settings)
            } else {
                savePreset(imported.id, imported.name, imported.settings)
            }

            // Verify overwritten (same ID, new settings)
            const preset = getPreset('preset_orig')
            expect(preset.settings.targetCount).toBe(8)
            expect(preset.name).toBe('Same Name')

            // No duplicate
            expect(listPresets().length).toBe(1)
        })

        it('import with different name creates new preset', () => {
            savePreset('preset_diff', 'Different Name', JSON.parse(JSON.stringify(VALID_SETTINGS)))

            const imported = parsePresetFromImport(JSON.stringify({
                schemaVersion: 1,
                name: 'Brand New Name',
                settings: JSON.parse(JSON.stringify(VALID_SETTINGS)),
                createdAt: new Date().toISOString(),
            }))

            const existingPresets = listPresets()
            const existing = existingPresets.find(p => p.name === imported.name)
            if (existing) {
                savePreset(existing.id, imported.name, imported.settings)
            } else {
                savePreset(imported.id, imported.name, imported.settings)
            }

            expect(listPresets().length).toBe(2)
            expect(getPreset('preset_diff')).not.toBeNull()
            expect(getPreset(imported.id)).not.toBeNull()
        })

        it('overwrite preserves original createdAt', () => {
            savePreset('preset_ow', 'Overwrite Me', JSON.parse(JSON.stringify(VALID_SETTINGS)))
            const originalCreatedAt = getPreset('preset_ow').createdAt

            // Simulate import overwrite
            const imported = parsePresetFromImport(JSON.stringify({
                schemaVersion: 1,
                name: 'Overwrite Me',
                settings: { ...JSON.parse(JSON.stringify(VALID_SETTINGS)), targetCount: 99 },
                createdAt: new Date().toISOString(),
            }))

            savePreset('preset_ow', imported.name, imported.settings)

            const overwritten = getPreset('preset_ow')
            expect(overwritten.createdAt).toBe(originalCreatedAt)
            expect(overwritten.settings.targetCount).toBe(99)
        })

        it('overwrite via handleImportPreset with same name shows warning toast', async () => {
            // Pre-save a preset with the same name
            savePreset('preset_import_ow', 'Same Name Import', JSON.parse(JSON.stringify(VALID_SETTINGS)))

            let toastrCalls = []
            globalThis.window.toastr = {
                success: (msg, title) => toastrCalls.push({ level: 'success', msg, title }),
                error: (msg, title) => toastrCalls.push({ level: 'error', msg, title }),
                warning: (msg, title) => toastrCalls.push({ level: 'warning', msg, title }),
                info: (msg, title) => toastrCalls.push({ level: 'info', msg, title }),
            }
            globalThis.toastr = globalThis.window.toastr

            let changeListeners = []
            const mockFileInput = {
                click: mock(() => {}),
                addEventListener: mock((event, listener, options) => {
                    if (event === 'change') changeListeners.push({ listener, options })
                }),
                value: '',
            }

            globalThis.document.getElementById = (id) => {
                if (id === 'auto_multi_preset_file_input') return mockFileInput
                return null
            }

            const presetJson = JSON.stringify(createValidPreset({ name: 'Same Name Import', settings: { ...JSON.parse(JSON.stringify(VALID_SETTINGS)), targetCount: 15 } }))
            await handleImportPreset()

            // Simulate file read
            const mockReader = {
                onload: null,
                readAsText: mock(function (file) {
                    if (this.onload) this.onload({ target: { result: presetJson } })
                }),
            }
            globalThis.FileReader = mock(function () { return mockReader })

            const changeEvent = { target: { files: [{ type: 'application/json' }] } }
            for (const { listener } of changeListeners) {
                listener(changeEvent)
            }

            // Should show warning toast about overwrite
            expect(toastrCalls.length).toBe(1)
            expect(toastrCalls[0].level).toBe('warning')
            expect(toastrCalls[0].msg).toContain('overwritten')

            // Settings should be updated
            expect(getPreset('preset_import_ow').settings.targetCount).toBe(15)
        })
    })

    describe('Integration: Full workflow', () => {
        beforeEach(() => {
            setupMockContext({})
        })

        it('full workflow: create, export, delete, import, edit, resave', () => {
            // 1. Create preset
            const settings1 = { ...JSON.parse(JSON.stringify(VALID_SETTINGS)), targetCount: 3, concurrency: 2 }
            savePreset('preset_workflow', 'Workflow Preset', settings1)
            expect(getPreset('preset_workflow')).not.toBeNull()
            expect(getPreset('preset_workflow').settings.targetCount).toBe(3)

            // 2. Export
            const exportedJson = serializePresetForExport('preset_workflow')
            expect(exportedJson).not.toBeNull()

            // 3. Delete
            deletePreset('preset_workflow')
            expect(getPreset('preset_workflow')).toBeNull()
            expect(listPresets().length).toBe(0)

            // 4. Import from exported JSON
            const imported = parsePresetFromImport(exportedJson)
            savePreset(imported.id, imported.name, imported.settings)
            const importedPreset = getPreset(imported.id)
            expect(importedPreset).not.toBeNull()
            expect(importedPreset.name).toBe('Workflow Preset')
            expect(importedPreset.settings.targetCount).toBe(3)
            expect(importedPreset.settings.concurrency).toBe(2)

            // 5. Edit (modify settings and resave)
            const editedSettings = { ...JSON.parse(JSON.stringify(VALID_SETTINGS)), targetCount: 10, concurrency: 5 }
            savePreset(imported.id, 'Workflow Preset Edited', editedSettings)

            // 6. Verify resave
            const finalPreset = getPreset(imported.id)
            expect(finalPreset.name).toBe('Workflow Preset Edited')
            expect(finalPreset.settings.targetCount).toBe(10)
            expect(finalPreset.settings.concurrency).toBe(5)
            expect(listPresets().length).toBe(1)
        })

        it('full workflow: multiple presets with cross-operations', () => {
            // Create two presets
            savePreset('preset_multi_a', 'Preset A', { ...JSON.parse(JSON.stringify(VALID_SETTINGS)), targetCount: 2 })
            savePreset('preset_multi_b', 'Preset B', { ...JSON.parse(JSON.stringify(VALID_SETTINGS)), targetCount: 6 })

            expect(listPresets().length).toBe(2)

            // Export both
            const jsonA = serializePresetForExport('preset_multi_a')
            const jsonB = serializePresetForExport('preset_multi_b')

            // Delete A
            deletePreset('preset_multi_a')
            expect(listPresets().length).toBe(1)
            expect(getPreset('preset_multi_a')).toBeNull()

            // Re-import A
            const importedA = parsePresetFromImport(jsonA)
            savePreset(importedA.id, importedA.name, importedA.settings)
            expect(listPresets().length).toBe(2)

            // Verify B unchanged
            expect(getPreset('preset_multi_b').settings.targetCount).toBe(6)

            // Verify A restored
            const restoredA = getPreset(importedA.id)
            expect(restoredA.settings.targetCount).toBe(2)
        })

        it('full workflow: apply preset then save as new preset', () => {
            mockExtensionSettings[MODULE_NAME + '_presetsV2'] = true

            // Create and save a preset
            const presetSettings = { ...JSON.parse(JSON.stringify(VALID_SETTINGS)), targetCount: 16, concurrency: 4 }
            savePreset('preset_apply_save', 'Apply Then Save', presetSettings)

            // Apply it to extension settings
            const applyResult = applyPresetToCharacter('preset_apply_save')
            expect(applyResult).toBe(true)

            // Verify extension settings updated
            const ctx = SillyTavern.getContext()
            expect(ctx.extensionSettings[MODULE_NAME].targetCount).toBe(16)
            expect(ctx.extensionSettings[MODULE_NAME].concurrency).toBe(4)

            // Modify extension settings
            ctx.extensionSettings[MODULE_NAME].targetCount = 20

            // Save current settings as a new preset
            const snapshot = getCurrentSettingsSnapshot()
            savePreset('preset_new_from_applied', 'New From Applied', snapshot)

            // Verify new preset has modified settings
            const newPreset = getPreset('preset_new_from_applied')
            expect(newPreset.settings.targetCount).toBe(20)

            // Original preset unchanged
            expect(getPreset('preset_apply_save').settings.targetCount).toBe(16)
        })

        it('full workflow: export → validate → import → load → verify active settings', () => {
            // Set V2 flag so ensureSettings skips the one-time cleanup that calls saveSettingsDebounced directly
            mockExtensionSettings[MODULE_NAME + '_presetsV2'] = true

            // Create preset with distinctive settings
            const settings = JSON.parse(JSON.stringify(VALID_SETTINGS))
            settings.targetCount = 9
            settings.delayMs = 2000
            settings.swipeTimeoutMs = 60000
            settings.autoGeneration.enabled = true
            settings.autoGeneration.insertType = 'new'
            savePreset('preset_load_verify', 'Load Verify', settings)

            // Export and re-import
            const json = serializePresetForExport('preset_load_verify')
            const imported = parsePresetFromImport(json)
            savePreset(imported.id, imported.name, imported.settings)

            // Load the imported preset
            const loadResult = loadPreset(imported.id)
            expect(loadResult).toBe(true)

            // Verify active settings match
            const ctx = SillyTavern.getContext()
            expect(ctx.extensionSettings[MODULE_NAME].targetCount).toBe(9)
            expect(ctx.extensionSettings[MODULE_NAME].delayMs).toBe(2000)
            expect(ctx.extensionSettings[MODULE_NAME].swipeTimeoutMs).toBe(60000)
            expect(ctx.extensionSettings[MODULE_NAME].autoGeneration.enabled).toBe(true)
            expect(ctx.extensionSettings[MODULE_NAME].autoGeneration.insertType).toBe('new')
        })
    })
})
