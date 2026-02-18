// Config Export / Import / Backup module
// Handles exporting config bundles, importing with preview, backup management.

import { showAlert } from './ui-utils.js';

// --- State ---
let pendingImportBundle = null;
let restoreBackupId = null;
let backupsLoaded = false;

// --- DOM refs (set in init) ---
let importDropZone, importFileInput, backupListEl;
let importPreviewModal, importPreviewMeta, importPreviewDetails;
let closeImportPreviewBtn, cancelImportBtn, confirmImportBtn;
let restoreModal, restoreBackupLabel;
let closeRestoreModalBtn, cancelRestoreBtn, confirmRestoreBtn;

// Callback provided by app.js for reloading after import/restore
let _onDataChanged = null;

// --- Public API ---

/**
 * @param {Object} opts
 * @param {Function} opts.onDataChanged - Called after successful import or restore
 */
export function initExportImport({ onDataChanged }) {
    _onDataChanged = onDataChanged;

    importDropZone = document.getElementById('importDropZone');
    importFileInput = document.getElementById('importFileInput');
    backupListEl = document.getElementById('backupList');
    importPreviewModal = document.getElementById('importPreviewModal');
    importPreviewMeta = document.getElementById('importPreviewMeta');
    importPreviewDetails = document.getElementById('importPreviewDetails');
    closeImportPreviewBtn = document.getElementById('closeImportPreviewBtn');
    cancelImportBtn = document.getElementById('cancelImportBtn');
    confirmImportBtn = document.getElementById('confirmImportBtn');
    restoreModal = document.getElementById('restoreModal');
    restoreBackupLabel = document.getElementById('restoreBackupLabel');
    closeRestoreModalBtn = document.getElementById('closeRestoreModalBtn');
    cancelRestoreBtn = document.getElementById('cancelRestoreBtn');
    confirmRestoreBtn = document.getElementById('confirmRestoreBtn');

    const exportFieldsBtn = document.getElementById('exportFieldsBtn');
    const exportGlobalBtn = document.getElementById('exportGlobalBtn');
    const exportEverythingBtn = document.getElementById('exportEverythingBtn');
    const exportClientsBtn = document.getElementById('exportClientsBtn');
    const importFilePickerBtn = document.getElementById('importFilePickerBtn');
    const refreshBackupsBtn = document.getElementById('refreshBackupsBtn');

    // Export buttons
    exportFieldsBtn.addEventListener('click', () => exportConfig('fields'));
    exportGlobalBtn.addEventListener('click', () => exportConfig('global'));
    exportEverythingBtn.addEventListener('click', () => exportConfig('all'));
    exportClientsBtn.addEventListener('click', () => exportConfig('clients'));

    // Import drag-and-drop
    importDropZone.addEventListener('click', () => importFileInput.click());
    importFilePickerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        importFileInput.click();
    });
    importFileInput.addEventListener('change', () => {
        if (importFileInput.files.length > 0) handleImportFile(importFileInput.files[0]);
    });
    importDropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        importDropZone.classList.add('drag-over');
    });
    importDropZone.addEventListener('dragleave', () => {
        importDropZone.classList.remove('drag-over');
    });
    importDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        importDropZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) handleImportFile(e.dataTransfer.files[0]);
    });

    // Import preview modal
    closeImportPreviewBtn.addEventListener('click', closeImportPreview);
    cancelImportBtn.addEventListener('click', closeImportPreview);
    confirmImportBtn.addEventListener('click', confirmImport);
    importPreviewModal.addEventListener('click', (e) => {
        if (e.target === importPreviewModal) closeImportPreview();
    });

    // Backup management
    refreshBackupsBtn.addEventListener('click', loadBackups);

    // Restore modal
    closeRestoreModalBtn.addEventListener('click', closeRestoreModal);
    cancelRestoreBtn.addEventListener('click', closeRestoreModal);
    confirmRestoreBtn.addEventListener('click', confirmRestore);
    restoreModal.addEventListener('click', (e) => {
        if (e.target === restoreModal) closeRestoreModal();
    });
}

