'use strict';
import * as vscode from 'vscode';
import DeployController from './deployController'
import {Constants} from './constants'

export function activate(context: vscode.ExtensionContext)
{
    console.log('Activating Go Current Workspace!');

    let deployController = new DeployController(context);
    deployController.activate();
    vscode.commands.executeCommand("setContext", Constants.goCurrentExtensionActive, true);
}

export function deactivate() {
    vscode.commands.executeCommand("setContext", Constants.goCurrentExtensionActive, false);
    console.log("Deactivating...");
}