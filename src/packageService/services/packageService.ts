import { WorkspaceData } from "../../models/workspaceData";
import { ProjectFile } from "../../models/projectFile";
import { JsonData } from "../../jsonData";
import { PackagePsService } from "./packagePsService";
import { AlExtensionService } from "./alExtensionService";
import { fsHelpers } from "../../fsHelpers";
import { IWorkspaceService } from "../../workspaceService/interfaces/IWorkspaceService";
import path = require("path");

export class PackageService implements IWorkspaceService
{
    private _packagesPsService: PackagePsService;
    private _projectFile: JsonData<ProjectFile>;
    private _alExtensionService: AlExtensionService;


    public constructor(
        packagePsService: PackagePsService,
        alExtensionService: AlExtensionService,
        projectFile: JsonData<ProjectFile> 
    )
    {
        this._projectFile = projectFile;
        this._packagesPsService = packagePsService;
        this._alExtensionService = alExtensionService;
    }

    async isActive(): Promise<boolean> 
    {
        return true;
    }
    
    async dispose(): Promise<void> 
    {
        // ignore
    }

    getTargets(id?: string, useDevTarget?: boolean): Promise<string[]>
    {
        return this._packagesPsService.getTargets(this._projectFile.uri.fsPath, id, useDevTarget);
    }

    newPackage(target: string, branchName: string, defaultOutputDir: string): Promise<string>
    {
        return this._packagesPsService.newPackage(this._projectFile.uri.fsPath, target, branchName, defaultOutputDir);
    }

    newAlPackage(projectDir: string, target: string, branchName: string): Promise<string>
    {
        return this._packagesPsService.newAlPackage(projectDir, this._projectFile.uri.fsPath, target, branchName);
    }

    async invokeAlCompileAndPackage(
        projectDir: string, 
        target: string,
        branchName: string,
        outputChannel: (message: string) => void
    ): Promise<void>
    {
        if (!this._alExtensionService.isInstalled)
            throw "AL Language extension not installed."

        if (!outputChannel)
            outputChannel = message => {};

        let tempDir = await this._packagesPsService.newTempDir();

        try
        {
            outputChannel("Downloading dependencies ...");

            let packageCachePath = path.join(tempDir, '.alpackages');
            let assemblyProbingPath = path.join(tempDir, '.netpackages');

            let output = await this._packagesPsService.getDependencies(
                projectDir, 
                this._projectFile.uri.fsPath, 
                target, 
                branchName,
                packageCachePath,
                assemblyProbingPath
            );
            outputChannel(output);
    
            outputChannel("Compiling app ...");
            output = await this._packagesPsService.invokeCompile(
                projectDir, 
                this._alExtensionService.compilerPath, 
                tempDir
            );
            outputChannel(output);
    
            outputChannel("Creating package ...");
            let packagePath = await this._packagesPsService.newAlPackage(projectDir, this._projectFile.uri.fsPath, target, branchName);
            outputChannel(`Package created at "${packagePath}"`);
        }
        finally
        {
            try
            {
                fsHelpers.rmDir(tempDir, true);
            }
            catch (e)
            {
                // ignore
            }            
        }
        
    }

    public async downloadAlDependencies(
        projectDir: string, 
        target: string, 
        branchName: string, 
    ): Promise<string>
    {
        if (!this._alExtensionService.isInstalled)
            throw "AL Language extension not installed."

        let alConfig = this._alExtensionService.getConfig();
        let assemblyProbingDir = this.getFirstRelativePath(alConfig.assemblyProbingPaths, '.netpackages');

        let dllLock = await this._packagesPsService.testNetPackagesLocked(projectDir, assemblyProbingDir);
        if (dllLock && this._alExtensionService.isActive)
        {
            await this._alExtensionService.stop();
            let count = 0
            while (count < 10)
            {
                await this.delay(500);
                let newLock = await this._packagesPsService.testNetPackagesLocked(assemblyProbingDir);
                if (!newLock)
                    break;
                count ++
            }
        }

        let output = await this._packagesPsService.getDependencies(
            projectDir, 
            this._projectFile.uri.fsPath, 
            target, 
            branchName,
            alConfig.packageCachePath,
            assemblyProbingDir
        );

        if (dllLock && this._alExtensionService.isActive)
            await this._alExtensionService.start();

        return output;
    }

    private getFirstRelativePath(paths: string[], defaultValue: string): string
    {
        for (let item of paths)
        {
            if (!path.isAbsolute(item))
            {
                return item;
            }
        }
        return defaultValue;
    }

    private delay(ms: number): Promise<void>
    {
        return new Promise( resolve => setTimeout(resolve, ms) );
    }
}