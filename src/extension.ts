'use strict';
import * as vscode from 'vscode';
import Controller from './controller'
import {Constants} from './constants'

export function activate(context: vscode.ExtensionContext)
{
    console.log('Activating Go Current Workspace!');

    let deployController = new Controller(context);
    deployController.activate();
}

export function deactivate() {
    vscode.commands.executeCommand("setContext", Constants.goCurrentExtensionActive, false);
    vscode.commands.executeCommand("setContext", Constants.goCurrentAlActive, false);
    console.log("Deactivating Go Current Workspace...");
}