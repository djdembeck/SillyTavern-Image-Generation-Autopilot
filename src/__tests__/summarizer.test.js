import { describe, expect, it, beforeEach, afterEach, beforeAll } from 'bun:test'

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
            // Verify the last message (msg9) is in user prompt content
            expect(messagesSent[1].content).toContain('msg9')  // last of 5 messages (indices 5,6,7,8,9)
            // Verify all 5 messages (indices 5-9) are present - use newline to avoid substring matches
            expect(messagesSent[1].content).toContain('msg5\n')
            expect(messagesSent[1].content).toContain('msg6\n')
            expect(messagesSent[1].content).toContain('msg7\n')
            expect(messagesSent[1].content).toContain('msg8\n')
            // Verify older messages (indices 0-4) are NOT present
            expect(messagesSent[1].content).not.toContain('msg0\n')
            expect(messagesSent[1].content).not.toContain('msg1\n')
            expect(messagesSent[1].content).not.toContain('msg2\n')
            expect(messagesSent[1].content).not.toContain('msg3\n')
            expect(messagesSent[1].content).not.toContain('msg4\n')
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
            // Verify all 10 messages (indices 10-19) are present - use newline to avoid substring matches
            expect(messagesSent[1].content).toContain('msg10\n')
            expect(messagesSent[1].content).toContain('msg11\n')
            expect(messagesSent[1].content).toContain('msg12\n')
            expect(messagesSent[1].content).toContain('msg13\n')
            expect(messagesSent[1].content).toContain('msg14\n')
            expect(messagesSent[1].content).toContain('msg15\n')
            expect(messagesSent[1].content).toContain('msg16\n')
            expect(messagesSent[1].content).toContain('msg17\n')
            expect(messagesSent[1].content).toContain('msg18\n')
            // Verify older messages (indices 0-9) are NOT present
            expect(messagesSent[1].content).not.toContain('msg0\n')
            expect(messagesSent[1].content).not.toContain('msg1\n')
            expect(messagesSent[1].content).not.toContain('msg2\n')
            expect(messagesSent[1].content).not.toContain('msg3\n')
            expect(messagesSent[1].content).not.toContain('msg4\n')
            expect(messagesSent[1].content).not.toContain('msg5\n')
            expect(messagesSent[1].content).not.toContain('msg6\n')
            expect(messagesSent[1].content).not.toContain('msg7\n')
            expect(messagesSent[1].content).not.toContain('msg8\n')
            expect(messagesSent[1].content).not.toContain('msg9\n')
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

        it('uses MAX_TOKENS_UNLIMITED when maxTokens is 0', async () => {
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
            
            expect(optionsUsed.max_tokens).toBe(8000)
        })

        it('uses headroom multiplier when maxTokens is set', async () => {
            const { summarizeWithAI } = await import('../summarizer.js')
            
            let optionsUsed = {}
            const captureCompletion = async (messages, options) => {
                optionsUsed = options
                return mockChatCompletion(messages, options)
            }
            
            await summarizeWithAI({
                messages: [],
                messageDepth: 3,
                maxTokens: 500,
                callChatCompletion: captureCompletion
            })
            
            expect(optionsUsed.max_tokens).toBe(750)
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
        let originalSillyTavern

        beforeEach(() => {
            originalSillyTavern = globalThis.SillyTavern
        })

        afterEach(() => {
            if (originalSillyTavern === undefined) {
                delete globalThis.SillyTavern
            } else {
                globalThis.SillyTavern = originalSillyTavern
            }
        })

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
        })
    })
})

describe('getCharacterDescription', () => {
    let getCharacterDescription;

    beforeAll(async () => {
        const mod = await import('../summarizer.js');
        getCharacterDescription = mod.getCharacterDescription;
    });

    beforeEach(() => {
        delete globalThis.SillyTavern;
    });

    it('returns empty string for null charName', () => {
        expect(getCharacterDescription(null)).toBe('');
    });

    it('returns empty string for undefined charName', () => {
        expect(getCharacterDescription(undefined)).toBe('');
    });

    it('returns empty string for empty string charName', () => {
        expect(getCharacterDescription('')).toBe('');
    });

    it('returns empty string when SillyTavern context is unavailable', () => {
        expect(getCharacterDescription('Alice')).toBe('');
    });

    it('returns empty string when characters array is empty', () => {
        globalThis.SillyTavern = {
            getContext: () => ({ characters: [] })
        }
        
        expect(getCharacterDescription('Alice')).toBe('')
    })

    it('returns description from array format characters', () => {
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

    it('returns description from object format characters', () => {
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

    it('handles case-insensitive lookup in object format', () => {
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

    it('handles case-insensitive lookup in array format', () => {
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

    it('returns empty string for non-existent character', () => {
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

    it('returns empty string when character has no description', () => {
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

    it('trims whitespace from description', () => {
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

    it('handles character name with displayName field', () => {
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