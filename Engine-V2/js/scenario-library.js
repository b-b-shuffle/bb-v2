/**
 * B&B Shuffle - Scenario Library Controller
 * ------------------------------------------------------------------
 * Browses the scenarios the site ships with (`shared/demo/`) and hands one to
 * the Player or the Scenario Editor. This build is a read-only demo, so there is
 * deliberately no import, edit or delete here — the demo API refuses writes
 * anyway (see `shared/js/local-api.js`).
 */

const ScenarioLibrary = {
    // State
    scenarios: [],
    filteredScenarios: [],
    selectedScenario: null,
    currentView: 'grid',

    /**
     * Initialize the library
     */
    async init() {
        Utils.buildDeckOptions('deck-filter', { placeholder: 'All Decks' });
        this.bindEvents();
        await this.loadScenarios();
        this.render();
        this.selectFromUrl();
    },

    /**
     * A shareable link that opens one scenario on the Player board.
     * @param {Object} scenario - Scenario to link to
     * @returns {string} Absolute URL
     */
    shareUrlFor(scenario) {
        const url = new URL('player.html', window.location.href);
        if (scenario && scenario.id) url.searchParams.set('scenario', scenario.id);
        return url.toString();
    },

    /**
     * `?scenario=<id>` — the link the Copy-link button produces — arrives with
     * that scenario already selected, so the recipient needs one click to Play.
     */
    selectFromUrl() {
        const params = Utils.getQueryParams();
        const id = params.scenario || params.scenarioId;
        if (!id) return;

        const scenario = this.scenarios.find(s => s.id === id);
        if (!scenario) {
            Utils.showToast('That scenario link is not in the demo library.', 'error');
            return;
        }

        this.selectScenario(scenario.id);
        const el = document.querySelector(`[data-scenario-id="${(window.CSS && CSS.escape) ? CSS.escape(id) : id}"]`);
        if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    },

    /**
     * Bind event listeners
     */
    bindEvents() {
        // Search
        const searchInput = Utils.getElement('search-input');
        if (searchInput) {
            searchInput.addEventListener('input', Utils.debounce(() => {
                this.filterScenarios();
            }, 300));
        }

        // Filters
        const deckFilter = Utils.getElement('deck-filter');
        const difficultyFilter = Utils.getElement('difficulty-filter');
        if (deckFilter) deckFilter.addEventListener('change', () => this.filterScenarios());
        if (difficultyFilter) difficultyFilter.addEventListener('change', () => this.filterScenarios());

        // Box art for the filtered deck, beside the filter itself (the art comes
        // from CONFIG.decks[].cover — shared/img/decks/<key>.webp). "All Decks"
        // has no key, so the image simply hides.
        const deckCover = Utils.getElement('deck-filter-cover');
        const updateDeckCover = () => {
            if (!deckCover) return;
            const key = deckFilter ? deckFilter.value : '';
            const cfg = (key && typeof CONFIG !== 'undefined' && CONFIG.decks) ? CONFIG.decks[key] : null;
            if (cfg && cfg.cover) {
                if (deckCover.getAttribute('src') !== cfg.cover) deckCover.setAttribute('src', cfg.cover);
                deckCover.alt = (cfg.name || key) + ' box art';
                Utils.showElement(deckCover);
            } else {
                deckCover.removeAttribute('src');
                Utils.hideElement(deckCover);
            }
        };
        if (deckFilter) deckFilter.addEventListener('change', updateDeckCover);
        updateDeckCover();

        // View toggle
        Utils.$$('.view-toggle-btn').forEach(btn => {
            btn.addEventListener('click', () => this.setView(btn.dataset.view));
        });

        // Action bar buttons
        Utils.getElement('play-btn')?.addEventListener('click', () => this.playSelectedScenario());
        Utils.getElement('load-btn')?.addEventListener('click', () => this.loadSelectedScenario());
        Utils.getElement('export-btn')?.addEventListener('click', () => this.exportSelectedScenario());
        Utils.getElement('share-btn')?.addEventListener('click', () => this.copySelectedLink());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.deselectScenario();
        });
    },

    /**
     * Load the demo scenarios (served by shared/js/local-api.js).
     */
    async loadScenarios() {
        try {
            this.scenarios = await ScenarioIO.listFromServer();
        } catch (error) {
            console.error('Failed to load the demo scenarios:', error);
            this.scenarios = [];
        }
        this.filterScenarios();
    },

    /**
     * Filter scenarios based on search and filters
     */
    filterScenarios() {
        const search = Utils.getElement('search-input')?.value.toLowerCase() || '';
        const deckFilter = Utils.getElement('deck-filter')?.value || '';
        const difficultyFilter = Utils.getElement('difficulty-filter')?.value || '';

        this.filteredScenarios = this.scenarios.filter(scenario => {
            // Search filter
            const matchesSearch = !search ||
                scenario.metadata?.name?.toLowerCase().includes(search) ||
                scenario.metadata?.description?.toLowerCase().includes(search) ||
                scenario.metadata?.author?.toLowerCase().includes(search) ||
                scenario.metadata?.tags?.some(t => t.toLowerCase().includes(search));

            // Deck filter
            const matchesDeck = !deckFilter || scenario.deck?.key === deckFilter;

            // Difficulty filter
            const matchesDifficulty = !difficultyFilter ||
                scenario.metadata?.difficulty === parseInt(difficultyFilter);

            return matchesSearch && matchesDeck && matchesDifficulty;
        });

        this.render();
    },

    /**
     * Set view mode
     * @param {string} view - 'grid' or 'list'
     */
    setView(view) {
        this.currentView = view;

        // Update toggle buttons
        Utils.$$('.view-toggle-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === view);
        });

        // Toggle containers
        Utils.toggleElement('scenario-grid', view === 'grid');
        Utils.toggleElement('scenario-list', view === 'list');

        this.render();
    },

    /**
     * Render scenarios
     */
    render() {
        const grid = Utils.getElement('scenario-grid');
        const list = Utils.getElement('scenario-list');
        const empty = Utils.getElement('empty-state');
        const countBadge = Utils.getElement('scenario-count');

        // Update count
        if (countBadge) {
            countBadge.textContent = `${this.filteredScenarios.length} scenario${this.filteredScenarios.length !== 1 ? 's' : ''}`;
        }

        // Show empty state if no scenarios
        if (this.filteredScenarios.length === 0) {
            Utils.hideElement(grid);
            Utils.hideElement(list);
            Utils.showElement(empty);
            return;
        }

        Utils.hideElement(empty);

        if (this.currentView === 'grid') {
            Utils.showElement(grid);
            Utils.hideElement(list);
            grid.innerHTML = this.filteredScenarios.map(s => this.renderGridCard(s)).join('');
        } else {
            Utils.hideElement(grid);
            Utils.showElement(list);
            list.innerHTML = this.filteredScenarios.map(s => this.renderListItem(s)).join('');
        }

        // Bind click events to scenario items
        Utils.$$('[data-scenario-id]').forEach(el => {
            el.addEventListener('click', () => this.selectScenario(el.dataset.scenarioId));
        });
    },

    /**
     * Render grid card
     * @param {Object} scenario - Scenario data
     * @returns {string} HTML string
     */
    renderGridCard(scenario) {
        const isSelected = this.selectedScenario?.id === scenario.id;
        const difficulty = scenario.metadata?.difficulty || 3;
        const tags = scenario.metadata?.tags || [];

        return `
            <div class="scenario-card ${isSelected ? 'selected' : ''}" data-scenario-id="${scenario.id}">
                <div class="scenario-card-preview">
                    ${this.renderMiniCards(scenario)}
                </div>
                <div class="scenario-card-body">
                    <div class="scenario-card-title">
                        ${Utils.escapeHtml(scenario.metadata?.name || 'Untitled')}
                    </div>
                    <div class="scenario-card-meta">
                        <span class="scenario-card-meta-item">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="2" y="7" width="20" height="14" rx="2" />
                                <path d="M16 7V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v3" />
                            </svg>
                            ${Utils.escapeHtml(scenario.deck?.name || 'Unknown Deck')}
                        </span>
                        ${scenario.metadata?.author ? `
                        <span class="scenario-card-meta-item">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                                <circle cx="12" cy="7" r="4" />
                            </svg>
                            ${Utils.escapeHtml(scenario.metadata.author)}
                        </span>
                        ` : ''}
                    </div>
                    <div class="scenario-card-meta">
                        <span class="scenario-card-meta-item">
                            ${this.renderDifficulty(difficulty)}
                        </span>
                        <span class="scenario-card-meta-item">
                            ${Utils.formatRelativeTime(scenario.metadata?.modifiedAt || scenario.metadata?.createdAt)}
                        </span>
                    </div>
                    ${scenario.metadata?.description ? `
                    <div class="scenario-card-description">
                        ${Utils.escapeHtml(scenario.metadata.description)}
                    </div>
                    ` : ''}
                    ${this.renderConsultants(scenario)}
                    ${tags.length > 0 ? `
                    <div class="scenario-card-tags">
                        ${tags.slice(0, 3).map(tag => `<span class="scenario-tag">${Utils.escapeHtml(tag)}</span>`).join('')}
                        ${tags.length > 3 ? `<span class="scenario-tag">+${tags.length - 3}</span>` : ''}
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    },

    /**
     * Render list item
     * @param {Object} scenario - Scenario data
     * @returns {string} HTML string
     */
    renderListItem(scenario) {
        const isSelected = this.selectedScenario?.id === scenario.id;
        const difficulty = scenario.metadata?.difficulty || 3;

        return `
            <div class="scenario-list-item ${isSelected ? 'selected' : ''}" data-scenario-id="${scenario.id}">
                <div class="scenario-list-preview">
                    ${this.renderMiniCards(scenario)}
                </div>
                <div class="scenario-list-content">
                    <div class="scenario-list-title">
                        ${Utils.escapeHtml(scenario.metadata?.name || 'Untitled')}
                        ${this.renderDifficulty(difficulty)}
                    </div>
                    <div class="scenario-list-meta">
                        <span>${Utils.escapeHtml(scenario.deck?.name || 'Unknown Deck')}</span>
                        ${scenario.metadata?.author ? `<span>by ${Utils.escapeHtml(scenario.metadata.author)}</span>` : ''}
                        <span>${Utils.formatRelativeTime(scenario.metadata?.modifiedAt || scenario.metadata?.createdAt)}</span>
                    </div>
                    ${this.renderConsultants(scenario)}
                </div>
            </div>
        `;
    },

    /**
     * Render mini card previews
     * @param {Object} scenario - Scenario data
     * @returns {string} HTML string
     */
    renderMiniCards(scenario) {
        const types = ['initial', 'pivot', 'c2', 'persist'];
        return types.map(type => {
            const card = scenario.scenario?.[type];
            if (card?.image) {
                return `<div class="mini-card"><img src="${Utils.assetPath(card.image)}" alt="${card.name || type}" onerror="Utils.onImgError(event)"></div>`;
            }
            return `<div class="mini-card" style="background: var(--color-${type})"></div>`;
        }).join('');
    },

    /**
     * Render the "Call a Consultant" line for a scenario: the consultant in
     * play (or the pool size) plus a couple of the other available names.
     * Returns '' for scenarios that define no consultants.
     * @param {Object} scenario - Scenario data
     * @returns {string} HTML string
     */
    renderConsultants(scenario) {
        const selected = scenario?.consultant || null;
        const pool = Array.isArray(scenario?.consultants) ? scenario.consultants : [];
        if (!selected && !pool.length) return '';

        const icon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>`;
        const label = selected
            ? `Consultant: ${Utils.escapeHtml(selected.name || 'Unknown')}`
            : `${pool.length} consultant${pool.length === 1 ? '' : 's'} available`;
        const others = pool
            .filter(c => !selected || String(c.id) !== String(selected.id))
            .slice(0, 2)
            .map(c => `<span class="scenario-tag consultant-tag">${Utils.escapeHtml(c.name || 'Consultant')}</span>`)
            .join('');

        return `
            <div class="scenario-card-tags consultant-tags">
                <span class="consultant-chip${selected ? ' lead' : ''}">${icon}${label}</span>
                ${others}
            </div>
        `;
    },

    /**
     * Render difficulty indicator
     * @param {number} level - Difficulty level 1-5
     * @returns {string} HTML string
     */
    renderDifficulty(level) {
        const dots = [];
        for (let i = 1; i <= 5; i++) {
            const filled = i <= level;
            const high = level >= 4 && filled;
            dots.push(`<span class="difficulty-dot ${filled ? 'filled' : ''} ${high ? 'high' : ''}"></span>`);
        }
        return `<span class="difficulty-rating">${dots.join('')}</span>`;
    },

    /**
     * Select a scenario
     * @param {string} id - Scenario UUID
     */
    selectScenario(id) {
        const scenario = this.scenarios.find(s => s.id === id);

        if (this.selectedScenario?.id === id) {
            // Deselect if clicking same item
            this.deselectScenario();
            return;
        }

        this.selectedScenario = scenario;

        // Update UI
        Utils.$$('[data-scenario-id]').forEach(el => {
            el.classList.toggle('selected', el.dataset.scenarioId === id);
        });

        // Show action bar
        const actionBar = Utils.getElement('action-bar');
        const selectedName = Utils.getElement('selected-name');
        if (actionBar) actionBar.classList.add('visible');
        if (selectedName) selectedName.textContent = scenario?.metadata?.name || 'Untitled';
    },

    /**
     * Deselect current scenario
     */
    deselectScenario() {
        this.selectedScenario = null;

        Utils.$$('[data-scenario-id]').forEach(el => {
            el.classList.remove('selected');
        });

        const actionBar = Utils.getElement('action-bar');
        if (actionBar) actionBar.classList.remove('visible');
    },

    /**
     * Load selected scenario into game
     */
    loadSelectedScenario() {
        if (!this.selectedScenario) return;

        // Store in localStorage for the game to pick up
        Utils.saveToStorage('bb-loaded-scenario', this.selectedScenario);

        // Redirect to admin page
        window.location.href = 'admin.html?loadScenario=true';
    },

    /**
     * Play the selected scenario on the Player board
     */
    playSelectedScenario() {
        if (!this.selectedScenario) return;

        // Store for the player + broadcast to an already-open Player, then open it
        // with the scenario in the URL so the address bar itself is shareable.
        Utils.saveToStorage('bb-current-scenario', this.selectedScenario);
        if (window.SessionSync && typeof window.SessionSync.broadcastScenario === 'function') {
            window.SessionSync.broadcastScenario(this.selectedScenario);
        }
        window.location.href = this.shareUrlFor(this.selectedScenario);
    },

    /**
     * Copy a link that opens the selected scenario straight on the Player board.
     */
    async copySelectedLink() {
        if (!this.selectedScenario) return;
        const url = this.shareUrlFor(this.selectedScenario);

        try {
            await navigator.clipboard.writeText(url);
            Utils.showToast('Link copied — it opens this scenario on the Player board.', 'success');
        } catch (error) {
            // The clipboard API needs a secure context; showing the link is the
            // honest fallback (file:// previews and older browsers land here).
            console.warn('Clipboard unavailable, showing the link instead:', error);
            window.prompt('Copy this link:', url);
        }
    },

    /**
     * Export selected scenario to file
     */
    exportSelectedScenario() {
        if (!this.selectedScenario) return;
        ScenarioIO.exportToFile(this.selectedScenario);
        Utils.showToast('Scenario exported successfully', 'success');
    }
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    ScenarioLibrary.init();
});
