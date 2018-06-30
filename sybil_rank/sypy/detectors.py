#    SyPy: A Python framework for evaluating graph-based Sybil detection
#    algorithms in social and information networks.
#
#    Copyright (C) 2013  Yazan Boshmaf
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.

import networkx as nx
import operator
import random
import math
import copy
import sypy

class BaseDetector:

    def __init__(self, network):
        self.network = network
        self.__check_integrity()

        self.honests_truth = self.network.left_region.graph.nodes()
        self.honests_predicted = None

    def __check_integrity(self):
        if not self.network.is_stitched:
            raise Exception("Network is not stitched")

    def detect(self):
        raise NotImplementedError("This method is not supported")

    def _vote_honests_predicted(self, collection):
        self.honests_predicted = []
        biggest_overlap = 0
        for i, list_item in enumerate(collection):
            overlap = set.intersection(
                set(self.network.known_honests),
                set(list_item)
            )
            if len(overlap) > biggest_overlap:
                biggest_overlap = len(overlap)
                self.honests_predicted = list_item


class GenericBCCDetector(BaseDetector):

    def __init__(self, network):
        BaseDetector.__init__(self, network)

    def detect(self):
        bcc = nx.biconnected_components(self.network.graph.structure)

        self._vote_honests_predicted(bcc)
        return sypy.Results(self)


class GirvanNewmanCommunityDetector(BaseDetector):
    """
    Implements Girvan-Newman community detection algorithm as described
    in Community Structure in Social and Biological Networks, Girvan et al.
    PNAS June, Vol 99(12), 2002.

    Note: The algorithm performs a top-down, hierarchical graph clustering
    based on edge betweenness. It tries to partition the network into two
    tightly-knit communities or clusters, as a way to detect Sybils.
    """
    def __init__(self, network, max_level=1):
        BaseDetector.__init__(self, network)
        self.dendogram = nx.DiGraph()
        self.max_level = max_level

    def detect(self):
        structure = self.network.graph.structure.copy()

        self.dendogram.add_node(structure)
        self.__construct_dendogram(structure, 1)

        sub_structures = self.dendogram.nodes()
        sub_structures.remove(structure)

        communities = []
        for sub_structure in sub_structures:
            communities.append(sub_structure.nodes())

        self._vote_honests_predicted(communities)
        return sypy.Results(self)

    def __construct_dendogram(self, structure, current_level):
        if structure.order() <= 1 or current_level > self.max_level:
            return

        edge_betweenness = nx.edge_betweenness_centrality(
            structure,
            normalized=False
        )

        max_edge = max(
            edge_betweenness,
            key=edge_betweenness.get
        )

        (left, right) = (0, 1)
        structure.remove_edge(
            max_edge[left],
            max_edge[right]
        )

        sub_structures = nx.connected_component_subgraphs(structure)
        if len(sub_structures) == 1:
            self.__construct_dendogram(
                structure,
                current_level
            )
        else:
            self.__add_dendogram_level(
                structure,
                sub_structures
            )
            self.__construct_dendogram(
                sub_structures[left],
                current_level+1
            )
            self.__construct_dendogram(
                sub_structures[right],
                current_level+1
            )

    def __add_dendogram_level(self, structure, sub_structures):
        (left, right) = (0, 1)
        self.dendogram.add_node(sub_structures[left])
        self.dendogram.add_node(sub_structures[right])

        self.dendogram.add_edge(
            structure,
            sub_structures[left]
        )
        self.dendogram.add_edge(
            structure,
            sub_structures[right]
        )


