import * as vscode from 'vscode'
import { API as GitAPI, GitExtension, APIState } from '../typings/git'; 

export default class GitHelpers
{
    public static getBranchName(workspacePath: string): string
    {
        const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git').exports;
        if (gitExtension.enabled)
        {
            const api = gitExtension.getAPI(1);
            for (let repository of api.repositories)
            {
                if (workspacePath.startsWith(repository.rootUri.fsPath))
                    return repository.state?.HEAD?.name ?? ""
            }
        }
        return "";
    }
}