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
        this.prompts = [];
        this.generatorOptions = {};
        this.modelOptions = dependencies.modelOptions || [];
        this.selectedModelId = null;
        this.editedPrompt = null;
        this.currentCount = 0;
        this.onRewrite = dependencies.onRewrite || null;
    }

    show(prompts, options = {}) {
        return new Promise((resolve, reject) => {
            this.resolvePromise = resolve;
            this.rejectPromise = reject;
            this.prompts = prompts;
            this.generatorOptions = options;
            this.currentCount = prompts.length;
            
            const firstPrompt = prompts[0];
            this.editedPrompt = typeof firstPrompt === 'string' ? firstPrompt : (firstPrompt?.prompt || '');
            
            this.slots = new Array(prompts.length)
                .fill(null)
                .map(() => ({ status: 'pending' }));
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
        const header = `
            <div class="image-selection-header">
                <div class="image-selection-header__badge">
                    <i class="fa-solid fa-wand-magic-sparkles"></i>
                    <span>Generation Choice</span>
                </div>
                <div class="image-selection-header__text">
                    <h5>Parallel Generation Results</h5>
                    <p class="caption">Select the images you want to keep and choose their destination.</p>
                </div>
            </div>
        `;

        const modelSelector = `
            <div class="image-selection-model">
                <span><i class="fa-solid fa-cube"></i> Model:</span>
                <select id="img-model-select">
                    <option value="">Default (Active)</option>
                    ${this.modelOptions
                        .map(
                            (m) =>
                                `<option value="${m.value}">${m.text}</option>`,
                        )
                        .join('')}
                </select>
            </div>
        `;

        const toolbar = `
            <div class="image-selection-toolbar">
                <div class="image-selection-actions">
                    <button class="image-selection-btn" id="btn-select-all" title="Select all successful generations">
                        <i class="fa-solid fa-check-double"></i> Select All
                    </button>
                    <button class="image-selection-btn" id="btn-deselect-all" title="Clear selection">
                        <i class="fa-solid fa-xmark"></i> Deselect All
                    </button>
                    <button class="image-selection-btn regenerate" id="btn-img-regenerate" title="Discard current results and generate again">
                        <i class="fa-solid fa-rotate"></i> Regenerate All
                    </button>
                    <button class="image-selection-btn hidden" id="btn-img-retry" title="Retry only failed generations">
                        <i class="fa-solid fa-arrows-rotate"></i> Retry Failed
                    </button>
                    <button class="image-selection-btn" id="btn-edit-prompt" title="Edit the working prompt">
                        <i class="fa-solid fa-pen-to-square"></i> Edit Prompt
                    </button>
                </div>
                <div class="image-selection-toolbar-group">
                    ${modelSelector}
                    <div class="image-selection-count">
                        <span><i class="fa-solid fa-hashtag"></i> Count:</span>
                        <input type="number" id="img-count-input" min="1" max="12" step="1" value="${count}">
                    </div>
                    <div class="image-selection-destination">
                        <span><i class="fa-solid fa-location-arrow"></i> Destination:</span>
                        <select id="img-dest-select">
                            <option value="new">New Message</option>
                            <option value="current">Current Message</option>
                        </select>
                    </div>
                </div>
            </div>
        `;

        const promptEditor = `
            <div class="image-selection-prompt-editor hidden" id="prompt-editor-container">
                <textarea id="img-prompt-editor" class="text_pole" placeholder="Edit image prompt...">${this.editedPrompt}</textarea>
                <div class="prompt-editor-actions">
                    <button class="image-selection-btn primary" id="btn-prompt-rewrite" title="Have the AI rewrite the prompt based on context">
                        <i class="fa-solid fa-wand-magic-sparkles"></i> Rewrite Prompt
                    </button>
                    <button class="image-selection-btn primary" id="btn-prompt-apply">Apply & Regenerate</button>
                    <button class="image-selection-btn" id="btn-prompt-close">Close</button>
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
                    <div class="image-slot-selection-indicator fa-solid fa-circle-check"></div>
                </div>
            `;
        }
        const grid = `<div class="image-selection-grid count-${count}" id="image-grid">${gridItems}</div>`;

        const footer = `
            <div class="image-selection-footer">
                <button id="btn-img-cancel" class="menu_button">Cancel</button>
                <button id="btn-img-confirm" class="menu_button menu_button_icon primary"><i class="fa-solid fa-check"></i> Keep Selected</button>
            </div>
        `;

        const lightbox = `
            <div id="image-selection-lightbox" class="image-selection-lightbox hidden">
                <div id="lightbox-prev" class="lightbox-nav-btn prev fa-solid fa-chevron-left"></div>
                <div id="lightbox-next" class="lightbox-nav-btn next fa-solid fa-chevron-right"></div>
                <div class="lightbox-content">
                    <img id="lightbox-img" src="" alt="Enlarged view" />
                    <div id="lightbox-select" class="lightbox-select-btn fa-solid fa-circle-check"></div>
                </div>
            </div>
        `;

        return `<div class="image-selection-dialog">${header}${toolbar}${promptEditor}${grid}${footer}${lightbox}</div>`;
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
                this.domElements.regenerate =
                    container.querySelector('#btn-img-regenerate') ||
                    document.querySelector('#btn-img-regenerate');
                this.domElements.retryFailed =
                    container.querySelector('#btn-img-retry') ||
                    document.querySelector('#btn-img-retry');
                this.domElements.modelSelect =
                    container.querySelector('#img-model-select') ||
                    document.querySelector('#img-model-select');
                this.domElements.countInput =
                    container.querySelector('#img-count-input') ||
                    document.querySelector('#img-count-input');
                this.domElements.editPromptBtn =
                    container.querySelector('#btn-edit-prompt') ||
                    document.querySelector('#btn-edit-prompt');
                this.domElements.promptEditorContainer =
                    container.querySelector('#prompt-editor-container') ||
                    document.querySelector('#prompt-editor-container');
                this.domElements.promptTextarea =
                    container.querySelector('#img-prompt-editor') ||
                    document.querySelector('#img-prompt-editor');
                this.domElements.promptRewriteBtn =
                    container.querySelector('#btn-prompt-rewrite') ||
                    document.querySelector('#btn-prompt-rewrite');
                this.domElements.promptApplyBtn =
                    container.querySelector('#btn-prompt-apply') ||
                    document.querySelector('#btn-prompt-apply');
                this.domElements.promptCloseBtn =
                    container.querySelector('#btn-prompt-close') ||
                    document.querySelector('#btn-prompt-close');
                this.domElements.lightbox =
                    container.querySelector('#image-selection-lightbox') ||
                    document.querySelector('#image-selection-lightbox');
                this.domElements.lightboxImg =
                    container.querySelector('#lightbox-img') ||
                    document.querySelector('#lightbox-img');
                this.domElements.lightboxSelect =
                    container.querySelector('#lightbox-select') ||
                    document.querySelector('#lightbox-select');
                this.domElements.lightboxPrev =
                    container.querySelector('#lightbox-prev') ||
                    document.querySelector('#lightbox-prev');
                this.domElements.lightboxNext =
                    container.querySelector('#lightbox-next') ||
                    document.querySelector('#lightbox-next');
                this.domElements.manualClose =
                    container.querySelector('#manual-close-dialog') ||
                    document.querySelector('#manual-close-dialog');

                this._attachListeners();
                this._syncGrid();
                this._updateUIState();
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
                    const isMobile = window.innerWidth < 800;

                    if (isMobile) {
                        manualWrapper.style.setProperty('top', '0', 'important');
                        manualWrapper.style.setProperty('left', '0', 'important');
                        manualWrapper.style.setProperty('width', '100vw', 'important');
                        manualWrapper.style.setProperty('height', '100vh', 'important');
                        manualWrapper.style.setProperty('height', '100dvh', 'important');
                        manualWrapper.style.setProperty('transform', 'none', 'important');
                        manualWrapper.style.setProperty('border-radius', '0', 'important');
                        manualWrapper.style.setProperty('padding', '0', 'important');
                        manualWrapper.style.setProperty('margin', '0', 'important');
                    } else {
                        manualWrapper.style.top = '5%';
                        manualWrapper.style.left = '50%';
                        manualWrapper.style.transform = 'translateX(-50%)';
                        manualWrapper.style.width = '90%';
                        manualWrapper.style.height = '90%';
                        manualWrapper.style.maxWidth = '1200px';
                        manualWrapper.style.maxHeight = '90vh';
                        manualWrapper.style.borderRadius = '12px';
                        manualWrapper.style.padding = '0';
                    }

                    manualWrapper.style.setProperty('z-index', '2147483647', 'important');
                    manualWrapper.style.setProperty('position', 'fixed', 'important');
                    manualWrapper.style.background = 'rgba(20, 20, 30, 0.98)';
                    manualWrapper.style.border =
                        '1px solid var(--SmartThemeBorder, #444)';
                    manualWrapper.style.boxShadow = '0 0 50px rgba(0,0,0,0.8)';
                    manualWrapper.style.display = 'flex';
                    manualWrapper.style.flexDirection = 'column';
                    manualWrapper.style.boxSizing = 'border-box';
                    manualWrapper.style.overflow = 'hidden';
                    manualWrapper.style.pointerEvents = 'all';

                    manualWrapper.innerHTML = `<div id="manual-close-dialog" class="fa-solid fa-circle-xmark manual-dialog-close"></div>${this.content}`;
                    const innerDialog = manualWrapper.querySelector(
                        '.image-selection-dialog',
                    );
                    if (innerDialog) {
                        innerDialog.style.height = '100%';
                        innerDialog.style.width = '100%';
                    }
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
                    
                    if (e.target.closest('.image-slot-selection-indicator')) {
                        e.stopPropagation();
                        this._toggleSelection(index);
                        return;
                    }

                    this._showLightbox(index);
                }
            });
        }

        if (this.domElements.lightbox) {
            this.domElements.lightbox.addEventListener('click', (e) => {
                if (e.target.id === 'lightbox-select') {
                    const index = parseInt(
                        this.domElements.lightbox.dataset.index,
                        10,
                    );
                    this._toggleSelection(index);
                    this._updateLightboxSelectState(index);
                    return;
                }
                if (e.target.id === 'lightbox-prev') {
                    e.stopPropagation();
                    this._navigateLightbox(-1);
                    return;
                }
                if (e.target.id === 'lightbox-next') {
                    e.stopPropagation();
                    this._navigateLightbox(1);
                    return;
                }
                this._hideLightbox();
            });
        }

        if (this.domElements.modelSelect) {
            this.domElements.modelSelect.addEventListener('change', (e) => {
                this.selectedModelId = e.target.value;
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

        if (this.domElements.regenerate) {
            this.domElements.regenerate.addEventListener('click', () =>
                this._handleRegenerateAll(),
            );
        }

        if (this.domElements.retryFailed) {
            this.domElements.retryFailed.addEventListener('click', () =>
                this._handleRetryFailed(),
            );
        }

        if (this.domElements.manualClose) {
            this.domElements.manualClose.addEventListener('click', () =>
                this._handleClosing(),
            );
        }

        if (this.domElements.countInput) {
            this.domElements.countInput.addEventListener('change', (e) => {
                this._handleCountChange(parseInt(e.target.value, 10));
            });
        }

        if (this.domElements.editPromptBtn) {
            this.domElements.editPromptBtn.addEventListener('click', () => {
                this.domElements.promptEditorContainer.classList.toggle('hidden');
            });
        }

        if (this.domElements.promptCloseBtn) {
            this.domElements.promptCloseBtn.addEventListener('click', () => {
                this.domElements.promptEditorContainer.classList.add('hidden');
            });
        }

        if (this.domElements.promptApplyBtn) {
            this.domElements.promptApplyBtn.addEventListener('click', () => {
                this.domElements.promptEditorContainer.classList.add('hidden');
                this._handleRegenerateAll();
            });
        }

        if (this.domElements.promptRewriteBtn) {
            this.domElements.promptRewriteBtn.addEventListener('click', () => {
                this._handlePromptRewrite();
            });
        }

        if (this.domElements.promptTextarea) {
            this.domElements.promptTextarea.addEventListener('input', (e) => {
                this.editedPrompt = e.target.value;
            });
        }

        this._keydownHandler = (e) => {
            if (this.domElements.lightbox && !this.domElements.lightbox.classList.contains('hidden')) {
                if (e.key === 'ArrowLeft') {
                    this._navigateLightbox(-1);
                } else if (e.key === 'ArrowRight') {
                    this._navigateLightbox(1);
                } else if (e.key === 'Escape') {
                    this._hideLightbox();
                }
            }
        };
        window.addEventListener('keydown', this._keydownHandler);
    }

    _showLightbox(index) {
        const slot = this.slots[index];
        if (!slot || slot.status !== 'success') return;

        if (this.domElements.lightbox && this.domElements.lightboxImg) {
            this.domElements.lightbox.dataset.index = index;
            this.domElements.lightboxImg.src = slot.result.result;
            this.domElements.lightbox.classList.remove('hidden');
            
            const container = this.domElements.grid?.closest('.manual-overlay') || 
                            this.domElements.grid?.closest('.image-selection-popup') ||
                            this.domElements.grid?.closest('.image-selection-dialog');
            if (container) {
                container.classList.add('lightbox-active');
            }
            
            this._updateLightboxSelectState(index);
            this._updateLightboxNavState(index);
        }
    }

    _navigateLightbox(direction) {
        const currentIndex = parseInt(this.domElements.lightbox.dataset.index, 10);
        if (isNaN(currentIndex)) return;

        let nextIndex = currentIndex + direction;
        
        while (nextIndex >= 0 && nextIndex < this.slots.length) {
            if (this.slots[nextIndex] && this.slots[nextIndex].status === 'success') {
                this._showLightbox(nextIndex);
                break;
            }
            nextIndex += direction;
        }
    }

    _updateLightboxNavState(index) {
        if (this.domElements.lightboxPrev && this.domElements.lightboxNext) {
            let hasPrev = false;
            for (let i = index - 1; i >= 0; i--) {
                if (this.slots[i] && this.slots[i].status === 'success') {
                    hasPrev = true;
                    break;
                }
            }

            let hasNext = false;
            for (let i = index + 1; i < this.slots.length; i++) {
                if (this.slots[i] && this.slots[i].status === 'success') {
                    hasNext = true;
                    break;
                }
            }

            this.domElements.lightboxPrev.classList.toggle('disabled', !hasPrev);
            this.domElements.lightboxNext.classList.toggle('disabled', !hasNext);
        }
    }

    _hideLightbox() {
        if (this.domElements.lightbox) {
            this.domElements.lightbox.classList.add('hidden');
            
            const container = this.domElements.grid?.closest('.manual-overlay') || 
                            this.domElements.grid?.closest('.image-selection-popup') ||
                            this.domElements.grid?.closest('.image-selection-dialog');
            if (container) {
                container.classList.remove('lightbox-active');
            }
        }
    }

    _updateLightboxSelectState(index) {
        if (this.domElements.lightboxSelect) {
            const isSelected = this.selectedIndices.has(index);
            this.domElements.lightboxSelect.classList.toggle(
                'selected',
                isSelected,
            );
        }
    }

    async _startGeneration(prompts, options) {
        this.isGenerating = true;

        // Apply model override if selected in dialog
        const genOptions = { ...options };
        if (this.selectedModelId) {
            genOptions.modelId = this.selectedModelId;
            // If modelId is set, the ParallelGenerator worker will use it
        }

        this.generator = this.generatorFactory(genOptions);

        this.generator.onProgress((data) => {
            this._updateSlot(data.taskIndex, data.result);
        });

        try {
            await this.generator.run(prompts, genOptions);
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
                <div class="image-slot-selection-indicator fa-solid fa-circle-check"></div>
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
                <div class="image-slot-selection-indicator fa-solid fa-circle-check"></div>
            `;
        }
    }

    _updateSlot(index, result) {
        this.slots[index] = {
            status: result.status === 'ok' ? 'success' : 'error',
            result: result,
        };

        this._renderSlot(index);
        this._updateUIState();
    }

    _toggleSelection(index, forceState = null, skipUiUpdate = false) {
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

        const slotEl = this.domElements.grid.querySelector(
            `.image-slot[data-index="${index}"]`,
        );
        if (slotEl) {
            slotEl.classList.toggle('selected', newState);
        }

        if (
            this.domElements.lightbox &&
            !this.domElements.lightbox.classList.contains('hidden')
        ) {
            if (
                parseInt(this.domElements.lightbox.dataset.index, 10) === index
            ) {
                this._updateLightboxSelectState(index);
            }
        }

        if (!skipUiUpdate) {
            this._updateUIState();
        }
    }

    _selectAll() {
        this.slots.forEach((slot, index) => {
            if (slot.status === 'success') {
                this._toggleSelection(index, true, true);
            }
        });
        this._updateUIState();
    }

    _deselectAll() {
        this.slots.forEach((_, index) => {
            this._toggleSelection(index, false, true);
        });
        this._updateUIState();
    }

    _removeManualOverlay() {
        const overlay = document.querySelector(
            '.image-selection-popup.manual-overlay',
        );
        if (overlay) {
            overlay.remove();
        }
    }

    _handleCountChange(newCount) {
        const val = parseInt(newCount, 10);
        if (isNaN(val) || val < 1) return;
        this.currentCount = val;
    }

    _handleRegenerateAll() {
        if (this.isGenerating) {
            this.generator.abort();
        }

        this.selectedIndices.clear();
        
        const singlePrompt = this.editedPrompt;
        this.prompts = new Array(this.currentCount).fill(singlePrompt);

        this.slots = new Array(this.prompts.length)
            .fill(null)
            .map(() => ({ status: 'pending' }));

        if (this.domElements.grid) {
            this.domElements.grid.scrollTo({ top: 0, behavior: 'smooth' });
            this.domElements.grid.className = `image-selection-grid count-${this.prompts.length}`;
            
            let gridItems = '';
            for (let i = 0; i < this.prompts.length; i++) {
                gridItems += `
                    <div class="image-slot pending" data-index="${i}">
                        <div class="image-slot-status">
                            <i class="fa-solid fa-circle-notch fa-spin"></i>
                            <span>Generating...</span>
                        </div>
                        <div class="image-slot-overlay"></div>
                        <div class="image-slot-selection-indicator fa-solid fa-circle-check"></div>
                    </div>
                `;
            }
            this.domElements.grid.innerHTML = gridItems;
        }

        this._updateUIState();
        this._startGeneration(this.prompts, this.generatorOptions);
    }

    _handleRetryFailed() {
        if (this.isGenerating) {
            this.generator.abort();
        }

        const failedIndices = this.slots
            .map((s, i) => (s.status === 'error' ? i : null))
            .filter((i) => i !== null);

        if (failedIndices.length === 0) return;

        const retryPrompts = failedIndices.map((i) => ({
            prompt: this.prompts[i],
            index: i,
        }));

        failedIndices.forEach((index) => {
            this.slots[index] = { status: 'pending' };
            const slotEl = this.domElements.grid.querySelector(
                `.image-slot[data-index="${index}"]`,
            );
            if (slotEl) {
                slotEl.className = 'image-slot pending';
                slotEl.innerHTML = `
                    <div class="image-slot-status">
                        <i class="fa-solid fa-circle-notch fa-spin"></i>
                        <span>Retrying...</span>
                    </div>
                    <div class="image-slot-overlay"></div>
                    <div class="image-slot-selection-indicator fa-solid fa-circle-check"></div>
                `;
            }
        });

        this._updateUIState();
        this._startGeneration(retryPrompts, this.generatorOptions);
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
        this._cleanup();
        this._removeManualOverlay();
    }

    _handleCancel() {
        if (this.isGenerating) {
            this.generator.abort();
        }
        if (this.rejectPromise) {
            this.rejectPromise(new Error('Cancelled'));
        }
        this.rejectPromise = null;
        this.resolvePromise = null;

        if (this.popup && typeof this.popup.hide === 'function') {
            this.popup.hide();
        }
        this._cleanup();
        this._removeManualOverlay();
    }

    _handleClosing() {
        if (this.isGenerating) {
            const confirmClose = confirm(
                'Generation is still in progress. Are you sure you want to close?',
            );
            if (!confirmClose) {
                return;
            }
            this.generator.abort();
        }

        if (this.rejectPromise) {
            this.rejectPromise(new Error('Closed'));
        }
        this.rejectPromise = null;
        this.resolvePromise = null;
        this._cleanup();
        this._removeManualOverlay();
    }
    
    _cleanup() {
        if (this._keydownHandler) {
            window.removeEventListener('keydown', this._keydownHandler);
            this._keydownHandler = null;
        }
    }
    
    _updateUIState() {
        if (!this.domElements.confirm) return;

        const selectedCount = this.selectedIndices.size;
        const totalSuccess = this.slots.filter(
            (s) => s.status === 'success',
        ).length;

        this.domElements.confirm.disabled = selectedCount === 0;

        const btnText =
            selectedCount > 0
                ? `Keep Selected (${selectedCount})`
                : 'Keep Selected';
        this.domElements.confirm.innerHTML = `<i class="fa-solid fa-check"></i> ${btnText}`;

        if (this.domElements.selectAll) {
            this.domElements.selectAll.disabled =
                totalSuccess === 0 || selectedCount === totalSuccess;
        }

        if (this.domElements.deselectAll) {
            this.domElements.deselectAll.disabled = selectedCount === 0;
        }

        if (this.domElements.retryFailed) {
            const hasErrors = this.slots.some((s) => s.status === 'error');
            this.domElements.retryFailed.classList.toggle(
                'hidden',
                !hasErrors || this.isGenerating,
            );
        }
    }

    async _handlePromptRewrite() {
        if (!this.onRewrite || this.isRewriting) return;

        const originalText = this.domElements.promptRewriteBtn.innerHTML;
        try {
            this.isRewriting = true;
            this.domElements.promptRewriteBtn.disabled = true;
            this.domElements.promptRewriteBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Rewriting...';

            const rewritten = await this.onRewrite(this.editedPrompt);
            if (rewritten) {
                this.editedPrompt = rewritten;
                if (this.domElements.promptTextarea) {
                    this.domElements.promptTextarea.value = rewritten;
                }
            }
        } catch (error) {
            console.error('[ImageSelectionDialog] Rewrite failed:', error);
        } finally {
            this.isRewriting = false;
            this.domElements.promptRewriteBtn.disabled = false;
            this.domElements.promptRewriteBtn.innerHTML = originalText;
        }
    }
}
