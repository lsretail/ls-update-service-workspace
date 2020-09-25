import path = require("path");
import { window, WorkspaceFolder } from "vscode";
import { Constants } from "../../constants";
import { fsHelpers } from "../../fsHelpers";
import { JsonData } from "../../jsonData";
import { ProjectFile, ProjectFilePackage, VersionFromAlApp } from "../../models/projectFile";
import { AppIdHelpers } from "../helpers/appIdHelpers";
import { AppJson } from "../interfaces/appJson";
import { ExtensionContext } from 'vscode'
import Controller from "../../controller";


export class NewProjectService
{

    private static _appIdToPackageMap = {
        "63ca2fa4-4f03-4f2b-a480-172fef340d3f": "bc-system-application",
        "437dbf0e-84ff-417a-965d-ed2bb9650972": "bc-base-application",
        "5ecfc871-5d82-43f1-9c54-59685e82318d": "ls-central-app",
        "7ecfc871-5d82-43f1-9c54-59685e82318d": "ls-central-hotels"
    };

    constructor()
    {
    }

    async newProject(workspaceFolder: WorkspaceFolder, context: ExtensionContext): Promise<string>
    {
        let alProjectPath = path.join(workspaceFolder.uri.fsPath, Constants.alProjectFileName);
        let isAl = fsHelpers.existsSync(alProjectPath);
        
        let templatePath = context.asAbsolutePath("assets\\gocurrent.json");
        if (isAl)
            templatePath = context.asAbsolutePath("assets\\gocurrentAl.json");

        let newProjectFilePath = this.copyFile(workspaceFolder.uri.fsPath, templatePath);

        if (isAl)
        {
            let projectFile = new JsonData<ProjectFile>(newProjectFilePath);
            let appJson = new JsonData<AppJson>(alProjectPath);
            let count = NewProjectService.addDependenciesToProjectFile(
                await projectFile.getData(), 
                await appJson.getData()
            );

            if (count > 0)
                projectFile.save();
        }
        else
        {
            let PackagePsmPath = context.asAbsolutePath("assets\\Package.psm1");
            let destPath = path.join(workspaceFolder.uri.fsPath, Constants.goCurrentWorkspaceDirName, "Package", "Package.psm1");
            this.copyFile2(PackagePsmPath, destPath);
        }

        return newProjectFilePath;
    }

    private copyFile(workspaceDir: string, srcPath: string): string
    {
        let dir = path.join(workspaceDir, Constants.goCurrentWorkspaceDirName);
        let destPath = path.join(dir, Constants.projectFileName)

        if (!fsHelpers.existsSync(dir))
        {
            fsHelpers.mkdirSync(dir);
        }
        fsHelpers.copySync(srcPath, destPath);
        return destPath;
    }

    private copyFile2(srcPath: string, destPath: string)
    {
        let dir = path.dirname(destPath);

        if (!fsHelpers.existsSync(dir))
        {
            fsHelpers.mkdirSync(dir);
        }

        fsHelpers.copySync(srcPath, destPath);
    }

    public static async addDependenciesToProjectFileWithLoad(projectFilePath: string, appJsonPath: string): Promise<number>
    {
        let appJson = new JsonData<AppJson>(appJsonPath);
        let projectFile = new JsonData<ProjectFile>(projectFilePath);

        let count = NewProjectService.addDependenciesToProjectFile(
            await projectFile.getData(),
            await appJson.getData()
        )

        if (count > 0)
            projectFile.save();

        return count;
    }

    public static addDependenciesToProjectFile(projectFile: ProjectFile, appJson: AppJson): number
    {
        let gocIds = AppIdHelpers.getAppIdsFromGoCurrentJson(projectFile);
        let appIds = AppIdHelpers.getAppIdsFromAppJson(appJson);

        let newApps = AppIdHelpers.getNewAppIds(gocIds, appIds);

        if (!projectFile.dependencies)
            projectFile.dependencies = [];

        let count = 0;
        for (let newApp of newApps)
        {
            count++;
            let newDep = new ProjectFilePackage();
            if (this._appIdToPackageMap[newApp])
                newDep.id = this._appIdToPackageMap[newApp];
            else
                newDep.id = "set-package-id-for-app-id"
            let version = new VersionFromAlApp();
            version.alAppId = newApp;
            version.alAppIdType = 'fromMinor';
            version.alAppParts = 3
            newDep.version = version;
            projectFile.dependencies.push(newDep);
        }

        return count;
    }
}