class MisloveSingleCommunityDetector(BaseDetector):
    """
    Implements Mislove community detection algorithm as described in You Are
    Who You Know: Inferring User Profiles in Online Social Networks,
    Mislove et al., WSDM, 2010.
    The algorithms 'grows' a community starting with an induced subgraph until
    maximum normalized conductance is achieved. As a detector, the initial
    subgraph is a connected component consisting of all known honest nodes.
    """
    def __init__(self, network):
        BaseDetector.__init__(self, network)
        self.honests_graph = sypy.CustomGraph(
            self.network.graph.structure.subgraph(self.network.known_honests)
        )

    def detect(self):
        self.__grow_community()
        community = self.honests_graph.nodes()

        self._vote_honests_predicted([community])
        return sypy.Results(self)

    def __grow_community(self):
        stats = self.network.get_network_stats()
        (conductance, edge_cover) = stats.normalized_conductance(
            self.honests_graph,
            edge_cover=True
        )

        max_conductance = conductance
        while self.honests_graph.size() <= self.network.graph.size():
            (membership, max_conductance) = self.__get_best_candidate(
                max_conductance,
                edge_cover,
                stats
            )

            if not membership:
                break

            self.honests_graph.structure.add_node(membership["node"])
            self.honests_graph.structure.add_edges_from([membership["edge"]])
            edge_cover = membership["cover"]

    def __get_best_candidate(self, conductance, edge_cover, stats):
        membership = {}
        max_conductance = conductance
        for (left_node, right_node) in edge_cover:
            candidate_node = left_node
            if left_node not in self.honests_graph.structure:
                candidate_node = right_node

            candidate_edge = (left_node, right_node)

            candidate_graph = sypy.CustomGraph(
                self.honests_graph.structure.copy()
            )
            candidate_graph.structure.add_edges_from([candidate_edge])

            (new_conductance, new_cover) = stats.normalized_conductance(
                candidate_graph,
                edge_cover=True
            )

            if new_conductance > max_conductance:
                max_conductance = new_conductance
                membership = {
                    "node": candidate_node,
                    "edge": candidate_edge,
                    "cover": new_cover
                }

        return (membership, max_conductance)

    def __get_candidate(self, left_node, right_node):
        edge = (left_node, right_node)
        if left_node in self.honests_graph.structure:
            return (left_node, edge)

        return (right_node, edge)


class BaseSybilDetector(BaseDetector):

    def __init__(self, network, verifiers, seed):
        BaseDetector.__init__(self, network)

        self.verifiers = verifiers
        self.seed = seed

        self.__check_integrity()

    def __check_integrity(self):
        if self.seed:
            random.seed(self.seed)

        if not self.verifiers:
            self.verifiers = random.sample(
                self.honests_truth,
                random.randint(1, len(self.network.known_honests))
            )

        valid_verifiers = set(self.verifiers).issubset(set(self.honests_truth))
        if not valid_verifiers:
            raise Exception("Invalid verifiers. Not subset of honests")

class SybilRankDetector(BaseSybilDetector):
    """
    Implements a centralized version of the SybilRank protocol as described
    in Aiding the Detection of Fake Accounts in Large Scale Social Online
    Services, Cao et al., Usenix NSDI, 2012.
    This implementation assumes a single-community honest region. The case
    of multi-community structure can be reduced to a single-community structure
    by applying Louvain community detection algorithm and running SybilRank
    on every community, as described in the paper.
    """
    def __init__(self, network, total_trust=1.0, verifiers=None, pivot=0.1,
            seed=None, num_iterations_scaler=1.0):
        BaseSybilDetector.__init__(self, network, verifiers, seed)
        self.pivot = pivot
        self.num_iterations_scaler = num_iterations_scaler
        self.total_trust = total_trust

    def detect(self):
        num_iterations = math.log10(
            self.network.graph.order()
        ) * self.num_iterations_scaler
        num_iterations = (int)(math.ceil(num_iterations))

        network_trust = self.__initialize_network_trust()

        while num_iterations != 0:
            network_trust = self.__propagate_network_trust(network_trust)
            num_iterations = num_iterations - 1

        ranked_trust = self.__normalize_and_rank_network_trust(network_trust)
        self.ranked_trust = ranked_trust
        pivot_mark = (int)(self.pivot * len(ranked_trust))
        verified_honests = [
            honest_node for honest_node, trust in ranked_trust[pivot_mark:]
        ]
        self._vote_honests_predicted([verified_honests])
        return sypy.Results(self)

    def __initialize_network_trust(self):
        network_trust = dict(
            (node, 0.0) for node in self.network.graph.nodes()
        )

        for verifier in self.verifiers:
            network_trust[verifier] = self.total_trust / (float)( len(self.verifiers) )

        return network_trust

    def __propagate_network_trust(self, network_trust):
        updated_trust = {}
        for node, trust in network_trust.iteritems():
            new_trust = 0.0
            neighbors = self.network.graph.structure.neighbors(node)

            for neighbor in neighbors:
                neighbor_degree = self.network.graph.structure.degree(neighbor)
                new_trust += network_trust[neighbor] / (float)(neighbor_degree)

            updated_trust[node] = new_trust

        return updated_trust

    def __normalize_and_rank_network_trust(self, network_trust):
        for node, trust in network_trust.iteritems():
            node_degree = self.network.graph.structure.degree(node)
            network_trust[node] = trust / (float)(node_degree)

        ranked_trust = sorted(
            network_trust.iteritems(),
            key=operator.itemgetter(1)
        )

        return ranked_trust


