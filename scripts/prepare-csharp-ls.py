"""Developer-only, pinned NuGet deployment; never runs on a student's machine."""
import concurrent.futures
import base64
import hashlib
import io
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parent.parent
VERSION = "0.27.0"
PACKAGE_SHA256 = "a49a34d4664e4fba4781cb50d537efad1771393828370e32ece3fe75e2bcedaf"
SOURCE = "https://api.nuget.org/v3-flatcontainer"
COMMIT = "d48ab7781176d2d369ceeb31d986503c2ad493e2"


def download(url):
    cache = ROOT / "out/windows-packaging-p2-source/download-cache"
    cache.mkdir(parents=True, exist_ok=True)
    file = cache / hashlib.sha256(url.encode()).hexdigest()
    if not file.exists():
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Student-Coding-IDE-Packaging"}), timeout=120) as response:
            data = response.read()
        file.write_bytes(data)
    return file.read_bytes()


def github_license(repo, version=None):
    for ref in ([version, "v" + version, None] if version else [None]):
        url = f"https://api.github.com/repos/{repo}/license" + (f"?ref={ref}" if ref else "")
        try:
            response = json.loads(download(url))
            return base64.b64decode(response["content"]), response["html_url"]
        except urllib.error.HTTPError as error:
            if error.code != 404:
                raise
    raise RuntimeError("Upstream license unavailable: " + repo)


