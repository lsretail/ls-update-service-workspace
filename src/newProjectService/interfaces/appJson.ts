

export interface AppJson
{
    id: string;
    name: string
    dependencies: AppJsonDependency[] 
}

export interface AppJsonDependency
{
    id: string;
    publisher: string;
    name: string;
    version: string;
}