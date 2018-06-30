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

from scipy.stats import powerlaw

import numpy as np
import networkx as nx
import random
import sypy

class BaseGraph:

    def __init__(self):
        self.structure = nx.Graph()

    def nodes(self, node_data=False):
        return self.structure.nodes(data=node_data)

    def edges(self, edge_data=False):
        return self.structure.edges(data=edge_data)

    def order(self):
        return self.structure.order()

    def size(self, weight=None):
        return self.structure.size(weight=weight)

    def get_graph_stats(self):
        return sypy.Stats(self)

    def export_to_gexf_file(self, file_path, compressed=True):
        if compressed:
            file_path = "{0}.{1}".format(file_path, "gz")

        nx.write_gexf(self.structure, file_path)


class CustomGraph(BaseGraph):

    def __init__(self, structure):
        BaseGraph.__init__(self)
        self.structure = structure


class ImportedGEXFGraph(BaseGraph):
    """
    Generates a graph from an existing dataset in the standard Graph
    Extensible XML Format (GEXF). The GEXF format defines an XML schema
    for describing complex networks structures, their associated data,
    and dynamics.
    """
    def __init__(self, file_path):
        BaseGraph.__init__(self)
        self.file_path = file_path
        self.__update_structure()

    def __update_structure(self):
        imported_graph = nx.read_gexf(self.file_path)

        if not isinstance(imported_graph, nx.Graph):
            raise Exception("Imported graph is not undirected")

        self.structure = nx.convert_node_labels_to_integers(imported_graph)

    def lcc_degree_filter(self, num_iterations=3, degree_ratio=0.1):
        """
        Keep only the Largest Connected Component (LCC) and try to
        remove all outlier nodes that have exactly one neighbor
        """

        cc = nx.connected_component_subgraphs(self.structure)
        self.structure = max(cc, key=len)

        for trial in xrange(num_iterations):
            to_remove = []
            for node in self.structure:
                if self.structure.degree(node) == 1:
                    to_remove.append(node)

            current_ratio = len(to_remove)/(float)(self.structure.order())
            if current_ratio < degree_ratio:
                break

            for node in to_remove:
                self.structure.remove_node(node)


class ZacharyKarateClubGraph(BaseGraph):
    """
    Generates Zachary's Karate club graph as described in An information Flow
    Model for Conflict and Fission in Small Groups, Zachary et al., J. Anthro.
    Research, 33, 452-473, 1977.
    In this graph, the players are clusted into two clubs after some dispute,
    which can be tested using the 'club' node attribute.
    """
    def __init__(self):
        BaseGraph.__init__(self)
        self.structure = nx.karate_club_graph()


class FlorentineFamiliesGraph(BaseGraph):
    """
    Generates the Florentine Families graph as described in Cumulated Social
    Roles: The Duality of Persons and their Algebras, Breiger et al., Social
    Networks, Vol 8(3), 215-256, 1986.
    """
    def __init__(self):
        BaseGraph.__init__(self)
        self.structure = nx.florentine_families_graph()


class CompleteGraph(BaseGraph):

    def __init__(self, num_nodes):
        BaseGraph.__init__(self)
        self.num_nodes = num_nodes
        self.structure = nx.complete_graph(self.num_nodes)


class SmallWorldGraph(BaseGraph):

    def __init__(self, num_nodes, node_degree, rewire_prob, tries=100, seed=None):
        BaseGraph.__init__(self)
        self.num_nodes = num_nodes
        self.node_degree = node_degree
        self.rewire_prob = rewire_prob
        self.tries = tries
        self.seed = seed
        self.structure = nx.connected_watts_strogatz_graph(
            self.num_nodes,
            self.node_degree,
            self.rewire_prob,
            self.tries,
            self.seed
        )


class PowerLawGraph(BaseGraph):

    def __init__(self, num_nodes, node_degree, prob_triad, seed=None):
        self.num_nodes = num_nodes
        self.node_degree = node_degree
        self.prob_triad = prob_triad
        self.seed = seed
        self.__update_structure()

    def __update_structure(self):
        self.structure = nx.powerlaw_cluster_graph(
            self.num_nodes,
            self.node_degree,
            self.prob_triad,
            self.seed
        )

        if nx.is_connected(self.structure):
            return

        components = nx.connected_components(self.structure)

        biggest_comp = []
        comp_index = -1
        for i, component in enumerate(components):
            if len(component) > len(biggest_comp):
                biggest_comp = component
                comp_index = i

        if self.seed:
            random.seed(self.seed)

        del components[comp_index]
        for component in components:
            for left_node in component:
                right_node = random.choice(biggest_comp)
                self.structure.add_edge(left_node, right_node)


