import { WorkspaceFolder } from "vscode";

export interface WorkspaceFoldersExChangeEvent {
    /**
     * Added workspace folders.
     */
    readonly added: ReadonlyArray<WorkspaceFolder>;

    /**
     * Removed workspace folders.
     */
    readonly removed: ReadonlyArray<WorkspaceFolder>;

    readonly virtual:boolean;
}