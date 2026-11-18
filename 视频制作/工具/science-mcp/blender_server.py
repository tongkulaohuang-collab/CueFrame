from pathlib import Path
from blender_mcp import server

rules = (Path(__file__).resolve().parents[2] / '镜头与文字约束.md').read_text(encoding='utf8')
server.SERVER_INSTRUCTIONS += '\n' + rules
server.mcp._mcp_server.instructions = server.SERVER_INSTRUCTIONS

if __name__ == "__main__":
    server.main()
