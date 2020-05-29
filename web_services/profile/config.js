const is_dev = process.env.NODE_ENV === "dev";

const port = process.env.PORT || 3000;

const node_cache = {
  stdTTL: 900,
  checkperiod: 120,
};

const notification_service = is_dev
  ? process.env.NOTIFICATION_SERVICE_DEV
  : process.env.NOTIFICATION_SERVICE_RELEASE;

module.exports = {
  is_dev,
  port,
  node_cache,
  notification_service,
};
