"use strict"

import {ProjectFile, PackageGroup, Package} from './models/projectFile'
import {Deployment} from './models/deployment'
import {WorkspaceData} from './models/workspaceData'
import {JsonData} from './jsonData'
import {GoCurrent} from './GoCurrent'
import {DataHelpers} from './dataHelpers'
import {EventEmitter, Event, Disposable, Uri} from 'vscode';
import {UpdateAvailable} from './models/updateAvailable';
import {PackageInfo} from './interfaces/packageInfo';
import { DeploymentResult } from './models/deploymentResult'

let uuid = require('uuid/v4');

export class DeployService
{
    private _goCurrent: GoCurrent;
    private _projectFile: JsonData<ProjectFile>;
    private _workspaceData: JsonData<WorkspaceData>;
    private _onDidProjectFileChange = new EventEmitter<DeployService>();
    private _onDidPackagesDeployed = new EventEmitter<PackageInfo[]>()
    private _onDidInstanceRemoved = new EventEmitter<string>();
    private _disposable: Disposable;

    public constructor(projectFile: JsonData<ProjectFile>, workspaceData: JsonData<WorkspaceData>, goCurrent: GoCurrent)
    {
        this._goCurrent = goCurrent;
        this._projectFile = projectFile;
        this._workspaceData = workspaceData;

        let subscriptions: Disposable[] = [];
        this._projectFile.onDidChange(this.fireProjectFileChange, this, subscriptions);
        this._disposable = Disposable.from(...subscriptions);
    }

    public get onDidProjectFileChange() : Event<DeployService>
    {
        return this._onDidProjectFileChange.event;
    }

    private fireProjectFileChange(projectFile: JsonData<ProjectFile>)
    {
        this._onDidProjectFileChange.fire(this);
    }

    public get onDidPackagesDeployed()
    {
        return this._onDidPackagesDeployed.event;
    }

    private firePackagesDeployed(data: PackageInfo[])
    {
        this._onDidPackagesDeployed.fire(data);
    }

    public get onDidInstanceRemoved()
    {
        return this._onDidInstanceRemoved.event;
    }

    public fireInstanceRemoved(instanceName: string)
    {
        this._onDidInstanceRemoved.fire(instanceName);
    }

    public isActive() : Boolean
    {
        return this._projectFile.exists();
    }

    public getPackageGroups() : Thenable<Array<PackageGroup>>
    {
        return this._projectFile.getData().then(projectFile => {
            return projectFile.devPackageGroups;
        });
    }

    public getPackageGroupsResolved() : Thenable<Array<PackageGroup>>
    {
        return this._projectFile.getData().then(projectFile => {
            let groups = new Array<PackageGroup>();
            for (let group of projectFile.devPackageGroups)
            {
                let resolvedGroup = this.getPackageGroupResolved(projectFile, group.id)
                groups.push(resolvedGroup);
            }
            return groups;
        });
    }

    public getPackageGroupResolved(projectFile: ProjectFile, id: string) : PackageGroup
    {
        if (id == 'dependencies')
        {
            let dependencies = new PackageGroup();
            dependencies.name = "Dependencies"
            dependencies.id = "dependencies"
            dependencies.packages = projectFile.dependencies;
            return dependencies
        }
        for (let item of projectFile.devPackageGroups)
        {
            if (item.id !== id)
                continue;

            let packages = new Array<Package>()
            for (let packageEntry of item.packages)
            {
                if ((<any>packageEntry).$ref)
                {
                    let group = this.getPackageGroupResolved(projectFile, (<any>packageEntry).$ref);
                    packages = packages.concat(group.packages);
                }
                else
                {
                    packages.push(packageEntry);
                }
            }
            item.packages = packages;      
            return item;
        }
    }

    public getDeployments() : Thenable<Array<Deployment>>
    {
        return this._workspaceData.getData().then(workspaceData => {
            return workspaceData.deployments; 
        });
    }

    public async removeDeployment(guid: string) : Promise<string>
    {
        let removedName = await this._goCurrent.removeDeployment(this._workspaceData.uri.fsPath, guid);
            
        await this.removeDeploymentFromData(guid);
        
        return removedName
    }

    public async removeDeploymentFromData(guid: string) : Promise<void>
    {
        let workspaceData = await this._workspaceData.getData();
        let deployment = DataHelpers.getEntryByProperty(workspaceData.deployments, "guid", guid);
        DataHelpers.removeEntryByProperty(workspaceData.deployments, "guid", guid);
        await this._workspaceData.save();
        if (deployment)
            this.fireInstanceRemoved(deployment.instanceName);
    }

