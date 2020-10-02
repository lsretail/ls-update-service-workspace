import path = require("path");
import { format } from "util";
import { OutputChannel, ProgressLocation, ExtensionContext, QuickPickOptions, window, WorkspaceFoldersChangeEvent, workspace, commands, Disposable } from "vscode";
import { AlService } from "../alService/services/alService";
import { Constants } from "../constants";
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
    private _disposable: Disposable;
    
    constructor(
        context: ExtensionContext, 
        wsAlServices: WorkspaceContainer<AlService>
    )
    {
        super(context);
        this._wsAlServices = wsAlServices;
    }

    async activate(): Promise<void>
    {
        this.registerCommand("go-current.al.repopulateLaunchJson", () => this.rePopulateLaunchJson());
        this.registerCommand("go-current.al.unpublishApp", () => this.alUnpublishApp());
        this.registerCommand("go-current.al.upgradeData", () => this.alUpgradeData());
        this.registerCommand("go-current.al.addNewDependencies", (...args) => this.alAddNewDependencies(args));

        this._disposable = this._wsAlServices.onDidChangeWorkspaceFolders(this.onWorkspaceChanges, this);
    }

    private onWorkspaceChanges(e: WorkspaceContainerEvent<AlService>)
    {
        for (let workspaceFolder of e.workspaceChanges.added)
        {
            let service = e.workspaceContainer.getService(workspaceFolder);
            let disposable = service.appJson.onDidChange(e => {
                this.checkAndUpdateIfActive();
            }, this);
            e.pushSubscription(workspaceFolder, disposable);
        }

        this.checkAndUpdateIfActive();
    }

    private onAppJsonChanged(e: JsonData<AppJson>)
    {
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
}