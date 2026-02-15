"""PDF conversion module for the Demo Brief Generator.

Converts .docx files to .pdf using LibreOffice in headless mode.
"""

import os
import subprocess
import shutil
import tempfile


def convert_docx_to_pdf(docx_path):
    """Convert a .docx file to .pdf using LibreOffice.

    Args:
        docx_path: Path to the .docx file

    Returns:
        Path to the generated .pdf file, or None if conversion failed
    """
    if not os.path.exists(docx_path):
        print(f"  [!] DOCX file not found: {docx_path}")
        return None

    # Check for LibreOffice
    libreoffice_cmd = _find_libreoffice()
    if not libreoffice_cmd:
        print("  [!] LibreOffice not found. PDF conversion skipped.")
        print("      Install LibreOffice to enable PDF generation:")
        print("      - macOS: brew install --cask libreoffice")
        print("      - Ubuntu: sudo apt-get install libreoffice")
        print("      - Windows: Download from libreoffice.org")
        return None

    output_dir = os.path.dirname(docx_path)

    # LibreOffice needs a writable HOME directory for its profile
    env = os.environ.copy()
    if not os.access(os.path.expanduser("~"), os.W_OK):
        env["HOME"] = tempfile.gettempdir()

    try:
        result = subprocess.run(
            [
                libreoffice_cmd,
                "--headless",
                "--convert-to", "pdf",
                "--outdir", output_dir,
                docx_path,
            ],
            capture_output=True,
            text=True,
            timeout=60,
            env=env,
        )

        if result.returncode != 0:
            print(f"  [!] LibreOffice conversion error: {result.stderr}")
            return None

        # LibreOffice outputs the PDF with the same base name
        base_name = os.path.splitext(os.path.basename(docx_path))[0]
        pdf_path = os.path.join(output_dir, f"{base_name}.pdf")

        if os.path.exists(pdf_path):
            return pdf_path
        else:
            print("  [!] PDF file was not created by LibreOffice")
            return None

    except subprocess.TimeoutExpired:
        print("  [!] LibreOffice conversion timed out")
        return None
    except Exception as e:
        print(f"  [!] PDF conversion error: {e}")
        return None


def _find_libreoffice():
    """Find the LibreOffice executable."""
    # Common names for the LibreOffice command
    candidates = ["libreoffice", "soffice", "lowriter"]

    for cmd in candidates:
        path = shutil.which(cmd)
        if path:
            return path

    # macOS specific paths
    mac_paths = [
        "/Applications/LibreOffice.app/Contents/MacOS/soffice",
        "/usr/local/bin/libreoffice",
    ]
    for path in mac_paths:
        if os.path.exists(path):
            return path

    return None
