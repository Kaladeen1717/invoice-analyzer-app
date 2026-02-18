// Prompt Template Editor module
// Manages the global prompt template (structured + raw mode, preview, save).

import { showAlert } from './ui-utils.js';

// --- State ---
let promptTemplate = { preamble: '', generalRules: '', suffix: '' };
let originalPromptTemplate = { preamble: '', generalRules: '', suffix: '' };
let rawPrompt = null;
let originalRawPrompt = null;
let promptRawMode = false;
let promptLoaded = false;
let promptPreviewDebounceTimer = null;

// --- DOM refs (set in init) ---
let promptPreambleInput, promptGeneralRulesInput, promptSuffixInput;
let promptRawTextInput, promptStructuredMode, promptRawModeEl;
let rawEditToggleBtn, promptPreviewEl, promptPreviewLength;
let promptSaveBar, savePromptBtn;

// --- Public API ---

export function initPromptEditor() {
    promptPreambleInput = document.getElementById('promptPreamble');
    promptGeneralRulesInput = document.getElementById('promptGeneralRules');
    promptSuffixInput = document.getElementById('promptSuffix');
    promptRawTextInput = document.getElementById('promptRawText');
    promptStructuredMode = document.getElementById('promptStructuredMode');
    promptRawModeEl = document.getElementById('promptRawMode');
    rawEditToggleBtn = document.getElementById('rawEditToggleBtn');
    promptPreviewEl = document.getElementById('promptPreview');
    promptPreviewLength = document.getElementById('promptPreviewLength');
    promptSaveBar = document.getElementById('promptSaveBar');
    savePromptBtn = document.getElementById('savePromptBtn');

    const reloadPromptBtn = document.getElementById('reloadPromptBtn');
    const discardPromptBtn = document.getElementById('discardPromptBtn');

    // Event listeners
    reloadPromptBtn.addEventListener('click', () => {
        promptLoaded = false;
        loadPromptTemplate();
    });
    rawEditToggleBtn.addEventListener('click', toggleRawEditMode);
    savePromptBtn.addEventListener('click', savePromptTemplate);
    discardPromptBtn.addEventListener('click', discardPromptChanges);

    // Live preview on input
    promptPreambleInput.addEventListener('input', () => { updatePromptPreview(); updatePromptSaveBar(); });
    promptGeneralRulesInput.addEventListener('input', () => { updatePromptPreview(); updatePromptSaveBar(); });
    promptSuffixInput.addEventListener('input', () => { updatePromptPreview(); updatePromptSaveBar(); });
    promptRawTextInput.addEventListener('input', () => { updatePromptPreview(); updatePromptSaveBar(); });
}

export function isPromptLoaded() { return promptLoaded; }

export function invalidatePrompt() { promptLoaded = false; }

export async function loadPromptTemplate() {
    try {
        const response = await fetch('/api/config/prompt');
        const data = await response.json();

        if (response.ok) {
            promptTemplate = data.promptTemplate || { preamble: '', generalRules: '', suffix: '' };
            originalPromptTemplate = JSON.parse(JSON.stringify(promptTemplate));
            rawPrompt = data.rawPrompt || null;
            originalRawPrompt = rawPrompt;
            promptLoaded = true;

            if (rawPrompt) {
                promptRawMode = true;
                rawEditToggleBtn.classList.add('active');
                rawEditToggleBtn.querySelector('span').textContent = 'Structured';
                promptStructuredMode.style.display = 'none';
                promptRawModeEl.style.display = 'block';
                promptRawTextInput.value = rawPrompt;
            } else {
                promptRawMode = false;
                rawEditToggleBtn.classList.remove('active');
                rawEditToggleBtn.querySelector('span').textContent = 'Raw Edit';
                promptStructuredMode.style.display = 'block';
                promptRawModeEl.style.display = 'none';
                promptPreambleInput.value = promptTemplate.preamble || '';
                promptGeneralRulesInput.value = promptTemplate.generalRules || '';
                promptSuffixInput.value = promptTemplate.suffix || '';
            }

            updatePromptPreview();
            updatePromptSaveBar();
        }
    } catch (error) {
        showAlert('Failed to load prompt template: ' + error.message, 'error');
    }
}

export function hasUnsavedPromptChanges() {
    if (promptRawMode) {
        const currentRaw = promptRawTextInput.value;
        return currentRaw !== (originalRawPrompt || '');
    }
    return promptPreambleInput.value !== (originalPromptTemplate.preamble || '') ||
           promptGeneralRulesInput.value !== (originalPromptTemplate.generalRules || '') ||
           promptSuffixInput.value !== (originalPromptTemplate.suffix || '');
}

