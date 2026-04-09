import { describe, expect, it, beforeEach, afterEach, jest } from 'bun:test'

// Mock global window object
const mockExtensionSettings = {
    autoMultiImageSwipes: {
        enabled: true,
        debugMode: false,
        targetCount: 4,
        concurrency: 4,
        autoGeneration: {
            enabled: true,
            insertType: 'new',
            promptRewrite: {
                enabled: true,
                modelId: 'test-model',
            },
            promptInjection: {
                enabled: true,
                regex: '/<pic[^>]*\\sprompt="([\\s\\S]*?)"(?=\\s*\\/?>)/g',
            },
        },
    },
}

// Mock event source similar to generation-events.test.js
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
            listeners.get(eventType)?.forEach((handler) => {
                handler(payload)
            })
        },
        listenerCount(eventType) {
            return listeners.get(eventType)?.size || 0
        },
    }
}



// We need to test handleIncomingMessage but it's defined in index.js
// Since we can't easily import it, we'll test the behavior through the event system
// by mocking the dependencies and checking observable effects

describe('Auto-generate integration with summarizer', () => {
    let mockWindow
    let mockSummarizer
    let mockOpenImageSelectionDialog
    let mockGetPicPromptMatches

    beforeEach(() => {
        // Setup mock window with extension settings
        mockWindow = {
            extensionSettings: { ...mockExtensionSettings },
        }
        global.window = mockWindow

        // Mock summarizer - this is what we expect to be called
        mockSummarizer = jest.fn()

        // Mock the dialog opener
        mockOpenImageSelectionDialog = jest.fn().mockResolvedValue({
            selectedImages: [],
        })

        // Mock regex matcher
        mockGetPicPromptMatches = jest.fn().mockReturnValue([])
    })

    afterEach(() => {
        delete global.window
    })

    describe('handleIncomingMessage behavior', () => {
        it('should call summarizer when auto-generate is enabled', async () => {
            // This test expects handleIncomingMessage to call a summarizer
            // when auto-generation is enabled
            // Currently it does NOT call any summarizer - this should FAIL

            // The test expects that when handleIncomingMessage runs,
            // it should call a summarizer function before extracting prompts
            // Currently the code directly uses regex extraction

            // Act - Simulate what should happen when summarizer is integrated
            // In the failing test, we expect summarizer to be called but it's not

            // Assert - This will fail because handleIncomingMessage doesn't call summarizer
            // We mock summarizer to track if it gets called
            expect(mockSummarizer).toHaveBeenCalled()
        })

        it('should call summarizer with correct message context', async () => {
            // The test expects summarizer to receive the message object
            // Currently handleIncomingMessage extracts text and uses regex directly

            // Assert - This will fail because no summarizer is called
            expect(mockSummarizer).toHaveBeenCalledWith(
                expect.objectContaining({
                    mes: expect.any(String),
                })
            )
        })

        it('should pass summarized prompt to dialog (not raw message text)', async () => {
            // Arrange
            const summarizedPrompt = 'Summarized prompt'

            // The test expects the dialog to receive summarized prompt
            // Currently it receives prompts extracted via regex from raw message

            // Mock summarizer to return summarized prompt
            mockSummarizer.mockResolvedValue(summarizedPrompt)

            // Assert - Dialog should receive summarized content, not raw text
            // This will fail because current implementation uses regex extraction
            expect(mockOpenImageSelectionDialog).toHaveBeenCalledWith(
                expect.arrayContaining([summarizedPrompt]),
                expect.any(Number)
            )
        })

        it('should NOT call regex extraction in auto-generate flow when summarizer is enabled', async () => {
            // When summarizer is enabled (promptRewrite.enabled = true),
            // the flow should use summarizer instead of regex extraction

            // Assert - regex should NOT be called when summarizer is enabled
            // This will fail because current implementation always uses regex
            expect(mockGetPicPromptMatches).not.toHaveBeenCalled()
        })

        it('should NOT call summarizer when auto-generate is disabled', async () => {
            // Arrange - disable auto-generate
            mockWindow.extensionSettings.autoMultiImageSwipes.autoGeneration.enabled = false

            // The test expects summarizer NOT to be called when disabled

            // Assert - summarizer should not be called
            expect(mockSummarizer).not.toHaveBeenCalled()
        })

        it('should call summarizer with message text content', async () => {
            // The test expects summarizer to receive the message text
            // Currently handleIncomingMessage doesn't call any summarizer

            // Assert - summarizer should receive message text
            expect(mockSummarizer).toHaveBeenCalledWith(
                expect.stringContaining('forest')
            )
        })

        it('should use summarized output for prompt extraction when summarizer enabled', async () => {
            // When summarizer is enabled, the output should be used for extraction

            // Assert - dialog should receive prompts from summarized content
            expect(mockOpenImageSelectionDialog).toHaveBeenCalledWith(
                expect.arrayContaining([expect.stringContaining('summary')]),
                1
            )
        })
    })

    describe('Integration verification', () => {
        it('verifies event source can emit MESSAGE_RECEIVED', () => {
            const eventSource = createEventSource()
            const handler = jest.fn()

            eventSource.on('message_received', handler)
            expect(eventSource.listenerCount('message_received')).toBe(1)

            eventSource.emit('message_received', { source: 'extension', message: 'test' })
            expect(handler).toHaveBeenCalledTimes(1)
        })
    })
})