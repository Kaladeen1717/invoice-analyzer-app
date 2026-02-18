// State management
let clients = [];
let isProcessing = false;
let eventSource = null;
let editingClientId = null;
let deleteClientId = null;
let activeTab = 'dashboard';

// Field editor state
let fieldDefinitions = [];
let originalFieldDefinitions = [];
let fieldsLoaded = false;
let editMode = false;

// Tag editor state
let tagDefinitions = [];
let originalTagDefinitions = [];
let tagsLoaded = false;
let tagEditMode = false;

// Prompt editor state
let promptTemplate = { preamble: '', generalRules: '', suffix: '' };
let originalPromptTemplate = { preamble: '', generalRules: '', suffix: '' };
let rawPrompt = null;
let originalRawPrompt = null;
let promptRawMode = false;
let promptLoaded = false;
let promptPreviewDebounceTimer = null;

// Filename template editor state
let filenameTemplate = '';
let originalFilenameTemplate = '';
let filenameLoaded = false;

// Export/import state
let pendingImportBundle = null;
let restoreBackupId = null;
let backupsLoaded = false;

// Client detail view state
let clientDetailData = null;

// Client detail edit state (per-section)
let detailFieldEditMode = false;
let detailFieldOverrides = null; // working copy of field overrides during edit
let detailTagEditMode = false;
let detailTagOverrides = null; // working copy of tag overrides during edit
let detailPromptEditMode = false;
let detailPromptOverride = null; // working copy
let detailFilenameEditMode = false;
let detailFilenameOverride = null; // working copy

// DOM elements
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const alertArea = document.getElementById('alertArea');
const clientList = document.getElementById('clientList');
const processingLog = document.getElementById('processingLog');

// Buttons
const refreshClientsBtn = document.getElementById('refreshClientsBtn');
const newClientBtn = document.getElementById('newClientBtn');
const processAllBtn = document.getElementById('processAllBtn');
const clearLogBtn = document.getElementById('clearLogBtn');

// Modal elements
const clientModal = document.getElementById('clientModal');
const modalTitle = document.getElementById('modalTitle');
const clientForm = document.getElementById('clientForm');
const closeModalBtn = document.getElementById('closeModalBtn');
const cancelFormBtn = document.getElementById('cancelFormBtn');
const deleteClientBtn = document.getElementById('deleteClientBtn');
const saveClientBtn = document.getElementById('saveClientBtn');

// Form fields
const clientIdInput = document.getElementById('clientId');
const clientNameInput = document.getElementById('clientName');
const folderPathInput = document.getElementById('folderPath');
const apiKeyEnvVarInput = document.getElementById('apiKeyEnvVar');
const clientEnabledInput = document.getElementById('clientEnabled');

// Delete modal elements
const deleteModal = document.getElementById('deleteModal');
const deleteClientName = document.getElementById('deleteClientName');
const closeDeleteModalBtn = document.getElementById('closeDeleteModalBtn');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

// Field editor elements
const fieldListEl = document.getElementById('fieldList');
const fieldsSaveBar = document.getElementById('fieldsSaveBar');
const reloadFieldsBtn = document.getElementById('reloadFieldsBtn');
const addFieldBtn = document.getElementById('addFieldBtn');
const editToggleBtn = document.getElementById('editToggleBtn');
const saveFieldsBtn = document.getElementById('saveFieldsBtn');
const discardFieldsBtn = document.getElementById('discardFieldsBtn');


// Tag editor elements
const tagListEl = document.getElementById('tagList');
const tagsSaveBar = document.getElementById('tagsSaveBar');
const reloadTagsBtn = document.getElementById('reloadTagsBtn');
const addTagBtn = document.getElementById('addTagBtn');
const addTagDropdown = document.getElementById('addTagDropdown');
const addTagMenu = document.getElementById('addTagMenu');
const tagEditToggleBtn = document.getElementById('tagEditToggleBtn');
const saveTagsBtn = document.getElementById('saveTagsBtn');
const discardTagsBtn = document.getElementById('discardTagsBtn');

// Prompt editor elements
const promptPreambleInput = document.getElementById('promptPreamble');
const promptGeneralRulesInput = document.getElementById('promptGeneralRules');
const promptSuffixInput = document.getElementById('promptSuffix');
const promptRawTextInput = document.getElementById('promptRawText');
const promptStructuredMode = document.getElementById('promptStructuredMode');
const promptRawModeEl = document.getElementById('promptRawMode');
const rawEditToggleBtn = document.getElementById('rawEditToggleBtn');
const reloadPromptBtn = document.getElementById('reloadPromptBtn');
const promptPreviewEl = document.getElementById('promptPreview');
const promptPreviewLength = document.getElementById('promptPreviewLength');
const promptSaveBar = document.getElementById('promptSaveBar');
const savePromptBtn = document.getElementById('savePromptBtn');
const discardPromptBtn = document.getElementById('discardPromptBtn');

// Client detail view elements
const dashboardListView = document.getElementById('dashboardListView');
const clientDetailView = document.getElementById('clientDetailView');
const backToDashboardBtn = document.getElementById('backToDashboardBtn');
const detailClientHeader = document.getElementById('detailClientHeader');
const detailFieldList = document.getElementById('detailFieldList');
const detailTagList = document.getElementById('detailTagList');
const detailFilenameTemplate = document.getElementById('detailFilenameTemplate');
const detailPromptTemplate = document.getElementById('detailPromptTemplate');

// Client detail override buttons
const customizeFieldsBtn = document.getElementById('customizeFieldsBtn');
const resetFieldsBtn = document.getElementById('resetFieldsBtn');
const saveDetailFieldsBtn = document.getElementById('saveDetailFieldsBtn');
const discardDetailFieldsBtn = document.getElementById('discardDetailFieldsBtn');
const detailFieldsSaveBar = document.getElementById('detailFieldsSaveBar');

const customizeTagsBtn = document.getElementById('customizeTagsBtn');
const resetTagsBtn = document.getElementById('resetTagsBtn');
const saveDetailTagsBtn = document.getElementById('saveDetailTagsBtn');
const discardDetailTagsBtn = document.getElementById('discardDetailTagsBtn');
const detailTagsSaveBar = document.getElementById('detailTagsSaveBar');

const customizeFilenameBtn = document.getElementById('customizeFilenameBtn');
const resetFilenameBtn = document.getElementById('resetFilenameBtn');
const saveDetailFilenameBtn = document.getElementById('saveDetailFilenameBtn');
const discardDetailFilenameBtn = document.getElementById('discardDetailFilenameBtn');
const detailFilenameSaveBar = document.getElementById('detailFilenameSaveBar');

