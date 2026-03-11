// Filename Template Editor module
// Manages the filename template, placeholder chips, live preview, save.

import { showAlert } from './ui-utils.js';

// --- State ---
let filenameTemplate = '';
let originalFilenameTemplate = '';
let filenameLoaded = false;

export const FILENAME_SAMPLE_DATA: Record<string, string> = {
    supplierName: 'Acme Corp',
    paymentDate: '20250115',
    paymentDateFormatted: '15.01.2025',
    invoiceDate: '20250110',
    invoiceDateFormatted: '10.01.2025',
    invoiceDateIfDifferent: ' - 10.01.2025',
    invoiceNumber: 'INV-2025-001',
    currency: 'EUR',
    totalAmount: '1,500.50'
};

export const SPECIAL_PLACEHOLDERS: Array<{ key: string; tooltip: string }> = [
    { key: 'paymentDateFormatted', tooltip: 'Payment date as DD.MM.YYYY' },
    { key: 'invoiceDateFormatted', tooltip: 'Invoice date as DD.MM.YYYY' },
    { key: 'invoiceDateIfDifferent', tooltip: 'Invoice date only if different from payment date, prefixed with " - "' }
];

// --- DOM refs (set in init) ---
let filenameTemplateInput: HTMLInputElement;
let fieldPlaceholderChips: HTMLElement;
let tagPlaceholderChips: HTMLElement;
let specialPlaceholderChips: HTMLElement;
let filenamePreviewEl: HTMLElement;
let filenameSaveBar: HTMLElement;
let saveFilenameBtn: HTMLButtonElement;

// --- Public API ---

export function initFilenameEditor(): void {
    filenameTemplateInput = document.getElementById('filenameTemplateInput') as HTMLInputElement;
    fieldPlaceholderChips = document.getElementById('fieldPlaceholderChips')!;
    tagPlaceholderChips = document.getElementById('tagPlaceholderChips')!;
    specialPlaceholderChips = document.getElementById('specialPlaceholderChips')!;
    filenamePreviewEl = document.getElementById('filenamePreview')!;
    filenameSaveBar = document.getElementById('filenameSaveBar')!;
    saveFilenameBtn = document.getElementById('saveFilenameBtn') as HTMLButtonElement;

    const discardFilenameBtn = document.getElementById('discardFilenameBtn')!;
    const reloadFilenameBtn = document.getElementById('reloadFilenameBtn')!;

    // Event listeners
    reloadFilenameBtn.addEventListener('click', () => {
        filenameLoaded = false;
        loadFilenameTemplate();
    });
    saveFilenameBtn.addEventListener('click', saveFilenameTemplate);
    discardFilenameBtn.addEventListener('click', discardFilenameChanges);

    filenameTemplateInput.addEventListener('input', () => {
        filenameTemplate = filenameTemplateInput.value;
        updateFilenamePreview();
        updateFilenameSaveBar();
    });
}

export function isFilenameLoaded(): boolean {
    return filenameLoaded;
}

export function invalidateFilename(): void {
    filenameLoaded = false;
}

export async function loadFilenameTemplate(): Promise<void> {
    try {
        const response = await fetch('/api/config');
        const data = await response.json();

        if (response.ok) {
            filenameTemplate = (data.output && data.output.filenameTemplate) || '';
            originalFilenameTemplate = filenameTemplate;
            filenameLoaded = true;

            filenameTemplateInput.value = filenameTemplate;
            renderPlaceholderChips(data.fieldDefinitions || [], data.tagDefinitions || []);
            updateFilenamePreview();
            updateFilenameSaveBar();
        }
    } catch (error) {
        showAlert('Failed to load filename template: ' + (error as Error).message, 'error');
    }
}

export function hasUnsavedFilenameChanges(): boolean {
    if (!filenameTemplateInput) return false;
    return filenameTemplateInput.value !== originalFilenameTemplate;
}

