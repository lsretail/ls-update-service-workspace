# LS Retail Update Service Workspace

*LS Retail Update Service Workspace* brings you the power of Update Service to your workspace in Visual Studio Code.

With this extension, you can ...

* Easily install Update Service packages from VS Code to support your development...
    * Such as a new LS Central environment for AL Extension development.
* Get update notifications.
* Update your installed packages to the latest version.
* Remove installed packages.
* Add LS Update Service Workspace to your project with *LS Update Service: Go!*.
* Create LS Update Service packages from within VS Code.
* Create LS Update Service packages for your Business Central app.
* Autogeneration of *launch.json* file.
* Handful of AL Extension development helpers.

## Requirements

* LS Update Service client needs to be installed on the computer, get it on our partner [partner portal](https://portal.lsretail.com/Products/LS-Central-LS-Nav/Downloads/Go-Current).

## Documentation

Read more about how to use the extension and features in our documentation here: https://help.gocurrent.lsretail.com/docs/workspace/overview.html

## Support
If you encounter bugs with the extension, ensure you have the latest version of LS Update Service Workspace and Visual Studio Code before reporting them through GitHub https://github.com/lsretail/ls-update-service-workspace/issues.

## License
The extension is made available under the MIT license.

## Release Notes

### 1.1.0
This release focuses on improved UX when working with multiple AL apps.

* Update *launch.json* for multiple AL apps:

    Now the extension can update *launch.json* for multiple AL app projects.

    Let's say you have two projects *A* and *B* in the same workspace or repository.
    1. In *A*, define your development package group, with your Business Central setup.
    2. For project *B*, create or add to the VS Code settings file *Project-B\.vscode\settings.json*:
    ```json
    {
        ...
        "ls-update-service-workspace.devPackageGroupWorkspaceDirs": [
            "..\\Project-A"
        ]
    }
    ```
    3. Reload or restart VS Code.
    * Now you can:
        * Open *A* and *B* in the same workspace and when you install a new BC instance, *launch.json* is updated for both projects.
        * Only open *B* in VS Code, run *LS Update Service: Install Packages* and install any packages defined in *A*.
        * Run *Re-populate launch.json* and *launch.json* is updated with Business Central instances from project *A*.

* *Compile and create package* now includes AL compilation errors output if any.
* Bugfixes:
    * Now, when you right-click on *gocurrent.json->Import dependencies from app.json* it doesn't ask the user which workspace to use, rather uses the workspace where *gocurrent.json* is located.
    * If *application* property was set in *app.json*, *gocurrent.json->Import dependencies from app.json* added multiple *bc-application* dependencies.

### 1.0.0
This release focuses on improved AL development support with Business Central specific commands for better development flow.

A more readable and easier project file configuration (gocurrent.json).

Now you can easily start using LS Update Service Workspace with your own project to extend LS Central with the new *Go!* command.

And last and not least, the ability to create an LS Update Service package from within VS Code!

New AL specific commands:
* *Download Dependencies (.alpackages + .netpackages)*
    * Downloads dependency apps into .alpackages folder and dot net add-ins into .netpackages defined in gocurrent.json from an LS Update Service server.
* *Start App Data Upgrade*
    * Performs data upgrade (Start-NavAppDataUpgrade) on all pending apps for a selected installation, which comes in handy when projects app version is incremented.
* *Unpublish App*
    * Unpublishes the app defined in *app.json* from selected installation. Which comes in handy when the app exists in the database under a different scope.
* *Compile and Create Package*
    * Downloads the necessary dependencies, compiles the app against them, and creates an LS Update Service package.
* *Create Package*
    * Creates an app package from an existing app in the root of the AL project.

New *gocurrent.json* features:

* Variables can now be used in basic text fields and version fields.
* New built-in variables:
    * ${currentBranch} and ${projectDir}
    * AL specific: ${alAppVersion}, ${alAppName}, ${alAppPublisher}, ${alAppId}, ${alAppDescription}, ${alAppProjectDir}
* Variable functions:
    * Variables can be manipulated with built-in functions.
    * ${variableName:parts(3)}, ${variableName:preReleaseLabel}, ${variableName:branchLabel}, ${variableName:maxLength(10)}.
* New variable declarations:
    * Branch priority filter.
    * Get version from AL app project file (app.json).
* New properties with autocomplete for package creation:
    * name, displayName, description, version, files, command, instance, ...
    * Property *versionVariables* becomes *variables*.
* Version Targets
    * You can now create LS Update Service packages for different release targets, such as Release, ReleaseCandidate, Dev or your custom target.
        * For example, your release candidate package will get a pre-release package version 1.0.0-rc.1, your dev package 1.0.0-branch-name.10 and of course, you release 1.0.0
    * In the same way, you can have different dependencies based on the selected target.

... including bug fixes and various UX improvements.

### 0.4.0

* New command *Add Instance to Workspace*: Add any existing LS Update Service instance to your workspace. An instance could be an LS Central / Business Central instance.
* New command *Re-populate launch.json*: Add any LS Central instances in the workspace to the *launch.json* file.
* Now you can add a list of GoC servers to *gocurrent.json*, globally for the file or for each specific package group.
* Installer not really installing the extension into VS Code.
* Instances not added to the workspace if VS Code is closed during installation.
* Plus minor enhancements and bugfixes.

### 0.2.0

* New launch configuration are added to *launch.json* instead of updating existing and removed with the package.
* Adapted to new version of LS Update Service.

### 0.1.1

* Notify user when *go-current-client* and *go-current-workspace* is updated.
* Spaces and dots removed in suggested instance name.
* Bugfix: Canceling arguments user input now cancels instead of continuing installation.

### 0.1.0

* Initial release.
* Able to install, update and remove package groups, defined on project level.