const customizePromptBtn = document.getElementById('customizePromptBtn');
const resetPromptBtn = document.getElementById('resetPromptBtn');
const saveDetailPromptBtn = document.getElementById('saveDetailPromptBtn');
const discardDetailPromptBtn = document.getElementById('discardDetailPromptBtn');
const detailPromptSaveBar = document.getElementById('detailPromptSaveBar');

// Filename editor elements
const filenameTemplateInput = document.getElementById('filenameTemplateInput');
const fieldPlaceholderChips = document.getElementById('fieldPlaceholderChips');
const tagPlaceholderChips = document.getElementById('tagPlaceholderChips');
const specialPlaceholderChips = document.getElementById('specialPlaceholderChips');
const filenamePreviewEl = document.getElementById('filenamePreview');
const filenameSaveBar = document.getElementById('filenameSaveBar');
const saveFilenameBtn = document.getElementById('saveFilenameBtn');
const discardFilenameBtn = document.getElementById('discardFilenameBtn');
const reloadFilenameBtn = document.getElementById('reloadFilenameBtn');

// Export/Import elements
const exportFieldsBtn = document.getElementById('exportFieldsBtn');
const exportGlobalBtn = document.getElementById('exportGlobalBtn');
const exportEverythingBtn = document.getElementById('exportEverythingBtn');
const exportClientsBtn = document.getElementById('exportClientsBtn');
const importDropZone = document.getElementById('importDropZone');
const importFileInput = document.getElementById('importFileInput');
const importFilePickerBtn = document.getElementById('importFilePickerBtn');
const backupListEl = document.getElementById('backupList');
const refreshBackupsBtn = document.getElementById('refreshBackupsBtn');

// Import preview modal elements
const importPreviewModal = document.getElementById('importPreviewModal');
const importPreviewMeta = document.getElementById('importPreviewMeta');
const importPreviewDetails = document.getElementById('importPreviewDetails');
const closeImportPreviewBtn = document.getElementById('closeImportPreviewBtn');
const cancelImportBtn = document.getElementById('cancelImportBtn');
const confirmImportBtn = document.getElementById('confirmImportBtn');

// Restore modal elements
const restoreModal = document.getElementById('restoreModal');
const restoreBackupLabel = document.getElementById('restoreBackupLabel');
const closeRestoreModalBtn = document.getElementById('closeRestoreModalBtn');
const cancelRestoreBtn = document.getElementById('cancelRestoreBtn');
const confirmRestoreBtn = document.getElementById('confirmRestoreBtn');

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
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
        if (editMode) readFieldsFromDOM();
        // Flush any editing tag cells
        const tagsTable = document.getElementById('tagsTable');
        if (tagsTable) tagsTable.querySelectorAll('td.editing').forEach(td => deactivateCellEdit(td));
        const unsavedFields = hasUnsavedFieldChanges();
        const unsavedTags = hasUnsavedTagChanges();
        const unsavedPrompt = hasUnsavedPromptChanges();
        const unsavedFilename = hasUnsavedFilenameChanges();
        if (unsavedFields || unsavedTags || unsavedPrompt || unsavedFilename) {
            if (!confirm('You have unsaved changes. Discard and switch tabs?')) {
                return;
            }
            if (unsavedFields) discardFieldChanges();
            if (unsavedTags) discardTagChanges();
            if (unsavedPrompt) discardPromptChanges();
            if (unsavedFilename) discardFilenameChanges();
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
        if (!fieldsLoaded) loadFieldDefinitions();
        if (!tagsLoaded) loadTagDefinitions();
        if (!promptLoaded) loadPromptTemplate();
        if (!filenameLoaded) loadFilenameTemplate();
        if (!backupsLoaded) loadBackups();
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
// CLIENT MANAGEMENT
// ============================================================================

async function loadClients() {
    try {
        clientList.innerHTML = '<div class="loading-placeholder">Loading clients...</div>';

        const response = await fetch('/api/clients');
        const data = await response.json();

        if (response.ok) {
            clients = data.clients || [];
            renderClientList();
            updateProcessAllButton();
        } else {
            clientList.innerHTML = `<div class="error-placeholder">Error: ${data.error}</div>`;
        }
    } catch (error) {
        clientList.innerHTML = `<div class="error-placeholder">Failed to load clients: ${error.message}</div>`;
    }
}

function renderClientList() {
    if (clients.length === 0) {
        clientList.innerHTML = `
            <div class="empty-placeholder">
                <p>No clients configured yet.</p>
                <p>Click "New Client" to add your first client.</p>
            </div>
        `;
        return;
    }

    clientList.innerHTML = clients.map(client => {
        const enabledClass = client.enabled ? 'enabled' : 'disabled';
        const enabledIcon = client.enabled ? '&#9679;' : '&#9675;';
        const folderWarning = !client.folderStatus.exists ?
            '<span class="folder-warning" title="Folder does not exist">Folder not found</span>' : '';
        const pdfCount = client.folderStatus.inputPdfCount;
        const processedCount = client.folderStatus.processedCount;

        return `
            <div class="client-card ${enabledClass}" data-client-id="${client.clientId}">
                <div class="client-header">
                    <div class="client-status">
                        <span class="status-icon">${enabledIcon}</span>
                        <span class="client-name">${escapeHtml(client.name)}</span>
                        <span class="client-id">(${escapeHtml(client.clientId)})</span>
                    </div>
                    <button class="btn btn-small btn-secondary edit-btn" data-client-id="${client.clientId}">
                        Edit
                    </button>
                </div>
                <div class="client-details">
                    <div class="client-folder">
                        <span class="label">Folder:</span>
                        <span class="value">${escapeHtml(client.folderPath)}</span>
                        ${folderWarning}
                    </div>
                    <div class="client-stats">
                        <span class="stat">
                            <span class="stat-value">${pdfCount}</span> pending
                        </span>
                        <span class="stat-separator">|</span>
                        <span class="stat">
                            <span class="stat-value">${processedCount}</span> processed
                        </span>
                        <span class="stat-separator">|</span>
                        <span class="stat ${enabledClass}">
                            ${client.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                    </div>
                </div>
                <div class="client-actions">
                    <button class="btn btn-secondary btn-small export-client-btn"
                            data-client-id="${client.clientId}"
                            title="Export client config">
                        Export
                    </button>
                    <button class="btn btn-primary process-btn"
                            data-client-id="${client.clientId}"
                            ${pdfCount === 0 || !client.folderStatus.exists || isProcessing ? 'disabled' : ''}>
                        Process
                    </button>
                </div>
            </div>
        `;
    }).join('');

    // Add event listeners to edit buttons
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openClientForm(btn.dataset.clientId);
        });
    });

    // Add event listeners to per-client export buttons
    document.querySelectorAll('.export-client-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            exportConfig(`client:${btn.dataset.clientId}`);
        });
    });

    // Add event listeners to process buttons
    document.querySelectorAll('.process-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            processClient(btn.dataset.clientId);
        });
    });

    // Add click handler on client cards to open detail view
    document.querySelectorAll('.client-card').forEach(card => {
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => {
            openClientDetail(card.dataset.clientId);
        });
    });
}

