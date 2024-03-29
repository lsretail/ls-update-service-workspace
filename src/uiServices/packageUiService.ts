import { OutputChannel, ExtensionContext, ProgressLocation, window, commands, WorkspaceFolder, Uri } from "vscode";
import * as vscode from 'vscode'
import { AlService } from "../alService/services/alService";
import { Constants } from "../constants";
import Controller from "../controller";
import { DeployService } from "../deployService/services/deployService";
import { UiService } from "../extensionController";
import { GoCurrentPsService } from "../goCurrentService/services/goCurrentPsService";
import GitHelpers from "../helpers/gitHelpers";
import { UiHelpers } from "../helpers/uiHelpers";
import { PackagePsService } from "../packageService/services/packagePsService";
import { PackageService } from "../packageService/services/packageService";
import Resources from "../resources";
import { WorkspaceServiceProvider } from "../workspaceService/services/workspaceServiceProvider";
import { WorkspaceFilesService } from "../services/workspaceFilesService";
import { InstallHelpers } from "../helpers/installHelpers";
import { Logger } from "../interfaces/logger";
import { WorkspaceHelpers } from "../helpers/workspaceHelpers";
import { AlExtensionService } from "../packageService/services/alExtensionService";
import { Server } from "../models/projectFile";
import path = require("path");

export class PackageUiService extends UiService
{
    private _wsDeployServices: WorkspaceServiceProvider<DeployService>;
    private _wsAlServices: WorkspaceServiceProvider<AlService>;
    private _wsPackageService: WorkspaceServiceProvider<PackageService>;
    private _outputChannel: OutputChannel;
    private _packagePsService: PackagePsService;
    private _goCurrentPsService: GoCurrentPsService;
    private _wsWorkspaceFilesServices: WorkspaceServiceProvider<WorkspaceFilesService>;
    private _alExtensionService: AlExtensionService
    
    constructor(
        context: ExtensionContext, 
        logger: Logger,
        wsDeployServices: WorkspaceServiceProvider<DeployService>,
        wsAlServices: WorkspaceServiceProvider<AlService>,
        wsPackageService: WorkspaceServiceProvider<PackageService>,
        packagePsService: PackagePsService,
        goCurrentPsService: GoCurrentPsService,
        wsWorkspaceFilesServices: WorkspaceServiceProvider<WorkspaceFilesService>,
        alExtensionService: AlExtensionService,
        outputChannel: OutputChannel
    )
    {
        super(context, logger);
        this._wsDeployServices = wsDeployServices;
        this._wsAlServices = wsAlServices;
        this._outputChannel = outputChannel;
        this._wsPackageService = wsPackageService;
        this._packagePsService = packagePsService;
        this._goCurrentPsService = goCurrentPsService;
        this._wsWorkspaceFilesServices = wsWorkspaceFilesServices
        this._alExtensionService = alExtensionService;
    }

    async activate(): Promise<void>
    {
        this.registerCommand("ls-update-service.al.downloadDependencies", () => this.alDownloadDependencies());
        this.registerCommand("ls-update-service.al.compileAndPackage", () => this.alCompileAndPackage());
        this.registerCommand("ls-update-service.al.newPackage", () => this.alNewPackage());
        this.registerCommand("ls-update-service.newPackage", () => this.newPackage());
    }

