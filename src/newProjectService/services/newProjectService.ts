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
    private static _bcApplicationPackageId = "bc-application";
    private static _bcSystemSymbolsPackageId = "bc-system-symbols";
    private static _appIdToPackageMap: {[key: string]: string} = {
        "63ca2fa4-4f03-4f2b-a480-172fef340d3f": "bc-system-application",
        "437dbf0e-84ff-417a-965d-ed2bb9650972": "bc-base-application",
        "dd0be2ea-f733-4d65-bb34-a28f4624fb14": "bc-test-library-assert",
        "9856ae4f-d1a7-46ef-89bb-6ef056398228": "bc-system-application-test-library",
        "e7320ebb-08b3-4406-b1ec-b4927d3e280b": "bc-test-library-any",
        "5095f467-0a01-4b99-99d1-9ff1237d286f": "bc-test-library-variable-storage",
        "5d86850b-0d76-4eca-bd7b-951ad998e997": "bc-base-application-tests-test-libraries",
        "5ecfc871-5d82-43f1-9c54-59685e82318d": "ls-central-app",
        "7ecfc871-5d82-43f1-9c54-59685e82318d": "ls-hotels-app"
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

    async newAlProject(context: ExtensionContext, appIdToPackageIdMap: {[_: string]: string}): Promise<string>
    {
        let templatePath = context.asAbsolutePath("assets\\gocurrentAl.json");

        let newProjectFilePath = path.join(this._workspaceFolder.uri.fsPath, Constants.goCurrentWorkspaceDirName, Constants.projectFileName);
        this.copyFile(templatePath, newProjectFilePath);

        let projectFileData = await this.projectFile.getData();
        let appJsonData = await this.appJson.getData();

        let appIds = AppIdHelpers.getAppIdsFromAppJson(appJsonData);

        NewProjectService.addDependenciesToProjectFile(
            projectFileData, 
            appJsonData,
            appIdToPackageIdMap
        );

        if (appIds.includes(NewProjectService._lsCentralAppId) && projectFileData.variables?.lsCentralVersion?.alAppId)
        {
            projectFileData.variables.lsCentralVersion.alAppId = NewProjectService._lsCentralAppId;
        }

        projectFileData.id = appJsonData.name.toLowerCase().replace(/[^a-z0-9-]/g, "-") + '-app';

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
            licensePackage.id = packageId.trim();
            licensePackage.version = '^'

            if (!projectData.devPackageGroups[0].packages)
                projectData.devPackageGroups[0].packages = [];
            projectData.devPackageGroups[0].packages.push(licensePackage);
        }
        await this.projectFile.save();
    }

    public async addDependenciesToProjectFileWithLoad(appIdToPackageIdMap: {[_: string]: string}): Promise<number>
    {
        let count = NewProjectService.addDependenciesToProjectFile(
            await this.projectFile.getData(),
            await this.appJson.getData(),
            appIdToPackageIdMap
        )

        if (count > 0)
            await this.projectFile.save();

        return count;
    }

    public static addDependenciesToProjectFile(projectFile: ProjectFile, appJson: AppJson, appIdToPackageIdMap: {[_: string]: string}): number
    {
        let gocIds = AppIdHelpers.getAppIdsFromGoCurrentJson(projectFile);
        let appIds = AppIdHelpers.getAppIdsFromAppJson(appJson);
        let existingIds = AppIdHelpers.getDependenciesFromGoCurrentJson(projectFile);

        let newApps = AppIdHelpers.getNewAppIds(gocIds, appIds);

        if (!projectFile.dependencies)
            projectFile.dependencies = [];

        let count = 0;

        if (appJson.application && !existingIds.includes(this._bcApplicationPackageId))
        {
            count++;
            let newDep = new ProjectFilePackage();
            newDep.id = this._bcApplicationPackageId;
            let version = new VersionFromAlApp();
            version.alAppId = 'application';
            version.alAppIdType = 'fromMinorToNextMajor';
            version.alAppParts = 3
            newDep.version = version;
            projectFile.dependencies.push(newDep);
        }

        if (appJson.platform && !existingIds.includes(this._bcSystemSymbolsPackageId))
        {
            count++;
            let newDep = new ProjectFilePackage();
            newDep.id = this._bcSystemSymbolsPackageId;
            let version = new VersionFromAlApp();
            version.alAppId = 'platform';
            version.alAppIdType = 'fromMinorToNextMajor';
            version.alAppParts = 3
            newDep.version = version;
            projectFile.dependencies.push(newDep);
        }

        for (let newApp of newApps)
        {
            let newDep = new ProjectFilePackage();
            let version = new VersionFromAlApp();
            if (this._appIdToPackageMap[newApp])
            {
                newDep.id = this._appIdToPackageMap[newApp];
                version.alAppParts = 3
                if (existingIds.includes(newDep.id))
                    continue;
            }
            else if (appIdToPackageIdMap[newApp])
            {
                newDep.id = appIdToPackageIdMap[newApp];
                version.alAppParts = 4
                if (existingIds.includes(newDep.id))
                    continue;
            }
            else
            {
                newDep.id = "set-package-id-for-app-id"
                version.alAppParts = 4
            }
            
            version.alAppId = newApp;
            version.alAppIdType = 'fromMinorToNextMajor';
            
            newDep.version = version;
            count++;
            projectFile.dependencies.push(newDep);
        }

        if (newApps.includes(this._lsCentralAppId) && projectFile.variables?.lsCentralVersion?.alAppId === 'platform')
        {
            projectFile.variables.lsCentralVersion.alAppId = this._lsCentralAppId;
        }

        return count;
    }

    public dispose()
    {
        this._projectFile?.dispose();
        this._appJson?.dispose();
    }
}