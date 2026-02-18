// Client Detail View module
// Manages the detail view for a single client: config display, override editing.

import { showAlert } from './ui-utils.js';
import { KNOWN_MODELS } from './constants.js';

// --- State ---
let clientDetailData = null;

// Per-section edit state
let detailFieldEditMode = false;
let detailFieldOverrides = null;
let detailTagEditMode = false;
let detailTagOverrides = null;
let detailPromptEditMode = false;
let detailPromptOverride = null;
let detailFilenameEditMode = false;
let detailFilenameOverride = null;
let detailModelEditMode = false;
let detailModelOverride = null;

// --- DOM refs (set in init) ---
let dashboardListView, clientDetailView, backToDashboardBtn, detailClientHeader;
let detailFieldList, detailTagList, detailFilenameTemplate, detailPromptTemplate;
let detailModelEl;

// Override buttons
let customizeFieldsBtn, resetFieldsBtn, saveDetailFieldsBtn, discardDetailFieldsBtn, detailFieldsSaveBar;
let customizeTagsBtn, resetTagsBtn, saveDetailTagsBtn, discardDetailTagsBtn, detailTagsSaveBar;
let customizeFilenameBtn, resetFilenameBtn, saveDetailFilenameBtn, discardDetailFilenameBtn, detailFilenameSaveBar;
let customizePromptBtn, resetPromptBtn, saveDetailPromptBtn, discardDetailPromptBtn, detailPromptSaveBar;
let customizeModelBtn, resetModelBtn, saveDetailModelBtn, discardDetailModelBtn, detailModelSaveBar;

// --- Public API ---

export function initClientDetail() {
    dashboardListView = document.getElementById('dashboardListView');
    clientDetailView = document.getElementById('clientDetailView');
    backToDashboardBtn = document.getElementById('backToDashboardBtn');
    detailClientHeader = document.getElementById('detailClientHeader');
    detailFieldList = document.getElementById('detailFieldList');
    detailTagList = document.getElementById('detailTagList');
    detailFilenameTemplate = document.getElementById('detailFilenameTemplate');
    detailPromptTemplate = document.getElementById('detailPromptTemplate');
    detailModelEl = document.getElementById('detailModel');

    customizeFieldsBtn = document.getElementById('customizeFieldsBtn');
    resetFieldsBtn = document.getElementById('resetFieldsBtn');
    saveDetailFieldsBtn = document.getElementById('saveDetailFieldsBtn');
    discardDetailFieldsBtn = document.getElementById('discardDetailFieldsBtn');
    detailFieldsSaveBar = document.getElementById('detailFieldsSaveBar');

    customizeTagsBtn = document.getElementById('customizeTagsBtn');
    resetTagsBtn = document.getElementById('resetTagsBtn');
    saveDetailTagsBtn = document.getElementById('saveDetailTagsBtn');
    discardDetailTagsBtn = document.getElementById('discardDetailTagsBtn');
    detailTagsSaveBar = document.getElementById('detailTagsSaveBar');

    customizeFilenameBtn = document.getElementById('customizeFilenameBtn');
    resetFilenameBtn = document.getElementById('resetFilenameBtn');
    saveDetailFilenameBtn = document.getElementById('saveDetailFilenameBtn');
    discardDetailFilenameBtn = document.getElementById('discardDetailFilenameBtn');
    detailFilenameSaveBar = document.getElementById('detailFilenameSaveBar');

    customizePromptBtn = document.getElementById('customizePromptBtn');
    resetPromptBtn = document.getElementById('resetPromptBtn');
    saveDetailPromptBtn = document.getElementById('saveDetailPromptBtn');
    discardDetailPromptBtn = document.getElementById('discardDetailPromptBtn');
    detailPromptSaveBar = document.getElementById('detailPromptSaveBar');

    customizeModelBtn = document.getElementById('customizeModelBtn');
    resetModelBtn = document.getElementById('resetModelBtn');
    saveDetailModelBtn = document.getElementById('saveDetailModelBtn');
    discardDetailModelBtn = document.getElementById('discardDetailModelBtn');
    detailModelSaveBar = document.getElementById('detailModelSaveBar');

    // Back to dashboard
    backToDashboardBtn.addEventListener('click', closeClientDetail);

    // Override buttons
    customizeFieldsBtn.addEventListener('click', () => detailFieldEditMode ? cancelDetailFieldEdit() : customizeFields());
    resetFieldsBtn.addEventListener('click', () => resetOverride('fields'));
    saveDetailFieldsBtn.addEventListener('click', saveDetailFieldOverrides);
    discardDetailFieldsBtn.addEventListener('click', cancelDetailFieldEdit);

    customizeTagsBtn.addEventListener('click', () => detailTagEditMode ? cancelDetailTagEdit() : customizeTags());
    resetTagsBtn.addEventListener('click', () => resetOverride('tags'));
    saveDetailTagsBtn.addEventListener('click', saveDetailTagOverrides);
    discardDetailTagsBtn.addEventListener('click', cancelDetailTagEdit);

    customizePromptBtn.addEventListener('click', () => detailPromptEditMode ? cancelDetailPromptEdit() : customizePrompt());
    resetPromptBtn.addEventListener('click', () => resetOverride('prompt'));
    saveDetailPromptBtn.addEventListener('click', saveDetailPromptOverrides);
    discardDetailPromptBtn.addEventListener('click', cancelDetailPromptEdit);

    customizeModelBtn.addEventListener('click', () => detailModelEditMode ? cancelDetailModelEdit() : customizeModel());
    resetModelBtn.addEventListener('click', () => resetOverride('model'));
    saveDetailModelBtn.addEventListener('click', saveDetailModelOverride);
    discardDetailModelBtn.addEventListener('click', cancelDetailModelEdit);

    customizeFilenameBtn.addEventListener('click', () => detailFilenameEditMode ? cancelDetailFilenameEdit() : customizeFilename());
    resetFilenameBtn.addEventListener('click', () => resetOverride('output'));
    saveDetailFilenameBtn.addEventListener('click', saveDetailFilenameOverride);
    discardDetailFilenameBtn.addEventListener('click', cancelDetailFilenameEdit);
}

