import { IWorkspaceService } from '../interfaces/IWorkspaceService'
import { Disposable, Event, EventEmitter, Uri, workspace, WorkspaceFolder, WorkspaceFoldersChangeEvent } from "vscode";
import { WorkspaceContainer } from './workspaceContainer';
import { AlPsService } from '../../alService/services/alPsService';
import { AlService } from '../../alService/services/alService';

export interface Type<T> extends Function { 
    new (...args: any[]): T; 
}

export class WorkspaceService
{
    private _services: Map<string, (workspaceFolder: WorkspaceFolder) => any> = new Map<string, (workspaceFolder: WorkspaceFolder) => any>();

    private _workspaceServices: Map<string, Map<string, IWorkspaceService>> = new Map<string, Map<string, IWorkspaceService>>();

    private _workspaceFolders: Array<WorkspaceFolder> = [];

    private _onDidChangeWorkspaceFolders = new EventEmitter<WorkspaceFoldersChangeEvent>();
    private _disposables: Disposable[] = [];

    constructor()
    {
    }

    activate()
    {
        this.addWorkspaces(workspace.workspaceFolders);
        this._disposables.push(workspace.onDidChangeWorkspaceFolders(this.onWorkspaceChanges, this));
    }

    get onDidChangeWorkspaceFolders(): Event<WorkspaceFoldersChangeEvent>
    {
        return this._onDidChangeWorkspaceFolders.event;
    }

    private onWorkspaceChanges(e: WorkspaceFoldersChangeEvent)
    {
        for (let added of e.added)
        {
            this.addWorkspace(added);
        }

        for (let removed of e.removed)
        {
            this.removeWorkspace(removed);
        }

        this._onDidChangeWorkspaceFolders.fire(e);
    }

    dispose()
    {
        Disposable.from(...this._disposables).dispose
    }

    register<TService extends IWorkspaceService>(type: Type<TService>, registration: (workspaceFolder: WorkspaceFolder) => TService): WorkspaceContainer<TService>
    {
        this._services.set(this.getTypeKey(type), registration);
    
        return new WorkspaceContainer<TService>(this, type);
    }

    getService<TService extends IWorkspaceService>(type: Type<TService>, workspaceFolder: WorkspaceFolder): TService
    {
        let workspaceKey = WorkspaceService.getWorkspaceKey(workspaceFolder);
        if (!this._workspaceServices.has(workspaceKey))
            this._workspaceServices.set(workspaceKey, new Map<string, any>());
        
        if (!this._workspaceServices.get(workspaceKey).has(this.getTypeKey(type)))
        {
            if (!this._services.has(this.getTypeKey(type)))
                throw `No service registered for ${this.getTypeKey(type)}`;

            this._workspaceServices.get(workspaceKey).set(this.getTypeKey(type), this._services.get(this.getTypeKey(type))(workspaceFolder));
        }

        return <TService>this._workspaceServices.get(workspaceKey).get(this.getTypeKey(type));
    }

    async anyActive<TService extends IWorkspaceService>(type: Type<TService>): Promise<boolean>
    {
        for (let workspaceFolder of this._workspaceFolders)
        {
            let service = this.getService<TService>(type, workspaceFolder);
            if (await service.isActive())
                return true;
        }

        return false;
    }

    async anyInactive<TService extends IWorkspaceService>(type: Type<TService>): Promise<boolean>
    {
        for (let workspaceFolder of this._workspaceFolders)
        {
            let service = this.getService<TService>(type, workspaceFolder);
            if (!(await service.isActive()))
                return true;
        }

        return false;
    }

    async getActiveServices<TService extends IWorkspaceService>(type: Type<TService>): Promise<TService[]>
    {
        let services: TService[] = [];
        for(let workspaceFolder of this._workspaceFolders)
        {
            if (await this.getService(type, workspaceFolder).isActive())
                services.push(this.getService(type, workspaceFolder));
        }
        return services;
    }

