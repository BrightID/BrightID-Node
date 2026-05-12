const fs = require('fs-extra');
const unzipper = require('unzipper');
const path = require('path');
const { services, serverArgs } = require("./config");
const {execSync} = require("child_process");

services.forEach(service => {
    const parentDir = path.join(__dirname, '..');
    const folderPath = path.join(parentDir, service);
    execSync(`foxx dl /${service} > ${service}.zip` + serverArgs, { stdio: 'inherit' });
    console.log(`Downloaded service /${service}`);

    const zipPath = path.join(parentDir, service + '.zip');
    console.log(`Created zip file: ${zipPath}`);

    async function unzip() {
        try {
            await fs.ensureDir(folderPath);

            const directory = await unzipper.Open.file(zipPath);

            for (const file of directory.files) {
                const filePath = path.join(folderPath, file.path);
                if (file.type === 'Directory') {
                    await fs.ensureDir(filePath);
                } else if (file.type === 'File') {
                    const writeStream = fs.createWriteStream(filePath);
                    await new Promise((resolve, reject) => {
                        file.stream()
                            .pipe(writeStream)
                            .on('finish', resolve)
                            .on('error', reject);
                    });
                }
            }

            console.log(`Unzipped content to folder: ${folderPath}`);
            await fs.remove(zipPath);
            console.log(`Removed zip file: ${zipPath}`);
        } catch (err) {
            console.error('Error:', err);
        }
    }
    unzip();
})

