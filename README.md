# Go Current Workspace README

*Go Current Workspace* brings you the power of Go Current to your Visual Studio Code workspace.

## Features

### Install development packages from VSCode
Easily install Go Current packages relevant to your project.
1. Create a *go-current.json* file in root of your workspace with the format:
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

* Go Current client needs to be installed on the computer.
* *TODO: add a section describing those and how to install and configure them.*

## Extension Settings

No settings at the moment.

## Known Issues

No known issues at the moment.

## Release Notes

### 0.1.0-alpha

* Install and update package groups, defined on project level.

-----------------------------------------------------------------------------------------------------------

## Working with Markdown

**Note:** You can author your README using Visual Studio Code.  Here are some useful editor keyboard shortcuts:

* Split the editor (`Cmd+\` on OSX or `Ctrl+\` on Windows and Linux)
* Toggle preview (`Shift+CMD+V` on OSX or `Shift+Ctrl+V` on Windows and Linux)
* Press `Ctrl+Space` (Windows, Linux) or `Cmd+Space` (OSX) to see a list of Markdown snippets

### For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**