function updateProcessAllButton() {
    const enabledClientsWithPdfs = clients.filter(c =>
        c.enabled &&
        c.folderStatus.exists &&
        c.folderStatus.inputPdfCount > 0
    );
    processAllBtn.disabled = enabledClientsWithPdfs.length === 0 || isProcessing;
}

// ============================================================================
// CLIENT FORM (CREATE/EDIT)
// ============================================================================

function openClientForm(clientId = null) {
    editingClientId = clientId;

    if (clientId) {
        // Edit mode
        const client = clients.find(c => c.clientId === clientId);
        if (!client) {
            showAlert(`Client "${clientId}" not found`, 'error');
            return;
        }

        modalTitle.textContent = `Edit Client: ${client.name}`;
        clientIdInput.value = client.clientId;
        clientIdInput.disabled = true;
        clientNameInput.value = client.name;
        folderPathInput.value = client.folderPath;
        apiKeyEnvVarInput.value = client.apiKeyEnvVar || '';
        clientEnabledInput.checked = client.enabled;
        deleteClientBtn.style.display = 'inline-flex';
    } else {
        // Create mode
        modalTitle.textContent = 'Create New Client';
        clientForm.reset();
        clientIdInput.disabled = false;
        clientEnabledInput.checked = true;
        deleteClientBtn.style.display = 'none';
    }

    clientModal.classList.add('active');
}

function closeClientForm() {
    clientModal.classList.remove('active');
    editingClientId = null;
    clientForm.reset();
}

async function saveClient(e) {
    e.preventDefault();

    const clientData = {
        clientId: clientIdInput.value.trim().toLowerCase(),
        name: clientNameInput.value.trim(),
        folderPath: folderPathInput.value.trim(),
        apiKeyEnvVar: apiKeyEnvVarInput.value.trim() || null,
        enabled: clientEnabledInput.checked
    };

    // Validate
    if (!clientData.clientId) {
        showAlert('Client ID is required', 'error');
        return;
    }
    if (!/^[a-z0-9-]+$/.test(clientData.clientId)) {
        showAlert('Client ID must contain only lowercase letters, numbers, and hyphens', 'error');
        return;
    }
    if (!clientData.name) {
        showAlert('Display name is required', 'error');
        return;
    }
    if (!clientData.folderPath) {
        showAlert('Folder path is required', 'error');
        return;
    }

    try {
        saveClientBtn.disabled = true;
        saveClientBtn.innerHTML = '<span class="spinner"></span> Saving...';

        let response;
        if (editingClientId) {
            // Update existing client
            response = await fetch(`/api/clients/${editingClientId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(clientData)
            });
        } else {
            // Create new client
            response = await fetch('/api/clients', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(clientData)
            });
        }

        const result = await response.json();

        if (response.ok) {
            showAlert(result.message || 'Client saved successfully', 'success');
            closeClientForm();
            loadClients();
        } else {
            showAlert(result.error || result.details || 'Failed to save client', 'error');
        }
    } catch (error) {
        showAlert(`Failed to save client: ${error.message}`, 'error');
    } finally {
        saveClientBtn.disabled = false;
        saveClientBtn.innerHTML = '<span>Save</span>';
    }
}

// ============================================================================
// CLIENT DELETE
// ============================================================================

function showDeleteConfirmation() {
    if (!editingClientId) return;

    const client = clients.find(c => c.clientId === editingClientId);
    if (!client) return;

    deleteClientId = editingClientId;
    deleteClientName.textContent = client.name;
    closeClientForm();
    deleteModal.classList.add('active');
}

function closeDeleteModal() {
    deleteModal.classList.remove('active');
    deleteClientId = null;
}

async function confirmDelete() {
    if (!deleteClientId) return;

    try {
        confirmDeleteBtn.disabled = true;
        confirmDeleteBtn.innerHTML = '<span class="spinner"></span> Deleting...';

        const response = await fetch(`/api/clients/${deleteClientId}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (response.ok) {
            showAlert(result.message || 'Client deleted successfully', 'success');
            closeDeleteModal();
            loadClients();
        } else {
            showAlert(result.error || 'Failed to delete client', 'error');
        }
    } catch (error) {
        showAlert(`Failed to delete client: ${error.message}`, 'error');
    } finally {
        confirmDeleteBtn.disabled = false;
        confirmDeleteBtn.innerHTML = '<span>Delete</span>';
    }
}

// ============================================================================
// PROCESSING
// ============================================================================

async function processClient(clientId) {
    if (isProcessing) {
        showAlert('Processing already in progress', 'warning');
        return;
    }

    const client = clients.find(c => c.clientId === clientId);
    if (!client) {
        showAlert(`Client "${clientId}" not found`, 'error');
        return;
    }

    isProcessing = true;
    updateProcessAllButton();
    disableAllProcessButtons();
    clearLog();
    addLogEntry(`Starting processing for client: ${client.name}`, 'info');

    try {
        // Use fetch with POST to start SSE stream
        const response = await fetch(`/api/clients/${clientId}/process`, {
            method: 'POST'
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
                        handleProcessingUpdate(data);
                    } catch (e) {
                        // Ignore parse errors
                    }
                }
            }
        }
    } catch (error) {
        addLogEntry(`Error: ${error.message}`, 'error');
        showAlert(`Processing failed: ${error.message}`, 'error');
    } finally {
        isProcessing = false;
        updateProcessAllButton();
        enableAllProcessButtons();
        loadClients(); // Refresh to update PDF counts
    }
}