class SybilPredictDetector(BaseSybilDetector):
    """
    Implements a centralized version of the SybilPredict protocol as described
    in Aiding Fake Account Detection in OSNs by Predicting Potential Victims,
    Boshmaf et al. (unpublished, yet.)
    This implementation assumes a single-community honest region. The case
    of multi-community structure can be reduced to a single-community structure
    by applying Louvain community detection algorithm and running SybilPredict
    on every community, which is similar to SybilRank.
    """
    def __init__(self, network, total_trust=1.0, verifiers=None, pivot=0.1,
            seed=None, num_iterations_scaler=1.0, potentials=None,
            operation_mode="normal"):
        BaseSybilDetector.__init__(self, network, verifiers, seed)
        self.total_trust = total_trust
        self.pivot = pivot
        self.num_iterations_scaler = num_iterations_scaler
        self.potentials = potentials
        self.operation_mode = operation_mode

    def __setup_network(self):
        if not self.potentials:
            self.potentials = dict(
                (node, 0.0) for node in self.network.graph.nodes()
            )

        if self.operation_mode == "normal":
                pass
        elif self.operation_mode == "best":
            for victim, _ in self.network.attack_edges:
                self.potentials[victim] = 0.99
        elif self.operation_mode == "worst":
            victims = []
            for victim, _ in self.network.attack_edges:
                victims.append(victim)
            others = set(self.network.graph.nodes()) - set(victims)
            for node in others:
                self.potentials[node] = 0.99
        elif self.operation_mode == "random":
            for node in self.network.graph.nodes():
                rand_potential = random.uniform(0.01, 1.0)
                self.potentials[node] = rand_potential
        else:
            raise Exception("Invalid operation mode")

        for node in self.network.graph.nodes():
            neighbors = self.network.graph.structure.neighbors(node)
            for neighbor in neighbors:
                if "weight" in self.network.graph.structure[node][neighbor]:
                    self.network.graph.structure[node][neighbor]["weight"] *=\
                        (1.0 - self.potentials[node])
                else:
                    self.network.graph.structure[node][neighbor]["weight"] =\
                        (1.0 - self.potentials[node])

    def __reset_network(self):
        for node in self.network.graph.nodes():
            neighbors = self.network.graph.structure.neighbors(node)
            for neighbor in neighbors:
                self.network.graph.structure[node][neighbor] = {}

    def detect(self):
        self.__setup_network()

        num_iterations = math.log10(
            self.network.graph.order()
        ) * self.num_iterations_scaler
        num_iterations = (int)(math.ceil(num_iterations))

        network_trust = self.__initialize_network_trust()

        while num_iterations != 0:
            network_trust = self.__propagate_network_trust(network_trust)
            num_iterations = num_iterations - 1

        ranked_trust = self.__normalize_and_rank_network_trust(network_trust)

        pivot_mark = (int)(self.pivot * len(ranked_trust))
        verified_honests = [
            honest_node for honest_node, trust in ranked_trust[pivot_mark:]
        ]
        self._vote_honests_predicted([verified_honests])

        self.__reset_network()
        return sypy.Results(self)

    def __initialize_network_trust(self):
        network_trust = dict(
            (node, 0.0) for node in self.network.graph.nodes()
        )

        for verifier in self.verifiers:
            network_trust[verifier] = self.total_trust / (float)( len(self.verifiers) )

        return network_trust

    def __propagate_network_trust(self, network_trust):
        updated_trust = {}
        for node, trust in network_trust.iteritems():
            new_trust = 0.0
            neighbors = self.network.graph.structure.neighbors(node)

            for neighbor in neighbors:
                neighbor_weight = self.network.graph.structure.degree(
                    neighbor,
                    weight="weight"
                )
                edge_weight = self.network.graph.structure[node][neighbor]["weight"]
                new_trust += network_trust[neighbor] *\
                    ( edge_weight / float(neighbor_weight) )

            updated_trust[node] = new_trust

        return updated_trust

    def __normalize_and_rank_network_trust(self, network_trust):
        for node, trust in network_trust.iteritems():
            node_weight = self.network.graph.structure.degree(node, weight="weight")
            network_trust[node] = trust / (float)(node_weight)

        ranked_trust = sorted(
            network_trust.iteritems(),
            key=operator.itemgetter(1)
        )

        return ranked_trust


