'use strict';
import * as vscode from 'vscode';
import {Constants} from './constants'
import { DeployUiService } from './uiServices/deployUiService';
import { BaseUiService } from './uiServices/BaseUiService';
import { WorkspaceService } from './workspaceService/services/workspaceService';
import { PowerShell } from './PowerShell';
import { GoCurrentPsService } from './goCurrentService/services/goCurrentPsService';
import { DeployService } from './deployService/services/deployService';
import { WorkspaceFilesService } from './services/workspaceFilesService';
import { DeployPsService } from './deployService/services/deployPsService';
import { AlUiService } from './uiServices/alUiService';
import { PackageService } from './packageService/services/packageService'
import { AlService } from './alService/services/alService';
import { AlPsService } from './alService/services/alPsService';
import { PackageUiService } from './uiServices/packageUiService';
import { PackagePsService } from './packageService/services/packagePsService';
import { AlExtensionService } from './packageService/services/alExtensionService';
import { PostDeployController } from './postDeployController';

export async function activate(context: vscode.ExtensionContext)
{
    console.log('Activating Go Current Workspace!');

    process.on('unhandledRejection', (reason) => {
        console.log(reason);
    });

    let services: Array<any> = [];

    let config = vscode.workspace.getConfiguration('go-current-workspace')

    // TODO, on project file changed, update service activity
    //  - deploy + al serivces
    // TODO: PostDeploy + add to launch.json !!!!
    //    - Deployment removed, remove from launch.json
    //    - Check for updates to remove from data.json

    let powerShell = new PowerShell(config.get('debug'));
    let goCurrentPsService = new GoCurrentPsService(powerShell, context.asAbsolutePath("PowerShell\\GoCurrentPsService.psm1"));
    let deployPsService = new DeployPsService(powerShell, context.asAbsolutePath("PowerShell\\DeployPsService.psm1"));
    let alPsService = new AlPsService(powerShell, context.asAbsolutePath("PowerShell\\AlPsService.psm1"));

    let workspaceService = new WorkspaceService();
    let outputChannel = vscode.window.createOutputChannel("Go Current Workspace");

    let workspaceFilesServices = workspaceService.register(WorkspaceFilesService, workspaceFolder => {
        return new WorkspaceFilesService(workspaceFolder);
    });

    let wsPostDeployServices = workspaceService.register(PostDeployController, workspaceFolder => {
        return new PostDeployController(workspaceFolder);
    });

    let wsDeployServices = workspaceService.register(DeployService, workspaceFolder => {
        let postDeployService = wsPostDeployServices.getService(workspaceFolder);
        let filesService = workspaceFilesServices.getService(workspaceFolder);
        let deployService =  new DeployService(
            filesService.projectFile,
            filesService.workspaceData,
            deployPsService,
            goCurrentPsService,
            workspaceFolder.uri.fsPath
        );

        deployService.onDidPackagesDeployed(postDeployService.onPackagesDeployed, postDeployService);
        deployService.onDidInstanceRemoved(postDeployService.onInstanceRemoved, postDeployService);
        deployService.onDidInstanceRemoved(this.onDeploymentRemoved, this);

        return deployService;
    });

    let wsAlServices = workspaceService.register(AlService, workspaceFolder => {
        let deployService = wsDeployServices.getService(workspaceFolder);
        let filesService = workspaceFilesServices.getService(workspaceFolder);
    
        return new AlService(
            deployService,
            alPsService,
            filesService.appJson,
            workspaceFolder 
        )
    });

    let packagePsService = new PackagePsService(powerShell, context.asAbsolutePath("PowerShell\\PackagePsService.psm1"));

    let wsPackageServices = workspaceService.register(PackageService, workspaceFolder => {
        let filesService = workspaceFilesServices.getService(workspaceFolder)
        return new PackageService(
            packagePsService,
            new AlExtensionService(),
            filesService.projectFile
        );
    });

    let baseUiService = new BaseUiService(
        context, 
        goCurrentPsService,
        wsDeployServices
    );
    services.push(baseUiService);

    let deployUiService = new DeployUiService(
        context, 
        wsDeployServices, 
        goCurrentPsService
    );
    services.push(deployUiService);

    let alUiService = new AlUiService(
        context,
        wsAlServices
    );
    services.push(alUiService);

    let packageUiService = new PackageUiService(
        context,
        wsDeployServices,
        wsAlServices,
        wsPackageServices,
        packagePsService,
        goCurrentPsService,
        outputChannel
    )
    services.push(packageUiService);

    // Adding the workspace service last, to use workspace events for setup.
    services.push(workspaceService);

    for (let service of services)
        await service.activate();
}

export function deactivate() {
    vscode.commands.executeCommand("setContext", Constants.goCurrentExtensionActive, false);
    vscode.commands.executeCommand("setContext", Constants.goCurrentAlActive, false);
    console.log("Deactivating Go Current Workspace...");
}