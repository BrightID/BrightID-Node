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

class Results:

    def __init__(self, detector):
        self.nodes = detector.network.graph.nodes()
        self.honests_predicted = detector.honests_predicted
        self.honests_truth = detector.honests_truth
        self.confusion_matrix = self.__compute_confusion_matrix()

    def __compute_confusion_matrix(self):
        N = len(self.honests_truth)
        P = len(self.nodes) - N

        TN = len(
            set.intersection(
                set(self.honests_truth),
                set(self.honests_predicted)
            )
        )
        
        FN = len(
            set.intersection(
                set(self.honests_predicted),
                (set(self.nodes) - set(self.honests_truth))
            )
        )

        TP = len(
            set.intersection(
                (set(self.nodes) - set(self.honests_truth)),
                (set(self.nodes) - set(self.honests_predicted))
            )
        )
        
        FP = len(
            set.intersection(
                set(self.honests_truth),
                (set(self.nodes) - set(self.honests_predicted))
            )
        )
        
        confusion_matrix = {
            "N": N,
            "P": P,
            "TN": TN,
            "FN": FN,
            "TP": TP,
            "FP": FP
        }
        return confusion_matrix

    def accuracy(self):
        cm = self.confusion_matrix
        return (cm["TP"] + cm["TN"])/(float)(cm["P"] + cm["N"])

    def sensitivity(self):
        cm = self.confusion_matrix
        return cm["TP"]/(float)(cm["TP"]+cm["FN"])

    def specificity(self):
        cm = self.confusion_matrix
        return cm["TN"]/(float)(cm["FP"]+cm["TN"])

