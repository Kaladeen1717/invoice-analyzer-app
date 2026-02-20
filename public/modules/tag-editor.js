// Tag Definitions Editor module
// Manages the global tag rules (load, render, inline edit, presets, save).

import { showAlert } from './ui-utils.js';
import { registerTableHandler, activateCellEdit, showInlineDeleteConfirm } from './table-editor.js';

// --- State ---
let tagDefinitions = [];
let originalTagDefinitions = [];
let tagsLoaded = false;
let tagEditMode = false;

const TAG_PRESETS = {
    'address-match': {
        label: 'Private',
        instruction: 'Set to true if the address "{{address}}" appears anywhere in the document.',
        parameters: [{ name: 'address', defaultValue: '' }],
        filenameFormat: ' - PRIVATE',
        filenamePlaceholder: 'privateTag'
    },
    'content-keyword': {
        label: 'Contains Keyword',
        instruction: 'Set to true if the document contains the keyword "{{keyword}}".',
        parameters: [{ name: 'keyword', defaultValue: '' }]
    },
    'document-classification': {
        label: 'Credit Note',
        instruction:
            'Set to true if this document is a credit note (negative invoice, refund, or credit memo) rather than a standard invoice.',
        parameters: [],
        filenameFormat: ' - CREDIT',
        filenamePlaceholder: 'creditTag'
    },
    custom: {
        label: '',
        instruction: '',
        parameters: []
    }
};

// --- DOM refs (set in init) ---
let tagListEl, tagsSaveBar, addTagDropdown, addTagMenu, tagEditToggleBtn, saveTagsBtn;

// --- Public API ---

export function initTagEditor() {
    tagListEl = document.getElementById('tagList');
    tagsSaveBar = document.getElementById('tagsSaveBar');
    addTagDropdown = document.getElementById('addTagDropdown');
    addTagMenu = document.getElementById('addTagMenu');
    tagEditToggleBtn = document.getElementById('tagEditToggleBtn');
    saveTagsBtn = document.getElementById('saveTagsBtn');

    const reloadTagsBtn = document.getElementById('reloadTagsBtn');
    const discardTagsBtn = document.getElementById('discardTagsBtn');
    const addTagBtn = document.getElementById('addTagBtn');

    // Register with shared table-editor
    registerTableHandler('tags-table', {
        isEditMode: () => tagEditMode,
        getDefinitions: () => tagDefinitions,
        onCellWrite,
        render: renderTagList,
        updateSaveBar: updateTagsSaveBar
    });

    // Event listeners
    tagEditToggleBtn.addEventListener('click', toggleTagEditMode);
    reloadTagsBtn.addEventListener('click', () => {
        tagsLoaded = false;
        loadTagDefinitions();
    });
    saveTagsBtn.addEventListener('click', saveTagDefinitions);
    discardTagsBtn.addEventListener('click', discardTagChanges);

    // Tag add dropdown
    addTagBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        addTagMenu.classList.toggle('open');
    });
    document.querySelectorAll('#addTagMenu .dropdown-item').forEach((item) => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            addTagMenu.classList.remove('open');
            addTagFromPreset(item.dataset.preset);
        });
    });
    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
        addTagMenu.classList.remove('open');
    });
}

export function isTagsLoaded() {
    return tagsLoaded;
}

export async function loadTagDefinitions() {
    try {
        tagListEl.textContent = '';
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'loading-placeholder';
        loadingDiv.textContent = 'Loading tags...';
        tagListEl.appendChild(loadingDiv);

        const response = await fetch('/api/config');
        const data = await response.json();

        if (response.ok) {
            tagDefinitions = (data.tagDefinitions || []).map((tag) => ({
                ...tag,
                parameters: Object.entries(tag.parameters || {}).map(([name, param]) => ({
                    name,
                    label: param.label || name,
                    defaultValue: param.default || ''
                }))
            }));
            originalTagDefinitions = JSON.parse(JSON.stringify(tagDefinitions));
            tagsLoaded = true;
            renderTagList();
        } else {
            tagListEl.textContent = '';
            const errDiv = document.createElement('div');
            errDiv.className = 'error-placeholder';
            errDiv.textContent = 'Error: ' + (data.error || 'Unknown error');
            tagListEl.appendChild(errDiv);
        }
    } catch (error) {
        tagListEl.textContent = '';
        const errDiv = document.createElement('div');
        errDiv.className = 'error-placeholder';
        errDiv.textContent = 'Failed to load tags: ' + error.message;
        tagListEl.appendChild(errDiv);
    }
}

