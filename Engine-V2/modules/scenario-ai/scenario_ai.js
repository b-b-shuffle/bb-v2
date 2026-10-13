/**
 * B&B Shuffle - AI Scenario Generator
 * Uses LLM APIs to generate game scenarios
 *
 * This build is a static, read-only demo, so generation always runs against the
 * visitor's own provider key (stored in localStorage). The server-proxied
 * "shared key" feature is disabled — there is no server to hold one, and
 * `/api/ai/*` is not served. See `keyMode()` / `fetchSharedConfig()`.
 */

const ScenarioAI = {
    // State
    cardDatabase: null,
    generatedScenario: null,
    settings: {
        temperature: 0.7,
        maxTokens: 2000
    },
    // Always { available: false, configured: false } in this build.
    shared: {
        available: false,
        configured: false,
        provider: '',
        providerName: '',
        model: '',
        customEndpoint: false
    },

    // Provider configurations. Each entry may also expose a modelsEndpoint so the
    // generator can list the models the supplied API key can actually use.
    providers: {
        openai: {
            name: 'OpenAI',
            endpoint: 'https://api.openai.com/v1/chat/completions',
            modelsEndpoint: 'https://api.openai.com/v1/models',
            models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo']
        },
        anthropic: {
            name: 'Anthropic',
            endpoint: 'https://api.anthropic.com/v1/messages',
            modelsEndpoint: 'https://api.anthropic.com/v1/models',
            models: ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307']
        },
        mistral: {
            name: 'Mistral',
            endpoint: 'https://api.mistral.ai/v1/chat/completions',
            modelsEndpoint: 'https://api.mistral.ai/v1/models',
            models: ['mistral-large-latest', 'mistral-small-latest', 'open-mistral-nemo', 'codestral-latest']
        },
        xai: {
            name: 'xAI (Grok)',
            endpoint: 'https://api.x.ai/v1/chat/completions',
            modelsEndpoint: 'https://api.x.ai/v1/models',
            models: ['grok-3', 'grok-3-mini', 'grok-3-mini-fast', 'grok-2-latest']
        },
        perplexity: {
            name: 'Perplexity',
            endpoint: 'https://api.perplexity.ai/chat/completions',
            modelsEndpoint: 'https://api.perplexity.ai/models',
            models: ['sonar', 'sonar-pro', 'sonar-reasoning']
        },
        groq: {
            name: 'Groq',
            endpoint: 'https://api.groq.com/openai/v1/chat/completions',
            modelsEndpoint: 'https://api.groq.com/openai/v1/models',
            models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'llama-3.1-70b-versatile', 'gemma2-9b-it']
        },
        deepseek: {
            name: 'DeepSeek',
            endpoint: 'https://api.deepseek.com/chat/completions',
            modelsEndpoint: 'https://api.deepseek.com/models',
            models: ['deepseek-chat', 'deepseek-reasoner']
        },
        gemini: {
            name: 'Google Gemini',
            endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
            modelsEndpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/models',
            models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash']
        },
        // A model that runs in the browser on WebGPU (see webllm-provider.js).
        // Keyless and address-less: callAPI routes it to WebLLM instead of fetch.
        // The curated ids mirror WebLLMProvider.MODELS, with literals as the
        // fallback for a page that did not load the provider script.
        webllm: {
            name: 'In-browser model (no API key)',
            endpoint: '',
            modelsEndpoint: '',
            defaultModel: 'SmolLM2-1.7B-Instruct-q4f16_1-MLC',
            models: (typeof WebLLMProvider !== 'undefined')
                ? WebLLMProvider.MODELS.map(m => m.id)
                : [
                    'SmolLM2-360M-Instruct-q4f16_1-MLC',
                    'SmolLM2-1.7B-Instruct-q4f16_1-MLC',
                    'Llama-3.2-3B-Instruct-q4f16_1-MLC'
                ]
        },
        // Local servers are deliberately NOT a provider of their own: Ollama,
        // LM Studio and llama.cpp all speak the OpenAI-compatible API, so they
        // are the Custom Endpoint. See CUSTOM_ENDPOINTS for the addresses people
        // actually run.
    },

    // Ready-made OpenAI-compatible endpoints for the offline options - the
    // Custom Endpoint's placeholder and hint, so nobody has to remember the
    // `/v1/chat/completions` suffix.
    CUSTOM_ENDPOINTS: [
        { label: 'Ollama', url: 'http://localhost:11434/v1/chat/completions' },
        { label: 'LM Studio', url: 'http://localhost:1234/v1/chat/completions' },
        { label: 'llama.cpp', url: 'http://localhost:8080/v1/chat/completions' }
    ],

    /**
     * Initialize the generator
     */
    async init() {
        Utils.buildDeckOptions('deck-select', { fallback: 'core' });
        this.loadSettings();
        this.bindEvents();
    },

    /**
     * Load settings from storage
     */
    loadSettings() {
        // parseJson must be true: the record is stored stringified, and reading it
        // raw made `saved.provider`/`saved.apiKey` undefined - so nothing was ever
        // restored.
        let saved = Utils.getFromStorage('bb-ai-settings', null, true);
        if (saved && typeof saved === 'object') {
            // Ollama used to be a provider of its own; it is now the Custom
            // Endpoint pointed at its OpenAI-compatible API.
            saved = this.migrateSettings(saved);
            this.settings = { ...this.settings, ...saved };

            // Apply saved settings to UI
            if (saved.provider) {
                Utils.getElement('api-provider').value = saved.provider;
                // Populate the model list for the saved provider
                if (saved.provider === 'custom' || this.providers[saved.provider]) {
                    this.updateProviderUI(saved.provider);
                }
            }
            if (saved.endpoint) Utils.getElement('custom-endpoint').value = saved.endpoint;
            if (saved.model) {
                // A custom endpoint names its model by hand, so it is restored to
                // the free-text field rather than a dropdown it is not in.
                const manual = Utils.getElement('api-model-manual');
                if (saved.provider === 'custom' && manual) manual.value = saved.model;
                else Utils.getElement('api-model').value = saved.model;
            }
            if (saved.apiKey) Utils.getElement('api-key').value = saved.apiKey;
            if (saved.temperature) {
                Utils.getElement('temperature').value = saved.temperature;
                Utils.getElement('temp-value').textContent = saved.temperature;
            }
            if (saved.maxTokens) Utils.getElement('max-tokens').value = saved.maxTokens;

            // A saved full API key (or a local endpoint) -> list its models.
            this.maybeAutoRefreshModels();
        }
    },

    /**
     * Bring an old saved settings record up to date. The only migration: Ollama
     * used to be a provider of its own, and is now the Custom Endpoint aimed at
     * its OpenAI-compatible API, so an existing setup keeps working.
     * @param {Object} saved - Stored settings record
     * @returns {Object} The record to use
     */
    migrateSettings(saved) {
        if (!saved || saved.provider !== 'ollama') return saved;
        return Object.assign({}, saved, {
            provider: 'custom',
            endpoint: saved.endpoint || 'http://localhost:11434/v1/chat/completions',
            model: saved.model || 'llama3'
        });
    },

    /**
     * Save settings to storage
     */
    saveSettings() {
        const provider = Utils.getElement('api-provider').value;
        const manualModel = Utils.getElement('api-model-manual')?.value?.trim() || '';
        const settings = {
            provider,
            // A custom endpoint may name its model by hand, and that name is the
            // one that gets sent - so it is the one worth keeping.
            model: (provider === 'custom' && manualModel) ? manualModel : Utils.getElement('api-model').value,
            apiKey: Utils.getElement('api-key').value,
            // The custom endpoint is part of the setup (it is how a local server
            // is addressed), so it is saved and restored with everything else.
            endpoint: provider === 'custom' ? (Utils.getElement('custom-endpoint')?.value || '').trim() : '',
            temperature: parseFloat(Utils.getElement('temperature').value),
            maxTokens: parseInt(Utils.getElement('max-tokens').value)
        };

        if (Utils.getElement('save-settings').checked) {
            Utils.saveToStorage('bb-ai-settings', settings);
        }

        this.settings = settings;
        this.closeSettingsModal();
        // Saved API key (or a local endpoint) -> refresh the model list.
        this.maybeAutoRefreshModels();
        Utils.showToast('Settings saved', 'success');
    },

    /**
     * Bind event listeners
     */
    bindEvents() {
        // Provider change
        Utils.getElement('api-provider')?.addEventListener('change', (e) => {
            this.updateProviderUI(e.target.value);
            // Pull the live model list when a full API key is already present.
            this.maybeAutoRefreshModels();
        });

        // API key entry -> once a full API key is provided, list the models the
        // account can actually use so the user can pick from them.
        Utils.getElement('api-key')?.addEventListener('input', Utils.debounce(() => {
            const provider = Utils.getElement('api-provider')?.value || 'openai';
            const key = Utils.getElement('api-key')?.value?.trim() || '';
            if (provider === 'custom') return;   // local servers need no key
            if (key.length >= 8) {
                this.refreshModels();
            } else if (!key) {
                // Key removed -> fall back to the curated list for this provider.
                this.populateStaticModels(provider);
                this.setModelHint('Enter your API key to load available models.');
            }
        }, 600));

        // Manual refresh next to the model dropdown (re-queries when a new key or
        // a new endpoint is entered after the auto-load already ran, or the list
        // is stale). Custom endpoints included: they expose /v1/models too.
        Utils.getElement('refresh-models-btn')?.addEventListener('click', () => {
            this.refreshModels();
        });

        // Stop the in-browser model mid-generation (a no-op for other providers).
        Utils.getElement('result-stop-btn')?.addEventListener('click', () => {
            const local = (typeof WebLLMProvider !== 'undefined') ? WebLLMProvider : null;
            if (local) local.interrupt();
        });

        // Picking a model from a custom endpoint's live list keeps the free-text
        // name in step, so the two controls cannot disagree about what is sent.
        Utils.getElement('api-model')?.addEventListener('change', () => {
            // The in-browser panel quotes the chosen model's download size, so it
            // has to be re-rendered when the selection changes.
            if (Utils.getElement('api-provider')?.value === 'webllm') {
                this.renderLocalPanel(true);
                return;
            }
            if (Utils.getElement('api-provider')?.value !== 'custom') return;
            const manual = Utils.getElement('api-model-manual');
            const value = Utils.getElement('api-model')?.value || '';
            if (manual && value) manual.value = value;
        });

        // Generate button
        Utils.getElement('generate-btn')?.addEventListener('click', () => this.generateScenario());

        // Copy button
        Utils.getElement('copy-btn')?.addEventListener('click', () => this.copyToClipboard());

        // Save button
        Utils.getElement('save-btn')?.addEventListener('click', () => this.saveToLibrary());

        // Settings modal
        Utils.getElement('settings-btn')?.addEventListener('click', () => this.openSettingsModal());
        Utils.getElement('settings-modal-close')?.addEventListener('click', () => this.closeSettingsModal());
        Utils.getElement('settings-save-btn')?.addEventListener('click', () => this.saveSettings());
        Utils.getElement('settings-modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'settings-modal') this.closeSettingsModal();
        });

        // Temperature slider
        Utils.getElement('temperature')?.addEventListener('input', (e) => {
            Utils.getElement('temp-value').textContent = e.target.value;
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.closeSettingsModal();
            if (e.ctrlKey && e.key === 'Enter') this.generateScenario();
        });
    },

    /**
     * Update UI based on selected provider
     * @param {string} provider - Provider key
     */
    updateProviderUI(provider) {
        const modelGroup = Utils.getElement('model-group');

        // The in-browser model (WebLLM) is keyless and local: no key field, no
        // endpoint field, and its own status/download panel below the pickers.
        if (provider === 'webllm') {
            Utils.hideElement('api-key-group');
            Utils.hideElement('custom-endpoint-group');
            Utils.hideElement('api-model-manual');
            Utils.showElement('provider-group');
            Utils.toggleElement(modelGroup, true);
            this.populateStaticModels('webllm');
            this.renderLocalPanel(true);
            this.setModelHint('Runs in your browser — download the selected model once, then it works offline.');
            return;
        }

        this.renderLocalPanel(false);
        // Restore the per-user key field: the in-browser model hides it.
        Utils.showElement('api-key-group');

        // Custom is the offline / self-hosted option (Ollama, LM Studio,
        // llama.cpp...). The Model controls stay visible for it, because those
        // servers do expose /v1/models - there is just no curated list to fall
        // back on when the server is not running.
        Utils.toggleElement('custom-endpoint-group', provider === 'custom');
        Utils.toggleElement(modelGroup, true);

        if (provider === 'custom') {
            const examples = this.CUSTOM_ENDPOINTS.map(e => `${e.label}: ${e.url}`).join('  ·  ');
            const input = Utils.getElement('custom-endpoint');
            if (input) {
                input.placeholder = this.CUSTOM_ENDPOINTS[0].url;
                input.title = examples;
            }
            // The curated list belongs to the hosted providers. A local server's
            // models are not known yet, and leaving another provider's name in
            // the dropdown would send it to the wrong server - so the dropdown
            // starts empty and the free-text name is offered alongside it.
            const modelSelect = Utils.getElement('api-model');
            if (modelSelect) modelSelect.innerHTML = '';
            Utils.showElement('api-model-manual');
            this.setModelHint('Any OpenAI-compatible server. ' + examples);
            return;
        }

        Utils.hideElement('api-model-manual');

        if (this.providers[provider]) {
            this.populateStaticModels(provider);
            this.setModelHint('Enter your API key to load available models.');
        }
    },

    /**
     * Fill the model dropdown with a provider's curated fallback list.
     * @param {string} provider - Provider key
     */
    populateStaticModels(provider) {
        const modelSelect = Utils.getElement('api-model');
        if (!modelSelect) return;
        const cfg = this.providers[provider];
        // No curated list (custom endpoints) - leave the dropdown as it is rather
        // than emptying it.
        if (!cfg || !Array.isArray(cfg.models)) return;
        // Keep the current pick when it is still offered, else the saved choice
        // for this provider, else the curated default. Rebuilding the list
        // happens on every provider change and refresh, so without this the
        // model the user chose was silently reset to the first option.
        const previous = modelSelect.value;
        modelSelect.innerHTML = '';
        cfg.models.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            modelSelect.appendChild(opt);
        });
        const saved = (this.settings && this.settings.provider === provider && this.settings.model) || '';
        const want = [previous, saved, cfg.defaultModel].find(v => v && cfg.models.includes(v));
        if (want) modelSelect.value = want;
    },

    /**
     * Update the hint line under the model dropdown.
     * @param {string} text - Hint text
     * @param {string} state - '' | 'ok' | 'error'
     */
    setModelHint(text, state = '') {
        const hint = Utils.getElement('model-hint');
        if (!hint) return;
        hint.textContent = text || '';
        hint.classList.toggle('model-hint-error', state === 'error');
        hint.classList.toggle('model-hint-ok', state === 'ok');
    },

    /**
     * Show or hide the in-browser model status panel. The panel is built and
     * maintained by webllm-provider.js; this only decides visibility and where
     * the chosen model comes from.
     * @param {boolean} show
     */
    renderLocalPanel(show) {
        const group = Utils.getElement('webllm-host-group');
        const host = Utils.getElement('webllm-host');
        const local = (typeof WebLLMProvider !== 'undefined') ? WebLLMProvider : null;
        if (!group || !host || !local) return;
        if (!show) {
            Utils.hideElement(group);
            return;
        }
        local.mount(host, {
            getModel: () => this.webllmModel(),
            getSelect: () => Utils.getElement('api-model')
        });
        Utils.showElement(group);
    },

    /** The model id the in-browser provider (webllm) should load. */
    webllmModel() {
        return Utils.getElement('api-model')?.value
            || (this.providers.webllm && this.providers.webllm.defaultModel)
            || 'SmolLM2-1.7B-Instruct-q4f16_1-MLC';
    },

    /**
     * Fetch the live model list when the current provider+key can support it.
     */
    maybeAutoRefreshModels() {
        const provider = Utils.getElement('api-provider')?.value || '';
        const key = Utils.getElement('api-key')?.value?.trim() || '';
        // The in-browser model has no key and no live list to fetch.
        if (provider === 'webllm') {
            this.refreshModels();
            return;
        }
        // A custom (local) endpoint needs no key: try it as soon as it is set.
        if (provider === 'custom') {
            if (Utils.getElement('custom-endpoint')?.value?.trim()) this.refreshModels();
            return;
        }
        if (key.length >= 8) {
            this.refreshModels();
        } else {
            this.setModelHint('Enter your API key to load available models.');
        }
    },

    /**
     * Query the provider for the models this API key can use and list them in
     * the Model dropdown. Falls back to the curated list on any error.
     */
    async refreshModels() {
        const modelSelect = Utils.getElement('api-model');
        const refreshBtn = Utils.getElement('refresh-models-btn');
        if (!modelSelect || this._loadingModels) return;

        const provider = Utils.getElement('api-provider')?.value || '';
        const apiKey = Utils.getElement('api-key')?.value?.trim() || '';

        // The in-browser model has no key and nothing to query: its list is the
        // curated set (filtered once the engine has loaded).
        if (provider === 'webllm') {
            this.populateStaticModels('webllm');
            this.setModelHint('Runs in your browser — download the selected model once, then it works offline.');
            return;
        }

        if (provider !== 'custom' && !apiKey) {
            this.setModelHint('Enter your API key to load available models.', 'error');
            return;
        }
        if (provider === 'custom' && !Utils.getElement('custom-endpoint')?.value?.trim()) {
            this.setModelHint('Enter the server address, e.g. ' + this.CUSTOM_ENDPOINTS[0].url, 'error');
            return;
        }

        this._loadingModels = true;
        modelSelect.disabled = true;
        if (refreshBtn) refreshBtn.disabled = true;
        this.setModelHint('Loading available models…');

        try {
            const data = await this.listProviderModels(provider, apiKey);
            const models = this.extractModelIds(data);
            if (!models.length) {
                this.populateStaticModels(provider);
                this.setModelHint('No models were returned by this provider.', 'error');
                return;
            }
            this.populateModelSelect(models);
            this.setModelHint(
                `${models.length} model${models.length === 1 ? '' : 's'} available.`,
                'ok'
            );
        } catch (error) {
            console.warn('Model list unavailable; using curated defaults:', error);
            this.populateStaticModels(provider);
            this.setModelHint('Could not load models: ' + (error.message || 'request failed'), 'error');
        } finally {
            modelSelect.disabled = false;
            if (refreshBtn) refreshBtn.disabled = false;
            this._loadingModels = false;
        }
    },

    /**
     * Call the provider's models endpoint and return the raw response JSON.
     * @param {string} provider - Provider key
     * @param {string} apiKey - API key ('' for a keyless local endpoint)
     * @returns {Promise<Object>} Provider model-list response body
     */
    async listProviderModels(provider, apiKey) {
        // A custom endpoint is deliberately not in the provider table - its
        // address is a field, not a constant - so it is allowed to have no entry.
        const cfg = this.providers[provider];
        if (!cfg && provider !== 'custom') throw new Error('Unknown provider');

        const headers = { 'Accept': 'application/json' };
        let url = (cfg && cfg.modelsEndpoint) || '';

        if (provider === 'custom') {
            // OpenAI-compatible servers (Ollama, LM Studio, llama.cpp) expose a
            // sibling /models endpoint. No key unless the user supplied one.
            const endpoint = Utils.getElement('custom-endpoint')?.value?.trim();
            if (!endpoint) throw new Error('Custom endpoint not configured');
            url = endpoint.replace(/\/chat\/completions\/?$/, '/models');
            if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
        } else if (provider === 'anthropic') {
            headers['x-api-key'] = apiKey;
            headers['anthropic-version'] = '2023-06-01';
        } else {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        if (!url) throw new Error('No model list endpoint for this provider');

        const response = await fetch(url, { method: 'GET', headers });
        if (!response.ok) {
            let message = `Failed to load models (${response.status})`;
            try {
                const err = await response.json();
                message = err.error?.message || err.message || message;
            } catch (e) { /* non-JSON error body */ }
            throw new Error(message);
        }
        return await response.json();
    },

    /**
     * Pull model ids out of the various provider list shapes.
     * @param {Object|Array} data - Response JSON
     * @returns {string[]} Deduplicated, alphabetised model ids
     */
    extractModelIds(data) {
        let items = [];
        if (Array.isArray(data)) items = data;
        else if (Array.isArray(data?.data)) items = data.data;
        else if (Array.isArray(data?.models)) items = data.models;
        else if (data?.data && Array.isArray(data.data.data)) items = data.data.data;

        const seen = new Set();
        const ids = [];
        items.forEach(item => {
            if (!item) return;
            const id = typeof item === 'string' ? item : (item.id || item.name || item.model || item.model_name || '');
            const clean = String(id).trim();
            if (clean && !seen.has(clean)) {
                seen.add(clean);
                ids.push(clean);
            }
        });
        return ids.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    },

    /**
     * Replace the Model dropdown options with a live provider list, keeping the
     * user's current selection when it is still available.
     * @param {string[]} models - Model ids to show
     */
    populateModelSelect(models) {
        const select = Utils.getElement('api-model');
        if (!select) return;
        const previous = select.value;
        select.innerHTML = '';
        models.forEach(id => {
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = id;
            select.appendChild(opt);
        });
        if (previous && models.includes(previous)) select.value = previous;
        else if (select.options.length) select.selectedIndex = 0;

        // A custom endpoint's list is a convenience: keep the free-text name in
        // step so what is actually sent is visible.
        if (Utils.getElement('api-provider')?.value === 'custom') {
            const manual = Utils.getElement('api-model-manual');
            if (manual && !manual.value.trim()) manual.value = select.value || '';
        }
    },

    // ---- Server-shared key (proxy) support ----

    /**
     * Key source. The server-proxied "shared key" this used to support is
     * disabled in this build (there is no server to hold a key), so the generator
     * always uses the visitor's own key.
     */
    keyMode() {
        return 'own';
    },

    /**
     * Server-side keys are not available here: a static demo has no server to
     * store one, and /api/ai/* is not served.
     */
    async fetchSharedConfig() {
        this.shared = { available: false, configured: false, provider: '', providerName: '', model: '', customEndpoint: false };
        return this.shared;
    },

    /**
     * Resolve a deck key to its root-relative deck folder (e.g. "shared/decks/core") from CONFIG.decks.
     * @param {string} deckKey - Deck identifier
     * @returns {string} Root-relative deck folder ('' when unknown)
     */
    resolveDeckDir(deckKey) {
        const cfg = (typeof CONFIG !== 'undefined' && CONFIG.decks) ? CONFIG.decks[deckKey] : null;
        const path = (cfg && cfg.path) ? cfg.path : '';
        return path.replace(/^\.\.\//, '').replace(/\/carddb\.json$/, '');
    },

    /**
     * Load card database for selected deck
     * @param {string} deckKey - Deck identifier
     */
    async loadCardDatabase(deckKey) {
        try {
            const deckDir = this.resolveDeckDir(deckKey);
            if (!deckDir) {
                throw new Error(`Unknown deck: ${deckKey}`);
            }
            const response = await Utils.loadJson(`../../../${deckDir}/carddb.json`);
            this.cardDatabase = response;
            return response;
        } catch (error) {
            console.error('Failed to load card database:', error);
            throw new Error('Failed to load card database');
        }
    },

    /**
     * Generate a scenario using AI
     */
    async generateScenario() {
        const apiKey = Utils.getElement('api-key')?.value;
        const provider = Utils.getElement('api-provider')?.value;

        if (!apiKey && provider !== 'custom' && provider !== 'webllm') {
            Utils.showToast('Enter your own API key to generate — the demo has no server-side key', 'warning');
            return;
        }
        if (provider === 'custom' && !Utils.getElement('custom-endpoint')?.value?.trim()) {
            Utils.showToast('Enter the server address for the custom endpoint', 'warning');
            return;
        }
        if (provider === 'webllm') {
            // No key to check: the model runs in this browser. Refuse the run only
            // when the device cannot run it at all.
            const local = (typeof WebLLMProvider !== 'undefined') ? WebLLMProvider : null;
            if (local) {
                const avail = await local.available();
                if (!avail.ok) {
                    Utils.showToast('In-browser models need WebGPU — ' + (avail.reason || ''), 'warning');
                    return;
                }
            }
        }

        // Show loading state
        this.showLoading(true);
        this.showStatus('');

        try {
            // Load card database
            const deckKey = Utils.getElement('deck-select')?.value || 'core';
            await this.loadCardDatabase(deckKey);

            // Build prompt
            const prompt = this.buildPrompt();

            // Call API — streaming an in-browser model's tokens into a live block
            // (which also swaps out the spinner). Every other provider ignores the
            // hook and returns the whole reply at once.
            const onToken = (provider === 'webllm') ? (delta, full) => this.streamLive(full) : null;
            if (onToken) this.showLive(true);
            let response;
            try {
                response = await this.callAPI(provider, apiKey, prompt, onToken);
            } finally {
                if (onToken) this.showLive(false);
            }

            // Parse response
            const scenario = this.parseResponse(response, deckKey);

            // Display result
            this.generatedScenario = scenario;
            this.displayResult(scenario);

            // Enable buttons
            Utils.getElement('copy-btn').disabled = false;
            Utils.getElement('save-btn').disabled = false;

            this.showStatus('Scenario generated successfully!', 'success');
        } catch (error) {
            console.error('Generation failed:', error);
            this.showStatus('Generation failed: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    },

    /**
     * Build the generation prompt
     * @returns {string} Prompt text
     */
    buildPrompt() {
        const difficulty = Utils.getElement('difficulty-select')?.value || '3';
        const theme = Utils.getElement('theme-select')?.value || 'any';
        const context = Utils.getElement('context-input')?.value || '';

        // Get available cards by type
        const cardsByType = {};
        (this.cardDatabase.data || []).forEach(card => {
            const type = card.type?.toLowerCase();
            if (!cardsByType[type]) cardsByType[type] = [];
            cardsByType[type].push(card.name);
        });

        const prompt = `You are a cybersecurity tabletop exercise designer. Generate a B&B Shuffle scenario.

## Available Cards

Initial Access cards: ${cardsByType.initial?.join(', ') || 'None'}
Pivot cards: ${cardsByType.pivot?.join(', ') || 'None'}
C2 (Command & Control) cards: ${cardsByType.c2?.join(', ') || 'None'}
Persistence cards: ${cardsByType.persist?.join(', ') || 'None'}
${cardsByType.consultant?.length ? `Consultant cards (opt-in expert the players may call): ${cardsByType.consultant.join(', ')}
` : ''}
## Requirements

- Difficulty: ${difficulty}/5
- Theme: ${theme === 'any' ? 'Choose an appropriate theme' : theme}
${context ? `- Additional context: ${context}` : ''}

## Output Format

Respond with a JSON object containing:
{
  "name": "Scenario name",
  "description": "Brief description of the attack scenario",
  "initial": "Exact name of an Initial card from the list",
  "pivot": "Exact name of a Pivot card from the list",
  "c2": "Exact name of a C2 card from the list",
  "persist": "Exact name of a Persistence card from the list",${cardsByType.consultant?.length ? `
  "consultant": "Exact name of a Consultant card from the list, or null when none fits",` : ''}
  "difficulty": ${difficulty},
  "notes": "Facilitator notes explaining the attack chain and how the cards connect"
}

IMPORTANT: 
- Use EXACT card names from the provided lists
- Create a realistic, coherent attack narrative
${cardsByType.consultant?.length ? '- The consultant is optional: name one only when that expert genuinely fits the scenario, otherwise use null\n' : ''}- Notes should help the GM understand the attack flow
- Respond ONLY with the JSON object, no additional text`;

        return prompt;
    },

    /**
     * Call the AI API
     * @param {string} provider - Provider key
     * @param {string} apiKey - API key
     * @param {string} prompt - Prompt text
     * @returns {string} Response text
     */
    async callAPI(provider, apiKey, prompt, onToken) {
        if (provider === 'openai') {
            return await this.callOpenAI(apiKey, prompt);
        } else if (provider === 'anthropic') {
            return await this.callAnthropic(apiKey, prompt);
        } else if (['mistral', 'xai', 'perplexity', 'groq', 'deepseek', 'gemini'].includes(provider)) {
            return await this.callCompatible(provider, apiKey, prompt);
        } else if (provider === 'custom') {
            return await this.callCustom(apiKey, prompt);
        } else if (provider === 'webllm') {
            return await this.callWebLLM(prompt, onToken);
        }

        throw new Error('Unknown provider');
    },

    /**
     * Run the request on the in-browser model (WebLLM / WebGPU). Keyless and
     * offline-capable: the engine is downloaded once by webllm-provider.js.
     * @param {string} prompt - Prompt text
     * @param {Function} [onToken] - Called with (delta, full) as tokens arrive
     * @returns {Promise<string>} Response text
     */
    async callWebLLM(prompt, onToken) {
        const local = (typeof WebLLMProvider !== 'undefined') ? WebLLMProvider : null;
        if (!local) throw new Error('The in-browser model needs webllm-provider.js on this page.');
        const avail = await local.available();
        if (!avail.ok) throw new Error('In-browser models need WebGPU. ' + (avail.reason || ''));
        return await local.chat(String(prompt == null ? '' : prompt), {
            model: this.webllmModel(),
            temperature: this.settings.temperature,
            maxTokens: this.settings.maxTokens,
            onToken
        });
    },

    /**
     * Server-proxied generation. Not available in this build: there is no server
     * to hold a key, so nothing is requested and the caller is told why.
     * @param {string} prompt - Prompt text
     * @returns {Promise<string>} Never resolves; always throws
     */
    async callShared(prompt) {
        throw new Error('Server-side AI keys are disabled in this demo — add your own API key in Settings.');
    },

    /**
     * Call OpenAI API
     */
    async callOpenAI(apiKey, prompt) {
        const model = Utils.getElement('api-model')?.value || 'gpt-4o-mini';

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model,
                messages: [{ role: 'user', content: prompt }],
                temperature: this.settings.temperature,
                max_tokens: this.settings.maxTokens
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'API request failed');
        }

        const data = await response.json();
        return data.choices[0].message.content;
    },

    /**
     * Call any OpenAI-compatible chat-completions API (Mistral, xAI/Grok,
     * Perplexity, Groq, DeepSeek, and Gemini's OpenAI-compatible endpoint).
     * @param {string} provider - Provider key from this.providers
     * @param {string} apiKey - API key
     * @param {string} prompt - Prompt text
     * @returns {string} Response text
     */
    async callCompatible(provider, apiKey, prompt) {
        const config = this.providers[provider];
        if (!config || !config.endpoint) throw new Error('Provider not configured');

        const model = Utils.getElement('api-model')?.value || (config.models && config.models[0]);
        const response = await fetch(config.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model,
                messages: [{ role: 'user', content: prompt }],
                temperature: this.settings.temperature,
                max_tokens: this.settings.maxTokens
            })
        });

        if (!response.ok) {
            let message = `API request failed (${response.status})`;
            try {
                const err = await response.json();
                message = err.error?.message || err.message || message;
            } catch (e) { /* non-JSON error body */ }
            throw new Error(message);
        }

        const data = await response.json();
        return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content)
            || data.response
            || data.text
            || '';
    },

    /**
     * Call Anthropic API
     */
    async callAnthropic(apiKey, prompt) {
        const model = Utils.getElement('api-model')?.value || 'claude-3-sonnet-20240229';

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model,
                messages: [{ role: 'user', content: prompt }],
                max_tokens: this.settings.maxTokens
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'API request failed');
        }

        const data = await response.json();
        return data.content[0].text;
    },

    /**
     * Call a custom OpenAI-compatible endpoint - the offline / self-hosted path.
     * Covers Ollama, LM Studio and llama.cpp as well as hosted gateways. The key
     * is optional, so a local server needs no configuration at all.
     */
    async callCustom(apiKey, prompt) {
        const endpoint = Utils.getElement('custom-endpoint')?.value?.trim();
        if (!endpoint) throw new Error('Custom endpoint not configured');

        // The model name is required by local servers (Ollama needs the tag it
        // was pulled with). The hand-typed name wins over the dropdown.
        const model = (Utils.getElement('api-model-manual')?.value || '').trim()
            || Utils.getElement('api-model')?.value
            || '';

        const headers = { 'Content-Type': 'application/json' };
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

        const response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model,
                messages: [{ role: 'user', content: prompt }],
                temperature: this.settings.temperature,
                max_tokens: this.settings.maxTokens
            })
        });

        if (!response.ok) {
            throw new Error(`The endpoint rejected the request (${response.status}) — is the server running and the model loaded?`);
        }

        const data = await response.json();
        // Try common response formats
        return data.choices?.[0]?.message?.content ||
               data.content?.[0]?.text ||
               data.response ||
               data.text;
    },

    /**
     * Parse AI response into scenario object
     * @param {string} response - Raw API response
     * @param {string} deckKey - Deck identifier
     * @returns {Object} Scenario object
     */
    parseResponse(response, deckKey) {
        // Extract JSON from response
        let json;
        try {
            // Try direct parse first
            json = JSON.parse(response);
        } catch {
            // Try to extract JSON from markdown code block
            const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
                json = JSON.parse(jsonMatch[1]);
            } else {
                // Try to find JSON object in response
                const objectMatch = response.match(/\{[\s\S]*\}/);
                if (objectMatch) {
                    json = JSON.parse(objectMatch[0]);
                } else {
                    throw new Error('Could not parse response as JSON');
                }
            }
        }

        // Find cards in database
        const findCard = (name, type) => {
            const card = (this.cardDatabase.data || []).find(c =>
                c.name?.toLowerCase() === name?.toLowerCase() &&
                c.type?.toLowerCase() === type
            );
            if (!card) {
                console.warn(`Card not found: ${name} (${type})`);
                // Return a placeholder
                return { name, type };
            }
            return card;
        };

        // Build scenario
        const scenario = ScenarioIO.createEmpty();
        const deckCfg = (typeof CONFIG !== 'undefined' && CONFIG.decks) ? CONFIG.decks[deckKey] : null;

        scenario.deck = {
            key: deckKey,
            name: this.cardDatabase.title || (deckCfg && deckCfg.name) || deckKey,
            path: (deckCfg && deckCfg.path) || ''
        };

        scenario.scenario = {
            initial: findCard(json.initial, 'initial'),
            pivot: findCard(json.pivot, 'pivot'),
            c2: findCard(json.c2, 'c2'),
            persist: findCard(json.persist, 'persist')
        };
        // Card image paths are kept exactly as stored in carddb.json (../../shared/...);
        // renderers resolve them via Utils.assetPath, so no rebasing is done here.

        scenario.metadata = {
            name: json.name || 'AI Generated Scenario',
            description: json.description || '',
            difficulty: parseInt(json.difficulty) || 3,
            tags: ['ai-generated'],
            createdAt: new Date().toISOString(),
            modifiedAt: new Date().toISOString()
        };

        scenario.notes = json.notes || '';

        // Optional "Call a Consultant": only when the deck has consultants and
        // the model named one we can actually resolve.
        const consultant = json.consultant
            ? (this.cardDatabase.data || []).find(c =>
                c.name?.toLowerCase() === String(json.consultant).toLowerCase() &&
                c.type?.toLowerCase() === 'consultant')
            : null;
        scenario.consultant = consultant || null;
        if (consultant) scenario.consultants = [consultant];

        return scenario;
    },

    /**
     * Display the generated scenario
     * @param {Object} scenario - Scenario object
     */
    displayResult(scenario) {
        // Hide empty state, show content
        Utils.hideElement('result-empty');
        Utils.showElement('result-content');

        // Update preview
        Utils.getElement('preview-name').textContent = scenario.metadata.name;
        Utils.getElement('preview-description').textContent = scenario.metadata.description || 'No description';
        Utils.getElement('preview-difficulty').textContent = ['Very Easy', 'Easy', 'Medium', 'Hard', 'Very Hard'][scenario.metadata.difficulty - 1] || 'Medium';

        Utils.getElement('preview-initial').textContent = scenario.scenario.initial?.name || '-';
        Utils.getElement('preview-pivot').textContent = scenario.scenario.pivot?.name || '-';
        Utils.getElement('preview-c2').textContent = scenario.scenario.c2?.name || '-';
        Utils.getElement('preview-persist').textContent = scenario.scenario.persist?.name || '-';

        const consultantEl = Utils.getElement('preview-consultant');
        if (consultantEl) {
            consultantEl.textContent = scenario.consultant?.name || (scenario.consultants?.length ? `${scenario.consultants.length} available` : 'None');
        }

        Utils.getElement('preview-notes').textContent = scenario.notes || 'No notes';

        // Update JSON preview
        Utils.getElement('result-json').textContent = JSON.stringify(scenario, null, 2);
    },

    /**
     * Copy generated scenario to clipboard
     */
    async copyToClipboard() {
        if (!this.generatedScenario) return;

        await Utils.copyToClipboard(JSON.stringify(this.generatedScenario, null, 2));
        Utils.showToast('Copied to clipboard', 'success');
    },

    /**
     * Move the generated scenario to the Scenario Editor for final edits.
     * The AI output is staged into the editor through the same
     * `bb-loaded-scenario` handoff the Library's "Load" action uses, which keeps
     * everything in this browser: the demo never writes to the Library.
     */
    async saveToLibrary() {
        if (!this.generatedScenario) return;

        try {
            Utils.saveToStorage('bb-loaded-scenario', this.generatedScenario);
            Utils.saveToStorage('bb-ai-handoff', {
                source: 'ai-generator',
                at: new Date().toISOString()
            });
            Utils.showToast('Scenario sent to the editor — review it, then Send to Player', 'success');
            // The Scenario Editor (Library input form) lives at Engine-V2/admin.html.
            window.location.href = '../../admin.html?loadScenario=true';
        } catch (error) {
            console.error('Failed to hand off scenario to the editor:', error);
            Utils.showToast('Failed to open library editor: ' + error.message, 'error');
        }
    },

    /**
     * Show/hide loading state
     * @param {boolean} show - Whether to show loading
     */
    showLoading(show) {
        Utils.toggleElement('result-loading', show);
        Utils.toggleElement('result-empty', !show && !this.generatedScenario);
        Utils.toggleElement('result-content', !show && this.generatedScenario);
        Utils.getElement('generate-btn').disabled = show;
    },

    /**
     * Show or hide the live token stream. It stands in for the spinner while an
     * in-browser model writes, so the text itself is the progress indicator.
     * @param {boolean} show
     */
    showLive(show) {
        const live = Utils.getElement('result-live');
        if (!live) return;
        if (show) {
            const text = Utils.getElement('result-live-text');
            if (text) text.textContent = '';
            Utils.hideElement('result-loading');
            Utils.showElement(live);
            return;
        }
        Utils.hideElement(live);
    },

    /**
     * Render the reply generated so far into the live block.
     * @param {string} text - Everything generated so far
     */
    streamLive(text) {
        const pre = Utils.getElement('result-live-text');
        if (!pre) return;
        pre.textContent = String(text == null ? '' : text);
        pre.scrollTop = pre.scrollHeight;
    },

    /**
     * Show status message
     * @param {string} message - Status message
     * @param {string} type - 'success' or 'error'
     */
    showStatus(message, type = '') {
        const status = Utils.getElement('result-status');
        if (!status) return;

        if (!message) {
            Utils.hideElement(status);
            return;
        }

        status.className = `result-status ${type}`;
        status.querySelector('.status-message').textContent = message;
        Utils.showElement(status);
    },

    /**
     * Open settings modal
     */
    openSettingsModal() {
        Utils.showElement('settings-modal');
    },

    /**
     * Close settings modal
     */
    closeSettingsModal() {
        Utils.hideElement('settings-modal');
    }
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    ScenarioAI.init();
});
