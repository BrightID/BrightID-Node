#    SyPy: A Python framework for evaluating graph-based Sybil detection
#    algorithms in social and information networks.
#
#    Copyright (C) 2013  Yazan Boshmaf
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.

import sypy
import numpy as np
import math
import matplotlib
import matplotlib.pyplot as plt

class SimpleDetectorBenchmark:
    """
    Benchmarks a detector using ROC analysis over a given detection
    threshold and its values. It also computes the curve's AUC.
    """
    def __init__(self, detector, threshold, values=None):
        self.detector = detector
        if not isinstance(self.detector, sypy.BaseDetector):
            raise Exception("Invalid detector")

        self.threshold = threshold

        self.values = values
        if not self.values:
            self.values = [ i/10.0 for i in xrange(0,11) ]

        self.curve = {
            "fpr": [],
            "tpr": [],
            "auc": 0.0
        }

    def run(self):
        results = {}
        for value in self.values:
            setattr(self.detector, self.threshold, value)
            results[value] = self.detector.detect()

        self.__analyze(results)

    def __analyze(self, results):
        tpr = []
        fpr = []
        for value in sorted(results.keys()):
            tpr.append( results[value].sensitivity() )
            fpr.append( 1.0 - results[value].specificity() )

        self.curve["fpr"] = fpr
        self.curve["tpr"] = tpr

        self.__compute_auc()

    def __compute_auc(self):
        """
        Computes the AUC using the trapezoidal rule.
        """
        fpr = self.curve["fpr"]
        tpr = self.curve["tpr"]

        if len(fpr) < 2 or len(tpr) < 2:
            raise Exception("Invalid number of data points")

        direction = 1
        diff = np.diff(fpr)
        if np.any(diff < 0):
            if np.all(diff <= 0):
                direction = -1
            else:
                raise Exception("Invalid data points order")

        self.curve["auc"] = direction * np.trapz(tpr, fpr)

    def plot_curve(self, file_name=None, file_format="pdf", font_size=18):
        data ={}
        data["Random"] = {
            "x_data": [0, 1],
            "y_data": [0, 1]
        }

        name = self.detector.__class__.__name__
        data[name] = {
            "x_data": self.curve["fpr"],
            "y_data": self.curve["tpr"]
        }

        plotter = DetectorBenchmarkPlotter(
            data,
            file_name,
            file_format
        )
        plotter._plot(
            x_label="False positive rate",
            y_label="True positive rate",
            legend_loc="lower right"
        )


class CompositeDetectorsBenchmark:
    """
    A compisition of multiple SimpleDetectorBenchmark objects with the
    advatange of having a single plot for all benchmarked detectors
    """
    def __init__(self, simple_benchmarks):
        self.simple_benchmarks = simple_benchmarks

    def run(self):
        for benchmark in self.simple_benchmarks:
            benchmark.run()

    def plot_curve(self, file_name=None, file_format="pdf", font_size=18):
        data = {}
        data["Random"] = {
            "x_data": [0, 1],
            "y_data": [0,1]
        }

        for benchmark in self.simple_benchmarks:
            name = benchmark.detector.__class__.__name__
            data[name] = {
                "x_data": benchmark.curve["fpr"],
                "y_data": benchmark.curve["tpr"]
            }

        plotter = DetectorBenchmarkPlotter(
            data,
            file_name,
            file_format
        )
        plotter._plot(
            x_label="False positive rate",
            y_label="True positive rate",
            legend_loc="lower right"
         )


class MultipleDetectorsBenchmark:
    """
    A hybrid of the first two classes. This benchmark allows you to specify
    the detectors and benchmark them using the same network configuration
    but still allows you to pass custom keyword arguments to each detector.
    The order of the detectors in the list is important. There is a one-to-one
    mapping between the indexes across all list-typed arguments.
    """
    def __init__(self, detectors, network, thresholds, values=None, kwargs=None):
        self.detectors = detectors
        self.network = network
        self.benchmarks = []

        self.kwargs = kwargs
        if self.kwargs and len(self.kwargs) != len(self.detectors):
            raise Exception("Invalid number of kwargs")

        self.thresholds = thresholds
        if len(self.thresholds) != len(self.detectors):
            raise Exception("Invalid number of thresholds")

        self.values = values
        if not self.values:
            self.values = [ [i/10.0 for i in xrange(0,11)] ]*len(self.detectors)

    def run(self):
        for index, detector_class in enumerate(self.detectors):
            detector = detector_class(
                self.network,
                **self.kwargs[index] if self.kwargs else {}
            )
            benchmark = SimpleDetectorBenchmark(
                detector,
                self.thresholds[index],
                self.values[index]
            )
            benchmark.run()
            self.benchmarks.append(benchmark)

    def clear(self):
        self.benchmarks = []

    def plot_curve(self, file_name=None, file_format="pdf", font_size=18):
        data = {}
        for benchmark in self.benchmarks:
            name = benchmark.detector.__class__.__name__
            data[name] = {
                "x_data": benchmark.curve["fpr"],
                "y_data": benchmark.curve["tpr"]
            }

        data["Random"] = {
            "x_data": [0, 1],
            "y_data": [0, 1]
        }

        plotter = DetectorBenchmarkPlotter(
            data,
            file_name,
            file_format
        )
        plotter._plot(
            x_label="False positive rate",
            y_label="True positive rate",
            legend_loc="lower right"
        )


