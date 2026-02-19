// Client Detail View module
// Manages the detail view for a single client: config display, override editing.

import { showAlert, addLogEntry, clearLog } from './ui-utils.js';
import { KNOWN_MODELS, VALID_FIELD_TYPES } from './constants.js';
import { initResultsViewer, loadClientResults, clearResults } from './results-viewer.js';

// --- State ---
let clientDetailData = null;
let fileList = [];
let selectedFiles = new Set();
let isFileProcessing = false;

// Per-section edit state
let detailFieldEditMode = false;
let detailFieldDefinitions = null;
let globalFieldDefaults = null;
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
let fileSelectorEl, fileCountEl, refreshFilesBtn, processSelectedBtn, dryRunSelectedBtn;

// Context menu and add-field button
let contextMenuEl = null;
let addDetailFieldBtn = null;

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
    addDetailFieldBtn = document.getElementById('addDetailFieldBtn');

    // Create context menu element
    contextMenuEl = document.createElement('div');
    contextMenuEl.className = 'detail-context-menu';
    document.body.appendChild(contextMenuEl);

    // Dismiss context menu on click or Escape
    document.addEventListener('click', () => {
        contextMenuEl.classList.remove('visible');
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') contextMenuEl.classList.remove('visible');
    });

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
    customizeFieldsBtn.addEventListener('click', () =>
        detailFieldEditMode ? cancelDetailFieldEdit() : customizeFields()
    );
    resetFieldsBtn.addEventListener('click', () => resetOverride('fields'));
    saveDetailFieldsBtn.addEventListener('click', saveDetailFieldOverrides);
    discardDetailFieldsBtn.addEventListener('click', cancelDetailFieldEdit);
    addDetailFieldBtn.addEventListener('click', addDetailCustomField);

    customizeTagsBtn.addEventListener('click', () => (detailTagEditMode ? cancelDetailTagEdit() : customizeTags()));
    resetTagsBtn.addEventListener('click', () => resetOverride('tags'));
    saveDetailTagsBtn.addEventListener('click', saveDetailTagOverrides);
    discardDetailTagsBtn.addEventListener('click', cancelDetailTagEdit);

    customizePromptBtn.addEventListener('click', () =>
        detailPromptEditMode ? cancelDetailPromptEdit() : customizePrompt()
    );
    resetPromptBtn.addEventListener('click', () => resetOverride('prompt'));
    saveDetailPromptBtn.addEventListener('click', saveDetailPromptOverrides);
    discardDetailPromptBtn.addEventListener('click', cancelDetailPromptEdit);

    customizeModelBtn.addEventListener('click', () =>
        detailModelEditMode ? cancelDetailModelEdit() : customizeModel()
    );
    resetModelBtn.addEventListener('click', () => resetOverride('model'));
    saveDetailModelBtn.addEventListener('click', saveDetailModelOverride);
    discardDetailModelBtn.addEventListener('click', cancelDetailModelEdit);

    customizeFilenameBtn.addEventListener('click', () =>
        detailFilenameEditMode ? cancelDetailFilenameEdit() : customizeFilename()
    );
    resetFilenameBtn.addEventListener('click', () => resetOverride('output'));
    saveDetailFilenameBtn.addEventListener('click', saveDetailFilenameOverride);
    discardDetailFilenameBtn.addEventListener('click', cancelDetailFilenameEdit);

    // File selector
    fileSelectorEl = document.getElementById('fileSelector');
    fileCountEl = document.getElementById('fileCount');
    refreshFilesBtn = document.getElementById('refreshFilesBtn');
    processSelectedBtn = document.getElementById('processSelectedBtn');
    dryRunSelectedBtn = document.getElementById('dryRunSelectedBtn');

    refreshFilesBtn.addEventListener('click', loadFileList);
    processSelectedBtn.addEventListener('click', () => processSelectedFiles(false));
    dryRunSelectedBtn.addEventListener('click', () => processSelectedFiles(true));

    initResultsViewer();
}

