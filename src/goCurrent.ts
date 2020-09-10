
import {PowerShell} from './PowerShell'
import {PackageInfo} from './interfaces/packageInfo';
import { Server } from './models/projectFile';
import { GoCurrentVersion } from './interfaces/goCurrentVersion';

export class GoCurrent
{
    private _modulePath: string;

    private _powerShell: PowerShell;
    private _powerShellLongRunning: PowerShell;

    constructor(powerShell: PowerShell, modulePath: string)
    {
        this._powerShell = powerShell;
        this._powerShell.addModuleFromPath(modulePath);
        this._powerShell.setPreCommand("trap{if (Invoke-ErrorHandler $_) { continue };}");
        this._modulePath = modulePath;
    }

    private get longRunning()
    {
        if (!this._powerShellLongRunning)
        {
            this._powerShellLongRunning = new PowerShell(this._powerShell.isDebug);
            this._powerShellLongRunning.addModuleFromPath(this._modulePath);
            this._powerShellLongRunning.setPreCommand("trap{if (Invoke-ErrorHandler $_) { continue };}");
        }
        return this._powerShellLongRunning;
    }

    private getNewPowerShell() : PowerShell
    {
        let powerShell = new PowerShell();
        powerShell.addModuleFromPath(this._modulePath);
        powerShell.setPreCommand("trap{if (Invoke-ErrorHandler $_) { continue };}");
        return powerShell;
    }

    public getTestString(): Promise<string>
    {
        let param = {
            'Value': 'input parameter'
        }
        return this._powerShell.executeCommandSafe("Get-TestString", false, param);
    }

    public async installPackageGroup(
        projectFilePath: string,
        packageGroupId: string,
        instanceName: string,
        target: string,
        branchName: string,
        servers: Server[]
    ) : Promise<PackageInfo[]>
    {
        let param = {
            'ProjectFilePath': projectFilePath,
        }

        if (packageGroupId)
            param['packageGroupId'] = packageGroupId

        if (instanceName)
            param['InstanceName'] = instanceName;

        if (target)
            param['Target'] = target;

        if (branchName)
            param['BranchName'] = branchName;

        if (servers)
            param['Servers'] = `'${JSON.stringify(servers)}'`;

        let powerShell = this.getNewPowerShell();
        try
        {
            let result = await powerShell.executeCommandSafe("Install-PackageGroup", true, param);
            return result;
        }
        finally
        {
            powerShell.dispose();
        }
    }

    public getAvailableUpdates(
        projectFilePath: string, 
        packageGroupId: string, 
        instanceName: string,
        branchName: string,
        target: string
    )
    {
        let param = {
            'ProjectFilePath': projectFilePath,
        }

        if (packageGroupId)
            param['PackageGroupId'] = packageGroupId;

        if (instanceName)
            param['InstanceName'] = instanceName;
        
        if (target)
            param['Target'] = target;

        if (branchName)
            param['BranchName'] = branchName;

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

    public getGoCurrentVersion(): Promise<GoCurrentVersion>
    {
        return this._powerShell.executeCommandSafe("Get-GoCurrentVersion", true);
    }

    public testIsInstance(
        projectFilePath: string,
        packageGroupId: string,
        target?: string,
        branchName?: string
    ) : Promise<any>
    {
        let param = {
            'ProjectFilePath': projectFilePath,
            'packageGroupId': packageGroupId
        };

        if (target)
            param['Target'] = target;

        if (branchName)
            param['BranchName'] = branchName;
        
        return this._powerShell.executeCommandSafe("Test-IsInstance", true, param);
    }

    public testInstanceExists(instanceName: string): Promise<boolean>
    {
        return this._powerShell.executeCommandSafe("Test-InstanceExists", true, {"InstanceName": instanceName});
    }

    public testCanInstall(projectFilePath: string, packageGroupId: string): Promise<boolean>
    {
        return this._powerShell.executeCommandSafe("Test-CanInstall", true, {"ProjectFilePath": projectFilePath, "packageGroupId": packageGroupId})
    }

    public testIsInstalled(packages: string[], instanceName: string): Promise<boolean>
    {
        let args = {};

        if (packages && packages.length > 0)
            args["Packages"] = packages;

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

    public getInstances() : Promise<PackageInfo[][]>
    {
        return this._powerShell.executeCommandSafe("Get-Instances", true);
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