const config = require("./config");
const app = require("./app");

app.listen(config.port, 'localhost', () => {
    console.log("Listening on port: ", config.port);
});
