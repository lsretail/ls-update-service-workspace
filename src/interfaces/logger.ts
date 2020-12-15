
export class Logger
{
    private _logger: (message: string) => void;
    private _thisArg: any;

    constructor(logger?: (message: string) => void)
    {
        if (logger)
            this._logger = logger;
        else 
            this._logger = (message: string) => {};
    }

    public setLogger(logger?: (message: string) => void, thisArg?: any)
    {
        this._logger = logger;
        this._thisArg = thisArg;
    }

    private get logger()
    {
        if (this._thisArg)
            return this._logger.bind(this._thisArg);
        return this._logger;
    }

    public info(message: string)
    {
        this.logger(`INFO: ${message}`);
    }

    public debug(message: string)
    {
        this.logger(`DEBUG: ${message}`);
    }

    public warning(message: string)
    {
        this.logger(`WARNING: ${message}`);
    }

    public error(message: string)
    {
        this.logger(`ERROR: ${message}`);
    }

    public exception(exception: any)
    {
        this.logger(`EXCEPTION: ${exception}`);
    }
}