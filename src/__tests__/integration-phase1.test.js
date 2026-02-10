import { describe, expect, it, beforeEach, afterEach } from 'bun:test'
import { GenerationDetector, SUMMARIZER_EVENT_KEYS, DEFAULT_COMPLETION_EVENT_KEYS } from '../generation-events.js'
import { ParallelGenerator } from '../parallel-generator.js'
import { ProviderRegistry } from '../providers/provider-registry.js'
import { ImageProvider } from '../providers/base-provider.js'
import { PromptSummarizer } from '../summarizer.js'

function createEventSource() {
    const listeners = new Map()
    return {
        on(eventType, handler) {
            if (!listeners.has(eventType)) {
                listeners.set(eventType, new Set())
            }
            listeners.get(eventType).add(handler)
        },
        off(eventType, handler) {
            listeners.get(eventType)?.delete(handler)
        },
        emit(eventType, payload) {
            listeners.get(eventType)?.forEach((handler) => { handler(payload) })
        },
        listenerCount(eventType) {
            return listeners.get(eventType)?.size || 0
        },
    }
}

class MockProvider extends ImageProvider {
    static providerName = 'mock'

    constructor(config = {}) {
        super(config)
        this.shouldFail = config.shouldFail || false
        this.failCode = config.failCode || null
        this.providerId = config.providerId || 'mock'
    }

    async generate(prompt, options = {}) {
        if (this.shouldFail) {
            const error = new Error('Mock provider failed')
            if (this.failCode) {
                error.code = this.failCode
            }
            throw error
        }
        return {
            imageUrl: `https://${this.providerId}.com/image?prompt=${encodeURIComponent(prompt)}`,
            metadata: { provider: this.providerId, prompt }
        }
    }

    async getModels() {
        return [{ id: `${this.providerId}-model`, name: `${this.providerId} Model` }]
    }
}

class SlowProvider extends ImageProvider {
    static providerName = 'slow'

    constructor(config = {}) {
        super(config)
        this.delay = config.delay || 100
    }

    async generate(prompt, options = {}) {
        await new Promise(resolve => setTimeout(resolve, this.delay))
        return {
            imageUrl: `https://slow.com/image?prompt=${encodeURIComponent(prompt)}`,
            metadata: { provider: 'slow', prompt }
        }
    }

    async getModels() {
        return [{ id: 'slow-model', name: 'Slow Model' }]
    }
}

