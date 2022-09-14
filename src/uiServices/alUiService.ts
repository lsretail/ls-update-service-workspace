import path = require("path");
import { fileURLToPath, pathToFileURL } from "url";
import { format } from "util";
import { ProgressLocation, ExtensionContext, QuickPickOptions, window, commands, Disposable, WorkspaceFolder, Uri, FileChangeType } from "vscode";
import { AlService } from "../alService/services/alService";
import { Constants } from "../constants";
import { DeployService } from "../deployService/services/deployService";
import { UiService } from "../extensionController";
import { fsHelpers } from "../fsHelpers";
import { UiHelpers } from "../helpers/uiHelpers";
import { VirtualWorkspaces } from "../helpers/virtualWorkspaces";
import { WorkspaceHelpers } from "../helpers/workspaceHelpers";
import { Logger } from "../interfaces/logger";
import { PackageInfo } from "../interfaces/packageInfo";
import { QuickPickItemPayload } from "../interfaces/quickPickItemPayload";
import { NewProjectService } from "../newProjectService/services/newProjectService";
import { PostDeployController } from "../postDeployController";
import Resources from "../resources";
import { WorkspaceFilesService } from "../services/workspaceFilesService";
import { WorkspaceService } from "../workspaceService/services/workspaceService";
import { WorkspaceServiceProvider, WorkspaceContainerEvent } from "../workspaceService/services/workspaceServiceProvider";

export class AlUiService extends UiService
{
    private _wsAlServices: WorkspaceServiceProvider<AlService>;
    private _wsDeployService: WorkspaceServiceProvider<DeployService>;
    private _virtualWorkspaces: VirtualWorkspaces;
    private _wsWorkspaceFileServices: WorkspaceServiceProvider<WorkspaceFilesService>;
    private _disposable: Disposable;
    
    constructor(
        context: ExtensionContext, 
        logger: Logger,
        wsAlServices: WorkspaceServiceProvider<AlService>,
        wsDeployService: WorkspaceServiceProvider<DeployService>,
        virtualWorkspaces: VirtualWorkspaces,
        wsWorkspaceFileServices: WorkspaceServiceProvider<WorkspaceFilesService>
    )
    {
        super(context, logger);
        this._wsAlServices = wsAlServices;
        this._wsDeployService = wsDeployService;
        this._virtualWorkspaces = virtualWorkspaces;
        this._wsWorkspaceFileServices = wsWorkspaceFileServices
    }

    async activate(): Promise<void>
    {
        this.registerCommand("ls-update-service.al.repopulateLaunchJson", this.rePopulateLaunchJson);
        this.registerCommand("ls-update-service.al.unpublishApp", this.alUnpublishApp);
        this.registerCommand("ls-update-service.al.importLicense", this.alImportLicense);
        this.registerCommand("ls-update-service.al.upgradeData", this.alUpgradeData);
        this.registerCommand("ls-update-service.al.publishApp", this.alPublishApp);
        this.registerCommand("ls-update-service.al.addNewDependencies", this.alAddNewDependencies);

        this._disposable = this._wsAlServices.onDidChangeWorkspaceFolders(this.onWorkspaceChanges, this);
    }

