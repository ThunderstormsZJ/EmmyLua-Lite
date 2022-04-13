import * as path from "path"
import * as fs from "fs"
import * as http from "http"
import * as zlib from "zlib"
import * as process from "process"
import vscode = require("vscode")
import { ExtensionContext } from "vscode"
import { UpperLower } from "../formater/UpperLower"
import { PvdTemplate } from "../provider/PvdTemplate"
import { PvdLuats } from "../provider/PvdLuats"
import { Helper } from "./Helper"
import { HighlightG } from "../formater/HighlightG"
import { PvdFormat } from "../provider/PvdFormat"

export class ExtMgr {
    public static LUA_MODE: vscode.DocumentFilter = { language: "lua", scheme: "file" }
    public static LANGUAGE_ID = "lua"
    public static extensionID = "ThunderstormsZJ.emmylua-lite"
    public static extensionName = "emmylua-lite"
    public static slogan = "Lite & Free"

    public static luaOperatorCheck: boolean
    public static luaFunArgCheck: boolean
    public static extensionPath: string
    public static maxFileSize: number = 2048
    public static changeTextCheck: boolean = true
    public static moduleFunNestingCheck: boolean
    public static requireFunNames: Array<string>
    public static scriptRoots: Array<string>
    public static isInited: boolean = false
    public static enableFormat: boolean = true
    public static templateDir: string
    public static templateDefine: Map<string, string>
    public static excludes: Array<string>
    public static apiFolders: Array<string>
    public static formatHex: boolean
    public static enableDiagnostic: boolean
    public static typescriptDefine: Map<string, string>
    public static core: string = "emmy"
    public static javahome: string
    public static enableHighlight: boolean = true
    public static normalHighlightColor: string = "#2B91AF"
    public static darkHighlightColor: string = "#00D6AA"
    public static lightParameter: string = "#D0A25E"
    public static lightGlobal: string = "#83A8ED"
    public static lightAnnotation: string = "#2B91AF"
    public static darkParameter: string = "#FFFFFF"
    public static darkGlobal: string = "#00D6AA"
    public static darkAnnotation: string = "#00D6AA"
    public static luaVersion: string = "5.4"

    public static isFreshDay: boolean = false
    public static isLegacy: boolean = false
    public static isFocused: boolean
    public static debugLanguageServer: boolean = false
    public static showWeather: boolean = false
    public static formatUseTab: boolean = false
    public static bar: vscode.StatusBarItem

    public static Commands = [
        { label: "emmylua-lite.toUpperCase", desc: "Shift chars to uppercase", func: UpperLower.toUpperCase },
        { label: "emmylua-lite.toLowerCase", desc: "Shift carrs to lowercase", func: UpperLower.toLowerCase },
        // { label: "emmylua-lite.formatFiles", desc: "Format file(s)", func: FileFormat.process },
        { label: "emmylua-lite.createTemplate", desc: "Create template", func: PvdTemplate.process },
        { label: "emmylua-lite.convertTsFile", desc: "Translate lua to typescript", func: PvdLuats.processFile },
        { label: "emmylua-lite.convertTsText", desc: "Convert lua to typescript", func: PvdLuats.processText },
        { label: "emmylua-lite.openRes", desc: "Open res folder", func: ExtMgr.openRes },
        { label: "emmylua-lite.about", desc: "About emmylua-lite", func: ExtMgr.showAbout },
    ]

    public static showAbout(e) {
        let ids = new Array<String>()
        ids.push(ExtMgr.extensionID.toLowerCase())
        vscode.commands.executeCommand("workbench.extensions.action.showExtensionsWithIds", ids)
        vscode.window.showInformationMessage(ExtMgr.slogan)
    }

    public static openRes(e) {
        let resDir = path.join(ExtMgr.extensionPath, "res")
        Helper.ShowInExplorer(resDir)
    }

