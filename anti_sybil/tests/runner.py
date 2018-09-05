import networkx as nx
import matplotlib.pyplot as plt
import algorithms
import datasets
from utils import *
import random
import shutil
import csv
import os
import collections

NORMALIZATION_RATIO = .1
VISUALIZE = True

def read_input_file(input_file):
    inputs = collections.OrderedDict()
    with open(input_file) as f:
        for i, input_dict in enumerate(
                csv.DictReader(f, skipinitialspace=True)):
            for key in input_dict:
                input_dict[key] = eval(input_dict[key])
            inputs[i + 1] = input_dict
    return inputs


def find_border(result):
    best_border = best_score = 0
    for i in range(100):
        honest_score = len([node for node in result if node.node_type in ('Honest', 'Seed') and result[node] > i])
        sybil_score = len([node for node in result if node.node_type in ('Sybil', 'Non_bridge_sybil', 'Bridge_sybil') and result[node] < i])
        score = honest_score + sybil_score
        if score >= best_score:
            best_border = i
            best_score = score
    return best_border


def write_output_file(output_directory, final_results, input_dic):
    rows = collections.OrderedDict()
    for test_num in input_dic:
        for title in sorted(input_dic[test_num]):
            if test_num == 1:
                rows[title] = [title]
            rows[title].append(input_dic[test_num][title])
    rows[''] = []
    for i, result in enumerate(final_results):
        for title in final_results[result]:
            if i == 0:
                rows[title] = [title]
            rows[title].append(final_results[result][title])
    with open(os.path.join(output_directory, 'result.csv'), 'wb') as f:
        writer = csv.writer(f)
        for row in rows:
            writer.writerow(rows[row])


def calculate_explosion_rate(ranks_dic):
    honests = []
    sybils = []
    for category in ranks_dic:
        if category in ['Sybil', 'Non_bridge_sybil', 'Bridge_sybil']:
            sybils.extend(ranks_dic[category])
        if category in ['Seed', 'Honest']:
            honests.extend(ranks_dic[category])
    high_ranked_sybils = [rank for rank in sybils if rank > min(honests)]
    explosion_rate = (len(high_ranked_sybils) * 100) / (len(high_ranked_sybils) + len(honests))
    return explosion_rate


def prepare_result(result, categories):
    view_order = collections.OrderedDict([
        ('Seed', ['avg', 'normalized_min', 'min']),
        ('Honest', ['avg', 'normalized_min', 'min']),
        ('Attacker', ['max', 'normalized_max', 'avg']),
        ('Bridge Sybil', ['max', 'normalized_max', 'avg']),
        ('Non Bridge Sybil', ['max', 'normalized_max', 'avg']),
        ('Sybil', ['max', 'normalized_max', 'avg'])
    ])

    final_result = collections.OrderedDict()
    ranks_dic = {category: [result[node] for node in categories[category]['nodes']] for category in categories}

    final_result['Explosion_Rate_Percent'] = calculate_explosion_rate(ranks_dic)
    final_result['Border'] = find_border(result)

    for category in view_order:
        if category not in categories:
            continue
        cut_point = int(len(ranks_dic[category]) * NORMALIZATION_RATIO)
        if cut_point:
            cutted_list = ranks_dic[category][cut_point : -cut_point]
        else:
            cutted_list = ranks_dic[category]

        for parameter in view_order[category]:
            if parameter == 'min':
                final_result['Min %s' % category] = min(ranks_dic[category])
            elif parameter == 'avg':
                final_result['Avg %s' % category] = sum(ranks_dic[category]) / len(ranks_dic[category])
            elif parameter == 'max':
                final_result['Max %s' % category] = max(ranks_dic[category])
            elif parameter == 'normalized_min':
                final_result['Normalized Min %s' % category] = min(cutted_list)
            elif parameter == 'normalized_max':
                final_result['Normalized Max %s' % category] = max(cutted_list)
    return final_result


def run(dataset, algorithm, input_file, output_directory):
    input_dic = read_input_file(input_file)
    if os.path.exists(output_directory):
        shutil.rmtree(output_directory)
    os.makedirs(output_directory)
    final_results = collections.OrderedDict()
    for test_num in input_dic:
        graph, categories = dataset.init(input_dic[test_num])
        options = {}
        if algorithm == algorithms.enhanced_sybil_rank:
            options['min_degree'] = input_dic[test_num]['min_degree']
        detector = algorithm.Detector(graph, categories['Seed']['nodes'], options)
        result = detector.detect()
        final_results[test_num] = prepare_result(result, categories)
        if VISUALIZE:
            visualize(graph, categories, result, output_directory, test_num)
        print('test %s finished' % test_num)
    write_output_file(output_directory, final_results, input_dic)


if __name__ == '__main__':
    run(datasets.cut_region_test, algorithms.sybil_rank, './inputs/cut_region_test.csv', './outputs/tests1/')
    run(datasets.cut_region_test, algorithms.enhanced_sybil_rank, './inputs/cut_region_test.csv', './outputs/tests2/')
    run(datasets.no_groups_test, algorithms.sybil_rank, './inputs/no_groups_test.csv', './outputs/tests3/')
    run(datasets.no_groups_test, algorithms.enhanced_sybil_rank,'./inputs/no_groups_test.csv', './outputs/tests4/')
