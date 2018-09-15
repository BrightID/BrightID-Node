import networkx as nx
import collections
import shutil
import pickle
import json
import csv
import os


def write_output_file(outputs, file_name):
    if len(outputs) == 0:
        return
    if not os.path.exists(os.path.dirname(file_name)):
        os.makedirs(os.path.dirname(file_name))
    rows = [['Results']]
    for title in outputs[0]:
        rows.append([title]+[output[title] for output in outputs])

    with open(file_name, 'wb') as f:
        writer = csv.writer(f)
        for row in rows:
            writer.writerow(row)


def find_border(graph):
    best_border = best_score = 0
    for i in range(100):
        honest_score = len([node for node in graph.nodes if node.node_type in (
            'Honest', 'Seed') and node.rank > i])
        sybil_score = len([node for node in graph.nodes if node.node_type in (
            'Sybil', 'Non Bridge Sybil', 'Bridge Sybil') and node.rank < i])
        score = honest_score + sybil_score
        if score >= best_score:
            best_border = i
            best_score = score
    return best_border


def calculate_successful_sybils(ranks_dic):
    honests = []
    sybils = []
    attackers = []
    result = {}
    for category in ranks_dic:
        if category in ['Sybil', 'Non Bridge Sybil', 'Bridge Sybil']:
            sybils.extend(ranks_dic[category])
        elif category in ['Seed', 'Honest']:
            honests.extend(ranks_dic[category])
        elif category == 'Attacker':
            attackers.extend(ranks_dic[category])
    honests.sort(reverse=True)
    for limit in [.8, .9, 1]:
        successful_sybils = [rank for rank in sybils if rank >= min(honests[:int(limit * len(honests))])]
        result['successful_sybils_percent_{0}'.format(limit)] = round((len(successful_sybils) * 100.0) / len(sybils), 2)
    if len(attackers) != 0:
        result['successful_sybils_per_attacker'] = round(float(len(successful_sybils)) / len(attackers), 2)
    else:
        result['successful_sybils_per_attacker'] = '__'
    return result


def generate_output(graph):
    categories = set([node.node_type for node in graph.nodes])
    ranks_dic = {}
    for category in categories:
        ranks_dic[category] = [node.rank for node in graph.nodes if node.node_type == category]
    output = collections.OrderedDict()
    successful_sybils = calculate_successful_sybils(ranks_dic)
    output['Successful Sybils Percentage'] = successful_sybils['successful_sybils_percent_1']
    output['Successful Sybils Percentage (-10 percent of honests)'] = successful_sybils['successful_sybils_percent_0.9']
    output['Successful Sybils Percentage (-20 percent of honests)'] = successful_sybils['successful_sybils_percent_0.8']
    output['Successful Sybils per Attacker'] = successful_sybils['successful_sybils_per_attacker']
    output['Border'] = find_border(graph)
    output[' '] = ' '
    view_order = ('Seed', 'Honest', 'Attacker', 'Bridge Sybil', 'Non Bridge Sybil', 'Sybil')
    for category in view_order:
        if category not in categories:
            continue
        for parameter in ['Max', 'Avg', 'Min']:
            if len(ranks_dic[category]) == 0:
                v = '__'
            elif parameter == 'Min':
                v = min(ranks_dic[category])
            elif parameter == 'Avg':
                v = sum(ranks_dic[category]) / len(ranks_dic[category])
            elif parameter == 'Max':
                v = max(ranks_dic[category])
            output['{0} {1}'.format(parameter, category)] = v
    return output


def create_json_object(graph):
    json_dic = {
        'graph': [],
        'links': [],
        'nodes':[],
        'directed': False,
        'multigraph': False,
    }
    json_dic['nodes'] = [{"size": 1, "node_type": node.node_type, "id": node.name, "type": "circle", 'groups': list(node.groups), 'rank': node.rank} for node in graph.nodes]
    positions = {}
    for i, node in enumerate(json_dic['nodes']):
        positions[node['id']] = i
    json_dic['links'] = [{"source": positions[edge[0].name], "target": positions[edge[1].name]} for edge in graph.edges]
    return json.dumps(json_dic)


def save_graph(file_name, graph):
    with open(file_name, 'wb') as f:
        f.write(json.dumps(graph))
    return True


def load_graph(file_name):
    with open(file_name, 'rb') as f:
        graph = json.loads(f)
    return graph

TEMPLATE = None
def draw_graph(graph, file_name):
    global TEMPLATE
    if not TEMPLATE:
        with open('template.html') as f:
            TEMPLATE = f.read()
    if not os.path.exists(os.path.dirname(file_name)):
        os.makedirs(os.path.dirname(file_name))
    json_dic = create_json_object(graph)
    edited_string = TEMPLATE.replace('JSON_GRAPH', json_dic)
    with open(file_name, 'wb') as output_file:
        output_file.write(edited_string)


def reset_ranks(graph):
    for node in graph.nodes():
        node.rank = 0
