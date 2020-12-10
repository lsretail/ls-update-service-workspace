import path = require('path');
import { config } from 'process';
import { pathToFileURL } from 'url';
import * as vscode from 'vscode';
import { Disposable } from "vscode";
import { Constants } from '../constants';
import { Logger } from '../interfaces/logger';
import { PackageInfo } from '../interfaces/packageInfo';
import { PostDeployController } from '../postDeployController';
import { IWorkspaceEntry } from '../workspaceService/interfaces/IWorkspaceEntry';
import { WorkspaceFoldersExChangeEvent } from '../workspaceService/services/workspaceFoldersExChangeEvent';
import { WorkspaceService } from "../workspaceService/services/workspaceService";


export class VirtualWorkspaces
{
    private _disposables: Disposable[] = [];
    private _logger: Logger;
    private _workspaceService: WorkspaceService;

    private _workspaceMapLinkTo: Map<string, vscode.WorkspaceFolder[]> = new Map<string, vscode.WorkspaceFolder[]>();
    private _workspaceMapLinkFrom: Map<string, vscode.WorkspaceFolder[]> = new Map<string, vscode.WorkspaceFolder[]>();

    constructor(logger: Logger, workspaceService: WorkspaceService)
    {
        this._logger = logger;
        this._workspaceService = workspaceService;
        workspaceService.onDidChangeWorkspaceFolders(this.workspaceFolderChangedLister, this, this._disposables);
    }

    public activate()
    {

    }

    private workspaceFolderChangedLister(e: WorkspaceFoldersExChangeEvent)
    {
        if (e.virtual)
            return;

        let addWorkspaces: vscode.WorkspaceFolder[] = []
        
        for (let workspaceFolder of this._workspaceService.workspaceEntries.filter(w => !w.virtual).map(w => w.workspaceFolder))
        {
            let workspaceConfig = vscode.workspace.getConfiguration(Constants.configurationSectionId, workspaceFolder)
            
            let workspaces: string[] = workspaceConfig.get(Constants.configurationdDevWorkspaces);
            for (let dir of workspaces)
            {
                dir = path.resolve(workspaceFolder.uri.fsPath, dir);

                let newWorkspaceFolder = {
                    index: 100,
                    name: path.basename(dir),
                    uri: vscode.Uri.file(dir)
                };

                addWorkspaces.push(newWorkspaceFolder);

                let keyTo = WorkspaceService.getWorkspaceKey(newWorkspaceFolder);
                let keyFrom = WorkspaceService.getWorkspaceKey(workspaceFolder);

                if (!this._workspaceMapLinkTo.has(keyTo))
                    this._workspaceMapLinkTo.set(keyTo, []);
                    
                if (!this._workspaceMapLinkFrom.has(keyTo))
                    this._workspaceMapLinkFrom.set(keyFrom, []);

                this._workspaceMapLinkTo.get(keyTo).push(workspaceFolder);
                this._workspaceMapLinkFrom.get(keyFrom).push(newWorkspaceFolder);

                this._logger.info(`Loading deployment workspace: ${dir}`);
            }
        }

        this._workspaceService.addVirtualWorkspaces(addWorkspaces);

        // TODO, handle removed workspaces
        
    }

    removeFromLaunchJson(workspaceFolder: vscode.WorkspaceFolder, instanceNames: string[])
    {
        let toUpdate = this.getWorkspacesLinkedTo(workspaceFolder);
        for (let entry of toUpdate)
        {
            //PostDeployController.removeNonExisting(instanceNames, entry)
            PostDeployController.removeAlLaunchConfig(instanceNames[0], entry)
        }
    }

    public updateLaunchJson(workspaceFolder: vscode.WorkspaceFolder, packageInfos: PackageInfo[])
    {
        let bcServerPackage = packageInfos.filter(p => p.Id === 'bc-server');

        if (bcServerPackage.length === 0)
            return;

        let toUpdate = this.getWorkspacesLinkedTo(workspaceFolder);
        for (let entry of toUpdate)
        {
            PostDeployController.addAlLaunchConfig(bcServerPackage, entry);
        }
    }

    public getWorkspacesLinkedTo(workspaceFolder: vscode.WorkspaceFolder): vscode.WorkspaceFolder[]
    {
        let key = WorkspaceService.getWorkspaceKey(workspaceFolder);
        if (this._workspaceMapLinkTo.has(key))
            return this._workspaceMapLinkTo.get(key);

        return [];
    }

    public getWorkspacesLinkedFrom(workspaceFolder: vscode.WorkspaceFolder): vscode.WorkspaceFolder[]
    {
        let key = WorkspaceService.getWorkspaceKey(workspaceFolder);
        if (this._workspaceMapLinkFrom.has(key))
            return this._workspaceMapLinkFrom.get(key);

        return [];
    }

    dispose()
    {
        Disposable.from(...this._disposables).dispose
    }
}