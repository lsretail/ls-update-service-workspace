
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

            if ('Type' in packageInfo.Info)
            {
                for (let type of packageInfo.Info.Type)
                {
                    if (type === 'nav-server')
                        this.processNavServer(packageInfo);
                }
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
                found = true;
                if (packageInfo.Info.Server)
                    section.server = packageInfo.Info.Server
                if (packageInfo.Info.ServiceInstance)
                    section.serverInstance = packageInfo.Info.ServerInstance;
                if (packageInfo.Info.Authentication)
                    section.authentication = packageInfo.Info.Authentication;
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