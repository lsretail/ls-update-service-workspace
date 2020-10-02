import { Disposable, Event, EventEmitter, workspace, WorkspaceFolder, WorkspaceFoldersChangeEvent } from "vscode";
import { UiService } from "../../extensionController";
import { IWorkspaceService } from "../interfaces/IWorkspaceService";
import { Type, WorkspaceService } from "./workspaceService";

export class WorkspaceContainer<TService extends IWorkspaceService>
{
    private _workspaceService: WorkspaceService;
    private _type: Type<TService>;
    private _disposable: Disposable;
    private _subscriptionsByWorkspace: Map<string, Disposable[]> = new Map<string, Disposable[]>();

    private _onDidChangeWorkspaceFolders = new EventEmitter<WorkspaceContainerEvent<TService>>();

    constructor(workspaceService: WorkspaceService, type: Type<TService>)
    {
        this._workspaceService = workspaceService;
        this._type = type;
        let subscriptions: Disposable[] = [];
        workspaceService.onDidChangeWorkspaceFolders(this.onWorkspaceChanges, this, subscriptions);
        this._disposable = Disposable.from(...subscriptions);
    }

    private onWorkspaceChanges(workspaceChanges: WorkspaceFoldersChangeEvent)
    {
        let event = new WorkspaceContainerEvent(this, workspaceChanges, this._subscriptionsByWorkspace);
        
        this._onDidChangeWorkspaceFolders.fire(event);

        for (let workspaceFolder of workspaceChanges.removed)
        {
            let workspaceKey = WorkspaceService.getWorkspaceKey(workspaceFolder);
            if (this._subscriptionsByWorkspace.has(workspaceKey))
            {
                Disposable.from(this._subscriptionsByWorkspace[workspaceKey]).dispose();
                this._subscriptionsByWorkspace.delete(workspaceKey);
            }
        }
    }

    get onDidChangeWorkspaceFolders(): Event<WorkspaceContainerEvent<TService>>
    {
        return this._onDidChangeWorkspaceFolders.event;
    }

    dispose()
    {
        this._disposable?.dispose();
    }

    getService(workspaceFolder: WorkspaceFolder): TService
    {
        return this._workspaceService.getService(this._type, workspaceFolder);
    }

    anyActive(): Promise<boolean>
    {
        return this._workspaceService.anyActive(this._type);
    }

    anyInactive(): Promise<boolean>
    {
        return this._workspaceService.anyInactive(this._type);
    }

    getActiveServices(): Promise<TService[]>
    {
        return this._workspaceService.getActiveServices(this._type);
    }

    async getActiveWorkspaces(): Promise<WorkspaceFolder[]>
    {
        return this._workspaceService.getActiveWorkspaces(this._type);
    }

    async getInactiveWorkspaces(): Promise<WorkspaceFolder[]>
    {
        return this._workspaceService.getInactiveWorkspaces(this._type);
    }
}

export class WorkspaceContainerEvent<TService extends IWorkspaceService>
{
    public workspaceChanges: WorkspaceFoldersChangeEvent;
    public workspaceContainer: WorkspaceContainer<TService>;
    private _subscriptionsByWorkspace: Map<string, Disposable[]>;

    constructor(workspaceContainer: WorkspaceContainer<TService>, workspaceChanges: WorkspaceFoldersChangeEvent,subscriptionsByWorkspace: Map<string, Disposable[]>)
    {
        this._subscriptionsByWorkspace = subscriptionsByWorkspace;
        this.workspaceChanges = workspaceChanges;
        this.workspaceContainer = workspaceContainer;
    }

    pushSubscription(workspaceFolder: WorkspaceFolder, disposable: Disposable)
    {
        let workspaceKey = WorkspaceService.getWorkspaceKey(workspaceFolder);
        if (!this._subscriptionsByWorkspace.has(workspaceKey))
            this._subscriptionsByWorkspace[workspaceKey] = [];

        this._subscriptionsByWorkspace[workspaceKey].push(disposable);
    }
}