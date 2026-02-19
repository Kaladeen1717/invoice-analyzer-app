// Shared cell-editing utilities for inline-editable tables.
// Field editor and tag editor register handlers; this module dispatches
// cell writes and delete confirmations to the correct handler.

import { showAlert } from './ui-utils.js';

const handlers = new Map();

/**
 * Register a table type so cell editing knows how to write back state.
 * @param {string} tableClass - CSS class identifying the table (e.g. 'fields-table')
 * @param {Object} handler
 * @param {Function} handler.isEditMode - returns boolean
 * @param {Function} handler.getDefinitions - returns the current definitions array
 * @param {Function} handler.onCellWrite - (index, fieldName, input, tr) => void
 * @param {Function} handler.render - re-render the table
 * @param {Function} handler.updateSaveBar - update the save bar visibility
 */
export function registerTableHandler(tableClass, handler) {
    handlers.set(tableClass, handler);
}

/**
 * Activate inline editing on a cell (show input, hide view).
 */
export function activateCellEdit(td) {
    // Determine if the owning table is in edit mode
    const table = td.closest('table');
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
        if (other !== td) deactivateCellEdit(other);
    });

    // Store original value for escape revert
    const input = td.querySelector('.cell-edit input, .cell-edit textarea, .cell-edit select');
    if (input) td._originalValue = input.value;

    td.classList.add('editing');

    if (input) {
        input.focus();

        const blurHandler = () => {
            input.removeEventListener('blur', blurHandler);
            deactivateCellEdit(td);
        };
        input.addEventListener('blur', blurHandler);

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && input.tagName !== 'TEXTAREA') {
                e.preventDefault();
                input.blur();
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                input.value = td._originalValue || '';
                input.blur();
            }
        });
    }
}

/**
 * Deactivate inline editing — write value back to state via handler, update view.
 */
export function deactivateCellEdit(td) {
    td.classList.remove('editing');
    const input = td.querySelector('.cell-edit input, .cell-edit textarea, .cell-edit select');
    const viewSpan = td.querySelector('.cell-view');

    if (input && viewSpan) {
        const tr = td.closest('tr');
        const index = parseInt(tr.dataset.index);
        const fieldName = input.dataset.field;
        const table = td.closest('table');

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
            viewSpan.querySelector('code').textContent = input.value;
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
 * @param {number} index - Row index
 * @param {string} tableClass - CSS class of the table ('fields-table' or 'tags-table')
 */
export function showInlineDeleteConfirm(index, tableClass) {
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

    const table = document.querySelector('.' + tableClass);
    if (!table) {
        showAlert(`Delete failed: table element not found (.${tableClass})`, 'error');
        return;
    }
    const tr = table.querySelector(`tr[data-index="${index}"]`);
    if (!tr) {
        showAlert(`Delete failed: table row not found for index ${index}`, 'error');
        return;
    }

    tr.classList.add('confirm-delete');
    const actionsTd = tr.querySelector('td.col-actions');
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
    cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        handler.render();
    });
    confirmDiv.appendChild(cancelBtn);

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn btn-danger btn-small';
    confirmBtn.textContent = 'Confirm';
    confirmBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        definitions.splice(index, 1);
        handler.render();
    });
    confirmDiv.appendChild(confirmBtn);

    actionsTd.appendChild(confirmDiv);
}

/**
 * Flush any currently-editing cells across all registered tables.
 * Call this before checking for unsaved changes (e.g. on tab switch).
 */
export function flushAllEditing() {
    for (const [cls, handler] of handlers) {
        if (handler.isEditMode()) {
            const table = document.querySelector('.' + cls);
            if (table) {
                table.querySelectorAll('td.editing').forEach((td) => deactivateCellEdit(td));
            }
        }
    }
}
