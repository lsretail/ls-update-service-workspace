
import * as thenfs from "then-fs";
import { basename, dirname } from "path";

import * as fs from 'fs';

export class fsHelpers
{
    public static readFile(path: string) : Thenable<string>
    {
        return thenfs.readFile(path);
    }

    public static readJson<T>(path: string) : Thenable<T>
    {
        return thenfs.readFile(path).then(data => 
        {
            return JSON.parse(data);
        });
    }

    public static writeFile(path, data, options = null)
    {
        return thenfs.writeFile(path, data);
    }

    public static writeJson(path, data, options = null) : Promise<void>
    {
        return new Promise((resolve, reject) =>
        {
            let dir = dirname(path);
            let write = () => {
                fs.writeFile(path, JSON.stringify(data, null, 4), options, error => {
                    if (error)
                        reject(error);
                    else
                        resolve();
                });
            }
            fs.exists(dir, exists => {
                if (exists)
                    write();
                else
                    fs.mkdir(dir, write);

            });
        });
    }

    public static existsSync(path: string): boolean
    {
        return thenfs.existsSync(path);
    }
}