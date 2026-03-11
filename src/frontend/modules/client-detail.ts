// Client Detail View module
// Manages the detail view for a single client: config display, override editing.

import { showAlert, addLogEntry, clearLog } from './ui-utils.js';
import { KNOWN_MODELS, VALID_FIELD_TYPES, VALID_FIELD_FORMATS, FORMAT_NONE } from './constants.js';
import { createPlaceholderChip, FILENAME_SAMPLE_DATA, SPECIAL_PLACEHOLDERS } from './filename-editor.js';
import { initResultsViewer, loadClientResults, clearResults } from './results-viewer.js';

// --- State ---
let clientDetailData: Record<string, unknown> | null = null;
let fileList: Array<{ filename: string; size: number }> = [];
const selectedFiles = new Set<string>();
let isFileProcessing = false;

// Per-section edit state
let detailFieldEditMode = false;
let detailFieldDefinitions: Record<string, unknown>[] | null = null;
let globalFieldDefaults: Map<string, Record<string, unknown>> | null = null;
let detailTagEditMode = false;
let detailTagOverrides: Record<string, Record<string, unknown>> | null = null;
let detailPromptEditMode = false;
let detailPromptOverride: Record<string, string> | null = null;
let detailFilenameEditMode = false;
let detailFilenameOverride: string | null = null;
let detailPromptPreviewDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let detailModelEditMode = false;
let detailModelOverride: string | null = null;

// --- DOM refs (set in init) ---
let dashboardListView: HTMLElement;
let clientDetailView: HTMLElement;
let backToDashboardBtn: HTMLElement;
let detailClientHeader: HTMLElement;
let detailFieldList: HTMLElement;
let detailTagList: HTMLElement;
let detailFilenameTemplate: HTMLElement & {
    _previewWrapper?: HTMLElement & { _previewCode?: HTMLElement; _previewCharCount?: HTMLElement };
};
let detailPromptTemplate: HTMLElement & {
    _previewWrapper?: HTMLElement & { _previewCode?: HTMLElement; _previewCharCount?: HTMLElement };
};
let detailModelEl: HTMLElement;
let fileSelectorEl: HTMLElement;
let fileCountEl: HTMLElement;
let refreshFilesBtn: HTMLElement;
let processSelectedBtn: HTMLButtonElement;
let dryRunSelectedBtn: HTMLButtonElement;

// Add-field button
let addDetailFieldBtn: HTMLElement | null = null;

// Override buttons
let customizeFieldsBtn: HTMLElement;
let resetFieldsBtn: HTMLElement;
let saveDetailFieldsBtn: HTMLButtonElement;
let discardDetailFieldsBtn: HTMLElement;
let detailFieldsSaveBar: HTMLElement;
let customizeTagsBtn: HTMLElement;
let resetTagsBtn: HTMLElement;
let saveDetailTagsBtn: HTMLButtonElement;
let discardDetailTagsBtn: HTMLElement;
let detailTagsSaveBar: HTMLElement;
let customizeFilenameBtn: HTMLElement;
let resetFilenameBtn: HTMLElement;
let saveDetailFilenameBtn: HTMLButtonElement;
let discardDetailFilenameBtn: HTMLElement;
let detailFilenameSaveBar: HTMLElement;
let customizePromptBtn: HTMLElement;
let resetPromptBtn: HTMLElement;
let saveDetailPromptBtn: HTMLButtonElement;
let discardDetailPromptBtn: HTMLElement;
let detailPromptSaveBar: HTMLElement;
let customizeModelBtn: HTMLElement;
let resetModelBtn: HTMLElement;
let saveDetailModelBtn: HTMLButtonElement;
let discardDetailModelBtn: HTMLElement;
let detailModelSaveBar: HTMLElement;

// --- Public API ---

export function initClientDetail(): void {
    dashboardListView = document.getElementById('dashboardListView')!;
    clientDetailView = document.getElementById('clientDetailView')!;
    backToDashboardBtn = document.getElementById('backToDashboardBtn')!;
    detailClientHeader = document.getElementById('detailClientHeader')!;
    detailFieldList = document.getElementById('detailFieldList')!;
    detailTagList = document.getElementById('detailTagList')!;
    detailFilenameTemplate = document.getElementById('detailFilenameTemplate')! as typeof detailFilenameTemplate;
    detailPromptTemplate = document.getElementById('detailPromptTemplate')! as typeof detailPromptTemplate;
    detailModelEl = document.getElementById('detailModel')!;

    customizeFieldsBtn = document.getElementById('customizeFieldsBtn')!;
    resetFieldsBtn = document.getElementById('resetFieldsBtn')!;
    saveDetailFieldsBtn = document.getElementById('saveDetailFieldsBtn') as HTMLButtonElement;
    discardDetailFieldsBtn = document.getElementById('discardDetailFieldsBtn')!;
    detailFieldsSaveBar = document.getElementById('detailFieldsSaveBar')!;
    addDetailFieldBtn = document.getElementById('addDetailFieldBtn')!;

    customizeTagsBtn = document.getElementById('customizeTagsBtn')!;
    resetTagsBtn = document.getElementById('resetTagsBtn')!;
    saveDetailTagsBtn = document.getElementById('saveDetailTagsBtn') as HTMLButtonElement;
    discardDetailTagsBtn = document.getElementById('discardDetailTagsBtn')!;
    detailTagsSaveBar = document.getElementById('detailTagsSaveBar')!;

    customizeFilenameBtn = document.getElementById('customizeFilenameBtn')!;
    resetFilenameBtn = document.getElementById('resetFilenameBtn')!;
    saveDetailFilenameBtn = document.getElementById('saveDetailFilenameBtn') as HTMLButtonElement;
    discardDetailFilenameBtn = document.getElementById('discardDetailFilenameBtn')!;
    detailFilenameSaveBar = document.getElementById('detailFilenameSaveBar')!;

    customizePromptBtn = document.getElementById('customizePromptBtn')!;
    resetPromptBtn = document.getElementById('resetPromptBtn')!;
    saveDetailPromptBtn = document.getElementById('saveDetailPromptBtn') as HTMLButtonElement;
    discardDetailPromptBtn = document.getElementById('discardDetailPromptBtn')!;
    detailPromptSaveBar = document.getElementById('detailPromptSaveBar')!;

    customizeModelBtn = document.getElementById('customizeModelBtn')!;
    resetModelBtn = document.getElementById('resetModelBtn')!;
    saveDetailModelBtn = document.getElementById('saveDetailModelBtn') as HTMLButtonElement;
    discardDetailModelBtn = document.getElementById('discardDetailModelBtn')!;
    detailModelSaveBar = document.getElementById('detailModelSaveBar')!;

    // Back to dashboard
    backToDashboardBtn.addEventListener('click', closeClientDetail);

    // Override buttons
    customizeFieldsBtn.addEventListener('click', () =>
        detailFieldEditMode ? cancelDetailFieldEdit() : customizeFields()
    );
    resetFieldsBtn.addEventListener('click', () => resetOverride('fields'));
    saveDetailFieldsBtn.addEventListener('click', saveDetailFieldOverrides);
    discardDetailFieldsBtn.addEventListener('click', cancelDetailFieldEdit);
    addDetailFieldBtn!.addEventListener('click', addDetailCustomField);

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
    fileSelectorEl = document.getElementById('fileSelector')!;
    fileCountEl = document.getElementById('fileCount')!;
    refreshFilesBtn = document.getElementById('refreshFilesBtn')!;
    processSelectedBtn = document.getElementById('processSelectedBtn') as HTMLButtonElement;
    dryRunSelectedBtn = document.getElementById('dryRunSelectedBtn') as HTMLButtonElement;

    refreshFilesBtn.addEventListener('click', loadFileList);
    processSelectedBtn.addEventListener('click', () => processSelectedFiles(false));
    dryRunSelectedBtn.addEventListener('click', () => processSelectedFiles(true));

    initResultsViewer();
}

