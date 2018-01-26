
import {Package} from './projectFile'

export class UpdateAvailable
{
    public guid: string;
    public packageGroupName: string;
    public instanceName: string;
    public packages: Package[];
}