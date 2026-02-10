import { describe, expect, it } from 'bun:test'
import { ContextDepthManager } from '../context-depth.js'

describe('ContextDepthManager', () => {
    it('initializes with default depth of 5', () => {
        const manager = new ContextDepthManager()

        expect(manager.defaultDepth).toBe(5)
    })

    it('accepts custom default depth in constructor', () => {
        const manager = new ContextDepthManager({ defaultDepth: 8 })

        expect(manager.defaultDepth).toBe(8)
    })

    it('clamps depth to minimum of 1', () => {
        const manager = new ContextDepthManager({ defaultDepth: 0 })

        expect(manager.defaultDepth).toBe(1)
    })

    it('clamps depth to maximum of 10', () => {
        const manager = new ContextDepthManager({ defaultDepth: 15 })

        expect(manager.defaultDepth).toBe(10)
    })

    describe('getContextMessages', () => {
        it('returns empty array for empty chat', () => {
            const manager = new ContextDepthManager()
            const chat = []

            const result = manager.getContextMessages(chat, 5)

            expect(result).toEqual([])
        })

        it('returns last N messages from chat', () => {
            const manager = new ContextDepthManager()
            const chat = [
                { id: 1, name: 'User', mes: 'Hello' },
                { id: 2, name: 'Character', mes: 'Hi there' },
                { id: 3, name: 'User', mes: 'How are you?' },
                { id: 4, name: 'Character', mes: 'I am fine' },
                { id: 5, name: 'User', mes: 'Good to hear' },
            ]

            const result = manager.getContextMessages(chat, 3)

            expect(result).toHaveLength(3)
            expect(result[0].id).toBe(3)
            expect(result[1].id).toBe(4)
            expect(result[2].id).toBe(5)
        })

        it('uses default depth when depth not specified', () => {
            const manager = new ContextDepthManager({ defaultDepth: 2 })
            const chat = [
                { id: 1, name: 'User', mes: 'Hello' },
                { id: 2, name: 'Character', mes: 'Hi' },
                { id: 3, name: 'User', mes: 'Bye' },
            ]

            const result = manager.getContextMessages(chat)

            expect(result).toHaveLength(2)
            expect(result[0].id).toBe(2)
            expect(result[1].id).toBe(3)
        })

        it('returns all messages if chat has fewer than depth', () => {
            const manager = new ContextDepthManager()
            const chat = [
                { id: 1, name: 'User', mes: 'Hello' },
                { id: 2, name: 'Character', mes: 'Hi' },
            ]

            const result = manager.getContextMessages(chat, 5)

            expect(result).toHaveLength(2)
        })

        it('respects depth parameter over default', () => {
            const manager = new ContextDepthManager({ defaultDepth: 5 })
            const chat = [
                { id: 1, name: 'User', mes: '1' },
                { id: 2, name: 'Character', mes: '2' },
                { id: 3, name: 'User', mes: '3' },
            ]

            const result = manager.getContextMessages(chat, 2)

            expect(result).toHaveLength(2)
        })

        it('returns all messages when provided depth is out of range', () => {
            const manager = new ContextDepthManager()
            const chat = [
                { id: 1, name: 'User', mes: '1' },
                { id: 2, name: 'Character', mes: '2' },
                { id: 3, name: 'User', mes: '3' },
            ]

            const tooLow = manager.getContextMessages(chat, 0)
            const tooHigh = manager.getContextMessages(chat, 20)

            expect(tooLow).toHaveLength(3) // Uses min 1, but returns all available
            expect(tooHigh).toHaveLength(3) // Uses max 10, but returns all available
        })

        it('returns messages in chronological order', () => {
            const manager = new ContextDepthManager()
            const chat = [
                { id: 1, name: 'User', mes: 'First' },
                { id: 2, name: 'Character', mes: 'Second' },
                { id: 3, name: 'User', mes: 'Third' },
            ]

            const result = manager.getContextMessages(chat, 2)

            expect(result[0].mes).toBe('Second')
            expect(result[1].mes).toBe('Third')
        })

        it('filters out messages without mes property', () => {
            const manager = new ContextDepthManager()
            const chat = [
                { id: 1, name: 'User', mes: 'Hello' },
                { id: 2, name: 'Character' }, // Missing mes
                { id: 3, name: 'User', mes: 'How are you?' },
            ]

            const result = manager.getContextMessages(chat, 5)

            expect(result).toHaveLength(2)
            expect(result[0].id).toBe(1)
            expect(result[1].id).toBe(3)
        })

        it('filters out messages with empty mes', () => {
            const manager = new ContextDepthManager()
            const chat = [
                { id: 1, name: 'User', mes: 'Hello' },
                { id: 2, name: 'Character', mes: '' },
                { id: 3, name: 'User', mes: '   ' },
                { id: 4, name: 'Character', mes: 'Goodbye' },
            ]

            const result = manager.getContextMessages(chat, 5)

            expect(result).toHaveLength(2)
            expect(result[0].id).toBe(1)
            expect(result[1].id).toBe(4)
        })

        it('handles chat as null', () => {
            const manager = new ContextDepthManager()

            const result = manager.getContextMessages(null, 5)

            expect(result).toEqual([])
        })

        it('handles chat as undefined', () => {
            const manager = new ContextDepthManager()

            const result = manager.getContextMessages(undefined, 5)

            expect(result).toEqual([])
        })

        it('returns new array without mutating original', () => {
            const manager = new ContextDepthManager()
            const chat = [
                { id: 1, name: 'User', mes: 'Hello' },
                { id: 2, name: 'Character', mes: 'Hi' },
            ]

            const result = manager.getContextMessages(chat, 1)

            expect(result).not.toBe(chat)
            expect(chat).toHaveLength(2) // Original unchanged
        })
    })

    describe('formatMessageForContext', () => {
        it('formats message with name and mes', () => {
            const manager = new ContextDepthManager()
            const message = { id: 1, name: 'User', mes: 'Hello there' }

            const result = manager.formatMessageForContext(message)

            expect(result).toContain('User')
            expect(result).toContain('Hello there')
        })

        it('formats character message', () => {
            const manager = new ContextDepthManager()
            const message = { id: 2, name: 'Alice', mes: 'Nice to meet you!' }

            const result = manager.formatMessageForContext(message)

            expect(result).toContain('Alice')
            expect(result).toContain('Nice to meet you!')
        })

        it('strips HTML tags from message content', () => {
            const manager = new ContextDepthManager()
            const message = {
                id: 1,
                name: 'User',
                mes: '<div>Hello <em>world</em></div>',
            }

            const result = manager.formatMessageForContext(message)

            expect(result).toContain('Hello world')
            expect(result).not.toContain('<div>')
            expect(result).not.toContain('<em>')
        })

        it('handles missing name gracefully', () => {
            const manager = new ContextDepthManager()
            const message = { id: 1, mes: 'Hello' }

            const result = manager.formatMessageForContext(message)

            expect(result).toContain('Hello')
        })

        it('handles missing mes gracefully', () => {
            const manager = new ContextDepthManager()
            const message = { id: 1, name: 'User' }

            const result = manager.formatMessageForContext(message)

            expect(result).toBe('')
        })

        it('trims whitespace from formatted result', () => {
            const manager = new ContextDepthManager()
            const message = { id: 1, name: 'User  ', mes: '  Hello  ' }

            const result = manager.formatMessageForContext(message)

            expect(result.trim()).toBe(result)
        })

        it('collapses multiple consecutive spaces', () => {
            const manager = new ContextDepthManager()
            const message = { id: 1, name: 'User', mes: 'Hello    world' }

            const result = manager.formatMessageForContext(message)

            expect(result).not.toContain('    ')
        })

        it('returns empty string for null message', () => {
            const manager = new ContextDepthManager()

            const result = manager.formatMessageForContext(null)

            expect(result).toBe('')
        })

        it('returns empty string for undefined message', () => {
            const manager = new ContextDepthManager()

            const result = manager.formatMessageForContext(undefined)

            expect(result).toBe('')
        })

        it('returns empty string for non-object input', () => {
            const manager = new ContextDepthManager()

            expect(manager.formatMessageForContext('string')).toBe('')
            expect(manager.formatMessageForContext(123)).toBe('')
            expect(manager.formatMessageForContext([])).toBe('')
        })
    })

    describe('formatContextForPrompt', () => {
        it('combines multiple messages into context string', () => {
            const manager = new ContextDepthManager()
            const messages = [
                { id: 1, name: 'User', mes: 'Hello' },
                { id: 2, name: 'Character', mes: 'Hi there' },
            ]

            const result = manager.formatContextForPrompt(messages)

            expect(result).toContain('User')
            expect(result).toContain('Hello')
            expect(result).toContain('Character')
            expect(result).toContain('Hi there')
        })

        it('separates messages with delimiter', () => {
            const manager = new ContextDepthManager()
            const messages = [
                { id: 1, name: 'User', mes: 'Hello' },
                { id: 2, name: 'Character', mes: 'Hi' },
            ]

            const result = manager.formatContextForPrompt(messages)

            // Should have a separator between messages
            expect(result).toMatch(/Hello[\s\S]*Hi/)
        })

        it('returns empty string for empty messages array', () => {
            const manager = new ContextDepthManager()

            const result = manager.formatContextForPrompt([])

            expect(result).toBe('')
        })

        it('returns empty string for null input', () => {
            const manager = new ContextDepthManager()

            const result = manager.formatContextForPrompt(null)

            expect(result).toBe('')
        })

        it('limits total context length', () => {
            const manager = new ContextDepthManager({ maxContextLength: 50 })
            const messages = [
                { id: 1, name: 'User', mes: 'This is a very long message that exceeds the limit' },
                { id: 2, name: 'Character', mes: 'Another long message here' },
            ]

            const result = manager.formatContextForPrompt(messages)

            expect(result.length).toBeLessThanOrEqual(50)
        })

        it('uses default maxContextLength of 2000 when not specified', () => {
            const manager = new ContextDepthManager()

            expect(manager.maxContextLength).toBe(2000)
        })
    })

    describe('integration - full context flow', () => {
        it('gets and formats context in one flow', () => {
            const manager = new ContextDepthManager({ defaultDepth: 3 })
            const chat = [
                { id: 1, name: 'User', mes: 'Hello' },
                { id: 2, name: 'Alice', mes: 'Hi there' },
                { id: 3, name: 'User', mes: 'How are you?' },
                { id: 4, name: 'Alice', mes: 'I am fine' },
                { id: 5, name: 'User', mes: 'Good' },
            ]

            const messages = manager.getContextMessages(chat)
            const context = manager.formatContextForPrompt(messages)

            expect(messages).toHaveLength(3)
            expect(context).toContain('Alice')
            expect(context).toContain('I am fine')
            expect(context).not.toContain('Hello') // Too old
        })

        it('handles real-world chat structure with extra properties', () => {
            const manager = new ContextDepthManager()
            const chat = [
                {
                    id: 1,
                    name: 'User',
                    mes: 'Hello',
                    send_date: '2024-01-01',
                    extra: { image: '...' },
                },
                {
                    id: 2,
                    name: 'Character',
                    mes: 'Hi! <pic prompt="test">',
                    is_user: false,
                },
            ]

            const result = manager.getContextMessages(chat, 5)

            expect(result).toHaveLength(2)
            expect(result[1].mes).toContain('pic prompt') // HTML stripping happens in formatting
        })
    })
})
