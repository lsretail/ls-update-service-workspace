import { Uri } from 'vscode';
import {PowerShell} from '../../PowerShell'

export class AlPsService
{
    private _modulePath: string;
    private _imported: boolean = false;
    private _powerShell: PowerShell;
    private _isAdmin: boolean;

    constructor(powerShell: PowerShell, modulePath: string)
    {
        this._powerShell = powerShell;
        this._modulePath = modulePath;
    }

    private executeCommandSafe(commandName: string, parseJson: boolean, ...args: any[]) : Promise<any>
    {
        this.init();
        return this._powerShell.executeCommandSafe(commandName, parseJson, ...args);
    }

    private init()
    {
        if (!this._imported)
        {
            this._imported = true;
            this._powerShell.addModuleFromPath(this._modulePath);
            this._powerShell.setPreCommand("trap{if (Invoke-ErrorHandler $_) { continue };}");
        }
    }

    private async executeAsAdmin(commandName: string, parseJson: boolean, ...args: any[]) : Promise<any>
    {
        if (await this.isAdmin())
        {
            return this.executeCommandSafe(commandName, parseJson, ...args);
        }
        else
        {
            return this.executeCommandSafe(commandName + "Admin", parseJson, ...args);
        }
    }

    public async isAdmin(): Promise<boolean>
    {
        if (!this._isAdmin)
            this._isAdmin = await this.executeCommandSafe("Test-AdminAsJson", true);
        return this._isAdmin;
    }

    public async publishApp(instanceName: string, appPath: string): Promise<void>
    {
        let param = {
            instanceName: `"${instanceName}"`,
            appPath: `"${appPath}"`
        }

        return this.executeAsAdmin("Publish-App", true, param);
    }

    public async unpublishApp(instanceName: string, appId: string): Promise<boolean>
    {
        let param = {
            'InstanceName': instanceName,
            'AppId': appId,
        }

        return this.executeAsAdmin("Invoke-UnpublishApp", true, param);
    }

    public async importLicense(instanceName: string, fileName: string): Promise<boolean>
    {
        let param = {
            'InstanceName': instanceName,
            'FileName': fileName,
        }

        return this.executeAsAdmin("Invoke-ImportLicense", true, param);
    }

    public async upgradeData(instanceName: string): Promise<string[]>
    {
        let param = {
            'InstanceName': instanceName,
        }

        return this.executeAsAdmin("Invoke-UpgradeData", true, param);
    }
}