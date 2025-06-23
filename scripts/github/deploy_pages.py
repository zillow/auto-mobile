#!/usr/bin/env python3

import os
import sys
import subprocess
import shutil
from pathlib import Path
import argparse


class Colors:
    RED = '\033[0;31m'
    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    NC = '\033[0m'  # No Color


def print_status(message):
    print(f"{Colors.GREEN}[INFO]{Colors.NC} {message}")


def print_warning(message):
    print(f"{Colors.YELLOW}[WARN]{Colors.NC} {message}")


def print_error(message):
    print(f"{Colors.RED}[ERROR]{Colors.NC} {message}")


def command_exists(command):
    """Check if a command exists in PATH"""
    return shutil.which(command) is not None


def has_uv_project():
    """Check if we have a uv project in the current directory"""
    script_dir = Path(__file__).parent
    return (script_dir / "pyproject.toml").exists() and (script_dir / "uv.lock").exists()


def run_mkdocs(*args):
    """Run mkdocs command, using uv if available"""
    if has_uv_project():
        script_dir = Path(__file__).parent
        os.chdir(script_dir)
        subprocess.run(["uv", "run", "mkdocs"] + list(args), check=True)
    else:
        subprocess.run(["mkdocs"] + list(args), check=True)


def copy_required_files():
    """Copy required files to docs directory"""
    print_status("Copying required files to docs directory...")

    # Determine project root directory
    if has_uv_project():
        script_dir = Path(__file__).parent
        project_root = script_dir / ".." / ".."
    else:
        project_root = Path(".")

    docs_dir = project_root / "docs"

    # Files to copy: (source_path, target_filename)
    files_to_copy = [
        (project_root / "CHANGELOG.md", "changelog.md"),
        (project_root / ".github" / "CONTRIBUTING.md", "contributing.md")
    ]

    for source_path, target_filename in files_to_copy:
        target_path = docs_dir / target_filename

        if source_path.exists():
            try:
                shutil.copy2(source_path, target_path)
                print_status(f"Copied {source_path} to {target_path}")
            except Exception as e:
                print_warning(f"Failed to copy {source_path}: {e}")
        else:
            print_warning(f"Source file not found: {source_path}")


def check_git_status():
    """Check git status and warn about uncommitted changes"""
    try:
        if has_uv_project():
            script_dir = Path(__file__).parent
            git_dir = script_dir / ".." / ".."
            os.chdir(git_dir)

        result = subprocess.run(["git", "status", "--porcelain"],
                              capture_output=True, text=True, check=True)

        if result.stdout.strip():
            print_warning("You have uncommitted changes. It's recommended to commit them before deploying docs.")
            response = input("Do you want to continue anyway? (y/N): ")
            if response.lower() != 'y':
                print_status("Deployment cancelled.")
                sys.exit(0)
    except subprocess.CalledProcessError:
        print_warning("Could not check git status")


def validate_mkdocs_config():
    """Validate MkDocs configuration"""
    print_status("Validating MkDocs configuration...")

    if has_uv_project():
        script_dir = Path(__file__).parent
        config_file = script_dir / ".." / ".." / "mkdocs.yml"
        config_file_arg = "../../mkdocs.yml"
    else:
        config_file = Path("mkdocs.yml")
        config_file_arg = "mkdocs.yml"

    if not config_file.exists():
        print_error(f"mkdocs.yml not found at {config_file}")
        sys.exit(1)

    # Check if MkDocs can build successfully
    try:
        if has_uv_project():
            script_dir = Path(__file__).parent
            os.chdir(script_dir)
            subprocess.run(["uv", "run", "mkdocs", "build", "--strict", "--quiet",
                          "--config-file", config_file_arg], check=True)
        else:
            subprocess.run(["mkdocs", "build", "--strict", "--quiet",
                          "--config-file", config_file_arg], check=True)

        print_status("MkDocs configuration is valid")
    except subprocess.CalledProcessError:
        print_error("MkDocs build failed. Please fix configuration errors.")
        sys.exit(1)


