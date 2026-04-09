import { describe, it, expect, beforeEach, mock } from "bun:test";
import { ImageSelectionDialog } from "../image-dialog.js";

// Mock DOM setup
const createMockElement = (id = '') => {
    const listeners = {};
    const children = [];
    const el = {
        id,
        tagName: '',
        querySelector: mock((selector) => createMockElement(selector)),
        addEventListener: mock((event, handler) => {
            listeners[event] = handler;
        }),
        trigger: (event, data) => {
            if (listeners[event]) listeners[event](data);
        },
        classList: {
            add: mock(),
            remove: mock(),
            toggle: mock(),
            contains: mock(() => false),
        },
        remove: mock(),
        scrollTo: mock(),
        dataset: {},
        closest: mock(() => ({ dataset: { index: "0" } })),
        _innerHTML: "",
        get innerHTML() {
            if (children.length > 0) {
                return children.map(c => c.src || c.textContent || '').join('');
            }
            return el._innerHTML || "";
        },
        set innerHTML(value) {
            el._innerHTML = value;
            children.length = 0;
        },
        value: "",
        textContent: "",
        src: "",
        alt: "",
        style: {},
        className: "",
        appendChild: mock((child) => {
            children.push(child);
            return child;
        }),
        children,
        listeners
    };
    return el;
};

global.document = {
    querySelector: mock(() => createMockElement('container')),
    getElementById: mock(() => createMockElement('container')),
    body: createMockElement('body'),
    createElement: mock((tag) => {
        const el = createMockElement(tag);
        el.tagName = tag.toUpperCase();
        el.src = '';
        el.alt = '';
        el.textContent = '';
        return el;
    }),
};

const windowListeners = {};
global.window = {
    Popup: class MockPopup {
        constructor(opts) {
            this.opts = opts;
            this.show = mock();
        }
    },
    addEventListener: mock((event, handler) => {
        windowListeners[event] = handler;
    }),
    removeEventListener: mock((event, handler) => {
        if (windowListeners[event] === handler) {
            delete windowListeners[event];
        }
    }),
    _triggerWindowEvent: (event, data) => {
        if (windowListeners[event]) windowListeners[event](data);
    }
};

global.confirm = mock(() => true);

