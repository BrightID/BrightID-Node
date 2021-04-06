# Build dappnode package
###Precondition
Install dappnode SDK if you don't have it already:
> npm install -g @dappnode/dappnodesdk

###Build package
> dappnodesdk build --compose_file_name docker-compose_Dappnode.yml

## Publish new version
 
### ipfs pinning
Use an IPS pinning service to pin the latest release (see the hash in `releases.json`).

**Infura API example:**
> curl -X POST "https://ipfs.infura.io:5001/api/v0/pin/add?arg=/ipfs/QmUwDB2okYiTe3c6BEK7xqEtyPgTCZKgtDak91TjVFrM8y"

### Publish package
**NOTE** Following instructions are work-in-progress, assuming BrightID BDEV DAO is owning the package. 

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

### Addresses
- DAppNode package repository
`brightid-node.public.dappnode.eth` maps to [0x4b214a2601d103fabaa8e94f06e924960bf4daeb](https://etherscan.io/address/0x4b214a2601d103fabaa8e94f06e924960bf4daeb).
- Aragon kernel of this repo is deployed at [0x0f3b8ec182deee2381a9041e30f65f10098a3b91](https://etherscan.io/address/0x0f3b8ec182deee2381a9041e30f65f10098a3b91).
- ACL role to publish new releases is "0x0000000000000000000000000000000000000000000000000000000000000001"
