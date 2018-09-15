# Using real social network graphs from networkrepository.com
# ./inputs/socfb-Auburn71.mtx has 18K nodes and 974K edges
# ./inputs/soc-hamsterster.edges has 2K nodes and 17K edges

import algorithms
import graphs
import os
from utils import *


OUTPUT_FOLDER = './outputs/tests4/'

print('Please wait, graph is loading ...')
graph = graphs.generators.networkrepository.generate({

    'file_path': os.path.abspath('./inputs/soc-hamsterster.edges'),
    'num_seed_to_num_honest': .05,
    'num_attacker_to_num_honest': .05,
    'num_sybil_to_num_attacker': 1,
    'sybil_to_attackers_con': .8
})
print('Graph loading completed, Calculating ranks ...')
algorithms.SybilRank(graph, {
    'min_degree': 8,
    'accumulative': False,
    'weaken_under_min': True,
    'nonlinear_distribution': True,
}).rank()
output1 = generate_output(graph)
draw_graph(graph, os.path.join(OUTPUT_FOLDER, '1.html'))
print('Finished')
write_output_file([output1], os.path.join(OUTPUT_FOLDER, 'result.csv'))