/** Mark tags as needing reload (e.g. after config import/restore). */
export function invalidateTags() {
    tagsLoaded = false;
}

export function hasUnsavedTagChanges() {
    return JSON.stringify(tagDefinitions) !== JSON.stringify(originalTagDefinitions);
}

export function discardTagChanges() {
    tagDefinitions = JSON.parse(JSON.stringify(originalTagDefinitions));
    if (tagEditMode) {
        tagEditMode = false;
        tagEditToggleBtn.classList.remove('active');
        tagEditToggleBtn.querySelector('span').textContent = 'Locked';
        addTagDropdown.style.display = 'none';
    }
    renderTagList();
}

/**
 * Get the addTagMenu element (used by app.js for Escape key handling).
 */
export function getAddTagMenu() {
    return addTagMenu;
}

// --- Internal ---

function onCellWrite(index, fieldName, input, tr) {
    if (index >= tagDefinitions.length || !fieldName) return;

    tagDefinitions[index][fieldName] = input.value.trim();

    // Auto-generate id from label
    if (fieldName === 'label') {
        const idTd = tr.querySelector('td.col-id');
        if (idTd) {
            tagDefinitions[index].id = labelToSnakeCase(input.value);
            const idView = idTd.querySelector('.cell-view code');
            if (idView) idView.textContent = tagDefinitions[index].id;
        }
    }
}

function toggleTagEditMode() {
    if (tagEditMode && hasUnsavedTagChanges()) {
        if (!confirm('You have unsaved tag changes. Discard and exit edit mode?')) {
            return;
        }
        tagDefinitions = JSON.parse(JSON.stringify(originalTagDefinitions));
    }

    tagEditMode = !tagEditMode;
    tagEditToggleBtn.classList.toggle('active', tagEditMode);
    tagEditToggleBtn.querySelector('span').textContent = tagEditMode ? 'Editing' : 'Locked';
    addTagDropdown.style.display = tagEditMode ? 'inline-block' : 'none';
    renderTagList();
}