export async function openClientDetail(clientId) {
    dashboardListView.style.display = 'none';
    clientDetailView.style.display = 'block';
    resetDetailEditState();

    // Show loading state
    detailClientHeader.textContent = '';
    [detailModelEl, detailFieldList, detailTagList, detailFilenameTemplate, detailPromptTemplate].forEach(el => {
        el.textContent = '';
        const placeholder = document.createElement('div');
        placeholder.className = 'loading-placeholder';
        placeholder.textContent = 'Loading...';
        el.appendChild(placeholder);
    });

    try {
        const response = await fetch(`/api/clients/${clientId}/config`);
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to load client config');
        }
        clientDetailData = await response.json();
        renderClientDetail();
        updateDetailResetButtons();
    } catch (error) {
        detailClientHeader.textContent = '';
        const errDiv = document.createElement('div');
        errDiv.className = 'error-placeholder';
        errDiv.textContent = 'Failed to load client: ' + error.message;
        detailClientHeader.appendChild(errDiv);
    }
}

export function closeClientDetail() {
    clientDetailView.style.display = 'none';
    dashboardListView.style.display = 'block';
    resetDetailEditState();
    clientDetailData = null;
}

// --- Internal: Rendering ---

function createSourceBadge(source) {
    const badge = document.createElement('span');
    badge.className = source === 'override' ? 'source-badge source-badge-override' : 'source-badge source-badge-global';
    badge.textContent = source === 'override' ? 'Custom' : 'Global Default';
    return badge;
}

function renderClientDetail() {
    const data = clientDetailData;
    if (!data) return;

    const c = data.client;
    detailClientHeader.textContent = '';

    // Name row
    const h2 = document.createElement('h2');
    h2.className = 'detail-client-name';
    const statusDot = document.createElement('span');
    statusDot.className = 'status-icon';
    statusDot.style.color = c.enabled ? 'var(--success)' : 'var(--text-secondary)';
    statusDot.textContent = c.enabled ? '\u25CF' : '\u25CB';
    h2.appendChild(statusDot);
    h2.appendChild(document.createTextNode(' ' + c.name));
    detailClientHeader.appendChild(h2);

    const idDiv = document.createElement('div');
    idDiv.className = 'detail-client-id';
    idDiv.textContent = c.clientId;
    detailClientHeader.appendChild(idDiv);

    const meta = document.createElement('div');
    meta.className = 'detail-client-meta';

    const metaItems = [
        { label: 'Status', value: c.enabled ? 'Enabled' : 'Disabled' },
        { label: 'Pending', value: String(c.folderStatus.inputPdfCount) },
        { label: 'Processed', value: String(c.folderStatus.processedCount) }
    ];

    metaItems.forEach(item => {
        const div = document.createElement('div');
        div.className = 'detail-meta-item';
        const lbl = document.createElement('span');
        lbl.className = 'detail-meta-label';
        lbl.textContent = item.label;
        const val = document.createElement('span');
        val.className = 'detail-meta-value';
        val.textContent = item.value;
        div.appendChild(lbl);
        div.appendChild(val);
        meta.appendChild(div);
    });

    // Folder meta item
    const folderDiv = document.createElement('div');
    folderDiv.className = 'detail-meta-item';
    const folderLbl = document.createElement('span');
    folderLbl.className = 'detail-meta-label';
    folderLbl.textContent = 'Folder';
    const folderVal = document.createElement('span');
    folderVal.className = 'detail-meta-value mono';
    folderVal.textContent = c.folderPath;
    folderDiv.appendChild(folderLbl);
    folderDiv.appendChild(folderVal);
    if (!c.folderStatus.exists) {
        const warn = document.createElement('span');
        warn.className = 'folder-warning';
        warn.textContent = 'Folder not found';
        folderDiv.appendChild(warn);
    }
    meta.appendChild(folderDiv);

    detailClientHeader.appendChild(meta);

    renderDetailModel(data.model);
    renderDetailFieldList(data.fieldDefinitions);
    renderDetailTagList(data.tagDefinitions);
    renderDetailFilenameTemplate(data.filenameTemplate);
    renderDetailPromptTemplate(data.promptTemplate);
}

function renderDetailModel(modelData) {
    detailModelEl.textContent = '';

    if (!modelData) {
        const p = document.createElement('div');
        p.className = 'empty-placeholder';
        p.textContent = 'No model configured.';
        detailModelEl.appendChild(p);
        return;
    }

    if (detailModelEditMode) {
        renderDetailModelEditable(modelData);
        return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'model-display';

    const code = document.createElement('code');
    code.textContent = modelData.value || '(default)';
    wrapper.appendChild(code);

    wrapper.appendChild(createSourceBadge(modelData._source));

    detailModelEl.appendChild(wrapper);
}

function renderDetailModelEditable(modelData) {
    detailModelEl.textContent = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'model-detail-edit';

    const select = document.createElement('select');
    KNOWN_MODELS.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        select.appendChild(opt);
    });

    const currentValue = detailModelOverride || modelData.value || KNOWN_MODELS[0];
    if (KNOWN_MODELS.includes(currentValue)) {
        select.value = currentValue;
    }

    select.addEventListener('change', () => {
        detailModelOverride = select.value;
        detailModelSaveBar.style.display = 'flex';
    });

    wrapper.appendChild(select);

    const customRow = document.createElement('div');
    customRow.className = 'model-custom-row';
    customRow.style.marginTop = '0.5rem';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Or enter a custom model ID...';
    if (!KNOWN_MODELS.includes(currentValue)) {
        input.value = currentValue;
    }

    const useBtn = document.createElement('button');
    useBtn.type = 'button';
    useBtn.className = 'btn btn-small btn-secondary';
    useBtn.textContent = 'Use Custom';
    useBtn.addEventListener('click', () => {
        if (input.value.trim()) {
            detailModelOverride = input.value.trim();
            detailModelSaveBar.style.display = 'flex';
        }
    });

    customRow.appendChild(input);
    customRow.appendChild(useBtn);
    wrapper.appendChild(customRow);

    detailModelEl.appendChild(wrapper);
}