export function isBackupsLoaded() { return backupsLoaded; }

export async function loadBackups() {
    try {
        backupListEl.textContent = '';
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'loading-placeholder';
        loadingDiv.textContent = 'Loading backups...';
        backupListEl.appendChild(loadingDiv);

        const response = await fetch('/api/config/backups');
        const data = await response.json();

        if (!response.ok) throw new Error(data.error || 'Failed to load backups');

        const backups = data.backups || [];
        backupsLoaded = true;
        backupListEl.textContent = '';

        if (backups.length === 0) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'backup-empty';
            emptyDiv.textContent = 'No backups yet. Backups are created automatically when you import config.';
            backupListEl.appendChild(emptyDiv);
            return;
        }

        backups.forEach(backup => {
            const date = new Date(backup.timestamp).toLocaleString();
            const label = backup.label || 'manual';

            const item = document.createElement('div');
            item.className = 'backup-item';

            const info = document.createElement('div');
            info.className = 'backup-info';
            const tsDiv = document.createElement('div');
            tsDiv.className = 'backup-timestamp';
            tsDiv.textContent = date;
            const labelDiv = document.createElement('div');
            labelDiv.className = 'backup-label';
            labelDiv.textContent = label;
            info.appendChild(tsDiv);
            info.appendChild(labelDiv);

            const btn = document.createElement('button');
            btn.className = 'btn btn-secondary btn-small';
            btn.textContent = 'Restore';
            btn.addEventListener('click', () => showRestoreConfirmation(backup.id, label + ' - ' + date));

            item.appendChild(info);
            item.appendChild(btn);
            backupListEl.appendChild(item);
        });
    } catch (error) {
        backupListEl.textContent = '';
        const errDiv = document.createElement('div');
        errDiv.className = 'error-placeholder';
        errDiv.textContent = 'Failed to load backups: ' + error.message;
        backupListEl.appendChild(errDiv);
    }
}

/**
 * Export config for a given scope. Also used for per-client export.
 */
export async function exportConfig(scope) {
    try {
        const response = await fetch(`/api/config/export?scope=${encodeURIComponent(scope)}`);
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Export failed');
        }
        const bundle = await response.json();

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const scopeSlug = scope.replace(':', '-');
        const filename = `invoice-analyzer-${scopeSlug}-${timestamp}.json`;

        const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showAlert(`Exported ${scope} config successfully`, 'success');
    } catch (error) {
        showAlert(`Export failed: ${error.message}`, 'error');
    }
}

/**
 * Get modal elements for Escape key handling in app.js.
 */
export function getRestoreModal() { return restoreModal; }
export function getImportPreviewModal() { return importPreviewModal; }
export function getCloseRestoreModal() { return closeRestoreModal; }
export function getCloseImportPreview() { return closeImportPreview; }

// --- Internal ---

function handleImportFile(file) {
    if (!file || !file.name.endsWith('.json')) {
        showAlert('Please select a valid JSON file', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const bundle = JSON.parse(e.target.result);
            if (!bundle.scope || !bundle.data) {
                showAlert('Invalid config file: missing scope or data', 'error');
                return;
            }
            pendingImportBundle = bundle;
            showImportPreview(bundle);
        } catch (err) {
            showAlert('Invalid JSON file: ' + err.message, 'error');
        }
    };
    reader.readAsText(file);
}

