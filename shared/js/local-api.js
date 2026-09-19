/**
 * B&B Shuffle — Demo API (static / GitHub Pages build)
 * ------------------------------------------------------------------
 * This branch is published as a live, READ-ONLY demo of Engine V2. Nothing a
 * visitor does is written anywhere, so the content on the site cannot drift:
 * the demo library is a fixed set of files that ships with the repository.
 *
 * The app still calls the endpoints it always did; this module answers them
 * from that content:
 *
 *   GET    /api/health                 -> demo banner
 *   GET    /api/scenarios              -> every scenario in `shared/demo/`
 *   GET    /api/scenarios/{id}         -> one of them
 *   POST   /api/scenarios              -> 403 (read-only)
 *   PUT    /api/scenarios/{id}         -> 403 (read-only)
 *   DELETE /api/scenarios/{id}         -> 403 (read-only)
 *   GET    /api/custom-cards           -> [] — the demo ships no custom cards
 *   GET    /api/custom-cards/{id}      -> 404 (read-only)
 *   POST   /api/custom-cards           -> 403 (read-only)
 *   PUT    /api/custom-cards/{id}      -> 403 (read-only)
 *   DELETE /api/custom-cards/{id}      -> 403 (read-only)
 *   POST   /api/custom-cards/image     -> 403 (read-only)
 *
 * It also serves `data/custom-decks/custom-cards.json` as an empty deck, which
 * is what the Scenario Editor's "Custom Cards" expansion reads.
 *
 * Adding a demo scenario is a content change, not a code change: drop the JSON
 * into `shared/demo/` and list it in `shared/demo/manifest.json`.
 *
 * Anything else under `/api/` is left to the network. The AI proxy in
 * particular 404s on a static host, which is what makes the AI Generator fall
 * back to the visitor's own provider key — the demo has no server-side key, and
 * no way to hold one.
 *
 * Live *session* state is the one exception to "nothing is written": the
 * current game, table theme, FX toggles and AI settings still use localStorage,
 * because that is how the Player and the Scenario Editor talk to each other
 * inside one browser. It never leaves the visitor's machine.
 *
 * Because that state survives a reload, a visitor can get stuck with a session
 * they no longer want. `?reset=1` on any page that loads this file clears all of
 * it and strips itself from the address bar, so the page continues from a clean
 * slate. This file loads *first*, so nothing has read the old values yet.
 *
 * Load this before anything that talks to the API (first in the script list).
 * Public surface: `window.LocalAPI` = { mode, ready, info(), resetState() }.
 */
