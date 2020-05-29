

export class ProjectFile
{
    id: string;
    name: string;
    description: string;
    dependencies: Array<Package>;
    devPackageGroups: PackageGroup[];
}

export class PackageGroup
{
    id: string;
    name: string;
    description: string;
    packages: Package[]
    instanceName: string;
    instanceNameSuggestion;
}

export class Package
{
    id: string;
    version: string;
    optional?: boolean;
}