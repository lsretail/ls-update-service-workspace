
import {fsHelpers} from './fsHelpers'
import {Uri, workspace, FileSystemWatcher, EventEmitter, Disposable, RelativePattern, Event} from 'vscode';
import * as path from 'path'

export class JsonData<TData>
{
    private _uri: Uri;
    private _saveCount: number = 0;
    private _dataCache: TData;
    private _defaultData: TData;
    private _watcher: FileSystemWatcher;
    private _disposable: Disposable;
    private _onDidChange = new EventEmitter<JsonData<TData>>();
    private _existsCache: boolean;

    constructor(fileUri: string | Uri, watchChanges: boolean = false, defaultData: TData = null)
    {
        let input = fileUri;
        if (typeof fileUri === 'string' || fileUri instanceof String)
            fileUri = Uri.file(fileUri.toString());

        if (fileUri.scheme !== 'file')
            throw 'Internal error: File system schema is only supported by this extension.'

        this._uri = fileUri;
        this._defaultData = defaultData;
        
        if (watchChanges)
        {
            let workspaceDir = workspace.getWorkspaceFolder(fileUri)
            if (!workspaceDir)
                throw "Internal error: Only files in workspace can be watched.";
            let relativeFilePath = fileUri.fsPath.replace(workspaceDir.uri.fsPath, "");
            if (relativeFilePath.startsWith("\\") || relativeFilePath.startsWith("/"))
                relativeFilePath = relativeFilePath.substr(1, relativeFilePath.length - 1);
            this._watcher = workspace.createFileSystemWatcher(
                new RelativePattern(workspaceDir, relativeFilePath),
                false,
                false,
                false
            );

            let subscriptions: Disposable[] = [];
            this._watcher.onDidCreate(this.onCreated, this, subscriptions)
            this._watcher.onDidChange(this.onChange, this, subscriptions);
            this._watcher.onDidDelete(this.onDelete, this, subscriptions)
            this._disposable = Disposable.from(...subscriptions);
        }
    }

    public get onDidChange(): Event<JsonData<TData>>
    {
        return this._onDidChange.event;
    }

    private onCreated(uri: Uri)
    {
        if (this._saveCount > 0)
        {
            this._saveCount--;
            this._onDidChange.fire(this);
            return;
        }
        this._existsCache = true;
        this._dataCache = null;
        this._onDidChange.fire(this);
    }

    private onChange(uri: Uri)
    {
        if (this._saveCount > 0)
        {
            this._saveCount--;
            this._onDidChange.fire(this);
            return;
        }
        this._existsCache = true;
        this._dataCache = null;
        this._onDidChange.fire(this);
    }

    private onDelete(uri: Uri)
    {
        this._existsCache = false;
        this._dataCache = null;
        this._onDidChange.fire(this);
    }

    public get uri(): Uri
    {
       return this._uri; 
    }

    public getData(): Thenable<TData>
    {
        if (!this._dataCache)
        {
            if (!fsHelpers.existsSync(this._uri.fsPath))
            {
                this._dataCache = this._defaultData;
            }
            else
            {
                return fsHelpers.readJson<TData>(this._uri.fsPath).then(data => 
                {
                    return this._dataCache = data;
                });
            }
        }
        return Promise.resolve(this._dataCache);
    }

    public exists(): Boolean
    {
        if (this._watcher)
        {
            if (this._existsCache == null)
                this._existsCache = fsHelpers.existsSync(this._uri.fsPath);
            return this._existsCache;
        }
        else
        {
            return fsHelpers.existsSync(this._uri.fsPath);
        }
    }

    public save(): Promise<void>
    {
        if (this._dataCache)
        {
            this._saveCount++;
            return fsHelpers.writeJson(this._uri.fsPath, this._dataCache);
        }
    }

    public dispose()
    {
        if (this._watcher)
        {
            this._watcher.dispose();
        }
        if (this._disposable)
        {
            this._disposable.dispose();
        }
    }
}