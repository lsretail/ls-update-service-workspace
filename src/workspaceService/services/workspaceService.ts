import { IWorkspaceService } from '../interfaces/IWorkspaceService'
import { Disposable, Event, EventEmitter, Uri, workspace, WorkspaceFolder, WorkspaceFoldersChangeEvent } from "vscode";
import { WorkspaceServiceProvider } from './workspaceServiceProvider';
import { WorkspaceFoldersExChangeEvent } from './workspaceFoldersExChangeEvent';
import { IWorkspaceEntry } from '../interfaces/IWorkspaceEntry';

export interface Type<T> extends Function { 
    new (...args: any[]): T; 
}

export class WorkspaceService
{
    private _activateServices: Map<string, (workspaceFolder: IWorkspaceEntry) => any> = new Map<string, (workspaceFolder: IWorkspaceEntry) => any>();
    private _isActiveServices: Map<string, (workspaceFolder: WorkspaceFolder) => Promise<boolean>> = new Map<string, (workspaceFolder: WorkspaceFolder) => Promise<boolean>>();

    private _workspaceServices: Map<string, Map<string, IWorkspaceService>> = new Map<string, Map<string, IWorkspaceService>>();

    private _workspaceFolders: Array<IWorkspaceEntry> = [];

    private _onDidChangeWorkspaceFolders = new EventEmitter<WorkspaceFoldersExChangeEvent>();
    private _disposables: Disposable[] = [];

    constructor()
    {
    }

    activate()
    {
        this.addWorkspaces(workspace.workspaceFolders);
        this._disposables.push(workspace.onDidChangeWorkspaceFolders(this.onWorkspaceChanges, this));
    }

    get onDidChangeWorkspaceFolders(): Event<WorkspaceFoldersExChangeEvent>
    {
        return this._onDidChangeWorkspaceFolders.event;
    }

    private onWorkspaceChanges(e: WorkspaceFoldersChangeEvent)
    {
        this.removeVirtualWorkspaces(e.added);

        for (let added of e.added)
        {
            this.addWorkspace(added, false);
        }

        for (let removed of e.removed)
        {
            this.removeWorkspace(removed);
        }

        let event: WorkspaceFoldersExChangeEvent = {
            added: e.added,
            removed: e.removed,
            virtual: false
        }

        this._onDidChangeWorkspaceFolders.fire(event);
    }

    dispose()
    {
        Disposable.from(...this._disposables).dispose
    }

    register<TService extends IWorkspaceService>(
        type: Type<TService>, 
        activate: (workspaceFolder: IWorkspaceEntry) => TService,
        isActive?: (workspaceFolder: WorkspaceFolder) => Promise<boolean>
    ): WorkspaceServiceProvider<TService>
    {
        this._activateServices.set(this.getTypeKey(type), activate);
        
        if (isActive)
            this._isActiveServices.set(this.getTypeKey(type), isActive);
        else
            this._isActiveServices.set(this.getTypeKey(type), () => Promise.resolve(true));
    
        return new WorkspaceServiceProvider<TService>(this, type);
    }

    getService<TService extends IWorkspaceService>(
        type: Type<TService>, 
        workspaceFolder: WorkspaceFolder
    ): TService
    {
        let workspaceKey = WorkspaceService.getWorkspaceKey(workspaceFolder);
        if (!this._workspaceServices.has(workspaceKey))
            this._workspaceServices.set(workspaceKey, new Map<string, any>());
        
        if (!this._workspaceServices.get(workspaceKey).has(this.getTypeKey(type)))
        {
            if (!this._activateServices.has(this.getTypeKey(type)))
                throw `No service registered for ${this.getTypeKey(type)}`;

            let workspaceEntry = this._workspaceFolders.filter(w => WorkspaceService.getWorkspaceKey(w.workspaceFolder) === workspaceKey)[0];

            if (!workspaceEntry)
                throw `Workspace not registered: ${workspaceKey}.`

            this._workspaceServices
                .get(workspaceKey)
                .set(
                    this.getTypeKey(type), 
                    this._activateServices.get(this.getTypeKey(type))(workspaceEntry)
                );
        }

        return <TService>this._workspaceServices.get(workspaceKey).get(this.getTypeKey(type));
    }

