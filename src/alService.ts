import { DeployService } from "./deployService";
import { PostDeployController } from "./postDeployController";
import { WorkspaceFolder, WorkspaceConfiguration } from "vscode";
import { GoCurrent } from "./GoCurrent";

export class AlService
{
    private _deployService: DeployService;
    private _goCurrent: GoCurrent;
    private _active: boolean;
    private _workspaceFolder: WorkspaceFolder;

    constructor(deployService: DeployService, goCurrent: GoCurrent, active: boolean, workspaceFolder: WorkspaceFolder)
    {
        this._deployService = deployService;
        this._active = active;
        this._workspaceFolder = workspaceFolder;
        this._goCurrent = goCurrent;
    }

    public isActive(): Boolean
    {
        return this._active;
    }

    public async RePopulateLaunchJson(): Promise<void>
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
}