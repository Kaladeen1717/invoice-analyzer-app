// Field Definitions Editor module
// Manages the global extraction field definitions (load, render, inline edit, save).

import { showAlert } from './ui-utils.js';
import { VALID_FIELD_TYPES } from './constants.js';
import { registerTableHandler, activateCellEdit, deactivateCellEdit, showInlineDeleteConfirm } from './table-editor.js';

// --- State ---
let fieldDefinitions = [];
let originalFieldDefinitions = [];
let fieldsLoaded = false;
let editMode = false;

// --- DOM refs (set in init) ---
let fieldListEl, fieldsSaveBar, addFieldBtn, editToggleBtn, saveFieldsBtn;

// --- Public API ---

export function initFieldEditor() {
    fieldListEl = document.getElementById('fieldList');
    fieldsSaveBar = document.getElementById('fieldsSaveBar');
    addFieldBtn = document.getElementById('addFieldBtn');
    editToggleBtn = document.getElementById('editToggleBtn');
    saveFieldsBtn = document.getElementById('saveFieldsBtn');

    const reloadFieldsBtn = document.getElementById('reloadFieldsBtn');
    const discardFieldsBtn = document.getElementById('discardFieldsBtn');

    // Register with shared table-editor
    registerTableHandler('fields-table', {
        isEditMode: () => editMode,
        getDefinitions: () => fieldDefinitions,
        onCellWrite,
        render: renderFieldList,
        updateSaveBar: updateFieldsSaveBar
    });

    // Event listeners
    editToggleBtn.addEventListener('click', toggleEditMode);
    reloadFieldsBtn.addEventListener('click', () => {
        fieldsLoaded = false;
        loadFieldDefinitions();
    });
    addFieldBtn.addEventListener('click', addNewFieldRow);
    saveFieldsBtn.addEventListener('click', saveFieldDefinitions);
    discardFieldsBtn.addEventListener('click', discardFieldChanges);
}

export function isFieldsLoaded() { return fieldsLoaded; }

export async function loadFieldDefinitions() {
    try {
        fieldListEl.textContent = '';
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'loading-placeholder';
        loadingDiv.textContent = 'Loading fields...';
        fieldListEl.appendChild(loadingDiv);

        const response = await fetch('/api/config');
        const data = await response.json();

        if (response.ok) {
            fieldDefinitions = data.fieldDefinitions || [];
            originalFieldDefinitions = JSON.parse(JSON.stringify(fieldDefinitions));
            fieldsLoaded = true;
            renderFieldList();
        } else {
            fieldListEl.textContent = '';
            const errDiv = document.createElement('div');
            errDiv.className = 'error-placeholder';
            errDiv.textContent = 'Error: ' + (data.error || 'Unknown error');
            fieldListEl.appendChild(errDiv);
        }
    } catch (error) {
        fieldListEl.textContent = '';
        const errDiv = document.createElement('div');
        errDiv.className = 'error-placeholder';
        errDiv.textContent = 'Failed to load fields: ' + error.message;
        fieldListEl.appendChild(errDiv);
    }
}

/** Mark fields as needing reload (e.g. after config import/restore). */
export function invalidateFields() { fieldsLoaded = false; }

export function hasUnsavedFieldChanges() {
    return JSON.stringify(fieldDefinitions) !== JSON.stringify(originalFieldDefinitions);
}

export function discardFieldChanges() {
    fieldDefinitions = JSON.parse(JSON.stringify(originalFieldDefinitions));
    if (editMode) {
        editMode = false;
        editToggleBtn.classList.remove('active');
        editToggleBtn.querySelector('span').textContent = 'Locked';
        addFieldBtn.style.display = 'none';
    }
    renderFieldList();
}

/**
 * Flush any editing cells to state (call before checking unsaved changes).
 */
export function readFieldsFromDOM() {
    const table = document.getElementById('fieldsTable');
    if (table && editMode) {
        table.querySelectorAll('td.editing').forEach(td => deactivateCellEdit(td));
    }
}

// --- Internal ---

function onCellWrite(index, fieldName, input, tr) {
    if (index >= fieldDefinitions.length || !fieldName) return;

    fieldDefinitions[index][fieldName] = input.tagName === 'INPUT' && input.type === 'checkbox'
        ? input.checked
        : input.value.trim();

    // Auto-generate key from label for new fields
    if (fieldName === 'label') {
        const keyTd = tr.querySelector('td.col-key');
        const keyInput = keyTd ? keyTd.querySelector('.cell-edit input[data-field="key"]') : null;
        if (keyInput && !keyInput.readOnly) {
            keyInput.value = labelToCamelCase(input.value);
            fieldDefinitions[index].key = keyInput.value;
            const keyView = keyTd.querySelector('.cell-view code');
            if (keyView) keyView.textContent = keyInput.value;
        }
    }
}

