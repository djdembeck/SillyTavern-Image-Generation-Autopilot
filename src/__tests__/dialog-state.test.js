import { describe, it, expect, beforeEach, mock, spyOn } from "bun:test";
import { ImageSelectionDialog } from "../image-dialog.js";

// Mock DOM setup
const createMockElement = (id = '') => {
    const listeners = {};
    return {
        id,
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
        },
        dataset: {},
        closest: mock(() => ({ dataset: { index: "0" } })),
        innerHTML: "",
        value: "",
        listeners // expose for testing
    };
};

global.document = {
    querySelector: mock(() => createMockElement('container')),
    body: createMockElement('body'),
};

global.window = {
    Popup: class MockPopup {
        constructor(opts) {
            this.opts = opts;
            this.show = mock();
        }
    }
};

global.confirm = mock(() => true);

describe("ImageSelectionDialog", () => {
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
        
        // Reset DOM mocks
        global.document.querySelector.mockClear();
    });

    it("initializes correctly", () => {
        expect(dialog.selectedIndices.size).toBe(0);
        expect(dialog.slots.length).toBe(0);
        expect(dialog.destination).toBe('new');
    });

    it("show() creates popup and starts generation", async () => {
        const prompts = ["p1", "p2"];
        const promise = dialog.show(prompts, {});
        
        expect(dialog.slots.length).toBe(2);
        expect(dialog.slots[0].status).toBe('pending');
        expect(dialog.popup).toBeDefined();
        expect(dialog.popup.show).toHaveBeenCalled();
        expect(mockRun).toHaveBeenCalled();
        
        // Simulate completion
        progressCallback({ slotIndex: 0, result: { status: 'ok', result: 'img1.png' } });
        progressCallback({ slotIndex: 1, result: { status: 'ok', result: 'img2.png' } });
        
        // Wait for run to resolve (it's mocked to resolve immediately, but logic awaits it)
    });

    it("updates slots and auto-selects on success", async () => {
        dialog.show(["p1"], {});
        
        // Mock the grid element finding
        const mockGrid = createMockElement('grid');
        const mockSlot = createMockElement('slot');
        dialog.domElements.grid = mockGrid;
        mockGrid.querySelector.mockReturnValue(mockSlot);

        progressCallback({ 
            slotIndex: 0, 
            result: { status: 'ok', result: 'img1.png', prompt: 'p1' } 
        });

        expect(dialog.slots[0].status).toBe('success');
        expect(dialog.selectedIndices.has(0)).toBe(true);
        expect(mockSlot.classList.remove).toHaveBeenCalledWith('pending');
        expect(mockSlot.classList.add).toHaveBeenCalledWith('success');
        expect(mockSlot.innerHTML).toContain('img1.png');
    });

    it("handles error state correctly", async () => {
        dialog.show(["p1"], {});
        
        const mockGrid = createMockElement('grid');
        const mockSlot = createMockElement('slot');
        dialog.domElements.grid = mockGrid;
        mockGrid.querySelector.mockReturnValue(mockSlot);

        progressCallback({ 
            slotIndex: 0, 
            result: { status: 'error', error: 'failed' } 
        });

        expect(dialog.slots[0].status).toBe('error');
        expect(dialog.selectedIndices.has(0)).toBe(false);
        expect(mockSlot.classList.add).toHaveBeenCalledWith('error');
    });

    it("toggles selection manually", async () => {
        dialog.show(["p1"], {});
        
        // Manually set slot to success so it can be selected
        dialog.slots[0] = { status: 'success', result: {} };
        dialog.selectedIndices.add(0); // Initially selected by default logic usually, but let's say we start here

        const mockGrid = createMockElement('grid');
        const mockSlot = createMockElement('slot');
        dialog.domElements.grid = mockGrid;
        mockGrid.querySelector.mockReturnValue(mockSlot);

        // Toggle off
        dialog._toggleSelection(0);
        expect(dialog.selectedIndices.has(0)).toBe(false);
        expect(mockSlot.classList.toggle).toHaveBeenCalledWith('selected', false);

        // Toggle on
        dialog._toggleSelection(0);
        expect(dialog.selectedIndices.has(0)).toBe(true);
        expect(mockSlot.classList.toggle).toHaveBeenCalledWith('selected', true);
    });

    it("selects and deselects all", async () => {
        dialog.show(["p1", "p2"], {});
        dialog.slots[0] = { status: 'success' };
        dialog.slots[1] = { status: 'success' };
        
        // Mock DOM elements
        const mockGrid = createMockElement('grid');
        const mockSlot = createMockElement('slot');
        dialog.domElements.grid = mockGrid;
        mockGrid.querySelector.mockReturnValue(mockSlot);

        dialog._deselectAll();
        expect(dialog.selectedIndices.size).toBe(0);

        dialog._selectAll();
        expect(dialog.selectedIndices.size).toBe(2);
    });

    it("confirms selection and resolves promise", async () => {
        const prompts = ["p1"];
        const promise = dialog.show(prompts, {});
        
        dialog.slots[0] = { status: 'success', result: { result: 'img1.png' } };
        dialog.selectedIndices.add(0);
        dialog.destination = 'current';

        dialog._handleConfirm();
        
        const result = await promise;
        expect(result.selected).toEqual(['img1.png']);
        expect(result.destination).toBe('current');
    });

    it("cancels generation on cancel", async () => {
        dialog.show(["p1"], {});
        dialog.isGenerating = true;
        
        let error;
        dialog.show(["p1"], {}).catch(e => error = e);
        
        dialog._handleCancel();
        
        expect(mockAbort).toHaveBeenCalled();
        // Promise rejection handling is tricky with multiple show calls in test structure, 
        // but checking abort is key.
    });
});
