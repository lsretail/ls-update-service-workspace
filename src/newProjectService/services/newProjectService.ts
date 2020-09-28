import path = require("path");
import { window, WorkspaceFolder } from "vscode";
import { Constants } from "../../constants";
import { fsHelpers } from "../../fsHelpers";
import { JsonData } from "../../jsonData";
import { ProjectFile, ProjectFilePackage, VersionFromAlApp } from "../../models/projectFile";
import { AppIdHelpers } from "../helpers/appIdHelpers";
import { AppJson } from "../interfaces/appJson";
import { ExtensionContext } from 'vscode'
import { ProjectFileHelpers } from "../../helpers/projectFileHelpers";


export class NewProjectService
{
    private static _lsCentralAppId = '5ecfc871-5d82-43f1-9c54-59685e82318d';
    private static _appIdToPackageMap = {
        "63ca2fa4-4f03-4f2b-a480-172fef340d3f": "bc-system-application",
        "437dbf0e-84ff-417a-965d-ed2bb9650972": "bc-base-application",
        "5ecfc871-5d82-43f1-9c54-59685e82318d": "ls-central-app",
        "7ecfc871-5d82-43f1-9c54-59685e82318d": "ls-central-hotels"
    };

    private _workspaceFolder: WorkspaceFolder;
    private _projectFile: JsonData<ProjectFile>;
    private _appJson: JsonData<AppJson>;

    constructor(workspaceFolder: WorkspaceFolder)
    {
        this._workspaceFolder = workspaceFolder;
    }

    get projectFile()
    {
        if (!this._projectFile)
            this._projectFile = new JsonData<ProjectFile>(ProjectFileHelpers.getProjectFilePath(this._workspaceFolder.uri.fsPath), true);
        return this._projectFile;
    }

    get appJson()
    {
        if (!this._appJson)
            this._appJson = new JsonData<AppJson>(path.join(this._workspaceFolder.uri.fsPath, Constants.alProjectFileName), true);
        return this._appJson;
    }

    isAl(): boolean
    {
        let alProjectPath = path.join(this._workspaceFolder.uri.fsPath, Constants.alProjectFileName);
        return fsHelpers.existsSync(alProjectPath);
    }

    async newAlProject(context: ExtensionContext): Promise<string>
    {
        let templatePath = context.asAbsolutePath("assets\\gocurrentAl.json");

        let newProjectFilePath = path.join(this._workspaceFolder.uri.fsPath, Constants.goCurrentWorkspaceDirName, Constants.projectFileName);
        this.copyFile(templatePath, newProjectFilePath);


        let projectFileData = await this.projectFile.getData();
        let appJsonData = await this.appJson.getData();

        let appIds = AppIdHelpers.getAppIdsFromAppJson(appJsonData);

        if (appIds.includes(NewProjectService._lsCentralAppId) && projectFileData.variables?.lsCentralVersion?.alAppId)
        {
            projectFileData.variables.lsCentralVersion.alAppId = NewProjectService._lsCentralAppId;
        }

        projectFileData.id = appJsonData.name.toLowerCase().replace(/[^a-z0-9-]/g, "-") + '-app';

        NewProjectService.addDependenciesToProjectFile(
            projectFileData, 
            appJsonData
        );

        this.projectFile.save();

        return newProjectFilePath;
    }

    async newProject(context: ExtensionContext): Promise<string>
    {        
        let templatePath = context.asAbsolutePath("assets\\gocurrent.json");

        let newProjectFilePath = path.join(this._workspaceFolder.uri.fsPath, Constants.goCurrentWorkspaceDirName, Constants.projectDataFileName);
        this.copyFile(templatePath, newProjectFilePath);

        let PackagePsmPath = context.asAbsolutePath("assets\\Package.psm1");
        let destPath = path.join(this._workspaceFolder.uri.fsPath, Constants.goCurrentWorkspaceDirName, "Package", "Package.psm1");
        this.copyFile(PackagePsmPath, destPath);

        return newProjectFilePath;
    }

    private copyFile(srcPath: string, destPath: string)
    {
        let dir = path.dirname(destPath);

        if (!fsHelpers.existsSync(dir))
        {
            fsHelpers.mkdirSync(dir);
        }

        fsHelpers.copySync(srcPath, destPath);
    }

    public async updateProperty(properties: object)
    {
        let data = await this.projectFile.getData();
        for (let key in properties)
        {
            data[key] = properties[key];
        }
        await this.projectFile.save();
    }

    public async addLicenseFile(filePath: string)
    {
        let projectData = await this.projectFile.getData();

        if (projectData.devPackageGroups[0])
        {
            if (!projectData.devPackageGroups[0].arguments)
                projectData.devPackageGroups[0].arguments = {};
            if (!projectData.devPackageGroups[0].arguments['bc-server'])
                projectData.devPackageGroups[0].arguments['bc-server'] = {};

            projectData.devPackageGroups[0].arguments['bc-server']['LicenseUri'] = filePath;
        }
        await this.projectFile.save();
    }

    public async addLicensePackage(packageId: string)
    {
        let projectData = await this.projectFile.getData();
        if (projectData.devPackageGroups[0])
        {
            let licensePackage = new ProjectFilePackage();
            licensePackage.id = packageId;
            licensePackage.version = '^'

            if (!projectData.devPackageGroups[0].packages)
                projectData.devPackageGroups[0].packages = [];
            projectData.devPackageGroups[0].packages.push(licensePackage);
        }
        await this.projectFile.save();
    }

    public async addDependenciesToProjectFileWithLoad(): Promise<number>
    {
        let count = NewProjectService.addDependenciesToProjectFile(
            await this.projectFile.getData(),
            await this.appJson.getData()
        )

        if (count > 0)
            await this.projectFile.save();

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

    public dispose()
    {
        this._projectFile?.dispose();
        this._appJson?.dispose();
    }
}