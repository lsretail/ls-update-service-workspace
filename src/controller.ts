"use strict"

import {window} from 'vscode';
import {PowerShellError} from './PowerShell'

import { AppError } from './errors/AppError';

export default class Controller
{
    public static handleError(reason: any)
    {
        console.log('Reason:');
        console.log(reason);
        if (reason instanceof PowerShellError && reason.fromJson && 
            (reason.type === 'GoCurrent' || reason.type === 'User'))
        {
            console.log(reason.scriptStackTrace);
            window.showErrorMessage(reason.message);
            return true;
        }
        else if (reason instanceof PowerShellError && reason.fromJson)
        {
            window.showErrorMessage(reason.message);
            console.log(reason.scriptStackTrace);
            return false;
        }
        else if (reason instanceof AppError)
        {
            window.showErrorMessage(reason.message);
            return true;
        }
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