class DetectorBenchmarkPlotter:
    """
    Plots the results of any type of benchmark to the display or to a file.
    It allows you to customize the figure. To be called from a class function
    only. Do not instantiate externally. Use the plot_curve() funtion of the
    benchmark of your choice instead.
    """
    def __init__(self, data, file_name, file_format, font_size=18):
        self.data = data
        self.file_name = file_name
        self.file_format = file_format
        self.font_size = font_size

        self.__setup_figure()

    def __setup_figure(self):
        self.figure = plt.figure()
        self.axis = self.figure.add_subplot(111)
        matplotlib.rcParams.update(
            {"font.size": self.font_size}
        )

    def _plot(self, x_label, y_label, x_lim=[-0.05, 1.05], y_lim=[-0.05, 1.05],
            line_width=3, baseline_label="Random", legend_loc=None):
        self.axis.set_xlim(x_lim)
        self.axis.set_ylim(y_lim)

        self.axis.set_xlabel(x_label)
        self.axis.set_ylabel(y_label)

        if baseline_label in self.data:
            baseline = self.data[baseline_label]
            self.axis.plot(
                baseline["x_data"],
                baseline["y_data"],
                "k--",
                linewidth=line_width,
                label=baseline_label
            )

        for name in self.data:
            if name == baseline_label:
                continue

            dataset = self.data[name]
            self.axis.plot(
                dataset["x_data"],
                dataset["y_data"],
                linewidth=line_width,
                label=name
            )

        if legend_loc:
            self.axis.legend(
                loc=legend_loc,
                prop={"size":self.font_size}
            )

        if self.file_name:
            self.figure.savefig(
                "{0}.{1}".format(self.file_name, self.file_format),
                format=self.file_format
            )
            plt.clf()
        else:
            plt.show()


class AttackEdgesDetectorsBenchmark:
    """
    An advanced bechmark that allows you to evaluate the detectors against
    a the number of attack edges in the network, which is a variable
    external to the configuration of the detectors.
    The detectors are benchmarked using a MultipleDetectorsBenchmark
    object for every passed number of attack edges (i.e., the values).
    The output is a curve comparing the number of attack edges to the
    standard AUC of the detectors.
    """
    def __init__(self, multi_benchmark, values=None):
        self.multi_benchmark = multi_benchmark
        if not isinstance(self.multi_benchmark, MultipleDetectorsBenchmark):
            raise Exception("Invalid detector benchmark")
        self.multi_benchmark.clear()

        self.values = values
        if not self.values:
            left = len(self.multi_benchmark.network.left_region.graph.nodes())
            right = len(self.multi_benchmark.network.right_region.graph.nodes())
            max_edges = 2 * (left + right)
            self.values = [1] + [ i*100 for i in range(1, (max_edges/100)+1) ]

        self.curves = {}
        for detector in self.multi_benchmark.detectors:
            name = detector.__name__
            self.curves[name] = {
                "auc": [],
                "num_edges": []
            }

    def run(self):
        for value in sorted(self.values):
            self.multi_benchmark.network.reset(num_edges=value)
            self.multi_benchmark.run()
            for benchmark in self.multi_benchmark.benchmarks:
                name = benchmark.detector.__class__.__name__
                curve = self.curves[name]
                curve["auc"] += [ benchmark.curve["auc"] ]
                curve["num_edges"] += [value]
            self.multi_benchmark.clear()

    def plot_curve(self, file_name=None, file_format="pdf", font_size=18):
        data = {}
        data["Random"] = {
            "x_data": [min(self.values), max(self.values)],
            "y_data": [0.5, 0.5]
        }

        for name in self.curves:
            dataset = self.curves[name]
            data[name] = {
                "x_data": dataset["num_edges"],
                "y_data": dataset["auc"]
            }

        plotter = DetectorBenchmarkPlotter(
            data,
            file_name,
            file_format
        )
        plotter._plot(
            x_label="Number of attack edges",
            y_label="Area under ROC curve",
            x_lim=[min(self.values) - 1, max(self.values) + 1],
            legend_loc="lower right"
        )