class GirvanNewmanCommunityGraph(BaseGraph):
    """
    Grenerates a Grivan-Newman random graph with configurable community
    structure. The implementation is adapted from Community Structure in
    Social and Biological Network, Girvan et al. PNAS June, Vol 99(12), 2002.
    This is a special case of the planted l-partition model proposed in
    Algorithms for Graph Partitioning on the Planted Partition Model,
    Condon et al. J. Random Structures and Algorithms, Vol 18, 2001

    Note: For large number of communities with small community size, the
    average number of inter-community edges per node (avg_intercomm) should
    be small and close to 0. The default values are those used by Grivan et al.
    in their original work, and they guarantee the generaiton of a graph with
    well-defined community structure.
    """
    def __init__(self, num_comm=4, comm_size=32, avg_intercomm=1, seed=None):
        BaseGraph.__init__(self)
        self.num_comm = num_comm
        self.comm_size = comm_size
        self.avg_intercomm = avg_intercomm
        self.seed = seed
        self.__update_structure()

    def __update_structure(self):
        if self.seed:
            random.seed(self.seed)

        prob_out = self.avg_intercomm /\
            (float)(self.comm_size * (self.num_comm - 1))
        prob_in = 0.5 - (float)(self.avg_intercomm / self.comm_size)

        self.structure.add_nodes_from(range(self.num_comm * self.comm_size))

        for left_node in self.structure.nodes():
            nx.set_node_attributes(
                self.structure,
                "community",
                {left_node: left_node % self.num_comm}
            )
            for right_node in self.structure.nodes():
                if left_node < right_node:
                    rand = random.random()
                    if left_node % self.num_comm == right_node % self.num_comm:
                        if rand <= prob_in:
                            self.structure.add_edge(
                                left_node,
                                right_node
                            )
                    else:
                        if rand <= prob_out:
                            self.structure.add_edge(
                                left_node,
                                right_node
                            )


class LFRCommunityGraph(BaseGraph):
    """
    Generates LFR-Benchmark random graph with overlapping community structure
    as described in Benchmark Graphs for Testing Community Detection Algorithms,
    Lancichinetti et al., Phys. Rev., Vol 78(4), 2008.
    In this graph, the community sizes and community degrees are power-law,
    unlike the classical Girvan-Newman graphs, where communities have similar
    size and each community is an Erdos-Renyi random graph.
    """
    def __init__(self, num_comm=4, max_comm=100, comm_exp=1.5, max_degree=10,
        degree_exp=1.5, mixing_par=0.075, tries=3, seed=None
    ):
        BaseGraph.__init__(self)
        self.num_comm = num_comm
        self.max_comm = max_comm
        self.comm_exp = comm_exp
        self.max_degree = max_degree
        self.degree_exp = degree_exp
        self.mixing_par = mixing_par
        self.tries = tries
        self.seed = seed
        self.__update_structure()

    def __update_structure(self):
        if self.seed:
            random.seed(seed)
            np.random.seed(seed)

        comm_sizes = self.__get_community_sizes()
        self.structure.add_nodes_from(range(sum(comm_sizes)))

        try:
            self.__construct_communities(comm_sizes)
            self.__connect_communities(comm_sizes)

        except ValueError, error:
            if self.tries != 0:
                print "{0}, retrying".format(error)
                self.tries -= 1
                self.__update_structure()
            else:
                raise Exception("{0}. Change seed or inputs".format(error))

    def __construct_communities(self, comm_sizes):
        for i, comm_size in enumerate(comm_sizes):
            comm_degrees = self.__get_community_degrees(comm_size)
            comm_nodes = range(
                sum(comm_sizes[:i]),
                sum(comm_sizes[:i+1])
            )
            nx.set_node_attributes(
                self.structure,
                "community",
                dict([node, i] for node in comm_nodes)
            )
            for j, node in enumerate(comm_nodes):
                node_degree = np.ceil(
                    comm_degrees[j] * (1 - self.mixing_par)
                )
                node_neighbors = random.sample(
                    set(comm_nodes) - set([node]),
                    int(node_degree)
                )
                node_edges = [(node, neighbor) for neighbor in node_neighbors]
                self.structure.add_edges_from(node_edges)

    def __connect_communities(self, comm_sizes):
        for i, comm_size in enumerate(comm_sizes):
            comm_nodes = range(
                sum(comm_sizes[:i]),
                sum(comm_sizes[:i+1])
            )
            other_nodes = list(
                set(self.structure.nodes()) - set(comm_nodes)
            )
            for j, node in enumerate(comm_nodes):
                node_degree = np.floor(
                    self.structure.degree(node) *\
                        (self.mixing_par/(1 - self.mixing_par))
                )
                node_neighbors = random.sample(
                    other_nodes,
                    int(node_degree)
                )
                node_edges = [(node, neighbor) for neighbor in node_neighbors]
                self.structure.add_edges_from(node_edges)

    def __get_community_sizes(self):
        rvs = powerlaw.rvs(
            self.comm_exp,
            size=self.num_comm
        )

        comm_sizes = [int(size) for size in (rvs * self.max_comm)]
        return comm_sizes

    def __get_community_degrees(self, comm_size):
        rvs = powerlaw.rvs(
            self.degree_exp,
            size=comm_size
        )

        comm_degrees = [int(degree) for degree in (rvs * self.max_degree)]
        return comm_degrees
