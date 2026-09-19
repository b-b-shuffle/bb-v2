/**
 * B&B Shuffle — Custom Cards library
 * ------------------------------------------------------------------
 * Shows the cards in the "Custom Cards" deck and lets you preview and export
 * them. This build is a read-only demo, so the deck ships with the site and the
 * write controls (enable/disable, duplicate, delete, import) are gone — the demo
 * API refuses writes in any case (see `shared/js/local-api.js`).
 *
 * Depends on: Utils, CardRenderer, CardViewer (all loaded first).
 */

const CustomCardsLibrary = {
    cards: [],
    el: {},

    /**
     * The demo's custom card deck. Read-only and unauthenticated: the deck ships
     * with the site and the demo API refuses every write (see
     * `shared/js/local-api.js`), so there is nothing here but a list read.
     * @returns {Promise<Array>} Every card in the deck
     */
    async fetchCards() {
        const res = await fetch('/api/custom-cards', { cache: 'no-store' });
        if (!res.ok) throw new Error(`Failed to list custom cards (${res.status})`);
        const payload = await res.json();
        // The API wraps payloads in { success, data }; tolerate bare responses too.
        const data = (payload && typeof payload === 'object' && 'data' in payload) ? payload.data : payload;
        return Array.isArray(data) ? data : [];
    },

    /* ------------------------------------------------------------------ */

    async init() {
        this.cacheElements();
        this.bindEvents();
        await this.load();
    },

    cacheElements() {
        ['cc-cards-grid', 'cc-empty', 'cc-lib-status', 'cc-export-deck']
            .forEach(id => { this.el[id] = Utils.getElement(id); });
    },

    bindEvents() {
        this.el['cc-export-deck']?.addEventListener('click', () => this.exportDeck());
    },

    async load() {
        try {
            this.cards = await this.fetchCards();
            this.setStatus(this.cards.length ? `${this.cards.length} card${this.cards.length === 1 ? '' : 's'}` : '');
        } catch (e) {
            this.cards = [];
            this.setStatus('Could not load the custom card deck — ' + e.message, 'err');
        }
        this.render();
    },

    /* ------------------------------------------------------------------ */
    /* Rendering                                                           */
    /* ------------------------------------------------------------------ */

    render() {
        const grid = this.el['cc-cards-grid'];
        const empty = this.el['cc-empty'];
        if (!grid || !empty) return;

        grid.innerHTML = '';

        if (!this.cards.length) {
            empty.classList.remove('cc-hidden');
        } else {
            empty.classList.add('cc-hidden');
            this.cards.forEach(card => grid.appendChild(this.buildTile(card)));
        }
    },

    buildTile(card) {
        const tile = document.createElement('div');
        tile.className = 'cc-card-tile';

        // Thumbnail
        const frame = document.createElement('div');
        frame.className = 'cc-card-frame';
        frame.title = 'Preview';
        const img = document.createElement('img');
        img.alt = card.name || 'Custom card';
        img.src = Utils.assetPath(card.image || '');
        img.onerror = () => { img.src = Utils.cardPlaceholder('No image'); };
        frame.appendChild(img);
        frame.addEventListener('click', () => this.preview(card));
        tile.appendChild(frame);

        // Name
        const name = document.createElement('div');
        name.className = 'cc-card-name';
        name.textContent = card.name || 'Untitled Card';
        name.title = card.name || '';
        tile.appendChild(name);

        // Meta
        const meta = document.createElement('div');
        meta.className = 'cc-card-meta';
        const idSpan = document.createElement('span');
        idSpan.textContent = card.id || '';
        const typeSpan = document.createElement('span');
        typeSpan.textContent = CardRenderer.TYPE_LABELS[card.type] || card.type || '';
        meta.append(idSpan, typeSpan);
        tile.appendChild(meta);

        return tile;
    },

    /* ------------------------------------------------------------------ */
    /* Actions                                                             */
    /* ------------------------------------------------------------------ */

    preview(card) {
        if (typeof CardViewer === 'undefined') return;
        CardViewer.open(Utils.assetPath(card.image || ''), {
            name: card.name || 'Untitled Card',
            type: card.type || ''
        });
    },

    /* ------------------------------------------------------------------ */
    /* Deck export                                                         */
    /* ------------------------------------------------------------------ */

    exportDeck() {
        if (!this.cards.length) {
            this.setStatus('Nothing to export', 'err');
            return;
        }
        const deck = {
            title: 'Custom Cards',
            revdate: new Date().toLocaleDateString('en-US'),
            link: '',
            data: this.cards,
            red: '../../shared/decks/cardbacks/v1/init.webp',
            yellow: '../../shared/decks/cardbacks/v1/pivot.webp',
            brown: '../../shared/decks/cardbacks/v1/c2.webp',
            purple: '../../shared/decks/cardbacks/v1/persist.webp',
            grey: '../../shared/decks/cardbacks/v1/inject.webp',
            green: '',
            logo: ''
        };
        Utils.downloadFile(JSON.stringify(deck, null, 2), 'custom-cards.json', 'application/json');
        this.setStatus('Deck exported', 'ok');
    },

    /* ------------------------------------------------------------------ */
    /* Helpers                                                             */
    /* ------------------------------------------------------------------ */

    setStatus(message, kind) {
        const el = this.el['cc-lib-status'];
        if (!el) return;
        el.textContent = message || '';
        el.classList.remove('ok', 'err');
        if (kind) el.classList.add(kind);
    }
};

document.addEventListener('DOMContentLoaded', () => CustomCardsLibrary.init());
