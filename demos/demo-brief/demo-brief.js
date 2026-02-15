/**
 * Demo Brief Generator — Automated Research & Document Generation
 *
 * Flow: LinkedIn URL → Serper API search → extract data → preview → .docx
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'clarity_demo_brief_settings';
    var SERPER_URL = 'https://google.serper.dev/search';

    // ══════════════════════════════════════════
    // Settings (localStorage)
    // ══════════════════════════════════════════
    function loadSettings() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch (e) { return {}; }
    }
    function saveSettings(s) { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }
    function getApiKey() { return (loadSettings().serperApiKey || '').trim(); }

    // ══════════════════════════════════════════
    // LinkedIn URL Parser
    // ══════════════════════════════════════════
    function parseLinkedInUrl(url) {
        if (!url) return null;
        var match = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
        if (!match) return null;
        var slug = match[1].replace(/-+$/, '');
        // Remove trailing ID hashes (e.g. "anthony-scarfe-1a2b3c")
        var parts = slug.split('-');
        // If last part looks like hex/alphanumeric ID, remove it
        if (parts.length > 2 && /^[0-9a-f]{4,}$/i.test(parts[parts.length - 1])) {
            parts.pop();
        }
        var name = parts.map(function (p) {
            return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
        }).join(' ');
        return { name: name, slug: match[1], url: url.trim() };
    }

    // ══════════════════════════════════════════
    // Serper Search API
    // ══════════════════════════════════════════
    function serperSearch(query, apiKey) {
        return fetch(SERPER_URL, {
            method: 'POST',
            headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ q: query, num: 10 })
        }).then(function (r) {
            if (!r.ok) throw new Error('Search API error: ' + r.status);
            return r.json();
        });
    }

    function testApiKey(apiKey) {
        return serperSearch('test', apiKey).then(function () { return true; });
    }

    // ══════════════════════════════════════════
    // Data Extractors (from search snippets)
    // ══════════════════════════════════════════
    function allSnippets(results) {
        if (!results || !results.organic) return '';
        return results.organic.map(function (r) { return (r.title || '') + ' ' + (r.snippet || ''); }).join(' ');
    }

    function extractTitle(results, name) {
        var text = allSnippets(results);
        var titles = [
            'Chief Information Security Officer', 'Chief Technology Officer', 'Chief Information Officer',
            'VP of Security', 'VP of Engineering', 'VP Security', 'VP Engineering',
            'Head of Security', 'Head of Engineering', 'Head of IT', 'Head of Information Security',
            'Director of Security', 'Director of Engineering', 'Director of IT',
            'CISO', 'CTO', 'CIO', 'CSO', 'CPO', 'CEO', 'COO', 'CFO'
        ];
        for (var i = 0; i < titles.length; i++) {
            if (text.indexOf(titles[i]) !== -1) return titles[i];
        }
        // Try pattern: "Name, Title at Company" or "Name - Title"
        var re = new RegExp(name.split(' ')[0] + '[^.]*?(?:is|as|,|-|\\|)\\s*([A-Z][^.]{5,40}?)(?:\\s+at\\s|\\s+@\\s|\\s*[-|])', 'i');
        var m = text.match(re);
        if (m) return m[1].trim();
        return '';
    }

    function extractLocation(results) {
        var text = allSnippets(results);
        var patterns = [
            /(?:based in|located in|lives in|from)\s+([A-Z][a-zA-Z\s]+,\s*[A-Z]{2,})/i,
            /([A-Z][a-z]+(?:\s[A-Z][a-z]+)?,\s*(?:CA|NY|TX|WA|MA|IL|FL|GA|CO|VA|OR|PA|OH|NC|AZ|MD|NJ|CT|MN|WI|MO|TN|IN|MI|SC|DC|UK|Israel))/,
            /([A-Z][a-z]+(?:\s[A-Z][a-z]+)?\s+(?:Area|Metropolitan|Metro))/
        ];
        for (var i = 0; i < patterns.length; i++) {
            var m = text.match(patterns[i]);
            if (m) return m[1].trim();
        }
        return '';
    }

    function extractEmployeeCount(results) {
        var text = allSnippets(results);
        var patterns = [
            /([\d,]+)\s*(?:\+\s*)?employees/i,
            /(?:has|with|employs?|workforce of)\s*([\d,]+)/i,
            /([\d,]+)\s*(?:people|workers|staff)/i
        ];
        for (var i = 0; i < patterns.length; i++) {
            var m = text.match(patterns[i]);
            if (m) return m[1].replace(/,/g, '');
        }
        return '';
    }

    function extractFounded(results) {
        var text = allSnippets(results);
        var m = text.match(/(?:founded|established|started|incorporated)\s+(?:in\s+)?(\d{4})/i);
        return m ? m[1] : '';
    }

    function extractTicker(results) {
        var text = allSnippets(results);
        var m = text.match(/\(?(NYSE|NASDAQ|LSE|TSE)\s*[:]\s*([A-Z]{1,5})\)?/i);
        return m ? m[1].toUpperCase() + ': ' + m[2].toUpperCase() : '';
    }

    function extractIndustry(results) {
        var text = allSnippets(results);
        var industries = [
            'Enterprise Software', 'Cybersecurity', 'Cloud Computing', 'SaaS', 'FinTech',
            'Healthcare', 'E-commerce', 'Artificial Intelligence', 'Data Analytics',
            'Information Technology', 'Financial Services', 'Telecommunications',
            'Semiconductor', 'Biotechnology', 'Media', 'Retail', 'Manufacturing',
            'Professional Services', 'Consulting', 'Education', 'Real Estate',
            'Automotive', 'Aerospace', 'Defense', 'Energy', 'Insurance',
            'Human Resources', 'Marketing Technology', 'Developer Tools',
            'Security', 'Observability', 'Search', 'Database'
        ];
        for (var i = 0; i < industries.length; i++) {
            if (text.toLowerCase().indexOf(industries[i].toLowerCase()) !== -1) return industries[i];
        }
        return '';
    }

    function extractHQ(results) {
        var text = allSnippets(results);
        var m = text.match(/(?:headquartered|headquarters|HQ|based)\s+(?:in|at)\s+([A-Z][a-zA-Z\s]+,\s*[A-Z][a-zA-Z\s]*)/i);
        return m ? m[1].trim().replace(/\.$/, '') : '';
    }

    function extractWebsite(results, company) {
        if (!results || !results.organic) return '';
        for (var i = 0; i < results.organic.length; i++) {
            var link = results.organic[i].link || '';
            if (link.indexOf(company.toLowerCase()) !== -1 && !link.match(/linkedin|wikipedia|glassdoor|crunchbase/i)) {
                var m = link.match(/^(https?:\/\/[^/]+)/);
                if (m) return m[1];
            }
        }
        return '';
    }

    function extractATS(results) {
        var text = allSnippets(results);
        var systems = [
            'Greenhouse', 'Lever', 'Workday', 'iCIMS', 'Ashby', 'SmartRecruiters',
            'BambooHR', 'Taleo', 'SAP SuccessFactors', 'Jobvite', 'JazzHR',
            'Breezy HR', 'Recruitee', 'Pinpoint', 'Teamtailor'
        ];
        for (var i = 0; i < systems.length; i++) {
            if (text.indexOf(systems[i]) !== -1) return systems[i];
        }
        return '';
    }

    function extractIdTools(results) {
        var text = allSnippets(results);
        var tools = [
            { name: 'Okta', desc: 'IdP - SSO & MFA' },
            { name: 'Azure AD', desc: 'Identity & Access Management' },
            { name: 'Microsoft Entra', desc: 'Identity & Access Management' },
            { name: 'Ping Identity', desc: 'SSO & Federation' },
            { name: 'OneLogin', desc: 'Cloud Identity' },
            { name: 'CrowdStrike', desc: 'Endpoint Security' },
            { name: 'SailPoint', desc: 'Identity Governance' },
            { name: 'CyberArk', desc: 'Privileged Access Management' },
            { name: 'Duo Security', desc: 'MFA' },
            { name: 'Auth0', desc: 'Authentication Platform' },
            { name: 'ForgeRock', desc: 'Digital Identity' },
            { name: 'BeyondTrust', desc: 'Privileged Access' },
            { name: 'Zscaler', desc: 'Zero Trust Security' }
        ];
        var found = [];
        for (var i = 0; i < tools.length; i++) {
            if (text.indexOf(tools[i].name) !== -1) found.push(tools[i]);
        }
        return found;
    }

    function extractCompliance(results) {
        var text = allSnippets(results);
        var standards = ['SOC 2', 'SOC2', 'ISO 27001', 'GDPR', 'HIPAA', 'FedRAMP', 'PCI DSS', 'CCPA', 'SOX', 'NIST', 'CMMC'];
        var found = [];
        for (var i = 0; i < standards.length; i++) {
            if (text.indexOf(standards[i]) !== -1) found.push(standards[i].replace('SOC2', 'SOC 2'));
        }
        return found.length ? Array.from(new Set(found)).join(', ') : '';
    }

    function extractIncidents(results) {
        if (!results || !results.organic) return [];
        var incidents = [];
        results.organic.forEach(function (r) {
            var title = r.title || '';
            var snippet = r.snippet || '';
            if (/breach|hack|incident|leak|vulnerability|compromis|attack/i.test(title + ' ' + snippet)) {
                var dateMatch = snippet.match(/((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{4})/i);
                incidents.push({
                    date: dateMatch ? dateMatch[1] : '',
                    title: title.substring(0, 80),
                    details: snippet.substring(0, 150)
                });
            }
        });
        return incidents.slice(0, 3);
    }

    function extractPublishedContent(results, name) {
        if (!results || !results.organic) return [];
        var content = [];
        results.organic.forEach(function (r) {
            var title = r.title || '';
            var url = r.link || '';
            var snippet = r.snippet || '';
            // Skip LinkedIn and generic profiles
            if (/linkedin\.com|twitter\.com|x\.com/i.test(url)) return;
            var dateMatch = snippet.match(/((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}|\d{4})/i);
            var type = /talk|keynote|conference|summit|webinar|podcast|video/i.test(title + ' ' + snippet) ? 'talk' : 'article';
            content.push({ title: title.substring(0, 100), url: url, date: dateMatch ? dateMatch[1] : '', type: type });
        });
        return content.slice(0, 5);
    }

    function extractCerts(results) {
        var text = allSnippets(results);
        var certs = ['CISSP', 'CISM', 'CCSP', 'CISA', 'CEH', 'OSCP', 'CRISC', 'CGEIT', 'CompTIA Security+', 'AWS Solutions Architect', 'GIAC', 'GCIH', 'GSEC'];
        var found = [];
        for (var i = 0; i < certs.length; i++) {
            if (text.indexOf(certs[i]) !== -1) found.push(certs[i]);
        }
        return found;
    }

    function extractWorkHistory(results, name) {
        var items = [];
        if (!results || !results.organic) return items;
        var text = allSnippets(results);
        // Look for patterns like "Company - Role (Year-Year)" or "Role at Company"
        var patterns = [
            /([A-Z][a-zA-Z &.]+)\s*[-–]\s*([A-Z][a-zA-Z &/]+)\s*\((\d{4})\s*[-–]\s*(Present|\d{4})\)/gi,
            /([A-Z][a-zA-Z &/]+)\s+at\s+([A-Z][a-zA-Z &.]+)/gi
        ];
        var seen = {};
        var m;
        m = patterns[0].exec(text);
        while (m !== null) {
            var entry = m[1].trim() + ' - ' + m[2].trim() + ' (' + m[3] + '-' + m[4] + ')';
            if (!seen[entry]) { items.push(entry); seen[entry] = true; }
            m = patterns[0].exec(text);
        }
        return items.slice(0, 5);
    }

    // ══════════════════════════════════════════
    // Research Pipeline
    // ══════════════════════════════════════════
    var RESEARCH_TASKS = [
        { id: 'parse', label: 'Parsing LinkedIn URL' },
        { id: 'prospect', label: 'Researching prospect profile' },
        { id: 'content', label: 'Finding published content' },
        { id: 'company', label: 'Researching company overview' },
        { id: 'hiring', label: 'Analyzing hiring infrastructure' },
        { id: 'security', label: 'Mapping identity & security tools' },
        { id: 'incidents', label: 'Checking security incidents' }
    ];

    function buildProgressUI() {
        var list = document.getElementById('progress-list');
        list.innerHTML = '';
        RESEARCH_TASKS.forEach(function (t) {
            var item = document.createElement('div');
            item.className = 'progress-item';
            item.id = 'progress-' + t.id;
            item.innerHTML =
                '<div class="progress-dot pending" id="dot-' + t.id + '"></div>' +
                '<span class="progress-label muted">' + t.label + '</span>' +
                '<span class="progress-detail" id="detail-' + t.id + '"></span>';
            list.appendChild(item);
        });
    }

    function setProgress(id, status, detail) {
        var dot = document.getElementById('dot-' + id);
        var label = document.querySelector('#progress-' + id + ' .progress-label');
        var detailEl = document.getElementById('detail-' + id);
        if (!dot) return;
        dot.className = 'progress-dot ' + status;
        if (status === 'done') dot.innerHTML = '&#10003;';
        else if (status === 'error') dot.innerHTML = '&#10007;';
        else dot.innerHTML = '';
        if (label) label.className = 'progress-label' + (status === 'pending' ? ' muted' : '');
        if (detailEl && detail) detailEl.textContent = detail;
    }

    async function runResearch(linkedInUrl, companyName, apiKey) {
        var parsed = parseLinkedInUrl(linkedInUrl);
        if (!parsed) throw new Error('Invalid LinkedIn URL');

        var name = parsed.name;
        var data = {
            prospect: {
                name: name,
                company: companyName,
                title: '', location: '', tenure: '',
                linkedin_url: parsed.url,
                team: '', certifications: [],
                work_history: [], achievements: [],
                published_content: []
            },
            company: {
                name: companyName,
                industry: '', size: '', headquarters: '',
                founded: '', ticker: '', website: '',
                product_description: '', customers: '', culture: '',
                employee_count: '', growth: '', ats: '',
                open_remote_jobs: '', hiring_activity: '',
                team_structure: '',
                identity_tools: [], compliance: '',
                security_incidents: [], hiring_security_notes: []
            },
            sdr_name: document.getElementById('sdr-name').value.trim()
        };

        // Step 1: Parse URL
        setProgress('parse', 'active');
        await delay(200);
        setProgress('parse', 'done', name);

        // Step 2: Prospect profile
        setProgress('prospect', 'active');
        try {
            var prospectResults = await serperSearch('"' + name + '" "' + companyName + '" LinkedIn profile', apiKey);
            data.prospect.title = extractTitle(prospectResults, name);
            data.prospect.location = extractLocation(prospectResults);
            data.prospect.certifications = extractCerts(prospectResults);
            data.prospect.work_history = extractWorkHistory(prospectResults, name);
            var found = [];
            if (data.prospect.title) found.push(data.prospect.title);
            if (data.prospect.location) found.push(data.prospect.location);
            setProgress('prospect', 'done', found.join(' | ') || 'Limited data');
        } catch (e) {
            setProgress('prospect', 'error', e.message);
        }

        // Step 3: Published content
        setProgress('content', 'active');
        try {
            var contentResults = await serperSearch('"' + name + '" blog OR article OR keynote OR conference identity security fraud', apiKey);
            data.prospect.published_content = extractPublishedContent(contentResults, name);
            setProgress('content', 'done', data.prospect.published_content.length + ' items found');
        } catch (e) {
            setProgress('content', 'error', e.message);
        }

        // Step 4: Company overview
        setProgress('company', 'active');
        try {
            var companyResults = await serperSearch(companyName + ' company overview employees headquarters founded industry', apiKey);
            data.company.industry = extractIndustry(companyResults);
            data.company.founded = extractFounded(companyResults);
            data.company.ticker = extractTicker(companyResults);
            data.company.headquarters = extractHQ(companyResults);
            data.company.website = extractWebsite(companyResults, companyName);
            data.company.employee_count = extractEmployeeCount(companyResults);
            data.company.size = data.company.employee_count ? data.company.employee_count + ' employees' : '';
            var companyFound = [data.company.industry, data.company.headquarters].filter(Boolean);
            setProgress('company', 'done', companyFound.join(' | ') || 'Limited data');
        } catch (e) {
            setProgress('company', 'error', e.message);
        }

        // Step 5: Hiring infrastructure
        setProgress('hiring', 'active');
        try {
            var hiringResults = await serperSearch(companyName + ' careers ATS applicant tracking system hiring remote jobs', apiKey);
            data.company.ats = extractATS(hiringResults);
            setProgress('hiring', 'done', data.company.ats ? 'ATS: ' + data.company.ats : 'Limited data');
        } catch (e) {
            setProgress('hiring', 'error', e.message);
        }

        // Step 6: Security tools
        setProgress('security', 'active');
        try {
            var secResults = await serperSearch(companyName + ' identity access management Okta "Azure AD" SSO MFA compliance SOC', apiKey);
            data.company.identity_tools = extractIdTools(secResults);
            data.company.compliance = extractCompliance(secResults);
            var secFound = data.company.identity_tools.map(function (t) { return t.name; }).join(', ');
            setProgress('security', 'done', secFound || 'Limited data');
        } catch (e) {
            setProgress('security', 'error', e.message);
        }

        // Step 7: Security incidents
        setProgress('incidents', 'active');
        try {
            var incResults = await serperSearch(companyName + ' security breach incident data leak 2024 2025 2026', apiKey);
            data.company.security_incidents = extractIncidents(incResults);
            setProgress('incidents', 'done', data.company.security_incidents.length + ' incidents found');
        } catch (e) {
            setProgress('incidents', 'error', e.message);
        }

        return data;
    }

    function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

    // ══════════════════════════════════════════
    // Logo Upload State
    // ══════════════════════════════════════════
    var logoData = null;

    // ══════════════════════════════════════════
    // UI: Settings Modal
    // ══════════════════════════════════════════
    var settingsModal = document.getElementById('settings-modal');
    var settingsBtn = document.getElementById('open-settings-btn');
    var closeSettingsBtn = document.getElementById('close-settings-btn');
    var saveSettingsBtn = document.getElementById('save-settings-btn');
    var testApiBtn = document.getElementById('test-api-btn');
    var apiKeyInput = document.getElementById('serper-api-key');
    var apiStatus = document.getElementById('api-status');

    function updateSettingsIndicator() {
        if (getApiKey()) {
            settingsBtn.classList.add('configured');
            document.getElementById('research-btn').classList.remove('no-api');
        } else {
            settingsBtn.classList.remove('configured');
            document.getElementById('research-btn').classList.add('no-api');
        }
    }

    settingsBtn.addEventListener('click', function () {
        settingsModal.style.display = '';
        apiKeyInput.value = getApiKey();
        apiStatus.textContent = '';
        apiStatus.className = 'api-status';
    });

    closeSettingsBtn.addEventListener('click', function () { settingsModal.style.display = 'none'; });
    settingsModal.addEventListener('click', function (e) { if (e.target === settingsModal) settingsModal.style.display = 'none'; });

    saveSettingsBtn.addEventListener('click', function () {
        saveSettings({ serperApiKey: apiKeyInput.value.trim() });
        updateSettingsIndicator();
        settingsModal.style.display = 'none';
        showToast('Settings saved', 'success');
    });

    testApiBtn.addEventListener('click', function () {
        var key = apiKeyInput.value.trim();
        if (!key) { apiStatus.textContent = 'Enter an API key first'; apiStatus.className = 'api-status error'; return; }
        apiStatus.textContent = 'Testing...';
        apiStatus.className = 'api-status';
        testApiKey(key).then(function () {
            apiStatus.textContent = 'Connection successful';
            apiStatus.className = 'api-status success';
        }).catch(function (e) {
            apiStatus.textContent = 'Failed: ' + e.message;
            apiStatus.className = 'api-status error';
        });
    });

    // ══════════════════════════════════════════
    // UI: LinkedIn URL parsing (live hint)
    // ══════════════════════════════════════════
    var linkedInInput = document.getElementById('linkedin-url');
    var linkedInHint = document.getElementById('linkedin-hint');

    linkedInInput.addEventListener('input', function () {
        var val = this.value.trim();
        if (!val) { linkedInHint.textContent = ''; linkedInHint.className = 'input-hint'; return; }
        var parsed = parseLinkedInUrl(val);
        if (parsed) {
            linkedInHint.textContent = 'Detected: ' + parsed.name;
            linkedInHint.className = 'input-hint success';
            // Auto-fill prospect name
            document.getElementById('prospect-name').value = parsed.name;
        } else {
            linkedInHint.textContent = 'Not a valid LinkedIn profile URL';
            linkedInHint.className = 'input-hint error';
        }
    });

    // ══════════════════════════════════════════
    // UI: Research Button
    // ══════════════════════════════════════════
    var researchBtn = document.getElementById('research-btn');
    var researchProgress = document.getElementById('research-progress');
    var previewEmpty = document.getElementById('preview-empty');
    var previewDoc = document.getElementById('preview-doc');
    var previewLoading = document.getElementById('preview-loading');
    var previewLoadingText = document.getElementById('preview-loading-text');
    var previewActions = document.getElementById('preview-actions');

    researchBtn.addEventListener('click', async function () {
        var url = linkedInInput.value.trim();
        var company = document.getElementById('company-name').value.trim();
        var sdr = document.getElementById('sdr-name').value.trim();

        if (!url) { showToast('Enter a LinkedIn URL', 'error'); linkedInInput.focus(); return; }
        if (!company) { showToast('Enter a company name', 'error'); document.getElementById('company-name').focus(); return; }
        if (!sdr) { showToast('Enter SDR name', 'error'); document.getElementById('sdr-name').focus(); return; }

        var apiKey = getApiKey();
        if (!apiKey) {
            settingsModal.style.display = '';
            apiKeyInput.focus();
            showToast('Add your Serper API key to enable research', 'error');
            return;
        }

        // Show progress
        researchBtn.disabled = true;
        researchBtn.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;"></div> Researching...';
        researchProgress.style.display = '';
        buildProgressUI();
        previewEmpty.style.display = 'none';
        previewDoc.style.display = 'none';
        previewLoading.style.display = '';
        previewLoadingText.textContent = 'Researching ' + company + '...';

        try {
            var data = await runResearch(url, company, apiKey);

            // Populate form with results
            populateFormFromData(data);

            // Open all sections so user sees results
            document.querySelectorAll('.form-section-body').forEach(function (body) { body.classList.add('open'); });
            document.querySelectorAll('.form-section-toggle').forEach(function (btn) { btn.classList.add('open'); });

            // Render preview
            renderPreview(data);
            previewLoading.style.display = 'none';
            previewDoc.style.display = '';
            previewActions.style.display = '';
            window._lastBriefData = data;

            showToast('Research complete — review and edit below', 'success');
        } catch (e) {
            previewLoading.style.display = 'none';
            previewEmpty.style.display = '';
            showToast('Research failed: ' + e.message, 'error');
        }

        researchBtn.disabled = false;
        researchBtn.innerHTML =
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
            ' Research &amp; Generate';
    });

    // ══════════════════════════════════════════
    // UI: Collapsible Sections
    // ══════════════════════════════════════════
    document.querySelectorAll('.form-section-toggle').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var sectionId = this.getAttribute('data-section');
            var body = document.getElementById(sectionId);
            if (!body) return;
            var isOpen = body.classList.toggle('open');
            this.classList.toggle('open', isOpen);
        });
    });

    // ══════════════════════════════════════════
    // UI: Logo Upload
    // ══════════════════════════════════════════
    var logoUploadArea = document.getElementById('logo-upload-area');
    var logoUploadInner = document.getElementById('logo-upload-inner');
    var logoFileInput = document.getElementById('logo-file');
    var logoPreview = document.getElementById('logo-preview');
    var logoPreviewImg = document.getElementById('logo-preview-img');
    var logoRemoveBtn = document.getElementById('logo-remove-btn');

    logoUploadInner.addEventListener('click', function () { logoFileInput.click(); });
    logoUploadArea.addEventListener('dragover', function (e) { e.preventDefault(); logoUploadArea.classList.add('dragover'); });
    logoUploadArea.addEventListener('dragleave', function () { logoUploadArea.classList.remove('dragover'); });
    logoUploadArea.addEventListener('drop', function (e) {
        e.preventDefault();
        logoUploadArea.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) handleLogoFile(e.dataTransfer.files[0]);
    });
    logoFileInput.addEventListener('change', function () {
        if (this.files.length > 0) handleLogoFile(this.files[0]);
    });
    logoRemoveBtn.addEventListener('click', function () {
        logoData = null;
        logoFileInput.value = '';
        logoPreview.style.display = 'none';
        logoUploadInner.style.display = '';
    });

    function handleLogoFile(file) {
        if (['image/png', 'image/jpeg', 'image/svg+xml'].indexOf(file.type) === -1) {
            showToast('Upload PNG, JPG, or SVG', 'error');
            return;
        }
        var reader = new FileReader();
        reader.onload = function (e) {
            logoData = { dataUrl: e.target.result, fileName: file.name };
            logoPreviewImg.src = e.target.result;
            logoPreview.style.display = '';
            logoUploadInner.style.display = 'none';
        };
        reader.readAsDataURL(file);
    }

    // ══════════════════════════════════════════
    // UI: Repeaters
    // ══════════════════════════════════════════
    document.getElementById('add-content-btn').addEventListener('click', function () { addRepeaterItem('published-content-list', 'content'); });
    document.getElementById('add-tool-btn').addEventListener('click', function () { addRepeaterItem('identity-tools-list', 'tool'); });
    document.getElementById('add-incident-btn').addEventListener('click', function () { addRepeaterItem('incidents-list', 'incident'); });

    function addRepeaterItem(listId, type) {
        var list = document.getElementById(listId);
        var item = document.createElement('div');
        item.className = 'repeater-item';
        var fields = document.createElement('div');
        fields.className = 'repeater-fields';
        if (type === 'content') {
            fields.innerHTML = '<input type="text" placeholder="Title" class="rep-title"><input type="url" placeholder="URL" class="rep-url"><div style="display:flex;gap:6px;"><input type="text" placeholder="Date" class="rep-date" style="flex:1;"><select class="rep-type" style="flex:1;"><option value="article">Article</option><option value="talk">Talk</option></select></div>';
        } else if (type === 'tool') {
            fields.innerHTML = '<input type="text" placeholder="Tool name" class="rep-name"><input type="text" placeholder="Description" class="rep-desc">';
        } else if (type === 'incident') {
            fields.innerHTML = '<input type="text" placeholder="Date" class="rep-date"><input type="text" placeholder="Title" class="rep-title"><input type="text" placeholder="Details" class="rep-details">';
        }
        var removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'btn-remove';
        removeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        removeBtn.addEventListener('click', function () { item.remove(); });
        item.appendChild(fields);
        item.appendChild(removeBtn);
        list.appendChild(item);
    }

    // ══════════════════════════════════════════
    // Collect Form Data
    // ══════════════════════════════════════════
    function collectFormData() {
        var atsSelect = document.getElementById('company-ats').value;
        var atsCustom = document.getElementById('company-ats-custom').value.trim();
        return {
            prospect: {
                name: document.getElementById('prospect-name').value.trim(),
                company: document.getElementById('company-name').value.trim(),
                title: document.getElementById('prospect-title').value.trim(),
                location: document.getElementById('prospect-location').value.trim(),
                tenure: document.getElementById('prospect-tenure').value.trim(),
                linkedin_url: document.getElementById('linkedin-url').value.trim(),
                team: document.getElementById('prospect-team').value.trim(),
                certifications: splitLines(document.getElementById('prospect-certs').value, ','),
                work_history: splitLines(document.getElementById('prospect-history').value),
                achievements: splitLines(document.getElementById('prospect-achievements').value),
                published_content: collectRepeater('published-content-list', 'content')
            },
            company: {
                name: document.getElementById('company-name').value.trim(),
                industry: document.getElementById('company-industry').value.trim(),
                size: document.getElementById('company-size').value.trim(),
                headquarters: document.getElementById('company-hq').value.trim(),
                founded: document.getElementById('company-founded').value.trim(),
                ticker: document.getElementById('company-ticker').value.trim(),
                website: document.getElementById('company-website').value.trim(),
                product_description: document.getElementById('company-product').value.trim(),
                customers: document.getElementById('company-customers').value.trim(),
                culture: document.getElementById('company-culture').value.trim(),
                employee_count: document.getElementById('company-employees').value.trim(),
                growth: document.getElementById('company-growth').value.trim(),
                ats: atsCustom || atsSelect || '',
                open_remote_jobs: document.getElementById('company-remote-jobs').value.trim(),
                hiring_activity: document.getElementById('company-hiring-activity').value.trim(),
                team_structure: document.getElementById('company-team-structure').value.trim(),
                identity_tools: collectRepeater('identity-tools-list', 'tool'),
                compliance: document.getElementById('company-compliance').value.trim(),
                security_incidents: collectRepeater('incidents-list', 'incident'),
                hiring_security_notes: splitLines(document.getElementById('hiring-security-notes').value)
            },
            sdr_name: document.getElementById('sdr-name').value.trim()
        };
    }

    function splitLines(text, sep) {
        if (!text) return [];
        return text.split(sep || '\n').map(function (s) { return s.trim(); }).filter(Boolean);
    }

    function collectRepeater(listId, type) {
        var items = [];
        document.getElementById(listId).querySelectorAll('.repeater-item').forEach(function (el) {
            if (type === 'content') {
                var t = el.querySelector('.rep-title').value.trim();
                if (t) items.push({ title: t, url: el.querySelector('.rep-url').value.trim(), date: el.querySelector('.rep-date').value.trim(), type: el.querySelector('.rep-type').value });
            } else if (type === 'tool') {
                var n = el.querySelector('.rep-name').value.trim();
                if (n) items.push({ name: n, description: el.querySelector('.rep-desc').value.trim() });
            } else if (type === 'incident') {
                var it = el.querySelector('.rep-title').value.trim();
                if (it) items.push({ date: el.querySelector('.rep-date').value.trim(), title: it, details: el.querySelector('.rep-details').value.trim() });
            }
        });
        return items;
    }

    // ══════════════════════════════════════════
    // Populate Form from Data
    // ══════════════════════════════════════════
    function populateFormFromData(data) {
        var p = data.prospect || {};
        var c = data.company || {};
        setVal('prospect-name', p.name);
        setVal('company-name', c.name || p.company);
        setVal('sdr-name', data.sdr_name);
        setVal('prospect-title', p.title);
        setVal('prospect-location', p.location);
        setVal('prospect-tenure', p.tenure);
        if (p.linkedin_url) setVal('linkedin-url', p.linkedin_url);
        setVal('prospect-team', p.team);
        setVal('prospect-certs', (p.certifications || []).join(', '));
        setVal('prospect-history', (p.work_history || []).join('\n'));
        setVal('prospect-achievements', (p.achievements || []).join('\n'));
        setVal('company-industry', c.industry);
        setVal('company-size', c.size);
        setVal('company-hq', c.headquarters);
        setVal('company-founded', c.founded);
        setVal('company-ticker', c.ticker);
        setVal('company-website', c.website);
        setVal('company-product', c.product_description);
        setVal('company-customers', c.customers);
        setVal('company-culture', c.culture);
        setVal('company-employees', c.employee_count);
        setVal('company-growth', c.growth);
        setVal('company-remote-jobs', c.open_remote_jobs);
        setVal('company-hiring-activity', c.hiring_activity);
        setVal('company-team-structure', c.team_structure);
        setVal('company-compliance', c.compliance);
        setVal('hiring-security-notes', (c.hiring_security_notes || []).join('\n'));

        // ATS
        var atsSelect = document.getElementById('company-ats');
        var matched = false;
        for (var i = 0; i < atsSelect.options.length; i++) {
            if (atsSelect.options[i].value === c.ats) { atsSelect.selectedIndex = i; matched = true; break; }
        }
        if (!matched) { atsSelect.selectedIndex = 0; setVal('company-ats-custom', c.ats); }

        // Repeaters
        clearAndPopulateRepeater('published-content-list', 'content', p.published_content || []);
        clearAndPopulateRepeater('identity-tools-list', 'tool', c.identity_tools || []);
        clearAndPopulateRepeater('incidents-list', 'incident', c.security_incidents || []);
    }

    function setVal(id, val) {
        var el = document.getElementById(id);
        if (el && val && val !== 'Not found') el.value = val;
    }

    function clearAndPopulateRepeater(listId, type, items) {
        document.getElementById(listId).innerHTML = '';
        items.forEach(function (item) {
            addRepeaterItem(listId, type);
            var last = document.querySelector('#' + listId + ' .repeater-item:last-child');
            if (type === 'content') {
                last.querySelector('.rep-title').value = item.title || '';
                last.querySelector('.rep-url').value = item.url || '';
                last.querySelector('.rep-date').value = item.date || '';
                last.querySelector('.rep-type').value = item.type || 'article';
            } else if (type === 'tool') {
                last.querySelector('.rep-name').value = item.name || '';
                last.querySelector('.rep-desc').value = item.description || '';
            } else if (type === 'incident') {
                last.querySelector('.rep-date').value = item.date || '';
                last.querySelector('.rep-title').value = item.title || '';
                last.querySelector('.rep-details').value = item.details || '';
            }
        });
    }

    // ══════════════════════════════════════════
    // JSON Import / Export
    // ══════════════════════════════════════════
    document.getElementById('export-json-btn').addEventListener('click', function () {
        var data = collectFormData();
        var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = (data.prospect.name || 'prospect').replace(/\s+/g, '_') + '_-_' + (data.company.name || 'company').replace(/\s+/g, '_') + '_-_Research.json';
        a.click();
        URL.revokeObjectURL(a.href);
        showToast('JSON exported', 'success');
    });

    document.getElementById('import-json-btn').addEventListener('click', function () {
        var raw = document.getElementById('json-input').value.trim();
        if (!raw) { showToast('Paste JSON first', 'error'); return; }
        try {
            populateFormFromData(JSON.parse(raw));
            document.querySelectorAll('.form-section-body').forEach(function (b) { b.classList.add('open'); });
            document.querySelectorAll('.form-section-toggle').forEach(function (b) { b.classList.add('open'); });
            showToast('Data imported', 'success');
        } catch (e) {
            showToast('Invalid JSON: ' + e.message, 'error');
        }
    });

    // ══════════════════════════════════════════
    // Generate Brief (manual, from form)
    // ══════════════════════════════════════════
    var form = document.getElementById('brief-form');
    form.addEventListener('submit', function (e) {
        e.preventDefault();
        var name = document.getElementById('prospect-name').value.trim();
        var company = document.getElementById('company-name').value.trim();
        var sdr = document.getElementById('sdr-name').value.trim();
        if (!name || !company || !sdr) { showToast('Fill in all required fields', 'error'); return; }
        var data = collectFormData();
        previewEmpty.style.display = 'none';
        previewLoading.style.display = '';
        previewLoadingText.textContent = 'Generating document...';
        setTimeout(function () {
            renderPreview(data);
            previewLoading.style.display = 'none';
            previewDoc.style.display = '';
            previewActions.style.display = '';
            window._lastBriefData = data;
            showToast('Brief generated', 'success');
        }, 300);
    });

    // ══════════════════════════════════════════
    // Preview Renderer
    // ══════════════════════════════════════════
    function renderPreview(data) {
        var p = data.prospect, c = data.company, sdr = data.sdr_name;
        var nf = function (v) { return !v || v === 'Not found'; };
        var val = function (v) { return nf(v) ? '<span class="not-found">Not found</span>' : escHtml(v); };
        var linkVal = function (text, url) { return nf(url) ? val(text) : '<a href="' + escHtml(url) + '" target="_blank">' + escHtml(text) + '</a>'; };

        var headerRight = logoData ? '<div class="doc-header-right"><img src="' + logoData.dataUrl + '" alt="Logo"><div class="doc-company-tag">' + escHtml(c.name) + '</div></div>' : '';
        var html = '<div class="doc-header"><div class="doc-header-left"><h1>Demo Brief</h1><div class="doc-prospect-name">' + escHtml(p.name) + '</div><div class="doc-sdr">SDR: ' + escHtml(sdr) + '</div></div>' + headerRight + '</div>';

        var role = nf(p.title) ? '' : p.title;
        if (p.tenure && !nf(p.tenure)) role += (role ? ' - ' : '') + p.tenure;
        var ats = c.ats || '';

        html += '<table class="doc-info-table">';
        [['Company', linkVal(c.name, c.website)], ['Name', linkVal(p.name, p.linkedin_url)], ['Prospect Location', val(p.location)], ['Role', val(role)], ['Company Size', val(c.size)], ['Industry', val(c.industry)], ['ATS', val(ats)], ['Current Open Remote Jobs', val(c.open_remote_jobs)], ['Headquarters', val(c.headquarters)]].forEach(function (r) {
            html += '<tr><td class="label-cell">' + r[0] + '</td><td>' + r[1] + '</td></tr>';
        });
        html += '</table>';

        // About prospect
        html += '<div class="doc-section"><div class="doc-section-title">About ' + escHtml(p.name) + '</div>';
        html += '<ul class="doc-bullets">' + bullet('Role: ' + (nf(p.title) ? '' : p.title), nf(p.title)) + bullet('Team: ' + (nf(p.team) ? '' : p.team), nf(p.team)) + bullet('Certifications: ' + (p.certifications && p.certifications.length ? p.certifications.join(', ') : ''), !(p.certifications && p.certifications.length)) + '</ul>';

        html += '<div class="doc-sub-header">Work History:</div>';
        if (p.work_history && p.work_history.length) { html += '<ul class="doc-bullets">'; p.work_history.forEach(function (w) { html += '<li>' + escHtml(w) + '</li>'; }); html += '</ul>'; }
        else html += '<p class="doc-note red">Note: Work history not found.</p>';

        html += '<div class="doc-sub-header">Notable Achievements:</div>';
        if (p.achievements && p.achievements.length) { html += '<ul class="doc-bullets">'; p.achievements.forEach(function (a) { html += '<li>' + escHtml(a) + '</li>'; }); html += '</ul>'; }
        else html += '<p class="doc-note red">Note: No specific achievements found.</p>';

        html += '<div class="doc-sub-header">Published Content:</div>';
        if (p.published_content && p.published_content.length) {
            html += '<ul class="doc-bullets">';
            p.published_content.forEach(function (pc) {
                var prefix = pc.type === 'talk' ? '[Talk] ' : '';
                var date = pc.date ? ' (' + escHtml(pc.date) + ')' : '';
                html += pc.url ? '<li>' + escHtml(prefix) + '<a href="' + escHtml(pc.url) + '" target="_blank">' + escHtml(pc.title) + '</a>' + date + '</li>' : '<li>' + escHtml(prefix + pc.title) + date + '</li>';
            });
            html += '</ul>';
        } else html += '<p class="doc-note gray">Note: No published content found.</p>';
        html += '</div>';

        // Company
        html += '<div class="doc-section"><div class="doc-section-title">Company Overview</div>';
        var basics = ['Founded: ' + (nf(c.founded) ? 'N/A' : c.founded)];
        if (!nf(c.ticker)) basics.push('Public: ' + c.ticker);
        basics.push('HQ: ' + (nf(c.headquarters) ? 'N/A' : c.headquarters));
        html += '<ul class="doc-bullets"><li>' + escHtml(basics.join(' | ')) + '</li>';
        html += bullet('Product: ' + (nf(c.product_description) ? '' : c.product_description), nf(c.product_description));
        html += bullet('Customers: ' + (nf(c.customers) ? '' : c.customers), nf(c.customers));
        html += bullet('Culture: ' + (nf(c.culture) ? '' : c.culture), nf(c.culture));
        html += '</ul>';

        html += '<div class="doc-sub-header">Hiring Growth & Recruitment:</div><ul class="doc-bullets">';
        var empText = 'Employees: ' + (nf(c.employee_count) ? 'N/A' : c.employee_count);
        if (!nf(c.growth)) empText += ' | Growth: ' + c.growth;
        html += '<li>' + escHtml(empText) + '</li>';
        html += bullet('ATS: ' + (nf(ats) ? 'N/A' : ats), nf(ats));
        html += bullet('Open Roles: ' + (nf(c.open_remote_jobs) ? 'N/A' : c.open_remote_jobs), nf(c.open_remote_jobs));
        html += '</ul>';

        html += '<div class="doc-sub-header">Identity & Access Tools:</div>';
        if (c.identity_tools && c.identity_tools.length) {
            html += '<ul class="doc-bullets">';
            c.identity_tools.forEach(function (t) { html += '<li><strong>' + escHtml(t.name) + '</strong> - ' + escHtml(t.description) + '</li>'; });
            html += '</ul>';
        } else html += '<p class="doc-note red">Note: No identity tools identified.</p>';
        html += '<ul class="doc-bullets">' + bullet('Compliance: ' + (nf(c.compliance) ? 'N/A' : c.compliance), nf(c.compliance)) + '</ul>';

        html += '<div class="doc-sub-header">Security Incidents:</div>';
        if (c.security_incidents && c.security_incidents.length) {
            html += '<ul class="doc-bullets">';
            c.security_incidents.forEach(function (inc) {
                html += '<li><strong>' + escHtml(inc.date + ': ' + inc.title) + '</strong></li>';
                if (inc.details) html += '<ul class="doc-sub-bullets"><li>' + escHtml(inc.details) + '</li></ul>';
            });
            html += '</ul>';
        } else html += '<ul class="doc-bullets"><li class="muted">No recent security incidents found.</li></ul>';
        html += '</div>';

        document.getElementById('doc-page').innerHTML = html;
    }

    function bullet(text, isMissing) {
        return isMissing ? '<li class="not-found">' + escHtml(text || 'Not found') + '</li>' : '<li>' + escHtml(text) + '</li>';
    }

    function escHtml(text) {
        if (!text) return '';
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ══════════════════════════════════════════
    // DOCX Generation
    // ══════════════════════════════════════════
    function generateDocx(data) {
        var D = window.docx;
        if (!D) return null;
        var p = data.prospect, c = data.company, sdr = data.sdr_name;
        var nf = function (v) { return !v || v === 'Not found'; };
        var NAVY = '0a1628', GRAY = '64748B', RED = 'EF4444', LINK_BLUE = '0066CC', HEADER_BG = 'FFF4E6';

        function tr(text, opts) { opts = opts || {}; return new D.TextRun({ text: text, font: 'Arial', size: opts.size || 20, bold: opts.bold, italics: opts.italic, color: opts.color || NAVY }); }
        function hl(text, url) { return new D.ExternalHyperlink({ children: [new D.TextRun({ text: text, font: 'Arial', size: 20, color: LINK_BLUE, underline: { type: D.UnderlineType.SINGLE } })], link: url }); }
        function bp(text, opts) { opts = opts || {}; return new D.Paragraph({ bullet: { level: opts.level || 0 }, spacing: { after: 40, before: 20 }, children: [tr(text, opts)] }); }
        function sh(text) { return new D.Paragraph({ spacing: { before: 240, after: 80 }, children: [tr(text, { size: 28, bold: true })] }); }
        function sub(text) { return new D.Paragraph({ spacing: { before: 160, after: 40 }, children: [tr(text, { size: 22, bold: true })] }); }
        function note(text, color) { return new D.Paragraph({ indent: { left: 720 }, spacing: { after: 40 }, children: [tr('Note: ' + text, { size: 20, italic: true, color: color || GRAY })] }); }
        var nb = { top: { style: 'none', size: 0 }, bottom: { style: 'none', size: 0 }, left: { style: 'none', size: 0 }, right: { style: 'none', size: 0 } };

        var headerTable = new D.Table({ rows: [new D.TableRow({ children: [
            new D.TableCell({ width: { size: 5400, type: D.WidthType.DXA }, borders: nb, children: [
                new D.Paragraph({ spacing: { after: 40 }, children: [tr('Demo Brief', { size: 44, bold: true })] }),
                new D.Paragraph({ spacing: { after: 40 }, children: [tr(p.name, { size: 28, bold: true })] }),
                new D.Paragraph({ children: [tr('SDR: ' + sdr, { size: 20, italic: true, color: GRAY })] })
            ] }),
            new D.TableCell({ width: { size: 3600, type: D.WidthType.DXA }, borders: nb, children: [
                new D.Paragraph({ alignment: D.AlignmentType.RIGHT, children: !nf(c.name) ? [tr(c.name, { size: 16, italic: true, color: GRAY })] : [] })
            ] })
        ] })], width: { size: 100, type: D.WidthType.PERCENTAGE } });

        var divider = new D.Paragraph({ spacing: { before: 80, after: 160 }, border: { bottom: { style: D.BorderStyle.SINGLE, size: 6, color: 'D1D5DB', space: 1 } }, children: [] });

        var role = nf(p.title) ? '' : p.title;
        if (p.tenure && !nf(p.tenure)) role += (role ? ' - ' : '') + p.tenure;
        var ats = c.ats || '';

        function itr(label, value, linkUrl) {
            var vc = [];
            var miss = nf(value);
            if (linkUrl && !nf(linkUrl)) vc.push(hl(value || 'Link', linkUrl));
            else vc.push(tr(miss ? 'Not found' : value, { italic: miss, color: miss ? RED : NAVY }));
            return new D.TableRow({ children: [
                new D.TableCell({ width: { size: 2640, type: D.WidthType.DXA }, shading: { fill: HEADER_BG }, children: [new D.Paragraph({ children: [tr(label, { bold: true })] })] }),
                new D.TableCell({ width: { size: 6360, type: D.WidthType.DXA }, children: [new D.Paragraph({ children: vc })] })
            ] });
        }

        var infoTable = new D.Table({ rows: [
            itr('Company', c.name, c.website), itr('Name', p.name, p.linkedin_url), itr('Prospect Location', p.location),
            itr('Role', role), itr('Company Size', c.size), itr('Industry', c.industry),
            itr('ATS', ats), itr('Current Open Remote Jobs', c.open_remote_jobs), itr('Headquarters', c.headquarters)
        ], width: { size: 100, type: D.WidthType.PERCENTAGE } });

        var content = [];
        content.push(sh('About ' + p.name));
        content.push(bp('Role: ' + (nf(p.title) ? 'Not found' : p.title), { color: nf(p.title) ? RED : NAVY, italic: nf(p.title) }));
        content.push(bp('Team: ' + (nf(p.team) ? 'Not found' : p.team), { color: nf(p.team) ? RED : NAVY, italic: nf(p.team) }));
        content.push(bp('Certifications: ' + (p.certifications && p.certifications.length ? p.certifications.join(', ') : 'Not found'), { color: !(p.certifications && p.certifications.length) ? RED : NAVY, italic: !(p.certifications && p.certifications.length) }));

        content.push(sub('Work History:'));
        if (p.work_history && p.work_history.length) p.work_history.forEach(function (w) { content.push(bp(w)); });
        else content.push(note('Work history not found.', RED));

        content.push(sub('Notable Achievements:'));
        if (p.achievements && p.achievements.length) p.achievements.forEach(function (a) { content.push(bp(a)); });
        else content.push(note('No specific achievements found.', RED));

        content.push(sub('Published Content:'));
        if (p.published_content && p.published_content.length) {
            p.published_content.forEach(function (pc) {
                var prefix = pc.type === 'talk' ? '[Talk] ' : '';
                var dateStr = pc.date ? ' (' + pc.date + ')' : '';
                if (pc.url) {
                    content.push(new D.Paragraph({ bullet: { level: 0 }, spacing: { after: 40 }, children: [tr(prefix), hl(pc.title, pc.url), tr(dateStr)] }));
                } else content.push(bp(prefix + pc.title + dateStr));
            });
        } else content.push(note('No published content found.', GRAY));

        content.push(sh('Company Overview'));
        var basicsParts = ['Founded: ' + (nf(c.founded) ? 'N/A' : c.founded)];
        if (!nf(c.ticker)) basicsParts.push('Public: ' + c.ticker);
        basicsParts.push('HQ: ' + (nf(c.headquarters) ? 'N/A' : c.headquarters));
        content.push(bp(basicsParts.join(' | ')));
        content.push(bp('Product: ' + (nf(c.product_description) ? 'Not found' : c.product_description), { color: nf(c.product_description) ? RED : NAVY, italic: nf(c.product_description) }));
        content.push(bp('Customers: ' + (nf(c.customers) ? 'Not found' : c.customers), { color: nf(c.customers) ? RED : NAVY, italic: nf(c.customers) }));

        content.push(sub('Hiring & Recruitment:'));
        var empText = 'Employees: ' + (nf(c.employee_count) ? 'N/A' : c.employee_count);
        if (!nf(c.growth)) empText += ' | Growth: ' + c.growth;
        content.push(bp(empText));
        content.push(bp('ATS: ' + (nf(ats) ? 'Not found' : ats), { color: nf(ats) ? RED : NAVY, italic: nf(ats) }));

        content.push(sub('Identity & Access Tools:'));
        if (c.identity_tools && c.identity_tools.length) c.identity_tools.forEach(function (t) { content.push(bp(t.name + ' - ' + t.description)); });
        else content.push(note('No identity tools identified.', RED));
        content.push(bp('Compliance: ' + (nf(c.compliance) ? 'Not found' : c.compliance), { color: nf(c.compliance) ? RED : NAVY, italic: nf(c.compliance) }));

        content.push(sub('Security Incidents:'));
        if (c.security_incidents && c.security_incidents.length) {
            c.security_incidents.forEach(function (inc) {
                content.push(bp(inc.date + ': ' + inc.title, { bold: true }));
                if (inc.details) content.push(bp(inc.details, { level: 1 }));
            });
        } else content.push(bp('No recent security incidents found.', { italic: true, color: GRAY }));

        return new D.Document({ sections: [{ properties: { page: { margin: { top: 720, bottom: 720, left: 1080, right: 1080 } } }, children: [headerTable, divider, infoTable, new D.Paragraph({ spacing: { after: 200 }, children: [] })].concat(content) }] });
    }

    // Download .docx
    document.getElementById('download-docx-btn').addEventListener('click', function () {
        var data = window._lastBriefData;
        if (!data) { showToast('Generate a brief first', 'error'); return; }
        var D = window.docx;
        if (!D) { showToast('docx library not loaded', 'error'); return; }
        var doc = generateDocx(data);
        D.Packer.toBlob(doc).then(function (blob) {
            var fn = data.prospect.name.replace(/\s+/g, '_') + '_-_' + data.company.name.replace(/\s+/g, '_') + '_-_Demo_Brief.docx';
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = fn;
            a.click();
            URL.revokeObjectURL(a.href);
            showToast('Downloaded ' + fn, 'success');
        }).catch(function (e) { showToast('DOCX error: ' + e.message, 'error'); });
    });

    // ══════════════════════════════════════════
    // Toast
    // ══════════════════════════════════════════
    function showToast(message, type) {
        var existing = document.querySelector('.toast');
        if (existing) existing.remove();
        var toast = document.createElement('div');
        toast.className = 'toast ' + (type || '');
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(function () { toast.remove(); }, 3000);
    }

    // ══════════════════════════════════════════
    // Init
    // ══════════════════════════════════════════
    updateSettingsIndicator();

})();
