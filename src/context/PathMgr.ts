import path = require('path')
import fs = require('fs')

export class PathMgr {
	//#region Extension Path
	public static DebuggerLibPath = "res/debugger/emmy/"
	public static DebuggerRuntimePath = "res/debugger/runtime/"
	public static LuaVersionMap = new Map([
		["5.1", "lua51"],
		["5.2", "lua52"],
		["5.3", "lua53"],
		["5.4", "lua54"],
		["latest", "lua-latest"]
	]);

	public static GetDebuggerLibFile(): string{
		if (PathMgr.IsWin32()){
			return path.join(PathMgr.DebuggerLibPath, "windows", process.arch, "?.dll");
		}else if (PathMgr.IsMac()){
			return path.join(PathMgr.DebuggerLibPath, "mac", "emmy_core.dylib");
		}else if (PathMgr.IsLinux()){
			return path.join(PathMgr.DebuggerLibPath, "linux", "emmy_core.so");
		}
	}

	public static GetLuaRuntimeExe(luaVersion:string):string{
		if (PathMgr.LuaVersionMap.has(luaVersion)){
			if (PathMgr.IsWin32()){
				return path.join(PathMgr.DebuggerRuntimePath, "windows", process.arch, PathMgr.LuaVersionMap.get(luaVersion),"lua.exe");
			}else if (PathMgr.IsMac()){
				return path.join(PathMgr.DebuggerRuntimePath, "mac", PathMgr.LuaVersionMap.get(luaVersion),"lua");
			}else if (PathMgr.IsLinux()){
				return path.join(PathMgr.DebuggerRuntimePath, "linux", PathMgr.LuaVersionMap.get(luaVersion),"lua");
			}
		}
		return "";
	}

	public static GetJaveExe(javaHome:string): string{
		try {
			if (process.platform == "win32") {
				if (javaHome != null) {
					return path.join(javaHome, "bin/java.exe")
				}
				if ("JAVA_HOME" in process.env) {
					javaHome = <string>process.env.JAVA_HOME
					let javaPath = path.join(javaHome, "bin/java.exe")
					return javaPath
				}
				if ("PATH" in process.env) {
					let PATH = <string>process.env.PATH
					let paths = PATH.split("")
					let pathCount = paths.length
					for (let i = 0; i < pathCount; i++) {
						let javaPath = path.join(paths[i], "bin/java.exe")
						if (fs.existsSync(javaPath)) {
							return javaPath
						}
					}
				}
			}
		} catch{
		}
		return null;
	}

	//#endregion

	//#region Process Info

	public static IsWin32() { return process.platform == "win32" }

	public static IsMac() { return process.platform == "darwin" }

	public static IsLinux() { return process.platform == "linux" }

	//#endregion
}