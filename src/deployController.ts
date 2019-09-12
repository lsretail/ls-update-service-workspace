"use strict"

import {InputBoxOptions, QuickPickItem, QuickPickOptions, MessageOptions, WorkspaceFolder,
    WorkspaceFolderPickOptions, WorkspaceFoldersChangeEvent, commands, window, Disposable, 
    Uri, workspace} from 'vscode';
import * as vscode from 'vscode'
import {QuickPickItemPayload} from './interfaces/quickPickItemPayload'
import {ExtensionController} from './extensionController'
import {PowerShell, PowerShellError} from './PowerShell'
import {GoCurrent} from './GoCurrent'
import {ProjectFile, PackageGroup} from './models/projectFile'
import {Constants} from './constants'
import {JsonData} from './jsonData'
import {Deployment} from './models/deployment'
import {WorkspaceData} from './models/workspaceData'
import {DataHelpers} from './dataHelpers'
import {DeployService} from './deployService'

import {fsHelpers} from './fsHelpers'
import * as path from 'path'
import { removeAllListeners, worker } from 'cluster';
import { constants } from 'os';
import { UpdateAvailable } from './models/updateAvailable';
import { resolve } from 'path';
import { setTimeout } from 'timers';
import { PostDeployController } from './postDeployController';

export default class DeployController extends ExtensionController
{
    private _goCurrent: GoCurrent
    private _deployServices: Map<string, DeployService> =  new Map<string, DeployService>();
    private _postDeployControllers: Map<string, PostDeployController> =  new Map<string, PostDeployController>();
    private _goCurrentInstalled: boolean;
    private _disposables: Disposable[];
    private _updatesAvailable: Map<string, Array<UpdateAvailable>> = new Map<string, Array<UpdateAvailable>>();

    public activate()
    {
        let debug = true;
        this._goCurrent = new GoCurrent(new PowerShell(debug), this.context.asAbsolutePath("PowerShell\\GoCurrent.psm1"));

        commands.executeCommand("setContext", Constants.goCurrentDebug, debug);
        this.registerFolderCommand("go-current.activate", () => {window.showInformationMessage("Go Current Activated")});
        this.registerFolderCommand("go-current.deploy", () => this.deploy());
        this.registerFolderCommand("go-current.checkForUpdates", () => this.checkForUpdates());
        this.registerFolderCommand("go-current.update", () => this.update());
        this.registerFolderCommand("go-current.remove", () => this.remove());
        this.registerFolderCommand("go-current.experimental", () => this.experimental());
        process.on('unhandledRejection', (reason) => {
            DeployController.handleError(reason)
        });

        this._goCurrent.testGoCurrentInstalled().then(result => 
        {
            this._goCurrentInstalled = result;
            if (!result)
            {
                window.showWarningMessage("Go Current is not installed, extension will not load.");
                commands.executeCommand("setContext", Constants.goCurrentExtensionActive, false);
                return;
            }
            this.addWorkspaces();
            workspace.onDidChangeWorkspaceFolders(this.onWorkspaceChanges, this);
            this.checkForBaseUpdate();
            this.checkForUpdates();
        });
    }

    private async checkForBaseUpdate()
    {
        let buttons: string[] = [Constants.buttonUpdate, Constants.buttonLater];
        var packages = await this._goCurrent.getAvailableBaseUpdates();
        if (packages.length === 0)
            return;
        let packagesString = packages.map(p => `${p.Id} v${p.Version}`).join(', ');
        let result = await window.showInformationMessage(`Update available for "Go Current" (${packagesString})`, ...buttons);
        if (result === Constants.buttonUpdate)
        {
            let packages = await this._goCurrent.installBasePackages();
            window.showInformationMessage("Updated: " + packages.map(p => `${p.Id} v${p.Version}`).join(', '));
            let workspaceExtension = packages.filter(p => p.Id === 'go-current-workspace');
            if (workspaceExtension.length === 1)
            {
                PostDeployController.processVsExtension(workspaceExtension[0]);
            }
        }
    }

