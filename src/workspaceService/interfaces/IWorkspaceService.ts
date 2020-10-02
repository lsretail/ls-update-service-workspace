export interface IWorkspaceService
{
    isActive(): Promise<boolean>;
    dispose(): Promise<void>;
}