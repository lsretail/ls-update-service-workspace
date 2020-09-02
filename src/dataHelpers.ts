
import {PackageGroup} from './models/projectFile'

export class DataHelpers
{
    public static getDeploymentSet(sets: PackageGroup[], name: string) : PackageGroup
    {
        return this.getEntryByProperty<PackageGroup>(sets, "name", name);
    }

    public static getEntryByProperty<TType>(list: readonly TType[], property: string, value: any) : TType
    {
        for (let entry of list)
        {
            if (entry[property] === value)
            {
                return entry
            }
        }
    }

    public static removeEntryByProperty<TType>(list: Array<TType>, property: string, value: any) : boolean
    {
        for (let entry of list)
        {
            if (entry[property] === value)
            {
                let idx = list.indexOf(entry);
                list.splice(idx, 1);
                return true; 
            }
        }
        return false;
    }
}