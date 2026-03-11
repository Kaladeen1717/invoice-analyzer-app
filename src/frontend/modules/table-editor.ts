// Shared cell-editing utilities for inline-editable tables.
// Field editor and tag editor register handlers; this module dispatches
// cell writes and delete confirmations to the correct handler.

import { showAlert } from './ui-utils.js';

export interface TableHandler {
    isEditMode: () => boolean;
    getDefinitions: () => unknown[];
    onCellWrite: (
        index: number,
        fieldName: string,
        input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
        tr: HTMLTableRowElement
    ) => void;
    render: () => void;
    updateSaveBar: () => void;
}

const handlers = new Map<string, TableHandler>();

/**
 * Register a table type so cell editing knows how to write back state.
 */
export function registerTableHandler(tableClass: string, handler: TableHandler): void {
    handlers.set(tableClass, handler);
}

/**
 * Activate inline editing on a cell (show input, hide view).
 */
export function activateCellEdit(td: HTMLTableCellElement): void {
    // Determine if the owning table is in edit mode
    const table = td.closest('table')!;
    let inEditMode = false;
    for (const [cls, h] of handlers) {
        if (table.classList.contains(cls)) {
            inEditMode = h.isEditMode();
            break;
        }
    }
    if (!inEditMode) return;
    if (td.classList.contains('editing')) return;

    // Close any other editing cell in the same table
    table.querySelectorAll('td.editing').forEach((other) => {
        if (other !== td) deactivateCellEdit(other as HTMLTableCellElement);
    });

    // Store original value for escape revert
    const input = td.querySelector('.cell-edit input, .cell-edit textarea, .cell-edit select') as
        | HTMLInputElement
        | HTMLTextAreaElement
        | HTMLSelectElement
        | null;
    if (input) (td as unknown as Record<string, string>)._originalValue = input.value;

    td.classList.add('editing');

    if (input) {
        input.focus();

        const blurHandler = () => {
            input.removeEventListener('blur', blurHandler);
            deactivateCellEdit(td);
        };
        input.addEventListener('blur', blurHandler);

        input.addEventListener('keydown', (e: Event) => {
            const ke = e as KeyboardEvent;
            if (ke.key === 'Enter' && input.tagName !== 'TEXTAREA') {
                ke.preventDefault();
                input.blur();
            }
            if (ke.key === 'Escape') {
                ke.preventDefault();
                input.value = (td as unknown as Record<string, string>)._originalValue || '';
                input.blur();
            }
        });
    }
}

/**
 * Deactivate inline editing — write value back to state via handler, update view.
 */
export function deactivateCellEdit(td: HTMLTableCellElement): void {
    td.classList.remove('editing');
    const input = td.querySelector('.cell-edit input, .cell-edit textarea, .cell-edit select') as
        | HTMLInputElement
        | HTMLTextAreaElement
        | HTMLSelectElement
        | null;
    const viewSpan = td.querySelector('.cell-view') as HTMLElement | null;

    if (input && viewSpan) {
        const tr = td.closest('tr') as HTMLTableRowElement;
        const index = parseInt(tr.dataset.index!);
        const fieldName = (input as HTMLElement).dataset.field!;
        const table = td.closest('table')!;

        // Dispatch to the registered handler for state write-back
        for (const [cls, handler] of handlers) {
            if (table.classList.contains(cls)) {
                handler.onCellWrite(index, fieldName, input, tr);
                break;
            }
        }

        // Update view text (generic)
        if (input.tagName === 'SELECT') {
            viewSpan.textContent = input.value;
        } else if (viewSpan.querySelector('code')) {
            viewSpan.querySelector('code')!.textContent = input.value;
        } else {
            viewSpan.textContent = input.value || '(empty)';
            if (viewSpan.classList.contains('cell-view-truncate')) {
                viewSpan.title = input.value;
            }
        }

        // Update all registered save bars
        for (const handler of handlers.values()) {
            handler.updateSaveBar();
        }
    }
}

/**
 * Show inline delete confirmation in a table row.
 */
export function showInlineDeleteConfirm(index: number, tableClass: string): void {
    const handler = handlers.get(tableClass);
    if (!handler) {
        showAlert('Delete failed: no handler registered for table type', 'error');
        return;
    }

    const definitions = handler.getDefinitions();
    const item = definitions[index];
    if (!item) {
        showAlert(`Delete failed: no item found at index ${index}`, 'error');
        return;
    }

    const table = document.querySelector('.' + tableClass) as HTMLTableElement | null;
    if (!table) {
        showAlert(`Delete failed: table element not found (.${tableClass})`, 'error');
        return;
    }
    const tr = table.querySelector(`tr[data-index="${index}"]`) as HTMLTableRowElement | null;
    if (!tr) {
        showAlert(`Delete failed: table row not found for index ${index}`, 'error');
        return;
    }

    tr.classList.add('confirm-delete');
    const actionsTd = tr.querySelector('td.col-actions') as HTMLTableCellElement | null;
    if (!actionsTd) {
        showAlert('Delete failed: actions column not found in row', 'error');
        return;
    }
    actionsTd.textContent = '';

    const confirmDiv = document.createElement('div');
    confirmDiv.className = 'row-delete-confirm';

    const label = document.createElement('span');
    label.className = 'confirm-label';
    label.textContent = 'Delete?';
    confirmDiv.appendChild(label);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-secondary btn-small';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', (e: MouseEvent) => {
        e.stopPropagation();
        handler.render();
    });
    confirmDiv.appendChild(cancelBtn);

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn btn-danger btn-small';
    confirmBtn.textContent = 'Confirm';
    confirmBtn.addEventListener('click', (e: MouseEvent) => {
        e.stopPropagation();
        (definitions as unknown[]).splice(index, 1);
        handler.render();
    });
    confirmDiv.appendChild(confirmBtn);

    actionsTd.appendChild(confirmDiv);
}

/**
 * Flush any currently-editing cells across all registered tables.
 * Call this before checking for unsaved changes (e.g. on tab switch).
 */
export function flushAllEditing(): void {
    for (const [cls, handler] of handlers) {
        if (handler.isEditMode()) {
            const table = document.querySelector('.' + cls) as HTMLTableElement | null;
            if (table) {
                table.querySelectorAll('td.editing').forEach((td) => deactivateCellEdit(td as HTMLTableCellElement));
            }
        }
    }
}
