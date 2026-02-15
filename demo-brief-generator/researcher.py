"""Web research module for the Demo Brief Generator.

Handles searching for prospect and company information using
configurable search backends (Google, Bing, DuckDuckGo).
"""

import json
import hashlib
import os
import re
import time
from datetime import datetime, timedelta
from urllib.parse import quote_plus, urljoin

import requests
from bs4 import BeautifulSoup

import config


class SearchBackend:
    """Base class for search backends."""

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            )
        })

    def search(self, query, num_results=10):
        """Search and return list of {title, url, snippet} dicts."""
        raise NotImplementedError


class GoogleSearchBackend(SearchBackend):
    """Google Custom Search API backend."""

    def search(self, query, num_results=10):
        if not config.GOOGLE_API_KEY or not config.GOOGLE_CSE_ID:
            print("  [!] Google API key or CSE ID not set, falling back to DuckDuckGo")
            return DuckDuckGoSearchBackend().search(query, num_results)

        url = "https://www.googleapis.com/customsearch/v1"
        params = {
            "key": config.GOOGLE_API_KEY,
            "cx": config.GOOGLE_CSE_ID,
            "q": query,
            "num": min(num_results, 10),
        }
        try:
            resp = self.session.get(url, params=params, timeout=config.REQUEST_TIMEOUT)
            resp.raise_for_status()
            data = resp.json()
            results = []
            for item in data.get("items", []):
                results.append({
                    "title": item.get("title", ""),
                    "url": item.get("link", ""),
                    "snippet": item.get("snippet", ""),
                })
            return results
        except Exception as e:
            print(f"  [!] Google search error: {e}")
            return []


class BingSearchBackend(SearchBackend):
    """Bing Search API backend."""

    def search(self, query, num_results=10):
        if not config.BING_API_KEY:
            print("  [!] Bing API key not set, falling back to DuckDuckGo")
            return DuckDuckGoSearchBackend().search(query, num_results)

        url = "https://api.bing.microsoft.com/v7.0/search"
        headers = {"Ocp-Apim-Subscription-Key": config.BING_API_KEY}
        params = {"q": query, "count": num_results}
        try:
            resp = self.session.get(
                url, headers=headers, params=params, timeout=config.REQUEST_TIMEOUT
            )
            resp.raise_for_status()
            data = resp.json()
            results = []
            for item in data.get("webPages", {}).get("value", []):
                results.append({
                    "title": item.get("name", ""),
                    "url": item.get("url", ""),
                    "snippet": item.get("snippet", ""),
                })
            return results
        except Exception as e:
            print(f"  [!] Bing search error: {e}")
            return []


class DuckDuckGoSearchBackend(SearchBackend):
    """DuckDuckGo HTML search backend (no API key needed)."""

    def search(self, query, num_results=10):
        url = "https://html.duckduckgo.com/html/"
        try:
            resp = self.session.post(
                url,
                data={"q": query},
                timeout=config.REQUEST_TIMEOUT,
            )
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, "html.parser")
            results = []
            for result in soup.select(".result"):
                title_el = result.select_one(".result__title a")
                snippet_el = result.select_one(".result__snippet")
                if title_el:
                    href = title_el.get("href", "")
                    # DuckDuckGo wraps URLs in a redirect
                    if "uddg=" in href:
                        from urllib.parse import parse_qs, urlparse
                        parsed = urlparse(href)
                        qs = parse_qs(parsed.query)
                        href = qs.get("uddg", [href])[0]
                    results.append({
                        "title": title_el.get_text(strip=True),
                        "url": href,
                        "snippet": snippet_el.get_text(strip=True) if snippet_el else "",
                    })
                if len(results) >= num_results:
                    break
            return results
        except Exception as e:
            print(f"  [!] DuckDuckGo search error: {e}")
            return []


