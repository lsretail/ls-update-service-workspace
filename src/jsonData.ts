
import {fsHelpers} from './fsHelpers'
import {Uri, workspace, FileSystemWatcher, EventEmitter, Disposable, RelativePattern, Event} from 'vscode';
import * as path from 'path'
import { watchFile, unwatchFile } from 'fs';

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
    private _watchChanges: boolean;

    constructor(fileUri: string | Uri, watchChanges: boolean = false, defaultData: TData = null)
    {
        let input = fileUri;
        if (typeof fileUri === 'string' || fileUri instanceof String)
            fileUri = Uri.file(fileUri.toString());

        if (fileUri.scheme !== 'file')
            throw 'Internal error: File system schema is only supported by this extension.'

        this._uri = fileUri;
        this._defaultData = defaultData;
        this._watchChanges = watchChanges;
        
        if (watchChanges)
        {
            watchFile(fileUri.fsPath, (curr, prev) => 
            {
                this.onChange(null);
            });
        }
    }

    public get onDidChange(): Event<JsonData<TData>>
    {
        return this._onDidChange.event;
    }

    private onChange(uri: Uri)
    {
        let exists = this.exists()
        if (this._saveCount > 0 && exists)
        {
            this._saveCount--;
            this._onDidChange.fire(this);
            return;
        }
        this._existsCache = exists;
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

    public exists(): boolean
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
        if (this._watchChanges)
        {
            unwatchFile(this.uri.fsPath);
        }
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