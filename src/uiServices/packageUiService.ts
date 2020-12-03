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
import { WorkspaceContainer } from "../workspaceService/services/workspaceContainer";
import { WorkspaceFilesService } from "../services/workspaceFilesService";
import { InstallHelpers } from "../helpers/installHelpers";

export class PackageUiService extends UiService
{
    private _wsDeployServices: WorkspaceContainer<DeployService>;
    private _wsAlServices: WorkspaceContainer<AlService>;
    private _wsPackageService: WorkspaceContainer<PackageService>;
    private _outputChannel: OutputChannel;
    private _packagePsService: PackagePsService;
    private _goCurrentPsService: GoCurrentPsService;
    private _wsWorkspaceFilesServices: WorkspaceContainer<WorkspaceFilesService>;
    
    constructor(
        context: ExtensionContext, 
        wsDeployServices: WorkspaceContainer<DeployService>,
        wsAlServices: WorkspaceContainer<AlService>,
        wsPackageService: WorkspaceContainer<PackageService>,
        packagePsService: PackagePsService,
        goCurrentPsService: GoCurrentPsService,
        wsWorkspaceFilesServices: WorkspaceContainer<WorkspaceFilesService>,
        outputChannel: OutputChannel
    )
    {
        super(context);
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
        this._outputChannel.clear();
        this._outputChannel.hide();
        this._outputChannel.show();
        try
        {
            let workspaceFolder = await UiHelpers.showWorkspaceFolderPick(await this._wsAlServices.getActiveWorkspaces());
            if (!workspaceFolder)
                return;
    
            let packageService: PackageService = this._wsPackageService.getService(workspaceFolder);

            let targets = await packageService.getTargets(undefined, true);
            let target = await UiHelpers.showTargetPicks(targets);

            if (!target)
                return;
            
            this._outputChannel.appendLine("Starting dependency download ...")
            
            let output = await window.withProgress({
                location: ProgressLocation.Notification,
                title: "Downloading dependencies (.alpackages + .netpackages) ..."
            }, async (progress, token) => {
                return await packageService.downloadAlDependencies(
                    workspaceFolder.uri.fsPath, 
                    target, 
                    GitHelpers.getBranchName(workspaceFolder.uri.fsPath),
                );
            });
            this._outputChannel.appendLine(output.output);
            this._outputChannel.appendLine("Dependencies downloaded.");
            window.showInformationMessage(Resources.dependenciesDownloadedReload, Constants.buttonReloadWindow).then(result => 
            {
                if (result === Constants.buttonReloadWindow)
                {
                    commands.executeCommand("workbench.action.reloadWindow");
                }
            });
        }
        catch (e)
        {
            Controller.handleError(e);
            this._outputChannel.appendLine('Error occurd while downloading dependencies:');
            this._outputChannel.appendLine(Controller.getErrorMessage(e));
        }
    }

    private async alCompileAndPackage()
    {
        var outputChannel = this._outputChannel;
        try
        {
            let workspaceFolder = await UiHelpers.showWorkspaceFolderPick(await this._wsAlServices.getActiveWorkspaces());
            if (!workspaceFolder)
                return;

            if (!await this.ensureGoCurrentServer(workspaceFolder))
                return;
    
            let packageService: PackageService = this._wsPackageService.getService(workspaceFolder);

            let targets = await packageService.getTargets();
            let target = await UiHelpers.showTargetPicks(targets);
        
            outputChannel.clear();
            outputChannel.show();
            outputChannel.appendLine('Compiling and creating package ...');

            await window.withProgress({
                location: ProgressLocation.Notification,
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
            this._outputChannel.appendLine('Error occurd while compiling and creating package:');
            this._outputChannel.appendLine(Controller.getErrorMessage(e));
        }
    }

    private async alNewPackage()
    {
        var outputChannel = this._outputChannel;
        try
        {
            let workspaceFolder = await UiHelpers.showWorkspaceFolderPick(await this._wsWorkspaceFilesServices.getActiveWorkspaces());
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

            outputChannel.appendLine(`Package created ${packagePath}.`);
        }
        catch (e)
        {
            Controller.handleError(e);
            this._outputChannel.appendLine('Error occurd while compiling and creating package:');
            this._outputChannel.appendLine(Controller.getErrorMessage(e));
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
            let workspaceFolder = await UiHelpers.showWorkspaceFolderPick(await this._wsWorkspaceFilesServices.getActiveWorkspaces());

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
        }
        catch (e)
        {
            Controller.handleError(e);
            this._outputChannel.appendLine('Error occurd while compiling and creating package:');
            this._outputChannel.appendLine(Controller.getErrorMessage(e));
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