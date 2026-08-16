import os
import shutil
import subprocess
import sys
from pathlib import Path


PROJECT_NAME = "EBT Analysis Platform"
OUTPUT_EXE = "EBT_Platform.exe"


def run_command(command: str, cwd: Path | None = None) -> None:
    print(f"\n[RUN] {command}")
    result = subprocess.run(
        command,
        cwd=str(cwd) if cwd else None,
        shell=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Command failed with exit code {result.returncode}: {command}")


def ensure_command_exists(command_name: str) -> bool:
    check_cmd = f"where {command_name}" if os.name == "nt" else f"command -v {command_name}"
    result = subprocess.run(check_cmd, shell=True, capture_output=True, text=True)
    return result.returncode == 0


def ensure_pyinstaller() -> None:
    try:
        import PyInstaller  # noqa: F401
        print("[OK] PyInstaller already installed.")
    except ImportError:
        print("[INFO] PyInstaller not found, installing...")
        run_command(f"{sys.executable} -m pip install pyinstaller")


def clean_directory(path: Path, preserve_names: tuple[str, ...] = ()) -> None:
    if not path.exists():
        return

    for child in path.iterdir():
        if child.name in preserve_names:
            print(f"[SKIP] Preserving locked file during cleanup: {child.name}")
            continue

        try:
            if child.is_dir():
                shutil.rmtree(child)
            else:
                child.unlink()
        except PermissionError:
            print(f"[WARN] Could not remove {child} because it is currently in use. Please close the running app and rerun the build.")
        except OSError as exc:
            print(f"[WARN] Could not remove {child}: {exc}")


def stop_running_processes(*process_names: str) -> None:
    """Terminate stale app instances so PyInstaller can replace the old EXE file on Windows."""
    for process_name in process_names:
        if not process_name:
            continue
        result = subprocess.run(
            f'taskkill /F /IM "{process_name}" 2>nul',
            shell=True,
            capture_output=True,
            text=True,
        )
        if result.returncode in (0, 128):
            print(f"[INFO] Stopped stale process: {process_name}")
        else:
            print(f"[INFO] No running process named {process_name} was found.")


def build_app() -> None:
    project_root = Path(__file__).resolve().parent
    frontend_dir = project_root / "EBT-Platform-React"
    backend_dir = frontend_dir / "backend"
    output_dir = project_root / "dist-exe"

    if not frontend_dir.exists():
        raise FileNotFoundError(f"Frontend directory not found: {frontend_dir}")
    if not backend_dir.exists():
        raise FileNotFoundError(f"Backend directory not found: {backend_dir}")

    spec_file = backend_dir / "EBT_Platform.spec"
    if not spec_file.exists():
        raise FileNotFoundError(f"PyInstaller spec file not found: {spec_file}")

    print("============================================")
    print(f"{PROJECT_NAME} - Final Packaging Script")
    print("============================================")
    print(f"Project root: {project_root}")
    print(f"Frontend: {frontend_dir}")
    print(f"Backend: {backend_dir}")
    print(f"Output: {output_dir / OUTPUT_EXE}")

    if not ensure_command_exists("node"):
        raise RuntimeError("Node.js not found in PATH. Please install Node.js first.")
    if not ensure_command_exists("npm"):
        raise RuntimeError("npm not found in PATH. Please install Node.js first.")
    if not ensure_command_exists("python"):
        raise RuntimeError("python not found in PATH. Please install Python first.")

    ensure_pyinstaller()
    stop_running_processes(OUTPUT_EXE)

    print("\n[1/5] Installing frontend dependencies...")
    run_command("npm install", cwd=frontend_dir)

    print("\n[2/5] Building frontend production bundle...")
    run_command("npm run build", cwd=frontend_dir)

    frontend_dist = frontend_dir / "dist"
    if not frontend_dist.exists():
        raise FileNotFoundError(f"Frontend dist directory not found after build: {frontend_dist}")

    print("\n[3/5] Preparing backend static dist folder...")
    backend_dist = backend_dir / "dist"
    if backend_dist.exists():
        shutil.rmtree(backend_dist)
    shutil.copytree(frontend_dist, backend_dist)

    print("\n[4/5] Cleaning intermediate build artifacts...")
    stop_running_processes(OUTPUT_EXE)
    import time; time.sleep(1)  # 等待进程完全释放文件
    clean_directory(backend_dir / "build")
    output_dir.mkdir(parents=True, exist_ok=True)
    clean_directory(output_dir, preserve_names=("ebt_analysis.db",))
    stop_running_processes(OUTPUT_EXE)

    print("\n[5/5] Running PyInstaller to package application...")
    run_command(
        f"{sys.executable} -m PyInstaller EBT_Platform.spec --noconfirm --distpath \"{output_dir}\"",
        cwd=backend_dir,
    )

    exe_path = output_dir / OUTPUT_EXE
    if exe_path.exists():
        print(f"\n[OK] Build completed successfully.")
        print(f"Executable: {exe_path}")
    else:
        raise FileNotFoundError(f"Expected executable was not generated: {exe_path}")


if __name__ == "__main__":
    try:
        build_app()
    except Exception as exc:
        print(f"\n[ERROR] {exc}")
        input("Press Enter to exit...")
        raise
