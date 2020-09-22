import { DeployService } from "../../deployService/services/deployService";
import { PostDeployController } from "../../postDeployController";
import { WorkspaceFolder, WorkspaceConfiguration } from "vscode";
import { DeployPsService } from "../../deployService/services/deployPsService";
import { AlPsService } from "./alPsService";
import { PackageInfo } from "../../interfaces/packageInfo";
import { Constants } from "../../constants";
import { fsHelpers } from "../../fsHelpers";
import * as path from 'path'
import { AlApp } from "../interfaces/alApp";
import { JsonData } from "../../jsonData";
import { AlExtensionService } from "../../packageService/services/alExtensionService";

export class AlService
{
    private _deployService: DeployService;
    private _alPsService: AlPsService;
    private _active: boolean = false;
    private _workspaceFolder: WorkspaceFolder;
    private _alApp: JsonData<AlApp>;

    constructor(
        deployService: DeployService, 
        alPsService: AlPsService,
        workspaceFolder: WorkspaceFolder
    )
    {
        this._deployService = deployService;
        this._workspaceFolder = workspaceFolder;
        this._alPsService = alPsService;
        this._active = fsHelpers.existsSync(path.join(workspaceFolder.uri.fsPath, Constants.alProjectFileName));
    }

    public isActive(): Boolean
    {
        return this._deployService.isActive() && this._active;
    }

    public get alApp(): JsonData<AlApp>
    {
        if (!this._alApp)
            this._alApp = new JsonData<AlApp>(path.join(this._workspaceFolder.uri.fsPath, Constants.alProjectFileName));
        return this._alApp;
    }

    public async rePopulateLaunchJson(): Promise<void>
    {
        let toPopulate = [];

        for (let deployment of await this._deployService.getDeployments())
        {
            if (!deployment.instanceName)
                continue;

            let serverPackage = await this._deployService.getInstalledPackages('bc-server', deployment.instanceName);

            if (serverPackage.length === 0)
                continue;

            toPopulate.push(serverPackage[0]);
        }

        await PostDeployController.addAlLaunchConfig(toPopulate, this._workspaceFolder)

        let instances = (await this._deployService.getDeployedInstances());
        await PostDeployController.removeNonExisting(instances);
    }

    public async unpublishApp(instanceName: string) : Promise<boolean>
    {
        let appData = await this.alApp.getData();
        return await this._alPsService.unpublishApp(instanceName, appData.id);
    }

    public async upgradeData(instanceName: string) : Promise<string[]>
    {
        return await this._alPsService.upgradeData(instanceName);
    }

    public async getInstances(): Promise<PackageInfo[]>
    {
        let instances = [];

        for (let deployment of await this._deployService.getDeployments())
        {
            if (!deployment.instanceName)
                continue;

            let serverPackage = await this._deployService.getInstalledPackages('bc-server', deployment.instanceName);

            if (serverPackage.length === 0)
                continue;

                instances.push(serverPackage[0]);
        }

        return instances;
    }
}