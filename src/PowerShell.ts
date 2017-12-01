
import * as Shell from 'node-powershell'

export default class PowerShell
{
    private _debug: boolean;
    private _shell: any;
    private _modulePaths: string[] = [];
    private _isExecuting: boolean;
    private _inExecution: number = 0;
    private _promiseOrder: Promise<any>;

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
            this._shell.addCommand(`Import-Module ${path}`);
        }
    }

    public addModuleFromPath(modulePath: string)
    {
        if (this._shell)
            this._shell.addCommand(`Import-Module ${modulePath}`);
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
                /*if (typeof (args[idx][key]) === 'string')
                    obj[key] = "'"+args[idx][key]+"'";
                else*/
                    obj[key] = args[idx][key];
                newArgs.push(obj);
            }
        }
        return newArgs
    }

    public executeCommand(commandName: string, parseJson: boolean, ...args: any[]) : Promise<any>
    {
        this._initializeIfNecessary();
        this._shell.addCommand(commandName, this.splitArguments(args)).then(value =>
        {
            console.log(value);
        }, error => 
        {
            console.log(error);
        });
        return this._shell.invoke().then(data =>
        {
            if (parseJson)
                return JSON.parse(data);
            else
                return data;
        }, error => 
        {
            throw error;
        });
    }

    public executeCommandSafe(commandName: string, parseJson: boolean, ...args: any[]) : Promise<any>
    {
        if (this._inExecution > 0)
        {
            this._inExecution++;
            return new Promise((resolve, reject) => {
                let fun = iDontCare => {
                    this.executeCommand(commandName, parseJson, ...args).then(data => {
                        this._inExecution--;
                        resolve(data);
                    }, error => {
                        this._inExecution--;
                        reject(error);
                    });
                };
                this._promiseOrder.then(fun, fun);
            });
        }
        else
        {
            this._inExecution++;
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

    public dispose()
    {
        this._shell.dispose().catch(error => {
            if (this._debug)
                console.error(`Error from PowerShell: ${error}`)
        });
    }
}