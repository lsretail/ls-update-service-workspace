import {Package} from './projectFile'

export class Deployment
{
    guid: string;
    instanceName: string;
    id: string;
    name: string;
    packages: Array<Package> = [];
}