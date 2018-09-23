#!/usr/bin/env python
# -*- coding: utf-8 -*-
import sys
sys.path.append('../')
import os
import time
import json
from flask import Flask, session, redirect, url_for, escape, request, make_response
import networkx as nx
import algorithms
from graphs.node import Node
from utils import *

abspath = os.path.abspath(__file__)
dname = os.path.dirname(abspath)
os.chdir(dname)

app = Flask(__name__)
app.secret_key = 'itis secure'


@app.route('/')
def index():
    return redirect('/static/index.html')


def add_sybils(graph, sybils_defenition):
    nodes_dic = {node.name: node for node in graph.nodes()}
    edges = []
    for i, row in enumerate(sybils_defenition.strip().split('\n')):
        edge = row.strip().split()
        edge = [int(node_name) if node_name.isdigit() else node_name for node_name in edge]
        for node_name in edge:
            if node_name not in nodes_dic:
                nodes_dic[node_name] = Node(node_name, 'Sybil', groups=set(['sybils']))
        edges.append((nodes_dic[edge[0]], nodes_dic[edge[1]]))
    graph.add_edges_from(edges)
    sybils = [node for node in nodes_dic.values() if node.node_type=='Sybil']
    for sybil in sybils:
        for neighbour in graph.neighbors(sybil):
            if neighbour.node_type != 'Sybil':
                # neighbour.node_type = 'Attacker'
                neighbour.groups.add('sybils')


@app.route('/set_sybils', methods=['GET', 'POST'])
def set_sybils():
    sybils_defenition = request.form['sybils']
    graph = load_graph('../inputs/graph.json')
    if sybils_defenition:
        add_sybils(graph, sybils_defenition)
    ranker = algorithms.SybilGroupRank(graph, {
        'min_degree': 5,
        'accumulative': False,
        'weaken_under_min': True,
        'nonlinear_distribution': True,
        'group_edge_weight': 2
    })
    ranker.rank()
    output = generate_output(graph)
    json_graph = create_json_object(graph)
    return json.dumps({'success': True, 'graph': json_graph})


if __name__=='__main__':
    app.run(debug=True, host='0.0.0.0', port=5008, threaded=True)
