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
import { VirtualWorkspaces } from './helpers/virtualWorkspaces';
import { Logger } from './interfaces/logger';

export async function activate(context: vscode.ExtensionContext)
{
    console.log('Activating LS Update Service Workspace!');

    process.on('unhandledRejection', (reason) => {
        console.log(reason);
    });

    let services: Array<any> = [];

    let config = vscode.workspace.getConfiguration(Constants.configurationSectionId);

    let debug = config.get(Constants.configurationDebug, false);

    let logger = new Logger();
    if (debug)
    {
        let outputChannel = vscode.window.createOutputChannel("LS Update Service Debug");
        logger.setLogger(outputChannel.appendLine, outputChannel);
    }

    logger.info("Initializing extension...");

    let powerShell = new PowerShell(logger, debug);

    let goCurrentPsService = new GoCurrentPsService(powerShell, context.asAbsolutePath("PowerShell\\GoCurrentPsService.psm1"));
    let deployPsService = new DeployPsService(powerShell, context.asAbsolutePath("PowerShell\\DeployPsService.psm1"));
    let alPsService = new AlPsService(powerShell, context.asAbsolutePath("PowerShell\\AlPsService.psm1"));

    let workspaceService = new WorkspaceService();
    let outputChannel = vscode.window.createOutputChannel("LS Update Service");

    let wsWorkspaceFilesServices = workspaceService.register(WorkspaceFilesService, workspaceEntry => {
        return new WorkspaceFilesService(workspaceEntry.workspaceFolder);
    });

    let wsPostDeployServices = workspaceService.register(PostDeployController, workspaceEntry => {
        return new PostDeployController(workspaceEntry.workspaceFolder);
    });

    let virtualWorkspaceService = new VirtualWorkspaces(logger, workspaceService);
    services.push(virtualWorkspaceService);

    let wsDeployServices = workspaceService.register(DeployService, workspaceEntry => {
        let postDeployService = wsPostDeployServices.getService(workspaceEntry.workspaceFolder);
        let filesService = wsWorkspaceFilesServices.getService(workspaceEntry.workspaceFolder);
        let deployService =  new DeployService(
            filesService.projectFile,
            filesService.workspaceData,
            deployPsService,
            goCurrentPsService,
            workspaceEntry.workspaceFolder.uri.fsPath
        );

        if (!workspaceEntry.virtual)
        {
            deployService.onDidPackagesDeployed(postDeployService.onPackagesDeployed, postDeployService);
            deployService.onDidInstanceRemoved(postDeployService.onInstanceRemoved, postDeployService);
        }
        deployService.onDidPackagesDeployed(p => {virtualWorkspaceService.updateLaunchJson(workspaceEntry.workspaceFolder, p)});
        deployService.onDidInstanceRemoved(i => { virtualWorkspaceService.removeFromLaunchJson(workspaceEntry.workspaceFolder, [i])});
    

        return deployService;
    });

    let wsAlServices = workspaceService.register(AlService, workspaceEntry => {
        let deployService = wsDeployServices.getService(workspaceEntry.workspaceFolder);
        let filesService = wsWorkspaceFilesServices.getService(workspaceEntry.workspaceFolder);
    
        return new AlService(
            deployService,
            alPsService,
            filesService.appJson,
            workspaceEntry.workspaceFolder 
        )
    });

    let alExtensionService = new AlExtensionService();
    let packagePsService = new PackagePsService(powerShell, context.asAbsolutePath("PowerShell\\PackagePsService.psm1"));

    let wsPackageServices = workspaceService.register(PackageService, workspaceEntry => {
        let filesService = wsWorkspaceFilesServices.getService(workspaceEntry.workspaceFolder)
        return new PackageService(
            packagePsService,
            alExtensionService,
            filesService.projectFile,
            filesService.appJson
        );
    });

    let baseUiService = new BaseUiService(
        context,
        logger,
        goCurrentPsService,
        wsDeployServices,
        wsWorkspaceFilesServices
    );
    services.push(baseUiService);

    let deployUiService = new DeployUiService(
        context, 
        logger,
        wsDeployServices, 
        goCurrentPsService
    );
    services.push(deployUiService);

    let alUiService = new AlUiService(
        context,
        logger,
        wsAlServices,
        wsDeployServices,
        virtualWorkspaceService,
        wsWorkspaceFilesServices
    );
    services.push(alUiService);

    let packageUiService = new PackageUiService(
        context,
        logger,
        wsDeployServices,
        wsAlServices,
        wsPackageServices,
        packagePsService,
        goCurrentPsService,
        wsWorkspaceFilesServices,
        alExtensionService,
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
    console.log("Deactivating LS Update Service Workspace...");
}