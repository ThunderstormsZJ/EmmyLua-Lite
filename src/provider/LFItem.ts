import vscode = require('vscode')
import { LCItem } from "../provider/LCItem"
import { ExtMgr } from "../context/ExtMgr"
var ospath = require("path")

export class LFItem {
    private static _ins: LFItem;
    public fileExtnames: Array<string>;
    public completions: Array<LCItem>;
    public modulePaths: Map<string, Array<string>>;

    public static instance() {
        if (LFItem._ins == null) {
            LFItem._ins = new LFItem()
        }
        return LFItem._ins;
    }

    public constructor() {
        this.fileExtnames = new Array<string>();
        this.fileExtnames.push(".lua")
        this.completions = new Array<LCItem>()
        this.modulePaths = new Map<string, Array<string>>()
    }

    public getUriCompletionByModuleName(moduleName: string) {
        for (var index = 0; index < this.completions.length; index++) {
            var element = this.completions[index];
            if (moduleName == element.label) {
                return element.uri
            }
        }
    }

    /**
     * 获取路径集合根据moduleName
     */
    public getUrisByModuleName(moduleName: string): Array<string> {
        var lowermoduleName = moduleName.toLowerCase()
        if (this.modulePaths.has(lowermoduleName)) {
            return this.modulePaths.get(lowermoduleName)
        }
        return null
    }

    public addCompletion(path: vscode.Uri, isCheck: boolean) {
        if (isCheck) {
            for (var index = 0; index < this.completions.length; index++) {
                var element = this.completions[index];
                if (element.uri.path == path.path) {
                    return
                }
            }
        }
        var position: vscode.Position = new vscode.Position(1, 1)
        var str: string = path.fsPath
        for (var index = 0; index < this.fileExtnames.length; index++) {
            var extname = this.fileExtnames[index];
            var extname1 = ospath.extname(str)
            if (extname == extname1) {
                str = str.substring(0, str.length - extname1.length)
                break;
            }
        }

        str = str.replace(/\\/g, "/");
        str = str.replace(new RegExp("/", "gm"), ".")
        var str_1 = str.toLowerCase()

        ExtMgr.scriptRoots.forEach(scriptPath => {
            var scriptPath_1 = scriptPath;

            var index = str_1.indexOf(scriptPath_1)
            if (index > -1) {
                var length = scriptPath_1.length;
                str = str.substring(index + length)
                if (str.charAt(0) == ".") {
                    str = str.substring(1)
                }
                var names: Array<string> = str.split(".")
                var moduleName: string = names[names.length - 1]
                var moduleNameLower = moduleName.toLowerCase()
                if (!this.modulePaths.has(moduleNameLower)) {
                    this.modulePaths.set(moduleNameLower, new Array<string>());
                }
                var paths: Array<string> = this.modulePaths.get(moduleNameLower)
                if (paths.indexOf(path.path) == -1) {
                    paths.push(path.path)
                    var completion: LCItem = new LCItem(
                        str, vscode.CompletionItemKind.Class, path, position, false, null)
                    this.completions.push(completion)
                }
            }
        })
    }
}
