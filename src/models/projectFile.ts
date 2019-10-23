

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
}

export class Package
{
    id: string;
    version: string;
    optional?: boolean;
}