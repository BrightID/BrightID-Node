import matplotlib.pyplot as plt
import networkx as nx
from utils import *
import collections
import algorithms
import datasets
import shutil
import pickle
import csv
import os
import pprint
import json

def read_input_file(input_file):
    inputs = collections.OrderedDict()
    with open(input_file, 'rb') as csvfile:
        rows = [row.strip().split(',')
                for row in csvfile.read().strip().split('\n')]
    for row in rows:
        for col_num, cell in enumerate(row):
            if col_num == 0:
                continue
            if col_num not in inputs:
                inputs[col_num] = collections.OrderedDict()
            inputs[col_num][row[0]] = eval(row[col_num])
    return inputs


def find_border(result):
    best_border = best_score = 0
    for i in range(100):
        honest_score = len([node for node in result if node.node_type in (
            'Honest', 'Seed') and result[node] > i])
        sybil_score = len([node for node in result if node.node_type in (
            'Sybil', 'Non Bridge Sybil', 'Bridge Sybil') and result[node] < i])
        score = honest_score + sybil_score
        if score >= best_score:
            best_border = i
            best_score = score
    return best_border


def write_output_file(output_directory, final_results, input_dic, algorithms_row):
    rows = collections.OrderedDict()
    rows['Inputs'] = ['Inputs', '']
    rows['Algorithm'] = algorithms_row
    for test_num in input_dic:
        for title in input_dic[test_num]:
            if test_num == 1:
                rows[title] = [title]
            rows[title].append(input_dic[test_num][title])
    rows['  '] = []
    rows['Results'] = ['Results', '']
    for i, result in enumerate(final_results):
        for title in final_results[result]:
            if i == 0:
                rows[title] = [title]
            rows[title].append(final_results[result][title])
    with open(os.path.join(output_directory, 'result.csv'), 'wb') as f:
        writer = csv.writer(f)
        for row in rows:
            writer.writerow(rows[row])


def calculate_successful_sybils(ranks_dic):
    honests = []
    sybils = []
    attackers = []
    for category in ranks_dic:
        if category in ['Sybil', 'Non Bridge Sybil', 'Bridge Sybil']:
            sybils.extend(ranks_dic[category])
        elif category in ['Seed', 'Honest']:
            honests.extend(ranks_dic[category])
        elif category == 'Attacker':
            attackers.extend(ranks_dic[category])
    successful_sybils = [rank for rank in sybils if rank >= min(honests)]
    successful_sybils_percent = round((len(successful_sybils) * 100.0) / len(sybils), 2)
    if len(attackers) != 0:
        successful_sybils_per_attacker = round(float(len(successful_sybils)) / len(attackers), 2)
    else:
        successful_sybils_per_attacker = '__'
    return successful_sybils_percent, successful_sybils_per_attacker


