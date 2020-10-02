"use strict"

import {InputBoxOptions, QuickPickItem, QuickPickOptions, WorkspaceFolder,
    WorkspaceFoldersChangeEvent, commands, window, Disposable, 
    Uri, workspace} from 'vscode';
import * as vscode from 'vscode'
import {QuickPickItemPayload} from './interfaces/quickPickItemPayload'
import {UiService} from './extensionController'
import {PowerShell, PowerShellError} from './PowerShell'
import {DeployPsService} from './deployService/services/deployPsService'
import {ProjectFile, PackageGroup, Package} from './models/projectFile'
import {Constants} from './constants'
import {JsonData} from './jsonData'
import {Deployment} from './models/deployment'
import {WorkspaceData} from './models/workspaceData'
import {DataHelpers} from './dataHelpers'
import {DeployService} from './deployService/services/deployService'

import {fsHelpers} from './fsHelpers'
import * as path from 'path'
import { UpdateAvailable } from './models/updateAvailable';
import { PostDeployController } from './postDeployController';
import { PackageInfo } from './interfaces/packageInfo';
import { AlService } from './alService/services/alService';
import GitHelpers from './helpers/gitHelpers';
import { AlPsService } from './alService/services/alPsService';
import { AppError } from './errors/AppError';
import { PackageService } from './packageService/services/packageService';
import { PackagePsService } from './packageService/services/packagePsService';
import Resources from './resources';
import { AlExtensionService } from './packageService/services/alExtensionService';
import { NewProjectService } from './newProjectService/services/newProjectService';
import { AppJson } from './newProjectService/interfaces/appJson';
import { constants } from 'buffer';
import { WorkspaceHelpers } from './helpers/workspaceHelpers';
import * as util from 'util'
import { ProjectFileHelpers } from './helpers/projectFileHelpers';
import { ProduceBug } from './generate';

export default class Controller extends UiService
{
    private _powerShell: PowerShell;
    private _deployPsService: DeployPsService;
    private _alPsService: AlPsService;
    private _alExtensionService: AlExtensionService;
    private _packagePsService: PackagePsService;

    private _debug: boolean = false;

    private _deployServices: Map<string, DeployService> =  new Map<string, DeployService>();
    private _postDeployControllers: Map<string, PostDeployController> =  new Map<string, PostDeployController>();

    private _alServices: Map<string, AlService> = new Map<string, AlService>();

    private _packageServices: Map<string, PackageService> = new Map<string, PackageService>();

    private _goCurrentInstalled: boolean;
    private _updatesAvailable: Map<string, Array<UpdateAvailable>> = new Map<string, Array<UpdateAvailable>>();
    private _outputChannel: vscode.OutputChannel = null;

    public async activate()
    {
        let config = vscode.workspace.getConfiguration('go-current-workspace')
        if (config.has('debug'))
        {
            this._debug = config.get('debug');
        }

        process.on('unhandledRejection', (reason) => {
            Controller.handleError(reason)
        });
    }


    public static handleError(reason: any)
    {
        console.log('Reason:');
        console.log(reason);
        if (reason instanceof PowerShellError && reason.fromJson && 
            (reason.type === 'GoCurrent' || reason.type === 'User'))
        {
            console.log(reason.scriptStackTrace);
            window.showErrorMessage(reason.message);
            return true;
        }
        else if (reason instanceof PowerShellError && reason.fromJson)
        {
            window.showErrorMessage(reason.message);
            console.log(reason.scriptStackTrace);
            return false;
        }
        else if (reason instanceof AppError)
        {
            window.showErrorMessage(reason.message);
            return true;
        }
    }

    public static getErrorMessage(reason: any): string
    {
        if (reason instanceof PowerShellError && reason.fromJson && 
            (reason.type === 'GoCurrent' || reason.type === 'User'))
        {
            return reason.message
        }
        else if (reason instanceof PowerShellError && reason.fromJson)
        {
            return reason.message
        }
        else if (reason instanceof AppError)
        {
            return reason.message
        }
        return "Error";
    }

    private static getWorkspaceKey(workspaceFolder: WorkspaceFolder)
    {
        return workspaceFolder.uri.path;
    }

    private async getArguments(workspaceFolder: WorkspaceFolder, deployService: DeployService, name: string) : Promise<Uri>
    {
        // Deprecated
        // Keeping this for now, to showcase the text document functionality...
        let packagesArguments = null;//await deployService.getArguments(name);
        if (Object.keys(packagesArguments).length === 0)
            return null;
        let filePath = Uri.file(path.join(
            workspaceFolder.uri.fsPath,
            Constants.goCurrentWorkspaceDirName, 
            Constants.argumentsFilename
        ));
        await fsHelpers.writeJson(filePath.fsPath, packagesArguments);
        let document = await workspace.openTextDocument(filePath)
        let currentDocument = undefined;
        if (window.activeTextEditor)
        {
            currentDocument = window.activeTextEditor.document;
        }

        let editor = await window.showTextDocument(document);

        let buttons: string[] = [Constants.buttonContinue, Constants.buttonCancel];
        let result = await window.showInformationMessage("Arguments required, please fill the json document.", ...buttons);

        await editor.document.save();

        if (result !== Constants.buttonContinue)
        {
            editor.hide();
            if (currentDocument)
                window.showTextDocument(currentDocument);
            
            fsHelpers.unlink(filePath.fsPath);
            return undefined;
        }
        let p = fsHelpers.readJson<any>(filePath.fsPath);

        editor.hide();
        if (currentDocument)
            window.showTextDocument(currentDocument);

        return filePath;
    }


    

    

    delay(ms: number): Promise<void>
    {
        return new Promise( resolve => setTimeout(resolve, ms) );
    }

    
}