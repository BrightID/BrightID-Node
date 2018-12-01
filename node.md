# Running A Node
## Overview
A network of nodes forms the decentralized core of the uniqueness verification service. The nodes reach a consensus about changes to the social graph and store a copy of the complete graph. No identifying information is stored in the graph, only users' public keys. Nodes run software that can detect the presence of sybils based on social graph analysis.
## Installation
https://github.com/BrightID/BrightID-Node/wiki/Installation-Guide
## Components
### Update Service
Nodes receive client requests from the [BrightID mobile application](https://github.com/BrightID/BrightID) to update the graph. Update operations are digitally signed and dated by the users making the request. Nodes forward these requests to other nodes for consensus.
### Consensus
Nodes reach a consensus about signed update operations. Once it's clear that all nodes will accept an update, it's applied to the graph.
### [BrightID API](https://github.com/BrightID/BrightID-API)
Nodes run [systems designed to detect sybils](https://github.com/BrightID/BrightID-Node/wiki/Anti-Sybil-Systems). They use these to compute users' _brightID scores_ which they send to third-party applications.
## API Reference
[BrightID Node API Reference](https://github.com/BrightID/BrightID-Node/wiki/API-Reference)
