import { Deployment } from "./deployment";
import { DeployService } from '../deployService/services/deployService';
import { WorkspaceFolder } from "vscode";

export class DeploymentPayload
{
    deployment: Deployment;
    deployService: DeployService;
    workspaceFolder: WorkspaceFolder;
}