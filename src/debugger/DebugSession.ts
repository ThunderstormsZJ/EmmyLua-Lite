import { LoggingDebugSession, Event, OutputEvent } from "vscode-debugadapter";
import { DebugProtocol } from "vscode-debugprotocol";
import * as path from 'path';
import { LogLevel, LogOutputEvent } from "vscode-debugadapter/lib/logger";

export abstract class DebugSession extends LoggingDebugSession {
    constructor() {
        super("emmy.debug.txt");
    }

    protected ext: string[] = ['.lua'];
    protected debugEmmyResPath: string = "res/debugger/emmy/";
    private _findFileSeq = 0;
    private _fileCache = new Map<string, string>();

	log(msg: string) {
		this.sendEvent(new LogOutputEvent(msg + "\n", LogLevel.Log));
    }
    
    logError(msg: string){
        this.sendEvent(new LogOutputEvent(msg + "\n", LogLevel.Error));
    }
    
    printConsole(msg: string, newLine: boolean = true) {
        if (newLine) {
            msg += "\n";
        }
        this.sendEvent(new OutputEvent(msg));
    }

    protected customRequest(command: string, response: DebugProtocol.Response, args: any): void {
        if (command === 'findFileRsp') {
            this.emit('findFileRsp', args);
        }
        else {
            this.emit(command);
        }
    }

    async findFile(file: string): Promise<string> {
        if (path.isAbsolute(file)) {
            return file;
		}
        const r = this._fileCache.get(file);
        if (r) {
            return r;
        }

        const seq = this._findFileSeq++;
        this.sendEvent(new Event('findFileReq', { file: file, ext: this.ext, seq: seq }));
        return new Promise<string>((resolve, c) => {
            const listener = (body: any) => {
                if (seq === body.seq) {
                    this.removeListener('findFileRsp', listener);
                    const files: string[] = body.files;
                    if (files.length > 0) {
                        this._fileCache.set(file, files[0]);
                        resolve(files[0]);
                    } else {
                        resolve(file);
                    }
                }
            };
            this.addListener('findFileRsp', listener);
        });
    }
}