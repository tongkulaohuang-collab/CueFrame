"""Resumable dependency installation from PyPI and Blender's official archive."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parent
RUNTIME = ROOT / "runtime"
PYTHON = ROOT / ".venv/Scripts/python.exe"

def fetch(url, destination):
    destination.parent.mkdir(parents=True, exist_ok=True)
    part = destination.with_suffix(destination.suffix + ".part")
    with urllib.request.urlopen(url, timeout=45) as response, part.open("wb") as target:
        while block := response.read(1024 * 1024):
            target.write(block)
    part.replace(destination)

def install_python():
    env = {**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8", "DISABLE_TELEMETRY": "true"}
    subprocess.run([str(PYTHON), "-m", "pip", "install", "--disable-pip-version-check", "--retries", "4", "--timeout", "25", "--prefer-binary",
        "manim==0.22.1", "moderngl-window==3.1.1", "mcp>=1.26,<2", str(ROOT / "upstream/mcp-for-blender")], env=env, check=True)
    freeze = subprocess.check_output([str(PYTHON), "-m", "pip", "freeze"], env=env, text=True, encoding="utf-8")
    (ROOT / "installed-requirements.txt").write_text(freeze, encoding="utf-8")
def install_blender():
    # Read the official LTS index and verify the ZIP with its official checksum.
    if not (ROOT / "blender-download.json").exists() or not list(RUNTIME.glob("blender-*/blender.exe")):
        base = "https://download.blender.org/release/Blender4.5/"
        with urllib.request.urlopen(base, timeout=45) as response:
            html = response.read().decode("utf-8")
        versions = re.findall(r'href="(blender-4\.5\.(\d+)-windows-x64\.zip)"', html)
        if not versions:
            raise RuntimeError("No Windows Blender LTS archive found in official index")
        filename, patch = max(versions, key=lambda item: int(item[1]))
        checksum = RUNTIME / f"blender-4.5.{patch}.sha256"
        fetch(base + checksum.name, checksum)
        line = next(x for x in checksum.read_text().splitlines() if filename in x)
        expected = line.split()[0].lower()
        archive = RUNTIME / filename
        def digest():
            with archive.open("rb") as source:
                return hashlib.file_digest(source, "sha256").hexdigest()
        if not archive.exists() or digest() != expected:
            fetch(base + filename, archive)
        if digest() != expected:
            raise RuntimeError("Blender archive checksum mismatch; archive was not extracted")
        with zipfile.ZipFile(archive) as zipped:
            for member in zipped.infolist():
                if not (RUNTIME / member.filename).resolve().is_relative_to(RUNTIME.resolve()):
                    raise RuntimeError("Invalid archive path")
            zipped.extractall(RUNTIME)
        (ROOT / "blender-download.json").write_text(json.dumps({"url": base + filename, "sha256": expected}, indent=2))
    addon = RUNTIME / "blender-profile/scripts/addons/blender_mcp.py"
    addon.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ROOT / "upstream/mcp-for-blender/addon.py", addon)

def install_tex():
    marker = ROOT / "tex-runtime.json"
    if marker.exists() and Path(json.loads(marker.read_text())["bin"]).joinpath("latex.exe").exists():
        return
    url = "https://github.com/rstudio/tinytex-releases/releases/download/v2026.11/TinyTeX-v2026.11.zip"
    expected = "a13d14ba987873d1bdf81773f5bdfcc34537882b825dd2134f61eb6ee21d5f69"
    archive = RUNTIME / "TinyTeX-v2026.11.zip"
    if not archive.exists():
        fetch(url, archive)
    with archive.open("rb") as source:
        if hashlib.file_digest(source, "sha256").hexdigest() != expected:
            raise RuntimeError("TinyTeX checksum mismatch")
    target = RUNTIME / "tex"
    with zipfile.ZipFile(archive) as zipped:
        for member in zipped.infolist():
            if not (target / member.filename).resolve().is_relative_to(target.resolve()):
                raise RuntimeError("Invalid TeX archive path")
        zipped.extractall(target)
    binary = next(target.rglob("latex.exe")).parent
    marker.write_text(json.dumps({"bin": str(binary), "url": url, "sha256": expected}, ensure_ascii=False, indent=2), encoding="utf-8")

def configure_tex():
    # TeX Live's Windows path handling needs an ASCII path for this Chinese workspace.
    alias = Path("C:/Users/Public/CodexScienceMCP")
    if alias.exists():
        if alias.resolve() != ROOT:
            raise RuntimeError("The ASCII TeX alias belongs to a different directory")
    else:
        quoted = str(ROOT).replace("'", "''")
        subprocess.run(["powershell.exe", "-NoProfile", "-Command",
            f"New-Item -ItemType Junction -Path 'C:\\Users\\Public\\CodexScienceMCP' -Target '{quoted}' | Out-Null"],
            check=True, stdin=subprocess.DEVNULL, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    binary = alias / Path(json.loads((ROOT / "tex-runtime.json").read_text(encoding="utf-8"))["bin"]).relative_to(ROOT)
    if not (binary / "dvisvgm.exe").exists():
        env = {**os.environ, "PATH": str(binary) + os.pathsep + os.environ.get("PATH", ""), "LC_ALL": "C", "LC_CTYPE": "C", "LANG": "C"}
        for args in (["update", "--self"], ["install", "dvisvgm"]):
            subprocess.run([str(binary / "tlmgr.bat"), *args], cwd=alias.parent, env=env, check=True, stdin=subprocess.DEVNULL)
        if not (binary / "dvisvgm.exe").exists():
            raise RuntimeError("dvisvgm installation did not complete")

def main():
    install_python()
    install_blender()
    install_tex()
    configure_tex()
    subprocess.run([str(PYTHON), str(ROOT / "configure_codex.py")], check=True)
    print("Installation complete. Restart Codex MCP connections; check both engines in Frameboard.")

if __name__ == "__main__":
    main()
