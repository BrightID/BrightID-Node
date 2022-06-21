const sizeof = require("object-sizeof");
const process = require("process");

const renderLegacyCaches = (dataCache, rootPath) => {
  let body = "";
  let sizeTotal = 0;
  dataCache.keys().forEach((key, index) => {
    const entry = channelCache.get(key);
    const size = sizeof(entry) + sizeof(key);
    sizeTotal += size;
    body += `
<tr>
  <td>${index}</td>
  <td><a href="${rootPath}/download/${key}">${key}</a></td>
  <td>${Number(size / 1024).toFixed(2)}</td>
  <td>${new Date(dataCache.getTtl(key)).toLocaleString()} (${dataCache.getTtl(
      key
    )})</td>
</tr>
    `;
  });

  const footer = `
  <tr>
    <td colspan="2">Totals:</td>
    <td>${Number(sizeTotal / 1024).toFixed(2)} kb</td>
  </tr>
  `;
  const table = `
  <table border="2">
    <thead>
      <tr>
        <th>#</th>
        <th>ID</th>
        <th>Est. size</th>
        <th>Expires</th>
      </tr>
    </thead>
    <tfoot>
      ${footer}    
    </tfoot>
    <tbody>
      ${body}
    </tbody>
  </table>`;

  return table;
};

const renderActiveChannels = (channelCache, rootPath) => {
  let body = "";
  let sizeTotal = 0;
  let countTotal = 0;

  channelCache.keys().forEach((key, index) => {
    const entry = channelCache.get(key);
    if (entry) {
      sizeTotal += entry.size;
      countTotal += entry.entries.size;
      body += `
<tr>
  <td>${index}</td>
  <td><a href=${rootPath}/list/${key}>${key}</a></td>
  <td>${entry.entries.size}</td>
  <td>${Number(entry.size / 1024).toFixed(2)} kb</td>
  <td>${entry.ttl}</td>
  <td>${new Date(
    channelCache.getTtl(key)
  ).toLocaleString()} (${channelCache.getTtl(key)})</td>
</tr>
`;
    } else {
      // Entry not existing.
      // Can happen if a key expires between getting list of keys with `channelCache.keys()`
      // and receiving the entry inside the loop with `channelCache.get(key).
    }
  });

  let footer = `
  <tr>
    <td colspan="2">Totals:</td>
    <td>${countTotal}</td>
    <td>${(sizeTotal / 1024).toFixed(2)} kb</td>
  </tr>
  `;
  const table = `
  <table border="2">
    <thead>
      <tr>
        <th>#</th>
        <th>ID</th>
        <th>Entries</th>
        <th>Est. size</th>
        <th>TTL (secs)</th>
        <th>Expires</th>
      </tr>
    </thead>
    <tfoot>
      ${footer}    
    </tfoot>
    <tbody>
      ${body}
    </tbody>
  </table>`;

  return table;
};

const renderProcessStats = () => {
  let body = '<table border="1">';
  for (const [key, value] of Object.entries(process.memoryUsage())) {
    const line = `<tr><td>${key}</td><td>${value / 1000000} MB</td></tr>`;
    body += line;
  }
  body += "</table>";
  return body;
};

const renderStats = (req, channelCache, dataCache) => {
  // quick hack to have working links both in local dev environment (hosted at "/")
  // and in production (hosted at "/profile")
  const local = req.hostname === "127.0.0.1";
  const rootPath = local ? "" : "/profile";
  let body = `
<html>
  <h3>process.memoryUsage()</h3>
    ${renderProcessStats()}
  <h3>Open channels: ${channelCache.keys().length}</h3>
    ${renderActiveChannels(channelCache, rootPath)}
  <h3>Legacy caches: ${dataCache.keys().length}</h3>
    ${renderLegacyCaches(dataCache, rootPath)}
</html>
 `;
  return body;
};

module.exports = {
  renderStats,
};