export async function openClientDetail(clientId) {
    dashboardListView.style.display = 'none';
    clientDetailView.style.display = 'block';
    resetDetailEditState();

    // Show loading state
    detailClientHeader.textContent = '';
    [detailModelEl, detailFieldList, detailTagList, detailFilenameTemplate, detailPromptTemplate].forEach((el) => {
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
        loadFileList();
        loadClientResults(clientId);
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
    fileList = [];
    selectedFiles.clear();
    clearResults();
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

    metaItems.forEach((item) => {
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
    KNOWN_MODELS.forEach((m) => {
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
    ].forEach((h) => {
        const th = document.createElement('th');
        th.className = h.cls;
        th.textContent = h.text;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    fields.forEach((field) => {
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
    ].forEach((h) => {
        const th = document.createElement('th');
        th.className = h.cls;
        th.textContent = h.text;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    tags.forEach((tag) => {
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
        ['pdf', 'csv', 'filename'].forEach((key) => {
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
            ['Name', 'Value', 'Source'].forEach((text) => {
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

    sections.forEach((s) => {
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
    detailFieldDefinitions = null;
    globalFieldDefaults = null;
    if (addDetailFieldBtn) addDetailFieldBtn.style.display = 'none';
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
    resetFieldsBtn.style.display = d.fieldDefinitions.some((f) => f._source === 'override') ? 'inline-flex' : 'none';
    resetTagsBtn.style.display = d.tagDefinitions.some(
        (t) => t._source === 'override' || Object.values(t._parameterSources || {}).some((k) => k === 'override')
    )
        ? 'inline-flex'
        : 'none';
    resetPromptBtn.style.display = d.promptTemplate._source === 'override' ? 'inline-flex' : 'none';
    resetFilenameBtn.style.display = d.filenameTemplate._source === 'override' ? 'inline-flex' : 'none';
    resetModelBtn.style.display = d.model && d.model._source === 'override' ? 'inline-flex' : 'none';
}

// --- FIELDS OVERRIDE ---

function customizeFields() {
    if (!clientDetailData) return;
    detailFieldEditMode = true;

    // Deep copy all fields, stripping annotation props
    detailFieldDefinitions = clientDetailData.fieldDefinitions.map((f) => {
        const copy = { ...f };
        delete copy._source;
        delete copy._globalDefaults;
        return copy;
    });

    // Build globalFieldDefaults map from _globalDefaults (or from current values on first customize)
    globalFieldDefaults = new Map();
    clientDetailData.fieldDefinitions.forEach((f) => {
        if (f._globalDefaults) {
            globalFieldDefaults.set(f.key, f._globalDefaults);
        } else if (f._source === 'global' || !f._globalDefaults) {
            // First time customize or global field — store current values as defaults
            globalFieldDefaults.set(f.key, {
                label: f.label,
                type: f.type,
                schemaHint: f.schemaHint,
                instruction: f.instruction,
                enabled: f.enabled
            });
        }
    });

    customizeFieldsBtn.textContent = 'Editing';
    customizeFieldsBtn.classList.add('active');
    customizeFieldsBtn.classList.remove('btn-primary');
    customizeFieldsBtn.classList.add('btn-secondary');
    addDetailFieldBtn.style.display = 'inline-flex';
    renderDetailFieldListEditable();
}

function cancelDetailFieldEdit() {
    detailFieldEditMode = false;
    detailFieldDefinitions = null;
    globalFieldDefaults = null;
    detailFieldsSaveBar.style.display = 'none';
    customizeFieldsBtn.textContent = 'Customize';
    customizeFieldsBtn.classList.remove('active');
    customizeFieldsBtn.classList.add('btn-primary');
    customizeFieldsBtn.classList.remove('btn-secondary');
    addDetailFieldBtn.style.display = 'none';
    renderDetailFieldList(clientDetailData.fieldDefinitions);
}

function renderDetailFieldListEditable() {
    detailFieldList.textContent = '';

    if (!detailFieldDefinitions || detailFieldDefinitions.length === 0) {
        const p = document.createElement('div');
        p.className = 'empty-placeholder';
        p.textContent = 'No extraction fields defined. Click "+ Add Custom Field" to create one.';
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
        { text: 'Schema Hint', cls: 'col-hint' },
        { text: 'Instruction', cls: 'col-instruction' },
        { text: 'Source', cls: 'col-source' },
        { text: 'Actions', cls: 'col-actions' }
    ].forEach((h) => {
        const th = document.createElement('th');
        th.className = h.cls;
        th.textContent = h.text;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    detailFieldDefinitions.forEach((field, index) => {
        const tr = document.createElement('tr');
        if (!field.enabled) tr.className = 'disabled';
        tr.dataset.index = index;

        const hasGlobalDefault = globalFieldDefaults && globalFieldDefaults.has(field.key);

        // On — clickable toggle
        const tdEnabled = document.createElement('td');
        tdEnabled.className = 'col-enabled';
        if (isCellDifferentFromDefault(index, 'enabled')) tdEnabled.classList.add('cell-modified');
        const toggle = document.createElement('span');
        toggle.className = 'toggle-icon ' + (field.enabled ? 'enabled' : 'disabled');
        toggle.textContent = field.enabled ? '\u25CF' : '\u25CB';
        toggle.style.cursor = 'pointer';
        toggle.addEventListener('click', () => {
            detailFieldDefinitions[index].enabled = !detailFieldDefinitions[index].enabled;
            renderDetailFieldListEditable();
            detailFieldsSaveBar.style.display = 'flex';
        });
        tdEnabled.appendChild(toggle);
        attachContextMenuIfModified(tdEnabled, index, 'enabled');
        tr.appendChild(tdEnabled);

        // Label — click-to-edit
        const tdLabel = document.createElement('td');
        tdLabel.className = 'col-label cell-editable';
        if (isCellDifferentFromDefault(index, 'label')) tdLabel.classList.add('cell-modified');
        const labelView = document.createElement('span');
        labelView.className = 'cell-view';
        labelView.textContent = field.label || '(empty)';
        tdLabel.appendChild(labelView);
        const labelEdit = document.createElement('span');
        labelEdit.className = 'cell-edit';
        const labelInput = document.createElement('input');
        labelInput.type = 'text';
        labelInput.value = field.label || '';
        labelEdit.appendChild(labelInput);
        tdLabel.appendChild(labelEdit);
        setupDetailCellEdit(tdLabel);
        attachContextMenuIfModified(tdLabel, index, 'label');
        tr.appendChild(tdLabel);

        // Key — click-to-edit only for client-added fields (no global default)
        const tdKey = document.createElement('td');
        const isKeyEditable = !hasGlobalDefault && !field.key;
        tdKey.className = 'col-key' + (isKeyEditable ? ' cell-editable' : '');
        const keyView = document.createElement('span');
        keyView.className = 'cell-view';
        const keyCode = document.createElement('code');
        keyCode.textContent = field.key || '(auto)';
        keyView.appendChild(keyCode);
        tdKey.appendChild(keyView);
        if (isKeyEditable) {
            const keyEdit = document.createElement('span');
            keyEdit.className = 'cell-edit';
            const keyInput = document.createElement('input');
            keyInput.type = 'text';
            keyInput.value = field.key || '';
            keyEdit.appendChild(keyInput);
            tdKey.appendChild(keyEdit);
            setupDetailCellEdit(tdKey);
        }
        tr.appendChild(tdKey);

        // Type — click-to-edit
        const tdType = document.createElement('td');
        tdType.className = 'col-type cell-editable';
        if (isCellDifferentFromDefault(index, 'type')) tdType.classList.add('cell-modified');
        const typeView = document.createElement('span');
        typeView.className = 'cell-view';
        typeView.textContent = field.type || 'text';
        tdType.appendChild(typeView);
        const typeEdit = document.createElement('span');
        typeEdit.className = 'cell-edit';
        const typeSelect = document.createElement('select');
        VALID_FIELD_TYPES.forEach((t) => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            opt.selected = t === field.type;
            typeSelect.appendChild(opt);
        });
        typeEdit.appendChild(typeSelect);
        tdType.appendChild(typeEdit);
        setupDetailCellEdit(tdType);
        attachContextMenuIfModified(tdType, index, 'type');
        tr.appendChild(tdType);

        // Schema Hint — click-to-edit
        const tdHint = document.createElement('td');
        tdHint.className = 'col-hint cell-editable';
        if (isCellDifferentFromDefault(index, 'schemaHint')) tdHint.classList.add('cell-modified');
        const hintView = document.createElement('span');
        hintView.className = 'cell-view cell-view-truncate';
        hintView.title = field.schemaHint || '';
        hintView.textContent = field.schemaHint || '(empty)';
        tdHint.appendChild(hintView);
        const hintEdit = document.createElement('span');
        hintEdit.className = 'cell-edit';
        const hintTextarea = document.createElement('textarea');
        hintTextarea.rows = 3;
        hintTextarea.value = field.schemaHint || '';
        hintEdit.appendChild(hintTextarea);
        tdHint.appendChild(hintEdit);
        setupDetailCellEdit(tdHint);
        attachContextMenuIfModified(tdHint, index, 'schemaHint');
        tr.appendChild(tdHint);

        // Instruction — click-to-edit
        const tdInstr = document.createElement('td');
        tdInstr.className = 'col-instruction cell-editable';
        if (isCellDifferentFromDefault(index, 'instruction')) tdInstr.classList.add('cell-modified');
        const instrView = document.createElement('span');
        instrView.className = 'cell-view cell-view-truncate';
        instrView.title = field.instruction || '';
        instrView.textContent = field.instruction || '(empty)';
        tdInstr.appendChild(instrView);
        const instrEdit = document.createElement('span');
        instrEdit.className = 'cell-edit';
        const instrTextarea = document.createElement('textarea');
        instrTextarea.rows = 3;
        instrTextarea.value = field.instruction || '';
        instrEdit.appendChild(instrTextarea);
        tdInstr.appendChild(instrEdit);
        setupDetailCellEdit(tdInstr);
        attachContextMenuIfModified(tdInstr, index, 'instruction');
        tr.appendChild(tdInstr);

        // Source
        const tdSource = document.createElement('td');
        tdSource.className = 'col-source';
        const sourceBadge = document.createElement('span');
        sourceBadge.className = hasGlobalDefault
            ? 'source-badge source-badge-global'
            : 'source-badge source-badge-override';
        sourceBadge.textContent = hasGlobalDefault ? 'Global' : 'Custom';
        tdSource.appendChild(sourceBadge);
        tr.appendChild(tdSource);

        // Actions
        const tdActions = document.createElement('td');
        tdActions.className = 'col-actions';
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'row-actions';

        const moveUpBtn = document.createElement('button');
        moveUpBtn.className = 'btn-icon';
        moveUpBtn.title = 'Move up';
        moveUpBtn.textContent = '\u25B2';
        moveUpBtn.disabled = index === 0;
        moveUpBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            moveDetailField(index, -1);
        });
        actionsDiv.appendChild(moveUpBtn);

        const moveDownBtn = document.createElement('button');
        moveDownBtn.className = 'btn-icon';
        moveDownBtn.title = 'Move down';
        moveDownBtn.textContent = '\u25BC';
        moveDownBtn.disabled = index === detailFieldDefinitions.length - 1;
        moveDownBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            moveDetailField(index, 1);
        });
        actionsDiv.appendChild(moveDownBtn);

        // Delete only for client-added fields (no global default)
        if (!hasGlobalDefault) {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn-icon btn-icon-danger';
            deleteBtn.title = 'Delete field';
            deleteBtn.textContent = '\u2715';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteDetailField(index);
            });
            actionsDiv.appendChild(deleteBtn);
        }

        tdActions.appendChild(actionsDiv);
        tr.appendChild(tdActions);

        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    detailFieldList.appendChild(table);
}

// --- Detail field editing helpers ---

function setupDetailCellEdit(td) {
    td.addEventListener('click', () => {
        if (td.classList.contains('editing')) return;

        // Close any other editing cell in the table
        const table = td.closest('table');
        if (table) {
            table.querySelectorAll('td.editing').forEach((other) => {
                if (other !== td) flushDetailCellEdit(other);
            });
        }

        const input = td.querySelector('.cell-edit input, .cell-edit textarea, .cell-edit select');
        if (input) td._originalValue = input.value;

        td.classList.add('editing');

        if (input) {
            input.focus();

            const blurHandler = () => {
                input.removeEventListener('blur', blurHandler);
                flushDetailCellEdit(td);
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
    });
}

function flushDetailCellEdit(td) {
    td.classList.remove('editing');
    const input = td.querySelector('.cell-edit input, .cell-edit textarea, .cell-edit select');
    const viewSpan = td.querySelector('.cell-view');

    if (input && viewSpan) {
        const tr = td.closest('tr');
        const index = parseInt(tr.dataset.index);
        const newVal = input.tagName === 'SELECT' ? input.value : input.value.trim();

        // Determine which property to update
        if (td.classList.contains('col-label')) {
            detailFieldDefinitions[index].label = newVal;
            // Auto-generate key for new fields
            if (!globalFieldDefaults || !globalFieldDefaults.has(detailFieldDefinitions[index].key)) {
                if (!detailFieldDefinitions[index].key) {
                    detailFieldDefinitions[index].key = labelToCamelCase(newVal);
                }
            }
        } else if (td.classList.contains('col-key')) {
            detailFieldDefinitions[index].key = newVal;
        } else if (td.classList.contains('col-type')) {
            detailFieldDefinitions[index].type = newVal;
        } else if (td.classList.contains('col-hint')) {
            detailFieldDefinitions[index].schemaHint = newVal;
        } else if (td.classList.contains('col-instruction')) {
            detailFieldDefinitions[index].instruction = newVal;
        }

        // Update view text
        if (viewSpan.querySelector('code')) {
            viewSpan.querySelector('code').textContent = newVal || '(auto)';
        } else if (input.tagName === 'SELECT') {
            viewSpan.textContent = newVal;
        } else {
            viewSpan.textContent = newVal || '(empty)';
            if (viewSpan.classList.contains('cell-view-truncate')) {
                viewSpan.title = newVal;
            }
        }

        // Update diff class
        const propName = td.classList.contains('col-label')
            ? 'label'
            : td.classList.contains('col-type')
              ? 'type'
              : td.classList.contains('col-hint')
                ? 'schemaHint'
                : td.classList.contains('col-instruction')
                  ? 'instruction'
                  : null;

        if (propName) {
            if (isCellDifferentFromDefault(index, propName)) {
                td.classList.add('cell-modified');
            } else {
                td.classList.remove('cell-modified');
            }
        }

        detailFieldsSaveBar.style.display = 'flex';
    }
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

function isCellDifferentFromDefault(fieldIndex, propName) {
    if (!globalFieldDefaults || !detailFieldDefinitions) return false;
    const field = detailFieldDefinitions[fieldIndex];
    if (!field) return false;
    const defaults = globalFieldDefaults.get(field.key);
    if (!defaults) return false; // client-added field, no default to compare
    return field[propName] !== defaults[propName];
}

function attachContextMenuIfModified(td, fieldIndex, propName) {
    td.addEventListener('contextmenu', (e) => {
        if (!isCellDifferentFromDefault(fieldIndex, propName)) return;
        e.preventDefault();
        showFieldContextMenu(e, fieldIndex, propName);
    });
}

function showFieldContextMenu(e, fieldIndex, propName) {
    contextMenuEl.textContent = '';

    const item = document.createElement('button');
    item.className = 'detail-context-menu-item';
    item.textContent = 'Reset to global default';
    item.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const field = detailFieldDefinitions[fieldIndex];
        const defaults = globalFieldDefaults.get(field.key);
        if (defaults && defaults[propName] !== undefined) {
            field[propName] = defaults[propName];
            renderDetailFieldListEditable();
            detailFieldsSaveBar.style.display = 'flex';
        }
        contextMenuEl.classList.remove('visible');
    });
    contextMenuEl.appendChild(item);

    contextMenuEl.style.left = e.clientX + 'px';
    contextMenuEl.style.top = e.clientY + 'px';
    contextMenuEl.classList.add('visible');
}

function addDetailCustomField() {
    if (!detailFieldDefinitions) return;
    detailFieldDefinitions.push({
        key: '',
        label: '',
        type: 'text',
        schemaHint: '',
        instruction: '',
        enabled: true
    });
    renderDetailFieldListEditable();
    detailFieldsSaveBar.style.display = 'flex';

    // Focus the label cell of the new row
    const lastRow = detailFieldList.querySelector('tbody tr:last-child');
    if (lastRow) {
        const labelTd = lastRow.querySelector('td.col-label');
        if (labelTd) {
            labelTd.click();
        }
    }
}

function moveDetailField(index, direction) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= detailFieldDefinitions.length) return;
    const temp = detailFieldDefinitions[index];
    detailFieldDefinitions[index] = detailFieldDefinitions[newIndex];
    detailFieldDefinitions[newIndex] = temp;
    renderDetailFieldListEditable();
    detailFieldsSaveBar.style.display = 'flex';
}

function deleteDetailField(index) {
    detailFieldDefinitions.splice(index, 1);
    renderDetailFieldListEditable();
    detailFieldsSaveBar.style.display = 'flex';
}

async function saveDetailFieldOverrides() {
    if (!clientDetailData || !detailFieldDefinitions) return;
    const clientId = clientDetailData.client.clientId;

    // Flush any editing cells
    const table = detailFieldList.querySelector('table');
    if (table) {
        table.querySelectorAll('td.editing').forEach((td) => flushDetailCellEdit(td));
    }

    // Validate all fields
    if (detailFieldDefinitions.length === 0) {
        showAlert('At least one field definition is required', 'error');
        return;
    }

    for (let i = 0; i < detailFieldDefinitions.length; i++) {
        const field = detailFieldDefinitions[i];
        const rowNum = i + 1;

        if (!field.label) {
            showAlert(`Row ${rowNum}: label is required`, 'error');
            return;
        }
        if (!field.key) {
            showAlert(`Row ${rowNum}: key is required`, 'error');
            return;
        }
        if (!/^[a-z][a-zA-Z0-9]*$/.test(field.key)) {
            showAlert(
                `Row ${rowNum}: key must start with a lowercase letter and contain only alphanumeric characters`,
                'error'
            );
            return;
        }
        if (!VALID_FIELD_TYPES.includes(field.type)) {
            showAlert(`Row ${rowNum}: invalid field type`, 'error');
            return;
        }
        if (!field.schemaHint) {
            showAlert(`Row ${rowNum}: schema hint is required`, 'error');
            return;
        }
        if (!field.instruction) {
            showAlert(`Row ${rowNum}: instruction is required`, 'error');
            return;
        }

        const duplicateIndex = detailFieldDefinitions.findIndex((f, j) => j !== i && f.key === field.key);
        if (duplicateIndex !== -1) {
            showAlert(`Row ${rowNum}: duplicate key "${field.key}" (also in row ${duplicateIndex + 1})`, 'error');
            return;
        }
    }

    try {
        saveDetailFieldsBtn.disabled = true;
        saveDetailFieldsBtn.textContent = 'Saving...';

        const response = await fetch(`/api/clients/${clientId}/overrides`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ section: 'fields', data: detailFieldDefinitions })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || result.details || 'Save failed');

        clientDetailData = result;
        cancelDetailFieldEdit();
        renderDetailFieldList(clientDetailData.fieldDefinitions);
        updateDetailResetButtons();
        showAlert('Field definitions saved', 'success');
    } catch (error) {
        showAlert('Failed to save field definitions: ' + error.message, 'error');
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
    clientDetailData.tagDefinitions.forEach((tag) => {
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
    ].forEach((h) => {
        const th = document.createElement('th');
        th.className = h.cls;
        th.textContent = h.text;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    tags.forEach((tag) => {
        const override = detailTagOverrides[tag.id];
        const effectiveEnabled =
            override && typeof override.enabled === 'boolean' ? override.enabled : tag.enabled !== false;
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
        ['pdf', 'csv', 'filename'].forEach((key) => {
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
            ['Name', 'Value', 'Source'].forEach((text) => {
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
                const effectiveValue = overrideValue !== undefined ? overrideValue : paramDef.default || '';
                const paramSource =
                    overrideValue !== undefined ? 'override' : (tag._parameterSources || {})[paramKey] || 'global';

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

    sections.forEach((s) => {
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
        showAlert(
            `${sectionNames[section].charAt(0).toUpperCase() + sectionNames[section].slice(1)} settings reset to global defaults`,
            'success'
        );
    } catch (error) {
        showAlert('Failed to reset: ' + error.message, 'error');
    }
}

// --- FILE SELECTOR ---

async function loadFileList() {
    if (!clientDetailData) return;
    const clientId = clientDetailData.client.clientId;

    fileSelectorEl.textContent = '';
    const loading = document.createElement('div');
    loading.className = 'loading-placeholder';
    loading.textContent = 'Loading files...';
    fileSelectorEl.appendChild(loading);

    try {
        const response = await fetch(`/api/clients/${clientId}/files`);
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to load files');
        }

        const data = await response.json();
        fileList = data.files || [];
        selectedFiles.clear();
        fileCountEl.textContent = fileList.length > 0 ? `(${fileList.length})` : '';
        renderFileList();
    } catch (error) {
        fileSelectorEl.textContent = '';
        const errDiv = document.createElement('div');
        errDiv.className = 'error-placeholder';
        errDiv.textContent = 'Failed to load files: ' + error.message;
        fileSelectorEl.appendChild(errDiv);
    }
}

function renderFileList() {
    fileSelectorEl.textContent = '';
    updateFileActionButtons();

    if (fileList.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-placeholder';
        empty.textContent = 'No PDF files in input folder.';
        fileSelectorEl.appendChild(empty);
        return;
    }

    // Select all / deselect all row
    const toggleRow = document.createElement('div');
    toggleRow.className = 'file-select-toggle';
    const selectAllBtn = document.createElement('button');
    selectAllBtn.className = 'btn btn-small btn-secondary';
    selectAllBtn.textContent = 'Select All';
    selectAllBtn.addEventListener('click', () => {
        fileList.forEach((f) => selectedFiles.add(f.filename));
        renderFileList();
    });
    const deselectAllBtn = document.createElement('button');
    deselectAllBtn.className = 'btn btn-small btn-secondary';
    deselectAllBtn.textContent = 'Deselect All';
    deselectAllBtn.addEventListener('click', () => {
        selectedFiles.clear();
        renderFileList();
    });
    toggleRow.appendChild(selectAllBtn);
    toggleRow.appendChild(deselectAllBtn);
    fileSelectorEl.appendChild(toggleRow);

    // File list
    const list = document.createElement('div');
    list.className = 'file-list';

    fileList.forEach((file) => {
        const row = document.createElement('label');
        row.className = 'file-list-item';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = selectedFiles.has(file.filename);
        cb.addEventListener('change', () => {
            if (cb.checked) {
                selectedFiles.add(file.filename);
            } else {
                selectedFiles.delete(file.filename);
            }
            updateFileActionButtons();
        });
        row.appendChild(cb);

        const nameSpan = document.createElement('span');
        nameSpan.className = 'file-name';
        nameSpan.textContent = file.filename;
        row.appendChild(nameSpan);

        const sizeSpan = document.createElement('span');
        sizeSpan.className = 'file-size';
        sizeSpan.textContent = formatFileSize(file.size);
        row.appendChild(sizeSpan);

        list.appendChild(row);
    });

    fileSelectorEl.appendChild(list);
}

function updateFileActionButtons() {
    const hasSelection = selectedFiles.size > 0;
    processSelectedBtn.style.display = hasSelection ? 'inline-flex' : 'none';
    dryRunSelectedBtn.style.display = hasSelection ? 'inline-flex' : 'none';

    if (hasSelection) {
        processSelectedBtn.textContent = `Process ${selectedFiles.size} File${selectedFiles.size > 1 ? 's' : ''}`;
        dryRunSelectedBtn.textContent = `Dry Run ${selectedFiles.size}`;
    }
}

async function processSelectedFiles(dryRun) {
    if (!clientDetailData || selectedFiles.size === 0) return;
    if (isFileProcessing) {
        showAlert('Processing already in progress', 'warning');
        return;
    }

    const clientId = clientDetailData.client.clientId;
    const files = Array.from(selectedFiles);

    isFileProcessing = true;
    processSelectedBtn.disabled = true;
    dryRunSelectedBtn.disabled = true;
    clearLog();
    addLogEntry(
        (dryRun ? '[DRY RUN] ' : '') + `Processing ${files.length} selected file${files.length > 1 ? 's' : ''}...`,
        'info'
    );

    try {
        const response = await fetch(`/api/clients/${clientId}/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dryRun, files })
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            const text = decoder.decode(value);
            const lines = text.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        handleFileProcessingUpdate(data);
                    } catch {
                        // Ignore parse errors
                    }
                }
            }
        }
    } catch (error) {
        addLogEntry('Error: ' + error.message, 'error');
        showAlert('Processing failed: ' + error.message, 'error');
    } finally {
        isFileProcessing = false;
        processSelectedBtn.disabled = false;
        dryRunSelectedBtn.disabled = false;
        loadFileList();
        loadClientResults(clientId);
    }
}

function handleFileProcessingUpdate(data) {
    switch (data.status) {
        case 'connected':
            addLogEntry('Connected to server...', 'info');
            break;
        case 'starting':
            addLogEntry(`Found ${data.total} file${data.total > 1 ? 's' : ''}. Processing...`, 'info');
            break;
        case 'analyzing':
            addLogEntry('Analyzing: ' + data.filename + '...', 'processing');
            break;
        case 'completed':
            addLogEntry('Completed: ' + data.filename + ' -> ' + data.outputFilename, 'success');
            break;
        case 'dry-run-completed':
            addLogEntry('Dry run: ' + data.filename + ' -> ' + data.outputFilename, 'success');
            break;
        case 'failed':
            addLogEntry('Failed: ' + data.filename + ' - ' + data.error, 'error');
            break;
        case 'done':
            addLogEntry(`Complete: ${data.success} successful, ${data.failed} failed`, 'info');
            if (data.failed === 0 && data.success > 0) {
                showAlert(`Processed ${data.success} file${data.success > 1 ? 's' : ''}!`, 'success');
            } else if (data.failed > 0) {
                showAlert(`Processed ${data.success}, ${data.failed} failed`, 'warning');
            }
            break;
        case 'error':
            addLogEntry('Error: ' + data.error, 'error');
            showAlert('Processing error: ' + data.error, 'error');
            break;
    }
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