describe("ImageSelectionDialog - Dialog Modifications", () => {
    let dialog;
    let mockGenerator;
    let mockRun;
    let mockAbort;
    let progressCallback;

    beforeEach(() => {
        mockRun = mock(() => Promise.resolve([]));
        mockAbort = mock();
        mockGenerator = {
            run: mockRun,
            abort: mockAbort,
            onProgress: (cb) => { progressCallback = cb; return mockGenerator; }
        };

        dialog = new ImageSelectionDialog(() => mockGenerator);

        global.document.querySelector.mockClear();
    });

    describe("Resummarize button", () => {
        it("should have onResummarize callback in constructor", () => {
            // Test that the dialog accepts onResummarize callback
            const dialogWithResummarize = new ImageSelectionDialog({
                generatorFactory: () => mockGenerator,
                onResummarize: mock(() => Promise.resolve("summarized prompt"))
            });
            
            expect(dialogWithResummarize.onResummarize).toBeDefined();
            expect(typeof dialogWithResummarize.onResummarize).toBe('function');
        });

        it("should include Resummarize button in prompt editor HTML", () => {
            // Build the HTML and check for resummarize button
            const html = dialog._buildHtml(1);
            
            // Should contain a resummarize button
            expect(html).toContain('btn-prompt-resummarize');
            expect(html).toContain('Resummarize');
        });

        it("should call onResummarize callback when Resummarize button is clicked", async () => {
            const onResummarizeMock = mock(() => Promise.resolve("new summarized prompt"));
            
            const resummarizeDialog = new ImageSelectionDialog({
                generatorFactory: () => mockGenerator,
                onResummarize: onResummarizeMock
            });
            
            // Show the dialog to build the popup
            resummarizeDialog.show(["test prompt"], {});
            
            // Mock the DOM elements including the resummarize button
            const mockResummarizeBtn = createMockElement('btn-prompt-resummarize');
            const mockTextarea = createMockElement('img-prompt-editor');
            mockTextarea.value = "original prompt";
            
            resummarizeDialog.domElements.promptResummarizeBtn = mockResummarizeBtn;
            resummarizeDialog.domElements.promptTextarea = mockTextarea;
            resummarizeDialog.editedPrompt = "original prompt";
            
            // Click the resummarize button
            if (mockResummarizeBtn.listeners && mockResummarizeBtn.listeners.click) {
                mockResummarizeBtn.listeners.click();
            }
            
            // The onResummarize callback should have been called
            expect(onResummarizeMock).toHaveBeenCalled();
            expect(onResummarizeMock).toHaveBeenCalledWith("original prompt");
        });
    });

    describe("Edit Prompt - direct text modification", () => {
        it("should allow direct text modification without AI call", async () => {
            dialog.show(["original prompt"], {});
            
            // Set up mock textarea
            const mockTextarea = createMockElement('img-prompt-editor');
            mockTextarea.value = "original prompt";
            
            dialog.domElements.promptTextarea = mockTextarea;
            dialog.editedPrompt = "original prompt";
            
            // Simulate user typing directly in textarea
            if (mockTextarea.listeners && mockTextarea.listeners.input) {
                // Manually trigger input event with new value
                mockTextarea.listeners.input({ target: { value: "manually edited prompt" } });
            }
            
            // The editedPrompt should be updated directly without calling any AI
            expect(dialog.editedPrompt).toBe("manually edited prompt");
        });
    });

    describe("Rewrite Prompt - fresh summarization", () => {
        it("should trigger fresh summarization when Rewrite Prompt is clicked", async () => {
            const onRewriteMock = mock(() => Promise.resolve("freshly rewritten prompt"));
            
            const rewriteDialog = new ImageSelectionDialog({
                generatorFactory: () => mockGenerator,
                onRewrite: onRewriteMock
            });
            
            rewriteDialog.show(["test prompt"], {});
            
            // Set up mock elements
            const mockRewriteBtn = createMockElement('btn-prompt-rewrite');
            const mockTextarea = createMockElement('img-prompt-editor');
            const mockApplyBtn = createMockElement('btn-prompt-apply');
            
            mockTextarea.value = "original prompt";
            
            rewriteDialog.domElements.promptRewriteBtn = mockRewriteBtn;
            rewriteDialog.domElements.promptTextarea = mockTextarea;
            rewriteDialog.domElements.promptApplyBtn = mockApplyBtn;
            rewriteDialog.editedPrompt = "original prompt";
            
            // Click rewrite button
            if (mockRewriteBtn.listeners && mockRewriteBtn.listeners.click) {
                mockRewriteBtn.listeners.click();
            }
            
            // Should call onRewrite for fresh summarization
            expect(onRewriteMock).toHaveBeenCalled();
            expect(onRewriteMock).toHaveBeenCalledWith("original prompt");
        });
    });

    describe("Debouncing for resummarize", () => {
        it("should prevent rapid resummarize clicks with debouncing", async () => {
            const onResummarizeMock = mock(() => Promise.resolve("summarized"));
            
            const debouncedDialog = new ImageSelectionDialog({
                generatorFactory: () => mockGenerator,
                onResummarize: onResummarizeMock
            });
            
            debouncedDialog.show(["test prompt"], {});
            
            // Set up mock elements
            const mockResummarizeBtn = createMockElement('btn-prompt-resummarize');
            const mockTextarea = createMockElement('img-prompt-editor');
            mockTextarea.value = "prompt";
            
            debouncedDialog.domElements.promptResummarizeBtn = mockResummarizeBtn;
            debouncedDialog.domElements.promptTextarea = mockTextarea;
            debouncedDialog.editedPrompt = "prompt";
            
            // Click rapidly multiple times
            if (mockResummarizeBtn.listeners && mockResummarizeBtn.listeners.click) {
                mockResummarizeBtn.listeners.click();
                mockResummarizeBtn.listeners.click();
                mockResummarizeBtn.listeners.click();
            }
            
            // Should only call onResummarize once due to debouncing
            // The second and third calls should be debounced
            expect(onResummarizeMock).toHaveBeenCalledTimes(1);
        });
    });
});