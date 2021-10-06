# Build dappnode package
### Precondition
Install dappnode SDK if you don't have it already:
> npm install -g @dappnode/dappnodesdk

### Build package
You need to be connected to your DAppNode VPN to build the package.
> dappnodesdk build --compose_file_name docker-compose_DAppNode.yml

### Installation and running
Above build command will output a direct link to the package installation on your dappnode.
#### Limit ressource usage
By default the ArangoDB will use ~50% of the available system RAM. This can lead to conflicts with other packages
running on your DAppNode. The RAM usage can be tuned by providing `BN_ARANGO_EXTRA_OPTS` to the `Db` package. 

Example`BN_ARANGO_EXTRA_OPTS`:
>`--rocksdb.total-write-buffer-size 4000000000 --rocksdb.block-cache-size 5000000000  --rocksdb.enforce-block-cache-size-limit true`

These options limit the RAM usage of ArangoDB to ~8 GB. 