function renderDetailFieldList(fields) {
    detailFieldList.textContent = '';

    if (!fields || fields.length === 0) {
        const p = document.createElement('div');
        p.className = 'empty-placeholder';
        p.textContent = 'No extraction fields defined.';
        detailFieldList.appendChild(p);
        return;
    }

    const table = document.createElement('table');
    table.className = 'fields-table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    [
        { text: 'On', cls: 'col-enabled' },
        { text: 'Label', cls: 'col-label' },
        { text: 'Key', cls: 'col-key' },
        { text: 'Type', cls: 'col-type' },
        { text: 'Schema Hint', cls: 'col-hint' },
        { text: 'Instruction', cls: 'col-instruction' },
        { text: 'Source', cls: 'col-source' }
    ].forEach(h => {
        const th = document.createElement('th');
        th.className = h.cls;
        th.textContent = h.text;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    fields.forEach(field => {
        const tr = document.createElement('tr');
        if (!field.enabled) tr.className = 'disabled';

        // On
        const tdEnabled = document.createElement('td');
        tdEnabled.className = 'col-enabled';
        const toggle = document.createElement('span');
        toggle.className = 'toggle-icon ' + (field.enabled ? 'enabled' : 'disabled');
        toggle.textContent = field.enabled ? '\u25CF' : '\u25CB';
        tdEnabled.appendChild(toggle);
        tr.appendChild(tdEnabled);

        // Label
        const tdLabel = document.createElement('td');
        tdLabel.className = 'col-label';
        tdLabel.textContent = field.label || '(empty)';
        tr.appendChild(tdLabel);

        // Key
        const tdKey = document.createElement('td');
        tdKey.className = 'col-key';
        const keyCode = document.createElement('code');
        keyCode.textContent = field.key;
        tdKey.appendChild(keyCode);
        tr.appendChild(tdKey);

        // Type
        const tdType = document.createElement('td');
        tdType.className = 'col-type';
        tdType.textContent = field.type;
        tr.appendChild(tdType);

        // Schema Hint
        const tdHint = document.createElement('td');
        tdHint.className = 'col-hint';
        const hintSpan = document.createElement('span');
        hintSpan.className = 'cell-view-truncate';
        hintSpan.title = field.schemaHint || '';
        hintSpan.textContent = field.schemaHint || '(empty)';
        tdHint.appendChild(hintSpan);
        tr.appendChild(tdHint);

        // Instruction
        const tdInstr = document.createElement('td');
        tdInstr.className = 'col-instruction';
        const instrSpan = document.createElement('span');
        instrSpan.className = 'cell-view-truncate';
        instrSpan.title = field.instruction || '';
        instrSpan.textContent = field.instruction || '(empty)';
        tdInstr.appendChild(instrSpan);
        tr.appendChild(tdInstr);

        // Source
        const tdSource = document.createElement('td');
        tdSource.className = 'col-source';
        tdSource.appendChild(createSourceBadge(field._source));
        tr.appendChild(tdSource);

        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    detailFieldList.appendChild(table);
}

function renderDetailTagList(tags) {
    detailTagList.textContent = '';

    if (!tags || tags.length === 0) {
        const p = document.createElement('div');
        p.className = 'empty-placeholder';
        p.textContent = 'No tag rules defined.';
        detailTagList.appendChild(p);
        return;
    }

    const colCount = 8;

    const table = document.createElement('table');
    table.className = 'tags-table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    [
        { text: 'On', cls: 'col-enabled' },
        { text: 'Label', cls: 'col-label' },
        { text: 'ID', cls: 'col-id' },
        { text: 'Instruction', cls: 'col-instruction' },
        { text: 'PDF', cls: 'col-output' },
        { text: 'CSV', cls: 'col-output' },
        { text: 'File', cls: 'col-output' },
        { text: 'Source', cls: 'col-source' }
    ].forEach(h => {
        const th = document.createElement('th');
        th.className = h.cls;
        th.textContent = h.text;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    tags.forEach(tag => {
        const tr = document.createElement('tr');
        if (tag.enabled === false) tr.classList.add('disabled');

        // On
        const tdEnabled = document.createElement('td');
        tdEnabled.className = 'col-enabled';
        const toggle = document.createElement('span');
        toggle.className = 'toggle-icon ' + (tag.enabled !== false ? 'enabled' : 'disabled');
        toggle.textContent = tag.enabled !== false ? '\u25CF' : '\u25CB';
        tdEnabled.appendChild(toggle);
        tr.appendChild(tdEnabled);

        // Label
        const tdLabel = document.createElement('td');
        tdLabel.className = 'col-label';
        tdLabel.textContent = tag.label || '(untitled)';
        tr.appendChild(tdLabel);

        // ID
        const tdId = document.createElement('td');
        tdId.className = 'col-id';
        const idCode = document.createElement('code');
        idCode.textContent = tag.id || '';
        tdId.appendChild(idCode);
        tr.appendChild(tdId);

        // Instruction
        const tdInstr = document.createElement('td');
        tdInstr.className = 'col-instruction';
        const instrSpan = document.createElement('span');
        instrSpan.className = 'cell-view-truncate';
        instrSpan.title = tag.instruction || '';
        instrSpan.textContent = tag.instruction || '(empty)';
        tdInstr.appendChild(instrSpan);
        tr.appendChild(tdInstr);

        // Output checkboxes (read-only)
        ['pdf', 'csv', 'filename'].forEach(key => {
            const td = document.createElement('td');
            td.className = 'col-output';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'output-checkbox';
            cb.checked = !!(tag.output && tag.output[key]);
            cb.disabled = true;
            td.appendChild(cb);
            tr.appendChild(td);
        });

        // Source
        const tdSource = document.createElement('td');
        tdSource.className = 'col-source';
        tdSource.appendChild(createSourceBadge(tag._source));
        tr.appendChild(tdSource);

        tbody.appendChild(tr);

        // Parameters detail row
        const paramSources = tag._parameterSources || {};
        const params = tag.parameters || {};
        const paramEntries = Object.entries(params);
        if (paramEntries.length > 0) {
            const detailTr = document.createElement('tr');
            detailTr.className = 'tag-detail-row';
            const detailTd = document.createElement('td');
            detailTd.colSpan = colCount;
            const content = document.createElement('div');
            content.className = 'tag-detail-content';

            const h4 = document.createElement('h4');
            h4.textContent = 'Parameters';
            content.appendChild(h4);

            const miniTable = document.createElement('table');
            miniTable.className = 'params-mini-table';
            const miniThead = document.createElement('thead');
            const miniHr = document.createElement('tr');
            ['Name', 'Value', 'Source'].forEach(text => {
                const th = document.createElement('th');
                th.textContent = text;
                miniHr.appendChild(th);
            });
            miniThead.appendChild(miniHr);
            miniTable.appendChild(miniThead);

            const miniTbody = document.createElement('tbody');
            paramEntries.forEach(([paramKey, paramDef]) => {
                const row = document.createElement('tr');

                const nameTd = document.createElement('td');
                nameTd.textContent = paramDef.label || paramKey;
                row.appendChild(nameTd);

                const valTd = document.createElement('td');
                valTd.textContent = paramDef.default || '(not set)';
                if (!paramDef.default) valTd.style.color = 'var(--text-secondary)';
                row.appendChild(valTd);

                const srcTd = document.createElement('td');
                srcTd.appendChild(createSourceBadge(paramSources[paramKey] || 'global'));
                row.appendChild(srcTd);

                miniTbody.appendChild(row);
            });
            miniTable.appendChild(miniTbody);
            content.appendChild(miniTable);

            detailTd.appendChild(content);
            detailTr.appendChild(detailTd);
            tbody.appendChild(detailTr);
        }
    });

    table.appendChild(tbody);
    detailTagList.appendChild(table);
}

function renderDetailFilenameTemplate(fnTemplate) {
    detailFilenameTemplate.textContent = '';

    if (!fnTemplate) {
        const p = document.createElement('div');
        p.className = 'empty-placeholder';
        p.textContent = 'No filename template configured.';
        detailFilenameTemplate.appendChild(p);
        return;
    }

    const badgeRow = document.createElement('div');
    badgeRow.style.marginBottom = '0.75rem';
    badgeRow.appendChild(createSourceBadge(fnTemplate._source));
    detailFilenameTemplate.appendChild(badgeRow);

    const valueDiv = document.createElement('div');
    valueDiv.className = 'detail-filename-value';
    valueDiv.textContent = fnTemplate.template;
    detailFilenameTemplate.appendChild(valueDiv);
}

function renderDetailPromptTemplate(prompt) {
    detailPromptTemplate.textContent = '';

    if (!prompt) {
        const p = document.createElement('div');
        p.className = 'empty-placeholder';
        p.textContent = 'No prompt template configured.';
        detailPromptTemplate.appendChild(p);
        return;
    }

    const badgeRow = document.createElement('div');
    badgeRow.style.marginBottom = '1rem';
    badgeRow.appendChild(createSourceBadge(prompt._source));
    detailPromptTemplate.appendChild(badgeRow);

    const sections = [
        { label: 'Preamble', value: prompt.preamble },
        { label: 'General Rules', value: prompt.generalRules },
        { label: 'Suffix', value: prompt.suffix }
    ];

    sections.forEach(s => {
        const section = document.createElement('div');
        section.className = 'detail-prompt-section';

        const label = document.createElement('div');
        label.className = 'detail-prompt-label';
        label.textContent = s.label;
        section.appendChild(label);

        const value = document.createElement('div');
        value.className = 'detail-prompt-value';
        if (s.value) {
            value.textContent = s.value;
        } else {
            value.classList.add('detail-prompt-empty');
            value.textContent = '(not set)';
        }
        section.appendChild(value);

        detailPromptTemplate.appendChild(section);
    });
}

// --- Internal: Override editing ---

function resetDetailEditState() {
    detailFieldEditMode = false;
    detailFieldOverrides = null;
    detailTagEditMode = false;
    detailTagOverrides = null;
    detailPromptEditMode = false;
    detailPromptOverride = null;
    detailFilenameEditMode = false;
    detailFilenameOverride = null;
    detailModelEditMode = false;
    detailModelOverride = null;
    detailFieldsSaveBar.style.display = 'none';
    detailTagsSaveBar.style.display = 'none';
    detailPromptSaveBar.style.display = 'none';
    detailFilenameSaveBar.style.display = 'none';
    detailModelSaveBar.style.display = 'none';
}

function updateDetailResetButtons() {
    if (!clientDetailData) return;
    const d = clientDetailData;
    resetFieldsBtn.style.display = d.fieldDefinitions.some(f => f._source === 'override') ? 'inline-flex' : 'none';
    resetTagsBtn.style.display = d.tagDefinitions.some(t => t._source === 'override' || Object.values(t._parameterSources || {}).some(k => k === 'override')) ? 'inline-flex' : 'none';
    resetPromptBtn.style.display = d.promptTemplate._source === 'override' ? 'inline-flex' : 'none';
    resetFilenameBtn.style.display = d.filenameTemplate._source === 'override' ? 'inline-flex' : 'none';
    resetModelBtn.style.display = (d.model && d.model._source === 'override') ? 'inline-flex' : 'none';
}

// --- FIELDS OVERRIDE ---

function customizeFields() {
    if (!clientDetailData) return;
    detailFieldEditMode = true;
    detailFieldOverrides = {};
    clientDetailData.fieldDefinitions.forEach(f => {
        if (f._source === 'override') {
            detailFieldOverrides[f.key] = { enabled: f.enabled, instruction: f.instruction };
        }
    });
    customizeFieldsBtn.textContent = 'Editing';
    customizeFieldsBtn.classList.add('active');
    customizeFieldsBtn.classList.remove('btn-primary');
    customizeFieldsBtn.classList.add('btn-secondary');
    renderDetailFieldListEditable();
}

function cancelDetailFieldEdit() {
    detailFieldEditMode = false;
    detailFieldOverrides = null;
    detailFieldsSaveBar.style.display = 'none';
    customizeFieldsBtn.textContent = 'Customize';
    customizeFieldsBtn.classList.remove('active');
    customizeFieldsBtn.classList.add('btn-primary');
    customizeFieldsBtn.classList.remove('btn-secondary');
    renderDetailFieldList(clientDetailData.fieldDefinitions);
}

function renderDetailFieldListEditable() {
    detailFieldList.textContent = '';
    const fields = clientDetailData.fieldDefinitions;

    if (!fields || fields.length === 0) {
        const p = document.createElement('div');
        p.className = 'empty-placeholder';
        p.textContent = 'No extraction fields defined.';
        detailFieldList.appendChild(p);
        return;
    }

    const table = document.createElement('table');
    table.className = 'fields-table edit-mode';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    [
        { text: 'On', cls: 'col-enabled' },
        { text: 'Label', cls: 'col-label' },
        { text: 'Key', cls: 'col-key' },
        { text: 'Type', cls: 'col-type' },
        { text: 'Instruction', cls: 'col-instruction' },
        { text: 'Source', cls: 'col-source' }
    ].forEach(h => {
        const th = document.createElement('th');
        th.className = h.cls;
        th.textContent = h.text;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    fields.forEach(field => {
        const override = detailFieldOverrides[field.key];
        const effectiveEnabled = override ? override.enabled : field.enabled;
        const effectiveInstruction = override ? override.instruction : field.instruction;
        const isOverridden = !!override;

        const tr = document.createElement('tr');
        if (!effectiveEnabled) tr.className = 'disabled';

        // On — clickable toggle
        const tdEnabled = document.createElement('td');
        tdEnabled.className = 'col-enabled';
        const toggle = document.createElement('span');
        toggle.className = 'toggle-icon ' + (effectiveEnabled ? 'enabled' : 'disabled');
        toggle.textContent = effectiveEnabled ? '\u25CF' : '\u25CB';
        toggle.style.cursor = 'pointer';
        toggle.addEventListener('click', () => {
            if (!detailFieldOverrides[field.key]) {
                detailFieldOverrides[field.key] = { enabled: field.enabled, instruction: field.instruction };
            }
            detailFieldOverrides[field.key].enabled = !detailFieldOverrides[field.key].enabled;
            renderDetailFieldListEditable();
            detailFieldsSaveBar.style.display = 'flex';
        });
        tdEnabled.appendChild(toggle);
        tr.appendChild(tdEnabled);

        // Label
        const tdLabel = document.createElement('td');
        tdLabel.className = 'col-label';
        tdLabel.textContent = field.label || '(empty)';
        tr.appendChild(tdLabel);

        // Key
        const tdKey = document.createElement('td');
        tdKey.className = 'col-key';
        const keyCode = document.createElement('code');
        keyCode.textContent = field.key;
        tdKey.appendChild(keyCode);
        tr.appendChild(tdKey);

        // Type
        const tdType = document.createElement('td');
        tdType.className = 'col-type';
        tdType.textContent = field.type;
        tr.appendChild(tdType);

        // Instruction — click-to-edit
        const tdInstr = document.createElement('td');
        tdInstr.className = 'col-instruction cell-editable';
        const instrView = document.createElement('span');
        instrView.className = 'cell-view cell-view-truncate';
        instrView.title = effectiveInstruction || '';
        instrView.textContent = effectiveInstruction || '(empty)';
        tdInstr.appendChild(instrView);
        const instrEditSpan = document.createElement('span');
        instrEditSpan.className = 'cell-edit';
        const instrTextarea = document.createElement('textarea');
        instrTextarea.rows = 3;
        instrTextarea.value = effectiveInstruction || '';
        instrEditSpan.appendChild(instrTextarea);
        tdInstr.appendChild(instrEditSpan);

        tdInstr.addEventListener('click', () => {
            if (tdInstr.classList.contains('editing')) return;
            tdInstr.classList.add('editing');
            instrTextarea.focus();
            const blurHandler = () => {
                instrTextarea.removeEventListener('blur', blurHandler);
                tdInstr.classList.remove('editing');
                const newVal = instrTextarea.value.trim();
                if (newVal !== (field.instruction || '')) {
                    if (!detailFieldOverrides[field.key]) {
                        detailFieldOverrides[field.key] = { enabled: field.enabled, instruction: field.instruction };
                    }
                    detailFieldOverrides[field.key].instruction = newVal;
                    instrView.textContent = newVal || '(empty)';
                    instrView.title = newVal;
                    detailFieldsSaveBar.style.display = 'flex';
                }
            };
            instrTextarea.addEventListener('blur', blurHandler);
            instrTextarea.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    instrTextarea.value = effectiveInstruction || '';
                    instrTextarea.blur();
                }
            });
        });
        tr.appendChild(tdInstr);

        // Source
        const tdSource = document.createElement('td');
        tdSource.className = 'col-source';
        tdSource.appendChild(createSourceBadge(isOverridden ? 'override' : field._source));
        tr.appendChild(tdSource);

        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    detailFieldList.appendChild(table);
}

async function saveDetailFieldOverrides() {
    if (!clientDetailData || !detailFieldOverrides) return;
    const clientId = clientDetailData.client.clientId;

    try {
        saveDetailFieldsBtn.disabled = true;
        saveDetailFieldsBtn.textContent = 'Saving...';

        const response = await fetch(`/api/clients/${clientId}/overrides`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ section: 'fields', data: detailFieldOverrides })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || result.details || 'Save failed');

        clientDetailData = result;
        cancelDetailFieldEdit();
        renderDetailFieldList(clientDetailData.fieldDefinitions);
        updateDetailResetButtons();
        showAlert('Field overrides saved', 'success');
    } catch (error) {
        showAlert('Failed to save field overrides: ' + error.message, 'error');
    } finally {
        saveDetailFieldsBtn.disabled = false;
        saveDetailFieldsBtn.textContent = 'Save Overrides';
    }
}

// --- TAGS OVERRIDE ---

function customizeTags() {
    if (!clientDetailData) return;
    detailTagEditMode = true;
    detailTagOverrides = {};
    clientDetailData.tagDefinitions.forEach(tag => {
        const paramSources = tag._parameterSources || {};
        const hasOverride = tag._source === 'override' || Object.values(paramSources).includes('override');
        if (hasOverride) {
            const override = { parameters: {} };
            if (tag._source === 'override') override.enabled = tag.enabled;
            Object.entries(paramSources).forEach(([key, src]) => {
                if (src === 'override' && tag.parameters && tag.parameters[key]) {
                    override.parameters[key] = tag.parameters[key].default || '';
                }
            });
            detailTagOverrides[tag.id] = override;
        }
    });
    customizeTagsBtn.textContent = 'Editing';
    customizeTagsBtn.classList.add('active');
    customizeTagsBtn.classList.remove('btn-primary');
    customizeTagsBtn.classList.add('btn-secondary');
    renderDetailTagListEditable();
}

function cancelDetailTagEdit() {
    detailTagEditMode = false;
    detailTagOverrides = null;
    detailTagsSaveBar.style.display = 'none';
    customizeTagsBtn.textContent = 'Customize';
    customizeTagsBtn.classList.remove('active');
    customizeTagsBtn.classList.add('btn-primary');
    customizeTagsBtn.classList.remove('btn-secondary');
    renderDetailTagList(clientDetailData.tagDefinitions);
}

function renderDetailTagListEditable() {
    detailTagList.textContent = '';
    const tags = clientDetailData.tagDefinitions;

    if (!tags || tags.length === 0) {
        const p = document.createElement('div');
        p.className = 'empty-placeholder';
        p.textContent = 'No tag rules defined.';
        detailTagList.appendChild(p);
        return;
    }

    const colCount = 8;

    const table = document.createElement('table');
    table.className = 'tags-table edit-mode';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    [
        { text: 'On', cls: 'col-enabled' },
        { text: 'Label', cls: 'col-label' },
        { text: 'ID', cls: 'col-id' },
        { text: 'Instruction', cls: 'col-instruction' },
        { text: 'PDF', cls: 'col-output' },
        { text: 'CSV', cls: 'col-output' },
        { text: 'File', cls: 'col-output' },
        { text: 'Source', cls: 'col-source' }
    ].forEach(h => {
        const th = document.createElement('th');
        th.className = h.cls;
        th.textContent = h.text;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    tags.forEach(tag => {
        const override = detailTagOverrides[tag.id];
        const effectiveEnabled = override && typeof override.enabled === 'boolean' ? override.enabled : (tag.enabled !== false);
        const isOverridden = !!override;

        const tr = document.createElement('tr');
        if (!effectiveEnabled) tr.classList.add('disabled');

        // On — clickable
        const tdEnabled = document.createElement('td');
        tdEnabled.className = 'col-enabled';
        const toggle = document.createElement('span');
        toggle.className = 'toggle-icon ' + (effectiveEnabled ? 'enabled' : 'disabled');
        toggle.textContent = effectiveEnabled ? '\u25CF' : '\u25CB';
        toggle.style.cursor = 'pointer';
        toggle.addEventListener('click', () => {
            if (!detailTagOverrides[tag.id]) detailTagOverrides[tag.id] = { parameters: {} };
            detailTagOverrides[tag.id].enabled = !effectiveEnabled;
            renderDetailTagListEditable();
            detailTagsSaveBar.style.display = 'flex';
        });
        tdEnabled.appendChild(toggle);
        tr.appendChild(tdEnabled);

        // Label
        const tdLabel = document.createElement('td');
        tdLabel.className = 'col-label';
        tdLabel.textContent = tag.label || '(untitled)';
        tr.appendChild(tdLabel);

        // ID
        const tdId = document.createElement('td');
        tdId.className = 'col-id';
        const idCode = document.createElement('code');
        idCode.textContent = tag.id || '';
        tdId.appendChild(idCode);
        tr.appendChild(tdId);

        // Instruction (read-only in client detail)
        const tdInstr = document.createElement('td');
        tdInstr.className = 'col-instruction';
        const instrSpan = document.createElement('span');
        instrSpan.className = 'cell-view-truncate';
        instrSpan.title = tag.instruction || '';
        instrSpan.textContent = tag.instruction || '(empty)';
        tdInstr.appendChild(instrSpan);
        tr.appendChild(tdInstr);

        // Output checkboxes (read-only)
        ['pdf', 'csv', 'filename'].forEach(key => {
            const td = document.createElement('td');
            td.className = 'col-output';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'output-checkbox';
            cb.checked = !!(tag.output && tag.output[key]);
            cb.disabled = true;
            td.appendChild(cb);
            tr.appendChild(td);
        });

        // Source
        const tdSource = document.createElement('td');
        tdSource.className = 'col-source';
        tdSource.appendChild(createSourceBadge(isOverridden ? 'override' : tag._source));
        tr.appendChild(tdSource);

        tbody.appendChild(tr);

        // Parameters — editable
        const params = tag.parameters || {};
        const paramEntries = Object.entries(params);
        if (paramEntries.length > 0) {
            const detailTr = document.createElement('tr');
            detailTr.className = 'tag-detail-row';
            const detailTd = document.createElement('td');
            detailTd.colSpan = colCount;
            const content = document.createElement('div');
            content.className = 'tag-detail-content';

            const h4 = document.createElement('h4');
            h4.textContent = 'Parameters';
            content.appendChild(h4);

            const miniTable = document.createElement('table');
            miniTable.className = 'params-mini-table';
            const miniThead = document.createElement('thead');
            const miniHr = document.createElement('tr');
            ['Name', 'Value', 'Source'].forEach(text => {
                const th = document.createElement('th');
                th.textContent = text;
                miniHr.appendChild(th);
            });
            miniThead.appendChild(miniHr);
            miniTable.appendChild(miniThead);

            const miniTbody = document.createElement('tbody');
            paramEntries.forEach(([paramKey, paramDef]) => {
                const row = document.createElement('tr');
                const overrideValue = override && override.parameters && override.parameters[paramKey];
                const effectiveValue = overrideValue !== undefined ? overrideValue : (paramDef.default || '');
                const paramSource = overrideValue !== undefined ? 'override' : ((tag._parameterSources || {})[paramKey] || 'global');

                const nameTd = document.createElement('td');
                nameTd.textContent = paramDef.label || paramKey;
                row.appendChild(nameTd);

                const valTd = document.createElement('td');
                const valInput = document.createElement('input');
                valInput.type = 'text';
                valInput.value = effectiveValue;
                valInput.placeholder = '(not set)';
                valInput.addEventListener('change', () => {
                    if (!detailTagOverrides[tag.id]) detailTagOverrides[tag.id] = { parameters: {} };
                    if (!detailTagOverrides[tag.id].parameters) detailTagOverrides[tag.id].parameters = {};
                    detailTagOverrides[tag.id].parameters[paramKey] = valInput.value.trim();
                    detailTagsSaveBar.style.display = 'flex';
                });
                valTd.appendChild(valInput);
                row.appendChild(valTd);

                const srcTd = document.createElement('td');
                srcTd.appendChild(createSourceBadge(paramSource));
                row.appendChild(srcTd);

                miniTbody.appendChild(row);
            });
            miniTable.appendChild(miniTbody);
            content.appendChild(miniTable);

            detailTd.appendChild(content);
            detailTr.appendChild(detailTd);
            tbody.appendChild(detailTr);
        }
    });

    table.appendChild(tbody);
    detailTagList.appendChild(table);
}

async function saveDetailTagOverrides() {
    if (!clientDetailData || !detailTagOverrides) return;
    const clientId = clientDetailData.client.clientId;

    try {
        saveDetailTagsBtn.disabled = true;
        saveDetailTagsBtn.textContent = 'Saving...';

        const response = await fetch(`/api/clients/${clientId}/overrides`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ section: 'tags', data: detailTagOverrides })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || result.details || 'Save failed');

        clientDetailData = result;
        cancelDetailTagEdit();
        renderDetailTagList(clientDetailData.tagDefinitions);
        updateDetailResetButtons();
        showAlert('Tag overrides saved', 'success');
    } catch (error) {
        showAlert('Failed to save tag overrides: ' + error.message, 'error');
    } finally {
        saveDetailTagsBtn.disabled = false;
        saveDetailTagsBtn.textContent = 'Save Overrides';
    }
}

// --- PROMPT OVERRIDE ---

function customizePrompt() {
    if (!clientDetailData) return;
    detailPromptEditMode = true;
    const p = clientDetailData.promptTemplate;
    detailPromptOverride = {
        preamble: p.preamble || '',
        generalRules: p.generalRules || '',
        suffix: p.suffix || ''
    };
    customizePromptBtn.textContent = 'Editing';
    customizePromptBtn.classList.add('active');
    customizePromptBtn.classList.remove('btn-primary');
    customizePromptBtn.classList.add('btn-secondary');
    renderDetailPromptEditable();
}

function cancelDetailPromptEdit() {
    detailPromptEditMode = false;
    detailPromptOverride = null;
    detailPromptSaveBar.style.display = 'none';
    customizePromptBtn.textContent = 'Customize';
    customizePromptBtn.classList.remove('active');
    customizePromptBtn.classList.add('btn-primary');
    customizePromptBtn.classList.remove('btn-secondary');
    renderDetailPromptTemplate(clientDetailData.promptTemplate);
}

function renderDetailPromptEditable() {
    detailPromptTemplate.textContent = '';

    const sections = [
        { key: 'preamble', label: 'Preamble' },
        { key: 'generalRules', label: 'General Rules' },
        { key: 'suffix', label: 'Suffix' }
    ];

    sections.forEach(s => {
        const section = document.createElement('div');
        section.className = 'detail-prompt-section';

        const label = document.createElement('div');
        label.className = 'detail-prompt-label';
        label.textContent = s.label;
        section.appendChild(label);

        const textarea = document.createElement('textarea');
        textarea.className = 'detail-edit-textarea';
        textarea.rows = 4;
        textarea.value = detailPromptOverride[s.key] || '';
        textarea.addEventListener('input', () => {
            detailPromptOverride[s.key] = textarea.value;
            detailPromptSaveBar.style.display = 'flex';
        });
        section.appendChild(textarea);

        detailPromptTemplate.appendChild(section);
    });
}

async function saveDetailPromptOverrides() {
    if (!clientDetailData || !detailPromptOverride) return;
    const clientId = clientDetailData.client.clientId;

    try {
        saveDetailPromptBtn.disabled = true;
        saveDetailPromptBtn.textContent = 'Saving...';

        const response = await fetch(`/api/clients/${clientId}/overrides`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ section: 'prompt', data: detailPromptOverride })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || result.details || 'Save failed');

        clientDetailData = result;
        cancelDetailPromptEdit();
        renderDetailPromptTemplate(clientDetailData.promptTemplate);
        updateDetailResetButtons();
        showAlert('Prompt overrides saved', 'success');
    } catch (error) {
        showAlert('Failed to save prompt overrides: ' + error.message, 'error');
    } finally {
        saveDetailPromptBtn.disabled = false;
        saveDetailPromptBtn.textContent = 'Save Overrides';
    }
}

// --- FILENAME OVERRIDE ---

function customizeFilename() {
    if (!clientDetailData) return;
    detailFilenameEditMode = true;
    detailFilenameOverride = clientDetailData.filenameTemplate.template || '';
    customizeFilenameBtn.textContent = 'Editing';
    customizeFilenameBtn.classList.add('active');
    customizeFilenameBtn.classList.remove('btn-primary');
    customizeFilenameBtn.classList.add('btn-secondary');
    renderDetailFilenameEditable();
}

function cancelDetailFilenameEdit() {
    detailFilenameEditMode = false;
    detailFilenameOverride = null;
    detailFilenameSaveBar.style.display = 'none';
    customizeFilenameBtn.textContent = 'Customize';
    customizeFilenameBtn.classList.remove('active');
    customizeFilenameBtn.classList.add('btn-primary');
    customizeFilenameBtn.classList.remove('btn-secondary');
    renderDetailFilenameTemplate(clientDetailData.filenameTemplate);
}

function renderDetailFilenameEditable() {
    detailFilenameTemplate.textContent = '';

    const label = document.createElement('div');
    label.className = 'detail-prompt-label';
    label.textContent = 'Template';
    detailFilenameTemplate.appendChild(label);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'detail-edit-input';
    input.value = detailFilenameOverride || '';
    input.placeholder = '{supplierName} - {paymentDateFormatted} - {invoiceNumber}.pdf';
    input.addEventListener('input', () => {
        detailFilenameOverride = input.value;
        detailFilenameSaveBar.style.display = 'flex';
    });
    detailFilenameTemplate.appendChild(input);
}

async function saveDetailFilenameOverride() {
    if (!clientDetailData || detailFilenameOverride === null) return;
    const clientId = clientDetailData.client.clientId;

    try {
        saveDetailFilenameBtn.disabled = true;
        saveDetailFilenameBtn.textContent = 'Saving...';

        const response = await fetch(`/api/clients/${clientId}/overrides`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ section: 'output', data: { filenameTemplate: detailFilenameOverride } })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || result.details || 'Save failed');

        clientDetailData = result;
        cancelDetailFilenameEdit();
        renderDetailFilenameTemplate(clientDetailData.filenameTemplate);
        updateDetailResetButtons();
        showAlert('Filename override saved', 'success');
    } catch (error) {
        showAlert('Failed to save filename override: ' + error.message, 'error');
    } finally {
        saveDetailFilenameBtn.disabled = false;
        saveDetailFilenameBtn.textContent = 'Save Override';
    }
}

