import path = require("path")
import { Constants } from "../constants"
import { fsHelpers } from "../fsHelpers"

export class ProjectFileHelpers
{
    public static getProjectFilePath(workspaceDir: string): string
    {
        let projectFilePath = path.join(workspaceDir, Constants.projectFileName)
        if (!fsHelpers.existsSync(projectFilePath))
        {
            projectFilePath = path.join(workspaceDir, Constants.goCurrentWorkspaceDirName, Constants.projectFileName)
        }
        return projectFilePath;
    }
}