(function () {
    'use strict';

    // A page that loads this twice keeps the first instance.
    if (window.LocalAPI) return;

    var CARD_TITLE = 'Custom Cards';
    var READ_ONLY = 'This is a read-only demo: the content ships with the site and cannot be saved, changed or deleted.';
    var LIVE = 'GET';
    var CUSTOM_DECK_SUFFIX = '/data/custom-decks/custom-cards.json';

    var nativeFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;

    /* ------------------------------------------------------------------ */
    /* The demo content (shared/demo/*)                                    */
    /* ------------------------------------------------------------------ */

    var demoPromise = null;

    /**
     * Folder holding the demo content. Derived from this script's own URL, so
     * the same file works from any page depth (`fab.js` does the same for the
     * site navigation).
     */
    function demoDir() {
        var el = document.currentScript || document.querySelector('script[src*="local-api.js"]');
        var src = (el && el.src) || '';
        var match = /^(.*)\/js\/local-api\.js(?:\?.*)?$/.exec(src);
        return match ? match[1] + '/demo/' : 'demo/';
    }

    function jsonFetch(url) {
        var request = nativeFetch || window.fetch;
        return request(url, { cache: 'no-store' }).then(function (res) {
            if (!res.ok) throw new Error(url + ' -> HTTP ' + res.status);
            return res.json();
        });
    }

    /** Load `shared/demo/manifest.json` and the scenarios it lists. */
    function loadDemo() {
        if (demoPromise) return demoPromise;

        var base = demoDir();

        demoPromise = jsonFetch(base + 'manifest.json')
            .then(function (manifest) {
                var files = (manifest && Array.isArray(manifest.scenarios)) ? manifest.scenarios : [];
                return Promise.all(files.map(function (file) {
                    return jsonFetch(base + file).catch(function (e) {
                        console.warn('[B&B Shuffle] Demo scenario failed to load:', file, e);
                        return null;
                    });
                }));
            })
            .then(function (scenarios) {
                return scenarios.filter(Boolean);
            })
            .catch(function (e) {
                console.warn('[B&B Shuffle] Demo manifest unavailable:', e);
                return [];
            });

        return demoPromise;
    }

    /* ------------------------------------------------------------------ */
    /* Fetch interception                                                  */
    /* ------------------------------------------------------------------ */

    if (nativeFetch) {
        window.fetch = function (input, init) {
            var endpoint = apiEndpoint(input);

            if (endpoint) {
                var handled = handleApi(endpoint, init);
                return handled ? Promise.resolve(handled) : nativeFetch(input, init);
            }

            if (pathOf(input).slice(-CUSTOM_DECK_SUFFIX.length) === CUSTOM_DECK_SUFFIX) {
                return serveCustomDeck();
            }

            return nativeFetch(input, init);
        };
    }

    /** Absolute URL behind a fetch() input (string, URL or Request). */
    function requestUrl(input) {
        if (typeof input === 'string') return input;
        if (input && typeof input.url === 'string') return input.url;
        return String(input);
    }

    function pathOf(input) {
        try {
            return new URL(requestUrl(input), window.location.href).pathname;
        } catch (e) {
            return '';
        }
    }

    /**
     * The `/api/...` path a request targets, without its leading slash, or ''
     * when the request is not aimed at the API. Works whether the site is served
     * from a domain root or a project subpath (GitHub Pages).
     */
    function apiEndpoint(input) {
        var match = /\/api\/(.*)$/.exec(pathOf(input));
        if (!match) return '';
        return match[1].replace(/\/+$/, '');
    }

    /* ------------------------------------------------------------------ */
    /* Router                                                              */
    /* ------------------------------------------------------------------ */

    /**
     * Answer one demo endpoint.
     * @param {string} endpoint - Path after /api/ (e.g. "scenarios/abc")
     * @param {Object} [init] - fetch options
     * @returns {Promise<Response>|Response|null} null to fall through to the network
     */
    function handleApi(endpoint, init) {
        var method = String((init && init.method) || 'GET').toUpperCase();
        var parts = endpoint.split('/');
        var head = parts[0];
        var rest = parts.slice(1).join('/');

        if (head === 'health' && method === LIVE) {
            return json({ success: true, status: 'demo', readOnly: true, storage: 'none' });
        }

        if (head === 'scenarios') {
            if (method !== LIVE) return readOnly(method, endpoint);
            if (!rest) return listScenarios();
            return getScenario(decodeURIComponent(rest));
        }

        if (head === 'custom-cards') {
            if (method !== LIVE) return readOnly(method, endpoint);
            if (!rest) return listCards();
            if (rest === 'image') return notFound('Endpoint not found');
            // The demo ships no custom cards, so every id is unknown.
            return notFound('Custom card not found');
        }

        // /api/ai/* and /api/profiles/* are not part of the demo: falling
        // through lets them 404, which the callers already handle.
        return null;
    }

    /* ------------------------------------------------------------------ */
    /* Responses                                                           */
    /* ------------------------------------------------------------------ */

    function json(body, status) {
        return new Response(JSON.stringify(body), {
            status: status || 200,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    /** Every write is refused; the message is shown by the callers. */
    function readOnly(method, endpoint) {
        console.warn('[B&B Shuffle] Blocked a write in the read-only demo:', method, '/api/' + endpoint);
        return json({ success: false, error: READ_ONLY, readOnly: true }, 403);
    }

    function notFound(message) {
        return json({ success: false, error: message, readOnly: true }, 404);
    }

    function listScenarios() {
        return loadDemo().then(function (scenarios) {
            return json({ success: true, readOnly: true, data: scenarios, count: scenarios.length });
        });
    }

    function getScenario(id) {
        return loadDemo().then(function (scenarios) {
            var found = scenarios.filter(function (s) { return String(s && s.id) === id; })[0];
            return found ? json({ success: true, readOnly: true, data: found }) : notFound('Scenario not found');
        });
    }

    function listCards() {
        return json({ success: true, readOnly: true, title: CARD_TITLE, data: [], count: 0 });
    }

    /**
     * The deck envelope the Scenario Editor loads for its "Custom Cards"
     * expansion. It is always empty here, but it has to exist: an empty deck
     * loads cleanly, a 404 shows a failure toast. Shape mirrors
     * `CustomCardManager._empty_deck()`.
     */
    function serveCustomDeck() {
        var stamp = new Date();
        return Promise.resolve(json({
            title: CARD_TITLE,
            revdate: [pad2(stamp.getMonth() + 1), pad2(stamp.getDate()), stamp.getFullYear()].join('-'),
            link: '',
            data: [],
            red: '../../shared/decks/cardbacks/v1/init.webp',
            yellow: '../../shared/decks/cardbacks/v1/pivot.webp',
            brown: '../../shared/decks/cardbacks/v1/c2.webp',
            purple: '../../shared/decks/cardbacks/v1/persist.webp',
            grey: '../../shared/decks/cardbacks/v1/inject.webp',
            green: '',
            logo: ''
        }));
    }

    function pad2(value) {
        return String(value).padStart(2, '0');
    }

    /* ------------------------------------------------------------------ */
    /* Demo reset (`?reset=1`)                                             */
    /* ------------------------------------------------------------------ */

    /**
     * Everything the demo keeps in localStorage: the loaded scenario, the deck
     * choice, the theme/FX toggles and the AI provider settings.
     */
    var STORAGE_KEYS = [
        'bb-current-scenario',    // the scenario the Player is showing
        'bb-loaded-scenario',     // Library -> Scenario Editor handoff
        'bb-scenarios',           // legacy saved-scenario list
        'bb-ai-handoff',          // AI Generator -> Scenario Editor handoff
        'bb-ai-settings',         // the visitor's own provider key + model
        'bb-shuffle-deck',        // preferred deck (CONFIG.storage.preferredDeck)
        'bb-shuffle-sync-state',  // Player <-> Editor sync snapshot
        'bb-card-fx',             // card animation toggle
        'bb-dice-fx',             // dice animation toggle
        'bb-theme-bg',
        'bb-theme-logo',
        'bb-theme-logoShow'
    ];

    /** Wipe the demo's localStorage. Returns the keys that actually held data. */
    function clearState() {
        var cleared = [];
        STORAGE_KEYS.forEach(function (key) {
            try {
                if (window.localStorage.getItem(key) !== null) cleared.push(key);
                window.localStorage.removeItem(key);
            } catch (e) { /* storage blocked — nothing to clear */ }
        });
        return cleared;
    }

    /**
     * Honour `?reset=1` (or bare `?reset`). The parameter is removed from the
     * URL afterwards so a later reload starts clean instead of resetting again.
     */
    function handleResetParam() {
        var url;
        try {
            url = new URL(window.location.href);
        } catch (e) {
            return;   // no URL API: leave the page alone
        }
        if (!url.searchParams.has('reset')) return;
        var value = (url.searchParams.get('reset') || '1').toLowerCase();
        if (value === '0' || value === 'false' || value === 'no') return;

        var cleared = clearState();
        url.searchParams.delete('reset');
        try {
            window.history.replaceState(null, '', url.pathname + url.search + url.hash);
        } catch (e) { /* history unavailable */ }

        // Exposed so a controller can tell the visitor what just happened.
        resetPerformed = true;
        console.info('[B&B Shuffle] Demo state cleared (' + cleared.length + ' key(s)): ' +
            (cleared.join(', ') || 'nothing was stored'));
    }

    var resetPerformed = false;

    /* ------------------------------------------------------------------ */
    /* Public surface                                                      */
    /* ------------------------------------------------------------------ */

    window.LocalAPI = {
        /** This build is a demo, and it is always read-only. */
        mode: 'demo',
        readOnly: true,
        /** True once `?reset=1` has wiped this browser's demo state. */
        get resetPerformed() { return resetPerformed; },
        /** Resolves with the demo scenarios once they are loaded. */
        get ready() { return loadDemo(); },
        /** Clear every key the demo writes, without touching the URL. */
        resetState: clearState,
        /** The localStorage keys the demo owns. */
        storageKeys: STORAGE_KEYS.slice(),
        /** Small summary for the console / debugging. */
        info: function () {
            return loadDemo().then(function (scenarios) {
                return { mode: 'demo', readOnly: true, scenarios: scenarios.length };
            });
        }
    };

    // Runs before any controller reads storage (this file loads first).
    handleResetParam();
})();