    async getActiveWorkspaces<TService extends IWorkspaceService>(type: Type<TService>): Promise<WorkspaceFolder[]>
    {
        let workspaceFolders: WorkspaceFolder[] = [];
        for(let workspaceFolder of this._workspaceFolders)
        {
            if (await this.getService(type, workspaceFolder).isActive())
                workspaceFolders.push(workspaceFolder);
        }
        return workspaceFolders;
    }

    async getInactiveWorkspaces<TService extends IWorkspaceService>(type: Type<TService>): Promise<WorkspaceFolder[]>
    {
        let workspaceFolders: WorkspaceFolder[] = [];
        for(let workspaceFolder of this._workspaceFolders)
        {
            if (!await this.getService(type, workspaceFolder).isActive())
                workspaceFolders.push(workspaceFolder);
        }
        return workspaceFolders;
    }

    private addWorkspaces(workspaceFolders: readonly WorkspaceFolder[])
    {
        if (!workspaceFolders)
            return;

        for (let workspaceFolder of workspaceFolders)
        {
            this.addWorkspace(workspaceFolder);
        }

        let e: WorkspaceFoldersChangeEvent = {
            added: workspaceFolders,
            removed: []
        }

        this._onDidChangeWorkspaceFolders.fire(e);
    }

    private addWorkspace(workspaceFolder: WorkspaceFolder)
    {
        if (this._workspaceFolders.filter(w => w.uri.fsPath !== workspaceFolder.uri.fsPath))
            this._workspaceFolders.push(workspaceFolder);

        /*if (this._deployServices[Controller.getWorkspaceKey(workspaceFolder)])
            return;

        this.debugLog(`Adding workspace ${workspaceFolder.uri.fsPath}.`)
        
        
        // Deploy Service
        let deployService = new DeployService(
            projectFile,
            new JsonData<WorkspaceData>(path.join(workspaceFolder.uri.fsPath, Constants.goCurrentWorkspaceDirName+"\\"+Constants.projectDataFileName), true, new WorkspaceData()),
            this._deployPsService,
            workspaceFolder.uri.fsPath
        );
        deployService.onDidProjectFileChange(this.onProjecFileChange, this);
        this._deployServices[Controller.getWorkspaceKey(workspaceFolder)] = deployService;

        // PostDeployService
        let postDeployController = new PostDeployController(workspaceFolder);
        deployService.onDidPackagesDeployed(postDeployController.onPackagesDeployed, postDeployController);
        deployService.onDidInstanceRemoved(postDeployController.onInstanceRemoved, postDeployController);
        deployService.onDidInstanceRemoved(this.onDeploymentRemoved, this);

        this._postDeployControllers[Controller.getWorkspaceKey(workspaceFolder)] = postDeployController;

        // AL Service
        this._alServices[Controller.getWorkspaceKey(workspaceFolder)] = new AlService(
            deployService,
            this.getAlPsService(),
            workspaceFolder
        );

        // Package Service
        this._packageServices[Controller.getWorkspaceKey(workspaceFolder)] = new PackageService(
            this.getPackagePsService(),
            this.getAlExtensionService(),
            projectFile
        );*/
    }

    private async removeWorkspace(workspaceFolder: WorkspaceFolder)
    {
        let workspaceKey = WorkspaceService.getWorkspaceKey(workspaceFolder);

        if (!this._workspaceServices.has(workspaceKey))
            return;

        let services = this._workspaceServices.get(workspaceKey);

        for (let [, service] of services)
        {
            await service.dispose();
        }
        services.clear()

        let idx = this._workspaceFolders.findIndex(w => w.uri.fsPath === workspaceFolder.uri.fsPath);

        if (idx > 0)
            this._workspaceFolders.splice(idx, 1);
    }

    public static getWorkspaceKey(workspaceFolder: WorkspaceFolder)
    {
        return workspaceFolder.uri.path;
    }

    private getTypeKey<TService>(type: Type<TService>): string
    {
        return type.name;
    }
}