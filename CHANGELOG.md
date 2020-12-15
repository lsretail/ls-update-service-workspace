# Change Log
All notable changes to the "Go Current - Workspace" extension will be documented in this file.

## [1.1.0] - 2020-12-14
### Added
- Re-use development package groups from other projects, with a new VS Code setting *devPackageGroupWorkspaceDirs*.
- Update multiple *launch.json* files for AL projects with *devPackageGroupWorkspaceDirs* set.
- You can now turn on debug logs in the VS Code settings. The logs will appear in output-tab (CTRL+SHIFT+U), under *LS Update Service Debug*.

### Changed
- All references to *Go Current* in the user interface have been changed to *LS Update Service*.
- *Compile and create package* now includes AL compilation errors output if any.

### Fixed
- Now, when you right-click on *gocurrent.json->Import dependencies from app.json* it doesn't ask the user which workspace to use, rather uses the workspace where *gocurrent.json* is located.
- If *application* property was set in *app.json*, *gocurrent.json->Import dependencies from app.json* added multiple *bc-application* dependencies.


## [1.0.0] - 2020-10-20
### Added
- *Download Dependencies (.alpackages + .netpackages)* command added.
- *Start App Data Upgrade* command added.
- *Unpublish App* command added.
- *Compile and Create Package* command added.
- *Create Package* command added.
- Variable functions inside *gocurrent.json* added.
    - ${variableName:parts(3)}, ${variableName:preReleaseLabel}, ${variableName:branchLabel}, ${variableName:maxLength(10)}.
- Variable declarations added.
    - Branch priority filter
- AL specific variables and function added to *gocurrent.json*.
- Support for version targets added to *gocurrent.json*.

## [0.3.1] - 2019-12-16
### Added
- Version resolver now supports target configuration, i.e. for release, release candidate or development.

## [0.3.0] - 2019-09-16
### Added
- Added dependencies, package metadata, reference from package group to dependencies and more.

## [0.2.0] - 2019-09-16
### Changed
- Adapted to new Go Current version.

## [0.1.0]
- User can remove installed package groups trough *Remove packages* command.
- User prompt to update launch.json when bc-server package installed.
- User prompt with json document with arguments to fill when installing a package requiring arguments.
- Install and update package groups, defined on project level.
- Initial release