    public async deployPackageGroup(
        packageGroup: PackageGroup, 
        instanceName: string, 
        deploymentGuid: string = undefined,
        argumentsUri: Uri = undefined
    ) : Promise<DeploymentResult>
    {
        let workspaceData = await this._workspaceData.getData();

        let result: DeploymentResult = new DeploymentResult();
        result.lastUpdated = [];
        result.deployment = DataHelpers.getEntryByProperty(workspaceData.deployments, "guid", deploymentGuid);

        let exists = true;

        if (!result.deployment)
        {
            result.deployment = new Deployment();
            result.deployment.guid = uuid();
            result.deployment.name = packageGroup.name;
            result.deployment.id = packageGroup.id;
            result.deployment.instanceName = instanceName;
            result.deployment.packages = [];
            exists = false;
            workspaceData.deployments.push(result.deployment);
            await this._workspaceData.save();
        }

        let servers = [];
        if (packageGroup && packageGroup.servers)
            servers = packageGroup.servers;
        else
        {
            let globalServers = (await this._projectFile.getData()).servers;
            if (globalServers)
                servers = globalServers;
        }

        var packagesInstalled = await this._goCurrent.installPackageGroup(
            this._projectFile.uri.fsPath,
            packageGroup ? packageGroup.id : undefined,
            instanceName,
            argumentsUri ? argumentsUri.fsPath : undefined,
            servers
        );

        if (packagesInstalled.length === 0)
        {
            if (!exists)
            {
                await this.removeDeploymentFromData(result.deployment.guid);
            }
            return result;
        }

        for (let packageFromGroup of packageGroup.packages)
        {
            let installed = DataHelpers.getEntryByProperty(packagesInstalled, "Id", packageFromGroup.id);
            let alreadyInstalled = DataHelpers.getEntryByProperty(result.deployment.packages, "id", packageFromGroup.id);
            
            if (installed && alreadyInstalled)
                alreadyInstalled.version = installed.Version;

            if (installed && !alreadyInstalled)
                result.deployment.packages.push({'id': packageFromGroup.id, 'version': installed.Version, 'optional': packageFromGroup.optional});
        }

        for (let installed of packagesInstalled)
        {
            result.lastUpdated.push({'id': installed.Id, 'version': installed.Version})
        }

        await this._workspaceData.save();
        this.firePackagesDeployed(packagesInstalled);

        return result;
    }

    public async addPackagesAsDeployed(packages: PackageInfo[]): Promise<boolean>
    {
        if (packages.length === 0)
            return false;

        let instanceName = packages[0].InstanceName;

        if (!instanceName)
            return false;

        let workspaceData = await this._workspaceData.getData();

        let existingEntries = workspaceData.deployments.filter(e => e.instanceName === instanceName);
        if (existingEntries.length > 0)
            return false;

        let deployment = new Deployment();
        deployment.guid = uuid();
        deployment.name = instanceName;
        deployment.id = "";
        deployment.instanceName = instanceName;
        deployment.packages = [];
        workspaceData.deployments.push(deployment);

        for (let package1 of packages)
        {
            if (package1.Selected)
                deployment.packages.push({'id': package1.Id, 'version': package1.Version });
        }
        await this._workspaceData.save();
        this.firePackagesDeployed(packages);
        return true;
    }

    public async getArguments(name: string) : Promise<any>
    {
        return await this._goCurrent.getArguments(this._projectFile.uri.fsPath, name);
    }

    public async installUpdate(packageGroupId: string, instanceName: string, guid: string) : Promise<DeploymentResult>
    {
        let projectFile = await this._projectFile.getData();
        let packageGroup = DataHelpers.getEntryByProperty(projectFile.devPackageGroups, "id", packageGroupId)
        return this.deployPackageGroup(packageGroup, instanceName, guid);
    }

    public async checkForUpdates() : Promise<Array<UpdateAvailable>>
    {
        let deployments = await this.getDeployments(); 
        let updates = new Array<UpdateAvailable>();
        for (let deployment of deployments)
        {
            if (!deployment.instanceName && deployment.packages.length === 0)
            {
                await this.removeDeploymentFromData(deployment.guid);
                continue
            }

            let isInstalled = await this.isInstalled(deployment.packages.map((e) => e.id), deployment.instanceName);

            if (!isInstalled)
            {
                await this.removeDeploymentFromData(deployment.guid);
                continue
            }
            let packages = await this.checkForUpdate(deployment);
            if (packages.length === 0)
                continue;

            updates.push({
                "packageGroupId": deployment.id,
                "packageGroupName": deployment.name,
                "instanceName": deployment.instanceName,
                "guid": deployment.guid,
                "packages": packages.map(p => { return {"id": p.Id, "version": p.Version}})
            });
        }

        return updates;
    }


    public async getDeployedInstances(): Promise<string[]>
    {
        let workspaceData = await this._workspaceData.getData();

        return workspaceData.deployments.map(d => d.instanceName).filter(i => !!i);
    }

    public checkForUpdate(deployment: Deployment) : Promise<PackageInfo[]>
    {
        return this._goCurrent.getAvailableUpdates(this._projectFile.uri.fsPath, deployment.id, deployment.instanceName);
    }

    public isInstance(packageGroupId: string) : Promise<boolean>
    {
        return this._goCurrent.testIsInstance(this._projectFile.uri.fsPath, packageGroupId);
    }

    public canInstall(packageGroupId: string) : Promise<boolean>
    {
        return this._goCurrent.testCanInstall(this._projectFile.uri.fsPath, packageGroupId);
    }

    public isInstalled(packages: string[], instanceName: string) : Promise<boolean>
    {
        return this._goCurrent.testIsInstalled(packages, instanceName);
    }

    public getInstalledPackages(id: string, instanceName: string = undefined) : Promise<PackageInfo[]>
    {
        return this._goCurrent.getInstalledPackages(id, instanceName);
    }

    public getDeployedPackages(deploymentGuid: string) : Promise<PackageInfo[]>
    {
        return this._goCurrent.getDeployedPackages(this._workspaceData.uri.fsPath, deploymentGuid);
    }

    public dispose()
    {
        this._disposable.dispose();
        this._projectFile.dispose();
        this._workspaceData.dispose();
    }
}