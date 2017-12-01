'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import DeployController from './deployController'
import {Constants} from './constants'

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "go-current" is now active!');

    let deployService = new DeployController(context);
    deployService.activate();
    vscode.commands.executeCommand("setContext", Constants.goCurrentExtensionActive, true);
}

// this method is called when your extension is deactivated
export function deactivate() {
    vscode.commands.executeCommand("setContext", Constants.goCurrentExtensionActive, false);
    console.log("Deactivating...");
}