function renderTagList() {
    tagListEl.textContent = '';

    if (tagDefinitions.length === 0) {
        const placeholder = document.createElement('div');
        placeholder.className = 'empty-placeholder';
        const p1 = document.createElement('p');
        p1.textContent = 'No tag rules defined yet.';
        const p2 = document.createElement('p');
        p2.textContent = 'Click "+ Add Tag Rule" to create one.';
        placeholder.appendChild(p1);
        placeholder.appendChild(p2);
        tagListEl.appendChild(placeholder);
        updateTagsSaveBar();
        return;
    }

    const table = document.createElement('table');
    table.className = 'tags-table' + (tagEditMode ? ' edit-mode' : '');
    table.id = 'tagsTable';

    // Build thead
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const headers = [
        { text: 'On', cls: 'col-enabled' },
        { text: 'Label', cls: 'col-label' },
        { text: 'ID', cls: 'col-id' },
        { text: 'Instruction', cls: 'col-instruction' },
        { text: 'Actions', cls: 'col-actions' }
    ];
    headers.forEach((h) => {
        const th = document.createElement('th');
        th.className = h.cls;
        th.textContent = h.text;
        if (h.tooltip) th.title = h.tooltip;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Build tbody
    const tbody = document.createElement('tbody');
    tbody.id = 'tagListBody';

    tagDefinitions.forEach((tag, index) => {
        const tr = document.createElement('tr');
        if (tag.enabled === false) tr.classList.add('disabled');
        tr.dataset.index = index;

        // Enabled column — toggle dot
        const tdEnabled = document.createElement('td');
        tdEnabled.className = 'col-enabled';
        const toggleIcon = document.createElement('span');
        toggleIcon.className = 'toggle-icon ' + (tag.enabled !== false ? 'enabled' : 'disabled');
        toggleIcon.textContent = tag.enabled !== false ? '\u25CF' : '\u25CB';
        if (tagEditMode) {
            toggleIcon.addEventListener('click', () => {
                tagDefinitions[index].enabled = tagDefinitions[index].enabled === false ? true : false;
                renderTagList();
            });
        }
        tdEnabled.appendChild(toggleIcon);
        tr.appendChild(tdEnabled);

        // Label column — click-to-edit
        const tdLabel = document.createElement('td');
        tdLabel.className = 'col-label cell-editable';
        const labelView = document.createElement('span');
        labelView.className = 'cell-view';
        labelView.textContent = tag.label || '(untitled)';
        tdLabel.appendChild(labelView);
        const labelEdit = document.createElement('span');
        labelEdit.className = 'cell-edit';
        const labelInput = document.createElement('input');
        labelInput.type = 'text';
        labelInput.dataset.field = 'label';
        labelInput.value = tag.label || '';
        labelEdit.appendChild(labelInput);
        tdLabel.appendChild(labelEdit);
        tr.appendChild(tdLabel);

        // ID column — read-only, auto-generated
        const tdId = document.createElement('td');
        tdId.className = 'col-id';
        const idView = document.createElement('span');
        idView.className = 'cell-view';
        const idCode = document.createElement('code');
        idCode.textContent = tag.id || '';
        idView.appendChild(idCode);
        tdId.appendChild(idView);
        tr.appendChild(tdId);

        // Instruction column — click-to-edit textarea
        const tdInstr = document.createElement('td');
        tdInstr.className = 'col-instruction cell-editable';
        const instrView = document.createElement('span');
        instrView.className = 'cell-view cell-view-truncate';
        instrView.title = tag.instruction || '';
        instrView.textContent = tag.instruction || '(empty)';
        tdInstr.appendChild(instrView);
        const instrEdit = document.createElement('span');
        instrEdit.className = 'cell-edit';
        const instrTextarea = document.createElement('textarea');
        instrTextarea.dataset.field = 'instruction';
        instrTextarea.rows = 3;
        instrTextarea.value = tag.instruction || '';
        instrEdit.appendChild(instrTextarea);
        tdInstr.appendChild(instrEdit);
        tr.appendChild(tdInstr);

        // Actions column
        const tdActions = document.createElement('td');
        tdActions.className = 'col-actions';
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'row-actions';

        // Expand/collapse button
        const expandBtn = document.createElement('button');
        expandBtn.className = 'btn-icon';
        expandBtn.title = 'Expand details';
        expandBtn.textContent = '\u25B6';
        expandBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const detailRow = tbody.querySelector(`tr.tag-detail-row[data-index="${index}"]`);
            if (detailRow) {
                const isCollapsed = detailRow.classList.toggle('collapsed');
                expandBtn.textContent = isCollapsed ? '\u25B6' : '\u25BC';
            }
        });
        actionsDiv.appendChild(expandBtn);

        // Delete button
        const delBtn = document.createElement('button');
        delBtn.className = 'btn-icon btn-icon-danger';
        delBtn.title = 'Delete tag';
        delBtn.textContent = '\u2715';
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showInlineDeleteConfirm(index, 'tags-table');
        });
        actionsDiv.appendChild(delBtn);

        tdActions.appendChild(actionsDiv);
        tr.appendChild(tdActions);

        tbody.appendChild(tr);

        // Detail row (collapsed by default)
        const detailTr = document.createElement('tr');
        detailTr.className = 'tag-detail-row collapsed';
        detailTr.dataset.index = index;
        const detailTd = document.createElement('td');
        detailTd.colSpan = headers.length;
        buildTagDetailContent(detailTd, tag, index);
        detailTr.appendChild(detailTd);
        tbody.appendChild(detailTr);
    });

    table.appendChild(tbody);
    tagListEl.appendChild(table);

    // Attach click-to-edit handlers only in tag edit mode
    if (tagEditMode) {
        table.querySelectorAll('td.cell-editable').forEach((td) => {
            td.addEventListener('click', () => activateCellEdit(td));
        });
    }

    updateTagsSaveBar();
}

