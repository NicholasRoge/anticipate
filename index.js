#!/usr/bin/env node

const program = require("commander");
const fs = require("fs")


const printError = async (e) => e && console.error(e instanceof Error ? e.message : e)

const printErrorAndExit = (e, exitCode = 1) => printError(e).then(() => process.exit(exitCode))


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

const checkFileChanged = async (file, oldStats) => new Promise(resolve => {
    const stats = fs.statSync(file)
    resolve(stats.mtimeMs !== oldStats.mtimeMs)
})

const checkDirChanged = async (dir, initialListing) => {
    const listing = fs.readdirSync(dir);
    for (const file of listing) {
        if (initialListing.indexOf(file) === -1) {
            // A file was created
            return true;
        }
    }
    for (const file of initialListing) {
        if (listing.indexOf(file) === -1) {
            // A file was deleted
            return true;
        }
    }
    return false;
}

const awaitChanged = async (file) => new Promise(resolve => {
    const stats = fs.statSync(file)
    if (stats.isDirectory()) {
        const initialListing = fs.readdirSync(file);
        
        let resolved = false;
        Promise.race(initialListing.map(dirFile => awaitChanged(`${file}/${dirFile}`))).then(changedFile => {
            // One of the constituent files has changed.
            resolved = true
            resolve(file)
        })

        const createNextTimeout = () => setTimeout(() => checkDirChanged(file, initialListing).then(changed => {
            if (changed) {
                resolve(file)
            } else if (!resolved) {
                createNextTimeout()
            }
        }), 0);
        createNextTimeout();
    } else {
        const createNextTimeout = () => setTimeout(() => checkFileChanged(file, stats).then(changed => changed ? resolve(file) : createNextTimeout()), 0)
        createNextTimeout()
    }
});


let killTimerId = -1

const initKillTimer = (timeout) => killTimerId = timeout ? setTimeout(() => printErrorAndExit("Wait timeout exceeded."), timeout) : -1

const clearKillTimer = () => clearTimeout(killTimerId)



program
    .arguments('<path>')
    //.version('0.1.0')
    .option('-t, --timeout <timeout>', 'Time will stop watching file before a change has occured.', 0)
    .option('-v, --verbose')
    .action(async function (target) {
        try {
            initKillTimer(this.timeout)

            const targetExists = await checkExists(target)
            if (targetExists) {
                if (this.verbose) {
                    console.log(`Target '${target}' exists.  Awaiting modification.`)
                }
                
                await awaitChanged(target)
            } else {
                if (this.verbose) {
                    console.log(`Target '${target}' does not exist.  Awaiting creation.`)
                }

                await awaitExists(target)
            }

            clearKillTimer()
        } catch (e) {
            if (this.verbose) printError(e)
            this.outputHelp()
        }
    })
    .parse(process.argv);

if (program.args.length === 0) {
    program.outputHelp()
}
