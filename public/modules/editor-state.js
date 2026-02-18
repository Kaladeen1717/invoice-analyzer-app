// Reusable editor state management — encapsulates the load/save/discard/hasChanges pattern
// used by field, tag, prompt, model, and filename editors.

export class EditorState {
    /**
     * @param {Object} opts
     * @param {HTMLElement|null} opts.saveBarEl - The save/discard bar element (shown when changes exist)
     * @param {Function} opts.loadFn - Async function to load data from server
     * @param {Function} opts.saveFn - Async function to save data to server
     * @param {Function} [opts.renderFn] - Function to re-render UI from current state
     */
    constructor({ saveBarEl, loadFn, saveFn, renderFn }) {
        this.saveBarEl = saveBarEl;
        this._loadFn = loadFn;
        this._saveFn = saveFn;
        this._renderFn = renderFn;
        this.current = null;
        this.original = null;
        this.loaded = false;
    }

    /** Set the current (edited) state */
    setCurrent(data) {
        this.current = data;
    }

    /** Set the original (saved) state for change detection */
    setOriginal(data) {
        this.original = JSON.parse(JSON.stringify(data));
    }

    /** Set both current and original from the same data (after a fresh load or save) */
    snapshot(data) {
        this.current = data;
        this.original = JSON.parse(JSON.stringify(data));
        this.loaded = true;
    }

    /** Check whether current state differs from original */
    hasChanges() {
        return JSON.stringify(this.current) !== JSON.stringify(this.original);
    }

    /** Show or hide the save bar based on whether there are unsaved changes */
    updateSaveBar() {
        if (!this.saveBarEl) return;
        this.saveBarEl.style.display = this.hasChanges() ? 'flex' : 'none';
    }

    /** Revert current state to original and re-render */
    discard() {
        this.current = JSON.parse(JSON.stringify(this.original));
        if (this._renderFn) this._renderFn();
        this.updateSaveBar();
    }

    /** Load data from server via the loadFn callback */
    async load() {
        if (this._loadFn) await this._loadFn();
    }

    /** Save data to server via the saveFn callback */
    async save() {
        if (this._saveFn) await this._saveFn();
    }
}
