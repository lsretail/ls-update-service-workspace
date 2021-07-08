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
import { Package, Server } from "../models/projectFile";
import { PackagePsService } from "../packageService/services/packagePsService";
import { PackageService } from "../packageService/services/packageService";
import Resources from "../resources";
import { WorkspaceServiceProvider } from "../workspaceService/services/workspaceServiceProvider";
import { WorkspaceFilesService } from "../services/workspaceFilesService";
import { InstallHelpers } from "../helpers/installHelpers";
import { Logger } from "../interfaces/logger";
import { WorkspaceHelpers } from "../helpers/workspaceHelpers";

export class PackageUiService extends UiService
{
    private _wsDeployServices: WorkspaceServiceProvider<DeployService>;
    private _wsAlServices: WorkspaceServiceProvider<AlService>;
    private _wsPackageService: WorkspaceServiceProvider<PackageService>;
    private _outputChannel: OutputChannel;
    private _packagePsService: PackagePsService;
    private _goCurrentPsService: GoCurrentPsService;
    private _wsWorkspaceFilesServices: WorkspaceServiceProvider<WorkspaceFilesService>;
    
    constructor(
        context: ExtensionContext, 
        logger: Logger,
        wsDeployServices: WorkspaceServiceProvider<DeployService>,
        wsAlServices: WorkspaceServiceProvider<AlService>,
        wsPackageService: WorkspaceServiceProvider<PackageService>,
        packagePsService: PackagePsService,
        goCurrentPsService: GoCurrentPsService,
        wsWorkspaceFilesServices: WorkspaceServiceProvider<WorkspaceFilesService>,
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
        
        if (!workspaceFolders)
            return;
        let targetArray: string[]=[];
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
        target = await UiHelpers.showTargetPicks(targetArrayNoDuplicates);
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

    private async alCompileAndPackage()
    {
        var outputChannel = this._outputChannel;
        try
        {
            let workspaceFolders = await UiHelpers.showWorkspaceFolderPicks(await this._wsAlServices.getWorkspaces({active: true, workspaceFilter: w => Promise.resolve(!w.virtual)}));
            if (!workspaceFolders)
                return;
            let projectDirs : string[] = [];
            for (let workspaceFolder of workspaceFolders)   
            {
                if (!await this.ensureGoCurrentServer(workspaceFolder))
                    return;
                projectDirs.push(workspaceFolder.uri.fsPath);
            }   
            outputChannel.clear();
            outputChannel.show();
            outputChannel.appendLine('Starting to compile and creating a package ...');

            await window.withProgress({
                location: ProgressLocation.Notification,
                title: "Compiling and creating package ..."
            }, async (progress, token) => {
                let output = await this._packagePsService.invokeAlProjectBuild(
                    projectDirs
                );
                outputChannel.appendLine(output);
                outputChannel.appendLine("Finished!");
            });
            
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
}