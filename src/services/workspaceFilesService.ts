import path = require("path");
import { WorkspaceFolder } from "vscode";
import { Constants } from "../constants";
import { ProjectFileHelpers } from "../helpers/projectFileHelpers";
import { JsonData } from "../jsonData";
import { ProjectFile } from "../models/projectFile";
import { WorkspaceData } from "../models/workspaceData";
import { AppJson } from "../newProjectService/interfaces/appJson";
import { IWorkspaceService } from "../workspaceService/interfaces/IWorkspaceService";

export class WorkspaceFilesService implements IWorkspaceService
{
    private _projectFile: JsonData<ProjectFile>;
    private _workspaceData: JsonData<WorkspaceData>;
    private _appJson: JsonData<AppJson>;

    constructor(workspaceFolder: WorkspaceFolder)
    {
        let projectFilePath = ProjectFileHelpers.getProjectFilePath(workspaceFolder.uri.fsPath);
        this._projectFile = new JsonData<ProjectFile>(projectFilePath, true, new ProjectFile());
        this._workspaceData = new JsonData<WorkspaceData>(path.join(workspaceFolder.uri.fsPath, Constants.goCurrentWorkspaceDirName+"\\"+Constants.projectDataFileName), true, new WorkspaceData());
        this._appJson = new JsonData<AppJson>(path.join(workspaceFolder.uri.fsPath, Constants.alProjectFileName), true);
    }

    async isActive(): Promise<boolean> 
    {
        return this._projectFile.exists();
    }

    async dispose(): Promise<void> {
        this._projectFile.dispose();    
        this._workspaceData.dispose();
        this._appJson.dispose();
    }

    public get projectFile()
    {
        return this._projectFile;
    }

    public get workspaceData()
    {
        return this._workspaceData;
    }

    public get appJson()
    {
        return this._appJson;
    }

}