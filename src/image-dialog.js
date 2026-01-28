import { ParallelGenerator } from './parallel-generator.js';

export class ImageSelectionDialog {
    constructor(dependenciesOrFactory) {
        let dependencies = {};
        if (typeof dependenciesOrFactory === 'function') {
            dependencies = { generatorFactory: dependenciesOrFactory };
        } else if (dependenciesOrFactory) {
            dependencies = dependenciesOrFactory;
        }

        this.PopupClass =
            dependencies.PopupClass ||
            window.Popup ||
            class MockPopup {
                constructor(c) {
                    this.content = c;
                    this.show = () => {};
                }
            };

        this.generatorFactory =
            dependencies.generatorFactory ||
            ((opts) => new ParallelGenerator(opts));

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
        this.content = this._buildHtml(count);

        if (!this.PopupClass && !window.Popup) {
            console.error(
                '[ImageSelectionDialog] Popup class is not defined! Using mock.',
            );
        }

        // Try to determine POPUP_TYPE.TEXT (usually 1)
        const type =
            window.POPUP_TYPE && window.POPUP_TYPE.TEXT
                ? window.POPUP_TYPE.TEXT
                : 1;

        try {
            this.popup = new this.PopupClass(
                this.content,
                type,
                'image-selection-popup',
                null,
                null,
            );
        } catch (error) {
            console.error('[ImageSelectionDialog] Popup creation failed:', error);
            return;
        }

        if (this.popup) {
            this.popup.wide = true;
            this.popup.large = true;
        }

        try {
            this.popup.show();
        } catch (error) {
            console.error('[ImageSelectionDialog] Popup.show failed:', error);
        }

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
        const grid = `<div class="image-selection-grid count-${count}" id="image-grid">${gridItems}</div>`;

        const footer = `
            <div class="image-selection-footer">
                <button id="btn-img-cancel" class="menu_button">Cancel</button>
                <button id="btn-img-confirm" class="menu_button menu_button_icon"><i class="fa-solid fa-check"></i> Keep Selected</button>
            </div>
        `;

        return `<div class="image-selection-dialog">${toolbar}${grid}${footer}</div>`;
    }

    async _bindEvents() {
        let attempts = 0;
        const maxAttempts = 60;
        let injectedFallback = false;

        while (attempts < maxAttempts) {
            let container = document.getElementById('image-selection-dialog');
            if (!container) {
                container = document.querySelector('.image-selection-dialog');
            }

            const grid = container
                ? container.querySelector('.image-selection-grid')
                : document.querySelector('.image-selection-grid');

            if (grid) {
                if (!container) container = document.body;

                this.domElements.grid = grid;
                this.domElements.selectAll =
                    container.querySelector('#btn-select-all') ||
                    document.querySelector('#btn-select-all');
                this.domElements.deselectAll =
                    container.querySelector('#btn-deselect-all') ||
                    document.querySelector('#btn-deselect-all');
                this.domElements.destination =
                    container.querySelector('#img-dest-select') ||
                    document.querySelector('#img-dest-select');
                this.domElements.confirm =
                    container.querySelector('#btn-img-confirm') ||
                    document.querySelector('#btn-img-confirm');
                this.domElements.cancel =
                    container.querySelector('#btn-img-cancel') ||
                    document.querySelector('#btn-img-cancel');

                this._attachListeners();
                this._syncGrid();
                return;
            }

            // Fallback: If wrapper exists but content missing, inject manually
            if (!grid && !injectedFallback && attempts > 10) {
                const wrapper = document.querySelector('.image-selection-popup');
                if (wrapper) {
                    console.warn(
                        '[ImageSelectionDialog] Wrapper found but grid missing. Injecting content manually.',
                    );
                    wrapper.innerHTML = this.content;
                    injectedFallback = true;
                } else if (attempts > 20) {
                    console.warn(
                        '[ImageSelectionDialog] No popup found. Creating manual overlay.',
                    );
                    const manualWrapper = document.createElement('div');
                    manualWrapper.className =
                        'image-selection-popup manual-overlay';
                    manualWrapper.style.position = 'fixed';
                    const isMobile = window.innerWidth < 600;

                    if (isMobile) {
                        manualWrapper.style.top = '0';
                        manualWrapper.style.left = '0';
                        manualWrapper.style.width = '100%';
                        manualWrapper.style.height = '100%';
                        manualWrapper.style.transform = 'none';
                        manualWrapper.style.borderRadius = '0';
                        manualWrapper.style.padding = '10px';
                    } else {
                        manualWrapper.style.top = '5%';
                        manualWrapper.style.left = '50%';
                        manualWrapper.style.transform = 'translateX(-50%)';
                        manualWrapper.style.width = '90%';
                        manualWrapper.style.height = '90%';
                        manualWrapper.style.maxWidth = '1200px';
                        manualWrapper.style.maxHeight = '90vh';
                        manualWrapper.style.borderRadius = '12px';
                        manualWrapper.style.padding = '20px';
                    }

                    manualWrapper.style.zIndex = '1000000000';
                    manualWrapper.style.background = 'rgba(20, 20, 30, 0.98)';
                    manualWrapper.style.border =
                        '1px solid var(--SmartThemeBorder, #444)';
                    manualWrapper.style.boxShadow = '0 0 50px rgba(0,0,0,0.8)';
                    manualWrapper.style.display = 'flex';
                    manualWrapper.style.flexDirection = 'column';
                    manualWrapper.style.boxSizing = 'border-box';
                    manualWrapper.style.overflow = 'hidden';
                    manualWrapper.style.pointerEvents = 'all';

                    manualWrapper.innerHTML = this.content;
                    document.body.appendChild(manualWrapper);
                    injectedFallback = true;
                }
            }

            await new Promise((r) => setTimeout(r, 50));
            attempts++;
        }

        console.error(
            '[ImageSelectionDialog] Failed to find DOM elements after waiting',
        );

        const popups = document.querySelectorAll('.popup-body, .popup-content');
        console.log(
            '[ImageSelectionDialog] Debug - Popups found:',
            popups.length,
        );
        console.log(
            '[ImageSelectionDialog] Debug - #image-grid found?',
            !!document.getElementById('image-grid'),
        );
        console.log(
            '[ImageSelectionDialog] Debug - .image-selection-grid found?',
            !!document.querySelector('.image-selection-grid'),
        );
        console.log(
            '[ImageSelectionDialog] Debug - .image-selection-popup found?',
            !!document.querySelector('.image-selection-popup'),
        );
    }