    public static initialize(context: ExtensionContext): boolean {
        if (vscode.workspace == null || vscode.workspace.rootPath == null) {
            vscode.window.showInformationMessage(ExtMgr.extensionName + " does't support single lua file, please use 'Open Folder' instead.")
            return false
        } else {
            ExtMgr.isFocused = true

            try {
                ExtMgr.extensionPath = vscode.extensions.getExtension(ExtMgr.extensionID).extensionPath
                ExtMgr.parseConfig()
            } catch (err) {
                vscode.window.showErrorMessage(ExtMgr.extensionName + " init error: " + err)
                console.log(err)
                return false
            }

            let yesterdayFile = path.join(ExtMgr.extensionPath, "res/yesterday")
            let todayStr = Helper.FormatDate(new Date(), "yyyy-MM-dd")
            if (fs.existsSync(yesterdayFile)) {
                let yesterdayStr = fs.readFileSync(yesterdayFile)
                if (yesterdayStr != todayStr) {
                    ExtMgr.isFreshDay = true
                    fs.writeFileSync(yesterdayFile, todayStr)
                }
                else {
                    ExtMgr.isFreshDay = false
                }
            } else {
                ExtMgr.isFreshDay = true
                fs.writeFileSync(yesterdayFile, todayStr)
            }

            if (ExtMgr.enableFormat) {
                context.subscriptions.push(vscode.languages.registerDocumentFormattingEditProvider(ExtMgr.LUA_MODE,
                    new PvdFormat()))
                context.subscriptions.push(vscode.languages.registerDocumentRangeFormattingEditProvider(ExtMgr.LUA_MODE,
                    new PvdFormat()))
            }

            vscode.workspace.onDidChangeConfiguration((listener) => {
                ExtMgr.parseConfig()
            })

            for (let i = 0; i < ExtMgr.Commands.length; i++) {
                let define = ExtMgr.Commands[i]
                vscode.commands.registerCommand(define.label, define.func)
            }
            ExtMgr.bar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left)
            context.subscriptions.push(this.bar)
            ExtMgr.bar.tooltip = ExtMgr.slogan
            ExtMgr.bar.command = "emmylua-lite.about"
            ExtMgr.bar.text = ExtMgr.extensionName
            ExtMgr.bar.show()

            ExtMgr.requireFunNames = new Array<string>()
            ExtMgr.requireFunNames.push("require")
            ExtMgr.requireFunNames.push("import")

            ExtMgr.isInited = true

            return true
        }
    }

    public static parseConfig() {
        let config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("emmylua-lite")
        //#region For Legacy

        ExtMgr.luaOperatorCheck = config.get<boolean>("luaOperatorCheck") //  是否解析符号重载
        ExtMgr.luaFunArgCheck = config.get<boolean>("luaFunArgCheck") // 是否解析函数的参数
        ExtMgr.enableFormat = config.get<boolean>("enableFormat") // 是否使用格式化
        ExtMgr.moduleFunNestingCheck = config.get<boolean>("moduleFunNestingCheck") // 模块方法嵌套检查, 如果在一个方法中出现另外一个模块方法会认为是错误的

        //#endregion

        ExtMgr.changeTextCheck = config.get<boolean>("changeTextCheck")
        ExtMgr.enableHighlight = config.get<boolean>("enableHighlight")
        ExtMgr.normalHighlightColor = config.get<string>("theme.light.highlight")
        ExtMgr.darkHighlightColor = config.get<string>("theme.dark.highlight")
        ExtMgr.core = config.get<string>("core")
        ExtMgr.javahome = config.get<string>("javahome")
        ExtMgr.lightParameter = config.get<string>("theme.light.parameter")
        ExtMgr.lightGlobal = config.get<string>("theme.light.global")
        ExtMgr.lightAnnotation = config.get<string>("theme.light.annotation")
        ExtMgr.darkParameter = config.get<string>("theme.dark.parameter")
        ExtMgr.darkGlobal = config.get<string>("theme.dark.global")
        ExtMgr.darkAnnotation = config.get<string>("theme.dark.annotation")
        ExtMgr.luaVersion = config.get<string>("runtime.luaversion")
        ExtMgr.showWeather = config.get<boolean>("showWeather")
        ExtMgr.formatUseTab = config.get<boolean>("formatUseTab")
        // single script root.
        let scriptRoot = vscode.workspace.rootPath.replace(/\\/g, "/")
        scriptRoot = scriptRoot.replace(new RegExp("/", "gm"), ".")
        scriptRoot = scriptRoot.toLowerCase()
        ExtMgr.scriptRoots = new Array<string>()
        ExtMgr.scriptRoots.push(scriptRoot)

        //debugger server
        ExtMgr.debugLanguageServer = process.env["EMMY_DEV"] == "true"

        if (ExtMgr.luaOperatorCheck == null) {
            ExtMgr.luaOperatorCheck = true
        }
        if (ExtMgr.luaFunArgCheck == null) {
            ExtMgr.luaFunArgCheck = true
        }
        if (ExtMgr.changeTextCheck == null) {
            ExtMgr.changeTextCheck = true
        }
        if (ExtMgr.enableHighlight == null) {
            ExtMgr.enableHighlight = true
        }
        if (ExtMgr.showWeather == null) {
            ExtMgr.showWeather = false
        }
        if (ExtMgr.formatUseTab == null) { // 是否使用tab来缩进代码
            ExtMgr.formatUseTab = false
        }

        ExtMgr.templateDir = config.get<string>("templateDir")
        if (ExtMgr.templateDir == null || ExtMgr.templateDir == "") {
            ExtMgr.templateDir = ExtMgr.extensionPath + "/res/template"
        }
        ExtMgr.templateDefine = new Map<string, string>()
        let templateDefine: Array<any> = config.get<Array<any>>("templateDefine")
        if (templateDefine) {
            templateDefine.forEach((v) => {
                if ((v.name || v.key) && v.value) {
                    if (v.name) {
                        ExtMgr.templateDefine.set(v.name, v.value)
                    } else {
                        ExtMgr.templateDefine.set(v.key, v.value)
                    }
                }
            })
        }

        ExtMgr.excludes = new Array<string>()
        let excludes: Array<string> = config.get<Array<string>>("exclude")
        if (excludes) {
            excludes.forEach((v) => {
                ExtMgr.excludes.push(path.normalize(path.join(vscode.workspace.rootPath, v)).replace(/\\/g, "/").replace(/\/\//g, "/").toLowerCase())
            })
        }
        ExtMgr.apiFolders = new Array<string>()
        let apiFolders: Array<string> = config.get<Array<string>>("apiFolders")
        if (apiFolders) {
            apiFolders.forEach((v) => {
                let p = v.toLowerCase()
                if (!fs.existsSync(p)) {
                    p = path.resolve(path.join(vscode.workspace.rootPath, p))
                }
                if (fs.existsSync(p)) {
                    ExtMgr.apiFolders.push(p)
                }
            })
        }

        ExtMgr.formatHex = config.get<boolean>("formatHex") // 是否格式化十六进制的数字
        if (ExtMgr.formatHex == null) {
            ExtMgr.formatHex = true
        }

        ExtMgr.enableDiagnostic = config.get<boolean>("enableDiagnostic") // 是否启用代码分析, 如果禁用将不会有错误提示
        if (ExtMgr.enableDiagnostic == null) {
            ExtMgr.enableDiagnostic = true
        }

        ExtMgr.typescriptDefine = new Map<string, string>()
        let typescriptDefine: Array<any> = config.get<Array<any>>("typescriptDefine")
        if (typescriptDefine) {
            typescriptDefine.forEach((v) => {
                if ((v.name || v.key) && v.value) {
                    if (v.name) {
                        ExtMgr.typescriptDefine.set(v.name, v.value)
                    } else {
                        ExtMgr.typescriptDefine.set(v.key, v.value)
                    }
                }
            })
        }

        HighlightG.reset()
    }

    public static isFileExclude(file: string): boolean {
        if (ExtMgr.excludes && ExtMgr.excludes.length > 0) {
            let f = path.normalize(file).replace(/\\/g, "/").replace(/\/\//g, "/").toLowerCase()
            for (let i = 0; i < ExtMgr.excludes.length; i++) {
                let exclude = ExtMgr.excludes[i]
                if (f.indexOf(exclude) > -1) {
                    return true
                }
            }
            return false
        } else {
            return false
        }
    }

    public static onReady() {
        ExtMgr.bar.text = ExtMgr.extensionName + " ✔"
        if (ExtMgr.isFreshDay && ExtMgr.showWeather) {
            this.doShowWeather()
        }
    }

    private static doShowWeather() {
        http.get("http://ip.taobao.com/service/getIpInfo.php?ip=myip", function (res) {
            let ret = ""
            res.on("data", function (data) {
                ret += data
            })
            res.on("end", function () {
                let result = JSON.parse(ret)
                let city = result.data.city
                if (city != null) {
                    http.get("http://wthrcdn.etouch.cn/weather_mini?city=" + city, function (res) {
                        let ret = new Array()
                        res.on("data", function (data) {
                            ret.push(data)
                        })
                        res.on("end", function () {
                            let buf = Buffer.concat(ret)
                            zlib.gunzip(buf, function (err, decoded) {
                                let result = JSON.parse(decoded.toString())
                                if (result != null &&
                                    result.data != null &&
                                    result.data.forecast != null &&
                                    result.data.forecast.length > 1) {
                                    let today = result.data.forecast[0]
                                    let todayStr = Helper.Format("【{0}】【{1},{2},{3},{4}】", city, today.date, today.type, today.high, today.low)
                                    todayStr = todayStr.replace(/ /g, "")
                                    vscode.window.showInformationMessage(todayStr)
                                }
                            })
                        })
                    })
                }
            })
        })
    }
}