function buildTagDetailContent(container, tag, index) {
    const content = document.createElement('div');
    content.className = 'tag-detail-content';

    // Parameters section
    const paramsH4 = document.createElement('h4');
    paramsH4.textContent = 'Parameters';
    content.appendChild(paramsH4);

    const paramsContainer = document.createElement('div');
    paramsContainer.className = 'tag-params-container';
    paramsContainer.dataset.tagIndex = index;
    renderInlineParams(paramsContainer, tag, index);
    content.appendChild(paramsContainer);

    if (tagEditMode) {
        const addParamBtn = document.createElement('button');
        addParamBtn.className = 'btn btn-secondary btn-small';
        addParamBtn.textContent = '+ Add Parameter';
        addParamBtn.style.marginTop = '0.5rem';
        addParamBtn.addEventListener('click', () => {
            if (!tag.parameters) tag.parameters = [];
            tag.parameters.push({ name: '', defaultValue: '' });
            renderInlineParams(paramsContainer, tag, index);
            updateTagsSaveBar();
        });
        content.appendChild(addParamBtn);
    }

    // Filename options section
    const fnH4 = document.createElement('h4');
    fnH4.textContent = 'Filename Options';
    fnH4.style.marginTop = '1rem';
    content.appendChild(fnH4);

    const fnOpts = document.createElement('div');
    fnOpts.className = 'filename-options';

    const fmtGroup = document.createElement('div');
    fmtGroup.className = 'form-group';
    const fmtLabel = document.createElement('label');
    fmtLabel.textContent = 'Format';
    fmtGroup.appendChild(fmtLabel);
    const fmtInput = document.createElement('input');
    fmtInput.type = 'text';
    fmtInput.placeholder = 'e.g., " - PRIVATE"';
    fmtInput.value = tag.filenameFormat || '';
    fmtInput.disabled = !tagEditMode;
    fmtInput.addEventListener('input', () => {
        tag.filenameFormat = fmtInput.value;
        updateTagsSaveBar();
    });
    fmtGroup.appendChild(fmtInput);
    fnOpts.appendChild(fmtGroup);

    const phGroup = document.createElement('div');
    phGroup.className = 'form-group';
    const phLabel = document.createElement('label');
    phLabel.textContent = 'Placeholder';
    phGroup.appendChild(phLabel);
    const phInput = document.createElement('input');
    phInput.type = 'text';
    phInput.placeholder = 'e.g., privateTag';
    phInput.value = tag.filenamePlaceholder || '';
    phInput.disabled = !tagEditMode;
    phInput.addEventListener('input', () => {
        tag.filenamePlaceholder = phInput.value;
        updateTagsSaveBar();
    });
    phGroup.appendChild(phInput);
    fnOpts.appendChild(phGroup);

    content.appendChild(fnOpts);
    container.appendChild(content);
}