class GoogleHtmlSearchBackend(SearchBackend):
    """Google HTML search scraping backend (no API key needed)."""

    def search(self, query, num_results=10):
        url = "https://www.google.com/search"
        params = {"q": query, "num": num_results, "hl": "en"}
        try:
            resp = self.session.get(url, params=params, timeout=config.REQUEST_TIMEOUT)
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, "html.parser")
            results = []
            # Google search result blocks
            for div in soup.select("div.g, div.tF2Cxc"):
                link_el = div.select_one("a[href]")
                title_el = div.select_one("h3")
                snippet_el = div.select_one("div.VwiC3b, span.aCOpRe, div.IsZvec")
                if link_el and title_el:
                    href = link_el.get("href", "")
                    if href.startswith("/url?"):
                        from urllib.parse import parse_qs, urlparse
                        parsed = urlparse(href)
                        qs = parse_qs(parsed.query)
                        href = qs.get("q", [href])[0]
                    if href.startswith("http"):
                        results.append({
                            "title": title_el.get_text(strip=True),
                            "url": href,
                            "snippet": snippet_el.get_text(strip=True) if snippet_el else "",
                        })
                if len(results) >= num_results:
                    break
            return results
        except Exception as e:
            print(f"  [!] Google HTML search error: {e}")
            return []


class DuckDuckGoApiBackend(SearchBackend):
    """DuckDuckGo Instant Answer API backend."""

    def search(self, query, num_results=10):
        url = "https://api.duckduckgo.com/"
        params = {"q": query, "format": "json", "no_redirect": 1}
        try:
            resp = self.session.get(url, params=params, timeout=config.REQUEST_TIMEOUT)
            resp.raise_for_status()
            data = resp.json()
            results = []

            # Abstract
            if data.get("Abstract"):
                results.append({
                    "title": data.get("Heading", query),
                    "url": data.get("AbstractURL", ""),
                    "snippet": data.get("Abstract", ""),
                })

            # Related topics
            for topic in data.get("RelatedTopics", []):
                if isinstance(topic, dict) and topic.get("FirstURL"):
                    results.append({
                        "title": topic.get("Text", "")[:100],
                        "url": topic.get("FirstURL", ""),
                        "snippet": topic.get("Text", ""),
                    })
                if len(results) >= num_results:
                    break

            return results
        except Exception as e:
            print(f"  [!] DuckDuckGo API error: {e}")
            return []


def get_search_backend():
    """Return the configured search backend."""
    backends = {
        "google": GoogleSearchBackend,
        "google_html": GoogleHtmlSearchBackend,
        "bing": BingSearchBackend,
        "duckduckgo": DuckDuckGoSearchBackend,
        "duckduckgo_api": DuckDuckGoApiBackend,
    }
    backend_name = config.SEARCH_BACKEND.lower()
    backend_cls = backends.get(backend_name, DuckDuckGoSearchBackend)
    return backend_cls()


def _cache_key(query):
    """Generate a cache key for a search query."""
    return hashlib.md5(query.encode()).hexdigest()


def _get_cached(query):
    """Retrieve cached search results if available and fresh."""
    os.makedirs(config.CACHE_DIR, exist_ok=True)
    cache_file = os.path.join(config.CACHE_DIR, f"{_cache_key(query)}.json")
    if os.path.exists(cache_file):
        try:
            with open(cache_file, "r") as f:
                cached = json.load(f)
            cached_time = datetime.fromisoformat(cached["timestamp"])
            if datetime.now() - cached_time < timedelta(hours=config.CACHE_TTL_HOURS):
                return cached["results"]
        except (json.JSONDecodeError, KeyError):
            pass
    return None


def _set_cache(query, results):
    """Cache search results."""
    os.makedirs(config.CACHE_DIR, exist_ok=True)
    cache_file = os.path.join(config.CACHE_DIR, f"{_cache_key(query)}.json")
    with open(cache_file, "w") as f:
        json.dump({
            "query": query,
            "timestamp": datetime.now().isoformat(),
            "results": results,
        }, f, indent=2)


def search(query, num_results=None):
    """Perform a web search with caching and fallback across backends."""
    if num_results is None:
        num_results = config.MAX_SEARCH_RESULTS

    cached = _get_cached(query)
    if cached is not None:
        return cached

    # Try the configured backend first, then fall back to alternatives
    backend = get_search_backend()
    results = backend.search(query, num_results)

    if not results:
        # Fallback chain: try other backends
        fallback_order = [
            GoogleHtmlSearchBackend,
            DuckDuckGoSearchBackend,
            DuckDuckGoApiBackend,
        ]
        for fallback_cls in fallback_order:
            if not isinstance(backend, fallback_cls):
                fallback = fallback_cls()
                results = fallback.search(query, num_results)
                if results:
                    break

    if results:
        _set_cache(query, results)
    time.sleep(config.REQUEST_DELAY)
    return results


