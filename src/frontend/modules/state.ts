// Shared application state — imported by all modules that need cross-module state.
// Each editor module owns its own local state (definitions, editMode, etc.).
// This module only holds state that multiple modules need to read/write.

export interface AppState {
    clients: unknown[];
    isProcessing: boolean;
    activeTab: string;
    eventSource: EventSource | null;
    editingClientId: string | null;
    deleteClientId: string | null;
}

export const app: AppState = {
    clients: [],
    isProcessing: false,
    activeTab: 'dashboard',
    eventSource: null,
    editingClientId: null,
    deleteClientId: null
};
