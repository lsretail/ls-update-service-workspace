import { PowerShell } from "../../PowerShell";
import { GoCurrentVersion } from "../../interfaces/goCurrentVersion";
import { ProjectFile } from "../../models/projectFile";

export class PackagePsService
{
    private _modulePath: string;
    private _powerShell: PowerShell;

    constructor(powerShell: PowerShell, modulePath: string)
    {
        this._powerShell = powerShell;
        this._powerShell.addModuleFromPath(modulePath);
        this._powerShell.setPreCommand("trap{if (Invoke-ErrorHandler $_) { continue };}");
        this._modulePath = modulePath;
    }

    public getGoCurrentServerVersion(): Promise<GoCurrentVersion>
    {
        return this._powerShell.executeCommandSafe("Get-GoCurrentServerVersion", true);
    }

    public getTargets(projectFilePath: string, id?: string, useDevTarget?: boolean): Promise<string[]>
    {
        let param = {
            projectFilePath: projectFilePath,
            useDevTarget: false
        }

        if (id)
            param['id'] = id;

        if (useDevTarget)
            param['useDevTarget'] = useDevTarget;

        return this._powerShell.executeCommandSafe("Get-Targets", true, param);
    }

    public async newPackage(projectFilePath: string, target: string, branchName: string, defaultOutputDir: string): Promise<string>
    {
        let param = {
            projectFilePath: projectFilePath,
            target: target,
            branchName: branchName,
            defaultOutputDir: defaultOutputDir
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

    public async newAlPackage(projectDir: string, projectFilePath: string, target: string, branchName: string): Promise<string>
    {
        let param = {
            projectDir: projectDir,
            projectFilePath: projectFilePath,
            target: target,
            branchName: branchName
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
            projectDir: projectDir,
            branchName: branchName,
            target: target,
            compilerPath: compilerPath
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

    public async invokeCompile(projectDir: string, compilerPath: string, dependenciesDir: string): Promise<string>
    {
        let param = {
            projectDir: projectDir,
            compilerPath: compilerPath,
            dependenciesDir: dependenciesDir
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
        return await this._powerShell.executeCommandSafe("New-TempDir", true);
    }

    public testNetPackagesLocked(projectDir: string): Promise<boolean>
    {
        let param = {
            projectDir: projectDir
        };

        return this._powerShell.executeCommandSafe("Test-NetpackageLocked", true, param);
    }

    public async getDependencies(
        projectDir: string, 
        projectFilePath: string, 
        target: string, 
        branchName: string,
        outputDir?: string
    ): Promise<string>
    {
        let param = {
            projectDir: projectDir,
            projectFilePath: projectFilePath,
            target: target,
            branchName: branchName,
        }

        if (outputDir)
            param["outputDir"] = `'${outputDir}'`;

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
}