async function processAllClients() {
    if (isProcessing) {
        showAlert('Processing already in progress', 'warning');
        return;
    }

    isProcessing = true;
    updateProcessAllButton();
    disableAllProcessButtons();
    clearLog();
    addLogEntry('Starting batch processing for all enabled clients...', 'info');

    try {
        const response = await fetch('/api/clients/process-all', {
            method: 'POST'
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
                        handleProcessingUpdate(data);
                    } catch (e) {
                        // Ignore parse errors
                    }
                }
            }
        }
    } catch (error) {
        addLogEntry(`Error: ${error.message}`, 'error');
        showAlert(`Batch processing failed: ${error.message}`, 'error');
    } finally {
        isProcessing = false;
        updateProcessAllButton();
        enableAllProcessButtons();
        loadClients(); // Refresh to update PDF counts
    }
}

function handleProcessingUpdate(data) {
    switch (data.status) {
        case 'connected':
            addLogEntry('Connected to server...', 'info');
            break;

        case 'starting':
            addLogEntry(`Found ${data.total} files. Processing with ${data.concurrency} concurrent tasks...`, 'info');
            break;

        case 'starting-batch':
            addLogEntry(`Starting batch processing for ${data.totalClients} clients...`, 'info');
            break;

        case 'client-starting':
            addLogEntry(`\n--- Client ${data.clientNumber}/${data.totalClients}: ${data.clientName} ---`, 'info');
            break;

        case 'analyzing':
            addLogEntry(`Analyzing: ${data.filename}...`, 'processing');
            break;

        case 'retrying':
            addLogEntry(`Retrying ${data.filename} (attempt ${data.attempt}/${data.maxAttempts})...`, 'warning');
            break;

        case 'completed':
            addLogEntry(`Completed: ${data.filename} -> ${data.outputFilename}`, 'success');
            break;

        case 'failed':
            addLogEntry(`Failed: ${data.filename} - ${data.error}`, 'error');
            break;

        case 'client-done':
            addLogEntry(`Client complete: ${data.success} successful, ${data.failed} failed`, 'info');
            break;

        case 'client-error':
            addLogEntry(`Client error (${data.clientId}): ${data.error}`, 'error');
            break;

        case 'done':
            if (data.mode === 'all') {
                addLogEntry(`\n=== Batch complete ===`, 'info');
                addLogEntry(`Total: ${data.totalSuccess} successful, ${data.totalFailed} failed across ${data.totalClients} clients`, 'info');
                if (data.totalFailed === 0) {
                    showAlert(`Successfully processed ${data.totalSuccess} invoices!`, 'success');
                } else {
                    showAlert(`Processed ${data.totalSuccess} invoices, ${data.totalFailed} failed`, 'warning');
                }
            } else {
                addLogEntry(`\nComplete: ${data.success} successful, ${data.failed} failed`, 'info');
                if (data.failed === 0 && data.success > 0) {
                    showAlert(`Successfully processed ${data.success} invoices!`, 'success');
                } else if (data.success === 0 && data.failed === 0) {
                    showAlert('No invoices to process', 'info');
                } else if (data.failed > 0) {
                    showAlert(`Processed ${data.success} invoices, ${data.failed} failed`, 'warning');
                }
            }
            break;

        case 'error':
            addLogEntry(`Error: ${data.error}`, 'error');
            showAlert(`Processing error: ${data.error}`, 'error');
            break;
    }
}

function disableAllProcessButtons() {
    document.querySelectorAll('.process-btn').forEach(btn => btn.disabled = true);
    processAllBtn.disabled = true;
}

function enableAllProcessButtons() {
    document.querySelectorAll('.process-btn').forEach(btn => {
        const clientId = btn.dataset.clientId;
        const client = clients.find(c => c.clientId === clientId);
        btn.disabled = !client ||
            client.folderStatus.inputPdfCount === 0 ||
            !client.folderStatus.exists;
    });
    updateProcessAllButton();
}

// ============================================================================
// LOGGING
// ============================================================================

function clearLog() {
    processingLog.innerHTML = '';
}

function addLogEntry(message, type = 'info') {
    // Remove placeholder if present
    const placeholder = processingLog.querySelector('.log-placeholder');
    if (placeholder) {
        placeholder.remove();
    }

    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = message;
    processingLog.appendChild(entry);
    processingLog.scrollTop = processingLog.scrollHeight;
}

// ============================================================================
// ALERTS
// ============================================================================

function showAlert(message, type = 'error') {
    const alertClass = `alert-${type}`;
    const icons = {
        success: '&#10003;',
        warning: '!',
        error: '&#10007;',
        info: 'i'
    };
    const icon = icons[type] || icons.info;

    const alertHTML = `
        <div class="alert ${alertClass}">
            <span class="alert-icon">${icon}</span>
            <span>${escapeHtml(message)}</span>
            <button class="alert-close" onclick="this.parentElement.remove()">&times;</button>
        </div>
    `;

    alertArea.innerHTML = alertHTML;

    // Auto-dismiss success/info alerts after 5 seconds
    if (type === 'success' || type === 'info') {
        setTimeout(() => {
            const alert = alertArea.querySelector('.alert');
            if (alert) {
                alert.remove();
            }
        }, 5000);
    }
}

// ============================================================================
// UTILITIES
// ============================================================================

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================================
// FIELD DEFINITIONS EDITOR
// ============================================================================

async function loadFieldDefinitions() {
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

    const typeOptions = ['text', 'number', 'boolean', 'date', 'array'];
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

        // Enabled column — toggle dot (click to toggle in edit mode)
        const tdEnabled = document.createElement('td');
        tdEnabled.className = 'col-enabled';
        const toggleIcon = document.createElement('span');
        toggleIcon.className = 'toggle-icon ' + (field.enabled ? 'enabled' : 'disabled');
        toggleIcon.textContent = field.enabled ? '\u25CF' : '\u25CB';
        if (editMode) {
            toggleIcon.addEventListener('click', () => {
                toggleField(index);
            });
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
        typeOptions.forEach(t => {
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
            showInlineDeleteConfirm(index, 'field');
        });
        actionsDiv.appendChild(deleteBtn);
    }

    tdActions.appendChild(actionsDiv);
}