// --- MODEL OVERRIDE ---

function customizeModel() {
    detailModelEditMode = true;
    detailModelOverride = clientDetailData.model?.value || null;
    customizeModelBtn.textContent = 'Cancel';
    detailModelSaveBar.style.display = 'flex';
    renderDetailModel(clientDetailData.model);
}

function cancelDetailModelEdit() {
    detailModelEditMode = false;
    detailModelOverride = null;
    customizeModelBtn.textContent = 'Customize';
    detailModelSaveBar.style.display = 'none';
    renderDetailModel(clientDetailData.model);
}

async function saveDetailModelOverride() {
    if (!clientDetailData || !detailModelOverride) return;

    try {
        const response = await fetch(`/api/clients/${clientDetailData.client.clientId}/overrides`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ section: 'model', data: detailModelOverride })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to save model override');
        }

        const updated = await response.json();
        clientDetailData = updated;
        detailModelEditMode = false;
        detailModelOverride = null;
        customizeModelBtn.textContent = 'Customize';
        detailModelSaveBar.style.display = 'none';
        renderDetailModel(updated.model);
        updateDetailResetButtons();
        showAlert('Model override saved', 'success');
    } catch (error) {
        showAlert('Failed to save model override: ' + error.message, 'error');
    }
}

// --- RESET TO DEFAULT ---

async function resetOverride(section) {
    if (!clientDetailData) return;

    const sectionNames = { fields: 'field', tags: 'tag', prompt: 'prompt', output: 'filename template' };
    if (!confirm(`Reset ${sectionNames[section]} settings to global defaults? Your custom settings will be removed.`)) {
        return;
    }

    const clientId = clientDetailData.client.clientId;

    try {
        const response = await fetch(`/api/clients/${clientId}/overrides/${section}`, {
            method: 'DELETE'
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || result.details || 'Reset failed');

        clientDetailData = result;
        resetDetailEditState();
        renderClientDetail();
        updateDetailResetButtons();
        showAlert(`${sectionNames[section].charAt(0).toUpperCase() + sectionNames[section].slice(1)} settings reset to global defaults`, 'success');
    } catch (error) {
        showAlert('Failed to reset: ' + error.message, 'error');
    }
}
