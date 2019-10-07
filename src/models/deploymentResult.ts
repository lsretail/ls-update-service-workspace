import { Deployment } from "./deployment";
import { Package } from "./projectFile";

export class DeploymentResult
{
    deployment: Deployment;
    lastUpdated: Array<Package> = [];
}