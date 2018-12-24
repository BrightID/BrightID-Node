import setuptools

with open("README.md", "r") as fh:
    long_description = fh.read()

setuptools.setup(
    name="anti_sybil",
    version="0.0.2",
    author="Abram Symons",
    author_email="abram.symons@protonmail.com",
    description="Anti sybil package for BrightID",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="http://github.com/BrightID/BrightID-Node",
    packages=setuptools.find_packages(),
    install_requires=['networkx==2.1', 'python-arango==4.2.1', 'flask'],
    data_files=[
        ('anti_sybil/simulation_platform', ['anti_sybil/simulation_platform/graph.json']),
        ('anti_sybil/simulation_platform/static', [
            'anti_sybil/simulation_platform/static/index.html',
            'anti_sybil/simulation_platform/static/graph.js',
            'anti_sybil/simulation_platform/static/app.js'
        ])],
    classifiers=[
        "Programming Language :: Python :: 2.7",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
    ],
    entry_points={
        'console_scripts': [
            'anti_sybil_server = anti_sybil.simulation_platform.server:main'
        ],
    }
)