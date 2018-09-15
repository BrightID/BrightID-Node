import networkx as nx
from utils import *
import collections
import algorithms
import graphs
import shutil
import pickle
import json
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


def write_output_file(output_directory, outputs, input_dic):
    rows = collections.OrderedDict()
    rows['Inputs'] = ['Inputs', '']
    for test_num in input_dic:
        for title in input_dic[test_num]:
            if test_num == 1:
                rows[title] = [title]
            rows[title].append(input_dic[test_num][title])
    rows['  '] = []
    rows['Results'] = ['Results', '']
    for i, result in enumerate(outputs):
        for title in outputs[result]:
            if i == 0:
                rows[title] = [title]
            rows[title].append(outputs[result][title])
    with open(os.path.join(output_directory, 'result.csv'), 'wb') as f:
        writer = csv.writer(f)
        for row in rows:
            writer.writerow(rows[row])


def run(dataset, algorithm, input_file, output_directory):
    global TEMPLATE
    input_dic = read_input_file(input_file)
    if os.path.exists(output_directory):
        shutil.rmtree(output_directory)
    os.makedirs(output_directory)
    outputs = collections.OrderedDict()
    for test_num in input_dic:
        graph = dataset.generate(input_dic[test_num])
        options = {}
        options['min_degree'] = input_dic[test_num].get('min_degree', 1)
        options['accumulative'] = input_dic[test_num].get('accumulative', False)
        options['weaken_under_min'] = input_dic[test_num].get('weaken_under_min', False)
        options['group_edge_weight'] = input_dic[test_num].get('group_edge_weight', 1)
        options['nonlinear_distribution'] = input_dic[test_num].get('nonlinear_distribution', 1)

        algorithm(graph, options).rank()
        outputs[test_num] = generate_output(graph)
        if input_dic[test_num]['visualize']:
            json_dic = create_json_object(graph)
            edited_string = TEMPLATE.replace('JSON_GRAPH', json_dic)
            with open(os.path.join(output_directory, '{0}.html'.format(test_num)), 'wb') as output_file:
                output_file.write(edited_string)
        print('test {0} finished'.format(test_num))
    write_output_file(output_directory, outputs, input_dic)


if __name__ == '__main__':
    with open('template.html') as f:
        TEMPLATE = f.read()
    run(graphs.generators.group_based, algorithms.GroupSybilRank, './inputs/groups_test.csv', './outputs/cvs_tests/')
    # run(graphs.generators.cut_region, algorithms.SybilRank, './inputs/cut_region_test.csv', './outputs/cvs_tests/')
    # run(graphs.generators.no_group, algorithms.SybilRank, './inputs/no_groups_test.csv', './outputs/cvs_tests/')