describe('Integration Phase 1', () => {
    describe('GenerationDetector with Summarizer Mode', () => {
        let eventSource
        let eventTypes

        beforeEach(() => {
            eventSource = createEventSource()
            eventTypes = {
                MESSAGE_RECEIVED: 'message_received',
                SD_GENERATION_COMPLETE: 'sd_generation_complete',
                SUMMARIZER_PROMPT_READY: 'summarizer_prompt_ready',
            }
        })

        afterEach(() => {
            eventSource = null
        })

        it('should use summarizer event keys when summarizerEnabled is true', () => {
            const detector = new GenerationDetector(eventSource, eventTypes, {
                summarizerEnabled: true,
            })

            expect(eventSource.listenerCount(eventTypes.SUMMARIZER_PROMPT_READY)).toBe(1)
            expect(eventSource.listenerCount(eventTypes.SD_GENERATION_COMPLETE)).toBe(1)
            expect(eventSource.listenerCount(eventTypes.MESSAGE_RECEIVED)).toBe(0)

            detector.dispose()
        })

        it('should use default event keys when summarizerEnabled is false', () => {
            const detector = new GenerationDetector(eventSource, eventTypes, {
                summarizerEnabled: false,
            })

            expect(eventSource.listenerCount(eventTypes.MESSAGE_RECEIVED)).toBe(1)
            expect(eventSource.listenerCount(eventTypes.SD_GENERATION_COMPLETE)).toBe(1)
            expect(eventSource.listenerCount(eventTypes.SUMMARIZER_PROMPT_READY)).toBe(0)

            detector.dispose()
        })

        it('should emit summarizer prompt event when SUMMARIZER_PROMPT_READY is triggered', () => {
            const detector = new GenerationDetector(eventSource, eventTypes, {
                summarizerEnabled: true,
            })

            const summarizerCalls = []
            const completionCalls = []

            detector.onSummarizerPrompt((payload) => {
                summarizerCalls.push(payload)
            })

            detector.onComplete((payload) => {
                completionCalls.push(payload)
            })

            eventSource.emit(eventTypes.SUMMARIZER_PROMPT_READY, {
                prompt: 'A beautiful sunset over mountains',
                metadata: { model: 'gpt-4', provider: 'nanogpt' }
            })

            expect(summarizerCalls).toHaveLength(1)
            expect(summarizerCalls[0].type).toBe('SUMMARIZER_PROMPT_READY')
            expect(summarizerCalls[0].prompt).toBe('A beautiful sunset over mountains')
            expect(completionCalls).toHaveLength(1)

            detector.dispose()
        })
    })

    describe('ProviderRegistry with ParallelGenerator', () => {
        it('should use ProviderRegistry when available', async () => {
            const registry = new ProviderRegistry()
            const mockProvider = new MockProvider({ apiKey: 'test', baseUrl: 'https://test.com' })
            registry.register('mock', mockProvider, { priority: 1, enabled: true })

            const generator = new ParallelGenerator({
                concurrencyLimit: 2,
                providerRegistry: registry,
            })

            const results = await generator.run(['prompt1', 'prompt2'])

            expect(results).toHaveLength(2)
            expect(results[0].status).toBe('ok')
            expect(results[1].status).toBe('ok')
            expect(results[0].result).toContain('mock.com')
        })

        it('should fall back to callSdSlash when ProviderRegistry has no enabled providers', async () => {
            const registry = new ProviderRegistry()
            let callSdSlashCalled = false

            const generator = new ParallelGenerator({
                concurrencyLimit: 2,
                callSdSlash: async (prompt) => {
                    callSdSlashCalled = true
                    return { url: `sd://${prompt}` }
                },
                providerRegistry: registry,
            })

            const results = await generator.run(['prompt1'])

            expect(callSdSlashCalled).toBe(true)
            expect(results).toHaveLength(1)
            expect(results[0].status).toBe('ok')
        })

        it('should use ProviderRegistry over callSdSlash when both available', async () => {
            const registry = new ProviderRegistry()
            const mockProvider = new MockProvider({ apiKey: 'test', baseUrl: 'https://test.com' })
            registry.register('mock', mockProvider, { priority: 1, enabled: true })

            let callSdSlashCalled = false

            const generator = new ParallelGenerator({
                concurrencyLimit: 1,
                callSdSlash: async () => {
                    callSdSlashCalled = true
                    return { url: 'sd://fallback' }
                },
                providerRegistry: registry,
            })

            const results = await generator.run(['prompt1'])

            expect(results[0].status).toBe('ok')
            expect(results[0].result).toContain('mock.com')
            expect(callSdSlashCalled).toBe(false)
        })
    })

    describe('Provider Fallback Chain', () => {
        it('should try next provider when first fails', async () => {
            const registry = new ProviderRegistry()

            const failingProvider = new MockProvider({
                apiKey: 'test',
                baseUrl: 'https://test.com',
                providerId: 'failing',
                shouldFail: true
            })
            const workingProvider = new MockProvider({
                apiKey: 'test',
                baseUrl: 'https://working.com',
                providerId: 'working'
            })

            registry.register('failing', failingProvider, { priority: 1, enabled: true })
            registry.register('working', workingProvider, { priority: 2, enabled: true })

            const generator = new ParallelGenerator({
                concurrencyLimit: 1,
                providerRegistry: registry,
            })

            const results = await generator.run(['test prompt'])

            expect(results).toHaveLength(1)
            expect(results[0].status).toBe('ok')
            expect(results[0].result).toContain('working.com')
        })

        it('should fail when all providers fail', async () => {
            const registry = new ProviderRegistry()

            const failingProvider1 = new MockProvider({
                apiKey: 'test',
                baseUrl: 'https://test1.com',
                shouldFail: true
            })
            const failingProvider2 = new MockProvider({
                apiKey: 'test',
                baseUrl: 'https://test2.com',
                shouldFail: true
            })

            registry.register('failing1', failingProvider1, { priority: 1, enabled: true })
            registry.register('failing2', failingProvider2, { priority: 2, enabled: true })

            const generator = new ParallelGenerator({
                concurrencyLimit: 1,
                providerRegistry: registry,
            })

            const results = await generator.run(['test prompt'])

            expect(results).toHaveLength(1)
            expect(results[0].status).toBe('error')
            expect(results[0].error.message).toContain('All providers failed')
        })

        it('should respect provider priority order', async () => {
            const registry = new ProviderRegistry()

            const highPriorityProvider = new MockProvider({
                apiKey: 'test',
                baseUrl: 'https://high.com',
                providerId: 'high'
            })
            const lowPriorityProvider = new MockProvider({
                apiKey: 'test',
                baseUrl: 'https://low.com',
                providerId: 'low'
            })

            registry.register('low', lowPriorityProvider, { priority: 10, enabled: true })
            registry.register('high', highPriorityProvider, { priority: 1, enabled: true })

            const generator = new ParallelGenerator({
                concurrencyLimit: 1,
                providerRegistry: registry,
            })

            const results = await generator.run(['test prompt'])

            expect(results[0].status).toBe('ok')
            expect(results[0].result).toContain('high.com')
        })
    })

    describe('ParallelGenerator with Mixed Providers', () => {
        it('should handle multiple prompts with provider registry', async () => {
            const registry = new ProviderRegistry()
            const mockProvider = new MockProvider({ apiKey: 'test', baseUrl: 'https://test.com' })
            registry.register('mock', mockProvider, { priority: 1, enabled: true })

            const generator = new ParallelGenerator({
                concurrencyLimit: 3,
                providerRegistry: registry,
            })

            const prompts = ['prompt1', 'prompt2', 'prompt3', 'prompt4', 'prompt5']
            const results = await generator.run(prompts)

            expect(results).toHaveLength(5)
            expect(results.every(r => r.status === 'ok')).toBe(true)
        })

        it('should set provider registry after construction', async () => {
            const registry = new ProviderRegistry()
            const mockProvider = new MockProvider({ apiKey: 'test', baseUrl: 'https://test.com', providerId: 'test' })
            registry.register('test', mockProvider, { priority: 1, enabled: true })

            const generator = new ParallelGenerator({
                concurrencyLimit: 1,
            })

            generator.setProviderRegistry(registry)

            const results = await generator.run(['test prompt'])

            expect(results[0].status).toBe('ok')
            expect(results[0].result).toContain('test.com')
        })
    })

    describe('Summarizer Integration', () => {
        it('should create summarizer with valid config', () => {
            const config = {
                apiKey: 'test-key',
                provider: 'nanogpt',
                model: 'gpt-4',
                maxTokens: 500,
                temperature: 0.7,
            }

            const summarizer = new PromptSummarizer(config)

            expect(summarizer).toBeDefined()
            expect(summarizer.config.apiKey).toBe('test-key')
            expect(summarizer.config.provider).toBe('nanogpt')
            expect(summarizer.config.model).toBe('gpt-4')
        })

        it('should use default values for missing config', () => {
            const summarizer = new PromptSummarizer({ apiKey: 'test' })

            expect(summarizer.config.provider).toBe('nanogpt')
            expect(summarizer.config.model).toBe('gpt-4')
            expect(summarizer.config.maxTokens).toBe(500)
            expect(summarizer.config.temperature).toBe(0.7)
        })

        it('should generate prompts from chat context', async () => {
            const config = {
                apiKey: 'test-key',
                provider: 'nanogpt',
                model: 'gpt-4',
            }

            const summarizer = new PromptSummarizer(config)

            const chatContext = {
                messages: [
                    { role: 'user', content: 'Draw me a sunset', name: 'User' },
                    { role: 'assistant', content: 'I will create that for you', name: 'Assistant' }
                ],
                character: { name: 'Artist', description: 'An AI artist' }
            }

            const result = await summarizer.summarize(chatContext)

            expect(result).toBeDefined()
            expect(result.prompt).toBeDefined()
            expect(typeof result.prompt).toBe('string')
            expect(result.prompt.length).toBeGreaterThan(0)
            expect(result.metadata).toBeDefined()
            expect(result.metadata.provider).toBe('nanogpt')
            expect(result.metadata.model).toBe('gpt-4')
        })

        it('should respect maxContextMessages option', async () => {
            const config = {
                apiKey: 'test-key',
                provider: 'nanogpt',
                model: 'gpt-4',
            }

            const summarizer = new PromptSummarizer(config)

            const chatContext = {
                messages: [
                    { role: 'user', content: 'Message 1' },
                    { role: 'assistant', content: 'Response 1' },
                    { role: 'user', content: 'Message 2' },
                    { role: 'assistant', content: 'Response 2' },
                    { role: 'user', content: 'Message 3' },
                ]
            }

            const result = await summarizer.summarize(chatContext, { maxContextMessages: 2 })

            expect(result.metadata.contextMessagesUsed).toBe(2)
        })
    })

    describe('End-to-End Flow Scenarios', () => {
        it('should handle generation with provider registry and progress callbacks', async () => {
            const registry = new ProviderRegistry()
            const slowProvider = new SlowProvider({ apiKey: 'test', baseUrl: 'https://slow.com', delay: 10 })
            registry.register('slow', slowProvider, { priority: 1, enabled: true })

            const progressCalls = []

            const generator = new ParallelGenerator({
                concurrencyLimit: 2,
                providerRegistry: registry,
            })

            generator.onProgress((progress) => {
                progressCalls.push(progress)
            })

            const results = await generator.run(['prompt1', 'prompt2', 'prompt3'])

            expect(results).toHaveLength(3)
            expect(results.every(r => r.status === 'ok')).toBe(true)
            expect(progressCalls.length).toBeGreaterThan(0)
        })

        it('should maintain backward compatibility with callSdSlash only', async () => {
            const generator = new ParallelGenerator({
                concurrencyLimit: 2,
                callSdSlash: async (prompt) => {
                    return { url: `legacy://${prompt}` }
                },
            })

            const results = await generator.run(['prompt1', 'prompt2'])

            expect(results).toHaveLength(2)
            expect(results.every(r => r.status === 'ok')).toBe(true)
        })

        it('should handle abort with provider registry', async () => {
            const registry = new ProviderRegistry()
            const slowProvider = new SlowProvider({ apiKey: 'test', baseUrl: 'https://slow.com', delay: 100 })
            registry.register('slow', slowProvider, { priority: 1, enabled: true })

            const generator = new ParallelGenerator({
                concurrencyLimit: 2,
                providerRegistry: registry,
            })

            const runPromise = generator.run(['prompt1', 'prompt2', 'prompt3', 'prompt4'])

            await new Promise(resolve => setTimeout(resolve, 20))
            generator.abort()

            const results = await runPromise

            const abortedResults = results.filter(r => r.status === 'error' && r.error.message === 'aborted')
            expect(abortedResults.length).toBeGreaterThan(0)
        })
    })

    describe('Settings Integration', () => {
        it('should support providers array in settings', () => {
            const settings = {
                providers: [
                    {
                        id: 'provider_1',
                        type: 'nanogpt',
                        name: 'Test Provider',
                        enabled: true,
                        priority: 1,
                        config: {
                            apiKey: 'test-key',
                            baseUrl: 'https://nano-gpt.com/api/v1',
                            model: 'z-image-turbo'
                        }
                    }
                ],
                summarizer: {
                    enabled: true,
                    provider: 'nanogpt',
                    model: 'gpt-4',
                    apiKey: '',
                    maxTokens: 500,
                    temperature: 0.7,
                }
            }

            expect(settings.providers).toBeDefined()
            expect(Array.isArray(settings.providers)).toBe(true)
            expect(settings.summarizer).toBeDefined()
            expect(settings.summarizer.enabled).toBe(true)
        })

        it('should support disabled summarizer settings', () => {
            const settings = {
                summarizer: {
                    enabled: false,
                    provider: 'nanogpt',
                    model: 'gpt-4',
                }
            }

            expect(settings.summarizer.enabled).toBe(false)
        })
    })
})
