const { execSync } = require('child_process');
const { services, serverArgs } = require("./config");

services.forEach(service => {
    console.log(`Installing node_modules in ${service}...`);
    execSync('npm install', { cwd: service, stdio: 'inherit' });
    console.log(`Deploying ${service} to ArangoDB...`);
    try {
        execSync(`foxx upgrade /${service} ${service}` + serverArgs, { stdio: 'pipe' });
    } catch (e) {
        if(String(e).includes("No service found")) {
            execSync(`foxx install /${service} ${service}` + serverArgs, { stdio: 'pipe' });
        } else {
            throw e
        }
    }
});
