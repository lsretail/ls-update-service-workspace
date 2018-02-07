"use strict"

import {ProjectFile, PackageGroup, Package} from './models/projectFile'
import {Deployment} from './models/deployment'
import {WorkspaceData} from './models/workspaceData'
import {JsonData} from './jsonData'
import {PowerShell} from './PowerShell'
import {GoCurrent} from './GoCurrent'
import {DataHelpers} from './dataHelpers'
import {workspace, EventEmitter, Event, Disposable, Uri} from 'vscode';
import {UpdateAvailable} from './models/updateAvailable';
import {PackageInfo} from './interfaces/packageInfo';
import { worker } from 'cluster';

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

    public getDeployments() : Thenable<Array<Deployment>>
    {
        return this._workspaceData.getData().then(workspaceData => {
            return workspaceData.deployments; 
        });
    }

    public async removeDeployment(guid: string) : Promise<string>
    {
        let removedName = await this._goCurrent.removeDeployment(this._workspaceData.uri.fsPath, guid);
            
        let workspaceData = await this._workspaceData.getData();
        let deployment = DataHelpers.getEntryByProperty(workspaceData.deployments, "guid", guid);
        DataHelpers.removeEntryByProperty(workspaceData.deployments, "guid", guid);
        this._workspaceData.save();
        if (deployment)
            this.fireInstanceRemoved(deployment.instanceName);
        return removedName
    }

    public async deployPackageGroup(packageGroup: PackageGroup, instanceName: string, deploymentGuid: string = undefined, argumentsUri: Uri = undefined) : Promise<Deployment>
    {
        let projectData = await this._workspaceData.getData();
        let deployment = DataHelpers.getEntryByProperty(projectData.deployments, "guid", deploymentGuid);
        var packagesInstalled = await this._goCurrent.installPackageGroup(
            this._projectFile.uri.fsPath,
            packageGroup.name,
            instanceName,
            argumentsUri ? argumentsUri.fsPath : undefined
        );
        let exists = true;
        if (!deployment)
        {
            deployment = new Deployment();
            deployment.guid = uuid();
            deployment.name = packageGroup.name;
            deployment.instanceName = instanceName;
            exists = false;
        }
        deployment.packages = [];
        for (let packageFromGroup of packageGroup.packages)
        {
            let version = packageFromGroup.version;
            let installed = DataHelpers.getEntryByProperty(packagesInstalled, "Id", packageFromGroup.id);
            let lastInstalled = DataHelpers.getEntryByProperty(deployment.packages, "id", packageFromGroup.id);
            if (installed)
                version = installed.Version;
            else if (lastInstalled)
                version = lastInstalled.version;

            deployment.packages.push({'id': packageFromGroup.id, 'version': version});
        }
        deployment.lastUpdated = [];
        for (let installed of packagesInstalled)
        {
            deployment.lastUpdated.push({'id': installed.Id, 'version': installed.Version})
        }
        if (!exists)
            projectData.deployments.push(deployment);
        this._workspaceData.save();
        this.firePackagesDeployed(packagesInstalled);
        return deployment;
    }

    public async getArguments(name: string) : Promise<any>
    {
        return await this._goCurrent.getArguments(this._projectFile.uri.fsPath, name);
    }

    public async installUpdate(packageGroupName: string, instanceName: string, guid: string) : Promise<Deployment>
    {
        let projectFile = await this._projectFile.getData();
        let packageGroup = DataHelpers.getEntryByProperty(projectFile.devPackageGroups, "name", packageGroupName)
        return this.deployPackageGroup(packageGroup, instanceName, guid);
    }

    public async checkForUpdates() : Promise<Array<UpdateAvailable>>
    {
        let deployments = await this.getDeployments(); 
        let updates = new Array<UpdateAvailable>();
        for (let deployment of deployments)
        {
            let packages = await this.checkForUpdate(deployment);
            if (packages.length === 0)
                continue;

            updates.push({
                "packageGroupName": deployment.name,
                "instanceName": deployment.instanceName,
                "guid": deployment.guid,
                "packages": packages.map(p => { return {"id": p.Id, "version": p.Version}})
            });
        }

        return updates;
    }

    public checkForUpdate(deployment: Deployment) : Promise<PackageInfo[]>
    {
        return this._goCurrent.getAvailableUpdates(this._projectFile.uri.fsPath, deployment.name, deployment.instanceName)
    }

    public isInstance(packageGroupName: string) : Promise<boolean>
    {
        return this._goCurrent.testIsInstance(this._projectFile.uri.fsPath, packageGroupName);
    }

    public canInstall(packageGroupName: string) : Promise<boolean>
    {
        return this._goCurrent.testCanInstall(this._projectFile.uri.fsPath, packageGroupName);
    }

    public getInstalledPackages(id: string, instanceName: string = undefined) : Thenable<PackageInfo[]>
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