function renderFieldList() {
    fieldListEl.textContent = '';

    if (fieldDefinitions.length === 0) {
        const placeholder = document.createElement('div');
        placeholder.className = 'empty-placeholder';
        const p1 = document.createElement('p');
        p1.textContent = 'No extraction fields defined.';
        const p2 = document.createElement('p');
        p2.textContent = 'Click "+ Add Custom Field" to create one.';
        placeholder.appendChild(p1);
        placeholder.appendChild(p2);
        fieldListEl.appendChild(placeholder);
        updateFieldsSaveBar();
        return;
    }

    const table = document.createElement('table');
    table.className = 'fields-table' + (editMode ? ' edit-mode' : '');
    table.id = 'fieldsTable';

    // Build thead
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const headers = [
        { text: 'On', cls: 'col-enabled' },
        { text: 'Label', cls: 'col-label' },
        { text: 'Key', cls: 'col-key' },
        { text: 'Type', cls: 'col-type' },
        { text: 'Schema Hint', cls: 'col-hint' },
        { text: 'Instruction', cls: 'col-instruction' },
        { text: 'Source', cls: 'col-source' },
        { text: 'Actions', cls: 'col-actions' }
    ];
    headers.forEach(h => {
        const th = document.createElement('th');
        th.className = h.cls;
        th.textContent = h.text;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Build tbody
    const tbody = document.createElement('tbody');
    tbody.id = 'fieldListBody';

    fieldDefinitions.forEach((field, index) => {
        const tr = document.createElement('tr');
        if (!field.enabled) tr.className = 'disabled';
        tr.dataset.index = index;

        // Enabled column — toggle dot
        const tdEnabled = document.createElement('td');
        tdEnabled.className = 'col-enabled';
        const toggleIcon = document.createElement('span');
        toggleIcon.className = 'toggle-icon ' + (field.enabled ? 'enabled' : 'disabled');
        toggleIcon.textContent = field.enabled ? '\u25CF' : '\u25CB';
        if (editMode) {
            toggleIcon.addEventListener('click', () => toggleField(index));
        }
        tdEnabled.appendChild(toggleIcon);
        tr.appendChild(tdEnabled);

        // Label column — click-to-edit
        const tdLabel = document.createElement('td');
        tdLabel.className = 'col-label cell-editable';
        const labelView = document.createElement('span');
        labelView.className = 'cell-view';
        labelView.textContent = field.label || '(empty)';
        tdLabel.appendChild(labelView);
        const labelEdit = document.createElement('span');
        labelEdit.className = 'cell-edit';
        const labelInput = document.createElement('input');
        labelInput.type = 'text';
        labelInput.dataset.field = 'label';
        labelInput.value = field.label;
        labelEdit.appendChild(labelInput);
        tdLabel.appendChild(labelEdit);
        tr.appendChild(tdLabel);

        // Key column — click-to-edit (read-only for built-in or existing keys)
        const tdKey = document.createElement('td');
        const isKeyReadonly = field.builtIn || field.key !== '';
        tdKey.className = 'col-key' + (!isKeyReadonly ? ' cell-editable' : '');
        const keyView = document.createElement('span');
        keyView.className = 'cell-view';
        const keyCode = document.createElement('code');
        keyCode.textContent = field.key;
        keyView.appendChild(keyCode);
        tdKey.appendChild(keyView);
        if (!isKeyReadonly) {
            const keyEdit = document.createElement('span');
            keyEdit.className = 'cell-edit';
            const keyInput = document.createElement('input');
            keyInput.type = 'text';
            keyInput.dataset.field = 'key';
            keyInput.value = field.key;
            keyEdit.appendChild(keyInput);
            tdKey.appendChild(keyEdit);
        }
        tr.appendChild(tdKey);

        // Type column — click-to-edit
        const tdType = document.createElement('td');
        tdType.className = 'col-type cell-editable';
        const typeView = document.createElement('span');
        typeView.className = 'cell-view';
        typeView.textContent = field.type;
        tdType.appendChild(typeView);
        const typeEdit = document.createElement('span');
        typeEdit.className = 'cell-edit';
        const typeSelect = document.createElement('select');
        typeSelect.dataset.field = 'type';
        VALID_FIELD_TYPES.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            opt.selected = t === field.type;
            typeSelect.appendChild(opt);
        });
        typeEdit.appendChild(typeSelect);
        tdType.appendChild(typeEdit);
        tr.appendChild(tdType);

        // Schema Hint column — click-to-edit
        const tdHint = document.createElement('td');
        tdHint.className = 'col-hint cell-editable';
        const hintView = document.createElement('span');
        hintView.className = 'cell-view cell-view-truncate';
        hintView.title = field.schemaHint;
        hintView.textContent = field.schemaHint || '(empty)';
        tdHint.appendChild(hintView);
        const hintEdit = document.createElement('span');
        hintEdit.className = 'cell-edit';
        const hintTextarea = document.createElement('textarea');
        hintTextarea.dataset.field = 'schemaHint';
        hintTextarea.rows = 3;
        hintTextarea.value = field.schemaHint;
        hintEdit.appendChild(hintTextarea);
        tdHint.appendChild(hintEdit);
        tr.appendChild(tdHint);

        // Instruction column — click-to-edit
        const tdInstruction = document.createElement('td');
        tdInstruction.className = 'col-instruction cell-editable';
        const instrView = document.createElement('span');
        instrView.className = 'cell-view cell-view-truncate';
        instrView.title = field.instruction;
        instrView.textContent = field.instruction || '(empty)';
        tdInstruction.appendChild(instrView);
        const instrEdit = document.createElement('span');
        instrEdit.className = 'cell-edit';
        const instrTextarea = document.createElement('textarea');
        instrTextarea.dataset.field = 'instruction';
        instrTextarea.rows = 3;
        instrTextarea.value = field.instruction;
        instrEdit.appendChild(instrTextarea);
        tdInstruction.appendChild(instrEdit);
        tr.appendChild(tdInstruction);

        // Source column
        const tdSource = document.createElement('td');
        tdSource.className = 'col-source';
        const badge = document.createElement('span');
        badge.className = field.builtIn ? 'field-badge-builtin' : 'field-badge-custom';
        badge.textContent = field.builtIn ? 'Built-in' : 'Custom';
        tdSource.appendChild(badge);
        tr.appendChild(tdSource);

        // Actions column
        const tdActions = document.createElement('td');
        tdActions.className = 'col-actions';
        buildFieldActions(tdActions, index, field);
        tr.appendChild(tdActions);

        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    fieldListEl.appendChild(table);

    // Attach click-to-edit handlers only in edit mode
    if (editMode) {
        table.querySelectorAll('td.cell-editable').forEach(td => {
            td.addEventListener('click', () => activateCellEdit(td));
        });
    }

    // Auto-generate key from label for new rows
    table.querySelectorAll('#fieldListBody tr').forEach(row => {
        const keyEdit = row.querySelector('td.col-key .cell-edit input[data-field="key"]');
        const labelEdit = row.querySelector('td.col-label .cell-edit input[data-field="label"]');
        if (keyEdit && labelEdit) {
            labelEdit.addEventListener('input', () => {
                keyEdit.value = labelToCamelCase(labelEdit.value);
            });
        }
    });

    updateFieldsSaveBar();
}

function buildFieldActions(tdActions, index, field) {
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'row-actions';

    const moveUpBtn = document.createElement('button');
    moveUpBtn.className = 'btn-icon';
    moveUpBtn.title = 'Move up';
    moveUpBtn.textContent = '\u25B2';
    moveUpBtn.disabled = index === 0;
    moveUpBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        moveField(index, -1);
    });
    actionsDiv.appendChild(moveUpBtn);

    const moveDownBtn = document.createElement('button');
    moveDownBtn.className = 'btn-icon';
    moveDownBtn.title = 'Move down';
    moveDownBtn.textContent = '\u25BC';
    moveDownBtn.disabled = index === fieldDefinitions.length - 1;
    moveDownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        moveField(index, 1);
    });
    actionsDiv.appendChild(moveDownBtn);

    if (!field.builtIn) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-icon btn-icon-danger';
        deleteBtn.title = 'Delete field';
        deleteBtn.textContent = '\u2715';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showInlineDeleteConfirm(index, 'fields-table');
        });
        actionsDiv.appendChild(deleteBtn);
    }

    tdActions.appendChild(actionsDiv);
}

