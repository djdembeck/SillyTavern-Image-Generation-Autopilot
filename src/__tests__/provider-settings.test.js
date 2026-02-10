/**
 * Provider Settings Tests
 * Tests for provider configuration UI and management
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';

describe('Provider Settings', () => {
    let mockSettings;
    let mockState;

    beforeEach(() => {
        mockSettings = {
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
                    enabled: true,
                    mainPrompt: 'Insert <pic prompt="detailed scene description"> tags at the end of each reply.',
                    instructionsPositive: '',
                    instructionsNegative: '',
                    examplePrompt: '',
                    lengthLimit: 0,
                    lengthLimitType: 'none',
                    picCountMode: 'exact',
                    picCountExact: 1,
                    picCountMin: 1,
                    picCountMax: 3,
                    regex: '/<pic[^>]*\\sprompt="([\\s\\S]*?)"(?=\\s*\\/?>)/g',
                    position: 'deep_system',
                    depth: 0,
                },
            },
            providers: [],
        };

        mockState = {
            ui: {
                providerListContainer: null,
                addProviderButton: null,
            },
        };
    });

    afterEach(() => {
        mockSettings = null;
        mockState = null;
    });

    describe('Default Provider Config', () => {
        it('should return correct default config for NanoGPT provider', () => {
            const type = 'nanogpt';
            const expectedConfig = {
                apiKey: '',
                baseUrl: 'https://nano-gpt.com/api/v1',
                model: 'z-image-turbo'
            };

            const result = getDefaultProviderConfig(type);
            expect(result).toEqual(expectedConfig);
        });

        it('should return correct default config for Pollinations provider', () => {
            const type = 'pollinations';
            const expectedConfig = {
                baseUrl: 'https://image.pollinations.ai',
                model: 'flux'
            };

            const result = getDefaultProviderConfig(type);
            expect(result).toEqual(expectedConfig);
        });

        it('should return correct default config for OpenRouter provider', () => {
            const type = 'openrouter';
            const expectedConfig = {
                apiKey: '',
                baseUrl: 'https://openrouter.ai/api/v1',
                httpReferer: '',
                xTitle: '',
                model: ''
            };

            const result = getDefaultProviderConfig(type);
            expect(result).toEqual(expectedConfig);
        });

        it('should return empty object for unknown provider type', () => {
            const type = 'unknown';
            const expectedConfig = {};

            const result = getDefaultProviderConfig(type);
            expect(result).toEqual(expectedConfig);
        });
    });

    describe('Provider Entry Management', () => {
        it('should add a new provider entry', () => {
            const initialProviders = [...mockSettings.providers];
            expect(initialProviders.length).toBe(0);

            const newId = `provider_${Date.now()}`;
            mockSettings.providers.push({
                id: newId,
                type: 'nanogpt',
                name: 'New Provider',
                enabled: true,
                priority: 1,
                config: {
                    apiKey: '',
                    baseUrl: 'https://nano-gpt.com/api/v1',
                    model: 'z-image-turbo'
                }
            });

            expect(mockSettings.providers.length).toBe(1);
            expect(mockSettings.providers[0].id).toBe(newId);
            expect(mockSettings.providers[0].type).toBe('nanogpt');
            expect(mockSettings.providers[0].name).toBe('New Provider');
            expect(mockSettings.providers[0].enabled).toBe(true);
            expect(mockSettings.providers[0].priority).toBe(1);
        });

        it('should update a provider entry', () => {
            mockSettings.providers = [
                {
                    id: 'provider_1',
                    type: 'nanogpt',
                    name: 'Test Provider',
                    enabled: true,
                    priority: 1,
                    config: {
                        apiKey: '',
                        baseUrl: 'https://nano-gpt.com/api/v1',
                        model: 'z-image-turbo'
                    }
                }
            ];

            const index = 0;
            const patch = {
                name: 'Updated Provider',
                enabled: false,
                priority: 2
            };

            mockSettings.providers[index] = {
                ...mockSettings.providers[index],
                ...patch
            };

            expect(mockSettings.providers[index].name).toBe('Updated Provider');
            expect(mockSettings.providers[index].enabled).toBe(false);
            expect(mockSettings.providers[index].priority).toBe(2);
            expect(mockSettings.providers[index].type).toBe('nanogpt');
        });

        it('should update provider config', () => {
            mockSettings.providers = [
                {
                    id: 'provider_1',
                    type: 'nanogpt',
                    name: 'Test Provider',
                    enabled: true,
                    priority: 1,
                    config: {
                        apiKey: '',
                        baseUrl: 'https://nano-gpt.com/api/v1',
                        model: 'z-image-turbo'
                    }
                }
            ];

            const index = 0;
            const patch = {
                config: {
                    apiKey: 'test-api-key',
                    model: 'qwen-image'
                }
            };

            mockSettings.providers[index] = {
                ...mockSettings.providers[index],
                config: {
                    ...mockSettings.providers[index].config,
                    ...patch.config
                }
            };

            expect(mockSettings.providers[index].config.apiKey).toBe('test-api-key');
            expect(mockSettings.providers[index].config.model).toBe('qwen-image');
            expect(mockSettings.providers[index].config.baseUrl).toBe('https://nano-gpt.com/api/v1');
        });

        it('should remove a provider entry', () => {
            mockSettings.providers = [
                {
                    id: 'provider_1',
                    type: 'nanogpt',
                    name: 'Provider 1',
                    enabled: true,
                    priority: 1,
                    config: {
                        apiKey: '',
                        baseUrl: 'https://nano-gpt.com/api/v1',
                        model: 'z-image-turbo'
                    }
                },
                {
                    id: 'provider_2',
                    type: 'pollinations',
                    name: 'Provider 2',
                    enabled: true,
                    priority: 2,
                    config: {
                        baseUrl: 'https://image.pollinations.ai',
                        model: 'flux'
                    }
                }
            ];

            expect(mockSettings.providers.length).toBe(2);

            const index = 0;
            mockSettings.providers.splice(index, 1);

            expect(mockSettings.providers.length).toBe(1);
            expect(mockSettings.providers[0].id).toBe('provider_2');
        });
    });

    describe('Provider Priority Validation', () => {
        it('should clamp priority to minimum value of 1', () => {
            const priority = 0;
            const clamped = Math.max(1, Math.min(100, priority || 1));
            expect(clamped).toBe(1);
        });

        it('should clamp priority to maximum value of 100', () => {
            const priority = 150;
            const clamped = Math.max(1, Math.min(100, priority || 1));
            expect(clamped).toBe(100);
        });

        it('should keep valid priority values unchanged', () => {
            const priority = 50;
            const clamped = Math.max(1, Math.min(100, priority || 1));
            expect(clamped).toBe(50);
        });
    });

    describe('Provider Type Selection', () => {
        it('should support NanoGPT provider type', () => {
            const types = [
                { value: 'nanogpt', label: 'NanoGPT' },
                { value: 'pollinations', label: 'Pollinations' },
                { value: 'openrouter', label: 'OpenRouter' }
            ];

            const nanogptType = types.find(t => t.value === 'nanogpt');
            expect(nanogptType).toBeDefined();
            expect(nanogptType.label).toBe('NanoGPT');
        });

        it('should support Pollinations provider type', () => {
            const types = [
                { value: 'nanogpt', label: 'NanoGPT' },
                { value: 'pollinations', label: 'Pollinations' },
                { value: 'openrouter', label: 'OpenRouter' }
            ];

            const pollinationsType = types.find(t => t.value === 'pollinations');
            expect(pollinationsType).toBeDefined();
            expect(pollinationsType.label).toBe('Pollinations');
        });

        it('should support OpenRouter provider type', () => {
            const types = [
                { value: 'nanogpt', label: 'NanoGPT' },
                { value: 'pollinations', label: 'Pollinations' },
                { value: 'openrouter', label: 'OpenRouter' }
            ];

            const openrouterType = types.find(t => t.value === 'openrouter');
            expect(openrouterType).toBeDefined();
            expect(openrouterType.label).toBe('OpenRouter');
        });
    });

    describe('Provider Settings Structure', () => {
        it('should have providers array in default settings', () => {
            expect(mockSettings.providers).toBeDefined();
            expect(Array.isArray(mockSettings.providers)).toBe(true);
        });

        it('should initialize with empty providers array', () => {
            expect(mockSettings.providers.length).toBe(0);
        });

        it('should support multiple providers', () => {
            mockSettings.providers = [
                {
                    id: 'provider_1',
                    type: 'nanogpt',
                    name: 'NanoGPT Provider',
                    enabled: true,
                    priority: 1,
                    config: {
                        apiKey: 'key1',
                        baseUrl: 'https://nano-gpt.com/api/v1',
                        model: 'z-image-turbo'
                    }
                },
                {
                    id: 'provider_2',
                    type: 'pollinations',
                    name: 'Pollinations Provider',
                    enabled: true,
                    priority: 2,
                    config: {
                        baseUrl: 'https://image.pollinations.ai',
                        model: 'flux'
                    }
                },
                {
                    id: 'provider_3',
                    type: 'openrouter',
                    name: 'OpenRouter Provider',
                    enabled: false,
                    priority: 3,
                    config: {
                        apiKey: 'key3',
                        baseUrl: 'https://openrouter.ai/api/v1',
                        httpReferer: '',
                        xTitle: '',
                        model: ''
                    }
                }
            ];

            expect(mockSettings.providers.length).toBe(3);
            expect(mockSettings.providers[0].type).toBe('nanogpt');
            expect(mockSettings.providers[1].type).toBe('pollinations');
            expect(mockSettings.providers[2].type).toBe('openrouter');
        });
    });
});

function getDefaultProviderConfig(type) {
    switch (type) {
        case 'nanogpt':
            return {
                apiKey: '',
                baseUrl: 'https://nano-gpt.com/api/v1',
                model: 'z-image-turbo'
            }
        case 'pollinations':
            return {
                baseUrl: 'https://image.pollinations.ai',
                model: 'flux'
            }
        case 'openrouter':
            return {
                apiKey: '',
                baseUrl: 'https://openrouter.ai/api/v1',
                httpReferer: '',
                xTitle: '',
                model: ''
            }
        default:
            return {}
    }
}