    async anyActive<TService extends IWorkspaceService>(type: Type<TService>): Promise<boolean>
    {
        for (let workspaceFolder of this._workspaceFolders)
        {
            let service = this.getService<TService>(type, workspaceFolder.workspaceFolder);
            if (await service.isActive())
                return true;
        }

        return false;
    }

    async anyInactive<TService extends IWorkspaceService>(type: Type<TService>): Promise<boolean>
    {
        for (let workspaceFolder of this._workspaceFolders)
        {
            let service = this.getService<TService>(type, workspaceFolder.workspaceFolder);
            if (!(await service.isActive()))
                return true;
        }

        return false;
    }

    /*async getActiveServices<TService extends IWorkspaceService>(type: Type<TService>): Promise<TService[]>
    {
        let services: TService[] = [];
        for(let workspaceFolder of this._workspaceFolders)
        {
            if (await this.getService(type, workspaceFolder.workspaceFolder).isActive())
                services.push(this.getService(type, workspaceFolder.workspaceFolder));
        }
        return services;
    }

    async getActiveWorkspaces<TService extends IWorkspaceService>(type: Type<TService>, filter?: (service: TService) => Promise<boolean>): Promise<WorkspaceFolder[]>
    {
        let workspaceFolders: WorkspaceFolder[] = [];
        for(let workspaceFolder of this._workspaceFolders)
        {
            let service = this.getService(type, workspaceFolder.workspaceFolder);
            if (service.isActive() && (!filter || filter && (await filter(service))))
                workspaceFolders.push(workspaceFolder.workspaceFolder);
        }
        return workspaceFolders;
    }

    async getInactiveWorkspaces<TService extends IWorkspaceService>(type: Type<TService>): Promise<WorkspaceFolder[]>
    {
        let workspaceFolders: WorkspaceFolder[] = [];
        for(let workspaceFolder of this._workspaceFolders)
        {
            if (!await this.getService(type, workspaceFolder.workspaceFolder).isActive())
                workspaceFolders.push(workspaceFolder.workspaceFolder);
        }
        return workspaceFolders;
    }*/

    public get workspaceEntries(): IWorkspaceEntry[]
    {
        return this._workspaceFolders;
    }

    async getWorkspaces<TService extends IWorkspaceService>(
        type: Type<TService>, 
        options: {
            serviceFilter?: (service: TService) => Promise<boolean>,
            workspaceFilter?: (workspace: IWorkspaceEntry) => Promise<boolean>
            active?: boolean
        }
    ): Promise<WorkspaceFolder[]>
    {
        if (!options.workspaceFilter)
            options.workspaceFilter = (workspace: IWorkspaceEntry) => Promise.resolve(true);

        if (!options.serviceFilter)
            options.serviceFilter = (service) => Promise.resolve(true);

        let workspaces: WorkspaceFolder[] = [];

        for(let workspaceFolder of this._workspaceFolders)
        {
            if (!(await options.workspaceFilter(workspaceFolder)))
                continue;

            if (!(await this.checkActive(options.active, type, workspaceFolder.workspaceFolder)))
                continue;

            let service = this.getService(type, workspaceFolder.workspaceFolder);
            if (await options.serviceFilter(service))
                workspaces.push(workspaceFolder.workspaceFolder);
        }
        return workspaces;
    }

    async getServices<TService extends IWorkspaceService>(
        type: Type<TService>, 
        options: {
            serviceFilter?: (service: TService) => Promise<boolean>,
            workspaceFilter?: (workspace: IWorkspaceEntry) => Promise<boolean>
            active?: boolean
        }
    ): Promise<TService[]>
    {
        if (!options.workspaceFilter)
            options.workspaceFilter = (workspace: IWorkspaceEntry) => Promise.resolve(true);

        if (!options.serviceFilter)
            options.serviceFilter = (service) => Promise.resolve(true);

        let services: TService[] = [];

        for(let workspaceFolder of this._workspaceFolders.filter(options.workspaceFilter))
        {
            if (!(await this.checkActive(options.active, type, workspaceFolder.workspaceFolder)))
                continue;

            let service = this.getService(type, workspaceFolder.workspaceFolder);
            if (options.serviceFilter(service))
            services.push(service);
        }
        return services;
    }

