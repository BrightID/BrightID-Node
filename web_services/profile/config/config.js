var development = {
  port: 3000,
  node_cache: {
    stdTTL: 7200,
    checkperiod: 120
  }
};

var production = {
  port: 3000,
  node_cache: {
    stdTTL: 7200,
    checkperiod: 120
  }
};

var env = "prod"; // default value
var is_dev = false;

switch (process.env.NODE_ENV || env) {
  case 'dev':
    env = development;
    is_dev = true;
    break;
  case 'prod':
    env = production;
    break;
}

if(env){
  for(var key in env){
    exports[key] = env[key];
  }
}

exports.is_dev = is_dev;
