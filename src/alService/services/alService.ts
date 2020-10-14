import { DeployService } from "../../deployService/services/deployService";
import { PostDeployController } from "../../postDeployController";
import { Disposable, WorkspaceFolder } from "vscode";
import { AlPsService } from "./alPsService";
import { PackageInfo } from "../../interfaces/packageInfo";
import { Constants } from "../../constants";
import { fsHelpers } from "../../fsHelpers";
import * as path from 'path'
import { AlApp } from "../interfaces/alApp";
import { JsonData } from "../../jsonData";
import { IWorkspaceService } from "../../workspaceService/interfaces/IWorkspaceService";
import { AppJson } from "../../newProjectService/interfaces/appJson";
import { promises } from "fs";

export class AlService implements IWorkspaceService
{
    private _deployService: DeployService;
    private _alPsService: AlPsService;
    private _workspaceFolder: WorkspaceFolder;
    private _appJson: JsonData<AppJson>;
    private _disposable: Disposable;

    constructor(
        deployService: DeployService, 
        alPsService: AlPsService,
        appJson: JsonData<AppJson>,
        workspaceFolder: WorkspaceFolder
    )
    {
        this._deployService = deployService;
        this._workspaceFolder = workspaceFolder;
        this._alPsService = alPsService;
        this._appJson = appJson;
    }

    async dispose(): Promise<void> 
    {
        this._disposable?.dispose();
    }

    public async isActive(): Promise<boolean>
    {
        return (await this._deployService.isActive()) && this._appJson.exists();
    }

    get appJson(): JsonData<AppJson>
    {
        return this._appJson;
    }

    public async rePopulateLaunchJson(): Promise<boolean>
    {
        let toPopulate = [];

        for (let deployment of await this._deployService.getDeployments())
        {
            if (!deployment.instanceName)
                continue;

            let serverPackage = await this._deployService.goCurrentService.getInstalledPackages('bc-server', deployment.instanceName);

            if (serverPackage.length === 0)
                continue;

            toPopulate.push(serverPackage[0]);
        }

        let updated = await PostDeployController.addAlLaunchConfig(toPopulate, this._workspaceFolder)

        let instances = (await this._deployService.getDeployedInstances());
        updated = updated || await PostDeployController.removeNonExisting(instances, this._workspaceFolder);

        return updated
    }

    public async publishApp(isntanceName: string): Promise<void>
    {
        let appPath = await this.getAppFileName(true);
        return await this._alPsService.publishApp(isntanceName, appPath);
    }

    public async doesAppFileExists(): Promise<boolean>
    {
        let appPath = await this.getAppFileName(true);
        return fsHelpers.existsSync(appPath);
    }

    public async unpublishApp(instanceName: string) : Promise<boolean>
    {
        let appData = await this._appJson.getData();
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

            let serverPackage = await this._deployService.goCurrentService.getInstalledPackages('bc-server', deployment.instanceName);

            if (serverPackage.length === 0)
                continue;

                instances.push(serverPackage[0]);
        }

        return instances;
    }

    public async getAppFileName(includeDir: boolean): Promise<string>
    {
        let data = await this.appJson.getData();
        let fileName = `${data.publisher}_${data.name}_${data.version}.app`

        if (includeDir)
            return path.join(this._workspaceFolder.uri.fsPath, fileName);
        return fileName;
    }
}