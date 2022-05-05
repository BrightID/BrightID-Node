const sizeof = require('object-sizeof')
const process = require('process')

const renderLegacyCaches = (dataCache) => {
  let body = ''
  let sizeTotal = 0
  dataCache.keys().forEach((key, index) => {
    const entry = channelCache.get(key)
    const size = sizeof(entry) + sizeof(key)
    sizeTotal += size
    body += `
<tr>
  <td>${index}</td>
  <td><a href="/download/${key}">${key}</a></td>
  <td>${Number(size/1024).toFixed(2)}</td>
  <td>${new Date(dataCache.getTtl(key)).toLocaleTimeString()} (${dataCache.getTtl(key)})</td>
</tr>
    `
  })

  const footer = `
  <tr>
    <td colspan="2">Totals:</td>
    <td>${Number(sizeTotal / 1024).toFixed(2)} kb</td>
  </tr>
  `
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
  </table>`

  return table
}

const renderActiveChannels = (channelCache) => {
  let body = ''
  let sizeTotal = 0
  let countTotal = 0

  channelCache.keys().forEach((key, index) => {
    const entry = channelCache.get(key)
    sizeTotal += entry.size
    countTotal += entry.entries.size
    body += `
<tr>
  <td>${index}</td>
  <td><a href="/list/${key}">${key}</a></td>
  <td>${entry.entries.size}</td>
  <td>${Number(entry.size / 1024).toFixed(2)} kb</td>
  <td>${new Date(channelCache.getTtl(key)).toLocaleTimeString()} (${channelCache.getTtl(key)})</td>
</tr>
`
  })

  let footer = `
  <tr>
    <td colspan="2">Totals:</td>
    <td>${countTotal}</td>
    <td>${(sizeTotal / 1024).toFixed(2)} kb</td>
  </tr>
  `
  const table = `
  <table border="2">
    <thead>
      <tr>
        <th>#</th>
        <th>ID</th>
        <th>Entries</th>
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
  </table>`

  return table;
}

const renderProcessStats = () => {
  let body = '<table border="1">'
  for (const [key,value] of Object.entries(process.memoryUsage())){
    const line = `<tr><td>${key}</td><td>${value/1000000} MB</td></tr>`
    body += line
  }
  body  += '</table>'
  return body
}

const renderStats = (channelCache, dataCache) => {
  let body = `
<html>
  <h3>process.memoryUsage()</h3>
    ${renderProcessStats()}
  <h3>Open channels: ${channelCache.keys().length}</h3>
    ${renderActiveChannels(channelCache)}
  <h3>Legacy caches: ${dataCache.keys().length}</h3>
    ${renderLegacyCaches(dataCache)}
</html>
 `
  return body
}

module.exports = {
  renderStats
};
