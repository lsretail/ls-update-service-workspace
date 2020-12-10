'use strict';

import * as vscode from 'vscode';
import Resources from './resources'
import {Constants} from './constants'
import * as util from 'util'
import { UiHelpers } from './helpers/uiHelpers';
import { Logger } from './interfaces/logger';

export class UiService
{
    context: vscode.ExtensionContext
    _logger: Logger;

    constructor(context: vscode.ExtensionContext, logger: Logger)
    {
        this.context = context;
        this._logger = logger;
    }

    async activate(): Promise<void>
    {
    }

    async dispose(): Promise<void>
    {
        
    }

    registerCommand(command: string, callback: (...args: any[]) => any, thisArg?: any)
    {
        var disposable = vscode.commands.registerCommand(command, async (...args) => {
            this._logger.debug(`Calling ${command}`);
            await UiHelpers.errorWrapper(callback, args, this);
        }, this);
        this.context.subscriptions.push(disposable);
    }

    registerDisposable(object: any)
    {
        this.context.subscriptions.push(object);
    }
}