class SybilGuardDetector(BaseSybilDetector):
    """
    Implements a centralized version of the SybilGuard protocol as described
    in SybilGuard: Defending Against Sybil Attacks via Social Networks,
    Yu et al., SIGCOMM (2006).

    Note: In this centralized version, a set of verifiers which are a subset
    of the known honest nodes try to label nodes either honest or Sybil, and
    then the labeling that results in the correct inclusion of most known
    honests in the honest region is selected, instead of relying on a single
    verifier. Moreover, the number of honest nodes in the network is directly
    computed but not sampled as presented in the paper. This means that the
    implementation uses the exact value scaled by its asymptotic constant,
    but not its estimate.
    """
    def __init__(self, network, verifiers=None, route_len_scaler=1.0, seed=None):
        BaseSybilDetector.__init__(self, network, verifiers, seed)
        self.route_len_scaler = route_len_scaler

    def detect(self):
        self.__generate_random_routes()

        num_honests = len(self.honests_truth)
        route_len = int(
            self.route_len_scaler * math.sqrt(num_honests) *\
                math.log10(num_honests)
        )
        walks = self.__walk_random_routes(route_len)

        verified_honests = self.__accept_honests_from_verifiers(walks)
        self._vote_honests_predicted(verified_honests)

        return sypy.Results(self)

    def __generate_random_routes(self):
        nodes = self.network.graph.nodes()
        random_routes = {}

        for node in nodes:
            node_routes = {}
            neighbors = self.network.graph.structure.neighbors(node)
            shuffled_neighbors = copy.copy(neighbors)
            random.shuffle(shuffled_neighbors)
            for index, neighbor in enumerate(neighbors):
                node_routes[neighbor] = shuffled_neighbors[index]

            node_routes[node] = random.choice(neighbors)
            random_routes[node] = node_routes

        nx.set_node_attributes(
            self.network.graph.structure,
            "random_routes",
            random_routes
        )

    def __walk_random_routes(self, route_len):
        walks = {}
        structure = self.network.graph.structure

        for node in structure.nodes():
            walk = [node]

            ingress_node = node
            routing_node = node

            node_routes = structure.node[routing_node]["random_routes"]
            outgress_node = node_routes[ingress_node]
            while len(walk) != (route_len + 1):
                walk.append(outgress_node)
                routing_node = outgress_node

                node_routes = structure.node[routing_node]["random_routes"]
                outgress_node = node_routes[ingress_node]

                ingress_node = routing_node

            walks[node] = walk

        return walks

    def __accept_honests_from_verifiers(self, walks):
        verified_honests = []
        for verifier in self.verifiers:
            verifier_honests = []
            verifier_walk = self.__get_walk_edges(walks[verifier])
            for suspect in walks:
                suspect_walk = self.__get_walk_edges(walks[suspect])
                overlap = set.intersection(
                    set(verifier_walk),
                    set(suspect_walk)
                )
                if len(overlap) != 0:
                    verifier_honests.append(suspect)
            verified_honests.append(verifier_honests)

        return verified_honests

    def __get_walk_edges(self, walk):
        edges = []
        for index in xrange(len(walk)-1):
            edges.append(
                (walk[index], walk[index+1])
            )
        return edges


