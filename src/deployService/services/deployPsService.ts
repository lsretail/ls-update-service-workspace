
import {PowerShell} from '../../PowerShell'
import {PackageInfo} from '../../interfaces/packageInfo';
import { Server, Package } from '../../models/projectFile';
import { GoCurrentVersion } from '../../interfaces/goCurrentVersion';

export class DeployPsService
{
    private _modulePath: string;

    private _powerShell: PowerShell;
    private _powerShellLongRunning: PowerShell;
    private _isAdmin: boolean;

    constructor(powerShell: PowerShell, modulePath: string)
    {
        this._powerShell = powerShell;
        this._powerShell.addModuleFromPath(modulePath);
        this._powerShell.setPreCommand("trap{if (Invoke-ErrorHandler $_) { continue };}");
        this._modulePath = modulePath;
    }

    private getNewPowerShell() : PowerShell
    {
        let powerShell = new PowerShell(this._powerShell.isDebug);
        powerShell.addModuleFromPath(this._modulePath);
        powerShell.setPreCommand("trap{if (Invoke-ErrorHandler $_) { continue };}");
        return powerShell;
    }

    public async isAdmin(): Promise<boolean>
    {
        if (!this._isAdmin)
            this._isAdmin = await this._powerShell.executeCommandSafe("Test-AdminAsJson", true);
        return this._isAdmin;
    }

    private async executeAsAdmin(commandName: string, parseJson: boolean, ...args: any[]) : Promise<any>
    {
        if (await this.isAdmin())
        {
            return this._powerShell.executeCommandSafe(commandName, parseJson, ...args);
        }
        else
        {
            return this._powerShell.executeCommandSafe(commandName + "Admin", parseJson, ...args);
        }
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
        target: string,
        servers: Server[]
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
        
        if (servers)
            param['Servers'] = `'${JSON.stringify(servers)}'`;

        return this._powerShell.executeCommandSafe("Get-AvailableUpdates", true, param);
    }

    public removeDeployment(workspaceDataPath: string, deploymentGuid: string) : Promise<any>
    {
        let param = {
            'WorkspaceDataPath': workspaceDataPath,
            'DeploymentGuid': deploymentGuid,
        }
        return this.executeAsAdmin("Remove-Deployment", true, param);
    }

    public testIsInstance(
        projectFilePath: string,
        packageGroupId: string,
        servers: Server[],
        target?: string,
        branchName?: string,
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
        
        if (servers)
            param['Servers'] = `'${JSON.stringify(servers)}'`;
        
        return this._powerShell.executeCommandSafe("Test-IsInstance", true, param);
    }

    public testCanInstall(projectFilePath: string, packageGroupId: string): Promise<boolean>
    {
        return this._powerShell.executeCommandSafe("Test-CanInstall", true, {"ProjectFilePath": projectFilePath, "packageGroupId": packageGroupId})
    }

    public getDeployedPackages(workspaceDataPath: string, deploymentGuid: string) : Promise<PackageInfo[]>
    {
         let param = {
            'WorkspaceDataPath': workspaceDataPath,
            'DeploymentGuid': deploymentGuid,
        }
        return this._powerShell.executeCommandSafe("Get-DeployedPackages", true, param);
    }

    public getTargets(projectFilePath: string, id?: string, useDevTarget?: boolean): Promise<string[]>
    {
        let param = {
            projectFilePath: projectFilePath,
            useDevTarget: false
        }

        if (id)
            param['id'] = id;

        if (useDevTarget)
            param['useDevTarget'] = useDevTarget;

        return this._powerShell.executeCommandSafe("Get-Targets", true, param);
    }
}