import { commands, ProgressLocation, window } from "vscode";
import { Constants } from "../constants";
import { GoCurrentPsService } from "../goCurrentService/services/goCurrentPsService";
import { PackageInfo } from "../interfaces/packageInfo";
import { Package, Server } from "../models/projectFile";
import Resources from "../resources";

export class InstallHelpers
{
    public static async installPackage(
        packageId: string, 
        goCurrentPsService: GoCurrentPsService,
        options: {
            restartPowerShell?: boolean, 
            reload?: boolean
            reloadText?: string,
            servers?: Server[]
        }
    ): Promise<PackageInfo[]>
    {
        let packages = await window.withProgress({
            location: ProgressLocation.Notification,
            title: Resources.installationStartedInANewWindow
        }, async (progress, token) => 
        {
            let packages: Package[] = [{id: packageId, version: ''}];
            return await goCurrentPsService.installPackages(packages, undefined, options.servers);
        });

        if (packages && packages.filter(p => p.Id === packageId).length > 0)
        {
            if (options.restartPowerShell)
                goCurrentPsService.powerShell.restart();

            if (options.reload)
            {
                let result = await window.showInformationMessage(options.reloadText, Constants.buttonReloadWindow, Constants.buttonLater);

                if (result === Constants.buttonReloadWindow)
                    commands.executeCommand("workbench.action.reloadWindow");
                }
        }

        return packages;
    }
}