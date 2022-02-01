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

# Update dappnode package
## Versioning
The file `dappnode_package.json` contains two version entries:
### `version`
The `version` field indicates the version of the dappnode package itself. Guidelines for updating it:
- Update the `minor` number whenever there is a change in the upstream version, no matter if it was major, minor or patch update.
- Update the `patch` number whenever the dappnode package itself is updated, but the upstream version stays unchanged
- Update the `major` number when there was a signifcant change to the dappnode package itself
### `upstreamVersion`
- always has to be the same like the BrightID node version (See version entry in
web_services/foxx/brightid/package.json)
