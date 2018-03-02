const fs = require("fs")


const USAGE = "usage: anticipate [-v|--verbose] [-t|--timeout millisec] file"

const OPTIONS = {
    "--timeout": {run: millisec => parseInt(millisec), argc: 1},
    "-t": "--timeout",
    "--verbose": {},
    "-v": "--verbose"
}



const printUsage = async (toStdErr = false) => console[toStdErr ? "error" : "log"](USAGE)

const printUsageAndExit = (exitCode = 0) => printUsage(exitCode != 0).then(process.exit(() => exitCode))

const printError = async (e) => e && console.error(e instanceof Error ? e.getMessage() : e)

const printErrorAndExit = (e, exitCode = 1) => printError(e).then(() => process.exit(exitCode))

const printFileContents = async (file) => process.stdout.write(fs.readFileSync(file).toString()) || file


// TODO:  Does not support required options or option defaults
const processOptions = argv => {
    argv = !Array.isArray(argv) ? arguments : argv

    const opts = {};
    while (argv.length > 0) {
        const arg = argv[0]  // TODO:  Look into why I can't `Array#shift` here
        argv = argv.slice(1)

        const optionConf = typeof OPTIONS[arg] === "string" ? OPTIONS[OPTIONS[arg]] : OPTIONS[arg];
        if (!optionConf) printUsageAndExit(1)

        const optionName = (typeof OPTIONS[arg] === "string" ? OPTIONS[arg] : arg).replace(/^--?/, "")
        if (optionConf.run) {
            let optionArgv = argv.slice(0, optionConf.argc || 0)
            argv = argv.slice(optionConf.argc || 0)

            opts[optionName] = optionConf.run(...optionArgv)
        } else {
            opts[optionName] = true
        }
    } 
    return opts;
}


const checkExists = async (file) => new Promise(resolve => {
    try { 
        fs.statSync(file) 
    } catch (e) {
        resolve(false)
        return;
    }
    resolve(true)
})

const awaitExists = async (file) => new Promise(resolve => {
    const createNextTimeout = () => setTimeout(() => checkExists(file).then(exists => exists ? resolve(file) : createNextTimeout()), 0)
    createNextTimeout()
})

const checkChanged = async (file, oldStats) => new Promise(resolve => {
    const stats = fs.statSync(file)
    resolve(stats.mtimeMs !== oldStats.mtimeMs)
})

const awaitChanged = async (file) => new Promise(resolve => {
    const stats = fs.statSync(file)

    const createNextTimeout = () => setTimeout(() => checkChanged(file, stats).then(changed => changed ? resolve(file) : createNextTimeout()), 0)
    createNextTimeout()
});


let killTimerId = -1

const initKillTimer = (timeout) => killTimerId = timeout ? setTimeout(() => printErrorAndExit("Wait timeout exceeded."), timeout) : -1

const clearKillTimer = () => clearTimeout(killTimerId)




const argv = process.argv.slice(2);
if (argv.length === 0) {
    printUsageAndExit(1)
}


const watchedFile = argv.pop()
const opts = processOptions(argv) 

try {
    initKillTimer(opts.timeout)
    checkExists(watchedFile)
        .then(async (exists) => (opts.verbose && console.log(`${watchedFile} ${exists ? "exists" : "does not exist"}`)) || exists)
        .then(exists => exists ? awaitChanged(watchedFile) : awaitExists(watchedFile))
        .then(async (file) => (opts.verbose && console.log(`${watchedFile} was modified.`)) || file)
        .then(printFileContents)
        .then(clearKillTimer)
} catch (e) {
    if (opts.verbose) printError(e)
    printUsageAndExit(1)
}