function toggleEditMode() {
    if (editMode && hasUnsavedFieldChanges()) {
        if (!confirm('You have unsaved changes. Discard and exit edit mode?')) {
            return;
        }
        fieldDefinitions = JSON.parse(JSON.stringify(originalFieldDefinitions));
    }

    editMode = !editMode;
    editToggleBtn.classList.toggle('active', editMode);
    editToggleBtn.querySelector('span').textContent = editMode ? 'Editing' : 'Locked';
    addFieldBtn.style.display = editMode ? 'inline-flex' : 'none';
    renderFieldList();
}

function addNewFieldRow() {
    if (!editMode) toggleEditMode();
    readFieldsFromDOM();
    fieldDefinitions.push({
        key: '',
        label: '',
        type: 'text',
        schemaHint: '',
        instruction: '',
        enabled: true
    });
    renderFieldList();

    const lastRow = document.querySelector('#fieldListBody tr:last-child');
    if (lastRow) {
        const labelTd = lastRow.querySelector('td.col-label');
        if (labelTd) activateCellEdit(labelTd);
    }
}

function updateFieldsSaveBar() {
    fieldsSaveBar.style.display = hasUnsavedFieldChanges() ? 'flex' : 'none';
}

function labelToCamelCase(label) {
    return label
        .trim()
        .split(/\s+/)
        .map((word, i) => {
            const lower = word.toLowerCase();
            return i === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
        })
        .join('');
}

