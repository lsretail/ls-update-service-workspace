import { PowerShell } from "../../PowerShell";
import { GoCurrentVersion } from "../../interfaces/goCurrentVersion";
import { ProjectFile } from "../../models/projectFile";
import { fsHelpers } from "../../fsHelpers";
import { OutputChannel } from "vscode";
import { Constants } from "../../constants";
import path = require("path");

export class PackagePsService
{
    private _modulePath: string;
    private _imported: boolean = false;
    private _powerShell: PowerShell;

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

    public getGoCurrentServerVersion(): Promise<GoCurrentVersion>
    {
        return this.executeCommandSafe("Get-GoCurrentServerVersion", true);
    }

    public getTargets(projectFilePath: string, id?: string, useDevTarget?: boolean): Promise<string[]>
    {
        let param = {
            projectFilePath: `'${projectFilePath}'`,
            useDevTarget: false
        }

        if (id)
            param['id'] = `'${id}'`;

        if (useDevTarget)
            param['useDevTarget'] = useDevTarget;

        return this.executeCommandSafe("Get-Targets", true, param);
    }

    public async newPackage(projectFilePath: string, target: string, branchName: string, defaultOutputDir: string): Promise<string>
    {
        let param = {
            projectFilePath: `'${projectFilePath}'`,
            target: `'${target}'`,
            branchName: `'${branchName}'`,
            defaultOutputDir: `'${defaultOutputDir}'`
        }

        let powerShell = this._powerShell.getNewPowerShell();
        try
        {
            return await powerShell.executeCommandSafe("New-Package", true, param);
        }
        finally
        {
            powerShell.dispose();
        }
    }

    public async newAlPackage(projectDir: string, appPath: string, projectFilePath: string, target: string, branchName: string): Promise<string>
    {
        let param = {
            projectDir: `'${projectDir}'`,
            appPath: `'${appPath}'`,
            projectFilePath: `'${projectFilePath}'`,
            target: `'${target}'`,
            branchName: `'${branchName}'`
        }

        let powerShell = this._powerShell.getNewPowerShell();
        try
        {
            return await powerShell.executeCommandSafe("New-AlPackage", true, param);
        }
        finally
        {
            powerShell.dispose();
        }
    }

    public async invokeAlCompileAndPackage(projectDir: string, branchName: string, target: string, compilerPath: string): Promise<string>
    {
        let param = {
            projectDir: `'${projectDir}'`,
            branchName: `'${branchName}'`,
            target: `'${target}'`,
            compilerPath: `'${compilerPath}'`
        };
        
        let powerShell = this._powerShell.getNewPowerShell();
        try
        {
            return await powerShell.executeCommandSafe("Invoke-AlCompileAndPackage", true, param);
        }
        finally
        {
            powerShell.dispose();
        }
    }

    public async invokeAlProjectBuild(
        projectDirs: string[], 
        compilerPath: string, 
        branchName: string,
        target: string,
        outputChannel: OutputChannel
    ): Promise<string[]>
    {
        let tempAux = await this.newTempDir()

        let tempFile = path.join(tempAux, Constants.dummyFile);

        let param = {
            projectDirs: projectDirs.map((projectDir) => `'${projectDir}'`),
            resultFilePath: `'${tempFile}'`,
            compilerPath: `'${compilerPath}'`,
            branchName: `'${branchName}'`,
            target: `'${target}'`
        };

        let powerShell = this._powerShell.getNewPowerShell(outputChannel);
        try
        {
            await powerShell.executeCommandSafe("Invoke-ProjectBuild", false, param);
            
            return await fsHelpers.readJson(tempFile);
        }
        finally
        {
            try
            {
                powerShell.dispose();
                fsHelpers.rmDir(tempAux, true);
            }
            catch (e)
            {
                // ignore
            } 
        }
    }

    public async invokeCompile(projectDir: string, compilerPath: string, dependenciesDir: string): Promise<string>
    {
        let param = {
            projectDir: `'${projectDir}'`,
            compilerPath: `'${compilerPath}'`,
            dependenciesDir: `'${dependenciesDir}'`
        };
        
        let powerShell = this._powerShell.getNewPowerShell();
        try
        {
            return await powerShell.executeCommandSafe("Invoke-Compile", false, param);
        }
        finally
        {
            powerShell.dispose();
        }
    }

    public async newTempDir(): Promise<string>
    {
        return await this.executeCommandSafe("New-TempDir", true);
    }

    public testNetPackagesLocked(...dir: string[]): Promise<boolean>
    {
        let param = {
            dir: `@("${dir.join('","')}")`
        };

        return this.executeCommandSafe("Test-NetpackageLocked", true, param);
    }

    public async getDependencies(
        projectDir: string, 
        projectFilePath: string, 
        target: string, 
        branchName: string,
        packageCacheDir: string,
        assemblyProbingDir: string,
        skipPackages: string[]
    ): Promise<string>
    {
        let param = {
            projectDir: `'${projectDir}'`,
            projectFilePath: `'${projectFilePath}'`,
            target: `'${target}'`,
            branchName: `'${branchName}'`,
            packageCacheDir: `'${packageCacheDir}'`,
            assemblyProbingDir: `'${assemblyProbingDir}'`,
            skipPackages: `'${JSON.stringify(skipPackages)}'`
        }

        let powerShell = this._powerShell.getNewPowerShell();
        try
        {
            return await powerShell.executeCommandSafe("Get-Dependencies", false, param);
        }
        finally
        {
            powerShell.dispose();
        }
    }

    public async importPackage(path: string, server: string, port: number, force: boolean): Promise<void>
    {
        let param = {
            path: `'${path}'`,
            server: `'${server}'`,
            port: `'${port}'`,
            force: force
        }

        let powerShell = this._powerShell.getNewPowerShell();
        try
        {
            await powerShell.executeCommandSafe("Import-Package", true, param);   
        }
        finally
        {
            powerShell.dispose();
        }
    }
}