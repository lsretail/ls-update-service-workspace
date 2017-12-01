
import PowerShell from './PowerShell'
import {PackageInfo} from './interfaces/packageInfo';

export class GoCurrent
{
    private _powerShell: PowerShell

    constructor(powerShell: PowerShell, modulePath: string)
    {
        this._powerShell = powerShell;
        this._powerShell.addModuleFromPath(modulePath);
    }

    public getTestString(): Promise<string>
    {
        let param = {
            'Value': 'input parameter'
        }
        return this._powerShell.executeCommandSafe("Get-TestString", false, param);
    }

    public installDeploymentSet(projectFilePath: string, deploymentSetName: string, instanceName: string) : Promise<PackageInfo[]>
    {
        let param = {
            'ProjectFilePath': projectFilePath,
            'DeploymentName': deploymentSetName,
        }
        if (instanceName)
            param['InstanceName'] = instanceName;
        return this._powerShell.executeCommandSafe("Install-DeploymentSet", true, param);
    }

    public updateDeploymentSet(projectFilePath: string, deploymentSetName: string, instanceName: string)
    {
        let param = {
            'ProjectFilePath': projectFilePath,
            'DeploymentSetName': deploymentSetName,
            'InstanceName': instanceName
        }
        return this._powerShell.executeCommandSafe("Update-DeploymentSet", false, param);
    }

    public getAvailableUpdates(projectFilePath: string, deploymentSetName: string, instanceName: string)
    {
        let param = {
            'ProjectFilePath': projectFilePath,
            'DeploymentName': deploymentSetName,
        }
        if (instanceName)
            param['InstanceName'] = instanceName;
        return this._powerShell.executeCommandSafe("Get-AvailableUpdates", true, param);
    }

    public removeDeploymentSet(projectFilePath: string, deploymentSetName: string, instanceName: string)
    {
        let param = {
            'ProjectFilePath': projectFilePath,
            'DeploymentSetName': deploymentSetName,
            'InstanceName': instanceName
        }
        return this._powerShell.executeCommandSafe("Remove-DeploymentSet", false, param);
    }


    public testGoCurrentInstalled(): Promise<boolean>
    {
        return this._powerShell.executeCommandSafe("Test-GoCurrentInstalled", true);
    }

    public testIsInstance(projectFilePath: string, deploymentName: string) : Promise<any>
    {
        let param = {
            'ProjectFilePath': projectFilePath,
            'DeploymentName': deploymentName
        };

        return this._powerShell.executeCommandSafe("Test-IsInstance", true, param);
    }

    public testInstanceExists(instanceName: string): Promise<boolean>
    {
        return this._powerShell.executeCommandSafe("Test-InstanceExists", true, {"InstanceName": instanceName});
    }

    public testCanInstall(projectFilePath: string, deploymentName: string): Promise<boolean>
    {
        return this._powerShell.executeCommandSafe("Test-CanInstall", true, {"ProjectFilePath": projectFilePath, "deploymentName": deploymentName})
    }
}