import path = require("path");
import { pathToFileURL } from "url";
import { workspace, WorkspaceFolder } from "vscode";
import { WorkspaceFilesService } from "../services/workspaceFilesService";
import { WorkspaceServiceProvider } from "../workspaceService/services/workspaceServiceProvider";

export class WorkspaceHelpers
{
    public static getWorkspaceForPath(filePath: string): WorkspaceFolder
    {
        for (let workspaceFolder of workspace.workspaceFolders)
        {
            if (filePath === workspaceFolder.uri.fsPath || filePath.startsWith(workspaceFolder.uri.fsPath + path.sep))
                return workspaceFolder;
        }
    }

    public static async getAppIdPackageIdMapFromWorkspaces(wsWorkspaceFilesService: WorkspaceServiceProvider<WorkspaceFilesService>): Promise<{[_: string]: string}>
    {
        let services = await wsWorkspaceFilesService.getServices({
            serviceFilter: s => Promise.resolve(s.appJson.exists() && s.projectFile.exists())
        })

        let result: {[_: string]: string} = {};

        for (let service of services)
        {
            result[(await service.appJson.getData())?.id] = (await service.projectFile.getData())?.id;
        }

        return result;
    }
}