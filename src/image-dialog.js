import { ParallelGenerator } from './parallel-generator.js';

export class ImageSelectionDialog {
    constructor(generatorFactory) {
        this.generatorFactory = generatorFactory || ((opts) => new ParallelGenerator(opts));
        this.selectedIndices = new Set();
        this.slots = [];
        this.destination = 'new';
        this.popup = null;
        this.resolvePromise = null;
        this.rejectPromise = null;
        this.isGenerating = false;
        this.generator = null;
        this.domElements = {};
    }

    show(prompts, options = {}) {
        return new Promise((resolve, reject) => {
            this.resolvePromise = resolve;
            this.rejectPromise = reject;
            this.slots = new Array(prompts.length).fill(null).map(() => ({ status: 'pending' }));
            this.selectedIndices.clear();
            
            this._createPopup(prompts.length);
            this._startGeneration(prompts, options);
        });
    }

    _createPopup(count) {
        const content = this._buildHtml(count);
        
        const PopupClass = window.Popup || class MockPopup {
            constructor(opts) { this.opts = opts; this.show = () => {}; }
        };

        this.popup = new PopupClass({
            id: 'image-selection-dialog',
            title: 'Generated Images',
            content: content,
            wide: true,
            large: true,
            customButtons: {
                confirm: {
                    text: 'Confirm Selection',
                    color: 'primary',
                    action: () => this._handleConfirm()
                },
                cancel: {
                    text: 'Cancel',
                    action: () => this._handleCancel()
                }
            },
            onClosing: () => this._handleClosing()
        });

        this.popup.show();
        this._bindEvents();
    }

    _buildHtml(count) {
        const toolbar = `
            <div class="image-selection-toolbar">
                <div class="image-selection-actions">
                    <button class="image-selection-btn" id="btn-select-all">Select All</button>
                    <button class="image-selection-btn" id="btn-deselect-all">Deselect All</button>
                </div>
                <div class="image-selection-destination">
                    <label for="img-dest-select">Destination:</label>
                    <select id="img-dest-select">
                        <option value="new">New Message</option>
                        <option value="current">Current Message</option>
                    </select>
                </div>
            </div>
        `;

        let gridItems = '';
        for (let i = 0; i < count; i++) {
            gridItems += `
                <div class="image-slot pending" data-index="${i}">
                    <div class="image-slot-status">
                        <i class="fa-solid fa-circle-notch fa-spin"></i>
                        <span>Generating...</span>
                    </div>
                    <div class="image-slot-overlay"></div>
                </div>
            `;
        }
        const grid = `<div class="image-selection-grid" id="image-grid">${gridItems}</div>`;

        return `<div class="image-selection-dialog">${toolbar}${grid}</div>`;
    }

    _bindEvents() {
        let container = document.getElementById('image-selection-dialog');
        
        if (!container) {
            container = document.querySelector('.image-selection-dialog');
        }
        
        if (!container) {
            console.warn('[ImageSelectionDialog] Container not found, falling back to body');
            container = document.body;
        }

        this.domElements.grid = container.querySelector('.image-selection-grid');
        this.domElements.selectAll = container.querySelector('#btn-select-all');
        this.domElements.deselectAll = container.querySelector('#btn-deselect-all');
        this.domElements.destination = container.querySelector('#img-dest-select');

        if (!this.domElements.grid) {
            console.error('[ImageSelectionDialog] Grid element not found in DOM');
        }

        if (this.domElements.grid) {
            this.domElements.grid.addEventListener('click', (e) => {
                const slot = e.target.closest('.image-slot');
                if (slot) {
                    const index = parseInt(slot.dataset.index, 10);
                    this._toggleSelection(index);
                }
            });
        }

        if (this.domElements.selectAll) {
            this.domElements.selectAll.addEventListener('click', () => this._selectAll());
        }

        if (this.domElements.deselectAll) {
            this.domElements.deselectAll.addEventListener('click', () => this._deselectAll());
        }

        if (this.domElements.destination) {
            this.domElements.destination.addEventListener('change', (e) => {
                this.destination = e.target.value;
            });
        }
    }

    async _startGeneration(prompts, options) {
        this.isGenerating = true;
        this.generator = this.generatorFactory(options);
        
        this.generator.onProgress((data) => {
            this._updateSlot(data.slotIndex, data.result);
        });

        try {
            await this.generator.run(prompts, options);
        } catch (err) {
            console.error('Generation error:', err);
        } finally {
            this.isGenerating = false;
            this._updateUIState();
        }
    }

    _updateSlot(index, result) {
        this.slots[index] = {
            status: result.status === 'ok' ? 'success' : 'error',
            result: result
        };

        if (!this.domElements.grid) return;

        const slotEl = this.domElements.grid.querySelector(`.image-slot[data-index="${index}"]`);
        if (!slotEl) return;

        slotEl.classList.remove('pending');
        
        if (result.status === 'ok') {
            slotEl.classList.add('success');
            const imageUrl = result.result; 
            slotEl.innerHTML = `
                <img src="${imageUrl}" alt="${result.prompt}" />
                <div class="image-slot-overlay"></div>
            `;
            this._toggleSelection(index, true);
        } else {
            slotEl.classList.add('error');
            slotEl.innerHTML = `
                <div class="image-slot-status">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <span>Failed</span>
                </div>
            `;
        }
    }

    _toggleSelection(index, forceState = null) {
        const slot = this.slots[index];
        if (!slot || slot.status !== 'success') return;

        const isSelected = this.selectedIndices.has(index);
        const newState = forceState !== null ? forceState : !isSelected;

        if (newState) {
            this.selectedIndices.add(index);
        } else {
            this.selectedIndices.delete(index);
        }

        if (!this.domElements.grid) return;

        const slotEl = this.domElements.grid.querySelector(`.image-slot[data-index="${index}"]`);
        if (slotEl) {
            slotEl.classList.toggle('selected', newState);
        }
    }

    _selectAll() {
        this.slots.forEach((slot, index) => {
            if (slot.status === 'success') {
                this._toggleSelection(index, true);
            }
        });
    }

    _deselectAll() {
        this.slots.forEach((_, index) => {
            this._toggleSelection(index, false);
        });
    }

    _handleConfirm() {
        const selectedImages = [];
        this.selectedIndices.forEach(index => {
            const slot = this.slots[index];
            if (slot && slot.status === 'success') {
                selectedImages.push(slot.result.result);
            }
        });

        if (this.resolvePromise) {
            this.resolvePromise({
                selected: selectedImages,
                destination: this.destination
            });
        }
        this.resolvePromise = null;
    }

    _handleCancel() {
        if (this.isGenerating) {
            this.generator.abort();
        }
        if (this.rejectPromise) {
            this.rejectPromise(new Error('Cancelled'));
        }
        this.resolvePromise = null;
    }

    _handleClosing() {
        if (this.isGenerating) {
            const confirmClose = confirm('Generation is still in progress. Are you sure you want to close?');
            if (!confirmClose) {
                this.generator.abort();
            } else {
                this.generator.abort();
            }
        }
        
        if (this.resolvePromise) {
            this.rejectPromise(new Error('Closed'));
        }
    }
    
    _updateUIState() {
    }
}