function activateCellEdit(td) {
    if (!editMode && !tagEditMode) return;
    if (td.classList.contains('editing')) return;

    // Close any other editing cell in the same table
    const table = td.closest('table');
    table.querySelectorAll('td.editing').forEach(other => {
        if (other !== td) deactivateCellEdit(other);
    });

    // Store original value for escape revert
    const input = td.querySelector('.cell-edit input, .cell-edit textarea, .cell-edit select');
    if (input) {
        td._originalValue = input.value;
    }

    td.classList.add('editing');

    if (input) {
        input.focus();

        // Blur handler — write back and deactivate
        const blurHandler = () => {
            input.removeEventListener('blur', blurHandler);
            deactivateCellEdit(td);
        };
        input.addEventListener('blur', blurHandler);

        // Keyboard handlers
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
}

function deactivateCellEdit(td) {
    td.classList.remove('editing');
    const input = td.querySelector('.cell-edit input, .cell-edit textarea, .cell-edit select');
    const viewSpan = td.querySelector('.cell-view');

    if (input && viewSpan) {
        // Write value back to state
        const tr = td.closest('tr');
        const index = parseInt(tr.dataset.index);
        const fieldName = input.dataset.field;

        // Determine which data array to write to
        const table = td.closest('table');
        if (table.classList.contains('fields-table') && index < fieldDefinitions.length && fieldName) {
            fieldDefinitions[index][fieldName] = input.tagName === 'INPUT' && input.type === 'checkbox' ? input.checked : input.value.trim();

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
        } else if (table.classList.contains('tags-table') && index < tagDefinitions.length && fieldName) {
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

        // Update view text
        if (input.tagName === 'SELECT') {
            viewSpan.textContent = input.value;
        } else if (viewSpan.querySelector('code')) {
            viewSpan.querySelector('code').textContent = input.value;
        } else {
            viewSpan.textContent = input.value || '(empty)';
            if (viewSpan.classList.contains('cell-view-truncate')) {
                viewSpan.title = input.value;
            }
        }

        updateFieldsSaveBar();
        updateTagsSaveBar();
    }
}

function showInlineDeleteConfirm(index, type) {
    const definitions = type === 'field' ? fieldDefinitions : tagDefinitions;
    const item = definitions[index];
    if (!item) return;

    // Find the row
    const tableClass = type === 'field' ? '.fields-table' : '.tags-table';
    const table = document.querySelector(tableClass);
    if (!table) return;
    const tr = table.querySelector(`tr[data-index="${index}"]`);
    if (!tr) return;

    tr.classList.add('confirm-delete');

    // Replace actions cell content with confirm/cancel
    const actionsTd = tr.querySelector('td.col-actions');
    if (!actionsTd) return;
    actionsTd.textContent = '';

    const confirmDiv = document.createElement('div');
    confirmDiv.className = 'row-delete-confirm';

    const label = document.createElement('span');
    label.className = 'confirm-label';
    label.textContent = 'Delete?';
    confirmDiv.appendChild(label);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-secondary btn-small';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (type === 'field') renderFieldList();
        else renderTagList();
    });
    confirmDiv.appendChild(cancelBtn);

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn btn-danger btn-small';
    confirmBtn.textContent = 'Confirm';
    confirmBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        definitions.splice(index, 1);
        if (type === 'field') renderFieldList();
        else renderTagList();
    });
    confirmDiv.appendChild(confirmBtn);

    actionsTd.appendChild(confirmDiv);
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

function readFieldsFromDOM() {
    // Flush any currently-editing cell back to state
    const table = document.getElementById('fieldsTable');
    if (table) {
        table.querySelectorAll('td.editing').forEach(td => deactivateCellEdit(td));
    }
}

function addNewFieldRow() {
    if (!editMode) {
        toggleEditMode();
    }
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

    // Activate click-to-edit on the label cell of the new row
    const lastRow = document.querySelector('#fieldListBody tr:last-child');
    if (lastRow) {
        const labelTd = lastRow.querySelector('td.col-label');
        if (labelTd) activateCellEdit(labelTd);
    }
}

function hasUnsavedFieldChanges() {
    return JSON.stringify(fieldDefinitions) !== JSON.stringify(originalFieldDefinitions);
}

