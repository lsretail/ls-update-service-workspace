import { WorkspaceFolder } from "vscode";

export interface IWorkspaceEntry
{
    workspaceFolder: WorkspaceFolder;
    virtual: boolean;
}