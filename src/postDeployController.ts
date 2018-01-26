
import {workspace, WorkspaceFolder, window, Uri, MessageOptions, commands} from 'vscode'
import { PackageInfo } from './interfaces/packageInfo';
import * as path from 'path'
import { Constants } from './constants';
import { fsHelpers } from './fsHelpers';
import Resources from './resources';
import * as util from 'util'

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
            if (packageInfo.Id === 'nav-al')
                this.processVsExtension(packageInfo);

            if (packageInfo.Info && 'Type' in packageInfo.Info && packageInfo.Info.Type.includes("nav-server"))
            {
                this.processNavServer(packageInfo);
            }
        }
    }

    private processNavServer(packageInfo: PackageInfo)
    {
        if (
            !("Type" in packageInfo.Info) ||
            !packageInfo.Info.Type.includes("nav-server") ||
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

    private processVsExtension(packageInfo: PackageInfo)
    {
        window.showInformationMessage(util.format(Resources.extensionUpdated, packageInfo.Id), Constants.buttonReloadWindow).then(result =>
        {
            if (result === Constants.buttonReloadWindow)
                commands.executeCommand("workbench.action.reloadWindow");
        });
    }
}