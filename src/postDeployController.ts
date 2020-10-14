
import {workspace, WorkspaceFolder, window, commands} from 'vscode'
import { PackageInfo } from './interfaces/packageInfo';
import { Constants } from './constants';
import Resources from './resources';
import * as util from 'util'
import { IWorkspaceService } from './workspaceService/interfaces/IWorkspaceService';

export class PostDeployController implements IWorkspaceService
{
    private _workspaceFolder: WorkspaceFolder;

    constructor(workspaceFolder: WorkspaceFolder)
    {
        this._workspaceFolder = workspaceFolder;
    }

    async isActive(): Promise<boolean> 
    {
        return true;
    }

    async dispose(): Promise<void> 
    {
    }

    public onPackagesDeployed(packages: PackageInfo[])
    {
        for (let packageInfo of packages)
        {
            if (packageInfo.Id === 'go-current-client')
                PostDeployController.processGoCurrent();

            if (packageInfo.Id === 'bc-al')
                PostDeployController.processVsExtension(packageInfo);

            if (packageInfo.Info && 'Type' in packageInfo.Info && packageInfo.Info.Type.includes("bc-server"))
            {
                PostDeployController.addAlLaunchConfig([packageInfo], this._workspaceFolder);
            }
        }
    }

    public async onInstanceRemoved(instanceName: string): Promise<void>
    {
        if (instanceName)
            await PostDeployController.removeAlLaunchConfig(instanceName);
    }

    public static async addAlLaunchConfig(packageInfos: PackageInfo[], workspaceFolder: WorkspaceFolder): Promise<boolean>
    {
        const launchConfig = workspace.getConfiguration('launch', workspaceFolder);
        let configurations: any[] = launchConfig['configurations'];
        
        let defaultValues: object = {
            schemaUpdateMode: "ForceSync",
            breakOnError: true,
            launchBrowser: true,
            enableLongRunningSqlStatements: true,
            enableSqlInformationDebugger: true,
            tenant: "default"
        };

        let properties = ["startupObjectType", "breakOnError", "launchBrowser", "enableLongRunningSqlStatements", "enableSqlInformationDebugger", "tenant", "schemaUpdateMode"]

        if (configurations)
        {
            let defaultFromConfig = configurations.filter(s => s.type === 'al')[0];
            PostDeployController.copyProperties(defaultFromConfig, defaultValues, properties);
        }
        else
        {
            configurations = [];
        }

        let updated = false;

        let instancesUpdated = []

        for (let packageInfo of packageInfos)
        {
            // Check if exists
            let exists = configurations.filter(s => s.type === 'al' && s.name.includes("(Go Current)") && s.serverInstance === packageInfo.Info.ServerInstance)
            if (exists.length > 0)
                continue;

            updated = true;

            let launch: any = {};

            let info = packageInfo.Info;
            launch.type = "al";
            launch.request = "launch";
            launch.name = packageInfo.InstanceName + " (Go Current)";
            launch.server = info.Server;
            if (info.Port)
                launch.port = info.Port;
            launch.serverInstance = info.ServerInstance;
            launch.authentication = info.Authentication;

            if ((typeof launch.authentication || launch.authentication instanceof String) && (<string>launch.authentication).toLowerCase() === "accesscontrolservice")
            {
                launch.authentication = "AAD";
            }

            if (info.ServerConfig)
                launch.port = parseInt(info.ServerConfig.DeveloperServicesPort);


            PostDeployController.copyProperties(defaultValues, launch, properties);

            configurations.push(launch);
    
            instancesUpdated.push(packageInfo.InstanceName);
        }

        try
        {
            await launchConfig.update('configurations', configurations, null);
            for (let instance of instancesUpdated)
                window.showInformationMessage(util.format(Resources.launchJsonUpdatedWith, instance));
        }
        catch (error)
        {
            window.showErrorMessage(`Error occurred while updating launch.json: ${error}`);
        }

        return updated;
    }

    private static copyProperties(srcObj: object, destObj: object, properties: string[])
    {
        if (!srcObj || typeof srcObj !== 'object')
            return;

        if (!destObj || typeof destObj !== 'object')
            return

        for (let property of properties)
        {
            if (srcObj[property])
            {
                destObj[property] = srcObj[property];
            }
        }
    }

    public static async removeAlLaunchConfig(instanceName: string): Promise<void>
    {
        let configName = instanceName + " (Go Current)";
        const launchConfig = workspace.getConfiguration('launch');
        let configurations: any[] = launchConfig['configurations'];
        configurations = configurations.filter(s => !(s.type === 'al' && s.name === configName));
        await launchConfig.update('configurations', configurations, null).then(()=>{}, error => {
            window.showErrorMessage(`Error occurred while updating launch.json: ${error}`);
        });
    }

    public static async removeNonExisting(instanceNames: string[]): Promise<boolean>
    {
        const launchConfig = workspace.getConfiguration('launch');
        let configurations: any[] = launchConfig['configurations'];
        
        let configNames = instanceNames.map(i => `${i} (Go Current)`);


        let count = configurations.length;
        configurations = configurations.filter(s => !(s.type === 'al' && s.name.includes("(Go Current)") && !configNames.includes(s.name)));
        let updated = count - configurations.length > 0
        
        try
        {
            await launchConfig.update('configurations', configurations, null)
            return updated;
        }
        catch (error)
        {
            window.showErrorMessage(`Error occurred while updating launch.json: ${error}`);
            return false;
        }
    }

    public static processVsExtension(packageInfo: PackageInfo)
    {
        window.showInformationMessage(util.format(Resources.extensionUpdated, packageInfo.Id), Constants.buttonReloadWindow).then(result =>
        {
            if (result === Constants.buttonReloadWindow)
                commands.executeCommand("workbench.action.reloadWindow");
        });
    }

    public static processGoCurrent()
    {
        window.showInformationMessage(Resources.goCurrentUpdated, Constants.buttonReloadWindow).then(result =>
        {
            if (result === Constants.buttonReloadWindow)
                commands.executeCommand("workbench.action.reloadWindow");
        });
    }
}