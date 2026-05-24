import sys
import os

def check():
    with open('info_debug.txt', 'w') as f:
        f.write(f"Executable: {sys.executable}\n")
        f.write(f"Version: {sys.version}\n")
        f.write(f"Cwd: {os.getcwd()}\n")
        try:
            import fastapi
            f.write("FastAPI: installed\n")
        except ImportError:
            f.write("FastAPI: NOT installed\n")
        try:
            import uvicorn
            f.write("Uvicorn: installed\n")
        except ImportError:
            f.write("Uvicorn: NOT installed\n")

if __name__ == "__main__":
    check()