    _attachListeners() {
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
            this.domElements.selectAll.addEventListener('click', () =>
                this._selectAll(),
            );
        }

        if (this.domElements.deselectAll) {
            this.domElements.deselectAll.addEventListener('click', () =>
                this._deselectAll(),
            );
        }

        if (this.domElements.destination) {
            this.domElements.destination.addEventListener('change', (e) => {
                this.destination = e.target.value;
            });
        }

        if (this.domElements.confirm) {
            this.domElements.confirm.addEventListener('click', () =>
                this._handleConfirm(),
            );
        }

        if (this.domElements.cancel) {
            this.domElements.cancel.addEventListener('click', () =>
                this._handleCancel(),
            );
        }
    }

    async _startGeneration(prompts, options) {
        this.isGenerating = true;
        this.generator = this.generatorFactory(options);

        this.generator.onProgress((data) => {
            this._updateSlot(data.taskIndex, data.result);
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

    _syncGrid() {
        if (!this.domElements.grid) return;
        this.slots.forEach((_, index) => this._renderSlot(index));
    }

    _renderSlot(index) {
        if (!this.domElements.grid) return;

        const slotData = this.slots[index];
        if (!slotData) return;

        const slotEl = this.domElements.grid.querySelector(`.image-slot[data-index="${index}"]`);
        if (!slotEl) return;

        if (slotData.status === 'pending') {
            // Pending is the default state, no need to reset if we assume clean slate
            return;
        }

        slotEl.classList.remove('pending');

        if (slotData.status === 'success') {
            slotEl.classList.add('success');
            const imageUrl = slotData.result.result;
            slotEl.innerHTML = `
                <img src="${imageUrl}" alt="${slotData.result.prompt}" />
                <div class="image-slot-overlay"></div>
            `;
            const isSelected = this.selectedIndices.has(index);
            slotEl.classList.toggle('selected', isSelected);
        } else if (slotData.status === 'error') {
            console.error(
                '[ImageSelectionDialog] Slot error:',
                slotData.result.error,
            );
            const errorMsg = slotData.result.error?.message || 'Unknown error';
            slotEl.classList.add('error');
            slotEl.innerHTML = `
                <div class="image-slot-status">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <span>Failed</span>
                    <span style="font-size: 0.7em; margin-top: 4px; opacity: 0.8;">${errorMsg}</span>
                </div>
            `;
        }
    }

    _updateSlot(index, result) {
        this.slots[index] = {
            status: result.status === 'ok' ? 'success' : 'error',
            result: result,
        };

        this._renderSlot(index);
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

    _removeManualOverlay() {
        const overlay = document.querySelector(
            '.image-selection-popup.manual-overlay',
        );
        if (overlay) {
            overlay.remove();
        }
    }

    _handleConfirm() {
        const selectedImages = [];
        this.selectedIndices.forEach((index) => {
            const slot = this.slots[index];
            if (slot && slot.status === 'success') {
                selectedImages.push(slot.result.result);
            }
        });

        if (this.resolvePromise) {
            this.resolvePromise({
                selected: selectedImages,
                destination: this.destination,
            });
        }
        this.resolvePromise = null;

        if (this.popup && typeof this.popup.hide === 'function') {
            this.popup.hide();
        }
        this._removeManualOverlay();
    }

    _handleCancel() {
        if (this.isGenerating) {
            this.generator.abort();
        }
        if (this.rejectPromise) {
            this.rejectPromise(new Error('Cancelled'));
        }
        this.resolvePromise = null;

        if (this.popup && typeof this.popup.hide === 'function') {
            this.popup.hide();
        }
        this._removeManualOverlay();
    }

    _handleClosing() {
        if (this.isGenerating) {
            const confirmClose = confirm(
                'Generation is still in progress. Are you sure you want to close?',
            );
            if (!confirmClose) {
                this.generator.abort();
            } else {
                this.generator.abort();
            }
        }

        if (this.resolvePromise) {
            this.rejectPromise(new Error('Closed'));
        }
        this.resolvePromise = null;
        this._removeManualOverlay();
    }
    
    _updateUIState() {
    }
}
