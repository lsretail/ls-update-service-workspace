
import {Package} from './projectFile'

export class UpdateAvailable
{
    public guid?: string;
    public packageGroupId: string;
    public packageGroupName: string;
    public instanceName: string;
    public packages?: Package[];
    public error?: string;
}