    private async alDownloadDependencies() 
    {
        let workspaces = await this._wsAlServices.getWorkspaces({active: true, workspaceFilter: w => Promise.resolve(!w.virtual)});
        let workspaceFolders = await UiHelpers.showWorkspaceFolderPicks(workspaces);
        
        if (!workspaceFolders || workspaceFolders.length === 0)
            return;

        let target = await this.getTargetForWorkspaces(workspaceFolders);
        
        if (!target)
        {
            return;
        }

        this._outputChannel.clear();
        this._outputChannel.hide();
        this._outputChannel.show();
        this._outputChannel.appendLine("Starting dependency download ...")

        try
        {    
            let output = await window.withProgress({
                location: ProgressLocation.Notification,
                title: "Downloading dependencies (.alpackages + .netpackages) ..."
            }, async (progress, token) => {
                for(let workspaceFolder of workspaceFolders)
                {
                    this._outputChannel.appendLine("Downloading for " + workspaceFolder.name); 
                    let packageService: PackageService = this._wsPackageService.getService(workspaceFolder);
                    let packageIdsInWorkspaces = await WorkspaceHelpers.getPackageIdFromWorkspaces(this._wsWorkspaceFilesServices);
                    let outputResult = await packageService.downloadAlDependencies(
                        workspaceFolder.uri.fsPath, 
                        target,
                        GitHelpers.getBranchName(workspaceFolder.uri.fsPath),
                        packageIdsInWorkspaces
                    );
                    this._outputChannel.appendLine(outputResult.output);
                }
            });
        }
        catch (e)
        {
            this._outputChannel.appendLine('Error occurd while downloading dependencies:');
            this._outputChannel.appendLine(Controller.getErrorMessage(e));
            throw e;
        }
        
        this._outputChannel.appendLine("Finished!");
        window.showInformationMessage(Resources.dependenciesDownloadedReload, Constants.buttonReloadWindow).then(result => 
        {
            if (result === Constants.buttonReloadWindow)
            {
                commands.executeCommand("workbench.action.reloadWindow");
            }
        });
    }

    private async getTargetForWorkspaces(workspaceFolders: WorkspaceFolder[]): Promise<string>
    {
        let targetArray: string[] = [];
        let target: string;

        for(let workspaceFolder of workspaceFolders)
        {
            let packageService: PackageService = this._wsPackageService.getService(workspaceFolder);
            let targets = await packageService.getTargets(undefined, true);
            targetArray = targetArray.concat(targets);
        }

        let targetArrayNoDuplicates = targetArray.filter(function(elem, index, self) 
        {
            return index === self.indexOf(elem);
        })

        return await UiHelpers.showTargetPicks(targetArrayNoDuplicates);
    }

    private async alCompileAndPackage()
    {
        var outputChannel = this._outputChannel;
        try
        {
            let workspaceFolders = await UiHelpers.showWorkspaceFolderPicks(await this._wsAlServices.getWorkspaces({active: true, workspaceFilter: w => Promise.resolve(!w.virtual)}));

            if (!workspaceFolders || workspaceFolders.length === 0)
                return;

            let target = await this.getTargetForWorkspaces(workspaceFolders);

            let projectDirs : string[] = [];
            if (!await this.ensureGoCurrentServer(workspaceFolders[0]))
                return;

            for (let workspaceFolder of workspaceFolders)   
            {
                projectDirs.push(workspaceFolder.uri.fsPath);
            } 

            outputChannel.clear();
            outputChannel.show();
            outputChannel.appendLine('Starting to compile and creating packages ...');

            for (let ble of projectDirs)
            {
                outputChannel.appendLine(ble);
            }

            let packagePaths = await window.withProgress({
                location: ProgressLocation.Notification,
                title: "Compiling and creating package ..."
            }, async (progress, token) => {
                let packagePaths = await this._packagePsService.invokeAlProjectBuild(
                    projectDirs,
                    this._alExtensionService.compilerPath,
                    GitHelpers.getBranchName(workspaceFolders[0].uri.fsPath),
                    target,
                    outputChannel
                );
                for (let packagePath of packagePaths)
                {
                    outputChannel.appendLine(`Created ${packagePath}.`);
                }
                outputChannel.appendLine("Finished!");
                return packagePaths
            });

            if (packagePaths.length > 0)
            {
                window.showInformationMessage(Resources.importServers, Constants.import).then(async result => 
                {
                    if (result === Constants.import)
                    {
                        this.showImportToServer(packagePaths, this._outputChannel, workspaceFolders);
                    }
                });
            }
        }
        catch (e)
        {
            this._outputChannel.appendLine('Error occurd while compiling and creating package:');
            this._outputChannel.appendLine(Controller.getErrorMessage(e));
            throw e;
        }
    }

