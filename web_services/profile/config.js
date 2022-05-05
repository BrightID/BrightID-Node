const is_dev = process.env.NODE_ENV === "dev";
const is_test = process.env.NODE_ENV === "test";

const port = process.env.BN_WS_PROFILE_SERVICE_PORT || 3000;

const stdTTL = 60*60*24 // 24 hours
const finalTTL = 600 // 10 minutes

/* Cache config for channels */
const channel_config = {
  stdTTL,
  checkperiod: 120,
  useClones: false // because we are storing complex objects
}

/* Cache config for legacy uploads not using channel concept */
const data_cache_config = {
  stdTTL: 900,
  checkperiod: 120,
}

const notification_service = (is_dev || is_test)
  ? process.env.NOTIFICATION_SERVICE_DEV
  : process.env.NOTIFICATION_SERVICE_RELEASE;

const channel_entry_limit = 30;

const channel_max_size_bytes = is_test
  ? 1024 // 1 kb
  : 1024*1024*10 // 10 MegaByte

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
  stdTTL
};
