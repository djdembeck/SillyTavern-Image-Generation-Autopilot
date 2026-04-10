import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ImageSelectionDialog } from '../image-dialog.js'

const indexSource = readFileSync(resolve(import.meta.dir, '../../index.js'), 'utf8')

function extractFunctionSource(functionName, nextFunctionName) {
    const pattern = new RegExp(
        `async function ${functionName}\\([^)]*\\) {([\\s\\S]*?)}\\s*${nextFunctionName ? `(?:async )?function ${nextFunctionName}\\(` : ''}`,
    )
    const match = indexSource.match(pattern)
    if (!match) {
        throw new Error(`Could not locate ${functionName}() in index.js`)
    }

    return nextFunctionName
        ? match[0].replace(new RegExp(`\\s*(?:async )?function ${nextFunctionName}\\($`), '')
        : match[0]
}

function buildIndexFunction(source, functionName, dependencies) {
    const names = Object.keys(dependencies)
    const values = Object.values(dependencies)
    return new Function(...names, `${source}; return ${functionName};`)(...values)
}

function createMockElement(id = '') {
    const listeners = {}
    const children = []

    return {
        id,
        value: '',
        textContent: '',
        className: '',
        disabled: false,
        dataset: {},
        style: {},
        listeners,
        addEventListener: mock((event, handler) => {
            listeners[event] = handler
        }),
        appendChild: mock((child) => {
            children.push(child)
            return child
        }),
        querySelector: mock((selector) => {
            if (selector === 'i') {
                return children.find((child) => child.tagName === 'I') || null
            }
            return null
        }),
        classList: {
            add: mock(),
            remove: mock(),
            toggle: mock(),
            contains: mock(() => false),
        },
        get children() {
            return children
        },
        get lastChild() {
            return children.length > 0 ? children[children.length - 1] : null
        },
    }
}

function createButton(id, iconClass, label) {
    const button = createMockElement(id)
    const icon = createMockElement(`${id}-icon`)
    icon.tagName = 'I'
    icon.className = iconClass
    button.appendChild(icon)
    button.appendChild({ textContent: label })
    return button
}

function setupDialogGlobals() {
    globalThis.document = {
        querySelector: mock(() => null),
        getElementById: mock(() => null),
        body: createMockElement('body'),
        createElement: mock((tag) => {
            const element = createMockElement(tag)
            element.tagName = String(tag).toUpperCase()
            return element
        }),
    }

    globalThis.window = {
        extensionSettings: {
            autoMultiImageSwipes: {
                debugMode: false,
            },
        },
        Popup: class MockPopup {
            constructor() {
                this.show = mock()
            }
        },
        addEventListener: mock(),
        removeEventListener: mock(),
        toastr: {
            error: mock(),
        },
        appendMediaToMessage: mock(),
        updateMessageBlock: mock(),
    }
}

const handleIncomingMessageSource = extractFunctionSource(
    'handleIncomingMessage',
    'handleManualPromptRewrite',
)
const handleDialogResultSource = extractFunctionSource(
    'handleDialogResult',
    'normalizeRewriteResponse',
)
const generateSummarizedPromptSource = extractFunctionSource(
    'generateSummarizedPrompt',
    'handleIncomingMessage',
)

describe('full flow integration', () => {
    beforeEach(() => {
        setupDialogGlobals()
        delete globalThis.SillyTavern
    })

    it('runs auto-generate flow from incoming message through image insertion', async () => {
        const message = {
            is_user: false,
            mes: 'Alice steps into the forest clearing.',
            name: 'Alice',
            extra: {
                media: [],
                media_index: 0,
            },
        }
        const messageElement = createMockElement('message-element')
        const context = {
            chat: [message],
            name1: 'User',
            saveChat: mock(async () => {}),
            reloadCurrentChat: mock(async () => {}),
        }
        const settings = {
            concurrency: 2,
            autoGeneration: {
                enabled: true,
                insertType: 'inline',
                summarizer: {
                    messageDepth: 1,
                    systemPromptTemplate: 'template',
                },
            },
        }

        globalThis.document.querySelector = mock((selector) => {
            if (selector === '.mes[mesid="0"]') {
                return messageElement
            }
            return null
        })

        const appendGeneratedMedia = mock((targetMessage, url) => {
            targetMessage.extra.media.push({ url })
        })
        const sanitizeMessageMediaState = mock()
        const waitForMessageElement = mock(async () => messageElement)
        const createPlaceholderImageMessage = mock(async () => 1)
        const hasGeneratedMedia = mock(() => false)
        const getCtx = mock(() => context)
        const getSettings = mock(() => settings)
        const summarizeWithAI = mock(async () => 'Characters:\n- Alice\n\nScene: Misty forest clearing')
        const openImageSelectionDialog = mock(async (prompts, sourceMessageId) => ({
            selected: ['image://selected-1'],
            destination: 'current',
            sourceMessageId,
            prompts,
        }))

        const handleDialogResult = buildIndexFunction(
            handleDialogResultSource,
            'handleDialogResult',
            {
                getCtx,
                getSettings,
                INSERT_TYPE: {
                    NEW_MESSAGE: 'new',
                },
                appendGeneratedMedia,
                document: globalThis.document,
                waitForMessageElement,
                window: globalThis.window,
                sanitizeMessageMediaState,
                createPlaceholderImageMessage,
                hasGeneratedMedia,
                log: mock(),
            },
        )

        const generateSummarizedPrompt = buildIndexFunction(
            generateSummarizedPromptSource,
            'generateSummarizedPrompt',
            {
                getSettings,
                getCtx,
                summarizeWithAI,
                log: mock(),
                logger: {
                    error: mock(),
                    warn: mock(),
                },
                stripPicTags: (content) => {
                    if (typeof content !== 'string') return content
                    return content.replace(/<pic[^>]*\sprompt="[\s\S]*?"[^>]*\/?>/gi, '').replace(/<\/pic>/gi, '').trim()
                },
            },
        )

        const handleIncomingMessage = buildIndexFunction(
            handleIncomingMessageSource,
            'handleIncomingMessage',
            {
                state: {
                    isRewriting: false,
                    chatToken: 1,
                    autoGenMessages: new Set(),
                },
                log: mock(),
                getSettings,
                sleep: mock(async () => {}),
                INSERT_TYPE: {
                    DISABLED: 'disabled',
                },
                getCtx,
                summarizeWithAI,
                generateSummarizedPrompt,
                getSwipeTotal: mock(() => 2),
                openImageSelectionDialog,
                handleDialogResult,
                logger: {
                    error: mock(),
                    warn: mock(),
                },
                window: globalThis.window,
                stripPicTags: (content) => {
                    if (typeof content !== 'string') return content
                    return content.replace(/<pic[^>]*\sprompt="[\s\S]*?"[^>]*\/?>/gi, '').replace(/<\/pic>/gi, '').trim()
                },
            },
        )

        await handleIncomingMessage(0)

        expect(summarizeWithAI).toHaveBeenCalledTimes(1)
        expect(summarizeWithAI).toHaveBeenCalledWith(
            expect.objectContaining({
                messages: expect.arrayContaining([
                    expect.objectContaining({
                        role: 'assistant',
                        content: 'Alice steps into the forest clearing.',
                    }),
                ]),
                messageDepth: expect.any(Number),
                charName: 'Alice',
                userName: 'User',
            }),
        )
        expect(openImageSelectionDialog).toHaveBeenCalledWith(
            [
                'Characters:\n- Alice\n\nScene: Misty forest clearing',
                'Characters:\n- Alice\n\nScene: Misty forest clearing',
            ],
            0,
        )
        expect(appendGeneratedMedia).toHaveBeenCalledWith(message, 'image://selected-1', '', true)
        expect(message.extra.media).toEqual([{ url: 'image://selected-1' }])
        expect(globalThis.window.appendMediaToMessage).toHaveBeenCalledWith(message, messageElement)
        expect(context.saveChat).toHaveBeenCalledTimes(1)
        expect(context.reloadCurrentChat).toHaveBeenCalledTimes(1)
    })

    it('updates the working prompt when resummarize is clicked', async () => {
        const onResummarize = mock(async () => 'Characters:\n- Alice\n\nScene: Updated prompt')
        const dialog = new ImageSelectionDialog({
            generatorFactory: () => ({
                run: mock(async () => []),
                abort: mock(),
                onProgress: () => ({ run: mock(async () => []) }),
            }),
            onResummarize,
            PopupClass: class {
                show() {}
            },
        })
        dialog._bindEvents = mock(async () => {})
        dialog.show(['Original summary'], {})

        const promptTextarea = createMockElement('img-prompt-editor')
        promptTextarea.value = 'Original summary'
        const promptApplyBtn = createMockElement('btn-prompt-apply')
        const promptResummarizeBtn = createButton(
            'btn-prompt-resummarize',
            'fa-solid fa-robot',
            ' Resummarize',
        )

        dialog.domElements.promptTextarea = promptTextarea
        dialog.domElements.promptApplyBtn = promptApplyBtn
        dialog.domElements.promptResummarizeBtn = promptResummarizeBtn
        dialog.editedPrompt = 'Original summary'

        dialog._attachListeners()
        await dialog.domElements.promptResummarizeBtn.listeners.click()

        expect(onResummarize).toHaveBeenCalledWith('Original summary')
        expect(dialog.editedPrompt).toBe('Characters:\n- Alice\n\nScene: Updated prompt')
        expect(promptTextarea.value).toBe('Characters:\n- Alice\n\nScene: Updated prompt')
        expect(promptApplyBtn.classList.add).toHaveBeenCalledWith('highlight')
    })

    it('allows direct prompt edits without any AI call', async () => {
        const onResummarize = mock(async () => 'should not be used')
        const dialog = new ImageSelectionDialog({
            generatorFactory: () => ({
                run: mock(async () => []),
                abort: mock(),
                onProgress: () => ({ run: mock(async () => []) }),
            }),
            onResummarize,
            PopupClass: class {
                show() {}
            },
        })
        dialog._bindEvents = mock(async () => {})
        dialog.show(['Original summary'], {})

        const promptTextarea = createMockElement('img-prompt-editor')
        promptTextarea.value = 'Original summary'
        dialog.domElements.promptTextarea = promptTextarea
        dialog.editedPrompt = 'Original summary'

        dialog._attachListeners()
        dialog.domElements.promptTextarea.listeners.input({
            target: { value: 'Manually edited prompt' },
        })

        expect(dialog.editedPrompt).toBe('Manually edited prompt')
        expect(onResummarize).not.toHaveBeenCalled()
    })

    it('rewrites the prompt by triggering a fresh summarization', async () => {
        const onResummarize = mock(async () => 'Characters:\n- Alice\n\nScene: Rewritten prompt')
        const dialog = new ImageSelectionDialog({
            generatorFactory: () => ({
                run: mock(async () => []),
                abort: mock(),
                onProgress: () => ({ run: mock(async () => []) }),
            }),
            onResummarize,
            PopupClass: class {
                show() {}
            },
        })
        dialog._bindEvents = mock(async () => {})
        dialog.show(['Original summary'], {})

        const promptTextarea = createMockElement('img-prompt-editor')
        promptTextarea.value = 'Original summary'
        const promptApplyBtn = createMockElement('btn-prompt-apply')
        const promptRewriteBtn = createButton(
            'btn-prompt-rewrite',
            'fa-solid fa-wand-magic-sparkles',
            ' Rewrite Prompt',
        )

        dialog.domElements.promptTextarea = promptTextarea
        dialog.domElements.promptApplyBtn = promptApplyBtn
        dialog.domElements.promptRewriteBtn = promptRewriteBtn
        dialog.editedPrompt = 'Original summary'

        dialog._attachListeners()
        await dialog.domElements.promptRewriteBtn.listeners.click()

        expect(onResummarize).toHaveBeenCalledWith('Original summary')
        expect(dialog.editedPrompt).toBe('Characters:\n- Alice\n\nScene: Rewritten prompt')
        expect(promptTextarea.value).toBe('Characters:\n- Alice\n\nScene: Rewritten prompt')
        expect(promptApplyBtn.classList.add).toHaveBeenCalledWith('highlight')
    })

    it('shows a toast and aborts generation when summarization fails', async () => {
        const context = {
            chat: [
                {
                    is_user: false,
                    mes: 'A broken message',
                    name: 'Alice',
                },
            ],
            name1: 'User',
        }
        const settings = {
            autoGeneration: {
                enabled: true,
                insertType: 'inline',
                summarizer: {
                    messageDepth: 1,
                    systemPromptTemplate: 'template',
                },
            },
        }

        const getCtx = mock(() => context)
        const getSettings = mock(() => settings)
        const openImageSelectionDialog = mock(async () => null)
        const handleDialogResult = mock(async () => {})
        const summarizeWithAI = mock(async () => {
            throw new Error('Summarizer offline')
        })

        const generateSummarizedPrompt = buildIndexFunction(
            generateSummarizedPromptSource,
            'generateSummarizedPrompt',
            {
                getSettings,
                getCtx,
                summarizeWithAI,
                log: mock(),
                logger: {
                    error: mock(),
                    warn: mock(),
                },
                stripPicTags: (content) => {
                    if (typeof content !== 'string') return content
                    return content.replace(/<pic[^>]*\sprompt="[\s\S]*?"[^>]*\/?>/gi, '').replace(/<\/pic>/gi, '').trim()
                },
            },
        )

        const handleIncomingMessage = buildIndexFunction(
            handleIncomingMessageSource,
            'handleIncomingMessage',
            {
                state: {
                    isRewriting: false,
                    chatToken: 1,
                    autoGenMessages: new Set(),
                },
                log: mock(),
                getSettings,
                sleep: mock(async () => {}),
                INSERT_TYPE: {
                    DISABLED: 'disabled',
                },
                getCtx,
                summarizeWithAI,
                generateSummarizedPrompt,
                getSwipeTotal: mock(() => 1),
                openImageSelectionDialog,
                handleDialogResult,
                logger: {
                    error: mock(),
                    warn: mock(),
                },
                window: globalThis.window,
                stripPicTags: (content) => {
                    if (typeof content !== 'string') return content
                    return content.replace(/<pic[^>]*\sprompt="[\s\S]*?"[^>]*\/?>/gi, '').replace(/<\/pic>/gi, '').trim()
                },
            },
        )

        await handleIncomingMessage(0)

        expect(summarizeWithAI).toHaveBeenCalledTimes(1)
        expect(globalThis.window.toastr.error).toHaveBeenCalledWith(
            'Summarizer offline',
            'Image Summarization Failed',
        )
        expect(openImageSelectionDialog).not.toHaveBeenCalled()
        expect(handleDialogResult).not.toHaveBeenCalled()
    })
})
