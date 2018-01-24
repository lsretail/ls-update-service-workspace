
import * as Shell from 'node-powershell'

export class PowerShell
{
    private _debug: boolean;
    private _shell: any;
    private _modulePaths: string[] = [];
    private _isExecuting: boolean;
    private _inExecution: number = 0;
    private _promiseOrder: Promise<any>;
    private _preCommand: string;

    constructor(debug: boolean = false)
    {
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
            debugMsg: this._debug
        });
        for (var path of this._modulePaths)
        {
            this._shell.addCommand(`Import-Module ${path} -DisableNameChecking`);
        }
    }

    public setPreCommand(command: string)
    {
        this._preCommand = command;
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
        let command = this._shell.addCommand(commandName, this.splitArguments(args)).then(value =>
        {
            console.log(value);
        }, error => 
        {
            console.log(error);
        });
        return this._shell.invoke().then(data =>
        {
            console.log(data);
            if (parseJson)
                return JSON.parse(data);
            else
                return data;
        }, error => 
        {
            console.log(error);
            this.processError(error);
        });
    }

    public executeCommandSafe(commandName: string, parseJson: boolean, ...args: any[]) : Promise<any>
    {
        if (this._inExecution > 0)
        {
            return new Promise((resolve, reject) => {
                let fun = iDontCare => {
                    this.executeCommand(commandName, parseJson, ...args).then(data => {
                        this._inExecution--;
                        console.log(`Removing "${commandName}" from promise queue (${this._inExecution}).`);
                        resolve(data);
                    }, error => {
                        this._inExecution--;
                        console.log(`Removing "${commandName}" from promise queue (${this._inExecution}).`);
                        reject(error);
                    });
                };
                console.log(`Adding command "${commandName}" to promise queue (${this._inExecution}).`);
                this._inExecution++;
                this._promiseOrder.then(fun, fun);
            });
        }
        else
        {
            this._inExecution++;
            console.log(`Adding command "${commandName}" to promise queue (${this._inExecution}).`);
            let decrease = argument => {
                this._inExecution--;
                return argument;
            };
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

    private processError(error: string)
    {
        let powerShellError;
        try
        {
            let ble = error.split('|||')[0].split('\r\n').join('');
            let errorObj = JSON.parse(ble);
            if (Object.keys(errorObj).indexOf('message') >= 0)
            {
                powerShellError = new PowerShellError(errorObj.message, errorObj.scriptStackTrace, true, errorObj.type);
            }
        }
        catch (e)
        {
            let split = error.split('\n');
            let firstLine = split[0];
            split.splice(0, 1);
            let rest = split.join('\n');
            powerShellError = new PowerShellError(firstLine, rest, false);
        }
        throw powerShellError; 
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

    constructor(message: string, scriptStackTrace: string, fromJson: boolean, type: string = 'unknown')
    {
        super(message);
        this.scriptStackTrace = scriptStackTrace;
        this.fromJson = fromJson;
        this.type = type
    }
}