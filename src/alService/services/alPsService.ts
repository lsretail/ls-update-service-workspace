import {PowerShell} from '../../PowerShell'

export class AlPsService
{
    private _modulePath: string;
    private _powerShell: PowerShell;
    private _isAdmin: boolean;

    constructor(powerShell: PowerShell, modulePath: string)
    {
        this._powerShell = powerShell;
        this._powerShell.addModuleFromPath(modulePath);
        this._powerShell.setPreCommand("trap{if (Invoke-ErrorHandler $_) { continue };}");
        this._modulePath = modulePath;
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

    public async alTest() : Promise<string>
    {
        return this._powerShell.executeCommandSafe("Invoke-AlTest", false);
    }

    public async isAdmin(): Promise<boolean>
    {
        if (!this._isAdmin)
            this._isAdmin = await this._powerShell.executeCommandSafe("Test-AdminAsJson", true);
        return this._isAdmin;
    }

    public async unpublishApp(instanceName: string, appId: string): Promise<string>
    {
        let param = {
            'InstanceName': instanceName,
            'AppId': appId,
        }

        return this.executeAsAdmin("Invoke-UnpublishApp", true, param);
    }

    public async upgradeData(instanceName: string): Promise<string[]>
    {
        let param = {
            'InstanceName': instanceName,
        }

        return this.executeAsAdmin("Invoke-UpgradeData", true, param);       
    }
}