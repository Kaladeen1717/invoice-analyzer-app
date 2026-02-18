// Shared application state — imported by all modules that need cross-module state.
// Each editor module owns its own local state (definitions, editMode, etc.).
// This module only holds state that multiple modules need to read/write.

export const app = {
    clients: [],
    isProcessing: false,
    activeTab: 'dashboard',
    eventSource: null,
    editingClientId: null,
    deleteClientId: null
};