    private onWorkspaceChanges(e: WorkspaceContainerEvent<AlService>)
    {
        for (let workspaceFolder of e.workspaceChanges.added)
        {
            let alService = e.workspaceContainer.getService(workspaceFolder);
            let deployService = this._wsDeployService.getService(workspaceFolder);
            let subscriptions: Disposable[] = [];
            
            alService.appJson.onDidChange(() => {
                this.checkAndUpdateIfActive();
            }, this, subscriptions);

            deployService.onDidProjectFileChange(() => {
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
        let workspaces = await this._wsAlServices.getWorkspaces({
            active: true,
            workspaceFilter: workspace => Promise.resolve(!workspace.virtual)
        });

        if (workspaces.length === 0)
            return;
        
        let updated = await window.withProgress({
            location: ProgressLocation.Notification,
            title: "Updating launch.json..."
        }, async () => {
            let updated: boolean = false;
            let cache = new Map<string, PackageInfo[]>();
            for (let workspace of workspaces)
            {
                updated = updated || await this.populateWorkspace(workspace, cache);
            }
            return updated;
        });

        if (!updated)
        {
            window.showInformationMessage(Resources.launchJsonAlreadyCoversAllYourBcInstance);
        }
    }

    private async populateWorkspace(workspaceFolder: WorkspaceFolder, addCache: Map<string, PackageInfo[]>): Promise<boolean>
    {
        let linkedWorkspaces = this._virtualWorkspaces.getWorkspacesLinkedFrom(workspaceFolder);
        linkedWorkspaces.push(workspaceFolder);

        let packages: PackageInfo[] = []

        for (let linkedWorkspace of linkedWorkspaces)
        {
            let linkedKey = WorkspaceService.getWorkspaceKey(linkedWorkspace)
            if (!addCache.has(linkedKey))
            {
                let alService = this._wsAlServices.getService(linkedWorkspace);
                let packages = await alService.getDeployedBcInstances();
                addCache.set(linkedKey, packages);
            }

            for (let packageItem of addCache.get(linkedKey))
            {
                if (!packages.some(p => p.InstanceName === packageItem.InstanceName))
                    packages.push(packageItem);
            }
        }

        let updated = await PostDeployController.addAlLaunchConfig(packages, workspaceFolder, true);
        return updated
    }

    private async alUnpublishApp()
    {
        let workspaceFolder = await UiHelpers.showWorkspaceFolderPick(await this._wsAlServices.getWorkspaces({active: true, workspaceFilter: w => Promise.resolve(!w.virtual)}));
        if (!workspaceFolder)
            return;

        let alService: AlService = this._wsAlServices.getService(workspaceFolder);
        
        let instance = await this.showAlInstancePicks(await this.getAllAlInstances());

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
    
    private async alImportLicense()
    {
        let workspaceFolder = await UiHelpers.showWorkspaceFolderPick(await this._wsAlServices.getWorkspaces({active: true, workspaceFilter: w => Promise.resolve(!w.virtual)}));
        if (!workspaceFolder)
            return;

        let alService: AlService = this._wsAlServices.getService(workspaceFolder);
        
        let instance = await this.showAlInstancePicks(await this.getAllAlInstances());

        if (!instance)
            return

        const result = await window.showOpenDialog({    
            filters: {
            'Package files (*.flf)': ['flf'],
            'Package files (*.bclicense)': ['bclicense']
          },
          canSelectFolders: false,
          canSelectFiles: true,
          canSelectMany: false,
          openLabel: 'Select license file ...',
        });    
        
        if (!result || result.length < 1) {
            return;
          }

        const filePath = result[0].fsPath;

        let fileName = fileURLToPath(filePath)

        //let fileName = Uri.file(filePath);

        //let fs = require("fs");
              
        /*if (!Buffer.isBuffer(fileName)) {
            fileName = await fs.readFile(
                (fileName)
            );
        }*/


        //fileName = fs.readFile(fileName);

        /*fs.readFile(fileName, 'utf8', (err, data) => {
            if (err) {
              console.error(err);
              return;
            }
            console.log(data);
          });*/

        window.showInformationMessage(`Selected file:` + fileName);
        console.log('Selected file: ' + fileName);

        let imported = await window.withProgress({
            location: ProgressLocation.Notification,
            title: "Importing license..."
        }, async () => {
            return await alService.importLicense(instance.InstanceName, fileName);
        });

        if (imported)
            window.showInformationMessage(`License imported.`);
        else
            window.showInformationMessage(`License already imported.`);
    } 

    private async showAlInstancePicks(instances: PackageInfo[]): Promise<PackageInfo>
    {        
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

    private async getAllAlInstances(): Promise<PackageInfo[]>
    {
        let alServices = await this._wsAlServices.getServices({active: true});
        let instances: PackageInfo[] = [];
        for (let service of alServices)
        {
            for (let instance of (await service.getInstances()))
            {
                if (!instances.filter(i => i.InstanceName === instance.InstanceName)[0])
                    instances.push(instance);
            }
        }
        instances.sort((a, b) => (a.InstanceName > b.InstanceName) ? 1 : -1)
        return instances;
    }

    private async alUpgradeData()
    {
        let workspaceFolder = await UiHelpers.showWorkspaceFolderPick(await this._wsAlServices.getWorkspaces({active: true, workspaceFilter: w => Promise.resolve(!w.virtual)}));
        if (!workspaceFolder)
            return;

        let alService: AlService = this._wsAlServices.getService(workspaceFolder);
        
        let instance = await this.showAlInstancePicks(await alService.getInstances());

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

    async alAddNewDependencies(item: any): Promise<void>
    {
        if (!item || !item.fsPath)
            return;

        let filePath = item.fsPath;

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

        let appIdToPackageIdMap = await WorkspaceHelpers.getAppIdPackageIdMapFromWorkspaces(this._wsWorkspaceFileServices);
        let count = await newProjectService.addDependenciesToProjectFileWithLoad(appIdToPackageIdMap);
        if (count > 0)
            window.showInformationMessage(format(Resources.dependenciesAddedToProject, count), );
        else
            window.showInformationMessage(Resources.noDependenciesAddedToProject);
    }

    async alPublishApp(): Promise<void>
    {
        let workspaceFolder = await UiHelpers.showWorkspaceFolderPick(await this._wsAlServices.getWorkspaces({active: true}));
        if (!workspaceFolder)
            return;

        let alService: AlService = this._wsAlServices.getService(workspaceFolder);

        let appFilePath = await alService.getAppFileName(true)
        if (!fsHelpers.existsSync(appFilePath))
        {
            window.showWarningMessage(`The app does not exists (${appFilePath}), compile the app to create the file and then try again.`);
            return;
        }

        let instance = await this.showAlInstancePicks(await alService.getInstances());

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