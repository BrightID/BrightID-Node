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

import random
import networkx as nx
import matplotlib.pyplot as plt
import sypy

class Region:

    def __init__(self, graph, name, is_sybil=False, seed=None):
        self.graph = graph
        self.name = name
        self.is_sybil = is_sybil

        self.seed = seed
        if self.seed:
            random.seed(self.seed)

        self.known_honests = None

    def get_region_stats(self):
        return sypy.Stats(self.graph)

    def pick_random_honest_nodes(self, num_nodes=1):
        self.__setup_honest_nodes(num_nodes)

        self.known_honests = random.sample(
            self.graph.nodes(),
            num_nodes
        )

    def pick_connected_random_honest_nodes(self, num_nodes=1):
        self.__setup_honest_nodes(num_nodes)

        self.known_honests = [random.choice(self.graph.nodes())]
        while len(self.known_honests) != num_nodes:
            neighbors = list(
                set(self.graph.structure.neighbors(self.known_honests[-1])) -\
                set(self.known_honests)
            )

            some_neighbors = random.sample(
                neighbors,
                random.randint(1, len(neighbors))
            )

            if len(self.known_honests) + len(some_neighbors) > num_nodes:
                diff = num_nodes - len(self.known_honests)
                some_neighbors = some_neighbors[0:diff]

            self.known_honests += some_neighbors

    def __setup_honest_nodes(self, num_nodes):
        if self.is_sybil:
            raise Exception("Cannot pick honest nodes in a Sybil region")

        if num_nodes > self.graph.order():
            raise Exception("Too many honest nodes to pick")

        if num_nodes < 1:
            raise Exception("Too few honest nodes to pick")

    def visualize(self, file_name=None, file_format="pdf"):
        layout = nx.spring_layout(self.graph.structure)

        node_color = "green"
        label = "Honest"
        if self.is_sybil:
            node_color = "red"
            label = "Sybil"

        handles = []
        nodes_handle = nx.draw_networkx_nodes(
            self.graph.structure,
            layout,
            node_size=150,
            node_color=node_color
        )
        nodes_handle.set_label(label)
        handles.append(nodes_handle)

        if not self.is_sybil:
            known_handle = nx.draw_networkx_nodes(
                self.graph.structure,
                layout,
                nodelist=self.known_honests,
                node_color="orange",
                node_size=150
            )
            known_handle.set_label("Known")
            handles.append(known_handle)

        nx.draw_networkx_edges(
            self.graph.structure,
            layout,
            edge_color="black",
            alpha=0.5
        )

        labels = [handle.get_label() for handle in handles]
        plt.legend(
            handles,
            labels,
            scatterpoints=1
        )
        plt.title("{0}".format(self.name))
        plt.axis('off')

        if file_name:
            plt.savefig(
                "{0}.{1}".format(file_name, file_format),
                format=file_format
            )
            plt.clf()
        else:
            plt.show()
