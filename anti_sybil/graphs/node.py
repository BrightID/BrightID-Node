class Node:
    def __init__(self, name, node_type, groups=None, rank=None, raw_rank=None, degree=None):
        self.name = name
        self.node_type = node_type
        self.rank = rank
        self.groups = groups if groups else set()
        self.raw_rank = raw_rank
        self.degree = degree

    def __repr__(self):
        return str(self.name)
