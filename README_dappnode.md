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
Use an IPS pinning service to pin all files contained in the `build_<version>` folder.

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

