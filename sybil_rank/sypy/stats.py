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
import numpy as np
import math
import sypy

class Stats():

    def __init__(self, graph):
        self.graph = graph

        self.order = self.graph.order()
        self.size = self.graph.size()
        self.is_directed = self.graph.structure.is_directed()

        cc = nx.connected_components(self.graph.structure)
        self.num_cc = len(cc)
        self.is_connected = (self.num_cc == 1)

    def largest_connected_component(self):
        cc = nx.connected_components(self.graph.structure)
        lcc_structure = self.graph.structure.subgraph(
            max(cc, key=len)
        )

        lcc_graph = sypy.CustomGraph(lcc_structure)
        return lcc_graph

    def clustering_coefficient(self):
        if not self.is_connected:
            raise Exception("Graph is not connected")
        return nx.average_clustering(self.graph.structure)

    def transitivity(self):
        if not self.is_connected:
            raise Exception("Graph is not connected")
        return nx.transitivity(self.graph.structure)

    def diameter(self):
        if not self.is_connected:
            raise Exception("Graph is not connected")
        return nx.diameter(self.graph.structure)

    def radius(self):
        if not self.is_connected:
            raise Exception("Graph is not connected")
        return nx.radius(self.graph.structure)

    def normalized_conductance(self, subgraph, edge_cover=False):
        """
        Returns the normalized conductance of the graph over the given
        subgraph as described in You Are Who You Know: Inferring User Profiles
        in Online Social Networks, Mislove et al., WSDM, 2010.
        If specified, the implementation also returns the edge cover of the
        subgraph (i.e., the edges in the graph incident to the subgraph).
        """
        if not isinstance(subgraph, sypy.BaseGraph):
            raise Exception("Invalid graph")

        if not nx.is_connected(subgraph.structure):
            raise Exception("Subgraph is disconnected")

        in_edges = subgraph.edges()
        other_edges = list(
            set(self.graph.edges()) - set(in_edges)
        )

        shared_edges = []
        for (left_node, right_node) in other_edges:
            if left_node in subgraph.structure or\
                    right_node in subgraph.structure:
                shared_edges.append(
                    (left_node, right_node)
                )

        out_edges = list(
            set(other_edges) - set(shared_edges)
        )
        inshared_edges = list(
            set(in_edges) | set(shared_edges)
        )

        subgraph_conductance = self.__compute_subgraph_conductance(
            len(in_edges),
            len(shared_edges)
        )
        randgraph_conductance = self.__compute_randgraph_conductance(
            len(inshared_edges),
            len(other_edges)
        )
        norm_conductance = subgraph_conductance - randgraph_conductance

        if not edge_cover:
            return norm_conductance

        return (norm_conductance, shared_edges)

    def __compute_subgraph_conductance(self, num_in, num_shared):
        return num_in / (float)(num_in + num_shared)

    def __compute_randgraph_conductance(self, num_inshared, num_other):
        sqrd_inshared = num_inshared * num_inshared
        sqrd_other = num_other * num_other
        return sqrd_inshared / (float)(sqrd_inshared + sqrd_other)

    def mixing_time(self, variation_distance=None,
            variation_distance_scaler=1.0, lcc_only=False):
        """
        Returns the upper and the lower bounds for the mixing time of the
        graph parameterized by its variation distance. The approach computes
        the Second Largest Eigenvalue Modulus (SLEM) of the graph's transition
        matrix and calculates the bounds as described in Measuring the Mixing
        Time of Social Graphs, Mohaisen et al., IMC'10 (2010).
        """
        structure = self.graph.structure
        if self.num_cc != 1:
            if lcc_only:
                structure = self.graph.structure.subgraph(self.lcc)
            else:
                raise Exception("Graph is disconnected")

        if not variation_distance:
            variation_distance = variation_distance_scaler /\
                (float)(math.log10(structure.order()))

        if variation_distance < 0.0 or variation_distance > 1.0:
            raise Exception("Invalid variation distance value")

        adj_matrix = nx.to_numpy_matrix(structure)
        matrix_dim = adj_matrix.shape

        trans_matrix = np.empty(matrix_dim)
        for row in xrange(matrix_dim[0]):
            node_degree = adj_matrix[row].sum()
            if node_degree == 0:
                raise Exception("The graph has disconnected components")
            for col in xrange(matrix_dim[1]):
                trans_matrix[row,col] = adj_matrix[row, col]/(float)(node_degree)

        eigen_vals = np.linalg.eigvalsh(trans_matrix)
        second_largest = math.fabs(np.sort(eigen_vals)[-2])

        upper_bound = (math.log10(structure.order()) +\
            math.log10(1.0/(float)(variation_distance))) /\
                (float)(1.0 - second_largest)

        lower_bound = second_largest / (float)(2.0 * (1.0 - second_largest)) *\
                (math.log10(1.0 / (float)(2.0 * variation_distance)))

        return (lower_bound, upper_bound)

    def connected_components(self):
        """
        Returns basic statistics about the connected components of the
        graph. This includes their number, order, size, diameter, radius,
        average clusttering coefficient, transitivity, in addition to basic
        info about the largest and smallest connected components.
        """
        cc_stats = {}
        cc = nx.connected_components(self.graph.structure)

        for index, component in enumerate(cc):
            cc_stats[index] = {}
            this_cc = cc_stats[index]

            this_cc["order"] = len(component)
            this_cc["size"] = len(
                self.graph.structure.edges(component)
            )

            subgraph = self.graph.structure.subgraph(component)
            this_cc["avg_cluster"] = nx.average_clustering(subgraph)
            this_cc["transitivity"] = nx.transitivity(subgraph)

            eccentricity = nx.eccentricity(subgraph)
            ecc_values = eccentricity.values()
            this_cc["diameter"] = max(ecc_values)
            this_cc["radius"] = min(ecc_values)

        return cc_stats

    def modularity(self, partitions):
        """
        Returns the modularity of the graph using the given partitioning as
        described in Finding and Evaluating Community Structure in Networks,
        Newman et al., Phys. Rev. (69), 2004.
        """
        for partition in partitions:
            valid_partition = set(partition).issubset(
                set(self.graph.nodes())
            )
            if not valid_partition:
                raise Exception("Invalid partition")

        total_degree = sum(
            self.graph.structure.degree().values()
        )

        modularity = 0.0
        for partition in partitions:
            partition_graph = self.graph.structure.subgraph(partition)
            inpartition_degree = sum(
                partition_graph.degree().values()
            )

            partition_degree = sum(
                self.graph.structure.degree(partition).values()
            )

            modularity += (
                ( inpartition_degree / (float)(total_degree) ) -\
                ( (partition_degree)**2 / (float)(total_degree)**2 )
            )

        return modularity

    def louvain_communities(self, max_level=1, threshold=0.0, best=True):
        """
        Returns a dendogram of best communitiy partitioning in the graph using
        the Louvain method as described in Fast Unfolding of Communities in
        Large Networks, Blondel et al., J. of Stat. Mech. (10), 2008.
        For modularity gain, the implementation uses the definition described
        in Multilevel Local Search Algorithms for Modularity Clustering,
        Rotta et al., J. Exp. Algorithmics (16), 2011.
        """
        level = 0
        dendogram = {}
        structure = self.graph.structure

        dendogram[level] = dict(
            (node, [node]) for node in structure
        )
        dendogram_changed = True

        edge_weights = dict(
            (edge, 1) for edge in structure.edges()
        )
        nx.set_edge_attributes(structure, "weight", edge_weights)

        while True:
            comms = self.__optimize_modularity(
                structure,
                threshold
            )

            (dendogram, dendogram_changed) = self.__add_communities(
                comms,
                dendogram,
                level
            )

            if not dendogram_changed:
                break

            level = level + 1
            if level == max_level:
                break

            structure = self.__aggregate_communities(
                structure,
                dendogram[level]
            )

        if best:
            best_comms = self.__get_best_partitioning(dendogram)
            return best_comms

        return dendogram

    def __optimize_modularity(self, structure, threshold):
        node_comms = dict(
            (node, node) for node in structure
        )
        comm_changes = structure.order()

        while comm_changes != 0:

            comm_changes = 0
            for node in structure:
                neighbors = list(
                    set(structure.neighbors(node)) - set([node])
                )
                node_comm = node_comms[node]
                comms = self.__index_by_comm(node_comms)

                max_gain = 0.0
                checked_comms = []
                for neighbor in neighbors:
                    neighbor_comm = node_comms[neighbor]
                    if neighbor_comm in checked_comms or\
                            neighbor_comm == node_comm:
                        continue

                    gain = self.__compute_modularity_gain(
                        node,
                        comms[node_comm],
                        comms[neighbor_comm],
                        structure
                    )
                    checked_comms.append(neighbor_comm)

                    if gain > (max_gain + threshold):
                        max_gain = gain
                        best_comm = neighbor_comm

                if max_gain > 0.0:
                    node_comms[node] = best_comm
                    comm_changes = comm_changes + 1

        comms = self.__index_by_comm(node_comms)
        return comms

    def __index_by_comm(self, node_comms):
        comms = {}
        for node, comm_index in node_comms.iteritems():
            comms.setdefault(comm_index, []).append(node)

        return comms

    def __compute_modularity_gain(self, node, old_comm, new_comm, structure):
        neighbors = list(
            set(structure.neighbors(node)) - set([node])
        )

        in_weight = 0
        out_weight = 0

        for neighbor in neighbors:
            if neighbor in old_comm:
                in_weight += structure[node][neighbor]["weight"]
            if neighbor in new_comm:
                out_weight += structure[node][neighbor]["weight"]

        total_degree = sum(
            structure.degree(weight="weight").values()
        )

        node_degree = structure.degree(node, weight="weight")

        ncomm_degree = sum(
            structure.degree(new_comm, weight="weight").values()
        )

        ocomm_degree = sum(
            structure.degree(
                list(
                    set(old_comm) - set([node])
                ),
                weight="weight"
            ).values()
        )

        int_diff = (2*out_weight - 2*in_weight) / (float)(total_degree)
        ext_diff = (2*node_degree*ncomm_degree - 2*node_degree*ocomm_degree) /\
            (float)(total_degree)**2

        gain = int_diff - ext_diff
        return gain


    def __add_communities(self, comms, dendogram, level):
        dendogram_changed = False
        last_comms = dendogram[level]

        new_comms = {}
        for comm_index, comm in comms.iteritems():
            new_comm = []
            for comm_node in comm:
                new_comm += last_comms[comm_node]
            new_comms[comm_index] = new_comm

        if new_comms != last_comms:
            dendogram_changed = True
            dendogram[level+1] = new_comms

        return (dendogram, dendogram_changed)

    def __aggregate_communities(self, structure, new_comms):
        new_structure = nx.Graph()
        for comm_index in new_comms.keys():
            new_structure.add_node(comm_index)

        for comm_index in new_structure:
            comm_graph = structure.subgraph(new_comms[comm_index])
            for another_index in new_structure:
                if comm_index == another_index:
                    new_structure.add_edge(
                        comm_index,
                        comm_index,
                        weight=comm_graph.size(weight="weight")
                    )
                else:
                    another_graph = structure.subgraph(new_comms[another_index])
                    num_shared = self.__get_num_intercomm_edges(
                        structure,
                        comm_graph,
                        another_graph
                    )
                    if num_shared > 0:
                        new_structure.add_edge(
                            comm_index,
                            another_index,
                            weight=num_shared
                        )

        return new_structure

    def __get_num_intercomm_edges(self, structure, comm_graph, another_graph):
        other_edges = list(
            set(structure.edges()) -\
            set(comm_graph.edges()) -\
            set(another_graph.edges())
        )

        num_shared = 0.0
        for (left_node, right_node) in other_edges:
            if (left_node in comm_graph and right_node in another_graph) or\
                    (left_node in another_graph and right_node in comm_graph):
                num_shared = num_shared + 1.0

        return num_shared

    def __get_best_partitioning(self, dendogram, relabel=True):
        max_modularity = -0.5
        best_comms = {}
        stats = self.graph.get_graph_stats()
        for level, comms in dendogram.iteritems():
            partitions = comms.values()
            modularity = stats.modularity(partitions)
            if modularity > max_modularity:
                max_modularity = modularity
                best_comms = comms

        if relabel:
            relabeled_comms = {}
            for index, comm in enumerate(best_comms.values()):
                relabeled_comms[index] = comm
            return relabeled_comms

        return best_comms


