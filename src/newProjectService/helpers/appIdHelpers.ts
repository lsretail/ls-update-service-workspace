import { ProjectFile } from "../../models/projectFile";
import { AppJson } from "../interfaces/appJson";

export class AppIdHelpers
{
    static getAppIdsFromGoCurrentJson(projectFile: ProjectFile): string[]
    {
        let list: string[] = [];

        if (projectFile.variables)
            this.getAlAppIdProperties(Object.values(projectFile.variables), list);
        if (projectFile.dependencies)
            this.getAlAppIdProperties(projectFile.dependencies.map(d => d.version), list);

        return list;
    }

    static getDependenciesFromGoCurrentJson(projectFile: ProjectFile): string[]
    {
        if (!projectFile.dependencies)
            return;
        
        return projectFile.dependencies.map(d => d.id);
    }

    private static getAlAppIdProperties(items: any[], list: string[])
    {
        if (!items || items.length === 0)
            return;

        let pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

        for (let item of items)
        {
            if (item === undefined || item === null)
                continue;

            if (item.alAppId && pattern.test(item.alAppId))
            {
                list.push(item.alAppId);
                continue
            }

            if (typeof item === 'object' && item !== null )
                this.getAlAppIdProperties(Object.values(item), list)
        }
    }

    static getAppIdsFromAppJson(appJsonFile: AppJson): string[]
    {
        let list: string[] = [];

        if (!appJsonFile.dependencies)
            return list;

        return appJsonFile.dependencies.map(d => d.id);
    }

    static getExcessiveAppIds(gocIds: string[], appJsonIds: string[], currAppId: string): string[]
    {
        return gocIds.filter(id => !appJsonIds.includes(id) && id !== currAppId);
    }

    static getNewAppIds(gocIds: string[], appJsonIds: string[]): string[]
    {
        return appJsonIds.filter(id => !gocIds.includes(id));
    }
}