    private async checkActive<TService extends IWorkspaceService>(
        active: boolean | undefined, 
        type: Type<TService>, 
        workspaceFolder: WorkspaceFolder
    ): Promise<boolean>
    {
        if (active === undefined || active === null)
            return true;
        
        let isActiveAction = this._isActiveServices.get(this.getTypeKey(type));
        let isActive = await isActiveAction(workspaceFolder);
        if (isActive === false)
            return active == isActive;
        
        let service = this.getService(type, workspaceFolder);
        return active == await service.isActive();
    }

    public addWorkspaces(workspaceFolders: readonly WorkspaceFolder[])
    {
        this.removeVirtualWorkspaces(workspaceFolders);

        let newFolders = this.addWorkspacesCommon(workspaceFolders, false)

        if (newFolders.length === 0)
            return;
        
        let e: WorkspaceFoldersExChangeEvent = {
            added: newFolders,
            removed: [],
            virtual: false
        }

        this._onDidChangeWorkspaceFolders.fire(e);
    }

    private addWorkspacesCommon(workspaceFolders: readonly WorkspaceFolder[], virtual: boolean): WorkspaceFolder[]
    {
        if (!workspaceFolders || workspaceFolders.length === 0)
            return;

        let newWorkspaceFolders: WorkspaceFolder[] = [];

        for (let workspaceFolder of workspaceFolders)
        {
            if (this.addWorkspace(workspaceFolder, virtual))
                newWorkspaceFolders.push(workspaceFolder);
        }

        return newWorkspaceFolders;
    }

    public addVirtualWorkspaces(workspaceFolders: readonly WorkspaceFolder[])
    {
        let newFolders = this.addWorkspacesCommon(workspaceFolders, true);

        if (newFolders.length === 0)
            return;
        
        let e: WorkspaceFoldersExChangeEvent = {
            added: newFolders,
            removed: [],
            virtual: true
        }

        this._onDidChangeWorkspaceFolders.fire(e);
    }

    private addWorkspace(workspaceFolder: WorkspaceFolder, virtual: boolean): boolean
    {
        if (this._workspaceFolders.filter(w => w.workspaceFolder.uri.fsPath === workspaceFolder.uri.fsPath).length === 0)
        {
            this._workspaceFolders.push({
                virtual: virtual,
                workspaceFolder: workspaceFolder
            });
            return true
        }
        return false
    }

    private removeVirtualWorkspaces(workspaceFolders: readonly WorkspaceFolder[])
    {
        if (!workspaceFolders || workspaceFolders.length === 0)
            return;

        let removeWorkspaceFolders: WorkspaceFolder[] = [];
        for (let workspaceFolder of workspaceFolders)
        {
            let matching = this._workspaceFolders.filter(w => 
                w.virtual && 
                w.workspaceFolder.uri.fsPath !== workspaceFolder.uri.fsPath
            )[0];

            if (matching)
            {
                let idx = this._workspaceFolders.indexOf(matching)
                if (idx > -1)
                    this._workspaceFolders.splice(idx, 1);

                removeWorkspaceFolders.push(workspaceFolder);
            }
        }

        if (removeWorkspaceFolders.length === 0)
            return;

        let e: WorkspaceFoldersExChangeEvent = {
            added: [],
            removed: removeWorkspaceFolders,
            virtual: true
        }

        this._onDidChangeWorkspaceFolders.fire(e);
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

        let idx = this._workspaceFolders.findIndex(w => w.workspaceFolder.uri.fsPath === workspaceFolder.uri.fsPath);

        if (idx > 0)
            this._workspaceFolders.splice(idx, 1);
    }

    public static getWorkspaceKey(workspaceFolder: WorkspaceFolder)
    {
        return workspaceFolder.uri.fsPath;
    }

    private getTypeKey<TService>(type: Type<TService>): string
    {
        return type.name;
    }
}