export async function openClientDetail(clientId: string): Promise<void> {
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
        errDiv.textContent = 'Failed to load client: ' + (error as Error).message;
        detailClientHeader.appendChild(errDiv);
    }
}

export function closeClientDetail(): void {
    clientDetailView.style.display = 'none';
    dashboardListView.style.display = 'block';
    resetDetailEditState();
    clientDetailData = null;
    fileList = [];
    selectedFiles.clear();
    clearResults();
}

// --- Internal: Rendering ---

function createSourceBadge(source: string): HTMLSpanElement {
    const badge = document.createElement('span');
    badge.className = source === 'custom' ? 'source-badge source-badge-override' : 'source-badge source-badge-global';
    badge.textContent = source === 'custom' ? 'Custom' : 'Global';
    return badge;
}

function renderClientDetail(): void {
    const data = clientDetailData;
    if (!data) return;

    const c = data.client as Record<string, unknown>;
    const folderStatus = c.folderStatus as Record<string, unknown>;
    detailClientHeader.textContent = '';

    // Name row
    const h2 = document.createElement('h2');
    h2.className = 'detail-client-name';
    const statusDot = document.createElement('span');
    statusDot.className = 'status-icon';
    statusDot.style.color = c.enabled ? 'var(--success)' : 'var(--text-secondary)';
    statusDot.textContent = c.enabled ? '\u25CF' : '\u25CB';
    h2.appendChild(statusDot);
    h2.appendChild(document.createTextNode(' ' + (c.name as string)));
    detailClientHeader.appendChild(h2);

    const idDiv = document.createElement('div');
    idDiv.className = 'detail-client-id';
    idDiv.textContent = c.clientId as string;
    detailClientHeader.appendChild(idDiv);

    const meta = document.createElement('div');
    meta.className = 'detail-client-meta';

    const metaItems = [
        { label: 'Status', value: c.enabled ? 'Enabled' : 'Disabled' },
        { label: 'Pending', value: String(folderStatus.inputPdfCount) },
        { label: 'Processed', value: String(folderStatus.processedCount) }
    ];

    metaItems.forEach((item) => {
        const div = document.createElement('div');
        div.className = 'detail-meta-item';
        const lbl = document.createElement('span');
        lbl.className = 'detail-meta-label';
        lbl.textContent = item.label;
        const val = document.createElement('span');
        val.className = 'detail-meta-value';
        val.textContent = item.value as string;
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
    folderVal.textContent = c.folderPath as string;
    folderDiv.appendChild(folderLbl);
    folderDiv.appendChild(folderVal);
    if (!folderStatus.exists) {
        const warn = document.createElement('span');
        warn.className = 'folder-warning';
        warn.textContent = 'Folder not found';
        folderDiv.appendChild(warn);
    }
    meta.appendChild(folderDiv);

    detailClientHeader.appendChild(meta);

    renderDetailModel(data.model as Record<string, unknown>);
    renderDetailFieldList(data.fieldDefinitions as Record<string, unknown>[]);
    renderDetailTagList(data.tagDefinitions as Record<string, unknown>[]);
    renderDetailFilenameTemplate(data.filenameTemplate as Record<string, unknown>);
    renderDetailPromptTemplate(data.promptTemplate as Record<string, unknown>);
}

function renderDetailModel(modelData: Record<string, unknown>): void {
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
    code.textContent = (modelData.value as string) || '(default)';
    wrapper.appendChild(code);

    wrapper.appendChild(createSourceBadge(modelData._source as string));

    detailModelEl.appendChild(wrapper);
}

function renderDetailModelEditable(modelData: Record<string, unknown>): void {
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

    const currentValue = detailModelOverride || (modelData.value as string) || KNOWN_MODELS[0];
    if ((KNOWN_MODELS as readonly string[]).includes(currentValue)) {
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
    if (!(KNOWN_MODELS as readonly string[]).includes(currentValue)) {
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

function renderDetailFieldList(fields: Record<string, unknown>[]): void {
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
        { text: 'Format', cls: 'col-format' },
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

        const tdEnabled = document.createElement('td');
        tdEnabled.className = 'col-enabled';
        const toggle = document.createElement('span');
        toggle.className = 'toggle-icon ' + (field.enabled ? 'enabled' : 'disabled');
        toggle.textContent = field.enabled ? '\u25CF' : '\u25CB';
        tdEnabled.appendChild(toggle);
        tr.appendChild(tdEnabled);

        const tdLabel = document.createElement('td');
        tdLabel.className = 'col-label';
        tdLabel.textContent = (field.label as string) || '(empty)';
        tr.appendChild(tdLabel);

        const tdKey = document.createElement('td');
        tdKey.className = 'col-key';
        const keyCode = document.createElement('code');
        keyCode.textContent = field.key as string;
        tdKey.appendChild(keyCode);
        tr.appendChild(tdKey);

        const tdType = document.createElement('td');
        tdType.className = 'col-type';
        tdType.textContent = field.type as string;
        tr.appendChild(tdType);

        const tdFormat = document.createElement('td');
        tdFormat.className = 'col-format';
        tdFormat.textContent =
            field.format && field.format !== FORMAT_NONE
                ? VALID_FIELD_FORMATS[field.format as string]?.label || (field.format as string)
                : 'None';
        tr.appendChild(tdFormat);

        const tdHint = document.createElement('td');
        tdHint.className = 'col-hint';
        const hintSpan = document.createElement('span');
        hintSpan.className = 'cell-view-truncate';
        hintSpan.title = (field.schemaHint as string) || '';
        hintSpan.textContent = (field.schemaHint as string) || '(empty)';
        tdHint.appendChild(hintSpan);
        tr.appendChild(tdHint);

        const tdInstr = document.createElement('td');
        tdInstr.className = 'col-instruction';
        const instrSpan = document.createElement('span');
        instrSpan.className = 'cell-view-truncate';
        instrSpan.title = (field.instruction as string) || '';
        instrSpan.textContent = (field.instruction as string) || '(empty)';
        tdInstr.appendChild(instrSpan);
        tr.appendChild(tdInstr);

        const tdSource = document.createElement('td');
        tdSource.className = 'col-source';
        tdSource.appendChild(createSourceBadge(field._source as string));
        tr.appendChild(tdSource);

        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    detailFieldList.appendChild(table);
}

function renderDetailTagList(tags: Record<string, unknown>[]): void {
    detailTagList.textContent = '';

    if (!tags || tags.length === 0) {
        const p = document.createElement('div');
        p.className = 'empty-placeholder';
        p.textContent = 'No tag rules defined.';
        detailTagList.appendChild(p);
        return;
    }

    const colCount = 5;

    const table = document.createElement('table');
    table.className = 'tags-table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    [
        { text: 'On', cls: 'col-enabled' },
        { text: 'Label', cls: 'col-label' },
        { text: 'ID', cls: 'col-id' },
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
    tags.forEach((tag) => {
        const tr = document.createElement('tr');
        if (tag.enabled === false) tr.classList.add('disabled');

        const tdEnabled = document.createElement('td');
        tdEnabled.className = 'col-enabled';
        const toggle = document.createElement('span');
        toggle.className = 'toggle-icon ' + (tag.enabled !== false ? 'enabled' : 'disabled');
        toggle.textContent = tag.enabled !== false ? '\u25CF' : '\u25CB';
        tdEnabled.appendChild(toggle);
        tr.appendChild(tdEnabled);

        const tdLabel = document.createElement('td');
        tdLabel.className = 'col-label';
        tdLabel.textContent = (tag.label as string) || '(untitled)';
        tr.appendChild(tdLabel);

        const tdId = document.createElement('td');
        tdId.className = 'col-id';
        const idCode = document.createElement('code');
        idCode.textContent = (tag.id as string) || '';
        tdId.appendChild(idCode);
        tr.appendChild(tdId);

        const tdInstr = document.createElement('td');
        tdInstr.className = 'col-instruction';
        const instrSpan = document.createElement('span');
        instrSpan.className = 'cell-view-truncate';
        instrSpan.title = (tag.instruction as string) || '';
        instrSpan.textContent = (tag.instruction as string) || '(empty)';
        tdInstr.appendChild(instrSpan);
        tr.appendChild(tdInstr);

        const tdSource = document.createElement('td');
        tdSource.className = 'col-source';
        tdSource.appendChild(createSourceBadge(tag._source as string));
        tr.appendChild(tdSource);

        tbody.appendChild(tr);

        // Parameters detail row
        const params = (tag.parameters || {}) as Record<string, Record<string, string>>;
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
            ['Name', 'Value'].forEach((text) => {
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

function renderDetailFilenameTemplate(fnTemplate: Record<string, unknown>): void {
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
    badgeRow.appendChild(createSourceBadge(fnTemplate._source as string));
    detailFilenameTemplate.appendChild(badgeRow);

    const valueDiv = document.createElement('div');
    valueDiv.className = 'detail-filename-value';
    valueDiv.textContent = fnTemplate.template as string;
    detailFilenameTemplate.appendChild(valueDiv);
}

function renderDetailPromptTemplate(prompt: Record<string, unknown>): void {
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
    badgeRow.appendChild(createSourceBadge(prompt._source as string));
    detailPromptTemplate.appendChild(badgeRow);

    const sections = [
        { label: 'Preamble', value: prompt.preamble as string },
        { label: 'General Rules', value: prompt.generalRules as string },
        { label: 'Suffix', value: prompt.suffix as string }
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

    appendDetailPromptPreview(detailPromptTemplate, false);
}

// --- Internal: Override editing ---

function resetDetailEditState(): void {
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

function updateDetailResetButtons(): void {
    if (!clientDetailData) return;
    const d = clientDetailData;
    resetFieldsBtn.style.display = (d.fieldDefinitions as Record<string, unknown>[]).some(
        (f) => f._source === 'override'
    )
        ? 'inline-flex'
        : 'none';
    resetTagsBtn.style.display = (d.tagDefinitions as Record<string, unknown>[]).some((t) => t._source === 'override')
        ? 'inline-flex'
        : 'none';
    resetPromptBtn.style.display =
        (d.promptTemplate as Record<string, unknown>)._source === 'override' ? 'inline-flex' : 'none';
    resetFilenameBtn.style.display =
        (d.filenameTemplate as Record<string, unknown>)._source === 'override' ? 'inline-flex' : 'none';
    resetModelBtn.style.display =
        d.model && (d.model as Record<string, unknown>)._source === 'override' ? 'inline-flex' : 'none';
}

// --- FIELDS OVERRIDE ---

function customizeFields(): void {
    if (!clientDetailData) return;
    detailFieldEditMode = true;

    detailFieldDefinitions = (clientDetailData.fieldDefinitions as Record<string, unknown>[]).map((f) => ({ ...f }));

    globalFieldDefaults = new Map();
    (clientDetailData.fieldDefinitions as Record<string, unknown>[]).forEach((f) => {
        if (f._source === 'global' || f._source === 'override') {
            globalFieldDefaults!.set(f.key as string, {
                label: f.label,
                type: f.type,
                format: f.format,
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
    addDetailFieldBtn!.style.display = 'inline-flex';
    renderDetailFieldListEditable();
}

function cancelDetailFieldEdit(): void {
    detailFieldEditMode = false;
    detailFieldDefinitions = null;
    globalFieldDefaults = null;
    detailFieldsSaveBar.style.display = 'none';
    customizeFieldsBtn.textContent = 'Customize';
    customizeFieldsBtn.classList.remove('active');
    customizeFieldsBtn.classList.add('btn-primary');
    customizeFieldsBtn.classList.remove('btn-secondary');
    addDetailFieldBtn!.style.display = 'none';
    renderDetailFieldList(clientDetailData!.fieldDefinitions as Record<string, unknown>[]);
}

function renderDetailFieldListEditable(): void {
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
        { text: 'Format', cls: 'col-format' },
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
    detailFieldDefinitions.forEach((field, index) => {
        const tr = document.createElement('tr');
        if (!field.enabled) tr.className = 'disabled';
        tr.dataset.index = String(index);

        const isCustom = field._source === 'custom';
        const isGlobalField = !isCustom;

        const tdEnabled = document.createElement('td');
        tdEnabled.className = 'col-enabled';
        const toggle = document.createElement('span');
        toggle.className = 'toggle-icon ' + (field.enabled ? 'enabled' : 'disabled');
        toggle.textContent = field.enabled ? '\u25CF' : '\u25CB';
        toggle.style.cursor = 'pointer';
        toggle.addEventListener('click', () => {
            detailFieldDefinitions![index].enabled = !detailFieldDefinitions![index].enabled;
            renderDetailFieldListEditable();
            detailFieldsSaveBar.style.display = 'flex';
        });
        tdEnabled.appendChild(toggle);
        tr.appendChild(tdEnabled);

        const tdLabel = document.createElement('td');
        tdLabel.className = 'col-label' + (isCustom ? ' cell-editable' : '');
        if (isGlobalField) tdLabel.classList.add('read-only');
        const labelView = document.createElement('span');
        labelView.className = 'cell-view';
        labelView.textContent = (field.label as string) || '(empty)';
        tdLabel.appendChild(labelView);
        if (isCustom) {
            const labelEdit = document.createElement('span');
            labelEdit.className = 'cell-edit';
            const labelInput = document.createElement('input');
            labelInput.type = 'text';
            labelInput.value = (field.label as string) || '';
            labelEdit.appendChild(labelInput);
            tdLabel.appendChild(labelEdit);
            setupDetailCellEdit(tdLabel);
        }
        tr.appendChild(tdLabel);

        const tdKey = document.createElement('td');
        const isKeyEditable = isCustom && !(field.key as string);
        tdKey.className = 'col-key' + (isKeyEditable ? ' cell-editable' : '');
        if (isGlobalField) tdKey.classList.add('read-only');
        const keyView = document.createElement('span');
        keyView.className = 'cell-view';
        const keyCode = document.createElement('code');
        keyCode.textContent = (field.key as string) || '(auto)';
        keyView.appendChild(keyCode);
        tdKey.appendChild(keyView);
        if (isKeyEditable) {
            const keyEdit = document.createElement('span');
            keyEdit.className = 'cell-edit';
            const keyInput = document.createElement('input');
            keyInput.type = 'text';
            keyInput.value = (field.key as string) || '';
            keyEdit.appendChild(keyInput);
            tdKey.appendChild(keyEdit);
            setupDetailCellEdit(tdKey);
        }
        tr.appendChild(tdKey);

        const tdType = document.createElement('td');
        tdType.className = 'col-type' + (isCustom ? ' cell-editable' : '');
        if (isGlobalField) tdType.classList.add('read-only');
        const typeView = document.createElement('span');
        typeView.className = 'cell-view';
        typeView.textContent = (field.type as string) || 'text';
        tdType.appendChild(typeView);
        if (isCustom) {
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
        }
        tr.appendChild(tdType);

        const tdFormat = document.createElement('td');
        const compatibleFormats = getDetailCompatibleFormats(field.type as string);
        const hasFormats = isCustom && compatibleFormats.length > 0;
        tdFormat.className = 'col-format' + (hasFormats ? ' cell-editable' : '');
        if (isGlobalField) tdFormat.classList.add('read-only');
        const formatView = document.createElement('span');
        formatView.className = 'cell-view';
        formatView.textContent =
            field.format && field.format !== FORMAT_NONE
                ? VALID_FIELD_FORMATS[field.format as string]?.label || (field.format as string)
                : 'None';
        tdFormat.appendChild(formatView);
        if (hasFormats) {
            const formatEdit = document.createElement('span');
            formatEdit.className = 'cell-edit';
            const formatSelect = document.createElement('select');
            const noneOpt = document.createElement('option');
            noneOpt.value = FORMAT_NONE;
            noneOpt.textContent = 'None';
            noneOpt.selected = !field.format || field.format === FORMAT_NONE;
            formatSelect.appendChild(noneOpt);
            for (const fmt of compatibleFormats) {
                const opt = document.createElement('option');
                opt.value = fmt.key;
                opt.textContent = fmt.label;
                opt.selected = fmt.key === field.format;
                formatSelect.appendChild(opt);
            }
            formatEdit.appendChild(formatSelect);
            tdFormat.appendChild(formatEdit);
            setupDetailCellEdit(tdFormat);
        }
        tr.appendChild(tdFormat);

        const tdHint = document.createElement('td');
        tdHint.className = 'col-hint' + (isCustom ? ' cell-editable' : '');
        if (isGlobalField) tdHint.classList.add('read-only');
        const hintView = document.createElement('span');
        hintView.className = 'cell-view cell-view-truncate';
        hintView.title = (field.schemaHint as string) || '';
        hintView.textContent = (field.schemaHint as string) || '(empty)';
        tdHint.appendChild(hintView);
        if (isCustom) {
            const hintEdit = document.createElement('span');
            hintEdit.className = 'cell-edit';
            const hintTextarea = document.createElement('textarea');
            hintTextarea.rows = 3;
            hintTextarea.value = (field.schemaHint as string) || '';
            hintEdit.appendChild(hintTextarea);
            tdHint.appendChild(hintEdit);
            setupDetailCellEdit(tdHint);
        }
        tr.appendChild(tdHint);

        const tdInstr = document.createElement('td');
        tdInstr.className = 'col-instruction' + (isCustom ? ' cell-editable' : '');
        if (isGlobalField) tdInstr.classList.add('read-only');
        const instrView = document.createElement('span');
        instrView.className = 'cell-view cell-view-truncate';
        instrView.title = (field.instruction as string) || '';
        instrView.textContent = (field.instruction as string) || '(empty)';
        tdInstr.appendChild(instrView);
        if (isCustom) {
            const instrEdit = document.createElement('span');
            instrEdit.className = 'cell-edit';
            const instrTextarea = document.createElement('textarea');
            instrTextarea.rows = 3;
            instrTextarea.value = (field.instruction as string) || '';
            instrEdit.appendChild(instrTextarea);
            tdInstr.appendChild(instrEdit);
            setupDetailCellEdit(tdInstr);
        }
        tr.appendChild(tdInstr);

        const tdSource = document.createElement('td');
        tdSource.className = 'col-source';
        const sourceBadge = document.createElement('span');
        sourceBadge.className = isCustom ? 'source-badge source-badge-override' : 'source-badge source-badge-global';
        sourceBadge.textContent = isCustom ? 'Custom' : 'Global';
        tdSource.appendChild(sourceBadge);
        if (isCustom) {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn-icon btn-icon-danger';
            deleteBtn.title = 'Delete field';
            deleteBtn.textContent = '\u2715';
            deleteBtn.addEventListener('click', (e: MouseEvent) => {
                e.stopPropagation();
                deleteDetailField(index);
            });
            tdSource.appendChild(deleteBtn);
        }
        tr.appendChild(tdSource);

        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    detailFieldList.appendChild(table);
}

function setupDetailCellEdit(td: HTMLTableCellElement): void {
    td.addEventListener('click', () => {
        if (td.classList.contains('editing')) return;

        const table = td.closest('table');
        if (table) {
            table.querySelectorAll('td.editing').forEach((other) => {
                if (other !== td) flushDetailCellEdit(other as HTMLTableCellElement);
            });
        }

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
                flushDetailCellEdit(td);
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
    });
}

function flushDetailCellEdit(td: HTMLTableCellElement): void {
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
        const newVal = input.tagName === 'SELECT' ? input.value : input.value.trim();

        if (td.classList.contains('col-label')) {
            detailFieldDefinitions![index].label = newVal;
            if (!globalFieldDefaults || !globalFieldDefaults.has(detailFieldDefinitions![index].key as string)) {
                if (!detailFieldDefinitions![index].key) {
                    detailFieldDefinitions![index].key = labelToCamelCase(newVal);
                }
            }
        } else if (td.classList.contains('col-key')) {
            detailFieldDefinitions![index].key = newVal;
        } else if (td.classList.contains('col-type')) {
            detailFieldDefinitions![index].type = newVal;
            const currentFormat = detailFieldDefinitions![index].format as string;
            if (currentFormat && currentFormat !== FORMAT_NONE) {
                const formatDef = VALID_FIELD_FORMATS[currentFormat];
                if (!formatDef || !formatDef.compatibleTypes.includes(newVal)) {
                    detailFieldDefinitions![index].format = FORMAT_NONE;
                }
            }
            renderDetailFieldListEditable();
        } else if (td.classList.contains('col-format')) {
            detailFieldDefinitions![index].format = newVal === '' ? FORMAT_NONE : newVal;
        } else if (td.classList.contains('col-hint')) {
            detailFieldDefinitions![index].schemaHint = newVal;
        } else if (td.classList.contains('col-instruction')) {
            detailFieldDefinitions![index].instruction = newVal;
        }

        if (viewSpan.querySelector('code')) {
            viewSpan.querySelector('code')!.textContent = newVal || '(auto)';
        } else if (input.tagName === 'SELECT') {
            viewSpan.textContent = newVal;
        } else {
            viewSpan.textContent = newVal || '(empty)';
            if (viewSpan.classList.contains('cell-view-truncate')) {
                viewSpan.title = newVal;
            }
        }

        const propName = td.classList.contains('col-label')
            ? 'label'
            : td.classList.contains('col-type')
              ? 'type'
              : td.classList.contains('col-format')
                ? 'format'
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

function labelToCamelCase(label: string): string {
    return label
        .trim()
        .split(/\s+/)
        .map((word, i) => {
            const lower = word.toLowerCase();
            return i === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
        })
        .join('');
}

function getDetailCompatibleFormats(fieldType: string): Array<{ key: string; label: string }> {
    return Object.entries(VALID_FIELD_FORMATS)
        .filter(([, def]) => def.compatibleTypes.includes(fieldType))
        .map(([key, def]) => ({ key, label: def.label }));
}

function isCellDifferentFromDefault(fieldIndex: number, propName: string): boolean {
    if (!globalFieldDefaults || !detailFieldDefinitions) return false;
    const field = detailFieldDefinitions[fieldIndex];
    if (!field) return false;
    const defaults = globalFieldDefaults.get(field.key as string);
    if (!defaults) return false;
    return field[propName] !== defaults[propName];
}

function addDetailCustomField(): void {
    if (!detailFieldDefinitions) return;
    detailFieldDefinitions.push({
        key: '',
        label: '',
        type: 'text',
        schemaHint: '',
        instruction: '',
        enabled: true,
        _source: 'custom'
    });
    renderDetailFieldListEditable();
    detailFieldsSaveBar.style.display = 'flex';

    const lastRow = detailFieldList.querySelector('tbody tr:last-child');
    if (lastRow) {
        const labelTd = lastRow.querySelector('td.col-label') as HTMLTableCellElement | null;
        if (labelTd) labelTd.click();
    }
}

function deleteDetailField(index: number): void {
    detailFieldDefinitions!.splice(index, 1);
    renderDetailFieldListEditable();
    detailFieldsSaveBar.style.display = 'flex';
}

async function saveDetailFieldOverrides(): Promise<void> {
    if (!clientDetailData || !detailFieldDefinitions) return;
    const clientId = (clientDetailData.client as Record<string, unknown>).clientId as string;

    const table = detailFieldList.querySelector('table');
    if (table) {
        table.querySelectorAll('td.editing').forEach((td) => flushDetailCellEdit(td as HTMLTableCellElement));
    }

    const customFields = detailFieldDefinitions.filter((f) => f._source === 'custom');
    for (let i = 0; i < customFields.length; i++) {
        const field = customFields[i];
        if (!field.label) {
            showAlert(`Custom field: label is required`, 'error');
            return;
        }
        if (!field.key) {
            showAlert(`Custom field "${field.label}": key is required`, 'error');
            return;
        }
        if (!/^[a-z][a-zA-Z0-9]*$/.test(field.key as string)) {
            showAlert(
                `Custom field "${field.label}": key must start with a lowercase letter and contain only alphanumeric characters`,
                'error'
            );
            return;
        }
        if (!VALID_FIELD_TYPES.includes(field.type as (typeof VALID_FIELD_TYPES)[number])) {
            showAlert(`Custom field "${field.label}": invalid field type`, 'error');
            return;
        }
        if (!field.schemaHint) {
            showAlert(`Custom field "${field.label}": schema hint is required`, 'error');
            return;
        }
        if (!field.instruction) {
            showAlert(`Custom field "${field.label}": instruction is required`, 'error');
            return;
        }
    }

    const allKeys = detailFieldDefinitions.map((f) => f.key as string).filter(Boolean);
    const duplicateKey = allKeys.find((k, i) => allKeys.indexOf(k) !== i);
    if (duplicateKey) {
        showAlert(`Duplicate field key: "${duplicateKey}"`, 'error');
        return;
    }

    const fieldOverrides: Record<string, Record<string, unknown>> = {};
    for (const field of detailFieldDefinitions) {
        if (field._source === 'custom') {
            const { _source, ...def } = field;
            fieldOverrides[field.key as string] = def;
        } else {
            const globalDefault = globalFieldDefaults!.get(field.key as string);
            if (globalDefault && field.enabled !== globalDefault.enabled) {
                fieldOverrides[field.key as string] = { enabled: field.enabled };
            }
        }
    }

    try {
        saveDetailFieldsBtn.disabled = true;
        saveDetailFieldsBtn.textContent = 'Saving...';

        const response = await fetch(`/api/clients/${clientId}/overrides`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ section: 'fields', data: fieldOverrides })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || result.details || 'Save failed');

        clientDetailData = result;
        cancelDetailFieldEdit();
        renderDetailFieldList(clientDetailData!.fieldDefinitions as Record<string, unknown>[]);
        updateDetailResetButtons();
        showAlert('Field overrides saved', 'success');
    } catch (error) {
        showAlert('Failed to save field overrides: ' + (error as Error).message, 'error');
    } finally {
        saveDetailFieldsBtn.disabled = false;
        saveDetailFieldsBtn.textContent = 'Save Overrides';
    }
}

// --- TAGS OVERRIDE ---

function customizeTags(): void {
    if (!clientDetailData) return;
    detailTagEditMode = true;
    detailTagOverrides = {};
    (clientDetailData.tagDefinitions as Record<string, unknown>[]).forEach((tag) => {
        if (tag._source === 'override') {
            detailTagOverrides![tag.id as string] = { enabled: tag.enabled };
        }
    });
    customizeTagsBtn.textContent = 'Editing';
    customizeTagsBtn.classList.add('active');
    customizeTagsBtn.classList.remove('btn-primary');
    customizeTagsBtn.classList.add('btn-secondary');
    renderDetailTagListEditable();
}

function cancelDetailTagEdit(): void {
    detailTagEditMode = false;
    detailTagOverrides = null;
    detailTagsSaveBar.style.display = 'none';
    customizeTagsBtn.textContent = 'Customize';
    customizeTagsBtn.classList.remove('active');
    customizeTagsBtn.classList.add('btn-primary');
    customizeTagsBtn.classList.remove('btn-secondary');
    renderDetailTagList(clientDetailData!.tagDefinitions as Record<string, unknown>[]);
}

function renderDetailTagListEditable(): void {
    detailTagList.textContent = '';
    const tags = clientDetailData!.tagDefinitions as Record<string, unknown>[];

    if (!tags || tags.length === 0) {
        const p = document.createElement('div');
        p.className = 'empty-placeholder';
        p.textContent = 'No tag rules defined.';
        detailTagList.appendChild(p);
        return;
    }

    const table = document.createElement('table');
    table.className = 'tags-table edit-mode';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    [
        { text: 'On', cls: 'col-enabled' },
        { text: 'Label', cls: 'col-label' },
        { text: 'ID', cls: 'col-id' },
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
    tags.forEach((tag) => {
        const override = detailTagOverrides![tag.id as string];
        const effectiveEnabled =
            override && typeof override.enabled === 'boolean' ? (override.enabled as boolean) : tag.enabled !== false;
        const isOverridden = !!override;

        const tr = document.createElement('tr');
        if (!effectiveEnabled) tr.classList.add('disabled');

        const tdEnabled = document.createElement('td');
        tdEnabled.className = 'col-enabled';
        const toggle = document.createElement('span');
        toggle.className = 'toggle-icon ' + (effectiveEnabled ? 'enabled' : 'disabled');
        toggle.textContent = effectiveEnabled ? '\u25CF' : '\u25CB';
        toggle.style.cursor = 'pointer';
        toggle.addEventListener('click', () => {
            if (!detailTagOverrides![tag.id as string]) detailTagOverrides![tag.id as string] = {};
            detailTagOverrides![tag.id as string].enabled = !effectiveEnabled;
            renderDetailTagListEditable();
            detailTagsSaveBar.style.display = 'flex';
        });
        tdEnabled.appendChild(toggle);
        tr.appendChild(tdEnabled);

        const tdLabel = document.createElement('td');
        tdLabel.className = 'col-label';
        tdLabel.textContent = (tag.label as string) || '(untitled)';
        tr.appendChild(tdLabel);

        const tdId = document.createElement('td');
        tdId.className = 'col-id';
        const idCode = document.createElement('code');
        idCode.textContent = (tag.id as string) || '';
        tdId.appendChild(idCode);
        tr.appendChild(tdId);

        const tdInstr = document.createElement('td');
        tdInstr.className = 'col-instruction';
        const instrSpan = document.createElement('span');
        instrSpan.className = 'cell-view-truncate';
        instrSpan.title = (tag.instruction as string) || '';
        instrSpan.textContent = (tag.instruction as string) || '(empty)';
        tdInstr.appendChild(instrSpan);
        tr.appendChild(tdInstr);

        const tdSource = document.createElement('td');
        tdSource.className = 'col-source';
        tdSource.appendChild(createSourceBadge(isOverridden ? 'override' : (tag._source as string)));
        tr.appendChild(tdSource);

        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    detailTagList.appendChild(table);
}

async function saveDetailTagOverrides(): Promise<void> {
    if (!clientDetailData || !detailTagOverrides) return;
    const clientId = (clientDetailData.client as Record<string, unknown>).clientId as string;

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
        renderDetailTagList(clientDetailData!.tagDefinitions as Record<string, unknown>[]);
        updateDetailResetButtons();
        showAlert('Tag overrides saved', 'success');
    } catch (error) {
        showAlert('Failed to save tag overrides: ' + (error as Error).message, 'error');
    } finally {
        saveDetailTagsBtn.disabled = false;
        saveDetailTagsBtn.textContent = 'Save Overrides';
    }
}

// --- PROMPT OVERRIDE ---

function customizePrompt(): void {
    if (!clientDetailData) return;
    detailPromptEditMode = true;
    const p = clientDetailData.promptTemplate as Record<string, string>;
    detailPromptOverride = { preamble: p.preamble || '', generalRules: p.generalRules || '', suffix: p.suffix || '' };
    customizePromptBtn.textContent = 'Editing';
    customizePromptBtn.classList.add('active');
    customizePromptBtn.classList.remove('btn-primary');
    customizePromptBtn.classList.add('btn-secondary');
    renderDetailPromptEditable();
}

function cancelDetailPromptEdit(): void {
    detailPromptEditMode = false;
    detailPromptOverride = null;
    detailPromptSaveBar.style.display = 'none';
    customizePromptBtn.textContent = 'Customize';
    customizePromptBtn.classList.remove('active');
    customizePromptBtn.classList.add('btn-primary');
    customizePromptBtn.classList.remove('btn-secondary');
    renderDetailPromptTemplate(clientDetailData!.promptTemplate as Record<string, unknown>);
}

function renderDetailPromptEditable(): void {
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
        textarea.value = detailPromptOverride![s.key] || '';
        textarea.addEventListener('input', () => {
            detailPromptOverride![s.key] = textarea.value;
            detailPromptSaveBar.style.display = 'flex';
            updateDetailPromptPreview();
        });
        section.appendChild(textarea);

        detailPromptTemplate.appendChild(section);
    });

    appendDetailPromptPreview(detailPromptTemplate, true);
}

function appendDetailPromptPreview(
    container: HTMLElement & {
        _previewWrapper?: HTMLElement & { _previewCode?: HTMLElement; _previewCharCount?: HTMLElement };
    },
    isEditMode: boolean
): void {
    const wrapper = document.createElement('div') as HTMLElement & {
        _previewCode?: HTMLElement;
        _previewCharCount?: HTMLElement;
    };
    wrapper.className = 'detail-prompt-preview';

    const headerRow = document.createElement('div');
    headerRow.className = 'detail-prompt-preview-header';
    const title = document.createElement('div');
    title.className = 'detail-prompt-label';
    title.textContent = 'Live Preview';
    headerRow.appendChild(title);

    const charCount = document.createElement('span');
    charCount.className = 'detail-prompt-char-count';
    charCount.textContent = '';
    headerRow.appendChild(charCount);

    wrapper.appendChild(headerRow);

    const pre = document.createElement('pre');
    pre.className = 'detail-prompt-preview-code';
    const code = document.createElement('code');
    code.textContent = 'Loading preview...';
    pre.appendChild(code);
    wrapper.appendChild(pre);

    container.appendChild(wrapper);

    wrapper._previewCode = code;
    wrapper._previewCharCount = charCount;
    container._previewWrapper = wrapper;

    fetchDetailPromptPreview(code, charCount, isEditMode);
}

function updateDetailPromptPreview(): void {
    clearTimeout(detailPromptPreviewDebounceTimer!);
    detailPromptPreviewDebounceTimer = setTimeout(() => {
        const wrapper = detailPromptTemplate._previewWrapper;
        if (!wrapper) return;
        fetchDetailPromptPreview(wrapper._previewCode!, wrapper._previewCharCount!, true);
    }, 300);
}

async function fetchDetailPromptPreview(
    codeEl: HTMLElement,
    charCountEl: HTMLElement,
    useOverrides: boolean
): Promise<void> {
    if (!clientDetailData) return;
    const clientId = (clientDetailData.client as Record<string, unknown>).clientId as string;

    try {
        const body = useOverrides && detailPromptOverride ? { promptTemplate: detailPromptOverride } : {};
        const response = await fetch(`/api/clients/${clientId}/prompt/preview`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await response.json();
        const previewText = data.preview || '(empty)';
        codeEl.textContent = previewText;
        charCountEl.textContent = previewText.length + ' chars';
    } catch (error) {
        codeEl.textContent = 'Error loading preview: ' + (error as Error).message;
        charCountEl.textContent = '';
    }
}

async function saveDetailPromptOverrides(): Promise<void> {
    if (!clientDetailData || !detailPromptOverride) return;
    const clientId = (clientDetailData.client as Record<string, unknown>).clientId as string;

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
        renderDetailPromptTemplate(clientDetailData!.promptTemplate as Record<string, unknown>);
        updateDetailResetButtons();
        showAlert('Prompt overrides saved', 'success');
    } catch (error) {
        showAlert('Failed to save prompt overrides: ' + (error as Error).message, 'error');
    } finally {
        saveDetailPromptBtn.disabled = false;
        saveDetailPromptBtn.textContent = 'Save Overrides';
    }
}

// --- FILENAME OVERRIDE ---

function customizeFilename(): void {
    if (!clientDetailData) return;
    detailFilenameEditMode = true;
    detailFilenameOverride = ((clientDetailData.filenameTemplate as Record<string, unknown>).template as string) || '';
    customizeFilenameBtn.textContent = 'Editing';
    customizeFilenameBtn.classList.add('active');
    customizeFilenameBtn.classList.remove('btn-primary');
    customizeFilenameBtn.classList.add('btn-secondary');
    renderDetailFilenameEditable();
}

function cancelDetailFilenameEdit(): void {
    detailFilenameEditMode = false;
    detailFilenameOverride = null;
    detailFilenameSaveBar.style.display = 'none';
    customizeFilenameBtn.textContent = 'Customize';
    customizeFilenameBtn.classList.remove('active');
    customizeFilenameBtn.classList.add('btn-primary');
    customizeFilenameBtn.classList.remove('btn-secondary');
    renderDetailFilenameTemplate(clientDetailData!.filenameTemplate as Record<string, unknown>);
}

function renderDetailFilenameEditable(): void {
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

    const sampleData: Record<string, string> = { ...FILENAME_SAMPLE_DATA };

    function insertDetailFilenamePlaceholder(key: string): void {
        const placeholder = '{' + key + '}';
        const start = input.selectionStart!;
        const end = input.selectionEnd!;
        input.value = input.value.substring(0, start) + placeholder + input.value.substring(end);
        const newPos = start + placeholder.length;
        input.setSelectionRange(newPos, newPos);
        input.focus();
        detailFilenameOverride = input.value;
        updatePreview();
        detailFilenameSaveBar.style.display = 'flex';
    }

    input.addEventListener('input', () => {
        detailFilenameOverride = input.value;
        updatePreview();
        detailFilenameSaveBar.style.display = 'flex';
    });
    detailFilenameTemplate.appendChild(input);

    const chipsContainer = document.createElement('div');
    chipsContainer.className = 'detail-filename-chips';

    const fields = (clientDetailData!.fieldDefinitions || []) as Record<string, unknown>[];
    const enabledFields = fields.filter((f) => f.enabled);
    if (enabledFields.length > 0) {
        const fieldGroup = document.createElement('div');
        fieldGroup.className = 'chip-group';
        const fieldLabel = document.createElement('div');
        fieldLabel.className = 'chip-group-label';
        fieldLabel.textContent = 'Fields';
        fieldGroup.appendChild(fieldLabel);
        const fieldChipsEl = document.createElement('div');
        fieldChipsEl.className = 'chip-group-chips';
        enabledFields.forEach((field) => {
            fieldChipsEl.appendChild(
                createPlaceholderChip(field.key as string, field.label as string, '', insertDetailFilenamePlaceholder)
            );
        });
        fieldGroup.appendChild(fieldChipsEl);
        chipsContainer.appendChild(fieldGroup);
    }

    const tags = (clientDetailData!.tagDefinitions || []) as Record<string, unknown>[];
    const filenameTags = tags.filter((t) => t.enabled !== false && t.filenamePlaceholder);
    if (filenameTags.length > 0) {
        const tagGroup = document.createElement('div');
        tagGroup.className = 'chip-group';
        const tagLabel = document.createElement('div');
        tagLabel.className = 'chip-group-label';
        tagLabel.textContent = 'Tags';
        tagGroup.appendChild(tagLabel);
        const tagChipsEl = document.createElement('div');
        tagChipsEl.className = 'chip-group-chips';
        filenameTags.forEach((tag) => {
            tagChipsEl.appendChild(
                createPlaceholderChip(
                    tag.filenamePlaceholder as string,
                    tag.label as string,
                    'tag-chip',
                    insertDetailFilenamePlaceholder
                )
            );
            sampleData[tag.filenamePlaceholder as string] = (tag.filenameFormat as string) || '';
        });
        tagGroup.appendChild(tagChipsEl);
        chipsContainer.appendChild(tagGroup);
    }

    const specialGroup = document.createElement('div');
    specialGroup.className = 'chip-group';
    const specialLabel = document.createElement('div');
    specialLabel.className = 'chip-group-label';
    specialLabel.textContent = 'Special';
    specialGroup.appendChild(specialLabel);
    const specialChipsEl = document.createElement('div');
    specialChipsEl.className = 'chip-group-chips';
    SPECIAL_PLACEHOLDERS.forEach((sp) => {
        specialChipsEl.appendChild(
            createPlaceholderChip(sp.key, sp.tooltip, 'special-chip', insertDetailFilenamePlaceholder)
        );
    });
    specialGroup.appendChild(specialChipsEl);
    chipsContainer.appendChild(specialGroup);

    detailFilenameTemplate.appendChild(chipsContainer);

    const previewLabel = document.createElement('div');
    previewLabel.className = 'detail-prompt-label';
    previewLabel.style.marginTop = '1rem';
    previewLabel.textContent = 'Preview';
    detailFilenameTemplate.appendChild(previewLabel);

    const previewEl = document.createElement('div');
    previewEl.className = 'detail-filename-value';
    detailFilenameTemplate.appendChild(previewEl);

    function updatePreview(): void {
        const template = input.value;
        if (!template) {
            previewEl.textContent = '(empty template)';
            return;
        }
        previewEl.textContent = template.replace(/\{(\w+)\}/g, (match: string, key: string) => {
            return key in sampleData ? sampleData[key] : match;
        });
    }

    updatePreview();
}

async function saveDetailFilenameOverride(): Promise<void> {
    if (!clientDetailData || detailFilenameOverride === null) return;
    const clientId = (clientDetailData.client as Record<string, unknown>).clientId as string;

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
        renderDetailFilenameTemplate(clientDetailData!.filenameTemplate as Record<string, unknown>);
        updateDetailResetButtons();
        showAlert('Filename override saved', 'success');
    } catch (error) {
        showAlert('Failed to save filename override: ' + (error as Error).message, 'error');
    } finally {
        saveDetailFilenameBtn.disabled = false;
        saveDetailFilenameBtn.textContent = 'Save Override';
    }
}

// --- MODEL OVERRIDE ---

function customizeModel(): void {
    detailModelEditMode = true;
    detailModelOverride = ((clientDetailData!.model as Record<string, unknown>)?.value as string) || null;
    customizeModelBtn.textContent = 'Cancel';
    detailModelSaveBar.style.display = 'flex';
    renderDetailModel(clientDetailData!.model as Record<string, unknown>);
}

function cancelDetailModelEdit(): void {
    detailModelEditMode = false;
    detailModelOverride = null;
    customizeModelBtn.textContent = 'Customize';
    detailModelSaveBar.style.display = 'none';
    renderDetailModel(clientDetailData!.model as Record<string, unknown>);
}

async function saveDetailModelOverride(): Promise<void> {
    if (!clientDetailData || !detailModelOverride) return;

    try {
        const response = await fetch(
            `/api/clients/${(clientDetailData.client as Record<string, unknown>).clientId}/overrides`,
            {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ section: 'model', data: detailModelOverride })
            }
        );

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
        showAlert('Failed to save model override: ' + (error as Error).message, 'error');
    }
}

// --- RESET TO DEFAULT ---

async function resetOverride(section: string): Promise<void> {
    if (!clientDetailData) return;

    const sectionNames: Record<string, string> = {
        fields: 'field',
        tags: 'tag',
        prompt: 'prompt',
        output: 'filename template'
    };
    if (!confirm(`Reset ${sectionNames[section]} settings to global defaults? Your custom settings will be removed.`)) {
        return;
    }

    const clientId = (clientDetailData.client as Record<string, unknown>).clientId as string;

    try {
        const response = await fetch(`/api/clients/${clientId}/overrides/${section}`, { method: 'DELETE' });
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
        showAlert('Failed to reset: ' + (error as Error).message, 'error');
    }
}

// --- FILE SELECTOR ---

async function loadFileList(): Promise<void> {
    if (!clientDetailData) return;
    const clientId = (clientDetailData.client as Record<string, unknown>).clientId as string;

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
        errDiv.textContent = 'Failed to load files: ' + (error as Error).message;
        fileSelectorEl.appendChild(errDiv);
    }
}

function renderFileList(): void {
    fileSelectorEl.textContent = '';
    updateFileActionButtons();

    if (fileList.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-placeholder';
        empty.textContent = 'No PDF files in input folder.';
        fileSelectorEl.appendChild(empty);
        return;
    }

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

function updateFileActionButtons(): void {
    const hasSelection = selectedFiles.size > 0;
    processSelectedBtn.style.display = hasSelection ? 'inline-flex' : 'none';
    dryRunSelectedBtn.style.display = hasSelection ? 'inline-flex' : 'none';

    if (hasSelection) {
        processSelectedBtn.textContent = `Process ${selectedFiles.size} File${selectedFiles.size > 1 ? 's' : ''}`;
        dryRunSelectedBtn.textContent = `Dry Run ${selectedFiles.size}`;
    }
}

async function processSelectedFiles(dryRun: boolean): Promise<void> {
    if (!clientDetailData || selectedFiles.size === 0) return;
    if (isFileProcessing) {
        showAlert('Processing already in progress', 'warning');
        return;
    }

    const clientId = (clientDetailData.client as Record<string, unknown>).clientId as string;
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

        const reader = response.body!.getReader();
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
        addLogEntry('Error: ' + (error as Error).message, 'error');
        showAlert('Processing failed: ' + (error as Error).message, 'error');
    } finally {
        isFileProcessing = false;
        processSelectedBtn.disabled = false;
        dryRunSelectedBtn.disabled = false;
        loadFileList();
        loadClientResults(clientId);
    }
}

function handleFileProcessingUpdate(data: Record<string, unknown>): void {
    switch (data.status) {
        case 'connected':
            addLogEntry('Connected to server...', 'info');
            break;
        case 'starting':
            addLogEntry(`Found ${data.total} file${(data.total as number) > 1 ? 's' : ''}. Processing...`, 'info');
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
            if ((data.failed as number) === 0 && (data.success as number) > 0) {
                showAlert(`Processed ${data.success} file${(data.success as number) > 1 ? 's' : ''}!`, 'success');
            } else if ((data.failed as number) > 0) {
                showAlert(`Processed ${data.success}, ${data.failed} failed`, 'warning');
            }
            break;
        case 'error':
            addLogEntry('Error: ' + data.error, 'error');
            showAlert('Processing error: ' + data.error, 'error');
            break;
    }
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