def main():
    if sys.platform != "win32":
        raise RuntimeError("This deployment preparation requires Windows x64")
    (ROOT / "out").mkdir(exist_ok=True)
    destination = ROOT / "resources/csharp-ls"
    if destination.exists():
        subprocess.run(["node", "-e", "require('./scripts/csharp-ls-payload.cjs').verifyCsharpPayload('resources/csharp-ls')"], cwd=ROOT, check=True)
        print("Existing verified payload preserved:", destination)
        return
    work = Path(tempfile.mkdtemp(prefix="csharp-ls-prepare-", dir=ROOT / "out"))
    archive = work / f"csharp-ls.{VERSION}.nupkg"
    archive.write_bytes(download(f"{SOURCE}/csharp-ls/{VERSION}/{archive.name}"))
    if hashlib.sha256(archive.read_bytes()).hexdigest() != PACKAGE_SHA256:
        raise RuntimeError("Pinned NuGet package digest mismatch")
    subprocess.run(["dotnet", "nuget", "verify", str(archive), "--all"], check=True)
    # A private feed containing only the verified official nupkg. No inherited feeds.
    config = work / "NuGet.Config"
    config.write_text(f'<configuration><packageSources><clear/><add key="verified" value="{work.as_posix()}"/></packageSources></configuration>', encoding="utf-8")
    tool = work / "tool"
    subprocess.run(["dotnet", "tool", "install", "csharp-ls", "--version", VERSION,
                    "--tool-path", str(tool), "--configfile", str(config), "--no-cache"], check=True)
    launcher = (tool / "csharp-ls.exe").read_bytes()
    pe = int.from_bytes(launcher[0x3c:0x40], "little")
    if launcher[pe:pe + 4] != b"PE\0\0" or int.from_bytes(launcher[pe + 4:pe + 6], "little") != 0x8664:
        raise RuntimeError("Expected a Windows x64 apphost")
    payload = work / "payload"
    shutil.copytree(tool, payload, ignore=shutil.ignore_patterns("*.nupkg", "*.sha512", "*.pdb", ".nupkg.metadata", ".signature.p7s"))
    notices = payload / "licenses"
    notices.mkdir()
    license_url = f"https://raw.githubusercontent.com/razzmatazz/csharp-language-server/{COMMIT}/LICENSE"
    (notices / "csharp-ls-LICENSE.txt").write_bytes(download(license_url))
    prefix = ".store/csharp-ls/0.27.0/csharp-ls/0.27.0/tools/net10.0/any/"
    with zipfile.ZipFile(archive) as package:
        # Preserve every executable/runtime/localization/BuildHost asset byte-for-byte.
        for name in package.namelist():
            if name.startswith("tools/") and not name.endswith("/") and not name.endswith(".pdb"):
                target = payload / prefix / name.removeprefix("tools/net10.0/any/")
                if target.read_bytes() != package.read(name):
                    raise RuntimeError("Incomplete tool deployment: " + name)
        deps = json.loads(package.read("tools/net10.0/any/CSharpLanguageServer.deps.json"))
        (notices / "csharp-ls.nuspec").write_bytes(package.read("csharp-ls.nuspec"))
    # Vendor notices for the exact NuGet dependency identities, not latest versions.
    libraries = [name for name, meta in deps["libraries"].items() if meta["type"] == "package"]

    def license_for(identity):
        name, version = identity.split("/")
        url = f"{SOURCE}/{name.lower()}/{version}/{name.lower()}.{version}.nupkg"
        data = download(url)
        folder = notices / (name + "-" + version)
        folder.mkdir()
        with zipfile.ZipFile(io.BytesIO(data)) as package:
            nuspec = next(n for n in package.namelist() if n.endswith(".nuspec"))
            metadata = package.read(nuspec)
            (folder / "package.nuspec").write_bytes(metadata)
            tree = ET.fromstring(metadata)
            license_node = next((n for n in tree.iter() if n.tag.split("}")[-1] == "license"), None)
            license_files = [n for n in package.namelist() if not n.endswith("/") and any(k in Path(n).name.lower() for k in ["license", "notice", "copying", "copyright"])]
            if license_node is not None and license_node.attrib.get("type") == "file":
                license_files.append(license_node.text)
            for i, filename in enumerate(dict.fromkeys(license_files)):
                (folder / f"{i}-{Path(filename).name}").write_bytes(package.read(filename))
            if not license_files:
                # Legacy NuGet packages may publish legal text by URL only.
                # Keep their nuspec authors/copyright beside the original text.
                license_url = next((n.text for n in tree.iter() if n.tag.split("}")[-1] == "licenseUrl"), None)
                if not license_url or not license_url.startswith("https://"):
                    raise RuntimeError("Dependency license unavailable: " + identity)
                try:
                    (folder / "published-license.html").write_bytes(download(license_url))
                except urllib.error.HTTPError as error:
                    if error.code != 404 or name != "FSharp.Control.AsyncSeq":
                        raise
                    text, origin = github_license("fsprojects/FSharp.Control.AsyncSeq", version)
                    (folder / "upstream-LICENSE.txt").write_bytes(text)
                    (folder / "license-source.txt").write_text(origin, encoding="utf-8")
            return {"identity": identity, "source": url, "sha256": hashlib.sha256(data).hexdigest(),
                    "license": license_node.text if license_node is not None else None}

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        identities = list(pool.map(license_for, libraries))
    # Ionide is compiled as a project inside this upstream release, not a NuGet dependency.
    ionide_license, ionide_url = github_license("ionide/LanguageServerProtocol")
    (notices / "Ionide-LanguageServerProtocol-LICENSE.txt").write_bytes(ionide_license)
    (notices / "Ionide-license-source.txt").write_text(ionide_url, encoding="utf-8")
    (notices / "THIRD-PARTY.json").write_text(json.dumps(identities, indent=2), encoding="utf-8")
    files = {p.relative_to(payload).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
             for p in sorted(payload.rglob("*")) if p.is_file()}
    (payload / "deployment.json").write_text(json.dumps({"version": VERSION, "source": f"{SOURCE}/csharp-ls/{VERSION}/{archive.name}",
        "packageSha256": PACKAGE_SHA256, "framework": "net10.0", "files": files}, indent=2), encoding="utf-8")
    if destination.exists():
        raise RuntimeError("Existing payload preserved; inspect before replacing: " + str(payload))
    shutil.copytree(payload, destination)
    print("Verified app-owned csharp-ls payload:", destination)
    print("Retained preparation inputs:", work)


if __name__ == "__main__":
    main()
