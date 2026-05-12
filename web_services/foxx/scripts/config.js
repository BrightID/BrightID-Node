require('dotenv').config();
const services = ['brightid5', 'apply5', 'brightid6', 'apply6'];
const serverArgs = (process.env.ARANGO_SERVER ? " --server " + process.env.ARANGO_SERVER : '')
    + (process.env.ARANGO_DATABASE ? " --database " + process.env.ARANGO_DATABASE : '')
    + (process.env.ARANGO_USERNAME ? " --username " + process.env.ARANGO_USERNAME : '')
    + (process.env.ARANGO_PASSWORD ? " --password " + process.env.ARANGO_PASSWORD : '');
module.exports = {
    services,
    serverArgs
}