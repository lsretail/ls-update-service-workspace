
import {QuickPickItem} from 'vscode'

export interface QuickPickItemPayload<T1, T2=void, T3=void> extends QuickPickItem
{
    payload: T1;
    payload2?: T2;
    payload3?: T3;
}