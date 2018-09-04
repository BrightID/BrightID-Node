import networkx as nx
import matplotlib.pyplot as plt
from algorithms import sybil_rank, enhanced_sybil_rank
from utils import *
from datasets import cut_region_test, no_groups_test
import random
import shutil
import csv
import os
import collections


def read_input_file(input_file):
    inputs = {}
    with open(input_file) as f:
        for i, input_dict in enumerate(csv.DictReader(f, skipinitialspace=True)):
            for key in input_dict:
                input_dict[key] = eval(input_dict[key])
            inputs[i + 1] = input_dict
    return inputs


def write_output_file(output_directory, final_results):
    rows = collections.OrderedDict()
    for result in final_results:
        row = []
        for variable in final_results[result]:
            if variable in rows:
                rows[variable].append(final_results[result][variable])
            else:
                rows[variable] = [variable, final_results[result][variable]]
    with open(os.path.join(output_directory, 'result.csv'), 'wb') as f:
        writer = csv.writer(f)
        for row in rows:
            writer.writerow(rows[row])


def analysis_result(result):
    final_result = collections.OrderedDict()
    categories_dic = {}
    for node in result:
        if node.node_type in categories_dic:
            categories_dic[node.node_type].append(result[node])
        else:
            categories_dic[node.node_type] = [result[node]]
    for category in sorted(categories_dic):
        final_result['min_%s' % category] = min(categories_dic[category])
        final_result['vag_%s' % category] = sum(categories_dic[category]) / len(categories_dic[category])
        final_result['max_%s' % category] = max(categories_dic[category])
        cut_point = int(len(categories_dic[category]) * .1)
        if cut_point != 0:
            cutted_list = categories_dic[category][cut_point : -cut_point]
        else:
            cutted_list = categories_dic[category]
        final_result['normalized_min_%s' % category] = min(cutted_list)
        # final_result['normalized_vag_%s' % category] = sum(cutted_list) / len(cutted_list)
        final_result['normalized_max %s' % category] = max(cutted_list)
    return final_result


def run(input_file, dataset_name, test_name, output_directory):
    input_dic = read_input_file(input_file)
    dataset = eval(dataset_name)
    test = eval(test_name)
    if os.path.exists(output_directory):
        shutil.rmtree(output_directory)
    os.makedirs(output_directory)
    final_results = {}
    for test_num in input_dic:
        graph, categories = dataset.init(input_dic[test_num])
        seed_nodes = random.sample(categories['Honest']['nodes'], input_dic[test_num]['num_seed_nodes'])
        if test_name == 'sybil_rank':
            detector = test.Detector(graph, seed_nodes)
        elif test_name == 'enhanced_sybil_rank':
            detector = test.Detector(graph, seed_nodes, input_dic[test_num]['min_degree'])
        result = detector.detect()
        final_result = analysis_result(result)
        final_results[test_num] = final_result
        visualize(graph, categories, result, output_directory, test_num)
    write_output_file(output_directory, final_results)


if __name__ == '__main__':
    # run('./inputs/cut_region_test.csv', 'cut_region_test', 'sybil_rank', './outputs/Mine1/')
    # run('./inputs/cut_region_test.csv', 'cut_region_test', 'enhanced_sybil_rank', './outputs/Mine2/')
    run('./inputs/no_groups_test.csv', 'no_groups_test', 'sybil_rank', './outputs/Mine1/')
    run('./inputs/no_groups_test.csv', 'no_groups_test', 'enhanced_sybil_rank', './outputs/Mine2/')
