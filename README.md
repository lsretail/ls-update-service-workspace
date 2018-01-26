# Go Current Workspace README

*Go Current Workspace* brings you the power of Go Current to your workspace in Visual Studio Code.

## Features

### Install development packages from VSCode
Easily install Go Current packages relevant to your project.
1. Create a *gocurrent.json* file in root of your workspace with the format:
    ```
    {
        "devPackageGroups": [
            {
                "name": "Package group",
                "description": "Deploy this package group to enhance your development.",
                "packages": [
                    { 
                        "id": "server",
                        "version": "1.0"
                    },
                    {
                        "id": "windows-client",
                        "version": "1.0"
                    }
                ]
            },
            {
                "name": "Another group"
                "description": "Packages needed on the build server"
                "packages": [
                    {
                        "id": "compiler"
                        "version": "1.0"
                    }
                ]
            }
        ]
    }
    ```
2. Open the *command palette (ctrl+p)->Go Current: Deploy packages->Select package group you want to install*.

## Requirements

* Go Current client needs to be installed on the computer - which is installed with the extension.

## Extension Settings

No settings at the moment.

## Known Issues

* Nothing happens when GC Workspace commands are issued in VSCode.

  * Workaround: Restart VSCode.

## Release Notes

### 0.1.0

* Initial release.
* Able to install, update and remove package groups, defined on project level.