    private static handleError(reason: any)
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
    }

    private static getWorkspaceKey(workspaceFolder: WorkspaceFolder)
    {
        return workspaceFolder.uri.path;
    }

    private onWorkspaceChanges(e: WorkspaceFoldersChangeEvent)
    {
        for (let added of e.added)
        {
            this.addWorkspace(added);
        }
        if (e.added.length > 0)
            this.checkForUpdates();

        for (let removed of e.removed)
        {
            this.removeWorkspace(removed);
        }
        commands.executeCommand("setContext", Constants.goCurrentDeployActive, this.isActive());
    }

    private onProjecFileChange(deployService: DeployService)
    {
        this.checkForUpdates();
    }

    private addWorkspaces()
    {
        if (!workspace.workspaceFolders)
            return;
        let active: Boolean = false;
        for (let workspaceFolder of workspace.workspaceFolders)
        {
            this.addWorkspace(workspaceFolder);
        }
        commands.executeCommand("setContext", Constants.goCurrentDeployActive, this.isActive());
    }

    private addWorkspace(workspaceFolder: WorkspaceFolder)
    {
        if (this._deployServices[workspaceFolder.uri.path])
            return;
        let deployService = new DeployService(
            new JsonData<ProjectFile>(path.join(workspaceFolder.uri.fsPath, Constants.deploymentsFileName), true, new ProjectFile()),
            new JsonData<WorkspaceData>(path.join(workspaceFolder.uri.fsPath, Constants.goCurrentWorkspaceDirName+"\\"+Constants.projectDataFileName), true, new WorkspaceData()),
            this._goCurrent
        );
        deployService.onDidProjectFileChange(this.onProjecFileChange, this);
        this._deployServices[DeployController.getWorkspaceKey(workspaceFolder)] = deployService;

        let postDeployController = new PostDeployController(workspaceFolder);
        deployService.onDidPackagesDeployed(postDeployController.onPackagesDeployed, postDeployController);
        deployService.onDidInstanceRemoved(postDeployController.onInstanceRemoved, postDeployController);
        this._postDeployControllers[DeployController.getWorkspaceKey(workspaceFolder)] = postDeployController;
    }

    private removeWorkspace(workspaceFolder: WorkspaceFolder)
    {
        let workspaceId = workspaceFolder.uri.path;
        if (this._deployServices[workspaceId])
        {
            this._deployServices[workspaceId].dispose();
            this._deployServices.delete(workspaceId);
        }
        if (this._updatesAvailable[workspaceId])
        {
            this._updatesAvailable.delete(workspaceId);
        }
    }

    private isActive() : Boolean
    {
        if (!this._goCurrentInstalled)
            return false;
        for (let workspaceKey in this._deployServices)
        {
            let active = this._deployServices[workspaceKey].isActive()
            if (active)
                return true;
        }
        return false;
    }

    private showWorkspaceFolderPick(workspaceFolders: WorkspaceFolder[] = null) : Thenable<WorkspaceFolder>
    {
        let picks: QuickPickItem[] = [];
        if (!workspaceFolders)
            workspaceFolders = workspace.workspaceFolders;
        for (let workspaceFolder of workspaceFolders)
        {
            if (this._deployServices[workspaceFolder.uri.path] && this._deployServices[workspaceFolder.uri.path].isActive())
                picks.push({"label": workspaceFolder.name, "description": workspaceFolder.uri.fsPath});
        }

        if (picks.length === 0)
        {
            return Promise.reject(null)
        }
        else if (picks.length === 1)
        {
            let workspaceFolder = DataHelpers.getEntryByProperty<WorkspaceFolder>(workspace.workspaceFolders, "name", picks[0].label);
            return Promise.resolve(workspaceFolder);
        }
        return new Promise<WorkspaceFolder>((resolve, reject) => {
            let options: QuickPickOptions = {"placeHolder": "Select workspace folder"};
            options.placeHolder = "Select deployment set"
            window.showQuickPick(picks, options).then(pick =>
            {
                if (!pick)
                    reject(null);
                else
                    resolve(DataHelpers.getEntryByProperty<WorkspaceFolder>(workspace.workspaceFolders, "name", pick.label));
            }, rejected => 
            {
                reject(rejected);
            });
        });
    }

    private anyUpdatesPending() : boolean
    {
        for (let workspaceId in this._updatesAvailable)
        {
            if (this._updatesAvailable[workspaceId].length > 0)
                return true;
        }
        return false;
    }

    private async deploy()
    {
        let workspaceFolder = await this.showWorkspaceFolderPick();
        this.showDeployWithService(this._deployServices[workspaceFolder.uri.path], workspaceFolder);
    }

    private async showDeployWithService(deployService: DeployService, workspaceFolder: WorkspaceFolder)
    {
        let packageGroups = await deployService.getPackageGroups();
        let picks: QuickPickItemPayload<PackageGroup>[] = [];
        for (let entry of packageGroups)
        {
            if (await deployService.canInstall(entry.name))
                picks.push({
                    "label": entry.name, 
                    "description": entry.description, 
                    "detail": entry.packages.map(p => `${p.id} v${p.version}`).join(', '),
                    "payload": entry
                });
        }

        var options: QuickPickOptions = {};
        options.placeHolder = "Select a package group"
        let selectedSet = await window.showQuickPick(picks, options);
        if (!selectedSet)
            return;

        let instanceName = "";
        if (await deployService.isInstance(selectedSet.payload.name))
        {
            instanceName = await this.getOrShowInstanceNamePick(workspaceFolder.name);
        }
        let argumentsObj = await this.getArguments(workspaceFolder, deployService, selectedSet.payload.name);
        if (argumentsObj === undefined)
            return;

        try
        {
            let deployment = await deployService.deployPackageGroup(
                selectedSet.payload,
                instanceName,
                undefined,
                argumentsObj
            );
            window.showInformationMessage(`Package group "${deployment.name}" installed: ` + deployment.lastUpdated.map(p => `${p.id} v${p.version}`).join(', '))
        }
        catch (e)
        { 
            if (!DeployController.handleError(e))
                window.showErrorMessage("Error occurred while installing packages.");
        };
    }

    private async getOrShowInstanceNamePick(suggestedName: string) : Promise<string>
    {
        suggestedName = suggestedName.replace(" ", "-").replace(".","-");
        let instanceName = "";
        let suggestedInstanceName = await this.getNonexistingInstanceName(suggestedName);
        let tries = 0;
        let inputOptions: InputBoxOptions = {};
        while (!instanceName)
        {
            if (tries > 0)
                inputOptions.prompt = "Instance name already exists, please pick another";
            else
                inputOptions.prompt = "Instance name";
            inputOptions.value = suggestedInstanceName;
            instanceName = await window.showInputBox(inputOptions);
            if (!instanceName)
                return;
            let exists: boolean = await this._goCurrent.testInstanceExists(instanceName);
            if (exists)
            {
                tries++;
                suggestedInstanceName = await this.getNonexistingInstanceName(instanceName);
                instanceName = "";
            }
        }
        return instanceName;
    }

    private async getNonexistingInstanceName(suggestedName: string) : Promise<string>
    {
        let instanceName = suggestedName;
        let idx = 0;
        while (await this._goCurrent.testInstanceExists(instanceName))
        {
            idx++;
            instanceName = `${suggestedName}-${idx}`
        }
        return instanceName;
    }

    private update()
    {
        let workspaceFolders: Array<WorkspaceFolder> = [];
        for (let workspaceId in this._updatesAvailable)
        {
            if (!this._updatesAvailable[workspaceId])
                continue;
            let workspaceFolder = workspace.workspaceFolders.find(f => f.uri.path === workspaceId)
            if (workspaceFolder)
                workspaceFolders.push(workspaceFolder);
        }

        let picks = new Array<QuickPickItemPayload<WorkspaceFolder, UpdateAvailable>>();
        for (let workspaceFolder of workspaceFolders)
        {
            for (let entry of this._updatesAvailable[workspaceFolder.uri.path])
            {
                let instanceName = "";
                if (entry.instanceName)
                    instanceName = "("+ entry.instanceName + ")";
                picks.push({
                    "label": entry.packageGroupName, 
                    "description": instanceName,
                    "detail": entry.packages.map(p => p.id + " v" + p.version).join(', '),
                    "payload": workspaceFolder,
                    "payload2": entry,
                });
            }
        }
        window.showQuickPick<QuickPickItemPayload<WorkspaceFolder, UpdateAvailable>>(picks, {"placeHolder": "Select package group to update"}).then(result => 
        {
            if (!result)
                return;
            if (this._updatesAvailable[result.payload.uri.path])
            {
                let update = result.payload2;
                this.installUpdate(this._deployServices[result.payload.uri.path], update).then(success => {
                    if (success)
                    {
                        let idx = this._updatesAvailable[result.payload.uri.path].findIndex(u => u.packageGroupName === result.payload2.packageGroupName && u.instanceName === result.payload2.instanceName);
                        if (idx > -1)
                            this._updatesAvailable[result.payload.uri.path].splice(idx, 1);
                    }
                    commands.executeCommand("setContext", Constants.goCurrentDeployUpdatesAvailable, this.anyUpdatesPending());
                });
            }
        });
    }

    private checkForUpdates()
    {
        let buttons: string[] = [Constants.buttonUpdate, Constants.buttonLater];
        commands.executeCommand("setContext", Constants.goCurrentDeployUpdatesAvailable, false);
        for (let workspaceId in this._deployServices)
        {
            this._updatesAvailable[workspaceId] = new Array<UpdateAvailable>();
            let deployService: DeployService = this._deployServices[workspaceId];
            deployService.checkForUpdates().then(updates =>
            {
                for (let update of updates)
                {
                    let packages = update.packages.map(p => `${p.id} v${p.version}`).join(', ');
                    window.showInformationMessage(`Update available for "${update.packageGroupName}" (${packages})`, ...buttons,).then(result => 
                    {
                        if (result === Constants.buttonUpdate)
                        {
                            this.installUpdate(this._deployServices[workspaceId], update);
                        }
                        else
                        {
                            if (!this._updatesAvailable[workspaceId].find(i => i.packageGroupName === update.packageGroupName && i.instanceName === update.instanceName))
                            {
                                this._updatesAvailable[workspaceId].push(update);
                                commands.executeCommand("setContext", Constants.goCurrentDeployUpdatesAvailable, true);
                            }
                        }
                    });
                }
            });
        }
    }

    private async installUpdate(deployService: DeployService, update: UpdateAvailable) : Promise<boolean>
    {
        try
        {
            let deployment = await deployService.installUpdate(update.packageGroupName, update.instanceName, update.guid);
            window.showInformationMessage(`Package group "${deployment.name}" updated: ` + deployment.lastUpdated.map(p => `${p.id} v${p.version}`).join(', '))
            return true;
        }
        catch (e) 
        {
            window.showErrorMessage(e);
        }
    }

    private async remove()
    {
        let workspaceFolder = await this.showWorkspaceFolderPick();
        this.removeWithService(this._deployServices[workspaceFolder.uri.path]);
    }

    private async removeWithService(deployService: DeployService)
    {
       let deployment = await this.showDeploymentsPicks(deployService, "Select a deployment to remove");

        if (!deployment)
            return;
        let removedName = await deployService.removeDeployment(deployment.guid);
        window.showInformationMessage(`Package group "${removedName}" removed.`);
    }

    private async showDeploymentsPicks(deployService: DeployService, placeholder: string = "Selected a deployment") : Promise<Deployment>
    {
        let deployments = await deployService.getDeployments();
        let picks: QuickPickItemPayload<Deployment>[] = [];

        for (let entry of deployments)
        {
            let instance = "";
            if (entry.instanceName)
                instance = " (" + entry.instanceName + ")"
            picks.push({
                "label": entry.name,
                "description": instance,
                "detail": entry.packages.map(p => `${p.id} v${p.version}`).join('\n'),
                "payload": entry
            });
        }
        var options: QuickPickOptions = {};
        options.placeHolder = placeholder
        let selected = await window.showQuickPick(picks, options);
        if (!selected)
            return;
        return selected.payload;
    }

    private async getArguments(workspaceFolder: WorkspaceFolder, deployService: DeployService, name: string) : Promise<Uri>
    {
        let packagesArguments = await deployService.getArguments(name);
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

    private async experimental()
    {
        // This is an experimental command only for development / debuging
        // Turn on by setting debug = true (in constructor) and invoke with ctrl+shif+p->Go Current: Experimental
        // Don't forget to set debug = false before commiting.
        let workspaceFolder = await this.showWorkspaceFolderPick();
        let deployService: DeployService = this._deployServices[workspaceFolder.uri.path];
        let deployment = await this.showDeploymentsPicks(deployService);
        if (!deployment)
            return;
        let packages = await deployService.getDeployedPackages(deployment.guid);
        let server = packages.filter(p => p.Id === 'nav-server')[0]
        if (!server)
            return;
        PostDeployController.addAlLaunchConfig(server);
    }

    public displose()
    {
        for (let serviceKey in this._deployServices)
        {
            this._deployServices[serviceKey].dispose();
        }
    }
}