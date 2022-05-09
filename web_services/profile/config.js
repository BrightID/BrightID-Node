const is_dev = process.env.NODE_ENV === "dev";
const is_test = process.env.NODE_ENV === "test";

const port = process.env.BN_WS_PROFILE_SERVICE_PORT || 3000;

const minTTL = 60 // 1 minute
const maxTTL = 60*60*24 // 24 hours
const defaultTTL = 60*15 // 15 minutes
const finalTTL = 600 // 10 minutes grace period to keep empty channels open

/* Cache config for channels */
const channel_config = {
  defaultTTL,
  checkperiod: is_test
    ? 10  // low 10 sec check intervall to test expiration
    : 120,  // 2 minute check intervall
  useClones: false // because we are storing complex objects
}

/* Cache config for legacy uploads not using channel concept */
const data_cache_config = {
  stdTTL: 900,
  checkperiod: 120
}

const notification_service = (is_dev || is_test)
  ? process.env.NOTIFICATION_SERVICE_DEV
  : process.env.NOTIFICATION_SERVICE_RELEASE;

const channel_entry_limit = 30;

const channel_max_size_bytes = is_test
  ? 1024 // 1 kb when running jest tests
  : 1024*1024*20 // 20 MegaByte normally

const channel_limit_response_code = 440;
const channel_limit_message = "Channel full"

module.exports = {
  is_dev,
  port,
  channel_config,
  data_cache_config,
  notification_service,
  channel_entry_limit,
  channel_max_size_bytes,
  channel_limit_response_code,
  channel_limit_message,
  finalTTL,
  minTTL,
  maxTTL,
  defaultTTL
};
