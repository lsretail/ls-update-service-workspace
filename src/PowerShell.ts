
//import Shell, { PSCommand } from 'node-powershell'
import * as Shell from 'node-powershell'
import { PSCommand } from 'node-powershell'
import { Logger } from './interfaces/logger';

export class PowerShell
{
    private _debug: boolean;
    private _logger: Logger;
    private _shell: any;
    private _modulePaths: string[] = [];
    private _inExecution: number = 0;
    private _promiseOrder: Promise<any>;
    private _preCommand: string;
    private _runNextCommand: string;
    private _relaunchCount = 0;

    constructor(logger: Logger, debug: boolean)
    {
        this._logger = logger;
        this._debug = debug;
    }

    private _initializeIfNecessary()
    {
        if (this._shell)
        {
            return;
        }
        this._shell = new Shell({
            executionPolicy: 'Bypass',
            noProfile: true,
            verbose: this._debug,
            nonInteractive: true
        });

        this._shell.on('end', code => {
            if (code > 0)
            {
                console.log(`PowerShell ended unexpectedly (exit code ${code}).`)}
                this._relaunchCount++;
                if (this._relaunchCount < 100)
                    this._shell = null;
            }
        );
        
        for (var path of this._modulePaths)
        {
            this._shell.addCommand(`Import-Module ${path} -DisableNameChecking`);
        }
    }

    public get isDebug()
    {
        return this._debug;
    }

    public restart()
    {
        this._shell.dispose().catch(error => {
            if (this._debug)
                console.error(`Error from PowerShell: ${error}`)
        });
        this._shell = null;
    }

    public getNewPowerShell() : PowerShell
    {
        let powerShell = new PowerShell(this._logger, this.isDebug);
        for (var path of this._modulePaths)
        {
            powerShell.addModuleFromPath(path);
        }

        if (this._preCommand)
            powerShell.setPreCommand(this._preCommand);
        return powerShell;
    }

    public setPreCommand(command: string)
    {
        this._preCommand = command;
    }

    public setRunWithNext(command: string)
    {
        this._runNextCommand = command;
    }

    public addModuleFromPath(modulePath: string)
    {
        if (this._shell)
            this._shell.addCommand(`Import-Module ${modulePath} -DisableNameChecking`);
        else
            this._modulePaths.push(modulePath);
    }

    private splitArguments(args: any[]): any[]
    {
        let newArgs: any[] = [];
        for (let idx in args)
        {
            for (let key of Object.keys(args[idx]))
            {
                let obj = {};
                obj[key] = args[idx][key];
                newArgs.push(obj);
            }
        }
        return newArgs
    }

    public executeCommand(commandName: string, parseJson: boolean, ...args: any[]) : Promise<any>
    {
        this._initializeIfNecessary();
        if (this._preCommand)
            this._shell.addCommand(this._preCommand);

        if (this._runNextCommand)
        {
            this._shell.addCommand(this._runNextCommand);
            this._runNextCommand = undefined;
        }

        let newCommand = new PSCommand(commandName);
        let structuredArgument = this.splitArguments(args);
        for (let item of structuredArgument)
        {
            newCommand = newCommand.addParameter(item);
        }

        this._shell.addCommand(newCommand).then(value =>
        {
            this.log(value);
        }, error => 
        {
            this.log(error);
        });
        
        return this._shell.invoke().then(data =>
        {
            if (this._debug)
            {
                this.log("Data from command:");
                this.log(data);
            }
            if (parseJson && data !== "")
                return JSON.parse(data);
            else if (parseJson && data === "")
                return null;
            else
                return data;
        }, error => 
        {
            this.log(error);
            this.processError(error);
        });
    }

    public executeCommandSafe(commandName: string, parseJson: boolean, ...args: any[]) : Promise<any>
    {
        if (this._inExecution > 0)
        {
            this._promiseOrder = new Promise((resolve, reject) => {
                let fun = iDontCare => {
                    this.executeCommand(commandName, parseJson, ...args).then(data => {
                        this._inExecution--;
                        this.log(`Removing "${commandName}" from promise queue (${this._inExecution}).`);
                        resolve(data);
                    }, error => {
                        this._inExecution--;
                        this.log(`Removing "${commandName}" from promise queue (${this._inExecution}).`);
                        reject(error);
                    });
                };
                this.log(`Adding command "${commandName}" to promise queue (${this._inExecution}).`);
                this._inExecution++;
                this._promiseOrder.then(fun, fun);
            });
            return this._promiseOrder;
        }
        else
        {
            this.log(`Adding command "${commandName}" to promise queue (${this._inExecution}).`);
            this._inExecution++;
            this._promiseOrder = this.executeCommand(commandName, parseJson, ...args).then(argument => 
            {
                this._inExecution--;
                return argument;
            }, argument => 
            {
                this._inExecution--;
                throw argument;
            });
            return this._promiseOrder;
        }
    }

    private processError(error: any)
    {
        let errorStart = '!!!'
        let errorEnd = '|||'
        let powerShellError: PowerShellError;
        try
        {
            let ble = error.message.split(errorStart)[1].split(errorEnd)[0].split('\r\n').join('');
            let errorObj = JSON.parse(ble);
            if (Object.keys(errorObj).indexOf('message') >= 0)
            {
                powerShellError = new PowerShellError(errorObj.message, errorObj.scriptStackTrace, true, errorObj.type);
            }
        }
        catch (e)
        {
            let split = error.message.split('\n');
            let firstLine = split[0];
            split.splice(0, 1);
            let rest = split.join('\n');
            powerShellError = new PowerShellError(firstLine, rest, false);
        }
        powerShellError.rawError = error;
        throw powerShellError;
    }

    private log(message: any)
    {
        if (this._debug)
            this._logger.debug(message);
    }

    public dispose()
    {
        this._shell.dispose().catch(error => {
            if (this._debug)
                console.error(`Error from PowerShell: ${error}`)
        });
    }
}

export class PowerShellError extends Error 
{
    public scriptStackTrace: string;
    public fromJson: boolean;
    public type: string;
    public rawError: any;

    constructor(message: string, scriptStackTrace: string, fromJson: boolean, type: string = 'unknown')
    {
        super(message);
        this.scriptStackTrace = scriptStackTrace;
        this.fromJson = fromJson;
        this.type = type
    }
}