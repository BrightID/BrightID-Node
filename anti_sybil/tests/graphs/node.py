class Node():
    def __init__(self, name, node_type, groups=None, rank=None):
        self.name = name
        self.node_type = node_type
        self.rank = rank
        self.groups = groups if groups else set()

    def __repr__(self):
        return str(self.name)

