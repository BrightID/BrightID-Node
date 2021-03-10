### release a new version
 
#### Build from git repo
Precondition: install dappnode SDK: `npm install -g @dappnode/dappnodesdk`

**When dappnodesdk supports the `--compose_file_name` paremeter:**
  > dappnodesdk build --compose_file_name docker-compose_Dappnode.yml
  
**Without `--compose_file_name` parameter**

1. Make a backup of `docker-compose.yml`
1. copy `docker-compose_DAppNode.yml` to `docker-compose.yml`
1. Execute build command: `dappnodesdk build`
1. The build process will modify `docker-compose.yml` with updated versions, 
      so you need to copy it back to `docker_compose_DAppNode.yml` after building!
1. Restore original docker-compose.yml from step 1
1. Commit changed files to git
  
### ipfs pinning
Use an IPS pinning service to pin the latest release (see the hash in `releases.json`).

**Infura API example:**
> curl -X POST "https://ipfs.infura.io:5001/api/v0/pin/add?arg=/ipfs/QmUwDB2okYiTe3c6BEK7xqEtyPgTCZKgtDak91TjVFrM8y"

### Publish package
**Preconditions**
- "frame.sh" is installed
- "hot" (your BDev token holding) account and "Smart" (The BDev agent) account are imported in frame
- Metamask extension is disabled in your browser
- Frame extension is enabled in your browser

**Steps**
1. Prepare publishing: `dappnodesdk publish <major|minor|patch>`
1. Open the pre-filled publish link (The last line of dappnodeSDK publish command)
1. Double-check that your "smart" BDEV agent account is selected in Frame
1. Click "Connect" Button. This will actually connect the page with web3 from the Frame extension.
   If this is the first time you use frame with dappnode, approve the connection request from my.dappnode in frame
1. Click "Publish" button 
1. Approve the transaction in Frame
   
Now a new vote should be created in BDEV Aragon! 

Once the vote gets enacted, the BDEV agent will execute the publish transaction.

### Aragon cli examples
```
[michael@stingray BrightID-Node]$ aragon apm versions brightid-node.public.dappnode.eth --environment aragon:mainnet --use-frame

⚠ The request may take a while because you are connecting to the default node (wss://mainnet.eth.aragon.network/ws). For better performance, consider switching to your own Ethereum node or Infura. 

ℹ You have the following options: 
      1. Use the global option "--ws-rpc" (e.g. with wss://mainnet.infura.io/ws/v3/<INFURA_KEY> for Infura)
      2. Set the "wsRPC" field on mainnet environment of the arapp.json 

  ✔ Fetching brightid-node.public.dappnode.eth published versions

ℹ brightid-node.public.dappnode.eth has 1 published versions
⚠ 1.0.0: 0x0000000000000000000000000000000000000000 contentURI: /ipfs/QmXgmKmQ8gM2fyydwvavo6cZmpphCsFWWVa2K8dtNqxLpf is invalid.
```

```
[michael@stingray BrightID-Node]$ aragon apm info brightid-node.public.dappnode.eth 1.0.0 --environment aragon:mainnet --use-frame

⚠ The request may take a while because you are connecting to the default node (wss://mainnet.eth.aragon.network/ws). For better performance, consider switching to your own Ethereum node or Infura. 

ℹ You have the following options: 
      1. Use the global option "--ws-rpc" (e.g. with wss://mainnet.infura.io/ws/v3/<INFURA_KEY> for Infura)
      2. Set the "wsRPC" field on mainnet environment of the arapp.json 

Initialize aragonPM
Fetching brightid-node.public.dappnode.eth@1.0.0

 {
  "error": "contentURI: /ipfs/QmXgmKmQ8gM2fyydwvavo6cZmpphCsFWWVa2K8dtNqxLpf is invalid.",
  "contentURI": "/ipfs/QmXgmKmQ8gM2fyydwvavo6cZmpphCsFWWVa2K8dtNqxLpf",
  "contractAddress": "0x0000000000000000000000000000000000000000",
  "version": "1.0.0"
}
```

### Addresses
- DAppNode package repository
`brightid-node.public.dappnode.eth` maps to [0x4b214a2601d103fabaa8e94f06e924960bf4daeb](https://etherscan.io/address/0x4b214a2601d103fabaa8e94f06e924960bf4daeb).
- Aragon kernel of this repo is deployed at [0x0f3b8ec182deee2381a9041e30f65f10098a3b91](https://etherscan.io/address/0x0f3b8ec182deee2381a9041e30f65f10098a3b91).
- ACL role to publish new releases is "0x0000000000000000000000000000000000000000000000000000000000000001"
- Query 