def fetch_page(url):
    """Fetch a page and return its text content."""
    session = requests.Session()
    session.headers.update({
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        )
    })
    try:
        resp = session.get(url, timeout=config.REQUEST_TIMEOUT)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        # Remove script and style elements
        for tag in soup(["script", "style", "nav", "footer", "header"]):
            tag.decompose()
        return soup.get_text(separator="\n", strip=True)
    except Exception as e:
        print(f"  [!] Failed to fetch {url}: {e}")
        return ""


def _extract_from_snippets(results, patterns):
    """Extract information matching patterns from search result snippets."""
    findings = []
    for r in results:
        text = f"{r.get('title', '')} {r.get('snippet', '')}"
        for pattern in patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            findings.extend(matches)
    return findings


def research_prospect(prospect_name, company_name):
    """Research a prospect and return structured data."""
    print(f"  Searching for {prospect_name}...")
    data = {
        "name": prospect_name,
        "company": company_name,
        "title": "Not found",
        "location": "Not found",
        "tenure": "Not found",
        "linkedin_url": "Not found",
        "work_history": [],
        "certifications": [],
        "achievements": [],
        "published_content": [],
        "team": "Not found",
    }

    # Search for LinkedIn profile
    print("  Searching LinkedIn profile...")
    linkedin_results = search(
        f"{prospect_name} {company_name} LinkedIn", num_results=5
    )
    for r in linkedin_results:
        url = r.get("url", "")
        if "linkedin.com/in/" in url:
            data["linkedin_url"] = url
            snippet = r.get("snippet", "")
            title_text = r.get("title", "")

            # Try to extract title from LinkedIn snippet
            combined = f"{title_text} | {snippet}"
            # Common patterns: "Name - Title at Company"
            title_match = re.search(
                rf"{re.escape(prospect_name)}\s*[-–|]\s*(.+?)(?:\s*[-–|]\s*LinkedIn|\s*$)",
                combined,
                re.IGNORECASE,
            )
            if title_match:
                data["title"] = title_match.group(1).strip()

            # Try to extract location
            loc_match = re.search(
                r"(?:located?\s+in|based\s+in|from)\s+([A-Z][a-zA-Z\s,]+?)(?:\.|,|\s*[-–|])",
                combined,
                re.IGNORECASE,
            )
            if loc_match:
                data["location"] = loc_match.group(1).strip()
            break

    # Search for role details
    print("  Searching role details...")
    role_results = search(
        f'"{prospect_name}" "{company_name}" role title', num_results=5
    )
    for r in role_results:
        snippet = r.get("snippet", "")
        # Look for title patterns
        for pattern in [
            rf"{re.escape(prospect_name)}[,\s]+(?:is\s+(?:the\s+)?)?(\w[\w\s]+?)\s+(?:at|of)\s+{re.escape(company_name)}",
            rf"(\w[\w\s]+?),?\s+{re.escape(prospect_name)}",
        ]:
            match = re.search(pattern, snippet, re.IGNORECASE)
            if match and data["title"] == "Not found":
                data["title"] = match.group(1).strip()

    # Search for work history and certifications
    print("  Searching work history...")
    history_results = search(
        f'"{prospect_name}" experience career history', num_results=5
    )
    for r in history_results:
        snippet = r.get("snippet", "")
        # Extract company names and roles
        exp_matches = re.findall(
            r"(?:at|with)\s+([\w\s&.]+?)(?:\s+as\s+|\s*[-–]\s*)([\w\s]+?)(?:\.|,|$)",
            snippet,
            re.IGNORECASE,
        )
        for company, role in exp_matches:
            entry = f"{company.strip()} - {role.strip()}"
            if entry not in data["work_history"]:
                data["work_history"].append(entry)

    # Search for certifications
    print("  Searching certifications...")
    cert_results = search(
        f'"{prospect_name}" certifications certified', num_results=5
    )
    for r in cert_results:
        snippet = r.get("snippet", "")
        cert_patterns = [
            r"(CISSP|CISM|CISA|CEH|CCSP|OSCP|GCIH|GCIA|CompTIA\s+\w+|AWS\s+\w+|Azure\s+\w+)",
            r"(?:certified|certification)\s+(?:in\s+)?([\w\s]+?)(?:\.|,|$)",
        ]
        for pattern in cert_patterns:
            matches = re.findall(pattern, snippet, re.IGNORECASE)
            for m in matches:
                cert = m.strip()
                if cert and cert not in data["certifications"]:
                    data["certifications"].append(cert)

    # Search for published content
    print("  Searching published content...")
    content_queries = [
        f'"{prospect_name}" blog article identity security',
        f'"{prospect_name}" conference talk keynote presentation',
        f'"{prospect_name}" {company_name} thought leadership deepfake fraud',
    ]
    for query in content_queries:
        results = search(query, num_results=5)
        for r in results:
            title = r.get("title", "")
            url = r.get("url", "")
            snippet = r.get("snippet", "")
            if prospect_name.split()[0].lower() in title.lower() or \
               prospect_name.split()[-1].lower() in title.lower():
                # Try to extract date
                date_match = re.search(
                    r"(\w+\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}|\w+\s+\d{4})",
                    snippet,
                )
                date_str = date_match.group(1) if date_match else ""
                entry = {
                    "title": title,
                    "url": url,
                    "date": date_str,
                    "type": "article",
                }
                if "conference" in snippet.lower() or "keynote" in snippet.lower() or \
                   "talk" in snippet.lower() or "summit" in snippet.lower():
                    entry["type"] = "talk"
                # Avoid duplicates
                if not any(c["url"] == url for c in data["published_content"]):
                    data["published_content"].append(entry)

    # Search for achievements in identity security
    print("  Searching achievements...")
    achievement_results = search(
        f'"{prospect_name}" identity security achievement award recognition',
        num_results=5,
    )
    for r in achievement_results:
        snippet = r.get("snippet", "")
        if any(kw in snippet.lower() for kw in [
            "award", "recognition", "leader", "pioneer", "innovation",
            "launched", "built", "led", "implemented", "founded",
        ]):
            # Clean up snippet to a concise achievement
            achievement = snippet[:200].strip()
            if achievement and achievement not in data["achievements"]:
                data["achievements"].append(achievement)

    return data


