# Go Current Workspace README

*Go Current Workspace* brings you the power of Go Current to your workspace in Visual Studio Code.

## Features

### Install Go Current Packages from VS Code

1. Open the *command palette (ctrl+p)->Go Current: Install packages*.
2. From the drop down, select the packages you want to install.
    * Note: Your project must be configured beforehand with the packages available, see *How to add packages to your project* below.
3. A Go Current dialog will appear, you might be presented with some arguments and additional components.
4. Click *Install* when ready.

### Check for Updates

1. Open the *command palette (ctrl+p)->Go Current: Check for Updates*.
* If updates available, a notification will appear in the right lower corner.
2. Click *Update* on any of the notification to start the update process.

### Uninstall Packages

1. Open the *command palette (ctrl+p)->Go Current: Uninstall Packages*.
2. From the drop down, select the packages you want to uninstall.

### Add (Go Current) Instance to Your Workspace

If you installed an instance (LS Central / Business Central), outside of VS Code and want to mange it from your workspace, you can add it with the command *Add Instance to Your Workspace*:

1. Open the *command palette (ctrl+p)->Go Current: Add Instance to Your Workspace*.
2. Select an instance from the drop down list.
* If the selected instance is a LS Central / Business Central instance, it will be added to your *launch.json*.

## Requirements

* Go Current client needs to be installed on the computer - which is installed with the extension.

## Extension Settings

No settings at the moment.

## Known Issues

* Nothing happens when Go Current Workspace commands are issued in VS Code.

    * Workaround: Restart VS Code.

## Release Notes

### 0.4.0

* New command *Add Instance to Workspace*: Add any existing Go Current instance to your workspace. An instance could be an LS Central / Business Central instance.
* New command *Re-populate launch.json*: Add any LS Central instances in the workspace to the *launch.json* file.
* Now you can add a list of GoC servers to *gocurrent.json*, globally for the file or for each specific package group.
* Plus minor enhancements and bugfixes.


### 0.2.0

* New launch configuration are added to *launch.json* instead of updating existing and removed with the package.
* Adapted to new version of Go Current.

### 0.1.1

* Notify user when *go-current-client* and *go-current-workspace* is updated.
* Spaces and dots removed in suggested instance name.
* Bugfix: Canceling arguments user input now cancels instead of continuing installation.

### 0.1.0

* Initial release.
* Able to install, update and remove package groups, defined on project level.

## How to Add Packages to Your Project

Create a file *.gocurrent/gocurrent.json* relative to your project directory with the following structure:

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

This examples adds two options to you workspace, *Package group* and *Another group*.
Must must make sure the package listed under each group are available on your GoC server.