function updateFieldsSaveBar() {
    if (hasUnsavedFieldChanges()) {
        fieldsSaveBar.style.display = 'flex';
    } else {
        fieldsSaveBar.style.display = 'none';
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

    // Validate all fields
    const validTypes = ['text', 'number', 'boolean', 'date', 'array'];
    for (let i = 0; i < fieldDefinitions.length; i++) {
        const field = fieldDefinitions[i];
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
            showAlert(`Row ${rowNum}: key must start with a lowercase letter and contain only alphanumeric characters`, 'error');
            return;
        }
        if (!validTypes.includes(field.type)) {
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

        // Check duplicate keys
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

function discardFieldChanges() {
    fieldDefinitions = JSON.parse(JSON.stringify(originalFieldDefinitions));
    if (editMode) {
        editMode = false;
        editToggleBtn.classList.remove('active');
        editToggleBtn.querySelector('span').textContent = 'Locked';
        addFieldBtn.style.display = 'none';
    }
    renderFieldList();
}

// ============================================================================
// TAG DEFINITIONS EDITOR
// ============================================================================

const TAG_PRESETS = {
    'address-match': {
        label: 'Private',
        instruction: 'Set to true if the address "{{address}}" appears anywhere in the document.',
        parameters: [{ name: 'address', defaultValue: '' }],
        output: { pdf: true, csv: true, filename: true, filenameFormat: ' - PRIVATE', filenamePlaceholder: 'privateTag' }
    },
    'content-keyword': {
        label: 'Contains Keyword',
        instruction: 'Set to true if the document contains the keyword "{{keyword}}".',
        parameters: [{ name: 'keyword', defaultValue: '' }],
        output: { pdf: true, csv: true, filename: false }
    },
    'document-classification': {
        label: 'Credit Note',
        instruction: 'Set to true if this document is a credit note (negative invoice, refund, or credit memo) rather than a standard invoice.',
        parameters: [],
        output: { pdf: true, csv: true, filename: true, filenameFormat: ' - CREDIT', filenamePlaceholder: 'creditTag' }
    },
    'custom': {
        label: '',
        instruction: '',
        parameters: [],
        output: { pdf: false, csv: false, filename: false }
    }
};

async function loadTagDefinitions() {
    try {
        tagListEl.textContent = '';
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'loading-placeholder';
        loadingDiv.textContent = 'Loading tags...';
        tagListEl.appendChild(loadingDiv);

        const response = await fetch('/api/config');
        const data = await response.json();

        if (response.ok) {
            // Convert parameter objects to arrays for easier UI editing
            tagDefinitions = (data.tagDefinitions || []).map(tag => ({
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
        { text: 'PDF', cls: 'col-output' },
        { text: 'CSV', cls: 'col-output' },
        { text: 'File', cls: 'col-output' },
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
    tbody.id = 'tagListBody';

    tagDefinitions.forEach((tag, index) => {
        // Main row
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

        // PDF output checkbox
        const tdPdf = document.createElement('td');
        tdPdf.className = 'col-output';
        const pdfCb = document.createElement('input');
        pdfCb.type = 'checkbox';
        pdfCb.className = 'output-checkbox';
        pdfCb.checked = !!(tag.output && tag.output.pdf);
        pdfCb.addEventListener('change', () => {
            if (!tag.output) tag.output = {};
            tag.output.pdf = pdfCb.checked;
            updateTagsSaveBar();
        });
        tdPdf.appendChild(pdfCb);
        tr.appendChild(tdPdf);

        // CSV output checkbox
        const tdCsv = document.createElement('td');
        tdCsv.className = 'col-output';
        const csvCb = document.createElement('input');
        csvCb.type = 'checkbox';
        csvCb.className = 'output-checkbox';
        csvCb.checked = !!(tag.output && tag.output.csv);
        csvCb.addEventListener('change', () => {
            if (!tag.output) tag.output = {};
            tag.output.csv = csvCb.checked;
            updateTagsSaveBar();
        });
        tdCsv.appendChild(csvCb);
        tr.appendChild(tdCsv);

        // Filename output checkbox
        const tdFn = document.createElement('td');
        tdFn.className = 'col-output';
        const fnCb = document.createElement('input');
        fnCb.type = 'checkbox';
        fnCb.className = 'output-checkbox';
        fnCb.checked = !!(tag.output && tag.output.filename);
        fnCb.addEventListener('change', () => {
            if (!tag.output) tag.output = {};
            tag.output.filename = fnCb.checked;
            // Toggle filename options in detail row
            const detailRow = tbody.querySelector(`tr.tag-detail-row[data-index="${index}"]`);
            if (detailRow) {
                const fnOpts = detailRow.querySelector('.filename-options');
                if (fnOpts) fnOpts.style.display = fnCb.checked ? 'flex' : 'none';
            }
            updateTagsSaveBar();
        });
        tdFn.appendChild(fnCb);
        tr.appendChild(tdFn);

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
            showInlineDeleteConfirm(index, 'tag');
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
        table.querySelectorAll('td.cell-editable').forEach(td => {
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
    fnOpts.style.display = (tag.output && tag.output.filename) ? 'flex' : 'none';

    const fmtGroup = document.createElement('div');
    fmtGroup.className = 'form-group';
    const fmtLabel = document.createElement('label');
    fmtLabel.textContent = 'Format';
    fmtGroup.appendChild(fmtLabel);
    const fmtInput = document.createElement('input');
    fmtInput.type = 'text';
    fmtInput.placeholder = 'e.g., " - PRIVATE"';
    fmtInput.value = (tag.output && tag.output.filenameFormat) || '';
    fmtInput.disabled = !tagEditMode;
    fmtInput.addEventListener('input', () => {
        if (!tag.output) tag.output = {};
        tag.output.filenameFormat = fmtInput.value;
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
    phInput.value = (tag.output && tag.output.filenamePlaceholder) || '';
    phInput.disabled = !tagEditMode;
    phInput.addEventListener('input', () => {
        if (!tag.output) tag.output = {};
        tag.output.filenamePlaceholder = phInput.value;
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
    ['Name', 'Default Value', ''].forEach(text => {
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
        parameters: (preset.parameters || []).map(p => ({ ...p })),
        output: { ...preset.output }
    };

    tagDefinitions.push(newTag);
    renderTagList();

    // Activate edit on the label cell of the new tag if custom
    if (presetKey === 'custom') {
        const lastMainRow = tagListEl.querySelector('#tagListBody tr[data-index]:not(.tag-detail-row):last-of-type');
        if (lastMainRow) {
            const labelTd = lastMainRow.querySelector('td.col-label');
            if (labelTd) activateCellEdit(labelTd);
        }
    }
}

function hasUnsavedTagChanges() {
    return JSON.stringify(tagDefinitions) !== JSON.stringify(originalTagDefinitions);
}

function updateTagsSaveBar() {
    tagsSaveBar.style.display = hasUnsavedTagChanges() ? 'flex' : 'none';
}

async function saveTagDefinitions() {
    if (tagDefinitions.length === 0 && originalTagDefinitions.length === 0) {
        showAlert('No tag changes to save', 'info');
        return;
    }

    // Validate
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
        // Check duplicate IDs
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

        // Convert parameter arrays back to objects for the API
        const apiTagDefs = tagDefinitions.map(tag => ({
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

function discardTagChanges() {
    tagDefinitions = JSON.parse(JSON.stringify(originalTagDefinitions));
    if (tagEditMode) {
        tagEditMode = false;
        tagEditToggleBtn.classList.remove('active');
        tagEditToggleBtn.querySelector('span').textContent = 'Locked';
        addTagDropdown.style.display = 'none';
    }
    renderTagList();
}

function labelToSnakeCase(label) {
    return label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
}

// ============================================================================
// PROMPT TEMPLATE EDITOR
// ============================================================================

async function loadPromptTemplate() {
    try {
        const response = await fetch('/api/config/prompt');
        const data = await response.json();

        if (response.ok) {
            promptTemplate = data.promptTemplate || { preamble: '', generalRules: '', suffix: '' };
            originalPromptTemplate = JSON.parse(JSON.stringify(promptTemplate));
            rawPrompt = data.rawPrompt || null;
            originalRawPrompt = rawPrompt;
            promptLoaded = true;

            // If rawPrompt exists, switch to raw mode
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

function toggleRawEditMode() {
    if (promptRawMode) {
        // Switch to structured mode
        promptRawMode = false;
        rawEditToggleBtn.classList.remove('active');
        rawEditToggleBtn.querySelector('span').textContent = 'Raw Edit';
        promptStructuredMode.style.display = 'block';
        promptRawModeEl.style.display = 'none';
        // Restore structured fields
        promptPreambleInput.value = promptTemplate.preamble || '';
        promptGeneralRulesInput.value = promptTemplate.generalRules || '';
        promptSuffixInput.value = promptTemplate.suffix || '';
    } else {
        // Switch to raw mode — populate with current assembled preview
        promptRawMode = true;
        rawEditToggleBtn.classList.add('active');
        rawEditToggleBtn.querySelector('span').textContent = 'Structured';
        promptStructuredMode.style.display = 'none';
        promptRawModeEl.style.display = 'block';
        // If we already have a raw prompt, use that; otherwise use the preview
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
                // In raw mode, preview shows the raw text directly
                previewText = promptRawTextInput.value || '(empty)';
            } else {
                // In structured mode, call the preview API
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
            if (code) {
                code.textContent = previewText;
            }
            promptPreviewLength.textContent = previewText.length + ' chars';
        } catch (error) {
            const code = promptPreviewEl.querySelector('code');
            if (code) {
                code.textContent = 'Error loading preview: ' + error.message;
            }
        }
    }, 300);
}

function hasUnsavedPromptChanges() {
    if (promptRawMode) {
        const currentRaw = promptRawTextInput.value;
        return currentRaw !== (originalRawPrompt || '');
    }
    return promptPreambleInput.value !== (originalPromptTemplate.preamble || '') ||
           promptGeneralRulesInput.value !== (originalPromptTemplate.generalRules || '') ||
           promptSuffixInput.value !== (originalPromptTemplate.suffix || '');
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
            // Clear rawPrompt when saving structured
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

function discardPromptChanges() {
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

// ============================================================================
// FILENAME TEMPLATE EDITOR
// ============================================================================

const FILENAME_SAMPLE_DATA = {
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

const SPECIAL_PLACEHOLDERS = [
    { key: 'paymentDateFormatted', tooltip: 'Payment date as DD.MM.YYYY' },
    { key: 'invoiceDateFormatted', tooltip: 'Invoice date as DD.MM.YYYY' },
    { key: 'invoiceDateIfDifferent', tooltip: 'Invoice date only if different from payment date, prefixed with " - "' }
];

async function loadFilenameTemplate() {
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
        showAlert('Failed to load filename template: ' + error.message, 'error');
    }
}

function renderPlaceholderChips(fields, tags) {
    fieldPlaceholderChips.textContent = '';
    fields.forEach(field => {
        if (!field.enabled) return;
        const chip = createPlaceholderChip(field.key, field.label);
        fieldPlaceholderChips.appendChild(chip);
    });

    tagPlaceholderChips.textContent = '';
    tags.forEach(tag => {
        if (!tag.enabled) return;
        if (!tag.output || !tag.output.filename || !tag.output.filenamePlaceholder) return;
        const chip = createPlaceholderChip(tag.output.filenamePlaceholder, tag.label, 'tag-chip');
        tagPlaceholderChips.appendChild(chip);
        // Add tag sample data for preview
        FILENAME_SAMPLE_DATA[tag.output.filenamePlaceholder] = tag.output.filenameFormat || '';
    });

    const tagGroup = document.getElementById('tagPlaceholders');
    tagGroup.style.display = tagPlaceholderChips.children.length > 0 ? 'block' : 'none';

    specialPlaceholderChips.textContent = '';
    SPECIAL_PLACEHOLDERS.forEach(sp => {
        const chip = createPlaceholderChip(sp.key, sp.tooltip, 'special-chip');
        chip.title = sp.tooltip;
        specialPlaceholderChips.appendChild(chip);
    });
}

function createPlaceholderChip(key, tooltipText, extraClass) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'placeholder-chip' + (extraClass ? ' ' + extraClass : '');
    chip.textContent = '{' + key + '}';
    chip.title = tooltipText;
    chip.addEventListener('click', () => insertPlaceholder(key));
    return chip;
}

function insertPlaceholder(key) {
    const input = filenameTemplateInput;
    const placeholder = '{' + key + '}';
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const value = input.value;

    input.value = value.substring(0, start) + placeholder + value.substring(end);
    const newPos = start + placeholder.length;
    input.setSelectionRange(newPos, newPos);
    input.focus();

    filenameTemplate = input.value;
    updateFilenamePreview();
    updateFilenameSaveBar();
}

function updateFilenamePreview() {
    const template = filenameTemplateInput.value;
    if (!template) {
        filenamePreviewEl.textContent = '(empty template)';
        return;
    }

    const preview = template.replace(/\{(\w+)\}/g, (match, key) => {
        if (key in FILENAME_SAMPLE_DATA) {
            return FILENAME_SAMPLE_DATA[key];
        }
        return match;
    });

    filenamePreviewEl.textContent = preview;
}

function hasUnsavedFilenameChanges() {
    if (!filenameTemplateInput) return false;
    return filenameTemplateInput.value !== originalFilenameTemplate;
}

function updateFilenameSaveBar() {
    filenameSaveBar.style.display = hasUnsavedFilenameChanges() ? 'flex' : 'none';
}

async function saveFilenameTemplate() {
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
        showAlert('Failed to save filename template: ' + error.message, 'error');
    } finally {
        saveFilenameBtn.disabled = false;
        saveFilenameBtn.textContent = 'Save Changes';
    }
}

function discardFilenameChanges() {
    filenameTemplateInput.value = originalFilenameTemplate;
    filenameTemplate = originalFilenameTemplate;
    updateFilenamePreview();
    updateFilenameSaveBar();
}

// ============================================================================
// CLIENT DETAIL VIEW
// ============================================================================

async function openClientDetail(clientId) {
    dashboardListView.style.display = 'none';
    clientDetailView.style.display = 'block';
    resetDetailEditState();

    // Show loading state
    detailClientHeader.textContent = '';
    [detailFieldList, detailTagList, detailFilenameTemplate, detailPromptTemplate].forEach(el => {
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

function closeClientDetail() {
    clientDetailView.style.display = 'none';
    dashboardListView.style.display = 'block';
    resetDetailEditState();
    clientDetailData = null;
}

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
    statusDot.innerHTML = c.enabled ? '&#9679;' : '&#9675;';
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

    renderDetailFieldList(data.fieldDefinitions);
    renderDetailTagList(data.tagDefinitions);
    renderDetailFilenameTemplate(data.filenameTemplate);
    renderDetailPromptTemplate(data.promptTemplate);
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

    const colCount = 8; // On, Label, ID, Instruction, PDF, CSV, File, Source

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

        // Parameters detail row (show when tag has parameters)
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

// ============================================================================
// CLIENT DETAIL — OVERRIDE EDITING
// ============================================================================

function resetDetailEditState() {
    detailFieldEditMode = false;
    detailFieldOverrides = null;
    detailTagEditMode = false;
    detailTagOverrides = null;
    detailPromptEditMode = false;
    detailPromptOverride = null;
    detailFilenameEditMode = false;
    detailFilenameOverride = null;
    detailFieldsSaveBar.style.display = 'none';
    detailTagsSaveBar.style.display = 'none';
    detailPromptSaveBar.style.display = 'none';
    detailFilenameSaveBar.style.display = 'none';
}

function updateDetailResetButtons() {
    if (!clientDetailData) return;
    const d = clientDetailData;
    resetFieldsBtn.style.display = d.fieldDefinitions.some(f => f._source === 'override') ? 'inline-flex' : 'none';
    resetTagsBtn.style.display = d.tagDefinitions.some(t => t._source === 'override' || Object.values(t._parameterSources || {}).some(k => k === 'override')) ? 'inline-flex' : 'none';
    resetPromptBtn.style.display = d.promptTemplate._source === 'override' ? 'inline-flex' : 'none';
    resetFilenameBtn.style.display = d.filenameTemplate._source === 'override' ? 'inline-flex' : 'none';
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

// ============================================================================
// CONFIG EXPORT / IMPORT / BACKUP
// ============================================================================

async function exportConfig(scope) {
    try {
        const response = await fetch(`/api/config/export?scope=${encodeURIComponent(scope)}`);
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Export failed');
        }
        const bundle = await response.json();

        // Build filename from scope
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const scopeSlug = scope.replace(':', '-');
        const filename = `invoice-analyzer-${scopeSlug}-${timestamp}.json`;

        // Trigger download
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
    // Build meta info
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

    // Build meta rows
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

    // Build details of what will be imported
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

            // Reload relevant data
            fieldsLoaded = false;
            tagsLoaded = false;
            promptLoaded = false;
            filenameLoaded = false;
            if (activeTab === 'global-config') {
                loadFieldDefinitions();
                loadTagDefinitions();
                loadPromptTemplate();
                loadFilenameTemplate();
            }
            loadClients();
            loadBackups();
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

async function loadBackups() {
    try {
        backupListEl.textContent = '';
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'loading-placeholder';
        loadingDiv.textContent = 'Loading backups...';
        backupListEl.appendChild(loadingDiv);

        const response = await fetch('/api/config/backups');
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to load backups');
        }

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
            btn.addEventListener('click', () => {
                showRestoreConfirmation(backup.id, label + ' - ' + date);
            });

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

            // Reload everything
            fieldsLoaded = false;
            tagsLoaded = false;
            promptLoaded = false;
            filenameLoaded = false;
            if (activeTab === 'global-config') {
                loadFieldDefinitions();
                loadTagDefinitions();
                loadPromptTemplate();
                loadFilenameTemplate();
            }
            loadClients();
            loadBackups();
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

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function setupEventListeners() {
    // Tab navigation
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Back to dashboard
    backToDashboardBtn.addEventListener('click', closeClientDetail);

    // Refresh clients
    refreshClientsBtn.addEventListener('click', loadClients);

    // New client button
    newClientBtn.addEventListener('click', () => openClientForm());

    // Process all button
    processAllBtn.addEventListener('click', processAllClients);

    // Clear log button
    clearLogBtn.addEventListener('click', clearLog);

    // Modal close buttons
    closeModalBtn.addEventListener('click', closeClientForm);
    cancelFormBtn.addEventListener('click', closeClientForm);

    // Close modal on overlay click
    clientModal.addEventListener('click', (e) => {
        if (e.target === clientModal) {
            closeClientForm();
        }
    });

    // Form submission
    clientForm.addEventListener('submit', saveClient);

    // Delete button in edit form
    deleteClientBtn.addEventListener('click', showDeleteConfirmation);

    // Delete modal buttons
    closeDeleteModalBtn.addEventListener('click', closeDeleteModal);
    cancelDeleteBtn.addEventListener('click', closeDeleteModal);
    confirmDeleteBtn.addEventListener('click', confirmDelete);

    // Close delete modal on overlay click
    deleteModal.addEventListener('click', (e) => {
        if (e.target === deleteModal) {
            closeDeleteModal();
        }
    });

    // Field editor buttons
    editToggleBtn.addEventListener('click', toggleEditMode);
    reloadFieldsBtn.addEventListener('click', () => {
        fieldsLoaded = false;
        loadFieldDefinitions();
    });
    addFieldBtn.addEventListener('click', addNewFieldRow);
    saveFieldsBtn.addEventListener('click', saveFieldDefinitions);
    discardFieldsBtn.addEventListener('click', discardFieldChanges);

    // Tag editor buttons
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
    document.querySelectorAll('#addTagMenu .dropdown-item').forEach(item => {
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

    // Prompt editor buttons
    reloadPromptBtn.addEventListener('click', () => {
        promptLoaded = false;
        loadPromptTemplate();
    });
    rawEditToggleBtn.addEventListener('click', toggleRawEditMode);
    savePromptBtn.addEventListener('click', savePromptTemplate);
    discardPromptBtn.addEventListener('click', discardPromptChanges);

    // Prompt editor live preview on input
    promptPreambleInput.addEventListener('input', () => {
        updatePromptPreview();
        updatePromptSaveBar();
    });
    promptGeneralRulesInput.addEventListener('input', () => {
        updatePromptPreview();
        updatePromptSaveBar();
    });
    promptSuffixInput.addEventListener('input', () => {
        updatePromptPreview();
        updatePromptSaveBar();
    });
    promptRawTextInput.addEventListener('input', () => {
        updatePromptPreview();
        updatePromptSaveBar();
    });

    // Filename editor buttons
    reloadFilenameBtn.addEventListener('click', () => {
        filenameLoaded = false;
        loadFilenameTemplate();
    });
    saveFilenameBtn.addEventListener('click', saveFilenameTemplate);
    discardFilenameBtn.addEventListener('click', discardFilenameChanges);

    // Filename template live preview on input
    filenameTemplateInput.addEventListener('input', () => {
        filenameTemplate = filenameTemplateInput.value;
        updateFilenamePreview();
        updateFilenameSaveBar();
    });

    // Client detail override buttons
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

    customizeFilenameBtn.addEventListener('click', () => detailFilenameEditMode ? cancelDetailFilenameEdit() : customizeFilename());
    resetFilenameBtn.addEventListener('click', () => resetOverride('output'));
    saveDetailFilenameBtn.addEventListener('click', saveDetailFilenameOverride);
    discardDetailFilenameBtn.addEventListener('click', cancelDetailFilenameEdit);

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
        if (importFileInput.files.length > 0) {
            handleImportFile(importFileInput.files[0]);
        }
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
        if (e.dataTransfer.files.length > 0) {
            handleImportFile(e.dataTransfer.files[0]);
        }
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

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            // Close dropdown menu if open
            addTagMenu.classList.remove('open');
            if (restoreModal.classList.contains('active')) {
                closeRestoreModal();
            } else if (importPreviewModal.classList.contains('active')) {
                closeImportPreview();
            } else if (deleteModal.classList.contains('active')) {
                closeDeleteModal();
            } else if (clientModal.classList.contains('active')) {
                closeClientForm();
            }
        }
    });
}
