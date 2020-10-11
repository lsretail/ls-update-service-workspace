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
import { Package } from "../models/projectFile";
import { PackagePsService } from "../packageService/services/packagePsService";
import { PackageService } from "../packageService/services/packageService";
import Resources from "../resources";
import { WorkspaceContainer } from "../workspaceService/services/workspaceContainer";
import { WorkspaceFilesService } from "../services/workspaceFilesService";

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
        this.registerCommand("go-current.al.downloadDependencies", () => this.alDownloadDependencies());
        this.registerCommand("go-current.al.compileAndPackage", () => this.alCompileAndPackage());
        this.registerCommand("go-current.al.newPackage", () => this.alNewPackage());
        this.registerCommand("go-current.newPackage", () => this.newPackage());
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
            if (output.dllsLocked)
            {
                window.showInformationMessage(Resources.dependenciesDownloadedReload, Constants.buttonReloadWindow).then(result => 
                {
                    if (result === Constants.buttonReloadWindow)
                    {
                        commands.executeCommand("workbench.action.reloadWindow");
                    }
                });
            }
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

            if (!await this.ensureGoCurrentServer(workspaceFolder))
                return;
    
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

        if (!gocVersion.IsInstalled)
        {
            let result = await window.showWarningMessage("Go Current server is required for this operation.", Constants.buttonInstall);
            if (result === Constants.buttonInstall)
            {
                this.installGocServer(workspaceFolder);
            }
            return false;
        }
        if (!gocVersion.HasRequiredVersion)
        {
            let result = await window.showWarningMessage(`Go Current server v${gocVersion.RequiredVersion} or greater is required for this operation, you have v${gocVersion.CurrentVersion}.`, Constants.buttonUpdate);
            if (result === Constants.buttonUpdate)
            {
                this.installGocServer(workspaceFolder);
            }
            return false;
        }
        return true;
    }

    private async installGocServer(workspaceFolder: WorkspaceFolder)
    {
        let packageId = 'go-current-server'

        let result = await window.withProgress({
            location: ProgressLocation.Notification
        }, async (progress, token) => 
        {
            progress.report({message: "Starting ..."})
            
            let deployService = this._wsDeployServices.getService(workspaceFolder);
            let servers = await deployService.getServers();

            let isAvailable = await this._goCurrentPsService.testPackageAvailable(packageId, servers);

            if (isAvailable)
            {
                progress.report({message: Resources.installationStartedInANewWindow})
                let packages: Package[] = [{id: packageId, version: ''}];
                return await this._goCurrentPsService.installPackages(packages, undefined, servers);
            }
            else
            {
                vscode.env.openExternal(Uri.parse(Constants.gocServerUrl));
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
}