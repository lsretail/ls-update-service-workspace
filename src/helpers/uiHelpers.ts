import { InputBoxOptions, QuickPickItem, QuickPickOptions, window, workspace, WorkspaceFolder } from "vscode";
import { resolveCliPathFromVSCodeExecutablePath } from "vscode-test";
import Controller from "../controller";
import { DataHelpers } from "../dataHelpers";
import { DeployPsService } from "../deployService/services/deployPsService";
import { GoCurrentPsService } from "../goCurrentService/services/goCurrentPsService";

export class UiHelpers
{
    public static async showWorkspaceFolderPick(workspaceFolders: readonly WorkspaceFolder[] = null, placeHolder = "Select workspace folder") : Promise<WorkspaceFolder>
    {
        let picks: QuickPickItem[] = [];
        if (!workspaceFolders)
            workspaceFolders = workspace.workspaceFolders;
        for (let workspaceFolder of workspaceFolders)
        {
            picks.push({"label": workspaceFolder.name, "description": workspaceFolder.uri.fsPath});
        }

        if (picks.length === 0)
        {
            return;
        }
        else if (picks.length === 1)
        {
            let workspaceFolder = DataHelpers.getEntryByProperty<WorkspaceFolder>(workspaceFolders, "name", picks[0].label);
            return workspaceFolder;
        }
        let options: QuickPickOptions = {"placeHolder": placeHolder};
    
        let pick = await window.showQuickPick(picks, options);
        if (!pick)
            return;

        return DataHelpers.getEntryByProperty<WorkspaceFolder>(workspaceFolders, "name", pick.label)
    }

    public static async showTargetPicks(targets: string[]): Promise<string>
    {
        if (!targets || targets.length === 0)
            return "default";

        if (targets.length === 1)
            return targets[0];
        
        let picks: QuickPickItem[] = [];
        for (let target of targets)
        {
            picks.push({"label": target});
        }

        var options: QuickPickOptions = {};
        options.placeHolder = "Select a target configuration."
        let selected = await window.showQuickPick(picks, options);
        if (!selected)
            return;
        return selected.label;
    }

    /*async showInstancePicks(instances: string[], exludeInstances: string[] = [], placeholder: string = "Selected an instance") : Promise<string[]>
    {
        let picks: QuickPickItemPayload<string[]>[] = [];

        for (let entry of instances)
        {
            let instanceName = entry[0].InstanceName;

            if (exludeInstances.includes(instanceName))
                continue;

            let description = entry.filter(p => p.Selected).map(p => `${p.Id}`).join(', ');
            picks.push({
                "label": instanceName,
                "description": description,
                "payload": entry
            });
        }
        var options: QuickPickOptions = {};
        options.placeHolder = placeholder
        let selected = await window.showQuickPick(picks, options);
        if (!selected)
            return;
        return selected.payload;
    }*/

    public static async getOrShowInstanceNamePick(suggestedName: string, goCurrentPsService: GoCurrentPsService) : Promise<string>
    {
        suggestedName = suggestedName.replace(/[^a-zA-Z0-9-]/g, "-");
        let instanceName = "";
        let suggestedInstanceName = await this.getNonexistingInstanceName(suggestedName, goCurrentPsService);
        let tries = 0;
        let inputOptions: InputBoxOptions = {
            ignoreFocusOut: true
        };
        while (!instanceName)
        {
            if (tries > 0)
                inputOptions.prompt = "Instance name already exists, please pick another";
            else
                inputOptions.prompt = "Instance name";
            inputOptions.value = suggestedInstanceName;
            instanceName = await window.showInputBox(inputOptions);
            if (!instanceName)
                return;
            let exists: boolean = await goCurrentPsService.testInstanceExists(instanceName);
            if (exists)
            {
                tries++;
                suggestedInstanceName = await this.getNonexistingInstanceName(instanceName, goCurrentPsService);
                instanceName = "";
            }
        }
        return instanceName;
    }

    private static async getNonexistingInstanceName(suggestedName: string, goCurrentPsService: GoCurrentPsService) : Promise<string>
    {
        let instanceName = suggestedName;
        let idx = 0;
        while (await goCurrentPsService.testInstanceExists(instanceName))
        {
            idx++;
            instanceName = `${suggestedName}-${idx}`
        }
        return instanceName;
    }

    public static async errorWrapper(action: (...args: any[]) => any, args: any[], thisArg?: any)
    {
        try
        {
            await action.bind(thisArg)(...args);
        }
        catch(error)
        {
            if (!Controller.handleError(error))
            {
                window.showErrorMessage(`Unexpected error occured: ${error}.`);
            }
        }
    }
}