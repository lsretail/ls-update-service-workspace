

export class ProjectFile
{
    id: string;
    name: string;
    description: string;
    dependencies: Array<Package>;
    devPackageGroups: PackageGroup[];
    servers: Server[];
}

export class PackageGroup
{
    id: string;
    name: string;
    description: string;
    packages: Package[]
    instanceName: string;
    instanceNameSuggestion;
    target: string[];
    servers: Server[];
}

export class Package
{
    id: string;
    version: string;
    optional?: boolean;
}

export class Server
{
    guid: string;
    host: string;
    port: number;
    useSsl: boolean;
    identity: string;
}