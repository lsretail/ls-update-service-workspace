"use strict"

import {window} from 'vscode';
import {PowerShellError} from './PowerShell'

import { AppError } from './errors/AppError';
import { Logger } from './interfaces/logger';

export default class Controller
{
    public static handleError(reason: any, logger: Logger): boolean
    {
        if (reason.message)
            logger.error(reason.message);
        else
            logger.error(reason);

        if (reason.scriptStackTrace)
            logger.error(reason.scriptStackTrace);

        if (reason instanceof PowerShellError && reason.fromJson && 
            (reason.type === 'GoCurrent' || reason.type === 'User'))
        {
            window.showErrorMessage(reason.message);
            return true;
        }
        else if (reason instanceof PowerShellError && reason.fromJson)
        {
            window.showErrorMessage(reason.message);
            return false;
        }
        else if (reason instanceof AppError)
        {
            window.showErrorMessage(reason.message);
            return true;
        }

        return false;
    }

    public static getErrorMessage(reason: any): string
    {
        if (reason instanceof PowerShellError && reason.fromJson && 
            (reason.type === 'GoCurrent' || reason.type === 'User'))
        {
            return reason.message
        }
        else if (reason instanceof PowerShellError && reason.fromJson)
        {
            return reason.message
        }
        else if (reason instanceof AppError)
        {
            return reason.message
        }
        return "Error";
    }  
}