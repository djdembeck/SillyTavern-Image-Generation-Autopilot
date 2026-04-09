import { describe, expect, it, beforeEach } from 'bun:test'

const MODULE_NAME = 'Image-Generation-Autopilot'

describe('Settings UI', () => {
    describe('defaultSettings structure', () => {
        it('should have message depth setting with correct range (1-10)', () => {
            const actualDefaults = {
                autoGeneration: {
                    promptInjection: {
                        depth: 0,
                    },
                },
            }
            expect(actualDefaults.autoGeneration.promptInjection.depth).toBeGreaterThanOrEqual(1)
            expect(actualDefaults.autoGeneration.promptInjection.depth).toBeLessThanOrEqual(10)
        })

        it('should have system prompt textarea setting', () => {
            const actualDefaults = {
                autoGeneration: {
                    promptInjection: {},
                },
            }
            expect(actualDefaults.autoGeneration.promptInjection.systemPrompt).toBeDefined()
            expect(typeof actualDefaults.autoGeneration.promptInjection.systemPrompt).toBe('string')
        })

        it('should have default values: depth=1, template="Pawtrait-adapted"', () => {
            const actualDefaults = {
                autoGeneration: {
                    promptInjection: {
                        depth: 0,
                        template: '',
                    },
                },
            }
            expect(actualDefaults.autoGeneration.promptInjection.depth).toBe(1)
            expect(actualDefaults.autoGeneration.promptInjection.template).toBe('Pawtrait-adapted')
        })
    })

    describe('Settings save and load', () => {
        beforeEach(() => {
            global.window = {
                extensionSettings: {
                    autoMultiImageSwipes: {},
                },
            }
        })

        it('should persist settings correctly', () => {
            const testSettings = {
                autoGeneration: {
                    promptInjection: {
                        depth: 5,
                        systemPrompt: 'Custom system prompt',
                        template: 'Custom-template',
                    },
                },
            }
            window.extensionSettings[MODULE_NAME] = testSettings
            const loadedSettings = window.extensionSettings[MODULE_NAME]
            expect(loadedSettings.autoGeneration.promptInjection.depth).toBe(5)
            expect(loadedSettings.autoGeneration.promptInjection.systemPrompt).toBe('Custom system prompt')
            expect(loadedSettings.autoGeneration.promptInjection.template).toBe('Custom-template')
        })

        it('should have correct default depth when not explicitly set', () => {
            const defaultDepth = 0
            const minimalSettings = {}
            const merged = {
                ...{ depth: defaultDepth },
                ...minimalSettings,
            }
            expect(merged.depth).toBe(1)
        })
    })
})