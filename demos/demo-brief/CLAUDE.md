# CLAUDE.md - Demo Brief Generator

## What This Is

An internal sales tool that auto-researches a prospect from their LinkedIn URL and generates a formatted Demo Brief document. SDRs paste a LinkedIn URL, the tool scrapes data via APIs, and produces a one-page brief with prospect details, company info, hiring activity, and security posture.

## Tech Stack

- **HTML5 / CSS3 / Vanilla JS** — single-page app, no framework, no build step
- **Font:** Manrope via Google Fonts CDN
- **DOCX export:** [docx](https://unpkg.com/docx@9.5.0) loaded via UMD from unpkg CDN
- **APIs:** Netrows (LinkedIn data, primary), Serper (Google search, enrichment/fallback)

## File Structure

```
demos/demo-brief/
├── index.html          # UI: form, preview panel, settings modal
├── demo-brief.js       # All logic (~2600 lines, single IIFE)
├── demo-brief.css      # All styles (~920 lines)
└── CLAUDE.md           # This file
```

## Running Locally

Open `index.html` in a browser. No build step. API keys are configured via the settings gear icon (stored in localStorage under `clarity_demo_brief_settings`).

## Architecture

### Data Flow

```
LinkedIn URL → Parse slug/name
            → Netrows profile API (primary)
            → Netrows company API
            → Netrows job search (remote jobs)
            → Serper search queries (fallback/enrichment)
            → Extract structured data via regex/parsing
            → Populate form fields (editable)
            → Render HTML preview
            → Export as .docx
```

### Key Functions

**API Layer:**
- `callNetrowsAPI(endpoint, params)` — authenticated GET to Netrows REST API
- `netrowsProfileLookup(url)` — get LinkedIn profile data
- `netrowsCompanyLookup(url)` — get company details
- `netrowsJobSearch(keywords, opts)` — search jobs (for remote job count)
- `serperSearch(query, apiKey)` — POST to Serper Google search API

**Data Parsing:**
- `parseLinkedInUrl(url)` — extracts slug and inferred name from LinkedIn URL
- `parseNetrowsProfile(profile, companyName)` — maps Netrows response to internal data model
- `parseNetrowsCompany(companyData)` — maps Netrows company response to internal model

**Extraction (from Serper search results):**
- `extractTitle`, `extractLocation`, `extractTenure` — prospect info
- `extractEmployeeCount`, `extractFounded`, `extractTicker`, `extractIndustry`, `extractHQ` — company basics
- `extractATS`, `extractIdTools`, `extractCompliance`, `extractIncidents` — security/hiring
- `extractCustomers`, `extractCulture`, `extractAchievements`, `extractTeam` — enrichment
- `extractCompanyFromLinkedIn`, `extractCompanySizeFromLinkedIn`, `extractRemoteJobsFromLinkedIn` — LinkedIn-specific

**Research Pipeline:**
- `runResearch(linkedInUrl, companyName, apiKey)` — orchestrates the full async research flow with progress UI updates

**Output:**
- `renderPreview(data)` — generates HTML preview in the right panel
- `generateDocx(data)` — builds a `docx.Document` for .docx download
- `collectFormData()` — gathers all form fields into the data model

### Data Model

```js
{
  prospect: {
    name, title, location, company,
    company_tenure, role_tenure, linkedin_url,
    team, certifications: [],
    work_history: [], achievements: [],
    published_content: [{ title, url, type, date }]
  },
  company: {
    name, industry, size, headquarters,
    founded, ticker, website,
    product_description, customers, culture,
    employee_count, growth, ats,
    open_remote_jobs, hiring_activity, team_structure,
    identity_tools: [{ name, description }],
    compliance,
    security_incidents: [{ date, title, details }],
    hiring_security_notes: []
  },
  sdr_name
}
```

### Research Progress Steps

The research pipeline shows real-time progress for these steps:
1. **Parse URL** — extract name, detect company (Netrows or Serper fallback)
2. **Prospect Profile** — title, location, tenure, work history, certs
3. **Published Content** — articles, talks, blog posts
4. **Company Overview** — industry, size, HQ, founding, ticker, website
5. **Hiring & Recruitment** — ATS, employee count, growth, remote jobs
6. **Security Posture** — identity tools, compliance, incidents

### Settings & Storage

- API keys stored in `localStorage` under key `clarity_demo_brief_settings`
- Settings object: `{ serperApiKey, netrowsApiKey }`
- Settings modal has "Test Connection" to validate keys

### Research Logging

- Each API call during research is tracked in `debugResponses[]` with `label`, `query`, `results`, `extracted`, `source` (netrows/serper), and `timestamp`
- Logs are saved with each history entry as `research_logs` (trimmed — no raw JSON, only summaries to save localStorage space)
- Loading a past brief from history restores its research logs into the debug panel
- Debug panel shows source badges (blue NETROWS / yellow SERPER), timestamps, and a summary header with call counts per source
- `resetForNewBrief()` clears logs; `runResearch()` resets them at the start of each run

## UI Layout

- **Left panel:** Form with collapsible sections (Prospect Details, Company Details, Hiring & Recruitment, Identity & Security)
- **Right panel:** Live document preview + download button
- **Nav:** Clarity logo + settings gear
- **Research Progress:** Shows during research with step-by-step status dots
- **Debug Panel:** Togglable API response viewer with source badges, timestamps, and per-run log persistence

## Design Rules

- Follows the parent project's visual style: `#F0F4F8` background, `#0a1628` navy text, `#61F393` green accent
- CSS variables defined in `:root` (see `demo-brief.css`)
- No emojis — uses SVG icons throughout
- Professional, enterprise-grade aesthetic

## Common Modifications

**Adding a new extracted field:**
1. Add the extractor function (pattern: search results → regex/parse → value)
2. Add to the data model in `runResearch()`
3. Wire into the research pipeline (Netrows parse or Serper search)
4. Add form field in `index.html`
5. Add to `collectFormData()` and `populateForm()`
6. Add to `renderPreview()` for HTML output
7. Add to `generateDocx()` for DOCX output

**Adding a new research step:**
1. Add entry to `RESEARCH_TASKS` array
2. Add `setProgress()` calls in `runResearch()`
3. Add the API call and extraction logic

**Adding a new API source:**
1. Add API call function following `callNetrowsAPI` pattern
2. Add key to settings modal and `loadSettings`/`saveSettings`
3. Integrate into `runResearch()` pipeline