function toggleField(index) {
    fieldDefinitions[index].enabled = !fieldDefinitions[index].enabled;
    renderFieldList();
}

function moveField(index, direction) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= fieldDefinitions.length) return;
    const temp = fieldDefinitions[index];
    fieldDefinitions[index] = fieldDefinitions[newIndex];
    fieldDefinitions[newIndex] = temp;
    renderFieldList();
}

async function saveFieldDefinitions() {
    readFieldsFromDOM();

    if (fieldDefinitions.length === 0) {
        showAlert('Cannot save an empty field list', 'error');
        return;
    }

    const validTypes = VALID_FIELD_TYPES;
    for (let i = 0; i < fieldDefinitions.length; i++) {
        const field = fieldDefinitions[i];
        const rowNum = i + 1;

        if (!field.label) { showAlert(`Row ${rowNum}: label is required`, 'error'); return; }
        if (!field.key) { showAlert(`Row ${rowNum}: key is required`, 'error'); return; }
        if (!/^[a-z][a-zA-Z0-9]*$/.test(field.key)) {
            showAlert(`Row ${rowNum}: key must start with a lowercase letter and contain only alphanumeric characters`, 'error');
            return;
        }
        if (!validTypes.includes(field.type)) { showAlert(`Row ${rowNum}: invalid field type`, 'error'); return; }
        if (!field.schemaHint) { showAlert(`Row ${rowNum}: schema hint is required`, 'error'); return; }
        if (!field.instruction) { showAlert(`Row ${rowNum}: instruction is required`, 'error'); return; }

        const duplicateIndex = fieldDefinitions.findIndex((f, j) => j !== i && f.key === field.key);
        if (duplicateIndex !== -1) {
            showAlert(`Row ${rowNum}: duplicate key "${field.key}" (also in row ${duplicateIndex + 1})`, 'error');
            return;
        }
    }

    try {
        saveFieldsBtn.disabled = true;
        saveFieldsBtn.textContent = '';
        const spinner = document.createElement('span');
        spinner.className = 'spinner';
        saveFieldsBtn.appendChild(spinner);
        saveFieldsBtn.appendChild(document.createTextNode(' Saving...'));

        const response = await fetch('/api/config/fields', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fieldDefinitions })
        });

        const result = await response.json();

        if (response.ok) {
            originalFieldDefinitions = JSON.parse(JSON.stringify(fieldDefinitions));
            if (editMode) {
                editMode = false;
                editToggleBtn.classList.remove('active');
                editToggleBtn.querySelector('span').textContent = 'Locked';
                addFieldBtn.style.display = 'none';
            }
            renderFieldList();
            showAlert(result.message || 'Field definitions saved', 'success');
        } else {
            showAlert(result.error || result.details || 'Failed to save fields', 'error');
        }
    } catch (error) {
        showAlert(`Failed to save fields: ${error.message}`, 'error');
    } finally {
        saveFieldsBtn.disabled = false;
        saveFieldsBtn.textContent = '';
        const span = document.createElement('span');
        span.textContent = 'Save Changes';
        saveFieldsBtn.appendChild(span);
    }
}
