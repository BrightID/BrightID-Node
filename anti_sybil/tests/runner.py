import networkx as nx
import matplotlib.pyplot as plt
from algorithms import sybil_rank
import demonstrator
from datasets import cut_region_test
from datasets import no_groups_test
import random
import csv

input_files = {
    'cut_region_test': './inputs/cut_region_test.csv',
    'no_groups_test': './inputs/no_groups_test.csv'
}


def read_input_file(input_file):
    with open(input_file, mode='r') as infile:
        reader = csv.reader(infile)
        input_dic = {rows[0]: eval(rows[1]) for rows in reader}
    return input_dic


def run(test):
    input_data = read_input_file(input_files[test])
    graph, categories = eval('%s.init(%s)'%(test, input_data))
    seed_nodes = random.sample(categories['Honest']['nodes'], input_data['num_seed_nodes'])
    detector = sybil_rank.SybilRanker(graph, seed_nodes)
    results = detector.detect()
    demonstrator.visualize(graph, categories, dict(results.ranked_trust), 'output')


if __name__ == '__main__':
    run('no_groups_test')
