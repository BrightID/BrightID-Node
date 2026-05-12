const { execSync } = require('child_process');
const { services, serverArgs } = require("./config");

services.forEach(service => {
    console.log(`Setting dev mode for /${service}...`);
    execSync(`foxx set-dev /${service}` + serverArgs, { stdio: 'pipe' });
});
