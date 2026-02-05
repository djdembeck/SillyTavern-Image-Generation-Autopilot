import { describe, expect, it } from 'bun:test'
import { StateManager } from '../state-manager'

describe('StateManager', () => {
    it('initializes default state collections', () => {
        const manager = new StateManager()

        expect(manager.generationStates).toEqual({})
        expect(manager.runningMessages instanceof Map).toBe(true)
        expect(manager.seenMessages instanceof Set).toBe(true)
        expect(manager.chatToken).toBe(0)
    })

    it('adds, retrieves, and removes generation state entries', () => {
        const manager = new StateManager()
        const payload = { lastMediaCount: 1, lastCheckTime: 123, stuckCheckCount: 0 }

        expect(manager.addGenerationState('1_2', payload)).toBe(true)
        expect(manager.getGenerationState('1_2')).toEqual(payload)
        expect(manager.removeGenerationState('1_2')).toBe(true)
        expect(manager.getGenerationState('1_2')).toBeUndefined()
    })

    it('rejects invalid generation state inputs', () => {
        const manager = new StateManager()

        expect(manager.addGenerationState('', { ok: true })).toBe(false)
        expect(manager.addGenerationState('key', null)).toBe(false)
        expect(manager.addGenerationState('key', [])).toBe(false)
        expect(manager.removeGenerationState('')).toBe(false)
    })

    it('cleans up state collections', () => {
        const manager = new StateManager({
            generationStates: { a: { ok: true } },
            runningMessages: new Map([[1, true]]),
            seenMessages: new Set([1, 2]),
            chatToken: 2,
        })

        manager.cleanup()

        expect(Object.keys(manager.generationStates)).toHaveLength(0)
        expect(manager.runningMessages.size).toBe(0)
        expect(manager.seenMessages.size).toBe(0)
    })

    it('resets when chat token changes', () => {
        const manager = new StateManager({
            generationStates: { a: { ok: true } },
            runningMessages: new Map([[1, true]]),
            seenMessages: new Set([1]),
            chatToken: 1,
        })

        const didReset = manager.resetForChat(2)

        expect(didReset).toBe(true)
        expect(manager.chatToken).toBe(2)
        expect(Object.keys(manager.generationStates)).toHaveLength(0)
        expect(manager.runningMessages.size).toBe(0)
        expect(manager.seenMessages.size).toBe(0)
    })

    it('does not reset when chat token is unchanged', () => {
        const manager = new StateManager({ chatToken: 3 })

        const didReset = manager.resetForChat(3)

        expect(didReset).toBe(false)
        expect(manager.chatToken).toBe(3)
    })

    it('increments token and cleans up when token is omitted', () => {
        const manager = new StateManager({
            generationStates: { a: { ok: true } },
            runningMessages: new Map([[1, true]]),
            seenMessages: new Set([1]),
            chatToken: 5,
        })

        const didReset = manager.resetForChat()

        expect(didReset).toBe(true)
        expect(manager.chatToken).toBe(6)
        expect(Object.keys(manager.generationStates)).toHaveLength(0)
        expect(manager.runningMessages.size).toBe(0)
        expect(manager.seenMessages.size).toBe(0)
    })
})
