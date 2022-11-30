const config = require("./config");
const app = require("./app");

app.listen(config.port, () => {
    console.log("Listening on port: ", config.port);
});
