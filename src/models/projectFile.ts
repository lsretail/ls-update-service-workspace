

export class ProjectFile
{
    id: string;
    name: string;
    description: string;
    displayName: string;
    devTarget: string | string[];
    variables: {[key:string]: any};
    dependencies: Array<ProjectFilePackage>;
    devPackageGroups: PackageGroup[];
    servers: Server[];
}

export class PackageGroup
{
    id: string;
    name: string;
    description: string;
    packages: ProjectFilePackage[]
    instanceName: string;
    instanceNameSuggestion: string;
    devTarget: string | string[];
    servers: Server[];
}

export class Package
{
    id: string;
    version: string;
    optional?: boolean;
}

export class ProjectFilePackage
{
    id: string;
    version: string | VersionFromAlApp | any;
    optional?: boolean;
}

export class VersionFromAlApp
{
    alAppId: string;
    alAppParts: number;
    alAppIdType: string;
}

export class Server
{
    guid: string;
    host: string;
    port: number;
    useSsl: boolean;
    identity: string;
}