    private async alNewPackage()
    {
        var outputChannel = this._outputChannel;
        try
        {
            let workspaceFolder = await UiHelpers.showWorkspaceFolderPick(await this._wsWorkspaceFilesServices.getWorkspaces({active: true, workspaceFilter: w => Promise.resolve(!w.virtual)}));
            if (!workspaceFolder)
                return;

            let checkingServer = this.ensureGoCurrentServer(workspaceFolder);
            let checkingPackageTools = this.ensurePackageTools(workspaceFolder);

            if (!(await checkingServer) || !(await checkingPackageTools))
            {
                return;
            }
    
            let packageService: PackageService = this._wsPackageService.getService(workspaceFolder);

            let targets = await packageService.getTargets();
            let target = await UiHelpers.showTargetPicks(targets);

            if (!target)
                return;
        
            outputChannel.clear();
            outputChannel.show();
            outputChannel.appendLine('Creating package ...');

            let packagePath = await window.withProgress({
                location: ProgressLocation.Notification,
                title: "Creating package ..."
            }, async (progress, token) => {
                return await packageService.newAlPackage(
                    workspaceFolder.uri.fsPath,
                    target, 
                    GitHelpers.getBranchName(workspaceFolder.uri.fsPath), 
                );
            });

            outputChannel.appendLine(`Package created: ${packagePath}.`);
            outputChannel.appendLine("Finished!");
            window.showInformationMessage(Resources.importServers, Constants.import).then(async result => 
            {
                if (result === Constants.import)
                {
                    this.showImportToServer([packagePath], this._outputChannel, [workspaceFolder]);
                }
            });
        }
        catch (e)
        {
            this._outputChannel.appendLine('Error occurd while compiling and creating package:');
            this._outputChannel.appendLine(Controller.getErrorMessage(e));
            throw e;
        }
    }

    private async newPackage()
    {
        var outputChannel = this._outputChannel;
        outputChannel.clear();
        outputChannel.show();
        outputChannel.appendLine('Creating package ...');
        try
        {
            let workspaceFolder = await UiHelpers.showWorkspaceFolderPick(await this._wsWorkspaceFilesServices.getWorkspaces({active: true, workspaceFilter: w => Promise.resolve(!w.virtual)}));

            if (!workspaceFolder)
                return;

            if (!await this.ensureGoCurrentServer(workspaceFolder))
                return;
    
            let packageService: PackageService = this._wsPackageService.getService(workspaceFolder);
           
            let targets = await packageService.getTargets();
            let target = await UiHelpers.showTargetPicks(targets);

            let packagePath = await window.withProgress({
                location: ProgressLocation.Notification,
                title: "Creating package ..."
            }, async (progress, token) => {
                return await packageService.newPackage(
                    GitHelpers.getBranchName(workspaceFolder.uri.fsPath),
                    target,
                    workspaceFolder.uri.fsPath
                );
            });

            outputChannel.appendLine(`Package created: ${packagePath}.`)
            outputChannel.appendLine("Finished!");
            window.showInformationMessage(Resources.importServers, Constants.import).then(async result => 
            {
                if (result === Constants.import)
                {
                    this.showImportToServer([packagePath], this._outputChannel, [workspaceFolder]);
                }
            });
        }
        catch (e)
        {
            this._outputChannel.appendLine('Error occurd while compiling and creating package:');
            this._outputChannel.appendLine(Controller.getErrorMessage(e));
            throw e;
        }
    }

    private async ensureGoCurrentServer(workspaceFolder: WorkspaceFolder): Promise<boolean>
    {
        let gocVersion = await this._packagePsService.getGoCurrentServerVersion();

        let packageId = 'go-current-server'

        if (gocVersion.IsInstalled && gocVersion.HasRequiredVersion)
            return true;
    
        let deployService = this._wsDeployServices.getService(workspaceFolder);
        let servers = await deployService.getServers();
        let isAvailable = await this._goCurrentPsService.testPackageAvailable(packageId, servers);

        let message = "Go Current server is required for this operation.";
        let button = Constants.buttonInstall
        if (gocVersion.IsInstalled)
        {
            message = `Go Current server v${gocVersion.RequiredVersion} or greater is required for this operation, you have v${gocVersion.CurrentVersion}.`
            button = Constants.buttonUpdate;
        }
        if (!isAvailable)
            button = Constants.buttonVisitWebsite;
        
        let result = await window.showWarningMessage(message, button);

        if (result === Constants.buttonInstall || result === Constants.buttonUpdate)
        {
            InstallHelpers.installPackage("go-current-server", this._goCurrentPsService, {restartPowerShell: true});
        }
        else if (result === Constants.buttonVisitWebsite)
        {
            vscode.env.openExternal(Uri.parse(Constants.gocServerUrl));
        }
        return false;
    }

