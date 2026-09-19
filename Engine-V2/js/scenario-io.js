/**
 * B&B Shuffle - Scenario I/O
 * Listing, loading and exporting scenarios.
 *
 * This build is a static, read-only demo: the library ships with the site
 * (`shared/demo/`), so the server write helpers (save / update / delete) are gone
 * and the demo API refuses them anyway (see `shared/js/local-api.js`). Import,
 * validation and migration went the same way — there is no way to get a foreign
 * scenario into this build — so what is left is listing, loading and exporting.
 */

const ScenarioIO = {
    /** Current scenario schema version. */
    CURRENT_VERSION: '1.0',

    /**
     * A blank scenario carrying every field the engine reads, at its default.
     * @returns {Object} Empty scenario
     */
    createEmpty() {
        const now = new Date().toISOString();
        return {
            id: '',
            version: this.CURRENT_VERSION,
            exportDate: now,
            deck: {
                name: '',
                path: '',
                title: ''
            },
            scenario: {
                initial: null,
                pivot: null,
                c2: null,
                persist: null
            },
            procedures: [],
            consultants: [],
            consultant: null,
            startingInject: null,
            gameConfig: {
                initialTurns: 10,
                maxStrikes: 3
            },
            gameState: {
                turnsRemaining: 10,
                strikesUsed: 0,
                cardsRevealed: {
                    initial: false,
                    pivot: false,
                    c2: false,
                    persist: false
                },
                diceHistory: [],
                injectHistory: []
            },
            metadata: {
                name: 'Untitled Scenario',
                author: '',
                description: '',
                difficulty: 3,
                estimatedDuration: '',
                tags: [],
                createdAt: now,
                modifiedAt: now
            },
            notes: {
                adminNotes: '',
                playerNotes: ''
            }
        };
    },

    /**
     * Export scenario to JSON file download
     * @param {Object} scenario - Scenario object to export
     * @param {string} filename - Optional filename (without extension)
     */
    exportToFile(scenario, filename = null) {
        const exportData = {
            ...scenario,
            exportDate: new Date().toISOString()
        };

        const jsonString = JSON.stringify(exportData, null, 2);
        const defaultFilename = filename ||
            `bb-scenario-${scenario.metadata?.name || 'export'}-${Date.now()}`;
        Utils.downloadFile(jsonString, Utils.slugify(defaultFilename) + '.json', 'application/json');
    },

    /**
     * Load scenario from API
     * @param {string} id - Scenario UUID
     * @returns {Promise<Object>} Loaded scenario
     */
    async loadFromServer(id) {
        const response = await fetch(`/api/scenarios/${id}`);

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to load scenario');
        }

        const body = await response.json();
        // The API wraps payloads in { success, data }; tolerate bare responses too.
        return body && body.data !== undefined ? body.data : body;
    },

    /**
     * List all scenarios from API
     * @returns {Promise<Array>} List of scenario summaries
     */
    async listFromServer() {
        const response = await fetch('/api/scenarios');

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to list scenarios');
        }

        const body = await response.json();
        if (Array.isArray(body)) return body; // bare-array tolerance
        return body && Array.isArray(body.data) ? body.data : [];
    },

};

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ScenarioIO;
}
