// App orchestrator — thin init layer that wires up all modules.

// Module imports
import { showAlert } from './modules/ui-utils.js';
import { flushAllEditing } from './modules/table-editor.js';
import { initFieldEditor, loadFieldDefinitions, isFieldsLoaded, hasUnsavedFieldChanges, discardFieldChanges, readFieldsFromDOM, invalidateFields } from './modules/field-editor.js';
import { initTagEditor, loadTagDefinitions, isTagsLoaded, hasUnsavedTagChanges, discardTagChanges, getAddTagMenu, invalidateTags } from './modules/tag-editor.js';
import { initPromptEditor, loadPromptTemplate, isPromptLoaded, invalidatePrompt, hasUnsavedPromptChanges, discardPromptChanges } from './modules/prompt-editor.js';
import { initModelEditor, loadModelSetting, isModelLoaded, invalidateModel, hasUnsavedModelChanges, discardModelChanges } from './modules/model-editor.js';
import { initFilenameEditor, loadFilenameTemplate, isFilenameLoaded, invalidateFilename, hasUnsavedFilenameChanges, discardFilenameChanges } from './modules/filename-editor.js';
import { initExportImport, loadBackups, isBackupsLoaded, getRestoreModal, getImportPreviewModal, getCloseRestoreModal, getCloseImportPreview } from './modules/export-import.js';
import { initClientList, loadClients, getClientModal, getDeleteModal, getCloseClientForm, getCloseDeleteModal } from './modules/client-list.js';
import { initClientDetail } from './modules/client-detail.js';

// State
let activeTab = 'dashboard';

// DOM refs
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Init all modules
    initFieldEditor();
    initTagEditor();
    initPromptEditor();
    initModelEditor();
    initFilenameEditor();
    initExportImport({
        onDataChanged: () => {
            invalidateFields();
            invalidateTags();
            invalidatePrompt();
            invalidateFilename();
            invalidateModel();
            if (activeTab === 'global-config') {
                loadFieldDefinitions();
                loadTagDefinitions();
                loadPromptTemplate();
                loadFilenameTemplate();
                loadModelSetting();
            }
            loadClients();
            loadBackups();
        }
    });
    initClientList();
    initClientDetail();

    checkServerHealth();
    loadClients();
    setupEventListeners();
});

// ============================================================================
// TAB NAVIGATION
// ============================================================================

function switchTab(tabName) {
    // Check for unsaved changes when leaving global-config
    if (activeTab === 'global-config' && tabName !== 'global-config') {
        readFieldsFromDOM();
        flushAllEditing();
        const unsavedFields = hasUnsavedFieldChanges();
        const unsavedTags = hasUnsavedTagChanges();
        const unsavedPrompt = hasUnsavedPromptChanges();
        const unsavedFilename = hasUnsavedFilenameChanges();
        const unsavedModel = hasUnsavedModelChanges();
        if (unsavedFields || unsavedTags || unsavedPrompt || unsavedFilename || unsavedModel) {
            if (!confirm('You have unsaved changes. Discard and switch tabs?')) {
                return;
            }
            if (unsavedFields) discardFieldChanges();
            if (unsavedTags) discardTagChanges();
            if (unsavedPrompt) discardPromptChanges();
            if (unsavedFilename) discardFilenameChanges();
            if (unsavedModel) discardModelChanges();
        }
    }

    activeTab = tabName;

    // Update tab buttons
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `tab-${tabName}`);
    });

    // Load data on first visit to global-config
    if (tabName === 'global-config') {
        if (!isModelLoaded()) loadModelSetting();
        if (!isFieldsLoaded()) loadFieldDefinitions();
        if (!isTagsLoaded()) loadTagDefinitions();
        if (!isPromptLoaded()) loadPromptTemplate();
        if (!isFilenameLoaded()) loadFilenameTemplate();
        if (!isBackupsLoaded()) loadBackups();
    }
}

// ============================================================================
// SERVER HEALTH CHECK
// ============================================================================

async function checkServerHealth() {
    try {
        const response = await fetch('/api/health');
        const data = await response.json();

        if (data.status === 'ok' && data.geminiConfigured) {
            statusText.textContent = `Ready (${data.mode})`;
            statusIndicator.querySelector('.status-dot').style.background = 'var(--success)';
        } else if (data.status === 'ok' && !data.geminiConfigured) {
            statusText.textContent = 'API key not configured';
            statusIndicator.querySelector('.status-dot').style.background = 'var(--warning)';
            showAlert('Please configure your GEMINI_API_KEY in the .env file', 'warning');
        }
    } catch (error) {
        statusText.textContent = 'Server offline';
        statusIndicator.querySelector('.status-dot').style.background = 'var(--error)';
        showAlert('Cannot connect to server. Please ensure the server is running.', 'error');
    }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function setupEventListeners() {
    // Tab navigation
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            getAddTagMenu().classList.remove('open');
            const rm = getRestoreModal();
            const ipm = getImportPreviewModal();
            const dm = getDeleteModal();
            const cm = getClientModal();
            if (rm && rm.classList.contains('active')) {
                getCloseRestoreModal()();
            } else if (ipm && ipm.classList.contains('active')) {
                getCloseImportPreview()();
            } else if (dm && dm.classList.contains('active')) {
                getCloseDeleteModal()();
            } else if (cm && cm.classList.contains('active')) {
                getCloseClientForm()();
            }
        }
    });
}