    private async ensurePackageTools(workspaceFolder: WorkspaceFolder)
    {
        let packageId = "ls-package-tools"
        if (await this._goCurrentPsService.isInstalled([packageId]))
            return true;

        let deployService = this._wsDeployServices.getService(workspaceFolder);
        let servers = await deployService.getServers();
        let isAvailable = await this._goCurrentPsService.testPackageAvailable(packageId, servers);

        let message = "LSPackageTools are required for this operation."
        let button = Constants.buttonInstall;
        if (!isAvailable)
            button = Constants.buttonVisitWebsite;

        let result = await window.showWarningMessage(message, button);

        if (result === Constants.buttonInstall)
            InstallHelpers.installPackage(packageId, this._goCurrentPsService, {restartPowerShell: true});
        else if (result === Constants.buttonVisitWebsite)
            vscode.env.openExternal(Uri.parse(Constants.packageToolsUrl));

        return false;

    }

    private async getServersForWorkspaces(workspaceFolders: WorkspaceFolder[])
    {
        let servers: Server[] = []
        for (let workspaceFolder of workspaceFolders)
        {
            let workspaceServers = (await this._wsWorkspaceFilesServices.getService(workspaceFolder).projectFile.getData()).servers;

            if (!workspaceServers)
                continue;

            for (let server of workspaceServers)
            {
                if (!servers.some(s => s.host === server.host && s.port === server.port && s.identity === server.identity && s.useSsl === server.useSsl))
                {
                    servers.push(server);
                }
            }
        }

        return servers.sort((a, b) => {
            if (a.host < b.host)
                return -1
            if (a.host > b.host)
                return 1
            return 0;
        });
    }

    private async showImportToServer(paths: string[], outputChannel: OutputChannel, workspaceFolders: WorkspaceFolder[])
    {
        let servers = await this.getServersForWorkspaces(workspaceFolders)
        let serverPickHost = Constants.defaultHost;
        let serverPickPort = Constants.defaultManagementPort;
        if (servers && servers.length > 0)
        {
            let serverPick = await UiHelpers.showServersPick(servers);
            if (!serverPick)
                return;

            serverPickHost = serverPick.host;
            if(serverPick.managementPort)
                serverPickPort = serverPick.managementPort;
        }

        outputChannel.clear();
        outputChannel.show();
        outputChannel.appendLine('Importing package(s) to server ...');
        
        await window.withProgress({
            location: ProgressLocation.Notification,
            title: "Importing server ..."
        }, async (progress, token) => {
            let overwriteAll = false;
            for (let filePath of paths)
            {
                try
                {
                    await this._packagePsService.importPackage(
                        filePath,
                        serverPickHost,
                        serverPickPort,
                        overwriteAll
                    );
                }
                catch (error)
                {
                    //TODO in the future should filter through errorType
                    if (error.message.includes(Constants.packageAlreadyExists))
                    {
                        let buttons = [Constants.buttonOverwrite]
                        if (paths.length > 1)
                            buttons.push(Constants.buttonOverwriteAll)

                        let result = await window.showInformationMessage(error + " " + Resources.errorMessageForce, ...buttons);
                        if (!result)
                            return;
                            
                        if (result === Constants.buttonOverwriteAll)
                            overwriteAll = true;

                        if (result === Constants.buttonOverwrite || result === Constants.buttonOverwriteAll)
                        {
                            await this._packagePsService.importPackage(
                                filePath,
                                serverPickHost,
                                serverPickPort,
                                true
                            );
                        }
                    }
                    else
                    {
                        window.showErrorMessage(error.message);
                        outputChannel.appendLine(`Error: ${error.message}`)
                        outputChannel.appendLine(`Package was not imported to server ${serverPickHost}.`);
                        return
                    }
                }
                let fileName = path.basename(filePath);
                outputChannel.appendLine(`Package "${fileName}" imported to server: ${serverPickHost}.`);
            }
            
            outputChannel.appendLine("Finished!");
        });
    }
}