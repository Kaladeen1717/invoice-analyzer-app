// Reusable editor state management — encapsulates the load/save/discard/hasChanges pattern
// used by field, tag, prompt, model, and filename editors.

export interface EditorStateOptions {
    saveBarEl: HTMLElement | null;
    loadFn: (() => Promise<void>) | null;
    saveFn: (() => Promise<void>) | null;
    renderFn?: (() => void) | null;
}

export class EditorState {
    saveBarEl: HTMLElement | null;
    private _loadFn: (() => Promise<void>) | null;
    private _saveFn: (() => Promise<void>) | null;
    private _renderFn: (() => void) | null | undefined;
    current: unknown;
    original: unknown;
    loaded: boolean;

    constructor({ saveBarEl, loadFn, saveFn, renderFn }: EditorStateOptions) {
        this.saveBarEl = saveBarEl;
        this._loadFn = loadFn;
        this._saveFn = saveFn;
        this._renderFn = renderFn;
        this.current = null;
        this.original = null;
        this.loaded = false;
    }

    /** Set the current (edited) state */
    setCurrent(data: unknown): void {
        this.current = data;
    }

    /** Set the original (saved) state for change detection */
    setOriginal(data: unknown): void {
        this.original = JSON.parse(JSON.stringify(data));
    }

    /** Set both current and original from the same data (after a fresh load or save) */
    snapshot(data: unknown): void {
        this.current = data;
        this.original = JSON.parse(JSON.stringify(data));
        this.loaded = true;
    }

    /** Check whether current state differs from original */
    hasChanges(): boolean {
        return JSON.stringify(this.current) !== JSON.stringify(this.original);
    }

    /** Show or hide the save bar based on whether there are unsaved changes */
    updateSaveBar(): void {
        if (!this.saveBarEl) return;
        this.saveBarEl.style.display = this.hasChanges() ? 'flex' : 'none';
    }

    /** Revert current state to original and re-render */
    discard(): void {
        this.current = JSON.parse(JSON.stringify(this.original));
        if (this._renderFn) this._renderFn();
        this.updateSaveBar();
    }

    /** Load data from server via the loadFn callback */
    async load(): Promise<void> {
        if (this._loadFn) await this._loadFn();
    }

    /** Save data to server via the saveFn callback */
    async save(): Promise<void> {
        if (this._saveFn) await this._saveFn();
    }
}
