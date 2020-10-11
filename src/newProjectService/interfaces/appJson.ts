

export interface AppJson
{
    id: string;
    name: string;
    publisher: string;
    version: string;
    dependencies: AppJsonDependency[] 
    platform: string;
    application: string | undefined;
}

export interface AppJsonDependency
{
    id: string;
    publisher: string;
    name: string;
    version: string;
}