class SybilLimitDetector(BaseSybilDetector):
    """
    Implements a centralized version of the SybilLimit protocol, as described
    in SybilLimit: A Near-Optimial Social Network Defense against Sybil Attacks,
    Yu et al., IEEE S&P (2008).
    """
    def __init__(self, network, verifiers=None, route_len_scaler=1.0,
            num_instances_scaler=1.0, tail_balance_scalar=4.0, seed=None):
        BaseSybilDetector.__init__(self, network, verifiers, seed)

        self.route_len_scaler = route_len_scaler
        self.num_instances_scaler = num_instances_scaler
        self.tail_balance_scalar = tail_balance_scalar

    def detect(self):
        num_edges = self.network.left_region.graph.size()
        num_instances = int(
            self.num_instances_scaler * math.sqrt(num_edges)
        )

        region_stats = self.network.left_region.get_region_stats()

        (lower_mtime, upper_mtime) = region_stats.mixing_time()
        route_len = int(
            self.route_len_scaler * math.ceil(upper_mtime)
        )

        self.__generate_secure_random_routes(num_instances)
        suspects_tails = self.__walk_secure_random_routes(
            route_len,
            num_instances,
            verify=False
        )

        self.__generate_secure_random_routes(num_instances)
        verifiers_tails = self.__walk_secure_random_routes(
            route_len,
            num_instances
        )

        verified_honests = self.__accept_honests_from_verifiers(
            suspects_tails,
            verifiers_tails,
            num_instances
        )
        self._vote_honests_predicted(verified_honests)

        return sypy.Results(self)

    def __generate_secure_random_routes(self, num_instances):
        nodes = self.network.graph.nodes()
        secure_routes = {}

        for node in nodes:
            route_instances = []
            while len(route_instances) != num_instances:
                node_routes = {}
                neighbors = self.network.graph.structure.neighbors(node)
                shuffled_neighbors = copy.copy(neighbors)
                random.shuffle(shuffled_neighbors)
                for index, neighbor in enumerate(neighbors):
                    node_routes[neighbor] = shuffled_neighbors[index]
                node_routes[node] = random.choice(neighbors)
                route_instances.append(node_routes)

            secure_routes[node] = route_instances

        nx.set_node_attributes(
            self.network.graph.structure,
            "secure_routes",
            secure_routes
        )

    def __walk_secure_random_routes(self, route_len, num_instances, verify=True):
        tails = {}
        structure = self.network.graph.structure

        nodes = self.verifiers
        if not verify:
            nodes = list(
                set(structure.nodes()) - set(nodes)
            )

        for node in nodes:
            instance_tails = []
            for instance_index in xrange(num_instances):
                walk = [node]

                ingress_node = node
                routing_node = node

                route_instances = structure.node[routing_node]["secure_routes"]
                node_routes = route_instances[instance_index]

                outgress_node = node_routes[ingress_node]
                while len(walk) != (route_len + 1):
                    walk.append(outgress_node)
                    routing_node = outgress_node

                    route_instances = structure.node[routing_node]["secure_routes"]
                    node_routes = route_instances[instance_index]
                    outgress_node = node_routes[ingress_node]

                    ingress_node = routing_node

                instance_tails.append(walk[-2:])

            tails[node] = instance_tails

        return tails

    def __accept_honests_from_verifiers(self, suspects_tails, verifiers_tails,
            num_instances):
        verified_honests = []
        for verifier in verifiers_tails:
            verifier_honests = []
            tail_counters = [0] * num_instances
            for suspect in suspects_tails:
                overlap = self.__find_tail_intersections(
                    suspects_tails[suspect],
                    verifiers_tails[verifier]
                )
                (accepted, tail_counters) = self.__update_tail_counters(
                    verifiers_tails[verifier],
                    tail_counters,
                    overlap,
                    num_instances
                )
                if accepted:
                    verifier_honests.append(suspect)
            verified_honests.append(verifier_honests)

        return verified_honests

    def __find_tail_intersections(self, suspect_tails, verifier_tails):
        overlap = []
        for tail in suspect_tails:
            if tail in verifier_tails:
                index = verifier_tails.index(tail)
                overlap.append([tail, index])

        return overlap

    def __update_tail_counters(self, verifier_tails, tail_counters,
            overlap, num_instances):
        accepted = False
        if not overlap:
            return (accepted, tail_counters)

        average_load = (1.0 + sum(tail_counters))/(float)(num_instances)

        threshold = self.tail_balance_scalar * max(
            math.log10(num_instances),
            average_load
        )

        relevant_counters = []
        indexes = []
        for (tail, index) in overlap:
            relevant_counters.append(tail_counters[index])
            indexes.append(index)

        min_index = indexes[relevant_counters.index((min(relevant_counters)))]

        if not ((tail_counters[min_index] + 1.0) > threshold):
            accepted = True
            tail_counters[min_index] += 1

        return (accepted, tail_counters)