def prepare_result(result, categories, normalization_ratio):
    view_order = collections.OrderedDict([
        ('Seed', ['Min', 'Normalized Min', 'Avg', 'Normalized Max', 'Max']),
        ('Honest', ['Min', 'Normalized Min', 'Avg', 'Normalized Max', 'Max']),
        ('Attacker', ['Min', 'Normalized Min', 'Avg', 'Normalized Max', 'Max']),
        ('Bridge Sybil', ['Min', 'Normalized Min', 'Avg', 'Normalized Max', 'Max']),
        ('Non Bridge Sybil', ['Min', 'Normalized Min', 'Avg', 'Normalized Max', 'Max']),
        ('Sybil', ['Min', 'Normalized Min', 'Avg', 'Normalized Max', 'Max'])
    ])

    final_result = collections.OrderedDict()
    ranks_dic = {category: [
        result[node] for node in categories[category]['nodes']] for category in categories}

    successful_sybils_percent, successful_sybils_per_attacker = calculate_successful_sybils(
        ranks_dic)

    final_result['Successful Sybils Percentage'] = successful_sybils_percent
    final_result['Successful Sybils per Attacker'] = successful_sybils_per_attacker
    final_result['Border'] = find_border(result)
    final_result[' '] = ' '
    for category in view_order:
        if category not in categories:
            continue
        cut_point = int(len(ranks_dic[category]) * normalization_ratio)
        if cut_point:
            cutted_list = ranks_dic[category][cut_point: -cut_point]
        else:
            cutted_list = ranks_dic[category]

        for parameter in view_order[category]:
            if len(ranks_dic[category]) == 0:
                final_result['{0} {1}'.format(parameter, category)] = '__'
            elif parameter == 'Min':
                final_result['{0} {1}'.format(parameter, category)] = min(
                    ranks_dic[category])
            elif parameter == 'Avg':
                final_result['{0} {1}'.format(parameter, category)] = sum(
                    ranks_dic[category]) / len(ranks_dic[category])
            elif parameter == 'Max':
                final_result['{0} {1}'.format(parameter, category)] = max(
                    ranks_dic[category])
            elif parameter == 'Normalized Min':
                final_result['{0} {1}'.format(
                    parameter, category)] = min(cutted_list)
            elif parameter == 'Normalized Max':
                final_result['{0} {1}'.format(
                    parameter, category)] = max(cutted_list)
    return final_result


def save_graph(file_name, graph, categories):
    with open('1_{0}'.format(file_name), 'wb') as f:
        pickle.dump(graph, f)
    with open('2_{0}'.format(file_name), 'wb') as f:
        pickle.dump(categories, f)


def load_graph(file_name):
    with open('1_{0}'.format(file_name), 'rb') as f:
        graph = pickle.load(f)
    with open('2_{0}'.format(file_name), 'rb') as f:
        categories = pickle.load(f)
    return graph, categories


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


def run(dataset, algorithms, input_file, output_directory):
    input_dic = read_input_file(input_file)
    if os.path.exists(output_directory):
        shutil.rmtree(output_directory)
    os.makedirs(output_directory)
    final_results = collections.OrderedDict()
    test_num = 0
    edited_input_dict = {}
    algorithms_row = ['Algorithm']
    for data_num in input_dic:
        graph, categories = dataset.init(input_dic[data_num])
        for algorithm in algorithms:
            algorithms_row.append(algorithms.index(algorithm))
            test_num += 1
            edited_input_dict[test_num] = input_dic[data_num]
            options = {}
            options['min_degree'] = input_dic[data_num].get('min_degree', 1)
            options['accumulative'] = input_dic[data_num].get('accumulative', False)
            options['weaken_under_min'] = input_dic[data_num].get('weaken_under_min', False)
            options['group_edge_weight'] = input_dic[data_num].get('group_edge_weight', 1)
            detector = algorithm.Detector(
                graph, categories['Seed']['nodes'], options)
            result = detector.detect()
            for node in graph.nodes:
                node.rank = result[node]
            final_results[test_num] = prepare_result(
                result, categories, input_dic[data_num]['normalization_ratio'])
            if input_dic[data_num]['visualize']:
                json_dic = create_json_object(graph)
                with open('./template.html', 'rb') as temp_file:
                    temp_string = temp_file.read()
                edited_string = temp_string.replace('JSON_GRAPH', json_dic)
                with open(os.path.join(output_directory, '{0}.html'.format(test_num)), 'wb') as output_file:
                    output_file.write(edited_string)
                # visualize(graph, categories, result, output_directory, test_num)
            print('test {0} finished'.format(test_num))
    write_output_file(output_directory, final_results, edited_input_dict, algorithms_row)


if __name__ == '__main__':
    # run(datasets.cut_region_test, [algorithms.sybil_rank], './inputs/cut_region_test.csv', './outputs/tests1/')
    # run(datasets.no_groups_test,[algorithms.sybil_rank], './inputs/no_groups_test.csv', './outputs/tests2/')
    run(datasets.groups_test, [algorithms.groups_sybil_rank, algorithms.sybil_rank], './inputs/groups_test.csv', './outputs/tests1/')