def deploy_docs():
    """Build and deploy documentation to GitHub Pages"""
    print_status("Building and deploying documentation to GitHub Pages...")

    # Copy required files first
    copy_required_files()

    # Deploy to gh-pages branch
    if has_uv_project():
        config_file_arg = "../../mkdocs.yml"
    else:
        config_file_arg = "mkdocs.yml"

    try:
        run_mkdocs("gh-deploy", "--clean",
                  "--message", "Deploy documentation for commit {sha}",
                  "--config-file", config_file_arg)

        print_status("Documentation deployed successfully!")
        print_status("Your documentation will be available at:")

        # Try to get the GitHub Pages URL
        try:
            result = subprocess.run(["git", "config", "--get", "remote.origin.url"],
                                  capture_output=True, text=True, check=True)
            repo_url = result.stdout.strip()

            if "github.com" in repo_url:
                # Extract username/repo from URL
                if repo_url.endswith(".git"):
                    repo_path = repo_url[:-4]  # Remove .git
                else:
                    repo_path = repo_url

                if "github.com/" in repo_path:
                    user_repo = repo_path.split("github.com/")[1]
                    user_repo = user_repo.replace(":", "/")  # Replace : with / for SSH URLs
                    user, repo = user_repo.split("/", 1)
                    print(f"  https://{user}.github.io/{repo}/")
        except subprocess.CalledProcessError:
            pass

        print_status("Note: It may take a few minutes for changes to appear on GitHub Pages.")

    except subprocess.CalledProcessError:
        print_error("Deployment failed!")
        sys.exit(1)


def serve_docs():
    """Serve docs locally for testing"""
    print_status("Starting local documentation server...")
    print_status("Documentation will be available at: http://127.0.0.1:8000")
    print_status("Press Ctrl+C to stop the server")

    if has_uv_project():
        config_file_arg = "../../mkdocs.yml"
    else:
        config_file_arg = "mkdocs.yml"

    try:
        run_mkdocs("serve", "--config-file", config_file_arg)
    except KeyboardInterrupt:
        print_status("Server stopped.")


def build_docs():
    """Build documentation locally"""

    # Copy required files first
    copy_required_files()

    validate_mkdocs_config()

    if has_uv_project():
        config_file_arg = "../../mkdocs.yml"
    else:
        config_file_arg = "mkdocs.yml"

    try:
        run_mkdocs("build", "--config-file", config_file_arg)
        print_status("Documentation built in site/ directory")
    except subprocess.CalledProcessError:
        print_error("Build failed!")
        sys.exit(1)


def main():
    """Main script logic"""
    parser = argparse.ArgumentParser(
        description="AutoMobile Documentation Deployment",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Commands:
  deploy    Deploy documentation to GitHub Pages (default)
  serve     Serve documentation locally for preview
  build     Build documentation locally
  help      Show this help message

Dependencies:
  This script uses uv (https://github.com/astral-sh/uv) for package management.
  Make sure uv sync has been run in the scripts/github directory.

Automatic Deployment:
  Documentation is automatically deployed via GitHub Actions when changes
  are pushed to the main branch and all other commit jobs pass successfully.
  Manual deployment using this script is typically only needed for testing.
        """)

    parser.add_argument('command', nargs='?', default='deploy',
                       choices=['deploy', 'serve', 'preview', 'build', 'help'],
                       help='Command to run (default: deploy)')

    args = parser.parse_args()

    print_status("AutoMobile Documentation Deployment")
    print_status("========================================")

    if args.command == 'help':
        parser.print_help()
        return

    # Check if MkDocs is available
    if not command_exists("mkdocs") and not has_uv_project():
        print_error("MkDocs not found and no uv project detected.")
        print_error("Please run 'uv sync' in the scripts/github directory first.")
        sys.exit(1)

    if args.command == 'deploy':
        print_status("Deploying documentation to GitHub Pages...")
        check_git_status()
        validate_mkdocs_config()
        deploy_docs()

    elif args.command in ['serve', 'preview']:
        print_status("Starting local documentation server for preview...")
        serve_docs()

    elif args.command == 'build':
        build_docs()


if __name__ == "__main__":
    main()
