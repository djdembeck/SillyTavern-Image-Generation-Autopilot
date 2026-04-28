import { describe, expect, it } from 'bun:test'

// Mock the SillyTavern API
const mockChatCompletion = async (messages, options) => {
    // Return mock response based on test expectations
    return {
        choices: [{
            message: {
                content: `Characters:
- Alice: The protagonist
- Bob: The companion

Scene:
A mysterious forest with ancient trees.`
            }
        }]
    }
}

// Mock window global
globalThis.window = {
    extensionSettings: {
        autoMultiImageSwipes: {
            debugMode: false
        }
    }
}

describe('summarizeWithAI', () => {
    describe('returns structured output', () => {
        it('includes Characters: section in output', async () => {
            const { summarizeWithAI } = await import('../summarizer.js')
            
            const result = await summarizeWithAI({
                messages: [],
                messageDepth: 3,
                callChatCompletion: mockChatCompletion
            })
            
            expect(result).toContain('Characters:')
        })

        it('includes Scene: section in output', async () => {
            const { summarizeWithAI } = await import('../summarizer.js')
            
            const result = await summarizeWithAI({
                messages: [],
                messageDepth: 3,
                callChatCompletion: mockChatCompletion
            })
            
            expect(result).toContain('Scene:')
        })
    })

    describe('respects message depth setting', () => {
        it('uses 1 message when depth is 1', async () => {
            const { summarizeWithAI } = await import('../summarizer.js')
            
            let messagesSent = []
            const captureCompletion = async (messages, options) => {
                messagesSent = messages
                return mockChatCompletion(messages, options)
            }
            
            await summarizeWithAI({
                messages: [{ role: 'user', content: 'msg1' }, { role: 'assistant', content: 'msg2' }, { role: 'user', content: 'msg3' }],
                messageDepth: 1,
                callChatCompletion: captureCompletion
            })
            
            expect(messagesSent).toHaveLength(1)
        })

        it('uses 5 messages when depth is 5', async () => {
            const { summarizeWithAI } = await import('../summarizer.js')
            
            let messagesSent = []
            const captureCompletion = async (messages, options) => {
                messagesSent = messages
                return mockChatCompletion(messages, options)
            }
            
            const allMessages = Array.from({ length: 10 }, (_, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', content: `msg${i}` }))
            
            await summarizeWithAI({
                messages: allMessages,
                messageDepth: 5,
                callChatCompletion: captureCompletion
            })
            
            expect(messagesSent).toHaveLength(5)
        })

        it('uses maximum 10 messages when depth exceeds 10', async () => {
            const { summarizeWithAI } = await import('../summarizer.js')
            
            let messagesSent = []
            const captureCompletion = async (messages, options) => {
                messagesSent = messages
                return mockChatCompletion(messages, options)
            }
            
            const allMessages = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', content: `msg${i}` }))
            
            await summarizeWithAI({
                messages: allMessages,
                messageDepth: 15,
                callChatCompletion: captureCompletion
            })
            
            expect(messagesSent).toHaveLength(10)
        })
    })

    describe('handles API errors gracefully', () => {
        it('throws error when API call fails', async () => {
            const { summarizeWithAI } = await import('../summarizer.js')
            
            const failingCompletion = async () => {
                throw new Error('API Error: Rate limit exceeded')
            }
            
            const result = await summarizeWithAI({
                messages: [],
                messageDepth: 3,
                callChatCompletion: failingCompletion
            })
            
            expect(result).toContain('Error')
        })

        it('returns error message when API returns invalid response', async () => {
            const { summarizeWithAI } = await import('../summarizer.js')
            
            const invalidCompletion = async () => ({
                choices: []
            })
            
            const result = await summarizeWithAI({
                messages: [],
                messageDepth: 3,
                callChatCompletion: invalidCompletion
            })
            
            expect(result).toContain('Error')
        })
    })

    describe('uses correct API parameters', () => {
        it('uses temperature of 0.3', async () => {
            const { summarizeWithAI } = await import('../summarizer.js')
            
            let optionsUsed = {}
            const captureCompletion = async (messages, options) => {
                optionsUsed = options
                return mockChatCompletion(messages, options)
            }
            
            await summarizeWithAI({
                messages: [],
                messageDepth: 3,
                callChatCompletion: captureCompletion
            })
            
            expect(optionsUsed.temperature).toBe(0.3)
        })

        it('uses max_tokens of 2500', async () => {
            const { summarizeWithAI } = await import('../summarizer.js')
            
            let optionsUsed = {}
            const captureCompletion = async (messages, options) => {
                optionsUsed = options
                return mockChatCompletion(messages, options)
            }
            
            await summarizeWithAI({
                messages: [],
                messageDepth: 3,
                callChatCompletion: captureCompletion
            })
            
            expect(optionsUsed.max_tokens).toBe(2500)
        })
    })

    describe('formats output correctly', () => {
        it('includes line breaks in output', async () => {
            const { summarizeWithAI } = await import('../summarizer.js')
            
            const result = await summarizeWithAI({
                messages: [],
                messageDepth: 3,
                callChatCompletion: mockChatCompletion
            })
            
            expect(result).toMatch(/\n/)
        })

        it('includes bullet points for characters', async () => {
            const { summarizeWithAI } = await import('../summarizer.js')
            
            const result = await summarizeWithAI({
                messages: [],
                messageDepth: 3,
                callChatCompletion: mockChatCompletion
            })
            
            expect(result).toMatch(/^-\s/m)
        })
    })

    describe('character description (placeholder for Task 8)', () => {
        it('includes character descriptions when provided', async () => {
            const { summarizeWithAI } = await import('../summarizer.js')
            
            // This test is a placeholder - will be implemented in Task 8
            const result = await summarizeWithAI({
                messages: [],
                messageDepth: 3,
                callChatCompletion: mockChatCompletion,
                characterDescriptions: {
                    'Alice': 'A brave adventurer with red hair'
                }
            })
            
            expect(result).toContain('Alice')
        })
    })
})