export function discardFilenameChanges(): void {
    filenameTemplateInput.value = originalFilenameTemplate;
    filenameTemplate = originalFilenameTemplate;
    updateFilenamePreview();
    updateFilenameSaveBar();
}

// --- Internal ---

function renderPlaceholderChips(fields: Array<Record<string, unknown>>, tags: Array<Record<string, unknown>>): void {
    fieldPlaceholderChips.textContent = '';
    fields.forEach((field) => {
        if (!field.enabled) return;
        const chip = createPlaceholderChip(field.key as string, field.label as string);
        fieldPlaceholderChips.appendChild(chip);
    });

    tagPlaceholderChips.textContent = '';
    tags.forEach((tag) => {
        if (!tag.enabled) return;
        if (!tag.filenamePlaceholder) return;
        const chip = createPlaceholderChip(tag.filenamePlaceholder as string, tag.label as string, 'tag-chip');
        tagPlaceholderChips.appendChild(chip);
        FILENAME_SAMPLE_DATA[tag.filenamePlaceholder as string] = (tag.filenameFormat as string) || '';
    });

    const tagGroup = document.getElementById('tagPlaceholders')!;
    tagGroup.style.display = tagPlaceholderChips.children.length > 0 ? 'block' : 'none';

    specialPlaceholderChips.textContent = '';
    SPECIAL_PLACEHOLDERS.forEach((sp) => {
        const chip = createPlaceholderChip(sp.key, sp.tooltip, 'special-chip');
        chip.title = sp.tooltip;
        specialPlaceholderChips.appendChild(chip);
    });
}

export function createPlaceholderChip(
    key: string,
    tooltipText: string,
    extraClass?: string,
    onInsert?: (key: string) => void
): HTMLButtonElement {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'placeholder-chip' + (extraClass ? ' ' + extraClass : '');
    chip.textContent = '{' + key + '}';
    chip.title = tooltipText;
    chip.addEventListener('click', () => (onInsert || insertPlaceholder)(key));
    return chip;
}

function insertPlaceholder(key: string): void {
    const input = filenameTemplateInput;
    const placeholder = '{' + key + '}';
    const start = input.selectionStart!;
    const end = input.selectionEnd!;
    const value = input.value;

    input.value = value.substring(0, start) + placeholder + value.substring(end);
    const newPos = start + placeholder.length;
    input.setSelectionRange(newPos, newPos);
    input.focus();

    filenameTemplate = input.value;
    updateFilenamePreview();
    updateFilenameSaveBar();
}

function updateFilenamePreview(): void {
    const template = filenameTemplateInput.value;
    if (!template) {
        filenamePreviewEl.textContent = '(empty template)';
        return;
    }

    const preview = template.replace(/\{(\w+)\}/g, (match: string, key: string) => {
        if (key in FILENAME_SAMPLE_DATA) return FILENAME_SAMPLE_DATA[key];
        return match;
    });

    filenamePreviewEl.textContent = preview;
}

function updateFilenameSaveBar(): void {
    filenameSaveBar.style.display = hasUnsavedFilenameChanges() ? 'flex' : 'none';
}

async function saveFilenameTemplate(): Promise<void> {
    const template = filenameTemplateInput.value.trim();
    if (!template) {
        showAlert('Filename template cannot be empty', 'error');
        return;
    }

    try {
        saveFilenameBtn.disabled = true;
        saveFilenameBtn.textContent = 'Saving...';

        const response = await fetch('/api/config/output', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filenameTemplate: template })
        });

        const result = await response.json();

        if (response.ok) {
            filenameTemplate = template;
            originalFilenameTemplate = template;
            updateFilenameSaveBar();
            showAlert(result.message || 'Filename template saved', 'success');
        } else {
            showAlert(result.error || 'Failed to save filename template', 'error');
        }
    } catch (error) {
        showAlert('Failed to save filename template: ' + (error as Error).message, 'error');
    } finally {
        saveFilenameBtn.disabled = false;
        saveFilenameBtn.textContent = 'Save Changes';
    }
}
