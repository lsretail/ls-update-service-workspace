import { commands, window, ExtensionContext, workspace } from 'vscode';
import * as vscode from 'vscode'
import { Constants } from '../constants';
import { DeployService } from '../deployService/services/deployService';
import { UiService } from "../extensionController";
import { GoCurrentPsService } from '../goCurrentService/services/goCurrentPsService';
import { UiHelpers } from '../helpers/uiHelpers';
import { NewProjectService } from '../newProjectService/services/newProjectService';
import { PostDeployController } from '../postDeployController';
import Resources from '../resources';
import { WorkspaceFilesService } from '../services/workspaceFilesService';
import { WorkspaceContainer, WorkspaceContainerEvent } from '../workspaceService/services/workspaceContainer';

export class BaseUiService extends UiService
{
    private _goCurrentPsService: GoCurrentPsService;
    private _wsDeployServices: WorkspaceContainer<DeployService>;
    private _wsWorkspaceFileServices: WorkspaceContainer<WorkspaceFilesService>;
    private _disposable: vscode.Disposable;

    constructor(
        context: ExtensionContext,
        goCurrentPsService: GoCurrentPsService,
        wsDeployServices: WorkspaceContainer<DeployService>,
        wsWorkspaceFileServices: WorkspaceContainer<WorkspaceFilesService>
    )
    {
        super(context);
        this._goCurrentPsService = goCurrentPsService;
        this._wsDeployServices = wsDeployServices;
        this._wsWorkspaceFileServices = wsWorkspaceFileServices;
    }

    async activate(): Promise<void>
    {
        this.registerCommand("go-current.newProject", () => this.newProject());
        this.registerCommand("go-current.openWizard", () => this.openWizard());

        commands.executeCommand("setContext", Constants.goCurrentExtensionActive, true);

        let subscriptions: vscode.Disposable[] = [];
        this._wsWorkspaceFileServices.onDidChangeWorkspaceFolders(this.onWorkspaceChanges, this, subscriptions);
        this._disposable = vscode.Disposable.from(...subscriptions);

        this._goCurrentPsService.getGoCurrentVersion().then(gocVersion => {
            let goCurrentInstalled = gocVersion.IsInstalled;

            if (!goCurrentInstalled || !gocVersion.HasRequiredVersion)
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
                commands.executeCommand("setContext", Constants.goCurrentDeployActive, false);
                commands.executeCommand("setContext", Constants.goCurrentAlActive, false);
                commands.executeCommand("setContext", Constants.goCurrentDeployUpdatesAvailable, false);
            }
            else
            {
                this.checkForBaseUpdate();
            }
        });
    }

    private onWorkspaceChanges(e: WorkspaceContainerEvent<WorkspaceFilesService>)
    {
        this.checkAndUpdateIfActive();
        for (let workspaceFolder of e.workspaceChanges.added)
        {
            let subscriptions: vscode.Disposable[] = [];

            let service = e.workspaceContainer.getService(workspaceFolder);

            service.projectFile.onDidChange(e => {
                this.checkAndUpdateIfActive();
            }, subscriptions);

            e.pushSubscription(workspaceFolder, vscode.Disposable.from(...subscriptions));
        }
    }

    private async checkAndUpdateIfActive()
    {
        let anyActive = await this._wsWorkspaceFileServices.anyActive();
        let anyInactive = await this._wsWorkspaceFileServices.anyInactive();

        commands.executeCommand("setContext", Constants.goCurrentProjectFileActive, anyActive);
        commands.executeCommand("setContext", Constants.goCurrentProjectFileHasInactiveWorkspaces, anyInactive);
    }

    openWizard()
    {
        this._goCurrentPsService.openGoCurrentWizard();
    }

    private async checkForBaseUpdate()
    {
        let buttons: string[] = [Constants.buttonUpdate, Constants.buttonLater];
        var packages = await this._goCurrentPsService.getAvailableBaseUpdates();
        if (packages.length === 0)
            return;
        let packagesString = packages.map(p => `${p.Id} v${p.Version}`).join(', ');
        window.showInformationMessage(`Update available for "Go Current" (${packagesString})`, ...buttons).then(async result => {
            if (result === Constants.buttonUpdate)
            {
                let packages = await this._goCurrentPsService.installBasePackages();
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

    private async newProject()
    {
        let workspaceFolder = await UiHelpers.showWorkspaceFolderPick(await this._wsDeployServices.getInactiveWorkspaces());

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
                let licensePackageId = await window.showInputBox({prompt: Resources.specifyLicensePackage, ignoreFocusOut: true});
                if (licensePackageId)
                {
                    await newProjectService.addLicensePackage(licensePackageId);
                }
            }
        }

        newProjectService.dispose();
    }
}