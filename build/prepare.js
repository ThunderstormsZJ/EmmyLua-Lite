const fs = require('fs');
const download = require('download');
const decompress = require('decompress')
const fc = require('filecopy');
const fse = require('fs-extra');
const config = require('./config').default;

const DependList = [
    [config.emmyDebuggerUrl, config.emmyDebuggerVersion, ["emmy_debugger.zip"]],
    [config.lanServerUrl, config.lanServerVersion, ["EmmyLua-LS-all.jar"]],
    [config.luaRuntimeUrl, config.luaRuntimeVesion, ["runtime.zip"]]
];

const CopyMap = new Map([
    ["emmy_core.dylib/emmy_core.dylib", "res/debugger/emmy/mac/emmy_core.dylib"],
    ["emmy_core.so/emmy_core.so", "res/debugger/emmy/linux/emmy_core.so"],
    ["x64/", "res/debugger/emmy/windows/x64/"],
    ["x86/", "res/debugger/emmy/windows/x86/"],
    ["runtime/win32-x64/", "res/debugger/runtime/windows/x64/"] // 目前只使用64位Lua运行库
]);

//#region Download

async function downloadTo(url, path) {
    return new Promise((r, e) => {
        const d = download(url);
        d.then(()=>{r(url)}).catch(err => e(err));
        d.pipe(fs.createWriteStream(path));
    });
}

function recordDownload(url){
    const file = config.downloadRecordFile;
    if (!fs.existsSync(file)){
        fs.writeFileSync(file, "#Download Record\n");
    }
    fs.writeFileSync(file, `+ ${url}\n`, {flag: 'a+'});
}

function getDownloadedRecord(){
    let downloadedList = [];
    const file = config.downloadRecordFile;
    try {
        let downloadRe = /\+\s(.*)\n/g;
        let content =  fs.readFileSync(file, 'utf8');
        let results = content.matchAll(downloadRe);

        for (const match of results) {
            downloadedList.push(match[1]);
        }

        return downloadedList;
    } catch (error) {
        console.log(error);
    }
}

async function downloadDepends(downloadList) {
    let downloadedList = getDownloadedRecord();
    let downloadToList = [];
    for (let index = 0; index < downloadList.length; index++) {
        const element = downloadList[index];
        element[2].forEach(downloadFileName => {
            const downloadURL = `${element[0]}/${element[1]}/${downloadFileName}`;
            if (!downloadedList.includes(downloadURL)){
                downloadToList.push(downloadTo(downloadURL, `temp/${downloadFileName}`));
            }
        });
    }

    return Promise.all(downloadToList).then((results)=>{
        results.forEach(function(result){
            recordDownload(result);
            console.log(`Download ==> ${result}`);
        });

        return Promise.resolve(results);
    }).catch((e)=>{
        console.log(e);
    });
}

//#endregion

//#region Decompress

async function DecompressFileByURL(urlList){
    let decompressList = [];
    urlList.forEach(url => {
        let index = url.lastIndexOf("/");
        if (index >= 0){
            let fileName = url.substring(index + 1);
            if (fileName.endsWith(".zip")){
                decompressList.push(decompress(`temp/${fileName}`, "temp/"));
            }
        }
    });

    return Promise.all(decompressList).then(files=>{
        if (files.length > 0){
            console.log(`Decompress ==> Done`);
        }

        return Promise.resolve(files);
    });
}

//#endregion

async function build() {
    if (!fs.existsSync('temp')) {
        fs.mkdirSync('temp');
    }
    
    downloadDepends(DependList)
    .then(results => {
        return DecompressFileByURL(results);
    }).then(results => {
        // Copy
        let copyList = [];
        results.forEach(files=>{
            files.forEach(file=>{
                console.log(file.path)
                if (CopyMap.has(file.path)){
                    console.log(`Copy ==> temp/${file.path} To `);
                    copyList.push(fse.copy(`temp/${file.path}`, `${CopyMap.get(file.path)}`));
                }
            });
        })
        console.log(`Copy ==> temp/EmmyLua-LS-all.jar To res/emmy/emmy.jar`);
        copyList.push(fse.copy(`temp/EmmyLua-LS-all.jar`, `res/emmy/emmy.jar`));
        return Promise.all(copyList);
    });
}

build().catch(console.error);
