import * as vscode from "vscode"
import * as net from "net"
import { LanguageClient, LanguageClientOptions, ServerOptions, StreamInfo } from "vscode-languageclient/node"
import { EmmyDebuggerProvider } from "../debugger/EmmyDebuggerProvider"
import { EmmyAttachDebuggerProvider } from "../debugger/EmmyAttachDebuggerProvider"
import { EmmyLaunchDebuggerProvider } from '../debugger/EmmyLaunchDebuggerProvider'
import { ExtMgr } from "./ExtMgr"
import { LanguageConfiguration } from "vscode"
import * as path from "path"
import * as fs from "fs"
import { PathMgr } from "./PathMgr"

export interface AnnotatorParams {
    uri: string
}

export enum AnnotatorType {
    Param,
    Global,
    DocType,
    Upvalue,
    NotUse,
    ParamHint,
    LocalHint
}

export interface RenderRange{
    range: vscode.Range;
    hint: string;
}

export interface IAnnotator {
    uri: string;
    ranges: RenderRange[];
    type: AnnotatorType;
}

export interface IProgressReport {
    text: string
    percent: number
}

export class LuaLanguageConfiguration implements LanguageConfiguration {
    public onEnterRules = [
        {
            action: { indentAction: vscode.IndentAction.None, appendText: "---@" },
            beforeText: /^---@/,
        },
        {
            action: { indentAction: vscode.IndentAction.None, appendText: "---" },
            beforeText: /^---/,
        }
    ]