function showImportPreview(bundle) {
    const exportDate = bundle.exportedAt ? new Date(bundle.exportedAt).toLocaleString() : 'Unknown';
    const scopeLabels = {
        fields: 'Field Definitions',
        global: 'Global Config',
        clients: 'All Clients',
        all: 'Everything (Global + Clients)'
    };
    const scopeLabel = bundle.scope.startsWith('client:')
        ? `Client: ${bundle.scope.substring(7)}`
        : (scopeLabels[bundle.scope] || bundle.scope);

    importPreviewMeta.textContent = '';
    [
        ['Scope', scopeLabel],
        ['Exported', exportDate],
        ['Version', String(bundle.exportVersion || 'Unknown')]
    ].forEach(([label, value]) => {
        const row = document.createElement('div');
        row.className = 'meta-row';
        const labelSpan = document.createElement('span');
        labelSpan.className = 'meta-label';
        labelSpan.textContent = label + ':';
        const valueSpan = document.createElement('span');
        valueSpan.className = 'meta-value';
        valueSpan.textContent = value;
        row.appendChild(labelSpan);
        row.appendChild(valueSpan);
        importPreviewMeta.appendChild(row);
    });

    importPreviewDetails.textContent = '';
    const heading = document.createElement('h4');
    heading.textContent = 'Will import:';
    importPreviewDetails.appendChild(heading);

    const addItem = (text, style) => {
        const div = document.createElement('div');
        div.className = 'import-preview-item';
        div.textContent = text;
        if (style) Object.assign(div.style, style);
        importPreviewDetails.appendChild(div);
    };

    switch (bundle.scope) {
        case 'fields':
            addItem(`Field definitions (${(bundle.data.fieldDefinitions || []).length} fields)`);
            if (bundle.data.extraction) addItem('Extraction settings');
            break;
        case 'global':
            addItem('Global config.json (all settings except folder paths)');
            break;
        case 'clients':
            if (bundle.data.clients) {
                const clientIds = Object.keys(bundle.data.clients);
                addItem(`${clientIds.length} client(s): ${clientIds.join(', ')}`);
            }
            break;
        case 'all':
            addItem('Global config.json');
            if (bundle.data.clients) {
                const clientIds = Object.keys(bundle.data.clients);
                addItem(`${clientIds.length} client(s): ${clientIds.join(', ')}`);
            }
            break;
        default:
            if (bundle.scope.startsWith('client:')) {
                addItem(`Client config for "${bundle.scope.substring(7)}"`);
            }
    }
    addItem('A backup will be created before importing.', { color: 'var(--text-secondary)', marginTop: '0.5rem' });

    importPreviewModal.classList.add('active');
}

function closeImportPreview() {
    importPreviewModal.classList.remove('active');
    pendingImportBundle = null;
    importFileInput.value = '';
}

async function confirmImport() {
    if (!pendingImportBundle) return;

    try {
        confirmImportBtn.disabled = true;
        confirmImportBtn.textContent = 'Importing...';

        const response = await fetch('/api/config/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pendingImportBundle)
        });

        const result = await response.json();

        if (response.ok) {
            closeImportPreview();
            const updatedCount = result.updated ? result.updated.length : 0;
            showAlert(`Import successful! ${updatedCount} item(s) updated. Backup ID: ${result.backupId}`, 'success');
            if (_onDataChanged) _onDataChanged();
        } else {
            showAlert(`Import failed: ${result.details || result.error}`, 'error');
        }
    } catch (error) {
        showAlert(`Import failed: ${error.message}`, 'error');
    } finally {
        confirmImportBtn.disabled = false;
        confirmImportBtn.textContent = 'Import';
    }
}

function showRestoreConfirmation(backupId, label) {
    restoreBackupId = backupId;
    restoreBackupLabel.textContent = label;
    restoreModal.classList.add('active');
}

function closeRestoreModal() {
    restoreModal.classList.remove('active');
    restoreBackupId = null;
}

async function confirmRestore() {
    if (!restoreBackupId) return;

    try {
        confirmRestoreBtn.disabled = true;
        confirmRestoreBtn.textContent = 'Restoring...';

        const response = await fetch('/api/config/restore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ backupId: restoreBackupId })
        });

        const result = await response.json();

        if (response.ok) {
            closeRestoreModal();
            const restoredCount = result.restored ? result.restored.length : 0;
            showAlert(`Restored ${restoredCount} item(s) from backup. Safety backup: ${result.safetyBackupId}`, 'success');
            if (_onDataChanged) _onDataChanged();
        } else {
            showAlert(`Restore failed: ${result.details || result.error}`, 'error');
        }
    } catch (error) {
        showAlert(`Restore failed: ${error.message}`, 'error');
    } finally {
        confirmRestoreBtn.disabled = false;
        confirmRestoreBtn.textContent = 'Restore';
    }
}
