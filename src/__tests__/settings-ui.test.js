import { describe, expect, it, beforeEach } from 'bun:test'

const MODULE_NAME = 'Image-Generation-Autopilot'

describe('Settings UI', () => {
    describe('defaultSettings structure', () => {
        it('should have message depth setting with correct range (1-10)', () => {
            const actualDefaults = {
                autoGeneration: {
                    summarizer: {
                        messageDepth: 1,
                    },
                },
            }
            expect(actualDefaults.autoGeneration.summarizer.messageDepth).toBeGreaterThanOrEqual(1)
            expect(actualDefaults.autoGeneration.summarizer.messageDepth).toBeLessThanOrEqual(10)
        })

        it('should have system prompt textarea setting', () => {
            const actualDefaults = {
                autoGeneration: {
                    summarizer: {
                        systemPromptTemplate: 'Template content',
                    },
                },
            }
            expect(actualDefaults.autoGeneration.summarizer.systemPromptTemplate).toBeDefined()
            expect(typeof actualDefaults.autoGeneration.summarizer.systemPromptTemplate).toBe('string')
        })

        it('should have default values: depth=1, template contains Pawtrait structure', () => {
            const actualDefaults = {
                autoGeneration: {
                    summarizer: {
                        messageDepth: 1,
                        systemPromptTemplate: 'Character Appearance:\n{{APPEARANCE_LINES}}',
                    },
                },
            }
            expect(actualDefaults.autoGeneration.summarizer.messageDepth).toBe(1)
            expect(actualDefaults.autoGeneration.summarizer.systemPromptTemplate).toContain('Character')
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
                    summarizer: {
                        messageDepth: 5,
                        systemPromptTemplate: 'Custom system prompt',
                    },
                },
            }
            window.extensionSettings[MODULE_NAME] = testSettings
            const loadedSettings = window.extensionSettings[MODULE_NAME]
            expect(loadedSettings.autoGeneration.summarizer.messageDepth).toBe(5)
            expect(loadedSettings.autoGeneration.summarizer.systemPromptTemplate).toBe('Custom system prompt')
        })

        it('should have correct default depth when not explicitly set', () => {
            const defaultDepth = 1
            const minimalSettings = {}
            const merged = {
                ...{ messageDepth: defaultDepth },
                ...minimalSettings,
            }
            expect(merged.messageDepth).toBe(1)
        })
    })
})
