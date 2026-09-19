/**
 * B&B Shuffle Engine-V2 - Configuration
 * Centralized configuration for the game engine
 */

const CONFIG = {
    // Deck paths (relative to shared)
    decks: {
        core: {
            name: 'Core Deck',
            path: '../shared/decks/core/carddb.json',
            cardbackPath: '../shared/decks/cardbacks/v1/'
        },
        'core31': {
            name: 'Core 3.1',
            path: '../shared/decks/core31/carddb.json',
            cardbackPath: '../shared/decks/cardbacks/v1/'
        },
        'green-expansion-v2': {
            name: 'Green Expansion v2',
            path: '../shared/decks/green-expansion-v2/carddb.json',
            cardbackPath: '../shared/decks/cardbacks/v1/',
            expansion: true,
            expansionPrefix: 'GE-'
        },
        expansion1: {
            name: 'Expansion 1',
            path: '../shared/decks/expansion1/carddb.json',
            cardbackPath: '../shared/decks/cardbacks/v1/',
            expansion: true,
            expansionPrefix: 'EX1-'
        },
        'ics-ot': {
            name: 'ICS-OT',
            path: '../shared/decks/ics-ot/carddb.json',
            cardbackPath: '../shared/decks/cardbacks/v2/'
        },
        'core-v1': {
            name: 'Core v1',
            path: '../shared/decks/core-v1/carddb.json',
            cardbackPath: '../shared/decks/cardbacks/v1/'
        },
        'core-v3': {
            name: 'Core v3',
            path: '../shared/decks/core-v3/carddb.json',
            cardbackPath: '../shared/decks/cardbacks/v1/'
        },
        'core-v22': {
            name: 'Core v2.2',
            path: '../shared/decks/core-v22/carddb.json',
            cardbackPath: '../shared/decks/cardbacks/v1/'
        },
        'core-v31-expansion': {
            name: 'CoreV3 Plus Expansion',
            path: '../shared/decks/core-v31-expansion/carddb.json',
            cardbackPath: '../shared/decks/cardbacks/v1/'
        },
        'core-spanish': {
            name: 'Core Spanish 1.0',
            path: '../shared/decks/core-spanish/carddb.json',
            cardbackPath: '../shared/decks/cardbacks/v1/'
        },
        'cloud-security': {
            name: 'Cloud Security',
            path: '../shared/decks/cloud-security/carddb.json',
            cardbackPath: '../shared/decks/cardbacks/v1/'
        },
        datadog: {
            name: 'DataDog',
            path: '../shared/decks/datadog/carddb.json',
            cardbackPath: '../shared/decks/cardbacks/v1/'
        },
        huntress: {
            name: 'Huntress',
            path: '../shared/decks/huntress/carddb.json',
            cardbackPath: '../shared/decks/cardbacks/v1/'
        },
        'red-canary': {
            name: 'Red Canary',
            path: '../shared/decks/red-canary/carddb.json',
            cardbackPath: '../shared/decks/cardbacks/v1/'
        },
        densecure: {
            name: 'DenSecure',
            path: '../shared/decks/densecure/carddb.json',
            cardbackPath: '../shared/decks/cardbacks/v1/'
        },
        trimarc: {
            name: 'Trimarc',
            path: '../shared/decks/trimarc/carddb.json',
            cardbackPath: '../shared/decks/cardbacks/v1/'
        },
        'electrical-co-op': {
            name: 'Electrical Co-Op',
            path: '../shared/decks/electrical-co-op/carddb.json',
            cardbackPath: '../shared/decks/cardbacks/v1/'
        },
        'mega-deck': {
            name: 'The MEGA Deck',
            path: '../shared/decks/mega-deck/carddb.json',
            cardbackPath: '../shared/decks/cardbacks/v1/'
        },
        // User-created cards from the Custom Card Creator. Lives under data/
        // (volume-mounted, git-ignored) so it survives container rebuilds, and
        // is offered as an expansion pack in the Scenario Editor.
        custom: {
            name: 'Custom Cards',
            path: '../data/custom-decks/custom-cards.json',
            cardbackPath: '../shared/decks/cardbacks/v1/',
            expansion: true,
            expansionPrefix: 'CC-'
        }
    },

    // Default deck
    defaultDeck: 'core',

    // Game settings
    game: {
        initialTurns: 10,
        maxStrikes: 3,
        procedureCount: 7,
        enhancedDefault: 3,
        enhancedBonus: 3,
        scenarioCardTypes: ['initial', 'pivot', 'c2', 'persist']
    },

    // Storage keys
    storage: {
        preferredDeck: 'bb-shuffle-deck'
    },

    // Sync settings (for admin/player communication)
    sync: {
        storageKey: 'bb-shuffle-sync-state'
    },

    /**
     * Get deck configuration by key
     * @param {string} deckKey - Deck identifier
     * @returns {Object|null} Deck config or null
     */
    getDeck(deckKey) {
        return this.decks[deckKey] || null;
    }
};

// Freeze config to prevent accidental modifications
Object.freeze(CONFIG);
Object.freeze(CONFIG.game);
Object.freeze(CONFIG.storage);
Object.freeze(CONFIG.sync);

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}
