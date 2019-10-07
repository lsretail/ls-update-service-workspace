
import {PowerShell} from './PowerShell'
import {PackageInfo} from './interfaces/packageInfo';

export class GoCurrent
{
    private _modulePath: string;

    private _powerShell: PowerShell;
    private _powerShellLongRunning: PowerShell;

    constructor(powerShell: PowerShell, modulePath: string)
    {
        this._powerShell = powerShell;
        this._powerShell.addModuleFromPath(modulePath);
        this._powerShell.setRunWithNext("trap{if (Invoke-ErrorHandler $_) { continue };}");
        this._modulePath = modulePath;
    }

    private get longRunning()
    {
        if (!this._powerShellLongRunning)
        {
            this._powerShellLongRunning = new PowerShell();
            this._powerShellLongRunning.addModuleFromPath(this._modulePath);
            this._powerShellLongRunning.setRunWithNext("trap{if (Invoke-ErrorHandler $_) { continue };}");
        }
        return this._powerShellLongRunning;
    }

    public getTestString(): Promise<string>
    {
        let param = {
            'Value': 'input parameter'
        }
        return this._powerShell.executeCommandSafe("Get-TestString", false, param);
    }

    public installPackageGroup(projectFilePath: string, packageGroupName: string, instanceName: string, argumentsFilePath: string) : Promise<PackageInfo[]>
    {
        let param = {
            'ProjectFilePath': projectFilePath,
            'PackageGroupName': packageGroupName,
        }
        if (instanceName)
            param['InstanceName'] = instanceName;
        if (argumentsFilePath)
            param['ArgumentsFilePath'] = argumentsFilePath;
        return this.longRunning.executeCommandSafe("Install-PackageGroupNew", true, param);
    }

    public getAvailableUpdates(projectFilePath: string, packageGroupName: string, instanceName: string, selectedPackages: string[])
    {
        let param = {
            'ProjectFilePath': projectFilePath,
            'PackageGroupName': packageGroupName,
            'SelectedPackages': selectedPackages
        }
        
        if (instanceName)
            param['InstanceName'] = instanceName;

        return this._powerShell.executeCommandSafe("Get-AvailableUpdates", true, param);
    }

    public installBasePackages() : Promise<PackageInfo[]>
    {
        return this._powerShell.executeCommandSafe("Install-BasePackages", true, {});
    }

    public getAvailableBaseUpdates() : Promise<PackageInfo[]>
    {
        return this._powerShell.executeCommandSafe("Get-AvailableBaseUpdates", true, {});
    }

    public removeDeployment(workspaceDataPath: string, deploymentGuid: string) : Promise<any>
    {
        let param = {
            'WorkspaceDataPath': workspaceDataPath,
            'DeploymentGuid': deploymentGuid,
        }
        return this.longRunning.executeCommandSafe("Remove-Deployment", true, param);
    }

    public getArguments(projectFilePath: string, packageGroupName: string): Promise<any>
    {
        let param = {
            'ProjectFilePath': projectFilePath,
            'PackageGroupName': packageGroupName
        }
        return this._powerShell.executeCommandSafe("Get-Arguments", true, param);
    }

    public testGoCurrentInstalled(): Promise<boolean>
    {
        return this._powerShell.executeCommandSafe("Test-GoCurrentInstalled", true);
    }

    public testIsInstance(projectFilePath: string, packageGroupName: string) : Promise<any>
    {
        let param = {
            'ProjectFilePath': projectFilePath,
            'PackageGroupName': packageGroupName
        };

        return this._powerShell.executeCommandSafe("Test-IsInstance", true, param);
    }

    public testInstanceExists(instanceName: string): Promise<boolean>
    {
        return this._powerShell.executeCommandSafe("Test-InstanceExists", true, {"InstanceName": instanceName});
    }

    public testCanInstall(projectFilePath: string, packageGroupName: string): Promise<boolean>
    {
        return this._powerShell.executeCommandSafe("Test-CanInstall", true, {"ProjectFilePath": projectFilePath, "PackageGroupName": packageGroupName})
    }

    public testIsInstalled(packages: string[], instanceName: string): Promise<boolean>
    {
        let args = {"Packages": packages};
        if (instanceName)
            args["InstanceName"] = instanceName;

        return this._powerShell.executeCommandSafe("Test-IsInstalled", true, args)
    }

    public getInstalledPackages(id: string, instanceName: string = undefined) : Promise<PackageInfo[]>
    {
        let param = {
            'Id': id
        };
        if (instanceName)
            param['InstanceName'] = instanceName;

        return this._powerShell.executeCommandSafe("Get-InstalledPackages", true, param);
    }

    public getDeployedPackages(workspaceDataPath: string, deploymentGuid: string) : Promise<PackageInfo[]>
    {
         let param = {
            'WorkspaceDataPath': workspaceDataPath,
            'DeploymentGuid': deploymentGuid,
        }
        return this._powerShell.executeCommandSafe("Get-DeployedPackages", true, param);
    }

    public openGoCurrentWizard()
    {
        this._powerShell.executeCommandSafe("Invoke-OpenGoCurrentWizard", false);
    }

    public testBug() : Promise<any>
    {
        return this._powerShell.executeCommandSafe("Test-Bug", true);
    }
}