import networkx as nx
import matplotlib.pyplot as plt


def visualize(graph, categories, labels = None, filename = None, file_format="svg"):
    layout = nx.spring_layout(graph)
    # layout = nx.kamada_kawai_layout(graph)
    handles = []
    for category in categories:
        handle = nx.draw_networkx_nodes(
            graph,
            layout,
            nodelist=categories[category]['nodes'],
            node_size=50,
            node_color=categories[category]['color'],
            alpha=0.6
        )
        handle.set_label(category)
        handles.append(handle)

    nx.draw_networkx_edges(
        graph,
        layout,
        edge_color="green",
        alpha=0.5
    )

    if labels:
        nx.draw_networkx_labels(graph, layout, labels, font_size=4)

    plt.legend(
        handles,
        categories.keys(),
        scatterpoints=1
    )
    plt.axis('off')

    if filename:
        plt.savefig(
            "{0}.{1}".format(filename, file_format),
            format=file_format
        )
        plt.clf()
    else:
        plt.show()
