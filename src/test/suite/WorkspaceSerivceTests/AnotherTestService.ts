import { IWorkspaceService } from '../../../workspaceService/interfaces/IWorkspaceService';

export class AnotherTestService implements IWorkspaceService
{
    private _value: string;

    constructor(value: string)
    {
        this._value = value;
    }
    
    isActive(): Promise<boolean> {
        throw new Error('Method not implemented.');
    }
    dispose(): Promise<void> {
        throw new Error('Method not implemented.');
    }

    get value()
    {
        return this._value;
    }
}