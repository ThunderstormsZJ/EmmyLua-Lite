import vscode = require('vscode')
import { PvdHelper } from "../provider/PvdHelper"
import { LToken, LTT } from "../parser/LEntity"
import { ExtMgr } from "../context/ExtMgr"
import { Helper } from '../context/Helper'

export class PvdComment {

    public static checkComment(event: vscode.TextDocumentChangeEvent): boolean {
        if (event.document.languageId == ExtMgr.LANGUAGE_ID) {
            if (event.contentChanges.length == 1) {
                if (event.contentChanges[0].text == "-") {
                    var curentLine = event.contentChanges[0].range.start.line
                    let lineText = event.document.lineAt(curentLine).text;
                    if (lineText.trim() == "--") {

                    }
                    else if (lineText.trim() == "---") {
                        var tabStrs = lineText.split("---")
                        var tabStr = ""
                        if (tabStrs.length == 2) {
                            tabStr = tabStrs[0]
                        }

                        if (curentLine < event.document.lineCount - 1) {
                            var range: vscode.Range = new vscode.Range(
                                new vscode.Position(curentLine + 1, 0),
                                new vscode.Position(event.document.lineCount, 10000))
                            var text = event.document.getText(range)
                            if (text != null && text != "") {
                                var tokens: Array<LToken> = PvdHelper.getTokenByText(text)
                                //检查是不是local  function  或者 function
                                var insterText = this.getParams(tokens, tabStr)
                                if (insterText != "") {
                                    var editor = vscode.window.activeTextEditor;
                                    editor.edit(function (edit) {
                                        edit.insert(event.contentChanges[0].range.start, insterText)
                                    })
                                }
                            }
                        }
                    }
                }
            }
        }
        return false
    }

    private static getParams(tokens: Array<LToken>, tabStr: string) {
        if (tokens.length > 0) {
            var funIndex: number = 0
            if (tokens[0].type == LTT.Keyword && tokens[0].value == "function") {
                funIndex = 1
            } else {
                if (tokens.length > 1) {
                    if ((tokens[0].type == LTT.Keyword && tokens[0].value == "local") &&
                        (tokens[1].type == LTT.Keyword && tokens[1].value == "function")
                    ) {
                        funIndex = 2
                    }
                }
            }
            var isInster: boolean = false
            //检查是否是方法
            while (funIndex < tokens.length) {
                var tokenInfo: LToken = tokens[funIndex]
                if (tokenInfo.type == LTT.Identifier) {
                    funIndex++;
                    if (funIndex >= tokens.length) {
                        break;
                    }
                    var nextToken: LToken = tokens[funIndex]
                    if (nextToken.type == LTT.Punctuator && nextToken.value == "(") {
                        funIndex++;
                        isInster = true;
                        break;
                    } else if (nextToken.type == LTT.Punctuator && (nextToken.value == "." || nextToken.value == ":")) {
                        funIndex++;
                        continue;
                    } else {

                        break;
                    }
                } else {
                    isInster = false;
                    break;
                }
            }
            var params: Array<string> = new Array<string>();
            if (isInster) {
                isInster = false
                //检查参数
                while (funIndex < tokens.length) {
                    var tokenInfo: LToken = tokens[funIndex]
                    if (tokenInfo.type == LTT.Punctuator && tokenInfo.value == ")") {
                        isInster = true
                        break
                    } else if (tokenInfo.type == LTT.Identifier) {
                        params.push(tokenInfo.value)
                        funIndex++;
                        if (funIndex >= tokens.length) {
                            break;
                        }
                        var nextToken: LToken = tokens[funIndex]
                        if (nextToken.type == LTT.Punctuator && nextToken.value == ")") {
                            isInster = true
                            break;
                        } else if (nextToken.type == LTT.Punctuator && nextToken.value == ",") {
                            funIndex++;
                            continue;
                        } else {
                            break;
                        }
                    } else if (tokenInfo.type == LTT.VarargLiteral) {
                        funIndex++;
                        if (funIndex >= tokens.length) {
                            break;
                        }
                        var nextToken: LToken = tokens[funIndex]
                        if (nextToken.type == LTT.Punctuator && nextToken.value == ")") {
                            params.push("args")
                            isInster = true
                            break
                        } else {
                            break;
                        }

                    } else {
                        break;
                    }
                }
            }
            isInster = false
            if (isInster) {
                //--------------------------------------
                var insterText = "==============================--\r\n"
                insterText += tabStr + "--desc:\r\n"
                var date: Date = new Date();
                var dateStr: string = Helper.FormatDate(date, "yyyy-MM-dd hh:mm:ss")
                insterText += tabStr + "--time:" + dateStr + "\r\n"
                params.forEach(param => {
                    insterText += tabStr + "---@" + param + ":\r\n";
                })
                insterText += tabStr + "---@return \r\n"
                insterText += tabStr + "--==============================-"
                return insterText
            } else {
                return ""
            }
        }

    }
}