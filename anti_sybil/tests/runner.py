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


def write_output_file(output_directory, final_results, input_dic):
    rows = collections.OrderedDict()
    rows['Inputs'] = ['Inputs', '']
    for test_num in input_dic:
        for title in input_dic[test_num]:
            if test_num == 1:
                rows[title] = [title]
            rows[title].append(input_dic[test_num][title])
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
    for category in ranks_dic:
        if category in ['Sybil', 'Non Bridge Sybil', 'Bridge Sybil']:
            sybils.extend(ranks_dic[category])
        if category in ['Seed', 'Honest']:
            honests.extend(ranks_dic[category])
    high_ranked_sybils = [rank for rank in sybils if rank > min(honests)]
    successful_sybils = (len(high_ranked_sybils) * 100) / \
        (len(high_ranked_sybils) + len(honests))
    return successful_sybils


def prepare_result(result, categories, normalization_ratio):
    view_order = collections.OrderedDict([
        ('Seed', ['Avg', 'Normalized Min', 'Min']),
        ('Honest', ['Avg', 'Normalized Min', 'Min']),
        ('Attacker', ['Max', 'Normalized Max', 'Avg']),
        ('Bridge Sybil', ['Max', 'Normalized Max', 'Avg']),
        ('Non Bridge Sybil', ['Max', 'Normalized Max', 'Avg']),
        ('Sybil', ['Max', 'Normalized Max', 'Avg'])
    ])

    final_result = collections.OrderedDict()
    ranks_dic = {category: [
        result[node] for node in categories[category]['nodes']] for category in categories}

    final_result['Successful Sybils Percentage'] = calculate_successful_sybils(
        ranks_dic)
    final_result['Border'] = find_border(result)

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


def run(dataset, algorithm, input_file, output_directory):
    input_dic = read_input_file(input_file)
    if os.path.exists(output_directory):
        shutil.rmtree(output_directory)
    os.makedirs(output_directory)
    final_results = collections.OrderedDict()
    for test_num in input_dic:
        graph, categories = dataset.init(input_dic[test_num])
        options = {}
        options['min_degree'] = input_dic[test_num]['min_degree']
        options['accumulative'] = input_dic[test_num]['accumulative']
        options['weaken_under_min'] = input_dic[test_num]['weaken_under_min']
        detector = algorithm.Detector(
            graph, categories['Seed']['nodes'], options)
        result = detector.detect()
        final_results[test_num] = prepare_result(
            result, categories, input_dic[test_num]['normalization_ratio'])
        if input_dic[test_num]['visualize']:
            visualize(graph, categories, result, output_directory, test_num)
        print('test {0} finished'.format(test_num))
    write_output_file(output_directory, final_results, input_dic)


if __name__ == '__main__':
    run(datasets.cut_region_test, algorithms.sybil_rank, './inputs/cut_region_test.csv', './outputs/tests1/')
    run(datasets.no_groups_test, algorithms.sybil_rank, './inputs/no_groups_test.csv', './outputs/tests2/')
