'use strict';

import * as vscode from 'vscode';
import Resources from './resources'
import {Constants} from './constants'
import * as util from 'util'

export class ExtensionController
{
    context: vscode.ExtensionContext

    constructor(context: vscode.ExtensionContext)
    {
        this.context = context;
    }

    activate()
    {

    }

    registerFolderCommand(command: string, callback: (...args: any[]) => any, thisArg?: any)
    {
        var disposable = vscode.commands.registerCommand(command, (...args) => {
            if (vscode.workspace.workspaceFolders.length === 0)
            {
                return this.showNoRootPathWarning();
            }
            callback(...args);
        });
        this.context.subscriptions.push(disposable);
    }

    registerCommand(command: string, callback: (...args: any[]) => any, thisArg?: any)
    {
        console.log(command);
        var disposable = vscode.commands.registerCommand(command, callback);
        this.context.subscriptions.push(disposable);
    }

    registerDisposable(object: any)
    {
        this.context.subscriptions.push(object);
    }

    showNoRootPathWarning()
    {
        vscode.window.showWarningMessage(util.format(Resources.noFolder, Constants.extensionName), Resources.openFolderAction).then(choice => {
            if (choice === Resources.openFolderAction)
            {
                vscode.commands.executeCommand("vscode.openFolder");
            }
        });
    }
}