def research_company(company_name):
    """Research a company and return structured data."""
    print(f"  Searching for {company_name}...")
    data = {
        "name": company_name,
        "industry": "Not found",
        "size": "Not found",
        "headquarters": "Not found",
        "founded": "Not found",
        "ticker": "Not found",
        "website": "Not found",
        "customers": "Not found",
        "product_description": "Not found",
        "culture": "Not found",
        "employee_count": "Not found",
        "growth": "Not found",
        "hiring_activity": "Not found",
        "ats": "Not found",
        "open_remote_jobs": "Not found",
        "team_structure": "Not found",
        "identity_tools": [],
        "compliance": "Not found",
        "security_incidents": [],
    }

    # General company info
    print("  Searching company overview...")
    overview_results = search(
        f"{company_name} company overview industry headquarters founded", num_results=5
    )
    for r in overview_results:
        snippet = r.get("snippet", "")
        url = r.get("url", "")

        # Website
        if data["website"] == "Not found" and company_name.lower().replace(" ", "") in url.lower():
            data["website"] = url

        # Industry
        industry_match = re.search(
            r"(?:industry|sector)[\s:]+([A-Za-z\s&,]+?)(?:\.|$)",
            snippet,
            re.IGNORECASE,
        )
        if industry_match and data["industry"] == "Not found":
            data["industry"] = industry_match.group(1).strip()

        # Founded
        founded_match = re.search(
            r"(?:founded|established|started)\s+(?:in\s+)?(\d{4})",
            snippet,
            re.IGNORECASE,
        )
        if founded_match and data["founded"] == "Not found":
            data["founded"] = founded_match.group(1)

        # Headquarters
        hq_match = re.search(
            r"(?:headquartered|headquarters|based)\s+(?:in\s+)?([\w\s,]+?)(?:\.|$)",
            snippet,
            re.IGNORECASE,
        )
        if hq_match and data["headquarters"] == "Not found":
            data["headquarters"] = hq_match.group(1).strip()

    # Stock ticker
    print("  Searching stock information...")
    stock_results = search(f"{company_name} stock ticker NYSE NASDAQ", num_results=3)
    for r in stock_results:
        snippet = f"{r.get('title', '')} {r.get('snippet', '')}"
        ticker_match = re.search(
            r"(?:NYSE|NASDAQ|NYSE:\s*|NASDAQ:\s*)([A-Z]{1,5})",
            snippet,
        )
        if ticker_match and data["ticker"] == "Not found":
            exchange_match = re.search(r"(NYSE|NASDAQ)", snippet)
            exchange = exchange_match.group(1) if exchange_match else ""
            data["ticker"] = f"{exchange}: {ticker_match.group(1)}" if exchange else ticker_match.group(1)

    # Company size and employees
    print("  Searching company size...")
    size_results = search(f"{company_name} employees company size number of employees", num_results=5)
    for r in size_results:
        snippet = r.get("snippet", "")
        emp_match = re.search(
            r"(\d[\d,]+)\+?\s*(?:employees|workers|people|staff)",
            snippet,
            re.IGNORECASE,
        )
        if emp_match and data["employee_count"] == "Not found":
            data["employee_count"] = emp_match.group(1)
            data["size"] = f"{emp_match.group(1)} employees"

        # Growth
        growth_match = re.search(
            r"(\d+\.?\d*)%\s*(?:growth|increase|YoY|year.over.year)",
            snippet,
            re.IGNORECASE,
        )
        if growth_match and data["growth"] == "Not found":
            data["growth"] = f"{growth_match.group(1)}% YoY"

    # Product description and customers
    print("  Searching products and customers...")
    product_results = search(
        f"{company_name} product service solution customers", num_results=5
    )
    for r in product_results:
        snippet = r.get("snippet", "")
        if len(snippet) > 50 and data["product_description"] == "Not found":
            data["product_description"] = snippet[:300].strip()
        customer_match = re.search(
            r"(?:customers?|clients?)\s+(?:include|such as|like)\s+([\w\s,&]+?)(?:\.|$)",
            snippet,
            re.IGNORECASE,
        )
        if customer_match and data["customers"] == "Not found":
            data["customers"] = customer_match.group(1).strip()

    # ATS system
    print("  Searching ATS information...")
    ats_results = search(
        f"{company_name} applicant tracking system ATS careers jobs platform",
        num_results=5,
    )
    known_ats = [
        "Greenhouse", "Lever", "Workday", "iCIMS", "Taleo",
        "BambooHR", "JazzHR", "Ashby", "SmartRecruiters", "SAP SuccessFactors",
        "Jobvite", "Breezy HR", "Recruitee", "Pinpoint",
    ]
    for r in ats_results:
        snippet = f"{r.get('title', '')} {r.get('snippet', '')}"
        url = r.get("url", "")
        for ats in known_ats:
            if ats.lower() in snippet.lower() or ats.lower().replace(" ", "") in url.lower():
                if data["ats"] == "Not found":
                    data["ats"] = ats
                break
        # Check URL patterns
        ats_url_patterns = {
            "greenhouse.io": "Greenhouse",
            "lever.co": "Lever",
            "myworkdayjobs.com": "Workday",
            "icims.com": "iCIMS",
            "ashbyhq.com": "Ashby",
            "smartrecruiters.com": "SmartRecruiters",
        }
        for pattern, ats_name in ats_url_patterns.items():
            if pattern in url and data["ats"] == "Not found":
                data["ats"] = ats_name

    # Open remote jobs
    print("  Searching open positions...")
    jobs_results = search(f"{company_name} remote jobs open positions careers", num_results=5)
    for r in jobs_results:
        snippet = r.get("snippet", "")
        jobs_match = re.search(
            r"(\d+)\+?\s*(?:open|available|current)?\s*(?:positions|jobs|roles|openings)",
            snippet,
            re.IGNORECASE,
        )
        if jobs_match and data["open_remote_jobs"] == "Not found":
            data["open_remote_jobs"] = jobs_match.group(1)

    # Identity and security tools
    print("  Searching identity & security tools...")
    security_results = search(
        f"{company_name} identity access management IdP Okta Azure AD SSO MFA",
        num_results=5,
    )
    known_tools = {
        "Okta": "Identity Provider (IdP) - SSO & MFA",
        "Azure AD": "Microsoft Identity Provider",
        "Microsoft Entra": "Microsoft Identity Provider",
        "Ping Identity": "Identity Provider - SSO",
        "OneLogin": "Identity Provider - SSO & MFA",
        "Auth0": "Authentication Platform",
        "CrowdStrike": "Endpoint Security",
        "Duo": "Multi-Factor Authentication",
        "CyberArk": "Privileged Access Management",
        "SailPoint": "Identity Governance",
        "Zscaler": "Zero Trust Security",
        "Palo Alto": "Network Security",
        "Splunk": "SIEM / Security Analytics",
    }
    for r in security_results:
        snippet = f"{r.get('title', '')} {r.get('snippet', '')}"
        for tool, desc in known_tools.items():
            if tool.lower() in snippet.lower():
                entry = {"name": tool, "description": desc}
                if not any(t["name"] == tool for t in data["identity_tools"]):
                    data["identity_tools"].append(entry)

    # Compliance
    compliance_results = search(
        f"{company_name} compliance SOC2 ISO27001 GDPR HIPAA FedRAMP",
        num_results=5,
    )
    standards_found = []
    known_standards = ["SOC 2", "SOC2", "ISO 27001", "ISO27001", "GDPR", "HIPAA", "FedRAMP", "PCI DSS", "CCPA"]
    for r in compliance_results:
        snippet = f"{r.get('title', '')} {r.get('snippet', '')}"
        for std in known_standards:
            if std.lower() in snippet.lower() and std not in standards_found:
                standards_found.append(std)
    if standards_found:
        data["compliance"] = ", ".join(standards_found)

    # Security incidents
    print("  Searching security incidents...")
    incident_results = search(
        f"{company_name} data breach security incident hack", num_results=5
    )
    for r in incident_results:
        title = r.get("title", "")
        snippet = r.get("snippet", "")
        url = r.get("url", "")
        if any(kw in snippet.lower() for kw in [
            "breach", "hack", "incident", "compromised", "exposed",
            "vulnerability", "attack", "leaked",
        ]):
            date_match = re.search(
                r"(\w+\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}|\w+\s+\d{4})",
                snippet,
            )
            date_str = date_match.group(1) if date_match else "Unknown date"
            incident = {
                "date": date_str,
                "title": title[:100],
                "details": snippet[:300].strip(),
                "url": url,
            }
            if not any(i["title"] == incident["title"] for i in data["security_incidents"]):
                data["security_incidents"].append(incident)

    # Hiring-related security
    print("  Searching hiring security...")
    hiring_security_results = search(
        f"{company_name} hiring fraud recruitment identity verification background check",
        num_results=5,
    )
    hiring_security_notes = []
    for r in hiring_security_results:
        snippet = r.get("snippet", "")
        if any(kw in snippet.lower() for kw in [
            "hiring fraud", "identity verification", "background check",
            "recruitment fraud", "fake candidate", "deepfake",
        ]):
            hiring_security_notes.append(snippet[:200].strip())
    data["hiring_security_notes"] = hiring_security_notes

    # Culture
    print("  Searching company culture...")
    culture_results = search(
        f"{company_name} company culture glassdoor work environment values",
        num_results=3,
    )
    for r in culture_results:
        snippet = r.get("snippet", "")
        if len(snippet) > 30 and data["culture"] == "Not found":
            data["culture"] = snippet[:200].strip()

    return data


def export_research_to_json(prospect_data, company_data, output_path):
    """Export all research data to a JSON file."""
    combined = {
        "generated_at": datetime.now().isoformat(),
        "prospect": prospect_data,
        "company": company_data,
    }
    with open(output_path, "w") as f:
        json.dump(combined, f, indent=2)
    print(f"  Research data exported to {output_path}")