export function discardPromptChanges() {
    if (originalRawPrompt) {
        promptRawMode = true;
        rawEditToggleBtn.classList.add('active');
        rawEditToggleBtn.querySelector('span').textContent = 'Structured';
        promptStructuredMode.style.display = 'none';
        promptRawModeEl.style.display = 'block';
        promptRawTextInput.value = originalRawPrompt;
        rawPrompt = originalRawPrompt;
    } else {
        promptRawMode = false;
        rawEditToggleBtn.classList.remove('active');
        rawEditToggleBtn.querySelector('span').textContent = 'Raw Edit';
        promptStructuredMode.style.display = 'block';
        promptRawModeEl.style.display = 'none';
        promptTemplate = JSON.parse(JSON.stringify(originalPromptTemplate));
        promptPreambleInput.value = promptTemplate.preamble || '';
        promptGeneralRulesInput.value = promptTemplate.generalRules || '';
        promptSuffixInput.value = promptTemplate.suffix || '';
        rawPrompt = null;
    }
    updatePromptPreview();
    updatePromptSaveBar();
}

// --- Internal ---

function toggleRawEditMode() {
    if (promptRawMode) {
        promptRawMode = false;
        rawEditToggleBtn.classList.remove('active');
        rawEditToggleBtn.querySelector('span').textContent = 'Raw Edit';
        promptStructuredMode.style.display = 'block';
        promptRawModeEl.style.display = 'none';
        promptPreambleInput.value = promptTemplate.preamble || '';
        promptGeneralRulesInput.value = promptTemplate.generalRules || '';
        promptSuffixInput.value = promptTemplate.suffix || '';
    } else {
        promptRawMode = true;
        rawEditToggleBtn.classList.add('active');
        rawEditToggleBtn.querySelector('span').textContent = 'Structured';
        promptStructuredMode.style.display = 'none';
        promptRawModeEl.style.display = 'block';
        const previewCode = promptPreviewEl.querySelector('code');
        if (rawPrompt) {
            promptRawTextInput.value = rawPrompt;
        } else if (previewCode) {
            promptRawTextInput.value = previewCode.textContent;
        }
    }
    updatePromptPreview();
    updatePromptSaveBar();
}

function updatePromptPreview() {
    clearTimeout(promptPreviewDebounceTimer);
    promptPreviewDebounceTimer = setTimeout(async () => {
        try {
            let previewText;
            if (promptRawMode) {
                previewText = promptRawTextInput.value || '(empty)';
            } else {
                const templateOverride = {
                    preamble: promptPreambleInput.value,
                    generalRules: promptGeneralRulesInput.value,
                    suffix: promptSuffixInput.value
                };
                const response = await fetch('/api/config/prompt/preview', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ promptTemplate: templateOverride })
                });
                const data = await response.json();
                previewText = data.preview || '(empty)';
            }

            const code = promptPreviewEl.querySelector('code');
            if (code) code.textContent = previewText;
            promptPreviewLength.textContent = previewText.length + ' chars';
        } catch (error) {
            const code = promptPreviewEl.querySelector('code');
            if (code) code.textContent = 'Error loading preview: ' + error.message;
        }
    }, 300);
}

function updatePromptSaveBar() {
    promptSaveBar.style.display = hasUnsavedPromptChanges() ? 'flex' : 'none';
}

async function savePromptTemplate() {
    try {
        savePromptBtn.disabled = true;
        savePromptBtn.textContent = 'Saving...';

        if (promptRawMode) {
            const rawText = promptRawTextInput.value.trim();
            if (!rawText) {
                showAlert('Raw prompt cannot be empty', 'error');
                return;
            }
            const response = await fetch('/api/config/prompt/raw', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rawPrompt: rawText })
            });
            const result = await response.json();
            if (response.ok) {
                rawPrompt = rawText;
                originalRawPrompt = rawText;
                showAlert(result.message || 'Raw prompt saved', 'success');
            } else {
                showAlert(result.error || 'Failed to save raw prompt', 'error');
            }
        } else {
            const template = {
                preamble: promptPreambleInput.value.trim(),
                generalRules: promptGeneralRulesInput.value.trim(),
                suffix: promptSuffixInput.value.trim()
            };
            if (!template.preamble || !template.generalRules || !template.suffix) {
                showAlert('All prompt template fields are required', 'error');
                return;
            }
            const response = await fetch('/api/config/prompt', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ promptTemplate: template })
            });
            const result = await response.json();
            if (response.ok) {
                promptTemplate = JSON.parse(JSON.stringify(template));
                originalPromptTemplate = JSON.parse(JSON.stringify(template));
                rawPrompt = null;
                originalRawPrompt = null;
                showAlert(result.message || 'Prompt template saved', 'success');
            } else {
                showAlert(result.error || result.details || 'Failed to save prompt template', 'error');
            }
        }
        updatePromptSaveBar();
    } catch (error) {
        showAlert('Failed to save prompt: ' + error.message, 'error');
    } finally {
        savePromptBtn.disabled = false;
        savePromptBtn.textContent = 'Save Changes';
    }
}
