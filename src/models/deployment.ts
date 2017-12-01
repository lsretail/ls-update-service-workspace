import {Package} from './projectFile'

export class Deployment
{
    guid: string;
    instanceName: string;
    name: string;
    packages: Array<Package> = [];
    lastUpdated: Array<Package> = [];
}