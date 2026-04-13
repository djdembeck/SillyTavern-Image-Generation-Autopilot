import { describe, expect, it, beforeEach } from 'bun:test'

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
            
            // Messages are now embedded in userPrompt, not as separate messages
            expect(messagesSent).toHaveLength(2)  // system + user prompt
            expect(messagesSent[0].role).toBe('system')
            expect(messagesSent[1].role).toBe('user')
            // Verify the last message (msg3) is in user prompt content
            expect(messagesSent[1].content).toContain('msg3')
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
            
            // Messages are now embedded in userPrompt, not as separate messages
            expect(messagesSent).toHaveLength(2)  // system + user prompt
            expect(messagesSent[0].role).toBe('system')
            expect(messagesSent[1].role).toBe('user')
            // Verify conversation text is in user prompt content
            expect(messagesSent[1].content).toContain('msg9')  // last of 5 messages (indices 5,6,7,8,9)
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
            
            // Messages are now embedded in userPrompt, not as separate messages
            expect(messagesSent).toHaveLength(2)  // system + user prompt
            expect(messagesSent[0].role).toBe('system')
            expect(messagesSent[1].role).toBe('user')
            // Verify 10 messages are in user prompt content (max after normalization)
            expect(messagesSent[1].content).toContain('msg19')  // last of 10 messages (indices 10-19)
        })
    })

    describe('handles API errors gracefully', () => {
        it('throws error when API call fails', async () => {
            const { summarizeWithAI } = await import('../summarizer.js')
            
            const failingCompletion = async () => {
                throw new Error('API Error: Rate limit exceeded')
            }
            
            await expect(summarizeWithAI({
                messages: [],
                messageDepth: 3,
                callChatCompletion: failingCompletion
            })).rejects.toThrow('Image summarization failed')
        })

        it('throws error when API returns invalid response', async () => {
            const { summarizeWithAI } = await import('../summarizer.js')
            
            const invalidCompletion = async () => ({
                choices: []
            })
            
            await expect(summarizeWithAI({
                messages: [],
                messageDepth: 3,
                callChatCompletion: invalidCompletion
            })).rejects.toThrow('Image summarization failed')
        })

        it('throws error with descriptive message when AI returns empty response', async () => {
            const { summarizeWithAI } = await import('../summarizer.js')
            
            const emptyCompletion = async () => ({
                choices: [{ message: { content: '' } }]
            })
            
            await expect(summarizeWithAI({
                messages: [],
                messageDepth: 3,
                callChatCompletion: emptyCompletion
            })).rejects.toThrow('empty or invalid')
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
            
            expect(optionsUsed.max_tokens).toBeUndefined()
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

    describe('character description integration', () => {
        it('includes character description in system prompt when character exists', async () => {
            const { summarizeWithAI } = await import('../summarizer.js')
            
            let systemMessageContent = ''
            const captureCompletion = async (messages, options) => {
                // Capture the system message content instead of options.systemPrompt
                const systemMessage = messages.find(m => m.role === 'system')
                systemMessageContent = systemMessage?.content || ''
                return mockChatCompletion(messages, options)
            }
            
            globalThis.SillyTavern = {
                getContext: () => ({
                    characters: [
                        {
                            name: 'Alice',
                            data: {
                                name: 'Alice',
                                description: 'A brave adventurer with red hair and green eyes'
                            }
                        }
                    ]
                })
            }
            
            await summarizeWithAI({
                messages: [],
                messageDepth: 3,
                callChatCompletion: captureCompletion,
                charName: 'Alice'
            })
            
            expect(systemMessageContent).toContain('A brave adventurer with red hair and green eyes')
            
            delete globalThis.SillyTavern
        })
    })
})

describe('getCharacterDescription', () => {
    beforeEach(() => {
        delete globalThis.SillyTavern
    })

    it('returns empty string for null charName', async () => {
        const { getCharacterDescription } = await import('../summarizer.js')
        expect(getCharacterDescription(null)).toBe('')
    })

    it('returns empty string for undefined charName', async () => {
        const { getCharacterDescription } = await import('../summarizer.js')
        expect(getCharacterDescription(undefined)).toBe('')
    })

    it('returns empty string for empty string charName', async () => {
        const { getCharacterDescription } = await import('../summarizer.js')
        expect(getCharacterDescription('')).toBe('')
    })

    it('returns empty string when SillyTavern context is unavailable', async () => {
        const { getCharacterDescription } = await import('../summarizer.js')
        expect(getCharacterDescription('Alice')).toBe('')
    })

    it('returns empty string when characters array is empty', async () => {
        const { getCharacterDescription } = await import('../summarizer.js')
        
        globalThis.SillyTavern = {
            getContext: () => ({ characters: [] })
        }
        
        expect(getCharacterDescription('Alice')).toBe('')
    })

    it('returns description from array format characters', async () => {
        const { getCharacterDescription } = await import('../summarizer.js')
        
        globalThis.SillyTavern = {
            getContext: () => ({
                characters: [
                    {
                        name: 'Alice',
                        data: {
                            name: 'Alice',
                            description: 'A brave adventurer with red hair'
                        }
                    }
                ]
            })
        }
        
        expect(getCharacterDescription('Alice')).toBe('A brave adventurer with red hair')
    })

    it('returns description from object format characters', async () => {
        const { getCharacterDescription } = await import('../summarizer.js')
        
        globalThis.SillyTavern = {
            getContext: () => ({
                characters: {
                    'Alice': {
                        description: 'A brave adventurer with red hair'
                    }
                }
            })
        }
        
        expect(getCharacterDescription('Alice')).toBe('A brave adventurer with red hair')
    })

    it('handles case-insensitive lookup in object format', async () => {
        const { getCharacterDescription } = await import('../summarizer.js')
        
        globalThis.SillyTavern = {
            getContext: () => ({
                characters: {
                    'alice': {
                        description: 'A brave adventurer'
                    }
                }
            })
        }
        
        expect(getCharacterDescription('Alice')).toBe('A brave adventurer')
    })

    it('handles case-insensitive lookup in array format', async () => {
        const { getCharacterDescription } = await import('../summarizer.js')
        
        globalThis.SillyTavern = {
            getContext: () => ({
                characters: [
                    {
                        name: 'alice',
                        data: {
                            name: 'alice',
                            description: 'A brave adventurer'
                        }
                    }
                ]
            })
        }
        
        expect(getCharacterDescription('Alice')).toBe('A brave adventurer')
    })

    it('returns empty string for non-existent character', async () => {
        const { getCharacterDescription } = await import('../summarizer.js')
        
        globalThis.SillyTavern = {
            getContext: () => ({
                characters: [
                    {
                        name: 'Bob',
                        data: {
                            name: 'Bob',
                            description: 'A friendly companion'
                        }
                    }
                ]
            })
        }
        
        expect(getCharacterDescription('Alice')).toBe('')
    })

    it('returns empty string when character has no description', async () => {
        const { getCharacterDescription } = await import('../summarizer.js')
        
        globalThis.SillyTavern = {
            getContext: () => ({
                characters: [
                    {
                        name: 'Alice',
                        data: {
                            name: 'Alice'
                        }
                    }
                ]
            })
        }
        
        expect(getCharacterDescription('Alice')).toBe('')
    })

    it('trims whitespace from description', async () => {
        const { getCharacterDescription } = await import('../summarizer.js')
        
        globalThis.SillyTavern = {
            getContext: () => ({
                characters: [
                    {
                        name: 'Alice',
                        data: {
                            name: 'Alice',
                            description: '  A brave adventurer  '
                        }
                    }
                ]
            })
        }
        
        expect(getCharacterDescription('Alice')).toBe('A brave adventurer')
    })

    it('handles character name with displayName field', async () => {
        const { getCharacterDescription } = await import('../summarizer.js')
        
        globalThis.SillyTavern = {
            getContext: () => ({
                characters: [
                    {
                        data: {
                            displayName: 'Alice',
                            description: 'A brave adventurer'
                        }
                    }
                ]
            })
        }
        
        expect(getCharacterDescription('Alice')).toBe('A brave adventurer')
    })
})