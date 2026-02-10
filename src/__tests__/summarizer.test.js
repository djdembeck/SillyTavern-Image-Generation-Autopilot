/**
 * PromptSummarizer Tests - RED Phase
 * Test-driven development: Write failing tests before implementation
 *
 * The PromptSummarizer converts chat context into image generation prompts.
 * This is an alternative to <pic> tag detection.
 */

import { describe, expect, it, beforeEach } from 'bun:test'
import { PromptSummarizer } from '../summarizer.js'

describe('PromptSummarizer Interface (RED Phase)', () => {
  describe('Class Export and Instantiation', () => {
    it('should export PromptSummarizer class', () => {
      expect(PromptSummarizer).toBeDefined()
      expect(typeof PromptSummarizer).toBe('function')
    })

    it('should instantiate with config object', () => {
      const config = { apiKey: 'test-key', provider: 'nanogpt' }
      const summarizer = new PromptSummarizer(config)
      expect(summarizer).toBeInstanceOf(PromptSummarizer)
    })

    it('should instantiate without config', () => {
      const summarizer = new PromptSummarizer()
      expect(summarizer).toBeInstanceOf(PromptSummarizer)
    })

    it('should store config in instance', () => {
      const config = {
        apiKey: 'test-key',
        provider: 'nanogpt',
        model: 'gpt-4',
        maxTokens: 500,
      }
      const summarizer = new PromptSummarizer(config)
      expect(summarizer.config).toEqual(config)
    })
  })

  describe('summarize() Method', () => {
    let summarizer

    beforeEach(() => {
      summarizer = new PromptSummarizer({ apiKey: 'test-key' })
    })

    it('should have summarize method', () => {
      expect(typeof summarizer.summarize).toBe('function')
    })

    it('should return a Promise when called', () => {
      const chatContext = { messages: [] }
      const result = summarizer.summarize(chatContext)
      expect(result).toBeInstanceOf(Promise)
    })

    it('should accept chatContext as first argument', async () => {
      const chatContext = {
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
        ],
      }
      const result = await summarizer.summarize(chatContext)
      expect(typeof result).toBe('object')
    })

    it('should accept options as second argument', async () => {
      const chatContext = { messages: [] }
      const options = { maxTokens: 200, temperature: 0.7 }
      const result = await summarizer.summarize(chatContext, options)
      expect(typeof result).toBe('object')
    })

    it('should return object with prompt property', async () => {
      const chatContext = {
        messages: [
          { role: 'user', content: 'Describe a sunset' },
          { role: 'assistant', content: 'The sun sets over the ocean...' },
        ],
      }
      const result = await summarizer.summarize(chatContext)
      expect(result).toHaveProperty('prompt')
      expect(typeof result.prompt).toBe('string')
    })

    it('should return object with metadata property', async () => {
      const chatContext = { messages: [] }
      const result = await summarizer.summarize(chatContext)
      expect(result).toHaveProperty('metadata')
      expect(typeof result.metadata).toBe('object')
    })

    it('should generate prompt based on chat context', async () => {
      const chatContext = {
        messages: [
          { role: 'user', content: 'Describe a mountain landscape' },
          {
            role: 'assistant',
            content: 'Snow-capped peaks rise above the clouds...',
          },
        ],
      }
      const result = await summarizer.summarize(chatContext)
      expect(result.prompt.length).toBeGreaterThan(0)
    })

    it('should throw error for invalid chatContext', async () => {
      await expect(summarizer.summarize(null)).rejects.toThrow()
      await expect(summarizer.summarize(undefined)).rejects.toThrow()
      await expect(summarizer.summarize('string')).rejects.toThrow()
    })

    it('should throw error when API call fails', async () => {
      const badSummarizer = new PromptSummarizer({ apiKey: 'invalid-key' })
      const chatContext = { messages: [{ role: 'user', content: 'Test' }] }
      await expect(badSummarizer.summarize(chatContext)).rejects.toThrow()
    })
  })

  describe('System Prompt Template', () => {
    let summarizer

    beforeEach(() => {
      summarizer = new PromptSummarizer({ apiKey: 'test-key' })
    })

    it('should have getDefaultSystemPrompt method', () => {
      expect(typeof summarizer.getDefaultSystemPrompt).toBe('function')
    })

    it('should return default system prompt string', () => {
      const prompt = summarizer.getDefaultSystemPrompt()
      expect(typeof prompt).toBe('string')
      expect(prompt.length).toBeGreaterThan(0)
    })

    it('should have setSystemPrompt method', () => {
      expect(typeof summarizer.setSystemPrompt).toBe('function')
    })

    it('should set custom system prompt template', () => {
      const customTemplate =
        'You are an image prompt generator. Create prompts from chat context.'
      summarizer.setSystemPrompt(customTemplate)
      expect(summarizer.systemPrompt).toBe(customTemplate)
    })

    it('should use custom system prompt in summarize', async () => {
      const customTemplate = 'Custom template: {{chatContext}}'
      summarizer.setSystemPrompt(customTemplate)

      const chatContext = {
        messages: [{ role: 'user', content: 'A red rose' }],
      }
      const result = await summarizer.summarize(chatContext)
      expect(result.prompt).toBeDefined()
    })

    it('should throw error for invalid system prompt', () => {
      expect(() => summarizer.setSystemPrompt(null)).toThrow()
      expect(() => summarizer.setSystemPrompt(undefined)).toThrow()
      expect(() => summarizer.setSystemPrompt(123)).toThrow()
      expect(() => summarizer.setSystemPrompt('')).toThrow()
    })
  })

  describe('Chat Context Handling', () => {
    let summarizer

    beforeEach(() => {
      summarizer = new PromptSummarizer({ apiKey: 'test-key' })
    })

    it('should handle empty messages array', async () => {
      const chatContext = { messages: [] }
      const result = await summarizer.summarize(chatContext)
      expect(result).toHaveProperty('prompt')
      expect(typeof result.prompt).toBe('string')
    })

    it('should handle messages with roles', async () => {
      const chatContext = {
        messages: [
          { role: 'system', content: 'You are helpful' },
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi!' },
        ],
      }
      const result = await summarizer.summarize(chatContext)
      expect(result.prompt).toBeDefined()
    })

    it('should handle messages with names', async () => {
      const chatContext = {
        messages: [
          { role: 'user', name: 'Alice', content: 'Hi' },
          { role: 'assistant', name: 'Bob', content: 'Hello!' },
        ],
      }
      const result = await summarizer.summarize(chatContext)
      expect(result.prompt).toBeDefined()
    })

    it('should respect maxContextMessages option', async () => {
      const chatContext = {
        messages: Array(20)
          .fill(null)
          .map((_, i) => ({
            role: i % 2 === 0 ? 'user' : 'assistant',
            content: `Message ${i}`,
          })),
      }
      const options = { maxContextMessages: 5 }
      const result = await summarizer.summarize(chatContext, options)
      expect(result.metadata).toHaveProperty('contextMessagesUsed')
      expect(result.metadata.contextMessagesUsed).toBeLessThanOrEqual(5)
    })

    it('should include character info when provided', async () => {
      const chatContext = {
        messages: [{ role: 'user', content: 'Draw me' }],
        character: {
          name: 'TestCharacter',
          description: 'A brave warrior',
        },
      }
      const result = await summarizer.summarize(chatContext)
      expect(result.prompt).toBeDefined()
    })
  })

  describe('Error Handling', () => {
    it('should throw error for missing API key', async () => {
      const summarizer = new PromptSummarizer({})
      const chatContext = { messages: [] }
      await expect(summarizer.summarize(chatContext)).rejects.toThrow(
        'API key is required'
      )
    })

    it('should throw error for network failure', async () => {
      const summarizer = new PromptSummarizer({
        apiKey: 'test-key',
        baseUrl: 'https://invalid-url-that-does-not-exist.com',
      })
      const chatContext = { messages: [{ role: 'user', content: 'Test' }] }
      await expect(summarizer.summarize(chatContext)).rejects.toThrow()
    })

    it('should throw error for rate limiting', async () => {
      const summarizer = new PromptSummarizer({ apiKey: 'rate-limited-key' })
      const chatContext = { messages: [{ role: 'user', content: 'Test' }] }
      await expect(summarizer.summarize(chatContext)).rejects.toThrow()
    })

    it('should include error details in thrown error', async () => {
      const summarizer = new PromptSummarizer({ apiKey: 'invalid-key' })
      const chatContext = { messages: [{ role: 'user', content: 'test' }] }
      await expect(summarizer.summarize(chatContext)).rejects.toThrow()
    })
  })

  describe('Static Properties', () => {
    it('should have MODULE_NAME static property', () => {
      expect(PromptSummarizer.MODULE_NAME).toBeDefined()
      expect(typeof PromptSummarizer.MODULE_NAME).toBe('string')
      expect(PromptSummarizer.MODULE_NAME).toBe('PromptSummarizer')
    })

    it('should have defaultConfig static property', () => {
      expect(PromptSummarizer.defaultConfig).toBeDefined()
      expect(typeof PromptSummarizer.defaultConfig).toBe('object')
    })

    it('should have supportedProviders static property', () => {
      expect(PromptSummarizer.supportedProviders).toBeDefined()
      expect(Array.isArray(PromptSummarizer.supportedProviders)).toBe(true)
      expect(PromptSummarizer.supportedProviders.length).toBeGreaterThan(0)
    })
  })

  describe('Configuration Options', () => {
    it('should accept provider option', () => {
      const summarizer = new PromptSummarizer({
        apiKey: 'test-key',
        provider: 'nanogpt',
      })
      expect(summarizer.config.provider).toBe('nanogpt')
    })

    it('should accept model option', () => {
      const summarizer = new PromptSummarizer({
        apiKey: 'test-key',
        model: 'gpt-4',
      })
      expect(summarizer.config.model).toBe('gpt-4')
    })

    it('should accept maxTokens option', () => {
      const summarizer = new PromptSummarizer({
        apiKey: 'test-key',
        maxTokens: 300,
      })
      expect(summarizer.config.maxTokens).toBe(300)
    })

    it('should accept temperature option', () => {
      const summarizer = new PromptSummarizer({
        apiKey: 'test-key',
        temperature: 0.5,
      })
      expect(summarizer.config.temperature).toBe(0.5)
    })

    it('should use default values for missing options', () => {
      const summarizer = new PromptSummarizer({ apiKey: 'test-key' })
      expect(summarizer.config.maxTokens).toBeDefined()
      expect(summarizer.config.temperature).toBeDefined()
    })
  })

  describe('Result Metadata', () => {
    let summarizer

    beforeEach(() => {
      summarizer = new PromptSummarizer({ apiKey: 'test-key' })
    })

    it('should include timestamp in metadata', async () => {
      const chatContext = { messages: [] }
      const result = await summarizer.summarize(chatContext)
      expect(result.metadata).toHaveProperty('timestamp')
      expect(typeof result.metadata.timestamp).toBe('number')
    })

    it('should include model used in metadata', async () => {
      const chatContext = { messages: [] }
      const result = await summarizer.summarize(chatContext)
      expect(result.metadata).toHaveProperty('model')
      expect(typeof result.metadata.model).toBe('string')
    })

    it('should include provider in metadata', async () => {
      const chatContext = { messages: [] }
      const result = await summarizer.summarize(chatContext)
      expect(result.metadata).toHaveProperty('provider')
      expect(typeof result.metadata.provider).toBe('string')
    })

    it('should include tokens used in metadata', async () => {
      const chatContext = { messages: [] }
      const result = await summarizer.summarize(chatContext)
      expect(result.metadata).toHaveProperty('tokensUsed')
      expect(typeof result.metadata.tokensUsed).toBe('number')
    })
  })
})