function renderInlineParams(container, tag, tagIndex) {
    container.textContent = '';
    const params = tag.parameters || [];

    if (params.length === 0 && !tagEditMode) {
        const hint = document.createElement('p');
        hint.className = 'section-description';
        hint.style.margin = '0';
        hint.textContent = 'No parameters defined.';
        container.appendChild(hint);
        return;
    }

    if (params.length === 0) {
        const hint = document.createElement('p');
        hint.className = 'section-description';
        hint.style.margin = '0';
        hint.textContent = 'No parameters. Use {{paramName}} in your instruction, then add parameters here.';
        container.appendChild(hint);
        return;
    }

    const miniTable = document.createElement('table');
    miniTable.className = 'params-mini-table';

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    ['Name', 'Default Value', ''].forEach((text) => {
        const th = document.createElement('th');
        th.textContent = text;
        headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    miniTable.appendChild(thead);

    const tbody = document.createElement('tbody');
    params.forEach((param, pIndex) => {
        const row = document.createElement('tr');

        const nameTd = document.createElement('td');
        if (tagEditMode) {
            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.placeholder = 'param name';
            nameInput.value = param.name || '';
            nameInput.addEventListener('input', () => {
                tag.parameters[pIndex].name = nameInput.value;
                updateTagsSaveBar();
            });
            nameTd.appendChild(nameInput);
        } else {
            nameTd.textContent = param.name || '';
        }
        row.appendChild(nameTd);

        const valTd = document.createElement('td');
        if (tagEditMode) {
            const valInput = document.createElement('input');
            valInput.type = 'text';
            valInput.placeholder = 'default value';
            valInput.value = param.defaultValue || '';
            valInput.addEventListener('input', () => {
                tag.parameters[pIndex].defaultValue = valInput.value;
                updateTagsSaveBar();
            });
            valTd.appendChild(valInput);
        } else {
            valTd.textContent = param.defaultValue || '';
        }
        row.appendChild(valTd);

        const actionTd = document.createElement('td');
        if (tagEditMode) {
            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn-icon btn-icon-danger';
            removeBtn.title = 'Remove';
            removeBtn.textContent = '\u2715';
            removeBtn.addEventListener('click', () => {
                tag.parameters.splice(pIndex, 1);
                renderInlineParams(container, tag, tagIndex);
                updateTagsSaveBar();
            });
            actionTd.appendChild(removeBtn);
        }
        row.appendChild(actionTd);

        tbody.appendChild(row);
    });

    miniTable.appendChild(tbody);
    container.appendChild(miniTable);
}

function addTagFromPreset(presetKey) {
    const preset = TAG_PRESETS[presetKey];
    if (!preset) return;

    const newTag = {
        id: preset.label ? labelToSnakeCase(preset.label) : '',
        label: preset.label,
        instruction: preset.instruction,
        enabled: true,
        parameters: (preset.parameters || []).map((p) => ({ ...p }))
    };
    if (preset.filenamePlaceholder) newTag.filenamePlaceholder = preset.filenamePlaceholder;
    if (preset.filenameFormat) newTag.filenameFormat = preset.filenameFormat;

    tagDefinitions.push(newTag);
    renderTagList();

    if (presetKey === 'custom') {
        const lastMainRow = tagListEl.querySelector('#tagListBody tr[data-index]:not(.tag-detail-row):last-of-type');
        if (lastMainRow) {
            const labelTd = lastMainRow.querySelector('td.col-label');
            if (labelTd) activateCellEdit(labelTd);
        }
    }
}

function updateTagsSaveBar() {
    tagsSaveBar.style.display = hasUnsavedTagChanges() ? 'flex' : 'none';
}

async function saveTagDefinitions() {
    if (tagDefinitions.length === 0 && originalTagDefinitions.length === 0) {
        showAlert('No tag changes to save', 'info');
        return;
    }

    for (let i = 0; i < tagDefinitions.length; i++) {
        const tag = tagDefinitions[i];
        const rowNum = i + 1;
        if (!tag.label) {
            showAlert(`Tag row ${rowNum}: label is required`, 'error');
            return;
        }
        if (!tag.id) {
            showAlert(`Tag row ${rowNum}: ID is required`, 'error');
            return;
        }
        if (!tag.instruction) {
            showAlert(`Tag row ${rowNum}: instruction is required`, 'error');
            return;
        }
        const dupIndex = tagDefinitions.findIndex((t, j) => j !== i && t.id === tag.id);
        if (dupIndex !== -1) {
            showAlert(`Tag row ${rowNum}: duplicate ID "${tag.id}" (also in row ${dupIndex + 1})`, 'error');
            return;
        }
    }

    try {
        saveTagsBtn.disabled = true;
        saveTagsBtn.textContent = '';
        const spinner = document.createElement('span');
        spinner.className = 'spinner';
        saveTagsBtn.appendChild(spinner);
        saveTagsBtn.appendChild(document.createTextNode(' Saving...'));

        const apiTagDefs = tagDefinitions.map((tag) => ({
            ...tag,
            parameters: (tag.parameters || []).reduce((obj, p) => {
                if (p.name.trim()) {
                    obj[p.name.trim()] = {
                        label: p.label || p.name.trim(),
                        default: p.defaultValue || ''
                    };
                }
                return obj;
            }, {})
        }));

        const response = await fetch('/api/config/tags', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tagDefinitions: apiTagDefs })
        });

        const result = await response.json();

        if (response.ok) {
            originalTagDefinitions = JSON.parse(JSON.stringify(tagDefinitions));
            if (tagEditMode) {
                tagEditMode = false;
                tagEditToggleBtn.classList.remove('active');
                tagEditToggleBtn.querySelector('span').textContent = 'Locked';
                addTagDropdown.style.display = 'none';
            }
            renderTagList();
            showAlert(result.message || 'Tag definitions saved', 'success');
        } else {
            showAlert(result.error || result.details || 'Failed to save tags', 'error');
        }
    } catch (error) {
        showAlert('Failed to save tags: ' + error.message, 'error');
    } finally {
        saveTagsBtn.disabled = false;
        saveTagsBtn.textContent = 'Save Changes';
    }
}

function labelToSnakeCase(label) {
    return label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
}
