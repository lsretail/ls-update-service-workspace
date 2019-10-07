
import {workspace, WorkspaceFolder, window, Uri, MessageOptions, commands, ConfigurationTarget} from 'vscode'
import { PackageInfo } from './interfaces/packageInfo';
import * as path from 'path'
import { Constants } from './constants';
import { fsHelpers } from './fsHelpers';
import Resources from './resources';
import * as util from 'util'
import { GoCurrent } from './GoCurrent';

export class PostDeployController
{
    private _workspaceFolder: WorkspaceFolder;

    constructor(workspaceFolder: WorkspaceFolder)
    {
        this._workspaceFolder = workspaceFolder;
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
                PostDeployController.addAlLaunchConfig(packageInfo);
            }
        }
    }

    public onInstanceRemoved(instanceName: string)
    {
        if (instanceName)
            PostDeployController.removeAlLaunchConfig(instanceName);
    }

    private processNavServer(packageInfo: PackageInfo)
    {
        if (
            !("Type" in packageInfo.Info) ||
            !packageInfo.Info.Type.includes("bc-server") ||
            !("Server" in packageInfo.Info)
        )
        {
            return;
        }
        const launchConfig = workspace.getConfiguration('launch');
        const configurations = launchConfig['configurations'];
        let found = false;
        for (let section of configurations)
        {
            if (section.type === "al")
            {
                if (packageInfo.Info.Server && section.server !== packageInfo.Info.Server)
                {
                    section.server = packageInfo.Info.Server
                    found = true;
                }
                if (packageInfo.Info.ServerInstance && section.serverInstance !== packageInfo.Info.ServerInstance)
                {
                    section.serverInstance = packageInfo.Info.ServerInstance;
                    found = true;
                }
                if (packageInfo.Info.Authentication && section.authentication !== packageInfo.Info.Authentication)
                {
                    section.authentication = packageInfo.Info.Authentication;
                    found = true;
                }
                if (packageInfo.Info.ServerConfig && packageInfo.Info.ServerConfig.DeveloperServicesPort && section.port !== packageInfo.Info.ServerConfig.DeveloperServicesPort)
                {
                    section.port = packageInfo.Info.ServerConfig.DeveloperServicesPort;
                    found = true;
                }
            }
        }
        if (found)
        {
            window.showInformationMessage(Resources.updateLaunchJson, Constants.buttonYes, Constants.buttonNo).then(result => {
                if (result === Constants.buttonYes)
                {
                    launchConfig.update('configurations', configurations, false).then(result=>{}, error => {
                        window.showErrorMessage(`Error occurred while updating launch.json: ${error}`);
                    });
                }
            });
        }
    }

    public static addAlLaunchConfig(packageInfo: PackageInfo)
    {
        const launchConfig = workspace.getConfiguration('launch');
        let configurations: any[] = launchConfig['configurations'];
        
        let defaultValues: any;

        if (configurations)
            defaultValues = configurations.filter(s => s.type === 'al')[0];
        else
            configurations = [];

        if (!defaultValues)
            defaultValues = {};
        if (!defaultValues.startupObjectId)
            defaultValues.startupObjectId = 22;
        if (!defaultValues.schemaUpdateMode)
            defaultValues.schemaUpdateMode = "Synchronize";

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
        if (info.ServerConfig)
            launch.port = parseInt(info.ServerConfig.DeveloperServicesPort);
        launch.schemaUpdateMode = defaultValues.schemaUpdateMode;
        launch.startupObjectId = defaultValues.startupObjectId;
        configurations.push(launch);
        launchConfig.update('configurations', configurations, false).then(result=>{
            window.showInformationMessage(`Launch.json updated for package "${packageInfo.Id}".`);
        }, error => {
            window.showErrorMessage(`Error occurred while updating launch.json: ${error}`);
        });
    }

    public static removeAlLaunchConfig(instanceName)
    {
        let configName = instanceName + " (Go Current)";
        const launchConfig = workspace.getConfiguration('launch');
        let configurations: any[] = launchConfig['configurations'];
        configurations = configurations.filter(s => !(s.type === 'al' && s.name === configName));
        launchConfig.update('configurations', configurations, false).then(result=>{}, error => {
            window.showErrorMessage(`Error occurred while updating launch.json: ${error}`);
        });
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