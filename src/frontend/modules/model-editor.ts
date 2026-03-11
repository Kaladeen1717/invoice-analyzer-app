// Model Editor module
// Manages the global model selection (known models, custom model, save).

import { showAlert } from './ui-utils.js';
import { KNOWN_MODELS } from './constants.js';

// --- State ---
let currentModel = '';
let originalModel = '';
let modelLoaded = false;

// --- DOM refs (set in init) ---
let modelSelect: HTMLSelectElement;
let modelCustomInput: HTMLInputElement;
let modelSaveBar: HTMLElement;

// --- Public API ---

export function initModelEditor(): void {
    modelSelect = document.getElementById('modelSelect') as HTMLSelectElement;
    modelCustomInput = document.getElementById('modelCustomInput') as HTMLInputElement;
    modelSaveBar = document.getElementById('modelSaveBar')!;

    const modelUseCustomBtn = document.getElementById('modelUseCustomBtn')!;
    const saveModelBtn = document.getElementById('saveModelBtn')!;
    const discardModelBtn = document.getElementById('discardModelBtn')!;

    // Event listeners
    modelSelect.addEventListener('change', () => {
        currentModel = modelSelect.value;
        modelCustomInput.value = '';
        updateModelSaveBar();
    });
    modelUseCustomBtn.addEventListener('click', () => {
        const custom = modelCustomInput.value.trim();
        if (custom) {
            currentModel = custom;
            updateModelSaveBar();
        }
    });
    saveModelBtn.addEventListener('click', saveModelSetting);
    discardModelBtn.addEventListener('click', discardModelChanges);
}

export function isModelLoaded(): boolean {
    return modelLoaded;
}

export function invalidateModel(): void {
    modelLoaded = false;
}

export async function loadModelSetting(): Promise<void> {
    try {
        const response = await fetch('/api/config');
        const data = await response.json();

        if (response.ok) {
            currentModel = data.model || 'gemini-3-flash-preview';
            originalModel = currentModel;
            modelLoaded = true;
            syncModelSelect();
            updateModelSaveBar();
        }
    } catch (error) {
        showAlert('Failed to load model setting: ' + (error as Error).message, 'error');
    }
}

export function hasUnsavedModelChanges(): boolean {
    return modelLoaded && currentModel !== originalModel;
}

export function discardModelChanges(): void {
    currentModel = originalModel;
    syncModelSelect();
    updateModelSaveBar();
}

// --- Internal ---

function syncModelSelect(): void {
    if ((KNOWN_MODELS as readonly string[]).includes(currentModel)) {
        modelSelect.value = currentModel;
        modelCustomInput.value = '';
    } else {
        modelSelect.value = KNOWN_MODELS[0];
        modelCustomInput.value = currentModel;
    }
}

function updateModelSaveBar(): void {
    modelSaveBar.style.display = hasUnsavedModelChanges() ? 'flex' : 'none';
}

async function saveModelSetting(): Promise<void> {
    try {
        const response = await fetch('/api/config/model', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: currentModel })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to save model');
        }

        originalModel = currentModel;
        updateModelSaveBar();
        showAlert('Model updated successfully', 'success');
    } catch (error) {
        showAlert('Failed to save model: ' + (error as Error).message, 'error');
    }
}
