import path = require("path");
import { format } from "util";
import { OutputChannel, ProgressLocation, ExtensionContext, QuickPickOptions, window, WorkspaceFoldersChangeEvent, workspace, commands, Disposable } from "vscode";
import { AlService } from "../alService/services/alService";
import { Constants } from "../constants";
import { DeployService } from "../deployService/services/deployService";
import { UiService } from "../extensionController";
import { fsHelpers } from "../fsHelpers";
import { UiHelpers } from "../helpers/uiHelpers";
import { WorkspaceHelpers } from "../helpers/workspaceHelpers";
import { PackageInfo } from "../interfaces/packageInfo";
import { QuickPickItemPayload } from "../interfaces/quickPickItemPayload";
import { JsonData } from "../jsonData";
import { AppJson } from "../newProjectService/interfaces/appJson";
import { NewProjectService } from "../newProjectService/services/newProjectService";
import { PackageService } from "../packageService/services/packageService";
import Resources from "../resources";
import { WorkspaceFilesService } from "../services/workspaceFilesService";
import { WorkspaceContainer, WorkspaceContainerEvent } from "../workspaceService/services/workspaceContainer";

export class AlUiService extends UiService
{
    private _wsAlServices: WorkspaceContainer<AlService>;
    private _wsDeployService: WorkspaceContainer<DeployService>;
    private _disposable: Disposable;
    
    constructor(
        context: ExtensionContext, 
        wsAlServices: WorkspaceContainer<AlService>,
        wsDeployService: WorkspaceContainer<DeployService>
    )
    {
        super(context);
        this._wsAlServices = wsAlServices;
        this._wsDeployService = wsDeployService;
    }

    async activate(): Promise<void>
    {
        this.registerCommand("go-current.al.repopulateLaunchJson", async () => await this.rePopulateLaunchJson());
        this.registerCommand("go-current.al.unpublishApp", async () => await this.alUnpublishApp());
        this.registerCommand("go-current.al.upgradeData", async () => await this.alUpgradeData());
        this.registerCommand("go-current.al.publishApp", async () => await this.alPublishApp());
        this.registerCommand("go-current.al.addNewDependencies", async (...args) => await this.alAddNewDependencies(args));

        this._disposable = this._wsAlServices.onDidChangeWorkspaceFolders(this.onWorkspaceChanges, this);
    }

    private onWorkspaceChanges(e: WorkspaceContainerEvent<AlService>)
    {
        for (let workspaceFolder of e.workspaceChanges.added)
        {
            let alService = e.workspaceContainer.getService(workspaceFolder);
            let deployService = this._wsDeployService.getService(workspaceFolder);
            let subscriptions: Disposable[] = [];
            
            alService.appJson.onDidChange(e => {
                this.checkAndUpdateIfActive();
            }, this, subscriptions);

            deployService.onDidProjectFileChange(e => {
                this.checkAndUpdateIfActive();
            },this, subscriptions);

            e.pushSubscription(workspaceFolder, Disposable.from(...subscriptions));
        }

        this.checkAndUpdateIfActive();
    }

    private async checkAndUpdateIfActive()
    {
        let anyActive = await this._wsAlServices.anyActive();
        commands.executeCommand("setContext", Constants.goCurrentAlActive, anyActive);
    }

    private async rePopulateLaunchJson()
    {
        let workspaceFolder = await UiHelpers.showWorkspaceFolderPick(await this._wsAlServices.getActiveWorkspaces());
        if (!workspaceFolder)
            return;
        
        let alService: AlService = this._wsAlServices.getService(workspaceFolder);

        let updated = await alService.rePopulateLaunchJson();

        if (!updated)
        {
            window.showInformationMessage(Resources.launchJsonAlreadyCoversAllYourBcInstance);
        }
    }

    private async alUnpublishApp()
    {
        let workspaceFolder = await UiHelpers.showWorkspaceFolderPick(await this._wsAlServices.getActiveWorkspaces());
        if (!workspaceFolder)
            return;

        let alService: AlService = this._wsAlServices.getService(workspaceFolder);
        
        let instance = await this.showAlInstancePicks(alService);

        if (!instance)
            return

        let unpublished = await window.withProgress({
            location: ProgressLocation.Notification,
            title: "Unpublishing app..."
        }, async () => {
            return await alService.unpublishApp(instance.InstanceName);
        });

        if (unpublished)
            window.showInformationMessage(`App unpublished.`);
        else
            window.showInformationMessage(`App already unpublished.`);
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

    private async alUpgradeData()
    {
        let workspaceFolder = await UiHelpers.showWorkspaceFolderPick(await this._wsAlServices.getActiveWorkspaces());
        if (!workspaceFolder)
            return;

        let alService: AlService = this._wsAlServices.getService(workspaceFolder);
        
        let instance = await this.showAlInstancePicks(alService);

        if (!instance)
            return

        let appsUpgraded = await window.withProgress({
            location: ProgressLocation.Notification,
            title: `Running data upgrade on "${instance.InstanceName}"...`
        }, async () => {
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
        
        let newProjectService = new NewProjectService(workspaceFolder);

        let count = await newProjectService.addDependenciesToProjectFileWithLoad();
        if (count > 0)
            window.showInformationMessage(format(Resources.dependenciesAddedToProject, count), );
        else
            window.showInformationMessage(Resources.noDependenciesAddedToProject);
    }

    async alPublishApp(): Promise<void>
    {
        let workspaceFolder = await UiHelpers.showWorkspaceFolderPick(await this._wsAlServices.getActiveWorkspaces());
        if (!workspaceFolder)
            return;

        let alService: AlService = this._wsAlServices.getService(workspaceFolder);

        let appFilePath = await alService.getAppFileName(true)
        if (!fsHelpers.existsSync(appFilePath))
        {
            window.showWarningMessage(`The app does not exists (${appFilePath}), compile the app to create the file and then try again.`);
            return;
        }

        let instance = await this.showAlInstancePicks(alService);

        if (!instance)
            return

        await window.withProgress({
            location: ProgressLocation.Notification,
            title: `Publishing app to "${instance.InstanceName}"...`
        }, async () => {
            return await alService.publishApp(instance.InstanceName);
        });


        window.showInformationMessage("App published.");
    }
}