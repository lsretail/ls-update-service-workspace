
import {Package} from './projectFile'

export class UpdateAvailable
{
    public guid: string;
    public deploymentSetName: string;
    public instanceName: string;
    public packages: Package[];
}