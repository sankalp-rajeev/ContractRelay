"""Seed an actual parsed graph, then run the unchanged historical MCP server.
No tool function is replaced. Index/search/embedding workflows are not evaluated.
"""
from pathlib import Path
from nexus_mcp.core.graph_models import UniversalGraph
from nexus_mcp.parsing.astgrep_parser import AstGrepParser
from nexus_mcp.engines.graph_engine import RustworkxCodeGraph
from nexus_mcp.persistence.store import GraphPersistence
from nexus_mcp.state import get_state
from nexus_mcp.server import main

fixture = Path('/data/sample.py')
fixture.write_text('def alpha(x):\n    return x + 1\n\ndef beta(x):\n    return alpha(x) * 2\n\ndef gamma(x):\n    return x - 3\n')
parsed = UniversalGraph()
AstGrepParser().parse_file(str(fixture), parsed)
graph = RustworkxCodeGraph()
for node in parsed.nodes.values():
    graph.add_node(node)
for relation in parsed.relationships.values():
    graph.add_relationship(relation)
state = get_state()
state.codebase_path = Path('/data')
state.graph_engine = graph
Path(state.settings.graph_path).parent.mkdir(parents=True, exist_ok=True)
GraphPersistence(str(state.settings.graph_path)).save(graph)
main()
