### release a new version
#### Using docker.com images
- wget https://github.com/BrightID/BrightID-Node/archive/docker.tar.gz
- Extract into package directory, omitting the top-most dir of the archive:
`tar -zxvf docker.tar.gz --strip-components=1`
- Edit docker-compose.yml:
  - remove all `build` lines, otherwise dappnodesdk will not use the images from docker.com
  - make sure all volumes are specified in short syntax (e.g. `- "snapshots:/snapshots"`)
  - make sure entries under `-volume` are defined with `{}` instead of `null` (e.g.: `snapshots: {}`)
- Login with docker to enable pulling the images. Follow instructions at https://github.com/BrightID/BrightID-Node/wiki/Installation-Guide#pull-and-run-brightid-docker-images.
- Build the package: `dappnodesdk build`
  
#### Building from git repo directly
- Build the package: `dappnodesdk build`
  
### publish package
**TODO**

## URLs:
 - ArangoDB WebUI: http://db.brightid.public.dappnode:8529/
 - BrightID node API: http://web.brightid.public.dappnode/brightid/v5/
 - Profile service: http://web.brightid.public.dappnode/profile/ 

### Package TODOs:
- Use IDChain instance running on DAppNode by default?

#### DONE:
- Detect initial run and populate database accordingly
- Make sure nginx.conf is correct in web container
  -> DONE (new container "web" based on nginx image)
- Setup port mapping to access web container (API) from external
  -> NOT NEEDED - If you connect to DAppNode VPN, you can access at 
     web.brightid.public.dappnode (e.g. API v5: http://web.brightid.public.dappnode/brightid/v5/)
     External access to node API is not required unless you want to run a real public node API
- Setup network. All containers specified in docker-compose will join a common network.
    - Update service config to use correct endpoints instead of localhost
  
