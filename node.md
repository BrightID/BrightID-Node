# Running A Node
## Overview
A network of nodes forms the decentralized core of the uniqueness verification service. The nodes reach a consensus about changes to the social graph and store a copy of the complete graph. No identifying information is stored in the graph, only users' public keys. Nodes run software that can detect the presence of sybils based on social graph analysis.
## Installation
For now, follow the [development guide](https://github.com/Brightside-Social/brightside-node/wiki/Development-Guide) until our own docker image is ready to use.
## Components
### Update Service
Nodes receive client requests to update the graph. Update operations are digitally signed and dated by the users making the request. Nodes forward these requests to other nodes for consensus.
### Consensus
Nodes reach a consensus about signed update operations. Once it's clear that all nodes will accept an update, it's applied to the graph.
### Uniqueness Service
Nodes respond to requests about a user's likelihood of being unique.
### Sybil Detection
Nodes run [SybilInfer](http://citeseerx.ist.psu.edu/viewdoc/summary?doi=10.1.1.149.6318), [SybilDefender](https://pdfs.semanticscholar.org/7606/64eab41125b06692a95832961bc5473d2aae.pdf) and/or other systems designed to detect sybils. The uniqueness likelihood scores served by the uniqueness service are obtained by running these systems. 

Nodes also publish information about possible sybils to _watch lists_ that alert Brightside users. Users can remove their connections to a sybil account which can in turn lower its uniqueness score.
## API Reference
[Brightside Node API Reference](https://github.com/Brightside-Social/brightside-node/wiki/API-Reference)
