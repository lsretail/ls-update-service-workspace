
import {PowerShell} from '../../PowerShell'
import {PackageInfo} from '../../interfaces/packageInfo';
import { Server, Package } from '../../models/projectFile';
import { GoCurrentVersion } from '../../interfaces/goCurrentVersion';

export class GoCurrentPsService
{
    private _modulePath: string;

    private _powerShell: PowerShell;
    private _powerShellLongRunning: PowerShell;
    private _isAdmin: boolean;
    private _isInstalled: boolean = undefined;

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

    public async isGocInstalled(): Promise<boolean>
    {
        if (this._isInstalled === undefined)
        {
            await this.getGoCurrentVersion();
        }
        return this._isInstalled;
    }

    public async getGoCurrentVersion(): Promise<GoCurrentVersion>
    {
        let gocVersion: GoCurrentVersion = await this._powerShell.executeCommandSafe("Get-GoCurrentVersion", true);
        this._isInstalled = gocVersion.IsInstalled && gocVersion.HasRequiredVersion;
        return gocVersion;
    }

    public async installPackages(
        packages: Package[],
        instanceName?: string,
        servers?: Server[]

    ) : Promise<PackageInfo[]>
    {
        let param = {
            packages: `'${JSON.stringify(packages)}'`
        }

        if (instanceName)
            param['InstanceName'] = instanceName;

        if (servers)
            param['Servers'] = `'${JSON.stringify(servers)}'`;

        let powerShell = this.getNewPowerShell();
        try
        {
            return await powerShell.executeCommandSafe("Install-PackagesJson", true, param);
        }
        finally
        {
            powerShell.dispose();
        }
    }

    public testPackageAvailable(packageId: string, servers: Server[])
    {
        let param = {
            PackageId: packageId
        }

        if (servers)
            param['Servers'] = `'${JSON.stringify(servers)}'`;

        return this._powerShell.executeCommandSafe("Test-PackageAvailable", true, param);
    }

    public installBasePackages() : Promise<PackageInfo[]>
    {
        return this._powerShell.executeCommandSafe("Install-BasePackages", true, {});
    }

    public getAvailableBaseUpdates() : Promise<PackageInfo[]>
    {
        return this._powerShell.executeCommandSafe("Get-AvailableBaseUpdates", true, {});
    }

    public testInstanceExists(instanceName: string): Promise<boolean>
    {
        return this._powerShell.executeCommandSafe("Test-InstanceExists", true, {"InstanceName": instanceName});
    }

    public isInstalled(packages: string[], instanceName: string): Promise<boolean>
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

    public getInstances() : Promise<PackageInfo[][]>
    {
        return this._powerShell.executeCommandSafe("Get-Instances", true);
    }

    public openGoCurrentWizard()
    {
        this._powerShell.executeCommandSafe("Invoke-OpenGoCurrentWizard", false);
    }
}