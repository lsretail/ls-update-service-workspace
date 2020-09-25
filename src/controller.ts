"use strict"

import {InputBoxOptions, QuickPickItem, QuickPickOptions, WorkspaceFolder,
    WorkspaceFoldersChangeEvent, commands, window, Disposable, 
    Uri, workspace} from 'vscode';
import * as vscode from 'vscode'
import {QuickPickItemPayload} from './interfaces/quickPickItemPayload'
import {ExtensionController} from './extensionController'
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

export default class Controller extends ExtensionController
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
    private _disposables: Disposable[];
    private _updatesAvailable: Map<string, Array<UpdateAvailable>> = new Map<string, Array<UpdateAvailable>>();
    private _outputChannel: vscode.OutputChannel = null;

    public async activate()
    {
        let config = vscode.workspace.getConfiguration('go-current-workspace')
        if (config.has('debug'))
        {
            this._debug = config.get('debug');
        }
        
        this._powerShell = new PowerShell(this._debug);
        this._deployPsService = new DeployPsService(this._powerShell, this.context.asAbsolutePath("PowerShell\\DeployPsService.psm1"));

        commands.executeCommand("setContext", Constants.goCurrentDebug, this._debug);
        this.registerFolderCommand("go-current.activate", () => {window.showInformationMessage("Go Current Activated")});
        this.registerCommand("go-current.newProject", () => this.newProject());
        this.registerCommand("go-current.deploy", () => this.deploy());
        this.registerCommand("go-current.checkForUpdates", () => this.checkForUpdates());
        this.registerCommand("go-current.update", () => this.update());
        this.registerCommand("go-current.remove", () => this.remove());
        this.registerCommand("go-current.experimental", () => this.experimental());
        this.registerCommand("go-current.openWizard", () => this.openWizard());
        this.registerCommand("go-current.addInstanceToWorkspace", () => this.addInstanceToWorkspace());
        this.registerCommand("go-current.newPackage", () => this.newPackage());
        this.registerCommand("go-current.al.repopulateLaunchJson", () => this.rePopulateLaunchJson());
        this.registerCommand("go-current.al.unpublishApp", () => this.alUnpublishApp());
        this.registerCommand("go-current.al.upgradeData", () => this.alUpgradeData());
        this.registerCommand("go-current.al.downloadDependencies", () => this.alDownloadDependencies());
        this.registerCommand("go-current.al.compileAndPackage", () => this.alCompileAndPackage());
        this.registerCommand("go-current.al.newPackage", () => this.alNewPackage());
        this.registerCommand("go-current.al.addNewDependencies", (...args) => this.alAddNewDependencies(args));
        process.on('unhandledRejection', (reason) => {
            Controller.handleError(reason)
        });

        vscode.commands.executeCommand("setContext", Constants.goCurrentExtensionActive, true);

        this._goCurrentInstalled = true;

        this.addWorkspaces();

        let gocVersion = await this._deployPsService.getGoCurrentVersion();
        this._goCurrentInstalled = gocVersion.IsInstalled;

        if (!this._goCurrentInstalled || !gocVersion.HasRequiredVersion)
        {
            if (!gocVersion.HasRequiredVersion)
            {
                window.showWarningMessage(`You do not have the required version of the Go Current client, v${gocVersion.RequiredVersion}, you have v${gocVersion.CurrentVersion}. Please update and reload your workspace.`);
                console.warn(`You do not have the required version of the Go Current client, v${gocVersion.RequiredVersion}, you have v${gocVersion.CurrentVersion}. Please update and reload your workspace.`)
            }
            else
            {
                console.warn("Go Current not installed!")
                window.showWarningMessage("Go Current is not installed, extension will not load.");
            }
            
            commands.executeCommand("setContext", Constants.goCurrentExtensionActive, false);
            commands.executeCommand("setContext", Constants.goCurrentAlActive, false);
            commands.executeCommand("setContext", Constants.goCurrentDeployUpdatesAvailable, false);
        }
        else
        {
            workspace.onDidChangeWorkspaceFolders(this.onWorkspaceChanges, this);

            await this.checkForBaseUpdate();
            await this.checkForUpdates(true);
        }
    }

    private getAlPsService() : AlPsService
    {
        if (!this._alPsService)
        {
            this._alPsService = new AlPsService(this._powerShell, this.context.asAbsolutePath("PowerShell\\AlPsService.psm1"));
        }
        return this._alPsService;
    }

    private getAlExtensionService(): AlExtensionService
    {
        if (!this._alExtensionService)
            this._alExtensionService = new AlExtensionService();
        
        return this._alExtensionService;
    }

    private getPackagePsService() : PackagePsService
    {
        if (!this._packagePsService)
        {
            this._packagePsService = new PackagePsService(this._powerShell, this.context.asAbsolutePath("PowerShell\\PackagePsService.psm1"));
        }
        return this._packagePsService;
    }

    private get outputChannel()
    {
        if (!this._outputChannel)
        {
            this._outputChannel = window.createOutputChannel("Go Current");
        }
        return this._outputChannel;
    }

    private async checkForBaseUpdate()
    {
        let buttons: string[] = [Constants.buttonUpdate, Constants.buttonLater];
        var packages = await this._deployPsService.getAvailableBaseUpdates();
        if (packages.length === 0)
            return;
        let packagesString = packages.map(p => `${p.Id} v${p.Version}`).join(', ');
        window.showInformationMessage(`Update available for "Go Current" (${packagesString})`, ...buttons).then(async result => {
            if (result === Constants.buttonUpdate)
            {
                let packages = await this._deployPsService.installBasePackages();
                window.showInformationMessage("Updated: " + packages.map(p => `${p.Id} v${p.Version}`).join(', '));
                let workspaceExtension = packages.filter(p => p.Id === 'go-current-workspace');
                let clientUpdated = packages.filter(p => p.Id === 'go-current-client');
                if (workspaceExtension.length === 1)
                {
                    PostDeployController.processVsExtension(workspaceExtension[0]);
                }
                if (clientUpdated.length > 0)
                {
                    PostDeployController.processGoCurrent();
                }
            }
        });
        
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
        else if (reason instanceof AppError)
        {
            window.showErrorMessage(reason.message);
            return true;
        }
    }

    private static getErrorMessage(reason: any): string
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

    private onWorkspaceChanges(e: WorkspaceFoldersChangeEvent)
    {
        for (let added of e.added)
        {
            this.addWorkspace(added);
        }

        if (e.added.length > 0)
            this.checkForUpdates(true);

        for (let removed of e.removed)
        {
            this.removeWorkspace(removed);
        }

        this.updateActiveServices();
    }

    private onProjecFileChange(deployService: DeployService)
    {
        this.checkForUpdates(true);
        this.updateActiveServices();
    }

    private addWorkspaces()
    {
        if (!workspace.workspaceFolders)
            return;

        for (let workspaceFolder of workspace.workspaceFolders)
        {
            this.addWorkspace(workspaceFolder);

        }
        this.updateActiveServices();
    }

    private addWorkspace(workspaceFolder: WorkspaceFolder)
    {        
        if (this._deployServices[Controller.getWorkspaceKey(workspaceFolder)])
            return;

        this.debugLog(`Adding workspace ${workspaceFolder.uri.fsPath}.`)
        let projectFilePath = ProjectFileHelpers.getProjectFilePath(workspaceFolder.uri.fsPath);

        let projectFile = new JsonData<ProjectFile>(projectFilePath, true, new ProjectFile());
        
        // Deploy Service
        let deployService = new DeployService(
            projectFile,
            new JsonData<WorkspaceData>(path.join(workspaceFolder.uri.fsPath, Constants.goCurrentWorkspaceDirName+"\\"+Constants.projectDataFileName), true, new WorkspaceData()),
            this._deployPsService,
            workspaceFolder.uri.fsPath
        );
        deployService.onDidProjectFileChange(this.onProjecFileChange, this);
        this._deployServices[Controller.getWorkspaceKey(workspaceFolder)] = deployService;

        // PostDeployService
        let postDeployController = new PostDeployController(workspaceFolder);
        deployService.onDidPackagesDeployed(postDeployController.onPackagesDeployed, postDeployController);
        deployService.onDidInstanceRemoved(postDeployController.onInstanceRemoved, postDeployController);
        deployService.onDidInstanceRemoved(this.onDeploymentRemoved, this);

        this._postDeployControllers[Controller.getWorkspaceKey(workspaceFolder)] = postDeployController;

        // AL Service
        this._alServices[Controller.getWorkspaceKey(workspaceFolder)] = new AlService(
            deployService, 
            this.getAlPsService(),
            workspaceFolder
        );

        // Package Service
        this._packageServices[Controller.getWorkspaceKey(workspaceFolder)] = new PackageService(
            this.getPackagePsService(),
            this.getAlExtensionService(),
            projectFile
        );
    }

    private removeWorkspace(workspaceFolder: WorkspaceFolder)
    {
        let workspaceId = Controller.getWorkspaceKey(workspaceFolder);
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

    private updateActiveServices()
    {
        let gocActive = this.isActive();
        let alActive = this.isAlActive();

        this.debugLog(`GoC service active: ${gocActive}`);
        this.debugLog(`AL service active: ${alActive}`);
        
        commands.executeCommand("setContext", Constants.goCurrentDeployHasInactiveWorkspaces, this.hasInactiveDeploymentServices());
        commands.executeCommand("setContext", Constants.goCurrentDeployActive, gocActive);
        commands.executeCommand("setContext", Constants.goCurrentAlActive, alActive);
    }

    private hasInactiveDeploymentServices() : boolean
    {
        if (!this._goCurrentInstalled)
            return false;

        for (let workspaceKey in this._deployServices)
        {
            if (!this._deployServices[workspaceKey].isActive())
                return true;
        }

        return false;
    }

    private isActive() : Boolean
    {
        if (!this._goCurrentInstalled)
            return false;

        for (let workspaceKey in this._deployServices)
        {
            if (this._deployServices[workspaceKey].isActive())
                return true;
        }

        return false;
    }

    private isAlActive(): boolean
    {
        if (!this._goCurrentInstalled)
            return false;

        for (let workspaceKey in this._alServices)
        {
            if (this._alServices[workspaceKey].isActive())
                return true;
        }
        return false;
    }

    private async showTargetPicks(targets: string[]): Promise<string>
    {
        if (!targets || targets.length === 0)
            return "default";

        if (targets.length === 1)
            return targets[0];
        
        let picks: QuickPickItem[] = [];
        for (let target of targets)
        {
            picks.push({"label": target});
        }

        var options: QuickPickOptions = {};
        options.placeHolder = "Select a target configuration."
        let selected = await window.showQuickPick(picks, options);
        if (!selected)
            return;
        return selected.label;
    }

    private async showWorkspaceFolderPick(workspaceFolders: readonly WorkspaceFolder[] = null, placeHolder = "Select workspace folder") : Promise<WorkspaceFolder>
    {
        let picks: QuickPickItem[] = [];
        if (!workspaceFolders)
            workspaceFolders = workspace.workspaceFolders;
        for (let workspaceFolder of workspaceFolders)
        {
            picks.push({"label": workspaceFolder.name, "description": workspaceFolder.uri.fsPath});
        }

        if (picks.length === 0)
        {
            return;
        }
        else if (picks.length === 1)
        {
            let workspaceFolder = DataHelpers.getEntryByProperty<WorkspaceFolder>(workspace.workspaceFolders, "name", picks[0].label);
            return workspaceFolder;
        }
        let options: QuickPickOptions = {"placeHolder": placeHolder};
    
        let pick = await window.showQuickPick(picks, options);
        if (!pick)
            return;

        return DataHelpers.getEntryByProperty<WorkspaceFolder>(workspace.workspaceFolders, "name", pick.label)
    }

    private getActiveDeploymentWorkspaces(): WorkspaceFolder[]
    {
        let active: WorkspaceFolder[] = [];
        for (let workspaceFolder of workspace.workspaceFolders)
        {
            if (this._deployServices[Controller.getWorkspaceKey(workspaceFolder)] &&
                this._deployServices[Controller.getWorkspaceKey(workspaceFolder)].isActive())
                active.push(workspaceFolder)
        }
        return active;
    }

    private getInactiveDeploymentWorkspaces(): WorkspaceFolder[]
    {
        let active: WorkspaceFolder[] = [];
        for (let workspaceFolder of workspace.workspaceFolders)
        {
            if (!this._deployServices[Controller.getWorkspaceKey(workspaceFolder)] ||
                !this._deployServices[Controller.getWorkspaceKey(workspaceFolder)].isActive())
                active.push(workspaceFolder)
        }
        return active;
    }

    private getActiveAlWorkspaces(): WorkspaceFolder[]
    {
        let active: WorkspaceFolder[] = [];
        for (let workspaceFolder of workspace.workspaceFolders)
        {
            if (this._alServices[Controller.getWorkspaceKey(workspaceFolder)] &&
                this._alServices[Controller.getWorkspaceKey(workspaceFolder)].isActive())
                active.push(workspaceFolder)
        }
        return active;
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
        let workspaceFolder = await this.showWorkspaceFolderPick(this.getActiveDeploymentWorkspaces());
        if (!workspaceFolder)
            return;

        try
        {
            await this.showDeployWithService(this._deployServices[Controller.getWorkspaceKey(workspaceFolder)], workspaceFolder);
        }
        catch (e)
        {
            if (!Controller.handleError(e))
                window.showErrorMessage("Error occurred while installing packages.");
        }
    }

    private async showDeployWithService(deployService: DeployService, workspaceFolder: WorkspaceFolder)
    {
        let packageGroups = await deployService.getPackageGroupsResolved();

        let picks: QuickPickItemPayload<PackageGroup>[] = [];

        for (let entry of packageGroups)
        {
            if (await deployService.canInstall(entry.id))
            {
                picks.push({
                    "label": entry.name, 
                    "description": entry.description, 
                    "detail": entry.packages.map(p => `${p.id}`).join(', '),
                    "payload": entry
                });
            }
        }

        var options: QuickPickOptions = {};
        options.placeHolder = "Select a package group to install"
        let selectedSet = await window.showQuickPick(picks, options);
        if (!selectedSet)
            return;

        let targets = await deployService.getTargets(selectedSet.payload.id);

        let selectedTarget = await this.showTargetPicks(targets)

        if (!selectedTarget)
            return;

        let instanceName = "";
        if (await deployService.isInstance(selectedSet.payload.id))
        {
            instanceName = selectedSet.payload.instanceName;
            if (!instanceName)
            {
                let suggestion = selectedSet.payload.instanceNameSuggestion
                if (!suggestion)
                    suggestion = workspaceFolder.name
                instanceName = await this.getOrShowInstanceNamePick(suggestion);
                if (!instanceName)
                    return;
            }
            else
            {
                if (this._deployPsService.testInstanceExists(instanceName))
                {
                    window.showErrorMessage(`Instance with the name "${instanceName}" is already installed.`)
                    return;
                }
            }
        }

        try
        {
            let deploymentResult = await window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: Resources.installationStartedInANewWindow
            }, async (progress, token) => {
                return await deployService.deployPackageGroup(
                    selectedSet.payload,
                    instanceName,
                    selectedTarget,
                    undefined
                );
            });
            
            if (deploymentResult.lastUpdated.length > 0)
                window.showInformationMessage(`Package group "${deploymentResult.deployment.name}" installed: ` + deploymentResult.lastUpdated.map(p => `${p.id} v${p.version}`).join(', '))
        }
        catch (e)
        { 
            if (!Controller.handleError(e))
                window.showErrorMessage("Error occurred while installing packages.");
        };
    }

    private async getOrShowInstanceNamePick(suggestedName: string) : Promise<string>
    {
        suggestedName = suggestedName.replace(/[^a-zA-Z0-9-]/g, "-");
        let instanceName = "";
        let suggestedInstanceName = await this.getNonexistingInstanceName(suggestedName);
        let tries = 0;
        let inputOptions: InputBoxOptions = {
            ignoreFocusOut: true
        };
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
            let exists: boolean = await this._deployPsService.testInstanceExists(instanceName);
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
        while (await this._deployPsService.testInstanceExists(instanceName))
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
        window.showQuickPick<QuickPickItemPayload<WorkspaceFolder, UpdateAvailable>>(picks, {"placeHolder": "Select a package group to update"}).then(result => 
        {
            if (!result)
                return;
            if (this._updatesAvailable[result.payload.uri.path])
            {
                let update = result.payload2;
                this.installUpdate(this._deployServices[Controller.getWorkspaceKey(result.payload)], update).then(success => {
                    if (success)
                    {
                        let idx = this._updatesAvailable[result.payload.uri.path].findIndex(u => u.packageGroupId === result.payload2.packageGroupId && u.instanceName === result.payload2.instanceName);
                        if (idx > -1)
                            this._updatesAvailable[result.payload.uri.path].splice(idx, 1);
                    }
                    commands.executeCommand("setContext", Constants.goCurrentDeployUpdatesAvailable, this.anyUpdatesPending());
                });
            }
        });
    }

    private async checkForUpdates(silent: boolean = false)
    {
        let buttons: string[] = [Constants.buttonUpdate, Constants.buttonLater];
        commands.executeCommand("setContext", Constants.goCurrentDeployUpdatesAvailable, false);
        let anyUpdates = false;
        for (let workspaceId in this._deployServices)
        {
            this._updatesAvailable[workspaceId] = new Array<UpdateAvailable>();
            let deployService: DeployService = this._deployServices[workspaceId];
            let updates = await deployService.checkForUpdates();
            
            for (let update of updates)
            {
                anyUpdates = true;
                let message = `Updates available for "${update.packageGroupName}"`;

                if (update.instanceName)
                    message += ` (${update.instanceName})`;

                window.showInformationMessage(message, ...buttons,).then(result => 
                {
                    if (result === Constants.buttonUpdate)
                    {
                        this.installUpdate(this._deployServices[workspaceId], update);
                    }
                    else
                    {
                        if (!this._updatesAvailable[workspaceId].find(i => i.packageGroupId === update.packageGroupId && i.instanceName === update.instanceName))
                        {
                            this._updatesAvailable[workspaceId].push(update);
                            commands.executeCommand("setContext", Constants.goCurrentDeployUpdatesAvailable, true);
                        }
                    }
                });
            }
        }

        if (!silent && !anyUpdates)
        {
            window.showInformationMessage("No updates available.");
        }
    }

    private async installUpdate(deployService: DeployService, update: UpdateAvailable) : Promise<boolean>
    {
        try
        {
            let deploymentResult = await deployService.installUpdate(update.packageGroupId, update.instanceName, update.guid);
            if (deploymentResult.lastUpdated.length > 0)
            {
                window.showInformationMessage(`Package group "${deploymentResult.deployment.name}" updated: ` + deploymentResult.lastUpdated.map(p => `${p.id} v${p.version}`).join(', '));
                return true;
            }
            return false;
        }
        catch (e) 
        {
            Controller.handleError(e);
        }
    }

    private async remove()
    {
        let workspaceFolder = await this.showWorkspaceFolderPick(this.getActiveDeploymentWorkspaces());

        if (!workspaceFolder)
            return;

        this.removeWithService(this._deployServices[Controller.getWorkspaceKey(workspaceFolder)]);
    }

    private async removeWithService(deployService: DeployService)
    {
       let deployment = await this.showDeploymentsPicks(deployService, "Select a package group to remove");

        if (!deployment)
            return;
        let removedName = await deployService.removeDeployment(deployment.guid);
        window.showInformationMessage(`Package group "${removedName}" removed.`);
    }

    private async showDeploymentsPicks(deployService: DeployService, placeholder: string = "Selected a group") : Promise<Deployment>
    {
        let deployments = await deployService.getDeployments();
        let picks: QuickPickItemPayload<Deployment>[] = [];

        for (let entry of deployments)
        {
            let instance = "";
            if (entry.instanceName && entry.instanceName !== entry.name)
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

    private async showInstancePicks(exludeInstances: Array<string> = [], placeholder: string = "Selected an instance") : Promise<PackageInfo[]>
    {
        let instances = await this._deployPsService.getInstances();

        let picks: QuickPickItemPayload<PackageInfo[]>[] = [];

        for (let entry of instances)
        {
            let instanceName = entry[0].InstanceName;

            if (exludeInstances.includes(instanceName))
                continue;

            let description = entry.filter(p => p.Selected).map(p => `${p.Id}`).join(', ');
            picks.push({
                "label": instanceName,
                "description": description,
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

    private openWizard()
    {
        this._deployPsService.openGoCurrentWizard();
    }

    private async newProject()
    {
        let workspaceFolder = await this.showWorkspaceFolderPick(this.getInactiveDeploymentWorkspaces());

        if (!workspaceFolder)
            return

        let newProjectService = new NewProjectService(workspaceFolder);

        let newProjectFilePath: string;
        if (newProjectService.isAl())
        {
            newProjectFilePath = await newProjectService.newAlProject(this.context);
        }
        else
        {
            newProjectFilePath = await newProjectService.newProject(this.context);
        }        

        let document = await workspace.openTextDocument(newProjectFilePath)
        await window.showTextDocument(document);

        if (!newProjectService.isAl())
        {
            let packageId = await window.showInputBox({
                value: "your-package-id",
                ignoreFocusOut: true,
                prompt: "Specify package ID"
            })
    
            await newProjectService.updateProperty({id: packageId});
        }
        else
        {
            let choice = await window.showQuickPick([
                Resources.addLicensePackage,
                Resources.chooseLicenseFile,
                Resources.skipLicenseForNow

            ], {
                placeHolder: "Add license for your Business Central development instance.", 
                ignoreFocusOut: true,
            })

            if (choice === Resources.chooseLicenseFile)
            {
                let licenseFile = await window.showOpenDialog({
                    canSelectFiles: true, 
                    defaultUri: workspaceFolder.uri,
                    filters: {License: ['flf']},
                    title: "Select license file",
                    openLabel: "Select License"
                });
                if (licenseFile)
                {
                    await newProjectService.addLicenseFile(licenseFile[0].fsPath);
                }
            }
            else if (choice === Resources.addLicensePackage)
            {
                let licensePackageId = await window.showInputBox({prompt: Resources.specifyLicensePackage});
                if (licensePackageId)
                {
                    await newProjectService.addLicensePackage(licensePackageId);
                }
            }
        }

        newProjectService.dispose();
    }

    public onDeploymentRemoved(instanceName: string)
    {
        this.checkForUpdates(true);
    }

    private async addInstanceToWorkspace()
    {
        let workspaceFolder = await this.showWorkspaceFolderPick(this.getActiveDeploymentWorkspaces());

        if (!workspaceFolder)
            return;

        let deployService: DeployService = this._deployServices[Controller.getWorkspaceKey(workspaceFolder)];
        let existingInstances = await deployService.getDeployedInstances()

        let packages = await this.showInstancePicks(existingInstances);

        if (!packages)
            return;

        deployService.addPackagesAsDeployed(packages);
    }

    private async rePopulateLaunchJson()
    {
        let workspaceFolder = await this.showWorkspaceFolderPick(this.getActiveDeploymentWorkspaces());
        if (!workspaceFolder)
            return;
        let workspaceKey = Controller.getWorkspaceKey(workspaceFolder);

        let alService: AlService = this._alServices[workspaceKey];
        if (!alService.isActive())
            return;
        alService.rePopulateLaunchJson();
    }

    private async newPackage()
    {
        var outputChannel = this.outputChannel;
        outputChannel.clear();
        outputChannel.show();
        outputChannel.appendLine('Creating package ...');
        try
        {
            let workspaceFolder = await this.showWorkspaceFolderPick(this.getActiveDeploymentWorkspaces());

            if (!workspaceFolder)
                return;
    
            let workspaceKey = Controller.getWorkspaceKey(workspaceFolder);
    
            if (!await this.ensureGoCurrentServer(workspaceKey))
                return;
    
            let packageService: PackageService = this._packageServices[Controller.getWorkspaceKey(workspaceFolder)];
           
            let targets = await packageService.getTargets();
            let target = await this.showTargetPicks(targets);

            let packagePath = await window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Creating package ..."
            }, async (progress, token) => {
                return await packageService.newPackage(
                    GitHelpers.getBranchName(workspaceFolder.uri.fsPath),
                    target,
                    workspaceFolder.uri.fsPath
                );
            });

            outputChannel.appendLine(`Package created: ${packagePath}.`)
        }
        catch (e)
        {
            Controller.handleError(e);
            this.outputChannel.appendLine('Error occurd while compiling and creating package:');
            this.outputChannel.appendLine(Controller.getErrorMessage(e));
        }   
    }

    private async showAlInstancePicks(alService: AlService): Promise<PackageInfo>
    {
        let instances = await alService.getInstances();
        
        let picks: QuickPickItemPayload<PackageInfo>[] = [];
        for (let instance of instances)
        {
            picks.push({"label": instance.InstanceName, payload: instance});
        }

        var options: QuickPickOptions = {};
        options.placeHolder = "Select an instance."
        let selected = await window.showQuickPick(picks, options);
        if (!selected)
            return;
        return selected.payload;
    }

    private async alUnpublishApp()
    {
        let workspaceFolder = await this.showWorkspaceFolderPick(this.getActiveAlWorkspaces());
        if (!workspaceFolder)
            return;
        let workspaceKey = Controller.getWorkspaceKey(workspaceFolder);

        let alService: AlService = this._alServices[workspaceKey];
        if (!alService.isActive())
            return;
        
        let instance = await this.showAlInstancePicks(alService);

        if (!instance)
            return

        let unpublished = await window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Unpublishing app..."
        }, async (progress, token) => {
            return await alService.unpublishApp(instance.InstanceName);
        });

        if (unpublished)
            window.showInformationMessage(`App unpublished.`);
        else
            window.showInformationMessage(`App already unpublished.`);
    }

    private async alUpgradeData()
    {
        let workspaceFolder = await this.showWorkspaceFolderPick(this.getActiveAlWorkspaces());
        if (!workspaceFolder)
            return;
        let workspaceKey = Controller.getWorkspaceKey(workspaceFolder);

        let alService: AlService = this._alServices[workspaceKey];
        if (!alService || !alService.isActive())
            return;
        
        let instance = await this.showAlInstancePicks(alService);

        if (!instance)
            return

        let appsUpgraded = await window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Running data upgrade on "${instance.InstanceName}"...`
        }, async (progress, token) => {
            return await alService.upgradeData(instance.InstanceName);
        });

        if (!appsUpgraded || appsUpgraded.length === 0)
        {
            window.showInformationMessage("No apps required data upgrade.");
        }
        else
        {
            window.showInformationMessage(`Data upgraded for the following apps: ${appsUpgraded.join(', ')}.`);
        }
    }

    private async alDownloadDependencies() 
    {
        this.outputChannel.clear();
        this.outputChannel.hide();
        this.outputChannel.show();
        try
        {
            let workspaceFolder = await this.showWorkspaceFolderPick(this.getActiveAlWorkspaces());

            if (!workspaceFolder)
                return;
    
            let packageService: PackageService = this._packageServices[Controller.getWorkspaceKey(workspaceFolder)];

            let targets = await packageService.getTargets(undefined, true);
            let target = await this.showTargetPicks(targets);

            if (!target)
                return;
            
            this.outputChannel.appendLine("Starting dependency download ...")
            
            let output = await window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Downloading dependencies (.alpackages + .netpackages) ..."
            }, async (progress, token) => {
                return await packageService.downloadAlDependencies(
                    workspaceFolder.uri.fsPath, 
                    target, 
                    GitHelpers.getBranchName(workspaceFolder.uri.fsPath),
                );
            });
            this.outputChannel.appendLine(output);
            this.outputChannel.appendLine("Dependencies downloaded.");
        }
        catch (e)
        {
            Controller.handleError(e);
            this.outputChannel.appendLine('Error occurd while downloading dependencies:');
            this.outputChannel.appendLine(Controller.getErrorMessage(e));
        }
    }

    private async alCompileAndPackage()
    {
        var outputChannel = this.outputChannel;
        try
        {
            let workspaceFolder = await this.showWorkspaceFolderPick(this.getActiveAlWorkspaces());

            if (!workspaceFolder)
                return;
    
            let workspaceKey = Controller.getWorkspaceKey(workspaceFolder);
    
            if (!await this.ensureGoCurrentServer(workspaceKey))
                return;
    
            let alService: AlService = this._alServices[workspaceKey];
            if (!alService || !alService.isActive())
                return;
    
            let packageService: PackageService = this._packageServices[Controller.getWorkspaceKey(workspaceFolder)];

            let targets = await packageService.getTargets();
            let target = await this.showTargetPicks(targets);
        
            outputChannel.clear();
            outputChannel.show();
            outputChannel.appendLine('Compiling and creating package ...');

            await window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Compiling and creating package ..."
            }, async (progress, token) => {
                await packageService.invokeAlCompileAndPackage(
                    workspaceFolder.uri.fsPath, 
                    target, 
                    GitHelpers.getBranchName(workspaceFolder.uri.fsPath), 
                    message => outputChannel.appendLine(message)
                );
            });
        }
        catch (e)
        {
            Controller.handleError(e);
            this.outputChannel.appendLine('Error occurd while compiling and creating package:');
            this.outputChannel.appendLine(Controller.getErrorMessage(e));
        }
    }

    private async alNewPackage()
    {
        var outputChannel = this.outputChannel;
        try
        {
            let workspaceFolder = await this.showWorkspaceFolderPick(this.getActiveAlWorkspaces());

            if (!workspaceFolder)
                return;
    
            let workspaceKey = Controller.getWorkspaceKey(workspaceFolder);
    
            if (!await this.ensureGoCurrentServer(workspaceKey))
                return;
    
            let alService: AlService = this._alServices[workspaceKey];
            if (!alService || !alService.isActive())
                return;
    
            let packageService: PackageService = this._packageServices[Controller.getWorkspaceKey(workspaceFolder)];

            let targets = await packageService.getTargets();
            let target = await this.showTargetPicks(targets);
        
            outputChannel.clear();
            outputChannel.show();
            outputChannel.appendLine('Creating package ...');

            let packagePath = await window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Creating package ..."
            }, async (progress, token) => {
                return await packageService.newAlPackage(
                    workspaceFolder.uri.fsPath, 
                    target, 
                    GitHelpers.getBranchName(workspaceFolder.uri.fsPath), 
                );
            });

            outputChannel.appendLine(`Package created ${packagePath}.`);
        }
        catch (e)
        {
            Controller.handleError(e);
            this.outputChannel.appendLine('Error occurd while compiling and creating package:');
            this.outputChannel.appendLine(Controller.getErrorMessage(e));
        }
    }

    private async experimental()
    {
        let ble = new AlExtensionService();
        ble.stop();
        window.showInformationMessage(ble.compilerPath);

        /*let extension = vscode.extensions.getExtension('ms-dynamics-smb.al');
        //extension.exports.services[1].tryStartLanguageServer();
        
        window.showInformationMessage(`1. The state is ${extension.exports.services[1].languageServerClient.state}`);
        

        await extension.exports.services[1].languageServerClient.stop()

        window.showInformationMessage(`2. The state is ${extension.exports.services[1].languageServerClient.state}`);
        await this.delay(2500);
        window.showInformationMessage(`3. The state is ${extension.exports.services[1].languageServerClient.state}`);
        await this.delay(2500);

        await extension.exports.services[1].languageServerClient.start()
        window.showInformationMessage(`4. The state is ${extension.exports.services[1].languageServerClient.state}`);
        await this.delay(2500);
        window.showInformationMessage(`5. The state is ${extension.exports.services[1].languageServerClient.state}`);
        console.log('adf');*/
        /*let config = vscode.workspace.getConfiguration('go-current-workspace')
        console.log("This is the experimental stuff");
        vscode.window.showInformationMessage(config.get('debug').toString());
        console.log(config);*/
    }

    async alAddNewDependencies(items: any[]): Promise<void>
    {
        if (!items[0])
            return;

        let filePath = items[0].fsPath;

        let workspaceFolder = WorkspaceHelpers.getWorkspaceForPath(filePath);

        if (!workspaceFolder)
            return;
        
        let appJsonPath = path.join(workspaceFolder.uri.fsPath, Constants.alProjectFileName);

        if (!fsHelpers.existsSync(appJsonPath))
        {
            window.showWarningMessage(`${Constants.alProjectFileName} doesn't exist in workspace.`);
            return;
        }
        
        let count = await NewProjectService.addDependenciesToProjectFileWithLoad(filePath, appJsonPath);
        if (count > 0)
            window.showInformationMessage(util.format(Resources.dependenciesAddedToProject, count), );
        else
            window.showInformationMessage(Resources.noDependenciesAddedToProject);
    }

    delay(ms: number): Promise<void>
    {
        return new Promise( resolve => setTimeout(resolve, ms) );
    }

    private async ensureGoCurrentServer(workspaceKey: string): Promise<boolean>
    {
        let service = this.getPackagePsService();
        let gocVersion = await service.getGoCurrentServerVersion();

        if (!gocVersion.IsInstalled)
        {
            let result = await window.showWarningMessage("Go Current server is required for this operation.", Constants.buttonInstall);
            if (result === Constants.buttonInstall)
            {
                this.installGocServer(workspaceKey);
            }
            return false;
        }
        if (!gocVersion.HasRequiredVersion)
        {
            let result = await window.showWarningMessage(`Go Current server v${gocVersion.RequiredVersion} or greater is required for this operation, you have v${gocVersion.CurrentVersion}.`, Constants.buttonUpdate);
            if (result === Constants.buttonUpdate)
            {
                this.installGocServer(workspaceKey);
            }
            return false;
        }
        return true;
    }

    private async installGocServer(workspaceKey: string)
    {
        let packageId = 'go-current-server'

        let result = await window.withProgress({
            location: vscode.ProgressLocation.Notification
        }, async (progress, token) => 
        {
            progress.report({message: "Starting ..."})
            
            let deployService = this._deployServices[workspaceKey];
            let servers = await deployService.getServers();

            let isAvailable = await this._deployPsService.testPackageAvailable(packageId, servers);

            if (isAvailable)
            {
                progress.report({message: Resources.installationStartedInANewWindow})
                let packages: Package[] = [{id: packageId, version: ''}];
                return await this._deployPsService.installPackages(packages, undefined, servers);
            }
            else
            {
                vscode.env.openExternal(vscode.Uri.parse(Constants.gocServerUrl));
                return null;
            }
        });

        if (result && result.filter(p => p.Id === packageId).length > 0)
        {
            let result = await window.showInformationMessage(Resources.goCurrentServerUpdated, Constants.buttonReloadWindow)
            if (result === Constants.buttonReloadWindow)
            {
                commands.executeCommand("workbench.action.reloadWindow");
            }
        }
    }

    private debugLog(value: string)
    {
        if (this._debug)
            console.log('GoC: ' + value);
    }

    public displose()
    {
        for (let serviceKey in this._deployServices)
        {
            this._deployServices[serviceKey].dispose();
        }
    }
}