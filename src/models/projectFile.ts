

export class ProjectFile
{
    id: string;
    name: string;
    devPackageGroups: PackageGroup[]
}

export class PackageGroup
{
    name: string;
    description: string;
    packages: Package[]
}

export class Package
{
    id: string;
    version: string;
}