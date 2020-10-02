'use strict';

import * as vscode from 'vscode';
import Resources from './resources'
import {Constants} from './constants'
import * as util from 'util'

export class UiService
{
    context: vscode.ExtensionContext

    constructor(context: vscode.ExtensionContext)
    {
        this.context = context;
    }

    async activate(): Promise<void>
    {
    }

    async dispose(): Promise<void>
    {
        
    }

    registerCommand(command: string, callback: (...args: any[]) => any, thisArg?: any)
    {
        var disposable = vscode.commands.registerCommand(command, callback);
        this.context.subscriptions.push(disposable);
    }

    registerDisposable(object: any)
    {
        this.context.subscriptions.push(object);
    }
}