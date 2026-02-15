#!/usr/bin/env python3
"""Demo Brief Generator - Automated sales prospect research and document creation.

Researches a prospect and their company using web search, then generates
a professional Word document (.docx) and PDF with structured findings.

Usage:
    python demo_brief_generator.py --prospect "Name" --company "Company" --sdr "SDR Name"
    python demo_brief_generator.py  # interactive mode
"""

import argparse
import json
import os
import sys
import time

import config
import researcher
import document_generator
import pdf_converter


def parse_args():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="Generate a professional demo brief for a sales prospect.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python demo_brief_generator.py --prospect "Anthony Scarfe" --company "Elastic" --sdr "Yoni"
  python demo_brief_generator.py --prospect "Jane Doe" --company "Acme" --sdr "Alex" --logo logo.png
  python demo_brief_generator.py  # interactive mode

Environment Variables:
  SEARCH_BACKEND     Search engine to use: google, bing, duckduckgo (default: duckduckgo)
  GOOGLE_API_KEY     API key for Google Custom Search
  GOOGLE_CSE_ID      Custom Search Engine ID for Google
  BING_API_KEY       API key for Bing Search
        """,
    )
    parser.add_argument("--prospect", "-p", type=str, help="Prospect's full name")
    parser.add_argument("--company", "-c", type=str, help="Company name")
    parser.add_argument("--sdr", "-s", type=str, help="SDR name")
    parser.add_argument("--logo", "-l", type=str, help="Path to company logo (SVG/PNG)")
    parser.add_argument(
        "--output-dir", "-o", type=str, default=None,
        help=f"Output directory (default: {config.OUTPUT_DIR})",
    )
    parser.add_argument(
        "--no-pdf", action="store_true",
        help="Skip PDF generation",
    )
    parser.add_argument(
        "--export-json", action="store_true",
        help="Export raw research data to JSON",
    )
    parser.add_argument(
        "--from-json", type=str, default=None,
        help="Generate document from previously exported JSON (skip research)",
    )

    return parser.parse_args()


def interactive_prompt():
    """Gather inputs interactively."""
    print("\n=== Demo Brief Generator ===\n")

    prospect = input("  Enter prospect name: ").strip()
    if not prospect:
        print("  [!] Prospect name is required.")
        sys.exit(1)

    company = input("  Enter company name: ").strip()
    if not company:
        print("  [!] Company name is required.")
        sys.exit(1)

    sdr = input("  Enter SDR name: ").strip()
    if not sdr:
        print("  [!] SDR name is required.")
        sys.exit(1)

    logo = input("  Enter logo path (optional, press Enter to skip): ").strip()
    if logo and not os.path.exists(logo):
        print(f"  [!] Logo file not found: {logo}")
        logo = None

    return prospect, company, sdr, logo


def print_progress(message):
    """Print a progress message."""
    print(f"\n{'='*50}")
    print(f"  {message}")
    print(f"{'='*50}")


def main():
    """Main entry point."""
    args = parse_args()

    # Determine input mode
    if args.prospect and args.company and args.sdr:
        prospect_name = args.prospect
        company_name = args.company
        sdr_name = args.sdr
        logo_path = args.logo
    elif args.from_json:
        # Load from JSON - we still need SDR name
        sdr_name = args.sdr or input("  Enter SDR name: ").strip()
        logo_path = args.logo
        prospect_name = None  # Will be loaded from JSON
        company_name = None
    else:
        prospect_name, company_name, sdr_name, logo_path = interactive_prompt()

    # Validate logo path
    if logo_path and not os.path.exists(logo_path):
        print(f"  [!] Logo file not found: {logo_path}")
        logo_path = None

    # Set output directory
    output_dir = args.output_dir or config.OUTPUT_DIR
    os.makedirs(output_dir, exist_ok=True)

    # ==========================================
    # Phase 1: Research (or load from JSON)
    # ==========================================
    if args.from_json:
        print_progress("Loading research data from JSON...")
        try:
            with open(args.from_json, "r") as f:
                research_data = json.load(f)
            prospect_data = research_data["prospect"]
            company_data = research_data["company"]
            prospect_name = prospect_data["name"]
            company_name = company_data["name"]
            print(f"  Loaded data for {prospect_name} at {company_name}")
        except (json.JSONDecodeError, KeyError, FileNotFoundError) as e:
            print(f"  [!] Failed to load JSON: {e}")
            sys.exit(1)
    else:
        print_progress(f"Researching {prospect_name}...")
        start_time = time.time()
        prospect_data = researcher.research_prospect(prospect_name, company_name)
        prospect_time = time.time() - start_time
        print(f"  Prospect research complete ({prospect_time:.1f}s)")

        print_progress(f"Researching {company_name}...")
        start_time = time.time()
        company_data = researcher.research_company(company_name)
        company_time = time.time() - start_time
        print(f"  Company research complete ({company_time:.1f}s)")

        # Export JSON if requested
        if args.export_json:
            safe_prospect = prospect_name.replace(" ", "_")
            safe_company = company_name.replace(" ", "_")
            json_path = os.path.join(
                output_dir,
                f"{safe_prospect}_-_{safe_company}_-_Research.json",
            )
            researcher.export_research_to_json(prospect_data, company_data, json_path)

    # ==========================================
    # Phase 2: Generate Word Document
    # ==========================================
    print_progress("Generating Word document...")

    safe_prospect = prospect_name.replace(" ", "_")
    safe_company = company_name.replace(" ", "_")
    docx_path = os.path.join(
        output_dir,
        f"{safe_prospect}_-_{safe_company}_-_Demo_Brief.docx",
    )

    docx_path = document_generator.generate_docx(
        prospect_data=prospect_data,
        company_data=company_data,
        sdr_name=sdr_name,
        logo_path=logo_path,
        output_path=docx_path,
    )
    print(f"  Created: {docx_path}")

    # ==========================================
    # Phase 3: Convert to PDF
    # ==========================================
    if not args.no_pdf:
        print_progress("Converting to PDF...")
        pdf_path = pdf_converter.convert_docx_to_pdf(docx_path)
        if pdf_path:
            print(f"  Created: {pdf_path}")
        else:
            print("  [!] PDF conversion failed (document is still available as .docx)")
    else:
        pdf_path = None

    # ==========================================
    # Summary
    # ==========================================
    print(f"\n{'='*50}")
    print("  DONE")
    print(f"{'='*50}")
    print(f"\n  Prospect: {prospect_name}")
    print(f"  Company:  {company_name}")
    print(f"  SDR:      {sdr_name}")
    print(f"\n  Output files:")
    print(f"    DOCX: {docx_path}")
    if pdf_path:
        print(f"    PDF:  {pdf_path}")
    if args.export_json:
        print(f"    JSON: {json_path}")

    # Print research quality summary
    _print_quality_summary(prospect_data, company_data)

    print()
    return 0


def _print_quality_summary(prospect_data, company_data):
    """Print a summary of research data quality."""
    print(f"\n  Research Quality:")

    prospect_fields = ["title", "location", "linkedin_url", "tenure"]
    prospect_found = sum(
        1 for f in prospect_fields
        if prospect_data.get(f) and prospect_data[f] != "Not found"
    )
    prospect_lists = ["work_history", "certifications", "achievements", "published_content"]
    prospect_list_found = sum(
        1 for f in prospect_lists
        if prospect_data.get(f) and len(prospect_data[f]) > 0
    )

    print(f"    Prospect: {prospect_found}/{len(prospect_fields)} fields, "
          f"{prospect_list_found}/{len(prospect_lists)} lists populated")

    company_fields = [
        "industry", "size", "headquarters", "founded", "website",
        "ats", "employee_count", "compliance",
    ]
    company_found = sum(
        1 for f in company_fields
        if company_data.get(f) and company_data[f] != "Not found"
    )
    company_lists = ["identity_tools", "security_incidents"]
    company_list_found = sum(
        1 for f in company_lists
        if company_data.get(f) and len(company_data[f]) > 0
    )

    print(f"    Company:  {company_found}/{len(company_fields)} fields, "
          f"{company_list_found}/{len(company_lists)} lists populated")

    total = prospect_found + prospect_list_found + company_found + company_list_found
    total_possible = len(prospect_fields) + len(prospect_lists) + len(company_fields) + len(company_lists)
    pct = (total / total_possible) * 100 if total_possible > 0 else 0
    print(f"    Overall:  {total}/{total_possible} ({pct:.0f}%) data points found")


if __name__ == "__main__":
    sys.exit(main())