    public wordPattern = /((?<=')[^']+(?='))|((?<=")[^"]+(?="))|(-?\d*\.\d\w*)|([^\`\~\!\@\$\^\&\*\(\)\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\s]+)/g;
}

export class EmmyMgr {
    private static savedContext: vscode.ExtensionContext
    private static client: LanguageClient
    private static activeEditor: vscode.TextEditor
    private static javaExecutablePath: string | null
    private static timeoutToReqAnn: NodeJS.Timer
    private static decorateParamter: vscode.TextEditorDecorationType
    private static decorateGlobal: vscode.TextEditorDecorationType
    private static decorateAnnotation: vscode.TextEditorDecorationType
    private static decorateUpvalue: vscode.TextEditorDecorationType
    private static decorateNotUse: vscode.TextEditorDecorationType
    private static decorateParamHint: vscode.TextEditorDecorationType
    private static decorateLocalHint: vscode.TextEditorDecorationType

    public static activate(context: vscode.ExtensionContext) {
        try {
            let snippetsPath = path.join(ExtMgr.extensionPath, "res/snippets.json")
            let snippetsEmmyPath = path.join(ExtMgr.extensionPath, "res/snippets-emmy.json")
            let fo = fs.readFileSync(snippetsPath).toString()
            let fn = fs.readFileSync(snippetsEmmyPath).toString()
            if (fo != fn) {
                vscode.window.showInformationMessage("Snippets.json has been changed, please reload window to take effect.")
                fs.writeFileSync(snippetsPath, fn)
            }
        } catch (err) { }

        EmmyMgr.savedContext = context;
        EmmyMgr.javaExecutablePath = PathMgr.GetJaveExe(ExtMgr.javahome);
        EmmyMgr.savedContext.subscriptions.push(vscode.workspace.onDidChangeConfiguration(EmmyMgr.onDidChangeConfiguration, null, EmmyMgr.savedContext.subscriptions));
        EmmyMgr.savedContext.subscriptions.push(vscode.workspace.onDidChangeTextDocument(EmmyMgr.onDidChangeTextDocument, null, EmmyMgr.savedContext.subscriptions));
        EmmyMgr.savedContext.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(EmmyMgr.onDidChangeActiveTextEditor, null, EmmyMgr.savedContext.subscriptions));
        EmmyMgr.savedContext.subscriptions.push(vscode.languages.setLanguageConfiguration(ExtMgr.LANGUAGE_ID, new LuaLanguageConfiguration()));

        EmmyMgr.savedContext.subscriptions.push(vscode.languages.registerInlineValuesProvider('lua', {
            // 不知道是否应该发到ls上再做处理
            // 先简单处理一下吧
            provideInlineValues(document: vscode.TextDocument, viewport: vscode.Range, context: vscode.InlineValueContext): vscode.ProviderResult<vscode.InlineValue[]> {
    
                const allValues: vscode.InlineValue[] = [];
                const regExps = [
                    /(?<=local\s+)[^\s,\<]+/,
                    /(?<=---@param\s+)\S+/
                ]
    
                for (let l = viewport.start.line; l <= context.stoppedLocation.end.line; l++) {
                    const line = document.lineAt(l);
    
                    for (const regExp of regExps) {
                        const match = regExp.exec(line.text);
                        if (match) {
                            const varName = match[0];
                            const varRange = new vscode.Range(l, match.index, l, match.index + varName.length);
                            // value found via variable lookup
                            allValues.push(new vscode.InlineValueVariableLookup(varRange, varName, false));
                            break;
                        }
                    }
    
                }
    
                return allValues;
            }
        }));

        EmmyMgr.registerCommands(); 
        EmmyMgr.registerDebuggers();

        EmmyMgr.startServer();
    }

    // 注册命令
    private static registerCommands(){
        let savedContext = EmmyMgr.savedContext;
        savedContext.subscriptions.push(vscode.commands.registerCommand("emmylua-lite.restartServer", EmmyMgr.restartServer));
        savedContext.subscriptions.push(vscode.commands.registerCommand("emmylua-lite.showReferences", EmmyMgr.showReferences));
        savedContext.subscriptions.push(vscode.commands.registerCommand("emmylua-lite.insertEmmyDebugCode", EmmyMgr.insertEmmyDebugCode));

        // debug command
        savedContext.subscriptions.push(vscode.commands.registerCommand("emmylua-lite.debugEditorContents", EmmyMgr.debugEditorContents));
    }

    // 注册Debugger
    private static registerDebuggers() {
        var savedContext = EmmyMgr.savedContext
        const emmyProvider = new EmmyDebuggerProvider('emmylua_new', savedContext);
        savedContext.subscriptions.push(vscode.debug.registerDebugConfigurationProvider("emmylua_new", emmyProvider));
        savedContext.subscriptions.push(emmyProvider);
        const emmyAttachProvider = new EmmyAttachDebuggerProvider('emmylua_attach', savedContext);
        savedContext.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('emmylua_attach', emmyAttachProvider));
        savedContext.subscriptions.push(emmyAttachProvider);
        const emmyLaunchProvider = new EmmyLaunchDebuggerProvider('emmylua_launch', savedContext);
        savedContext.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('emmylua_launch', emmyLaunchProvider));
        savedContext.subscriptions.push(emmyLaunchProvider);
    }

    public static deactivate() {
        EmmyMgr.stopServer()
    }

    private static onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent) {
        if (EmmyMgr.activeEditor && EmmyMgr.activeEditor.document === event.document && EmmyMgr.activeEditor.document.languageId == ExtMgr.LANGUAGE_ID) {
            EmmyMgr.requestAnnotators(EmmyMgr.activeEditor, EmmyMgr.client)
        }
        // try {
        //     // 优化注解后得提示
        //     if (event.contentChanges.length == 1) {
        //         let change = event.contentChanges[0]
        //         if (change.text == " ") {
        //             let start = change.rangeOffset - 40
        //             start = start < 0 ? 0 : start
        //             let end = change.rangeOffset - 1
        //             let range = new vscode.Range(event.document.positionAt(start), event.document.positionAt(end))
        //             let compare = event.document.getText(range)
        //             if (compare.indexOf("---@") >= 0) {
        //                 vscode.commands.executeCommand("editor.action.triggerSuggest")
        //             }
        //         }
        //     }
        // } catch (err) { }
    }

    private static onDidChangeActiveTextEditor(editor: vscode.TextEditor | undefined) {
        if (editor && editor.document.languageId == ExtMgr.LANGUAGE_ID) {
            EmmyMgr.activeEditor = editor as vscode.TextEditor
            EmmyMgr.requestAnnotators(EmmyMgr.activeEditor, EmmyMgr.client)
        }
    }

    private static onDidChangeConfiguration(event: vscode.ConfigurationChangeEvent) {
        let shouldRestart = false
        let newJavaExecutablePath = PathMgr.GetJaveExe(ExtMgr.javahome);
        if (newJavaExecutablePath !== EmmyMgr.javaExecutablePath) {
            EmmyMgr.javaExecutablePath = newJavaExecutablePath
            shouldRestart = true
        }
        EmmyMgr.updateDecorations()
        if (shouldRestart) {
            EmmyMgr.restartServer()
        }
    }

    private static async startServer(){
        EmmyMgr.doStartServer().then(()=>{
            EmmyMgr.onDidChangeActiveTextEditor(vscode.window.activeTextEditor);
        }).catch(reson=>{
            vscode.window.showErrorMessage(`Failed to start "EmmyLua" language server!\n${reson}`, "Try again")
            .then(EmmyMgr.startServer);
        });
    }

    private static async doStartServer() {
        let folders = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders.map(f => f.uri.toString()) : []
        if (ExtMgr.apiFolders && ExtMgr.apiFolders.length > 0) {
            for (let i = 0; i < ExtMgr.apiFolders.length; i++) {
                let folder = ExtMgr.apiFolders[i]
                folder = vscode.Uri.file(folder).toString()
                folders.push(folder)
            }
        }

        const clientOptions: LanguageClientOptions = {
            documentSelector: [{ scheme: "file", language: ExtMgr.LANGUAGE_ID }],
            synchronize: {
                configurationSection: [ExtMgr.extensionName, "files.associations"],
                fileEvents: vscode.workspace.createFileSystemWatcher("**/*.lua")
            },
            initializationOptions: {
                stdFolder: vscode.Uri.file(path.resolve(EmmyMgr.savedContext.extensionPath, "res/emmy/std")).toString(),
                apiFolders: [],
                workspaceFolders: folders,
                client: "vsc",
                exclude: ExtMgr.excludes
            }
        }

        let serverOptions: ServerOptions
        const cp = path.resolve(EmmyMgr.savedContext.extensionPath, "res/emmy/", "*")
        const exePath = EmmyMgr.javaExecutablePath || "java"
        console.log('exe path : ' + exePath);
        if (ExtMgr.debugLanguageServer) {
            const connectionInfo = {
                port: 5007
            };
            serverOptions = () => {
                // Connect to language server via socket
                let socket = net.connect(connectionInfo);
                let result: StreamInfo = {
                    writer: socket,
                    reader: socket as NodeJS.ReadableStream
                };
                socket.on("close", () => {
                    console.log("client connect error!");
                    EmmyMgr.client.stop()
                    EmmyMgr.client = null
                });
                return Promise.resolve(result);
            };
            // clientOptions.initializationOptions.client = "debug"
        } else {
            serverOptions = {
                command: exePath,
                args: ["-cp", cp, "com.tang.vscode.MainKt", "-XX:+UseG1GC", "-XX:+UseStringDeduplication"]
            }
        }
        EmmyMgr.client = new LanguageClient(ExtMgr.LANGUAGE_ID, ExtMgr.extensionName, serverOptions, clientOptions)
        EmmyMgr.savedContext.subscriptions.push(EmmyMgr.client.start());
        await EmmyMgr.client.onReady();
        console.log("client ready");
        EmmyMgr.client.onNotification("emmy/progressReport", (d: IProgressReport) => {
            ExtMgr.bar.text = d.text
            if (d.percent >= 1) {
                setTimeout(() => {
                    ExtMgr.onReady()
                }, 3000);
            }
        })
    }

    private static updateDecorations() {
        // 各种方式更新时之前的decoration没有dispose导致重复渲染
        if (EmmyMgr.decorateParamter){
            EmmyMgr.decorateParamter.dispose()
            EmmyMgr.decorateGlobal.dispose()
            EmmyMgr.decorateAnnotation.dispose()
            EmmyMgr.decorateNotUse.dispose()
            EmmyMgr.decorateUpvalue.dispose()
            EmmyMgr.decorateParamHint.dispose()
            EmmyMgr.decorateLocalHint.dispose()
        }

        let config: vscode.DecorationRenderOptions = {}
        config.light = { color: ExtMgr.lightParameter }
        config.dark = { color: ExtMgr.darkParameter }
        EmmyMgr.decorateParamter = vscode.window.createTextEditorDecorationType(config)

        config = {}
        config.light = { color: ExtMgr.lightGlobal }
        config.dark = { color: ExtMgr.darkGlobal }
        EmmyMgr.decorateGlobal = vscode.window.createTextEditorDecorationType(config)

        config = {}
        config.light = { color: ExtMgr.lightAnnotation }
        config.dark = { color: ExtMgr.darkAnnotation }
        EmmyMgr.decorateAnnotation = vscode.window.createTextEditorDecorationType(config)
        
        config = {}
        config.light = { color: ExtMgr.lightParameter, opacity: "0.5" }
        config.dark = { color: ExtMgr.darkParameter, opacity: "0.5" }
        EmmyMgr.decorateNotUse = vscode.window.createTextEditorDecorationType(config)

        config = {}
        config.textDecoration = "underline"
        EmmyMgr.decorateUpvalue = vscode.window.createTextEditorDecorationType(config)

        EmmyMgr.decorateParamHint = vscode.window.createTextEditorDecorationType({});
        EmmyMgr.decorateLocalHint = vscode.window.createTextEditorDecorationType({});
    }

    private static requestAnnotators(editor: vscode.TextEditor, client: LanguageClient) {
        if (!ExtMgr.isFileExclude(editor.document.uri.fsPath)) {
            clearTimeout(EmmyMgr.timeoutToReqAnn)
            EmmyMgr.timeoutToReqAnn = setTimeout(() => {
                EmmyMgr.requestAnnotatorsImpl(editor, client)
            }, 150)
        }
    }

    private static requestAnnotatorsImpl(editor: vscode.TextEditor, client: LanguageClient) {
        if (!EmmyMgr.decorateParamter) {
            EmmyMgr.updateDecorations()
        }
        let params: AnnotatorParams = { uri: editor.document.uri.toString() }
        client.sendRequest<IAnnotator[]>("emmy/annotator", params).then(list => {
            let map: Map<AnnotatorType, RenderRange[]> = new Map()
            map.set(AnnotatorType.DocType, [])
            map.set(AnnotatorType.Param, [])
            map.set(AnnotatorType.Global, [])
            map.set(AnnotatorType.Upvalue, [])
            map.set(AnnotatorType.NotUse, [])
            map.set(AnnotatorType.ParamHint, []);
            map.set(AnnotatorType.LocalHint, []);
            list.forEach(data => {
                let uri = vscode.Uri.parse(data.uri)
                let uriSet = new Set<string>()

                // 而vscode 在diff，分屏以及其他一些情况下可以获得多个相同的uri
                vscode.window.visibleTextEditors.forEach((editor) => {
                    let docUri = editor.document.uri
                    if (uriSet.has(docUri.path)){
                        return;
                    }
                    uriSet.add(docUri.path)
                    
                    if (uri.path.toLowerCase() === docUri.path.toLowerCase()) {
                        let list = map.get(data.type)
                        if (list === undefined) {
                            list = data.ranges
                        } else {
                            list = list.concat(data.ranges)
                        }
                        map.set(data.type, list)
                    }
                })
            })
            map.forEach((v, k) => {
                EmmyMgr.updateAnnotators(editor, k, v)
            })
        })
    }

    private static updateAnnotators(editor: vscode.TextEditor, type: AnnotatorType, renderRanges: RenderRange[]) {
        let ranges = renderRanges.map(e=>e.range)
        switch (type) {
            case AnnotatorType.Param:
                editor.setDecorations(EmmyMgr.decorateParamter, ranges)
                break
            case AnnotatorType.Global:
                editor.setDecorations(EmmyMgr.decorateGlobal, ranges)
                break
            case AnnotatorType.DocType:
                editor.setDecorations(EmmyMgr.decorateAnnotation, ranges)
                break
            case AnnotatorType.Upvalue:
                editor.setDecorations(EmmyMgr.decorateUpvalue, ranges)
                break
            case AnnotatorType.NotUse:
                editor.setDecorations(EmmyMgr.decorateNotUse, ranges)
                break
            case AnnotatorType.ParamHint: {
                let vscodeRenderRanges: vscode.DecorationOptions[] = []
                renderRanges.forEach(renderRange => {
                    if (renderRange.hint && renderRange.hint !== "") {
                        vscodeRenderRanges.push({
                            range: renderRange.range,
                            renderOptions: {
                                light: {
                                    before: {
                                        contentText: ` ${renderRange.hint}: `,
                                        color: "#888888",
                                        backgroundColor: '#EEEEEE;border-radius: 2px;',
                                        fontWeight: '400; font-size: 12px; line-height: 1;',
                                        margin: "1px",
                                    }
                                },
                                dark: {
                                    before: {
                                        contentText: ` ${renderRange.hint}: `,
                                        color: "#888888",
                                        backgroundColor: '#333333;border-radius: 2px;',
                                        fontWeight: '400; font-size: 12px; line-height: 1;',
                                        margin: "1px",  
                                        
                                    }
                                }
                            }
                        });
    
                    }
                });
    
                editor.setDecorations(EmmyMgr.decorateParamHint, vscodeRenderRanges);
                break;
            }
            case AnnotatorType.LocalHint: {
                let vscodeRenderRanges: vscode.DecorationOptions[] = []
                renderRanges.forEach(renderRange => {
                    if (renderRange.hint && renderRange.hint !== "") {
                        vscodeRenderRanges.push({
                            range: renderRange.range,
                            renderOptions: {
                                light: {
                                    after: {
                                        contentText: `:${renderRange.hint}`,
                                        color: "#888888",
                                        backgroundColor: '#EEEEEE;border-radius: 2px;',
                                        fontWeight: '400; font-size: 12px; line-height: 1;',
                                        margin: "3px",
                                    }
                                },
                                dark: {
                                    after: {
                                        contentText: `:${renderRange.hint}`,
                                        color: "#888888",
                                        backgroundColor: '#333333;border-radius: 2px;',
                                        fontWeight: '400; font-size: 12px; line-height: 1;',
                                        margin: "3px",
                                    }
                                }
                            }
                        });
    
                    }
                });
    
                editor.setDecorations(EmmyMgr.decorateLocalHint, vscodeRenderRanges);
                break;
            }
        }
    }

    //#region Command

    private static restartServer() {
        if (!EmmyMgr.client) {
            EmmyMgr.startServer()
        } else {
            EmmyMgr.client.stop().then(EmmyMgr.startServer);
        }
    }

    private static showReferences(uri: string, pos: vscode.Position) {
        const u = vscode.Uri.parse(uri)
        const p = new vscode.Position(pos.line, pos.character)
        vscode.commands.executeCommand("vscode.executeReferenceProvider", u, p).then(locations => {
            vscode.commands.executeCommand("editor.action.showReferences", u, p, locations)
        })
    }

    private static async insertEmmyDebugCode(){
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            return;
        }
        const document = activeEditor.document;
        if (document.languageId !== 'lua') {
            return;
        }
    
        const dllPath = PathMgr.GetDebuggerLibFile();
        const host = 'localhost';
        const port = 9966;
        const ins = new vscode.SnippetString();
        ins.appendText(`package.cpath = package.cpath .. ";${dllPath.replace(/\\/g, '/')}"\n`);
        ins.appendText(`local dbg = require("emmy_core")\n`);
        ins.appendText(`dbg.tcpListen("${host}", ${port})`);
        activeEditor.insertSnippet(ins);
    }

    private static stopServer() {
        if (EmmyMgr.client) {
            EmmyMgr.client.stop()
        }
    }

    private static debugEditorContents(uri: vscode.Uri){
        let spaceFloader = vscode.workspace.getWorkspaceFolder(uri);
        let rootPath = spaceFloader.uri.fsPath;
        let fileName = uri.fsPath.replace(rootPath, "").slice(1);

        vscode.debug.startDebugging(spaceFloader, {
            type: 'emmylua_launch',
            name: 'Debugger Editor Contents',
            request: 'launch',
            arguments: [fileName],
            workingDir: rootPath
        });
    }

    //#endregion
}