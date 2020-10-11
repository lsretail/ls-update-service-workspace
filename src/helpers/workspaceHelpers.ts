import { workspace, WorkspaceFolder } from "vscode";

export class WorkspaceHelpers
{
    public static getWorkspaceForPath(path: string): WorkspaceFolder
    {
        for (let workspaceFolder of workspace.workspaceFolders)
        {
            if (path.startsWith(workspaceFolder.uri.fsPath))
                return workspaceFolder;
        }
    }
}