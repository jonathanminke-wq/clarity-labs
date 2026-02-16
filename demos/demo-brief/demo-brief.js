/**
 * Demo Brief Generator — Automated Research & Document Generation
 *
 * Flow: LinkedIn URL → Serper API search → extract data → preview → .docx
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'clarity_demo_brief_settings';
    var HISTORY_STORAGE_KEY = 'clarity_demo_brief_history';
    var HISTORY_MAX = 50;
    var SERPER_URL = 'https://google.serper.dev/search';

    // ══════════════════════════════════════════
    // Settings (localStorage)
    // ══════════════════════════════════════════
    function loadSettings() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch (e) { return {}; }
    }
    function saveSettings(s) { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }
    function getApiKey() { return (loadSettings().serperApiKey || '').trim(); }
    function getNetrowsApiKey() { return (loadSettings().netrowsApiKey || '').trim(); }

    // ══════════════════════════════════════════
    // Brief History Store (localStorage)
    // ══════════════════════════════════════════
    var BriefHistoryStore = {
        getAll: function () {
            try { return JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY)) || []; }
            catch (e) { return []; }
        },
        save: function (entry) {
            var all = this.getAll();
            // Replace if same id exists (re-save)
            all = all.filter(function (e) { return e.id !== entry.id; });
            all.unshift(entry);
            if (all.length > HISTORY_MAX) all = all.slice(0, HISTORY_MAX);
            localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(all));
        },
        remove: function (id) {
            var all = this.getAll().filter(function (e) { return e.id !== id; });
            localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(all));
        },
        getById: function (id) {
            return this.getAll().find(function (e) { return e.id === id; }) || null;
        }
    };

    function generateBriefId() {
        return 'brief_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    }

    function createHistoryEntry(data, logs) {
        return {
            id: generateBriefId(),
            prospect_name: (data.prospect && data.prospect.name) || '',
            company_name: (data.company && data.company.name) || '',
            sdr_name: data.sdr_name || '',
            created_at: new Date().toISOString(),
            data: data,
            // Save trimmed logs (exclude raw results to keep localStorage size manageable)
            research_logs: (logs || []).map(function (dr) {
                return {
                    label: dr.label,
                    query: dr.query,
                    extracted: dr.extracted,
                    source: dr.source,
                    timestamp: dr.timestamp,
                    // Keep a small summary instead of full raw results
                    result_summary: dr.results && dr.results.error
                        ? { error: dr.results.error }
                        : dr.results && dr.results.organic
                            ? { organic_count: dr.results.organic.length, has_kg: !!(dr.results.knowledgeGraph && dr.results.knowledgeGraph.title) }
                            : dr.results && dr.results.firstName
                                ? { type: 'netrows_profile', name: (dr.results.firstName || '') + ' ' + (dr.results.lastName || '') }
                                : dr.results && dr.results.data && dr.results.data.name
                                    ? { type: 'netrows_company', name: dr.results.data.name }
                                    : dr.results && dr.results.data && Array.isArray(dr.results.data)
                                        ? { type: 'netrows_list', count: dr.results.data.length }
                                        : { type: 'unknown' }
                };
            })
        };
    }

    function formatRelativeDate(isoStr) {
        var d = new Date(isoStr);
        var now = new Date();
        var diff = now - d;
        var mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Just now';
        if (mins < 60) return mins + 'm ago';
        var hrs = Math.floor(mins / 60);
        if (hrs < 24) return hrs + 'h ago';
        var days = Math.floor(hrs / 24);
        if (days < 7) return days + 'd ago';
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

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
            body: JSON.stringify({ q: query, num: 10, gl: 'us', hl: 'en' })
        }).then(function (r) {
            if (!r.ok) throw new Error('Search API error: ' + r.status);
            return r.json();
        });
    }

    function testApiKey(apiKey) {
        return serperSearch('test', apiKey).then(function () { return true; });
    }

    // ══════════════════════════════════════════
    // Netrows API (direct LinkedIn data)
    // ══════════════════════════════════════════
    var NETROWS_BASE = 'https://www.netrows.com/api/v1';

    function callNetrowsAPI(endpoint, params) {
        var netrowsKey = getNetrowsApiKey();
        if (!netrowsKey) return Promise.reject(new Error('No Netrows API key'));
        var url = new URL(NETROWS_BASE + endpoint);
        Object.keys(params || {}).forEach(function (key) {
            if (params[key] !== undefined && params[key] !== null) {
                url.searchParams.append(key, String(params[key]));
            }
        });
        return fetch(url.toString(), {
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + netrowsKey, 'Content-Type': 'application/json' }
        }).then(function (r) {
            if (!r.ok) throw new Error('Netrows API error: ' + r.status);
            return r.json();
        });
    }

    // Get full LinkedIn profile via Netrows
    function netrowsProfileLookup(linkedInUrl) {
        return callNetrowsAPI('/people/profile', { url: linkedInUrl });
    }

    // Get company details via Netrows
    function netrowsCompanyLookup(companyUrl) {
        return callNetrowsAPI('/companies/details', { url: companyUrl });
    }

    // Search jobs via Netrows (for remote job counts)
    function netrowsJobSearch(keywords, opts) {
        var params = { keywords: keywords, start: 0 };
        if (opts) {
            if (opts.onsiteRemote) params.onsiteRemote = opts.onsiteRemote;
            if (opts.locationId) params.locationId = opts.locationId;
        }
        return callNetrowsAPI('/jobs/search', params);
    }

    // Parse Netrows profile response into our data model
    function parseNetrowsProfile(profile, companyName) {
        var result = {
            name: (profile.firstName || '') + ' ' + (profile.lastName || ''),
            title: '',
            location: '',
            company: '',
            companyUrl: '',
            companyTenure: '',
            roleTenure: '',
            workHistory: [],
            certifications: [],
            team: '',
            achievements: [],
            summary: profile.summary || ''
        };

        // Location from geo
        if (profile.geo) {
            result.location = profile.geo.city || '';
            if (result.location && profile.geo.country) result.location += ', ' + profile.geo.country;
            else if (profile.geo.country) result.location = profile.geo.country;
        }

        // Headline as fallback title
        if (profile.headline) result.title = profile.headline;

        // Parse positions for current company, title, and tenure
        var positions = profile.position || [];
        var companyLower = (companyName || '').toLowerCase();
        var now = new Date();

        // Find current position at the target company
        var currentCompanyPositions = [];
        for (var i = 0; i < positions.length; i++) {
            var pos = positions[i];
            var posCompany = (pos.companyName || '').toLowerCase();
            var isCurrentCompany = companyLower && (
                posCompany.indexOf(companyLower) !== -1 ||
                companyLower.indexOf(posCompany) !== -1
            );

            // If no target company, use the first position (current)
            if (!companyLower && i === 0) {
                result.company = pos.companyName || '';
                result.companyUrl = pos.companyURL || '';
                result.title = pos.title || result.title;
                if (pos.start && pos.start.year) {
                    var startDate = new Date(pos.start.year, (pos.start.month || 1) - 1, 1);
                    result.roleTenure = formatNetrowsDuration(startDate, now);
                    result.companyTenure = result.roleTenure;
                }
                break;
            }

            if (isCurrentCompany) {
                currentCompanyPositions.push(pos);
                if (!result.company) {
                    result.company = pos.companyName || '';
                    result.companyUrl = pos.companyURL || '';
                }
            }
        }

        // Calculate tenure from company positions
        if (currentCompanyPositions.length > 0) {
            // Current role title = first matching position (most recent)
            result.title = currentCompanyPositions[0].title || result.title;

            // Role tenure = duration of current role
            var currentPos = currentCompanyPositions[0];
            if (currentPos.start && currentPos.start.year) {
                var roleStart = new Date(currentPos.start.year, (currentPos.start.month || 1) - 1, 1);
                result.roleTenure = formatNetrowsDuration(roleStart, now);
            }

            // Company tenure = from earliest position at company to now
            var earliest = currentCompanyPositions[currentCompanyPositions.length - 1];
            if (earliest.start && earliest.start.year) {
                var compStart = new Date(earliest.start.year, (earliest.start.month || 1) - 1, 1);
                result.companyTenure = formatNetrowsDuration(compStart, now);
            }
        }

        // Build work history from all positions
        for (var j = 0; j < positions.length; j++) {
            var p = positions[j];
            var entry = (p.title || 'Unknown Role') + ' at ' + (p.companyName || 'Unknown');
            if (p.start && p.start.year) {
                entry += ' (' + p.start.year;
                if (p.end && p.end.year) entry += '–' + p.end.year;
                else entry += '–Present';
                entry += ')';
            }
            result.workHistory.push(entry);
        }

        // Certifications from skills (Netrows may include certifications in skills)
        if (profile.certifications) {
            result.certifications = profile.certifications.map(function (c) { return c.name || c; });
        }

        return result;
    }

    // Parse Netrows company response into our data model
    function parseNetrowsCompany(companyData) {
        var d = companyData.data || companyData;
        var result = {
            name: d.name || '',
            industry: '',
            size: '',
            employee_count: '',
            headquarters: '',
            website: d.website || '',
            product_description: d.description || '',
            specialties: (d.specialities || []).join(', '),
            founded: d.founded ? String(d.founded.year || d.founded) : '',
            linkedinUrl: d.linkedinUrl || ''
        };

        // Industry
        if (d.industries && d.industries.length > 0) {
            result.industry = d.industries[0];
        }

        // Staff count
        if (d.staffCount) {
            result.employee_count = String(d.staffCount);
            result.size = String(d.staffCount) + ' employees';
        }

        // Headquarters
        if (d.headquarter) {
            var hq = d.headquarter;
            var parts = [];
            if (hq.city) parts.push(hq.city);
            if (hq.geographicArea) parts.push(hq.geographicArea);
            if (hq.country && hq.country.length === 2) {
                // Convert country code to name for common ones
                var cc = { US: 'United States', GB: 'United Kingdom', CA: 'Canada', DE: 'Germany', FR: 'France', IL: 'Israel', AU: 'Australia', NL: 'Netherlands', SE: 'Sweden', CH: 'Switzerland', JP: 'Japan', IN: 'India', SG: 'Singapore', IE: 'Ireland' };
                parts.push(cc[hq.country] || hq.country);
            }
            result.headquarters = parts.join(', ');
        }

        return result;
    }

    // Format duration between two dates as "X years, Y months"
    function formatNetrowsDuration(startDate, endDate) {
        if (!startDate || !endDate) return '';
        var months = (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth());
        if (months < 0) return '';
        var years = Math.floor(months / 12);
        var rem = months % 12;
        if (years === 0 && rem === 0) return 'Less than a month';
        if (years === 0) return rem + (rem === 1 ? ' month' : ' months');
        if (rem === 0) return years + (years === 1 ? ' year' : ' years');
        return years + (years === 1 ? ' year' : ' years') + ', ' + rem + (rem === 1 ? ' month' : ' months');
    }

    // ══════════════════════════════════════════
    // Data Extractors (from search results + knowledgeGraph)
    // ══════════════════════════════════════════

    // Combine all text from organic results for pattern matching
    function allSnippets(results) {
        if (!results) return '';
        var parts = [];
        if (results.organic) {
            results.organic.forEach(function (r) {
                parts.push(r.title || '');
                parts.push(r.snippet || '');
            });
        }
        if (results.answerBox) {
            parts.push(results.answerBox.title || '');
            parts.push(results.answerBox.snippet || '');
            parts.push(results.answerBox.answer || '');
        }
        if (results.peopleAlsoAsk) {
            results.peopleAlsoAsk.forEach(function (q) {
                parts.push(q.question || '');
                parts.push(q.snippet || '');
            });
        }
        return parts.join(' ');
    }

    // Extract structured data from Serper's knowledgeGraph
    function getKG(results) {
        return (results && results.knowledgeGraph) || {};
    }

    function getKGAttr(results, key) {
        var kg = getKG(results);
        if (!kg.attributes) return '';
        // Try exact key first, then case-insensitive
        if (kg.attributes[key]) return kg.attributes[key];
        var keys = Object.keys(kg.attributes);
        for (var i = 0; i < keys.length; i++) {
            if (keys[i].toLowerCase() === key.toLowerCase()) return kg.attributes[keys[i]];
        }
        return '';
    }

    function extractTitle(results, name) {
        if (!results) return '';

        // 1. Try parsing LinkedIn organic result titles FIRST (most reliable)
        // LinkedIn titles: "Name - Title - Company | LinkedIn" or "Name - Title | LinkedIn"
        if (results.organic) {
            for (var k = 0; k < results.organic.length; k++) {
                var orgTitle = results.organic[k].title || '';
                var orgLink = results.organic[k].link || '';

                // Check if this is a LinkedIn profile result (by URL or title)
                var isLinkedIn = /linkedin\.com\/in\//i.test(orgLink) || /linkedin/i.test(orgTitle);
                if (!isLinkedIn) continue;

                // Split by common separators: " - ", " – ", " — ", " | "
                var linkedParts = orgTitle.split(/\s+[-–—|]\s+/);
                console.log('[DemoBrief] LinkedIn title parts:', linkedParts);

                // Format: "Name - Title - Company | LinkedIn" → 4 parts
                // Format: "Name - Title | LinkedIn" → 3 parts
                // Format: "Name | LinkedIn" → 2 parts
                if (linkedParts.length >= 3) {
                    // Skip first part (name) and last part (usually "LinkedIn")
                    // The title is in the middle
                    var candidate = linkedParts[1].trim();
                    if (candidate.length > 1 && candidate.length < 80 && !/linkedin/i.test(candidate)) {
                        return candidate;
                    }
                }
            }
        }

        // 2. Check knowledgeGraph
        var kg = getKG(results);
        if (kg.description && kg.description.length < 80) return kg.description;

        // 3. Scan all text for known title patterns
        var text = allSnippets(results);
        var titlePatterns = [
            /(?:^|\.\s+)((?:Chief|Vice|Senior|Head|Director|Manager|Lead|Principal|VP|SVP|EVP|AVP|CTO|CEO|CIO|CISO|CSO|COO|CFO|CPO|CDO|CMO|CRO)[^.]{3,50}?)(?:\.\s|\s+at\s|\s+@\s|$)/im,
            /(?:is\s+(?:the\s+)?|serves?\s+as\s+(?:the\s+)?)((?:Chief|Vice|Senior|Head|Director|Manager|Lead|Principal|VP|SVP|EVP|AVP|CTO|CEO|CIO|CISO|CSO|COO|CFO|CPO|CDO|CMO|CRO)[^.]{3,50})/i
        ];
        for (var i = 0; i < titlePatterns.length; i++) {
            var m = text.match(titlePatterns[i]);
            if (m && m[1]) {
                var title = m[1].trim().replace(/\s*[-–—|·]\s*$/, '').replace(/\.$/, '');
                if (title.length > 3 && title.length < 80) return title;
            }
        }

        // 4. Keyword scan for known C-level/VP titles anywhere in text
        var titles = [
            'Chief Information Security Officer', 'Chief Technology Officer', 'Chief Information Officer',
            'Chief Executive Officer', 'Chief Operating Officer', 'Chief Financial Officer',
            'Chief Product Officer', 'Chief Revenue Officer', 'Chief Marketing Officer',
            'Chief Data Officer', 'Chief Digital Officer', 'Chief People Officer',
            'VP of Security', 'VP of Engineering', 'VP Security', 'VP Engineering',
            'VP of Product', 'VP of Sales', 'VP of Marketing', 'VP of Operations',
            'Head of Security', 'Head of Engineering', 'Head of IT', 'Head of Information Security',
            'Head of Product', 'Head of Sales', 'Head of People', 'Head of HR',
            'Director of Security', 'Director of Engineering', 'Director of IT',
            'Director of Product', 'Director of Sales', 'Director of Operations',
            'CISO', 'CTO', 'CIO', 'CSO', 'CPO', 'CEO', 'COO', 'CFO', 'CDO', 'CMO', 'CRO',
            'General Manager', 'Managing Director', 'Country Manager', 'Regional Director',
            'Founder', 'Co-Founder', 'President', 'Partner', 'Consultant', 'Advisor',
            'Engineer', 'Architect', 'Analyst', 'Specialist', 'Coordinator'
        ];
        for (var j = 0; j < titles.length; j++) {
            if (text.indexOf(titles[j]) !== -1) return titles[j];
        }

        // 5. Last resort: try to get ANYTHING from the first organic result snippet
        // Look for "title at company" or "title chez company" (French) patterns
        if (results.organic && results.organic[0]) {
            var snippet = results.organic[0].snippet || '';
            var atMatch = snippet.match(/(?:^|\.\s*|,\s*)([A-Z][a-zA-Z\s&\/]+?)\s+(?:at|chez|@|à)\s+/);
            if (atMatch && atMatch[1].length > 3 && atMatch[1].length < 60) return atMatch[1].trim();
        }

        return '';
    }

    function extractLocation(results) {
        // 1. knowledgeGraph
        var kgLoc = getKGAttr(results, 'Location') || getKGAttr(results, 'Headquarters') || getKGAttr(results, 'Born');
        if (kgLoc) return kgLoc;

        var text = allSnippets(results);
        var patterns = [
            // "Greater X Area" (LinkedIn pattern — very common)
            /((?:Greater\s+)?[A-Z][a-zA-ZÀ-ÿ]+(?:[\s-][A-Z][a-zA-ZÀ-ÿ]+)*\s+(?:Area|Metropolitan|Metro)(?:\s+Area)?)/,
            // "based in / located in / from" patterns
            /(?:based in|located in|lives in|location[:\s]+|from)\s+([A-ZÀ-ÿ][a-zA-ZÀ-ÿ\s]+(?:,\s*[A-Za-zÀ-ÿ\s]+)?)/i,
            // "City, State" (US)
            /([A-Z][a-z]+(?:\s[A-Z][a-z]+)?,\s*(?:Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New\s+Hampshire|New\s+Jersey|New\s+Mexico|New\s+York|North\s+Carolina|North\s+Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode\s+Island|South\s+Carolina|South\s+Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West\s+Virginia|Wisconsin|Wyoming|AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC))/,
            // "City, Country" (international — include French regions)
            /([A-ZÀ-ÿ][a-zA-ZÀ-ÿ]+(?:[\s-][A-ZÀ-ÿ][a-zA-ZÀ-ÿ]+)*,\s*(?:France|Germany|UK|United Kingdom|Canada|Australia|Israel|India|Japan|Singapore|Netherlands|Sweden|Switzerland|Spain|Italy|Poland|Ireland|Brazil|Mexico|Belgium|Austria|Denmark|Norway|Finland|Czech Republic|Portugal|Romania|Hungary|Greece|Turkey|South Korea|New Zealand|Île-de-France|Île de France))/i,
            // LinkedIn snippet location patterns: "Location · City" or just standalone city names
            /(?:·|•|\|)\s*([A-ZÀ-ÿ][a-zA-ZÀ-ÿ\s,-]+(?:Area|Region|France|Germany|UK|Israel|India|CA|NY|TX|WA|IL|MA|PA|OH|GA|FL))/
        ];
        for (var i = 0; i < patterns.length; i++) {
            var m = text.match(patterns[i]);
            if (m) {
                var loc = m[1].trim().replace(/\.$/, '').replace(/,\s*$/, '');
                if (loc.length > 2 && loc.length < 60) return loc;
            }
        }

        // Fallback: look for well-known city names directly
        var cities = ['San Francisco', 'New York', 'London', 'Paris', 'Tel Aviv', 'Berlin', 'Amsterdam', 'Singapore',
            'Toronto', 'Sydney', 'Seattle', 'Boston', 'Austin', 'Chicago', 'Los Angeles', 'Denver', 'Atlanta',
            'Dublin', 'Munich', 'Stockholm', 'Zurich', 'Tokyo', 'Bangalore', 'Mumbai', 'Delhi',
            'Lyon', 'Marseille', 'Toulouse', 'Nantes', 'Bordeaux', 'Lille', 'Strasbourg', 'Rennes'];
        for (var j = 0; j < cities.length; j++) {
            if (text.indexOf(cities[j]) !== -1) return cities[j];
        }
        return '';
    }

    function extractEmployeeCount(results) {
        // 1. knowledgeGraph
        var kgEmp = getKGAttr(results, 'Number of employees') || getKGAttr(results, 'Employees') || getKGAttr(results, 'Size');
        if (kgEmp) return kgEmp.replace(/[^\d,+\-–\s]/g, '').trim() || kgEmp;

        var text = allSnippets(results);
        var patterns = [
            /([\d,]+(?:\s*[\-–]\s*[\d,]+)?)\s*(?:\+\s*)?employees/i,
            /(?:has|with|employs?|employing|workforce\s+of|team\s+of|over)\s*([\d,]+)/i,
            /([\d,]+)\s*(?:people|workers|staff|team\s+members)/i,
            /company\s+size[:\s]*([\d,]+(?:\s*[-–]\s*[\d,]+)?)/i
        ];
        for (var i = 0; i < patterns.length; i++) {
            var m = text.match(patterns[i]);
            if (m) return m[1].trim();
        }
        return '';
    }

    function extractFounded(results) {
        var kgFounded = getKGAttr(results, 'Founded') || getKGAttr(results, 'Incorporated');
        if (kgFounded) {
            var yr = kgFounded.match(/(\d{4})/);
            return yr ? yr[1] : kgFounded;
        }
        var text = allSnippets(results);
        var m = text.match(/(?:founded|established|started|incorporated|created)\s+(?:in\s+)?(\d{4})/i);
        return m ? m[1] : '';
    }

    function extractTicker(results) {
        var kgTicker = getKGAttr(results, 'Stock price') || getKGAttr(results, 'Ticker');
        if (kgTicker) {
            var tkm = kgTicker.match(/([A-Z]{1,5})/);
            return tkm ? tkm[0] : '';
        }
        var text = allSnippets(results);
        var patterns = [
            /\(?(NYSE|NASDAQ|LSE|TSE|AMEX|NYSEMKT)\s*[:]\s*([A-Z]{1,5})\)?/i,
            /(?:ticker|symbol|stock)[:\s]*([A-Z]{1,5})/i,
            /\$([A-Z]{1,5})(?:\s|,|\.)/
        ];
        for (var i = 0; i < patterns.length; i++) {
            var m = text.match(patterns[i]);
            if (m) {
                if (m[2]) return m[1].toUpperCase() + ': ' + m[2].toUpperCase();
                return m[1].toUpperCase();
            }
        }
        return '';
    }

    function extractIndustry(results) {
        // 1. knowledgeGraph type or description
        var kg = getKG(results);
        var kgType = kg.type || '';
        var kgIndustry = getKGAttr(results, 'Industry') || getKGAttr(results, 'Type') || getKGAttr(results, 'Sector');
        if (kgIndustry) return kgIndustry;
        if (kgType && kgType.length < 40 && !/person|profile/i.test(kgType)) return kgType;

        var text = allSnippets(results);
        // Look for "industry: X" patterns first
        var indMatch = text.match(/(?:industry|sector|operates in|specializ(?:es|ing) in)[:\s]+([A-Z][a-zA-Z\s&\/,]+?)(?:\.|,\s|$)/i);
        if (indMatch && indMatch[1].length < 50) return indMatch[1].trim();

        var industries = [
            'Enterprise Software', 'Cybersecurity', 'Cloud Computing', 'SaaS', 'FinTech', 'Fintech',
            'Healthcare', 'Health Tech', 'E-commerce', 'Ecommerce', 'Artificial Intelligence',
            'Data Analytics', 'Information Technology', 'IT Services', 'IT Consulting',
            'Financial Services', 'Banking', 'Telecommunications', 'Telecom',
            'Semiconductor', 'Biotechnology', 'Biotech', 'Media', 'Digital Media',
            'Retail', 'Manufacturing', 'Professional Services', 'Consulting',
            'Education', 'EdTech', 'Real Estate', 'PropTech',
            'Automotive', 'Aerospace', 'Defense', 'Energy', 'Clean Energy',
            'Insurance', 'InsurTech', 'Human Resources', 'HR Tech',
            'Marketing Technology', 'MarTech', 'AdTech', 'Developer Tools',
            'Security', 'Observability', 'Search', 'Database', 'DevOps',
            'Logistics', 'Supply Chain', 'Legal Tech', 'GovTech',
            'Gaming', 'Food & Beverage', 'Hospitality', 'Travel',
            'Construction', 'Mining', 'Agriculture', 'Agtech',
            'Staffing', 'Recruitment', 'Talent Acquisition',
            'Engineering Services', 'Technology Consulting', 'Digital Transformation',
            'Software Development', 'Systems Integration', 'Managed Services'
        ];
        var textLower = text.toLowerCase();
        for (var i = 0; i < industries.length; i++) {
            if (textLower.indexOf(industries[i].toLowerCase()) !== -1) return industries[i];
        }
        return '';
    }

    function extractHQ(results) {
        var kgHQ = getKGAttr(results, 'Headquarters') || getKGAttr(results, 'Headquartered') || getKGAttr(results, 'Location') || getKGAttr(results, 'Head office');
        if (kgHQ) return kgHQ;

        var text = allSnippets(results);
        var patterns = [
            /(?:headquartered|headquarters|HQ|head office|main office|siège)\s+(?:in|at|is in|:)\s+([A-ZÀ-ÿ][a-zA-ZÀ-ÿ\s,]+)/i,
            /(?:based\s+(?:in|out\s+of))\s+([A-ZÀ-ÿ][a-zA-ZÀ-ÿ\s,]+?)(?:\.\s|\swith\s|\sand\s|,\s+(?:the|a|with))/i,
            /(?:offices?\s+in)\s+([A-ZÀ-ÿ][a-zA-ZÀ-ÿ\s]+,\s*[A-ZÀ-ÿ][a-zA-ZÀ-ÿ\s]*)/i,
            // "City, Country" near company name
            /(?:located|location)[:\s]+([A-ZÀ-ÿ][a-zA-ZÀ-ÿ\s]+,\s*[A-Za-zÀ-ÿ\s]+)/i,
            // LinkedIn company page format: "City, Region · Company type"
            /([A-ZÀ-ÿ][a-zA-ZÀ-ÿ\s-]+,\s*(?:France|Germany|UK|United Kingdom|United States|US|USA|Canada|Australia|Israel|India|Japan|Singapore|Netherlands|Sweden|Switzerland|Spain|Italy|Poland|Ireland|Brazil|Belgium|Austria|Île-de-France|California|New York|Texas|Florida|Illinois|Pennsylvania|Ohio|Georgia|Virginia|Washington))/i
        ];
        for (var i = 0; i < patterns.length; i++) {
            var m = text.match(patterns[i]);
            if (m) {
                var hq = m[1].trim().replace(/[.,]$/, '').replace(/\s+·.*$/, '');
                if (hq.length > 2 && hq.length < 60) return hq;
            }
        }
        return '';
    }

    function extractWebsite(results, company) {
        // 1. knowledgeGraph website
        var kg = getKG(results);
        if (kg.website) return kg.website;

        if (!results || !results.organic) return '';
        var companyLower = company.toLowerCase().replace(/[\s,.\-]+/g, '');
        for (var i = 0; i < results.organic.length; i++) {
            var link = results.organic[i].link || '';
            var domain = link.match(/^https?:\/\/(?:www\.)?([^/]+)/);
            if (!domain) continue;
            var domainName = domain[1].toLowerCase().replace(/[\s.\-]+/g, '');
            // Skip known aggregator sites
            if (/linkedin|wikipedia|glassdoor|crunchbase|bloomberg|reuters|indeed|ziprecruiter|builtwith/i.test(domain[1])) continue;
            // Check if domain contains company name (fuzzy)
            if (domainName.indexOf(companyLower) !== -1 || companyLower.indexOf(domainName.split('.')[0]) !== -1) {
                return link.match(/^(https?:\/\/[^/]+)/)[1];
            }
        }
        // Fallback: first non-aggregator link
        for (var j = 0; j < Math.min(3, (results.organic || []).length); j++) {
            var lnk = results.organic[j].link || '';
            if (!/linkedin|wikipedia|glassdoor|crunchbase|bloomberg|indeed/i.test(lnk)) {
                var dm = lnk.match(/^(https?:\/\/[^/]+)/);
                if (dm) return dm[1];
            }
        }
        return '';
    }

    function extractATS(results) {
        var text = allSnippets(results);
        // Also check URLs for ATS domains
        var urlText = '';
        if (results && results.organic) {
            results.organic.forEach(function (r) { urlText += ' ' + (r.link || ''); });
        }
        var allText = text + ' ' + urlText;

        var systems = [
            { name: 'Greenhouse', patterns: ['greenhouse.io', 'Greenhouse'] },
            { name: 'Lever', patterns: ['lever.co', 'jobs.lever.co'] },
            { name: 'Workday', patterns: ['myworkdayjobs.com', 'Workday'] },
            { name: 'iCIMS', patterns: ['icims.com', 'iCIMS'] },
            { name: 'Ashby', patterns: ['ashbyhq.com', 'Ashby'] },
            { name: 'SmartRecruiters', patterns: ['smartrecruiters.com', 'SmartRecruiters'] },
            { name: 'BambooHR', patterns: ['bamboohr.com', 'BambooHR'] },
            { name: 'Taleo', patterns: ['taleo.net', 'Taleo'] },
            { name: 'SAP SuccessFactors', patterns: ['successfactors.com', 'SuccessFactors'] },
            { name: 'Jobvite', patterns: ['jobvite.com', 'Jobvite'] },
            { name: 'JazzHR', patterns: ['jazzhr.com', 'JazzHR'] },
            { name: 'Recruitee', patterns: ['recruitee.com', 'Recruitee'] },
            { name: 'Teamtailor', patterns: ['teamtailor.com', 'Teamtailor'] },
            { name: 'Breezy HR', patterns: ['breezy.hr', 'Breezy'] },
            { name: 'Pinpoint', patterns: ['pinpointhq.com'] },
            { name: 'Avature', patterns: ['avature.net', 'Avature'] },
            { name: 'Phenom', patterns: ['phenom.com', 'PhenomPeople'] },
            { name: 'Cornerstone', patterns: ['cornerstoneondemand.com', 'Cornerstone'] },
            { name: 'Welcome to the Jungle', patterns: ['welcometothejungle.com', 'wttj.co'] },
            { name: 'Flatchr', patterns: ['flatchr.io', 'Flatchr'] },
            { name: 'Talentsoft', patterns: ['talentsoft.com', 'Talentsoft'] },
            { name: 'Personio', patterns: ['personio.de', 'personio.com', 'Personio'] },
            { name: 'Factorial', patterns: ['factorial.co', 'factorialhr.com'] },
            { name: 'Deel', patterns: ['deel.com'] },
            { name: 'Rippling', patterns: ['rippling.com'] },
            { name: 'HiBob', patterns: ['hibob.com', 'HiBob'] },
            { name: 'Bullhorn', patterns: ['bullhorn.com', 'Bullhorn'] }
        ];
        var found = [];
        for (var i = 0; i < systems.length; i++) {
            for (var j = 0; j < systems[i].patterns.length; j++) {
                if (allText.indexOf(systems[i].patterns[j]) !== -1) {
                    found.push(systems[i].name);
                    break;
                }
            }
        }
        return found.length ? found.join(', ') : '';
    }

    function extractIdTools(results) {
        var text = allSnippets(results);
        // Also check URLs
        if (results && results.organic) {
            results.organic.forEach(function (r) { text += ' ' + (r.link || ''); });
        }
        var textLower = text.toLowerCase();
        var tools = [
            { name: 'Okta', patterns: ['okta'], desc: 'IdP - SSO & MFA' },
            { name: 'Azure AD', patterns: ['azure ad', 'azure active directory'], desc: 'Identity & Access Management' },
            { name: 'Microsoft Entra', patterns: ['entra id', 'microsoft entra'], desc: 'Identity & Access Management' },
            { name: 'Ping Identity', patterns: ['ping identity', 'pingone', 'pingfederate'], desc: 'SSO & Federation' },
            { name: 'OneLogin', patterns: ['onelogin'], desc: 'Cloud Identity' },
            { name: 'CrowdStrike', patterns: ['crowdstrike'], desc: 'Endpoint Security' },
            { name: 'SailPoint', patterns: ['sailpoint'], desc: 'Identity Governance' },
            { name: 'CyberArk', patterns: ['cyberark'], desc: 'Privileged Access Management' },
            { name: 'Duo Security', patterns: ['duo security', 'duo.com'], desc: 'MFA' },
            { name: 'Auth0', patterns: ['auth0'], desc: 'Authentication Platform' },
            { name: 'ForgeRock', patterns: ['forgerock'], desc: 'Digital Identity' },
            { name: 'BeyondTrust', patterns: ['beyondtrust'], desc: 'Privileged Access' },
            { name: 'Zscaler', patterns: ['zscaler'], desc: 'Zero Trust Security' },
            { name: 'Palo Alto Networks', patterns: ['palo alto'], desc: 'Network Security' },
            { name: 'Fortinet', patterns: ['fortinet', 'fortigate'], desc: 'Network Security' },
            { name: 'Splunk', patterns: ['splunk'], desc: 'SIEM & Observability' },
            { name: 'Rapid7', patterns: ['rapid7'], desc: 'Security Analytics' },
            { name: 'Tenable', patterns: ['tenable'], desc: 'Vulnerability Management' },
            { name: 'Varonis', patterns: ['varonis'], desc: 'Data Security' },
            { name: 'Thales', patterns: ['thales'], desc: 'Data Protection' },
            { name: 'Saviynt', patterns: ['saviynt'], desc: 'Cloud Security' }
        ];
        var found = [];
        var seen = {};
        for (var i = 0; i < tools.length; i++) {
            for (var j = 0; j < tools[i].patterns.length; j++) {
                if (textLower.indexOf(tools[i].patterns[j]) !== -1 && !seen[tools[i].name]) {
                    found.push({ name: tools[i].name, description: tools[i].desc });
                    seen[tools[i].name] = true;
                    break;
                }
            }
        }
        return found;
    }

    function extractCompliance(results) {
        var text = allSnippets(results);
        var textLower = text.toLowerCase();
        var standards = [
            { name: 'SOC 2', patterns: ['soc 2', 'soc2', 'soc-2'] },
            { name: 'ISO 27001', patterns: ['iso 27001', 'iso27001'] },
            { name: 'GDPR', patterns: ['gdpr'] },
            { name: 'HIPAA', patterns: ['hipaa'] },
            { name: 'FedRAMP', patterns: ['fedramp'] },
            { name: 'PCI DSS', patterns: ['pci dss', 'pci-dss', 'pci compliance'] },
            { name: 'CCPA', patterns: ['ccpa'] },
            { name: 'SOX', patterns: ['sarbanes-oxley', 'sox compliance', ' sox '] },
            { name: 'NIST', patterns: ['nist'] },
            { name: 'CMMC', patterns: ['cmmc'] },
            { name: 'ISO 9001', patterns: ['iso 9001', 'iso9001'] },
            { name: 'ITAR', patterns: ['itar'] },
            { name: 'TISAX', patterns: ['tisax'] }
        ];
        var found = [];
        for (var i = 0; i < standards.length; i++) {
            for (var j = 0; j < standards[i].patterns.length; j++) {
                if (textLower.indexOf(standards[i].patterns[j]) !== -1) {
                    found.push(standards[i].name);
                    break;
                }
            }
        }
        return found.length ? Array.from(new Set(found)).join(', ') : '';
    }

    function extractIncidents(results, companyName) {
        if (!results || !results.organic) return [];
        var incidents = [];
        var companyLower = (companyName || '').toLowerCase();
        results.organic.forEach(function (r) {
            var title = r.title || '';
            var snippet = r.snippet || '';
            var combined = title + ' ' + snippet;
            // Only include if the company name actually appears in the result
            if (companyLower && combined.toLowerCase().indexOf(companyLower) === -1) return;
            if (/breach|hack|incident|leak|vulnerability|compromis|attack|ransomware|phishing|exploit|cyber.?attack/i.test(combined)) {
                // Skip generic/educational articles
                if (/how to|tips for|best practices|guide to|what is|top \d+/i.test(title)) return;
                var dateMatch = snippet.match(/((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4})/i);
                if (!dateMatch) dateMatch = snippet.match(/(\d{4})/);
                incidents.push({
                    date: dateMatch ? dateMatch[1] : '',
                    title: title.substring(0, 100),
                    details: snippet.substring(0, 200)
                });
            }
        });
        return incidents.slice(0, 5);
    }

    function extractPublishedContent(results, name) {
        if (!results || !results.organic) return [];
        var content = [];
        results.organic.forEach(function (r) {
            var title = r.title || '';
            var url = r.link || '';
            var snippet = r.snippet || '';
            // Skip LinkedIn and social media
            if (/linkedin\.com\/in|twitter\.com|x\.com\/(?!.*article)/i.test(url)) return;
            var dateMatch = snippet.match(/((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4})/i);
            if (!dateMatch) dateMatch = snippet.match(/(\d{4})/);
            var type = /talk|keynote|conference|summit|webinar|podcast|video|panel|fireside/i.test(title + ' ' + snippet) ? 'talk' : 'article';
            content.push({ title: title.substring(0, 120), url: url, date: dateMatch ? dateMatch[1] : '', type: type });
        });
        return content.slice(0, 5);
    }

    function extractCerts(results) {
        var text = allSnippets(results);
        var textLower = text.toLowerCase();
        var certs = [
            { name: 'CISSP', p: 'cissp' }, { name: 'CISM', p: 'cism' }, { name: 'CCSP', p: 'ccsp' },
            { name: 'CISA', p: 'cisa' }, { name: 'CEH', p: 'ceh' }, { name: 'OSCP', p: 'oscp' },
            { name: 'CRISC', p: 'crisc' }, { name: 'CGEIT', p: 'cgeit' },
            { name: 'CompTIA Security+', p: 'security+' },
            { name: 'AWS Solutions Architect', p: 'aws solutions architect' },
            { name: 'GIAC', p: 'giac' }, { name: 'GCIH', p: 'gcih' }, { name: 'GSEC', p: 'gsec' },
            { name: 'PMP', p: 'pmp' }, { name: 'ITIL', p: 'itil' },
            { name: 'CCNA', p: 'ccna' }, { name: 'CCNP', p: 'ccnp' }
        ];
        var found = [];
        for (var i = 0; i < certs.length; i++) {
            if (textLower.indexOf(certs[i].p) !== -1) found.push(certs[i].name);
        }
        return found;
    }

    function extractWorkHistory(results, name) {
        var items = [];
        if (!results || !results.organic) return items;
        var text = allSnippets(results);
        var seen = {};

        // Pattern 1: "Company - Role (Year-Year)"
        var p1 = /([A-Z][a-zA-Z &.]+)\s*[-–—]\s*([A-Z][a-zA-Z &\/]+)\s*\((\d{4})\s*[-–—]\s*(Present|\d{4})\)/gi;
        var m;
        while ((m = p1.exec(text)) !== null) {
            var entry = m[1].trim() + ' - ' + m[2].trim() + ' (' + m[3] + '-' + m[4] + ')';
            if (!seen[entry]) { items.push(entry); seen[entry] = true; }
        }

        // Pattern 2: "Role at Company" from LinkedIn snippets
        if (items.length === 0) {
            var p2 = /(?:worked as|served as|was|joined as)\s+([A-Z][a-zA-Z\s&\/]+?)\s+(?:at|for)\s+([A-Z][a-zA-Z\s&.]+)/gi;
            while ((m = p2.exec(text)) !== null) {
                var entry2 = m[2].trim() + ' - ' + m[1].trim();
                if (!seen[entry2] && entry2.length < 80) { items.push(entry2); seen[entry2] = true; }
            }
        }

        // Pattern 3: From LinkedIn experience section text
        if (items.length === 0) {
            var p3 = /Experience[:\s]+(.+?)(?:Education|Skills|$)/i;
            var expMatch = text.match(p3);
            if (expMatch) {
                var expParts = expMatch[1].split(/[·•|]/);
                expParts.forEach(function (part) {
                    var clean = part.trim();
                    if (clean.length > 5 && clean.length < 80 && !seen[clean]) {
                        items.push(clean);
                        seen[clean] = true;
                    }
                });
            }
        }

        return items.slice(0, 5);
    }

    function extractCustomers(results) {
        if (!results || !results.organic) return '';
        var text = allSnippets(results);
        // Look for "customers include" or "used by" patterns
        var patterns = [
            /(?:customers?\s+include|clients?\s+include|used\s+by|trusted\s+by|chosen\s+by|serving|works?\s+with)\s+([A-Z][^.]{10,150})/i,
            /(?:customers?|clients?)[:\s]+([A-Z][a-zA-Z\s,&]+(?:,\s*[A-Z][a-zA-Z\s&]+){2,})/i,
            /(?:companies?\s+(?:like|such\s+as|including))\s+([A-Z][^.]{10,150})/i
        ];
        for (var i = 0; i < patterns.length; i++) {
            var m = text.match(patterns[i]);
            if (m && m[1]) {
                var cust = m[1].trim().replace(/\.$/, '').replace(/\s+and\s+more.*$/i, '');
                if (cust.length > 5 && cust.length < 200) return cust;
            }
        }
        // Look for well-known company names mentioned frequently
        var brands = ['Google', 'Microsoft', 'Amazon', 'Meta', 'Apple', 'Netflix', 'Salesforce',
            'SAP', 'Oracle', 'IBM', 'Uber', 'Airbnb', 'Spotify', 'Slack', 'Shopify',
            'Stripe', 'Twilio', 'Datadog', 'Snowflake', 'Palantir', 'Adobe', 'Zoom',
            'Deloitte', 'Accenture', 'KPMG', 'PwC', 'EY', 'McKinsey', 'BCG', 'Bain',
            'JPMorgan', 'Goldman Sachs', 'Morgan Stanley', 'Citi', 'HSBC', 'Barclays',
            'Toyota', 'BMW', 'Siemens', 'Samsung', 'Sony', 'Intel', 'Cisco', 'HP'];
        var found = [];
        for (var j = 0; j < brands.length; j++) {
            if (text.indexOf(brands[j]) !== -1) found.push(brands[j]);
        }
        return found.length >= 2 ? found.slice(0, 6).join(', ') : '';
    }

    function extractCulture(results) {
        if (!results) return '';
        var text = allSnippets(results);
        var patterns = [
            /(?:culture|values?|mission)[:\s]+([A-Z"][^.]{15,200})/i,
            /(?:known\s+for|recognized\s+for|committed\s+to|focuses?\s+on|believes?\s+in)\s+([a-z][^.]{15,150})/i,
            /(?:workplace|work\s+environment|company\s+culture)[:\s]+([^.]{15,150})/i
        ];
        for (var i = 0; i < patterns.length; i++) {
            var m = text.match(patterns[i]);
            if (m && m[1]) {
                var cult = m[1].trim().replace(/\.$/, '');
                if (cult.length > 10 && cult.length < 200) return cult;
            }
        }
        // Try extracting from Glassdoor or culture-related snippets
        if (results.organic) {
            for (var j = 0; j < results.organic.length; j++) {
                var snippet = results.organic[j].snippet || '';
                var title = results.organic[j].title || '';
                if (/culture|values|mission|workplace/i.test(title) && snippet.length > 30) {
                    return snippet.substring(0, 200).replace(/\.$/, '');
                }
            }
        }
        return '';
    }

    function extractAchievements(results, name) {
        if (!results || !results.organic) return [];
        var items = [];
        var seen = {};
        var text = allSnippets(results);

        // Look for achievement patterns
        var patterns = [
            /(?:awarded|won|received|earned|recognized|named|selected|appointed|promoted)\s+([^.]{10,120})/gi,
            /(?:led|launched|built|grew|scaled|delivered|drove|achieved|increased|reduced|managed)\s+([^.]{10,120})/gi,
            /(?:speaker|panelist|keynote)\s+(?:at|for)\s+([^.]{5,80})/gi
        ];
        for (var i = 0; i < patterns.length; i++) {
            var m;
            while ((m = patterns[i].exec(text)) !== null) {
                var achievement = m[0].trim().replace(/\.$/, '');
                if (achievement.length > 10 && achievement.length < 150 && !seen[achievement]) {
                    items.push(achievement);
                    seen[achievement] = true;
                }
            }
        }

        return items.slice(0, 5);
    }

    function extractTeam(results, name) {
        if (!results) return '';
        var text = allSnippets(results);
        var patterns = [
            /(?:manages?|leads?|oversees?|heads?)\s+(?:a\s+)?(?:team\s+of\s+)?(\d+[\s\-+]*(?:people|employees|engineers|developers|reports|members|staff|direct\s+reports))/i,
            /(\d+)\s*(?:\+\s*)?(?:direct\s+reports|reports|team\s+members)/i,
            /(?:team\s+of|leading)\s+(\d+)/i,
            /(?:manages?|leads?)\s+(?:the\s+)?([A-Z][a-zA-Z\s&]+?)\s+(?:team|department|group|division)/i
        ];
        for (var i = 0; i < patterns.length; i++) {
            var m = text.match(patterns[i]);
            if (m && m[1]) {
                var team = m[0].trim().replace(/\.$/, '');
                if (team.length > 3 && team.length < 100) return team;
            }
        }
        return '';
    }

    // ══════════════════════════════════════════
    // Tenure Extraction (company tenure + role tenure)
    // ══════════════════════════════════════════
    function extractTenure(results, name, companyName) {
        if (!results) return { companyTenure: '', roleTenure: '' };
        var text = allSnippets(results);
        var now = new Date();
        var companyLower = (companyName || '').toLowerCase();

        var monthMap = {
            'jan': 0, 'january': 0, 'feb': 1, 'february': 1, 'mar': 2, 'march': 2,
            'apr': 3, 'april': 3, 'may': 4, 'jun': 5, 'june': 5,
            'jul': 6, 'july': 6, 'aug': 7, 'august': 7, 'sep': 8, 'september': 8,
            'oct': 9, 'october': 9, 'nov': 10, 'november': 10, 'dec': 11, 'december': 11
        };

        function parseDateStr(s) {
            if (!s) return null;
            s = s.trim();
            if (/present|current/i.test(s)) return now;
            var my = s.match(/(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})/i);
            if (my) { var mo = monthMap[my[1].toLowerCase().substring(0, 3)]; return new Date(parseInt(my[2]), mo !== undefined ? mo : 0, 1); }
            var yr = s.match(/(\d{4})/);
            if (yr) return new Date(parseInt(yr[1]), 0, 1);
            return null;
        }

        function formatDuration(startDate, endDate) {
            if (!startDate || !endDate) return '';
            var months = (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth());
            if (months < 0) return '';
            var years = Math.floor(months / 12);
            var rem = months % 12;
            if (years === 0 && rem === 0) return 'Less than a month';
            if (years === 0) return rem + (rem === 1 ? ' month' : ' months');
            if (rem === 0) return years + (years === 1 ? ' year' : ' years');
            return years + (years === 1 ? ' year' : ' years') + ', ' + rem + (rem === 1 ? ' month' : ' months');
        }

        var companyTenure = '';
        var roleTenure = '';

        // Strategy 1: Parse structured work history "Company - Role (Date - Date)"
        var workPattern = /([A-Z][a-zA-Z &.']+)\s*[-–—]\s*([A-Z][a-zA-Z &\/.']+)\s*\(((?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+)?\d{4})\s*[-–—]\s*(Present|(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+)?\d{4})\)/gi;
        var entries = [];
        var m;
        while ((m = workPattern.exec(text)) !== null) {
            entries.push({ company: m[1].trim(), role: m[2].trim(), startStr: m[3], endStr: m[4] });
        }

        // Find entries matching the current company
        var companyEntries = entries.filter(function (e) {
            return e.company.toLowerCase().indexOf(companyLower) !== -1 || companyLower.indexOf(e.company.toLowerCase()) !== -1;
        });

        if (companyEntries.length > 0) {
            companyEntries.sort(function (a, b) {
                var aD = parseDateStr(a.startStr), bD = parseDateStr(b.startStr);
                return (aD && bD) ? aD - bD : 0;
            });
            var earliestStart = parseDateStr(companyEntries[0].startStr);
            companyTenure = formatDuration(earliestStart, now);

            // Current role = most recent entry that ends with "Present"
            var currentRole = companyEntries.filter(function (e) { return /present/i.test(e.endStr); });
            if (currentRole.length > 0) {
                var latest = currentRole[currentRole.length - 1];
                roleTenure = formatDuration(parseDateStr(latest.startStr), now);
            }
        }

        // Strategy 2: Look for LinkedIn-style duration text "X yrs Y mos" near company name
        if (!companyTenure) {
            var idx = text.toLowerCase().indexOf(companyLower);
            if (idx !== -1) {
                var context = text.substring(idx, Math.min(text.length, idx + 500));
                // LinkedIn shows "3 yrs 5 mos" or "3 years 5 months" or "1 yr 2 mos"
                var durMatch = context.match(/(\d+)\s*(?:years?|yrs?)\s*(?:,?\s*(\d+)\s*(?:months?|mos?))?/i);
                if (durMatch) {
                    var yrs = parseInt(durMatch[1]);
                    var mos = durMatch[2] ? parseInt(durMatch[2]) : 0;
                    if (mos === 0) companyTenure = yrs + (yrs === 1 ? ' year' : ' years');
                    else companyTenure = yrs + (yrs === 1 ? ' year' : ' years') + ', ' + mos + (mos === 1 ? ' month' : ' months');
                } else {
                    var moOnly = context.match(/(\d+)\s*(?:months?|mos?)/i);
                    if (moOnly) companyTenure = parseInt(moOnly[1]) + ' months';
                }
            }
        }

        // Strategy 3: Look for generic date ranges with the company nearby
        if (!companyTenure) {
            var dateRangePattern = /((?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+)?\d{4})\s*[-–—]\s*(Present|(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+)?\d{4})/gi;
            var allRanges = [];
            while ((m = dateRangePattern.exec(text)) !== null) {
                allRanges.push({ startStr: m[1], endStr: m[2], index: m.index });
            }
            // Find ranges near the company name
            var companyIdx = text.toLowerCase().indexOf(companyLower);
            if (companyIdx !== -1) {
                var nearby = allRanges.filter(function (r) { return Math.abs(r.index - companyIdx) < 300; });
                if (nearby.length > 0) {
                    // Use the first range near the company as company tenure
                    var range = nearby[0];
                    var start = parseDateStr(range.startStr);
                    var end = parseDateStr(range.endStr);
                    companyTenure = formatDuration(start, end || now);
                }
            }
        }

        console.log('[DemoBrief] Tenure extraction:', { companyTenure: companyTenure, roleTenure: roleTenure });
        return { companyTenure: companyTenure, roleTenure: roleTenure };
    }

    // ══════════════════════════════════════════
    // Industry Extraction from LinkedIn Company Page
    // ══════════════════════════════════════════
    function extractIndustryFromLinkedIn(results) {
        if (!results) return '';
        var text = allSnippets(results);

        // LinkedIn company pages show industry in snippets like "Industry: Software Development"
        // or "Software Development · Company Size: 1,001-5,000"
        var patterns = [
            /(?:industry|industries)[:\s]+([A-ZÀ-ÿ][a-zA-ZÀ-ÿ\s&\/,]+?)(?:\s*[·|•]|\s*\.\s|$)/im,
            /^([A-Z][a-zA-Z\s&\/]+?)\s*[·|•]\s*(?:company\s+size|[\d,]+\s*[-–]\s*[\d,]+\s*employees)/im,
            /(?:specialties|specialities|specializing in|focused on)[:\s]+([A-ZÀ-ÿ][a-zA-ZÀ-ÿ\s&\/,]+?)(?:\s*\.\s|$)/im
        ];
        for (var i = 0; i < patterns.length; i++) {
            var m = text.match(patterns[i]);
            if (m && m[1]) {
                var ind = m[1].trim().replace(/[.,;]$/, '');
                if (ind.length > 2 && ind.length < 60) return ind;
            }
        }

        // Also check individual snippets for LinkedIn company page format
        if (results.organic) {
            for (var j = 0; j < results.organic.length; j++) {
                var snippet = results.organic[j].snippet || '';
                var link = results.organic[j].link || '';
                if (/linkedin\.com\/company/i.test(link)) {
                    // LinkedIn company snippets often have: "Industry\nSoftware Development" or "Software Development · San Francisco, CA"
                    var indMatch = snippet.match(/(?:Industry\s*[:.]?\s*)([\w\s&\/]+?)(?:\s*[·|•\n]|$)/i);
                    if (indMatch && indMatch[1].trim().length > 2) return indMatch[1].trim();
                    // Try first line which is often the industry
                    var lines = snippet.split(/\s*[·•|]\s*/);
                    if (lines.length >= 2) {
                        var firstPart = lines[0].trim();
                        // Check if this looks like an industry (not a name or sentence)
                        if (firstPart.length > 2 && firstPart.length < 50 && !/^\d/.test(firstPart) && !/^http/i.test(firstPart)) {
                            return firstPart;
                        }
                    }
                }
            }
        }
        return '';
    }

    // ══════════════════════════════════════════
    // Remote Jobs Extraction from LinkedIn Jobs
    // ══════════════════════════════════════════
    function extractRemoteJobsFromLinkedIn(results) {
        if (!results) return '';
        var text = allSnippets(results);

        // LinkedIn jobs pages show count like "89 results" or "89 jobs" or "showing 1-25 of 89"
        var patterns = [
            /(\d[\d,]*)\s*(?:\+\s*)?(?:remote|work from home|wfh)\s*(?:jobs?|positions?|roles?|openings?|results?)/i,
            /(\d[\d,]*)\s*(?:\+\s*)?(?:jobs?|positions?|roles?|openings?|results?)\s*(?:for\s+)?(?:remote|work from home)/i,
            /(?:showing|found|displaying)\s*(?:\d+\s*[-–]\s*\d+\s*of\s*)?(\d[\d,]*)\s*(?:remote\s+)?(?:jobs?|results?|positions?)/i,
            /(\d[\d,]*)\s*(?:\+\s*)?(?:open\s+)?(?:remote\s+)?(?:jobs?|positions?|roles?|openings?)/i,
            /(\d[\d,]*)\s*results?/i
        ];
        for (var i = 0; i < patterns.length; i++) {
            var m = text.match(patterns[i]);
            if (m && m[1]) {
                var count = m[1].replace(/,/g, '');
                if (parseInt(count) > 0) return m[1] + ' remote roles';
            }
        }

        // Also check titles for job counts
        if (results.organic) {
            for (var j = 0; j < results.organic.length; j++) {
                var title = results.organic[j].title || '';
                var countMatch = title.match(/(\d[\d,]*)\s*(?:\+\s*)?(?:remote|wfh)?\s*(?:jobs?|positions?|openings?)/i);
                if (countMatch) return countMatch[1] + ' remote roles';
            }
        }
        return '';
    }

    function extractCompanySizeFromLinkedIn(results) {
        if (!results) return '';
        var text = allSnippets(results);
        // LinkedIn company pages show size ranges like "1,001-5,000 employees"
        var patterns = [
            /([\d,]+\s*[-–]\s*[\d,]+)\s*employees/i,
            /([\d,]+)\s*\+?\s*employees/i,
            /company\s+size[:\s]*([\d,]+(?:\s*[-–]\s*[\d,]+)?)/i,
            /([\d,]+)\s*(?:people|workers|staff|professionals|associates)/i,
            /(?:has|with|employs?|about|approximately|over|nearly)\s*([\d,]+(?:\s*[-–]\s*[\d,]+)?)\s*(?:\+?\s*)?(?:employees|people|workers|staff)/i
        ];
        for (var i = 0; i < patterns.length; i++) {
            var m = text.match(patterns[i]);
            if (m) return m[1].trim();
        }
        // Also check URLs and titles for LinkedIn company page data
        if (results.organic) {
            for (var j = 0; j < results.organic.length; j++) {
                var title = results.organic[j].title || '';
                var snippet = results.organic[j].snippet || '';
                var combined = title + ' ' + snippet;
                var sizeMatch = combined.match(/([\d,]+\s*[-–]\s*[\d,]+)\s*employees/i);
                if (sizeMatch) return sizeMatch[1].trim();
                sizeMatch = combined.match(/([\d,]+)\s*\+?\s*employees/i);
                if (sizeMatch) return sizeMatch[1].trim();
            }
        }
        return '';
    }

    // ══════════════════════════════════════════
    // Research Pipeline
    // ══════════════════════════════════════════
    var RESEARCH_TASKS = [
        { id: 'parse', label: 'Parsing LinkedIn URL' },
        { id: 'prospect', label: 'Researching prospect profile' },
        { id: 'content', label: 'Finding published content & achievements' },
        { id: 'company', label: 'Researching company overview' },
        { id: 'customers', label: 'Finding customers & culture' },
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

    // Debug storage for raw API responses
    var debugResponses = [];

    function addDebugResponse(label, query, results, extracted, source) {
        debugResponses.push({
            label: label,
            query: query,
            results: results,
            extracted: extracted,
            source: source || (
                /netrows/i.test(label) ? 'netrows' :
                /serper|site:|linkedin\.com/i.test(query) ? 'serper' :
                'serper'
            ),
            timestamp: new Date().toISOString()
        });
    }

    function renderDebugPanel() {
        var section = document.getElementById('research-log-section');
        var content = document.getElementById('debug-content');
        if (!content) return;

        // Show the Research Log section and auto-open it
        if (section) {
            section.style.display = '';
            var body = document.getElementById('research-log');
            var toggle = section.querySelector('.form-section-toggle');
            if (body) body.classList.add('open');
            if (toggle) toggle.classList.add('open');
        }
        content.innerHTML = '';

        // Show run summary header
        var netrowsCount = 0, serperCount = 0;
        debugResponses.forEach(function (dr) {
            if (dr.source === 'netrows') netrowsCount++;
            else serperCount++;
        });
        var summary = document.createElement('div');
        summary.style.cssText = 'padding:8px 12px;background:#f1f5f9;border-radius:6px;margin-bottom:12px;font-size:12px;color:#475569;display:flex;gap:12px;align-items:center;';
        summary.innerHTML =
            '<span>' + debugResponses.length + ' API calls</span>' +
            (netrowsCount ? '<span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:4px;font-weight:600;">Netrows: ' + netrowsCount + '</span>' : '') +
            (serperCount ? '<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:4px;font-weight:600;">Serper: ' + serperCount + '</span>' : '') +
            (debugResponses.length > 0 && debugResponses[0].timestamp ? '<span style="margin-left:auto;">' + new Date(debugResponses[0].timestamp).toLocaleTimeString() + '</span>' : '');
        content.appendChild(summary);

        debugResponses.forEach(function (dr, idx) {
            var step = document.createElement('div');
            step.className = 'debug-step';

            var organicCount = (dr.results && dr.results.organic) ? dr.results.organic.length : 0;
            var hasKG = !!(dr.results && dr.results.knowledgeGraph && dr.results.knowledgeGraph.title);
            var isNetrows = dr.source === 'netrows';
            var isError = dr.results && dr.results.error;

            // Source badge
            var sourceBadge = isNetrows
                ? '<span style="display:inline-block;background:#dbeafe;color:#1e40af;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:700;margin-right:6px;vertical-align:middle;">NETROWS</span>'
                : '<span style="display:inline-block;background:#fef3c7;color:#92400e;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:700;margin-right:6px;vertical-align:middle;">SERPER</span>';

            // Summary of what was found
            var snippetPreview = '';
            if (dr.results && dr.results.organic && dr.results.organic[0]) {
                snippetPreview = (dr.results.organic[0].title || '').substring(0, 80);
            }

            // For Netrows results, show key fields instead of organic count
            var resultSummary = '';
            if (isNetrows && !isError) {
                var r = dr.results;
                if (r && r.firstName) resultSummary = 'Profile: ' + (r.firstName || '') + ' ' + (r.lastName || '') + (r.headline ? ' — ' + r.headline.substring(0, 60) : '');
                else if (r && r.data && r.data.name) resultSummary = 'Company: ' + r.data.name + (r.data.industries ? ' (' + r.data.industries.join(', ') + ')' : '');
                else if (r && r.data && Array.isArray(r.data)) resultSummary = r.data.length + ' results';
                else resultSummary = 'Data received';
            } else if (isError) {
                resultSummary = 'Error: ' + (dr.results.error || 'unknown');
            } else {
                resultSummary = organicCount + ' organic results' +
                    (hasKG ? ' + KG (' + escHtml(dr.results.knowledgeGraph.title) + ')' : '') +
                    (snippetPreview ? ' — "' + escHtml(snippetPreview) + '"' : '');
            }

            var extractedStr = '';
            if (dr.extracted) {
                var parts = Object.keys(dr.extracted).map(function (k) {
                    var v = dr.extracted[k];
                    if (Array.isArray(v)) return k + ': [' + v.length + ']';
                    if (!v) return k + ': (empty)';
                    return k + ': ' + String(v).substring(0, 50);
                });
                extractedStr = parts.join(' | ');
            }

            var timeStr = dr.timestamp ? '<span style="color:#94a3b8;font-size:10px;margin-left:auto;">' + new Date(dr.timestamp).toLocaleTimeString() + '</span>' : '';

            step.innerHTML =
                '<div class="debug-step-label" style="display:flex;align-items:center;">' + sourceBadge + escHtml(dr.label) + timeStr + '</div>' +
                '<div class="debug-step-query">q: ' + escHtml(dr.query) + '</div>' +
                '<div class="debug-step-summary">' + resultSummary + '</div>' +
                (extractedStr ? '<div class="debug-step-summary" style="color:#059669;">Extracted: ' + escHtml(extractedStr) + '</div>' : '') +
                '<button type="button" class="debug-show-raw" data-debug-idx="' + idx + '">Show raw JSON</button>' +
                '<pre class="debug-step-raw" id="debug-raw-' + idx + '"></pre>';

            content.appendChild(step);
        });

        // Wire up show/hide raw JSON buttons
        content.querySelectorAll('.debug-show-raw').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var idx = parseInt(this.getAttribute('data-debug-idx'));
                var pre = document.getElementById('debug-raw-' + idx);
                if (pre.classList.contains('open')) {
                    pre.classList.remove('open');
                    this.textContent = 'Show raw JSON';
                } else {
                    pre.textContent = JSON.stringify(debugResponses[idx].results, null, 2);
                    pre.classList.add('open');
                    this.textContent = 'Hide raw JSON';
                }
            });
        });
    }

    async function runResearch(linkedInUrl, companyName, apiKey) {
        var parsed = parseLinkedInUrl(linkedInUrl);
        if (!parsed) throw new Error('Invalid LinkedIn URL');

        var name = parsed.name;
        debugResponses = [];
        console.log('[DemoBrief] Starting research for:', name, (companyName ? 'at ' + companyName : '(company TBD)'));

        // Step 1: Parse URL & auto-detect company
        setProgress('parse', 'active');
        var netrowsKey = getNetrowsApiKey();
        var netrowsProfile = null;
        var netrowsCompanyData = null;

        // ── Netrows-first: get LinkedIn profile directly ──
        console.log('[DemoBrief] Netrows API key available:', !!netrowsKey, netrowsKey ? '(' + netrowsKey.substring(0, 8) + '...)' : '(none)');
        if (netrowsKey) {
            try {
                console.log('[DemoBrief] Using Netrows API for LinkedIn data');
                netrowsProfile = await netrowsProfileLookup(parsed.url);
                addDebugResponse('Netrows Profile', parsed.url, netrowsProfile, {}, 'netrows');

                if (netrowsProfile) {
                    var profileData = parseNetrowsProfile(netrowsProfile, companyName);
                    if (!companyName && profileData.company) {
                        companyName = profileData.company;
                        console.log('[DemoBrief] Netrows auto-detected company:', companyName);
                    }
                    name = profileData.name || name;
                }
            } catch (e) {
                console.error('[DemoBrief] Netrows profile lookup error:', e);
                addDebugResponse('Netrows Profile (error)', parsed.url, { error: e.message }, {}, 'netrows');
            }
        } else {
            console.warn('[DemoBrief] Netrows API key NOT configured — skipping LinkedIn data lookup');
            addDebugResponse('Netrows Profile (skipped)', 'No API key configured', { skipped: true }, {}, 'netrows');
        }

        // Fallback: Serper-based company detection
        if (!companyName) {
            try {
                var detectResults = await serperSearch('site:linkedin.com/in/' + parsed.slug, apiKey);
                companyName = extractCompanyFromLinkedIn(detectResults, name);
                addDebugResponse('Company Auto-Detect (slug)', 'site:linkedin.com/in/' + parsed.slug, detectResults, { company: companyName });

                if (!companyName) {
                    var detectResults2 = await serperSearch('"' + name + '" LinkedIn current', apiKey);
                    companyName = extractCompanyFromLinkedIn(detectResults2, name);
                    addDebugResponse('Company Auto-Detect (name)', '"' + name + '" LinkedIn current', detectResults2, { company: companyName });
                }
            } catch (e) {
                console.error('[DemoBrief] Company auto-detect error:', e);
            }
            if (!companyName) {
                // Don't hard-fail — let the user provide the company name
                setProgress('parse', 'error', 'Could not detect company');
                renderDebugPanel();
                // Populate prospect name so it's not lost
                document.getElementById('prospect-name').value = name;
                document.getElementById('company-name').value = '';
                document.getElementById('company-name').placeholder = 'Type company name here';
                document.getElementById('company-name').focus();
                return { _needsCompany: true, prospect: { name: name, linkedin_url: parsed.url } };
            }
            console.log('[DemoBrief] Auto-detected company:', companyName);
        }
        setProgress('parse', 'done', name + ' at ' + companyName);

        var data = {
            prospect: {
                name: name,
                company: companyName,
                title: '', location: '',
                company_tenure: '', role_tenure: '',
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

        // Step 2: Prospect profile
        setProgress('prospect', 'active');

        // ── Netrows-first: populate from Netrows profile data ──
        if (netrowsProfile) {
            try {
                var pd = parseNetrowsProfile(netrowsProfile, companyName);
                data.prospect.title = pd.title || '';
                data.prospect.location = pd.location || '';
                data.prospect.company_tenure = pd.companyTenure || '';
                data.prospect.role_tenure = pd.roleTenure || '';
                data.prospect.work_history = pd.workHistory || [];
                data.prospect.certifications = pd.certifications || [];

                addDebugResponse('Prospect (Netrows)', parsed.url, netrowsProfile, {
                    title: data.prospect.title,
                    location: data.prospect.location,
                    company_tenure: data.prospect.company_tenure,
                    role_tenure: data.prospect.role_tenure,
                    work_history: data.prospect.work_history,
                    certs: data.prospect.certifications
                });

                var found = [];
                if (data.prospect.title) found.push(data.prospect.title);
                if (data.prospect.location) found.push(data.prospect.location);
                setProgress('prospect', 'done', found.join(' | ') || 'Profile loaded');
                console.log('[DemoBrief] Prospect data from Netrows:', pd);
            } catch (e) {
                console.error('[DemoBrief] Netrows profile parse error:', e);
                netrowsProfile = null; // fall through to Serper
            }
        }

        // ── Serper fallback/enrichment for prospect ──
        // Run if Netrows didn't provide data, or if key fields are still missing
        var needsSerperEnrichment = !netrowsProfile || !data.prospect.title ||
            !data.prospect.work_history.length || !data.prospect.location;
        if (needsSerperEnrichment) {
            var prospectQuery = 'site:linkedin.com/in "' + name + '" ' + companyName;
            try {
                var prospectResults = await serperSearch(prospectQuery, apiKey);

                var organicCount = (prospectResults && prospectResults.organic) ? prospectResults.organic.length : 0;
                if (organicCount === 0) {
                    var fallbackQuery = '"' + name + '" ' + companyName + ' LinkedIn';
                    addDebugResponse('Prospect (site: empty)', prospectQuery, prospectResults, {});
                    prospectQuery = fallbackQuery;
                    prospectResults = await serperSearch(fallbackQuery, apiKey);
                }

                if (!data.prospect.title) data.prospect.title = extractTitle(prospectResults, name);
                if (!data.prospect.location) data.prospect.location = extractLocation(prospectResults);
                if (!data.prospect.certifications.length) data.prospect.certifications = extractCerts(prospectResults);
                if (!data.prospect.work_history.length) data.prospect.work_history = extractWorkHistory(prospectResults, name);
                data.prospect.team = extractTeam(prospectResults, name);
                data.prospect.achievements = extractAchievements(prospectResults, name);

                // Extract tenure if not already from Netrows
                if (!data.prospect.company_tenure) {
                    var tenure = extractTenure(prospectResults, name, companyName);
                    data.prospect.company_tenure = tenure.companyTenure;
                    data.prospect.role_tenure = tenure.roleTenure;

                    if (!data.prospect.company_tenure) {
                        var tenureQuery = '"' + name + '" "' + companyName + '" LinkedIn experience';
                        var tenureResults = await serperSearch(tenureQuery, apiKey);
                        var tenure2 = extractTenure(tenureResults, name, companyName);
                        if (tenure2.companyTenure) data.prospect.company_tenure = tenure2.companyTenure;
                        if (tenure2.roleTenure) data.prospect.role_tenure = tenure2.roleTenure;
                    }
                }

                addDebugResponse('Prospect Profile (Serper)', prospectQuery, prospectResults, {
                    title: data.prospect.title,
                    location: data.prospect.location,
                    company_tenure: data.prospect.company_tenure,
                    role_tenure: data.prospect.role_tenure
                });

                if (!data.prospect.location) {
                    var locQuery = '"' + name + '" location OR based OR area';
                    var locResults = await serperSearch(locQuery, apiKey);
                    data.prospect.location = extractLocation(locResults);
                    if (!data.prospect.location) {
                        var compLinkedIn = await serperSearch('site:linkedin.com/company "' + companyName + '"', apiKey);
                        data.prospect.location = extractLocation(compLinkedIn);
                    }
                }

                var found = [];
                if (data.prospect.title) found.push(data.prospect.title);
                if (data.prospect.location) found.push(data.prospect.location);
                setProgress('prospect', 'done', found.join(' | ') || 'Limited data');
            } catch (e) {
                console.error('[DemoBrief] Prospect search error:', e);
                setProgress('prospect', 'error', e.message);
            }
        }

        // Step 3: Published content
        setProgress('content', 'active');
        var contentQuery = '"' + name + '" article OR talk OR keynote OR blog OR interview';
        try {
            var contentResults = await serperSearch(contentQuery, apiKey);
            console.log('[DemoBrief] Content results:', contentResults);
            data.prospect.published_content = extractPublishedContent(contentResults, name);
            addDebugResponse('Published Content', contentQuery, contentResults, {
                items: data.prospect.published_content
            });
            setProgress('content', 'done', data.prospect.published_content.length + ' items found');
        } catch (e) {
            console.error('[DemoBrief] Content search error:', e);
            addDebugResponse('Published Content', contentQuery, { error: e.message }, {});
            setProgress('content', 'error', e.message);
        }

        // Step 4: Company overview
        setProgress('company', 'active');

        // ── Netrows-first: get company details directly ──
        if (netrowsKey) {
            try {
                // Determine company LinkedIn URL
                var companyLinkedInUrl = '';
                if (netrowsProfile && netrowsProfile.position && netrowsProfile.position.length > 0) {
                    // Find the position matching the target company
                    var companyLower = companyName.toLowerCase();
                    for (var pi = 0; pi < netrowsProfile.position.length; pi++) {
                        var posName = (netrowsProfile.position[pi].companyName || '').toLowerCase();
                        if (posName.indexOf(companyLower) !== -1 || companyLower.indexOf(posName) !== -1) {
                            companyLinkedInUrl = netrowsProfile.position[pi].companyURL || '';
                            // Also grab industry from position data
                            if (netrowsProfile.position[pi].companyIndustry) {
                                data.company.industry = netrowsProfile.position[pi].companyIndustry;
                            }
                            if (netrowsProfile.position[pi].companyStaffCountRange) {
                                data.company.size = netrowsProfile.position[pi].companyStaffCountRange;
                            }
                            break;
                        }
                    }
                    // Fallback: use first position's company URL
                    if (!companyLinkedInUrl && netrowsProfile.position[0].companyURL) {
                        companyLinkedInUrl = netrowsProfile.position[0].companyURL;
                    }
                }

                if (companyLinkedInUrl) {
                    netrowsCompanyData = await netrowsCompanyLookup(companyLinkedInUrl);
                    var cd = parseNetrowsCompany(netrowsCompanyData);
                    addDebugResponse('Company (Netrows)', companyLinkedInUrl, netrowsCompanyData, cd);
                    console.log('[DemoBrief] Company data from Netrows:', cd);

                    // Populate company data from Netrows
                    if (cd.industry) data.company.industry = cd.industry;
                    if (cd.size) data.company.size = cd.size;
                    if (cd.employee_count) data.company.employee_count = cd.employee_count;
                    if (cd.headquarters) data.company.headquarters = cd.headquarters;
                    if (cd.website) data.company.website = cd.website;
                    if (cd.product_description) data.company.product_description = cd.product_description;
                    if (cd.founded) data.company.founded = cd.founded;
                    if (cd.name) data.company.name = cd.name;
                }

                // Netrows job search — get total open roles and remote roles
                try {
                    // First: get ALL open roles at this company
                    var allJobResults = await netrowsJobSearch(companyName, {});
                    addDebugResponse('All Jobs (Netrows)', companyName, allJobResults, {});
                    var totalJobs = 0;
                    if (allJobResults && allJobResults.total) totalJobs = allJobResults.total;
                    else if (allJobResults && allJobResults.data && Array.isArray(allJobResults.data)) totalJobs = allJobResults.data.length;

                    // Then: get remote-only roles
                    var remoteJobResults = await netrowsJobSearch(companyName, { onsiteRemote: 'remote' });
                    addDebugResponse('Remote Jobs (Netrows)', companyName + ' remote', remoteJobResults, {});
                    var remoteJobs = 0;
                    if (remoteJobResults && remoteJobResults.total) remoteJobs = remoteJobResults.total;
                    else if (remoteJobResults && remoteJobResults.data && Array.isArray(remoteJobResults.data)) remoteJobs = remoteJobResults.data.length;

                    // Show both counts if available
                    if (totalJobs > 0 && remoteJobs > 0) {
                        data.company.open_remote_jobs = totalJobs + ' open roles (' + remoteJobs + ' remote)';
                    } else if (totalJobs > 0) {
                        data.company.open_remote_jobs = totalJobs + ' open roles';
                    } else if (remoteJobs > 0) {
                        data.company.open_remote_jobs = remoteJobs + ' remote roles';
                    }
                } catch (je) {
                    console.error('[DemoBrief] Netrows job search error:', je);
                }

            } catch (e) {
                console.error('[DemoBrief] Netrows company lookup error:', e);
                addDebugResponse('Company (Netrows error)', companyName, { error: e.message }, {}, 'netrows');
            }
        } else if (!netrowsKey) {
            addDebugResponse('Company (Netrows skipped)', 'No API key configured', { skipped: true }, {}, 'netrows');
        }

        // ── Serper enrichment for company (fill gaps) ──
        var companyQuery = companyName;
        try {
            var companyResults = await serperSearch(companyQuery, apiKey);
            console.log('[DemoBrief] Company results:', companyResults);

            if (!data.company.industry) data.company.industry = extractIndustry(companyResults);
            if (!data.company.founded) data.company.founded = extractFounded(companyResults);
            if (!data.company.ticker) data.company.ticker = extractTicker(companyResults);
            if (!data.company.headquarters) data.company.headquarters = extractHQ(companyResults);
            if (!data.company.website) data.company.website = extractWebsite(companyResults, companyName);
            if (!data.company.employee_count) {
                data.company.employee_count = extractEmployeeCount(companyResults);
                if (data.company.employee_count) data.company.size = data.company.employee_count + ' employees';
            }

            // Extract product description from KG or snippets (if not already from Netrows)
            var kg = getKG(companyResults);
            if (!data.company.product_description && kg.description) data.company.product_description = kg.description;
            if (!data.company.product_description) {
                if (companyResults && companyResults.organic) {
                    for (var ci = 0; ci < Math.min(3, companyResults.organic.length); ci++) {
                        var snip = companyResults.organic[ci].snippet || '';
                        if (snip.length > 40 && !/linkedin|glassdoor/i.test(companyResults.organic[ci].link || '')) {
                            data.company.product_description = snip.substring(0, 200);
                            break;
                        }
                    }
                }
            }

            addDebugResponse('Company Overview', companyQuery, companyResults, {
                industry: data.company.industry,
                founded: data.company.founded,
                hq: data.company.headquarters,
                website: data.company.website,
                employees: data.company.employee_count,
                product: data.company.product_description ? data.company.product_description.substring(0, 60) : ''
            });

            // If industry not found, try LinkedIn company page search
            if (!data.company.industry) {
                var linkedInIndustryQuery = 'site:linkedin.com/company "' + companyName + '"';
                var linkedInIndustryResults = await serperSearch(linkedInIndustryQuery, apiKey);
                data.company.industry = extractIndustryFromLinkedIn(linkedInIndustryResults);
                // If still not found, try broader LinkedIn company search
                if (!data.company.industry) {
                    data.company.industry = extractIndustry(linkedInIndustryResults);
                }
                addDebugResponse('Industry (LinkedIn company)', linkedInIndustryQuery, linkedInIndustryResults, {
                    industry: data.company.industry
                });

                // If still no industry, try a focused industry search
                if (!data.company.industry) {
                    var industryQuery = companyName + ' industry sector';
                    var industryResults = await serperSearch(industryQuery, apiKey);
                    data.company.industry = extractIndustry(industryResults);
                    if (!data.company.industry) data.company.industry = extractIndustryFromLinkedIn(industryResults);
                    addDebugResponse('Industry (follow-up)', industryQuery, industryResults, {
                        industry: data.company.industry
                    });
                }
            }

            // If HQ or founded still missing, try a focused follow-up search
            if (!data.company.headquarters || !data.company.founded) {
                var hqQuery = companyName + ' headquarters location founded';
                var hqResults = await serperSearch(hqQuery, apiKey);
                if (!data.company.headquarters) data.company.headquarters = extractHQ(hqResults);
                if (!data.company.founded) data.company.founded = extractFounded(hqResults);
                // Also try LinkedIn company page for HQ
                if (!data.company.headquarters) {
                    var hqText = allSnippets(hqResults);
                    // Look for "City, Country" or "City, State" anywhere
                    var hqFallback = hqText.match(/(?:headquartered|headquarters|HQ|head office|main office|based)\s+(?:in|at|:)\s+([A-ZÀ-ÿ][a-zA-ZÀ-ÿ\s]+(?:,\s*[A-Za-zÀ-ÿ\s]+)?)/i);
                    if (hqFallback) {
                        var hqVal = hqFallback[1].trim().replace(/[.,]$/, '');
                        if (hqVal.length > 2 && hqVal.length < 60) data.company.headquarters = hqVal;
                    }
                }
                addDebugResponse('Company HQ (follow-up)', hqQuery, hqResults, {
                    hq: data.company.headquarters,
                    founded: data.company.founded
                });
            }

            var companyFirstTitle = (companyResults && companyResults.organic && companyResults.organic[0])
                ? companyResults.organic[0].title : '(no results)';
            var companyFound = [data.company.industry, data.company.headquarters, data.company.employee_count ? data.company.employee_count + ' emp' : ''].filter(Boolean);
            setProgress('company', 'done', companyFound.join(' | ') || 'Top result: ' + companyFirstTitle.substring(0, 60));
        } catch (e) {
            console.error('[DemoBrief] Company search error:', e);
            addDebugResponse('Company Overview', companyQuery, { error: e.message }, {});
            setProgress('company', 'error', e.message);
        }

        // Step 4b: Get company size from LinkedIn company page if still missing
        if (!data.company.employee_count) {
            try {
                var linkedInCompanyQuery = 'site:linkedin.com/company "' + companyName + '" employees';
                var linkedInCompanyResults = await serperSearch(linkedInCompanyQuery, apiKey);
                var linkedInSize = extractCompanySizeFromLinkedIn(linkedInCompanyResults);
                if (linkedInSize) {
                    data.company.employee_count = linkedInSize;
                    data.company.size = linkedInSize + ' employees';
                }
                addDebugResponse('Company Size (LinkedIn)', linkedInCompanyQuery, linkedInCompanyResults, {
                    employee_count: data.company.employee_count
                });

                // If still no size, try a broader search
                if (!data.company.employee_count) {
                    var sizeQuery = companyName + ' number of employees company size';
                    var sizeResults = await serperSearch(sizeQuery, apiKey);
                    var broadSize = extractCompanySizeFromLinkedIn(sizeResults);
                    if (!broadSize) broadSize = extractEmployeeCount(sizeResults);
                    if (broadSize) {
                        data.company.employee_count = broadSize;
                        data.company.size = broadSize + ' employees';
                    }
                    addDebugResponse('Company Size (broad)', sizeQuery, sizeResults, {
                        employee_count: data.company.employee_count
                    });
                }
            } catch (e) {
                console.error('[DemoBrief] Company size search error:', e);
            }
        }

        // Step 5: Customers & culture
        setProgress('customers', 'active');
        try {
            var custQuery = companyName + ' customers clients case studies';
            var custResults = await serperSearch(custQuery, apiKey);
            data.company.customers = extractCustomers(custResults);
            addDebugResponse('Customers', custQuery, custResults, { customers: data.company.customers });

            var cultureQuery = companyName + ' culture values mission workplace';
            var cultureResults = await serperSearch(cultureQuery, apiKey);
            data.company.culture = extractCulture(cultureResults);
            addDebugResponse('Culture', cultureQuery, cultureResults, { culture: data.company.culture });

            var custFound = [];
            if (data.company.customers) custFound.push('Customers found');
            if (data.company.culture) custFound.push('Culture found');
            setProgress('customers', 'done', custFound.join(' | ') || 'Limited data');
        } catch (e) {
            console.error('[DemoBrief] Customers/culture search error:', e);
            setProgress('customers', 'error', e.message);
        }

        // Step 5b: Prospect achievements (if not found earlier)
        if (!data.prospect.achievements || data.prospect.achievements.length === 0) {
            try {
                var achQuery = '"' + name + '" ' + companyName + ' awarded OR recognized OR led OR launched OR speaker';
                var achResults = await serperSearch(achQuery, apiKey);
                data.prospect.achievements = extractAchievements(achResults, name);
                addDebugResponse('Achievements (follow-up)', achQuery, achResults, {
                    achievements: data.prospect.achievements
                });
            } catch (e) {
                console.error('[DemoBrief] Achievements search error:', e);
            }
        }

        // Step 6: Hiring infrastructure
        setProgress('hiring', 'active');
        var hiringQuery = companyName + ' careers jobs apply';
        try {
            var hiringResults = await serperSearch(hiringQuery, apiKey);
            console.log('[DemoBrief] Hiring results:', hiringResults);
            data.company.ats = extractATS(hiringResults);

            var remoteText = allSnippets(hiringResults);
            var remoteMatch = remoteText.match(/(\d+)\s*(?:\+\s*)?(?:remote|work from home|wfh)\s*(?:jobs?|positions?|roles?|openings?)/i);
            if (remoteMatch) data.company.open_remote_jobs = remoteMatch[1] + ' remote roles';
            if (!data.company.open_remote_jobs) {
                var jobMatch = remoteText.match(/(\d+)\s*(?:\+\s*)?(?:open\s+)?(?:jobs?|positions?|roles?|openings?)/i);
                if (jobMatch) data.company.open_remote_jobs = jobMatch[1] + ' open roles';
            }

            // If remote jobs not found, search LinkedIn jobs page specifically
            if (!data.company.open_remote_jobs) {
                try {
                    var linkedInJobsQuery = 'site:linkedin.com/jobs "' + companyName + '" remote';
                    var linkedInJobsResults = await serperSearch(linkedInJobsQuery, apiKey);
                    data.company.open_remote_jobs = extractRemoteJobsFromLinkedIn(linkedInJobsResults);
                    addDebugResponse('Remote Jobs (LinkedIn)', linkedInJobsQuery, linkedInJobsResults, {
                        remote_jobs: data.company.open_remote_jobs
                    });

                    // If still not found, try company LinkedIn page for jobs count
                    if (!data.company.open_remote_jobs) {
                        var linkedInJobsQuery2 = companyName + ' LinkedIn remote jobs open positions';
                        var linkedInJobsResults2 = await serperSearch(linkedInJobsQuery2, apiKey);
                        data.company.open_remote_jobs = extractRemoteJobsFromLinkedIn(linkedInJobsResults2);
                        if (!data.company.open_remote_jobs) {
                            var remoteText2 = allSnippets(linkedInJobsResults2);
                            var rm2 = remoteText2.match(/(\d[\d,]*)\s*(?:\+\s*)?(?:remote|work from home)\s*(?:jobs?|positions?|roles?|openings?)/i);
                            if (rm2) data.company.open_remote_jobs = rm2[1] + ' remote roles';
                        }
                        addDebugResponse('Remote Jobs (broad)', linkedInJobsQuery2, linkedInJobsResults2, {
                            remote_jobs: data.company.open_remote_jobs
                        });
                    }
                } catch (e) {
                    console.error('[DemoBrief] LinkedIn jobs search error:', e);
                }
            }

            addDebugResponse('Hiring', hiringQuery, hiringResults, {
                ats: data.company.ats,
                jobs: data.company.open_remote_jobs
            });

            // If ATS not found, try a direct search for career page ATS URLs
            if (!data.company.ats) {
                var atsQuery = companyName + ' careers site:greenhouse.io OR site:lever.co OR site:ashbyhq.com OR site:myworkdayjobs.com OR site:icims.com OR site:smartrecruiters.com OR site:jobvite.com';
                var atsResults = await serperSearch(atsQuery, apiKey);
                data.company.ats = extractATS(atsResults);
                // Also check the LinkedIn company page for ATS clues
                if (!data.company.ats && atsResults && atsResults.organic && atsResults.organic.length > 0) {
                    // If we got any results from these ATS domains, identify which one
                    for (var ai = 0; ai < atsResults.organic.length; ai++) {
                        var atsLink = atsResults.organic[ai].link || '';
                        if (/greenhouse\.io/i.test(atsLink)) { data.company.ats = 'Greenhouse'; break; }
                        if (/lever\.co/i.test(atsLink)) { data.company.ats = 'Lever'; break; }
                        if (/ashbyhq\.com/i.test(atsLink)) { data.company.ats = 'Ashby'; break; }
                        if (/myworkdayjobs\.com/i.test(atsLink)) { data.company.ats = 'Workday'; break; }
                        if (/icims\.com/i.test(atsLink)) { data.company.ats = 'iCIMS'; break; }
                        if (/smartrecruiters\.com/i.test(atsLink)) { data.company.ats = 'SmartRecruiters'; break; }
                        if (/jobvite\.com/i.test(atsLink)) { data.company.ats = 'Jobvite'; break; }
                        if (/bamboohr\.com/i.test(atsLink)) { data.company.ats = 'BambooHR'; break; }
                        if (/successfactors\.com/i.test(atsLink)) { data.company.ats = 'SAP SuccessFactors'; break; }
                        if (/taleo\.net/i.test(atsLink)) { data.company.ats = 'Taleo'; break; }
                        if (/breezy\.hr/i.test(atsLink)) { data.company.ats = 'Breezy HR'; break; }
                        if (/teamtailor\.com/i.test(atsLink)) { data.company.ats = 'Teamtailor'; break; }
                        if (/recruitee\.com/i.test(atsLink)) { data.company.ats = 'Recruitee'; break; }
                        if (/welcometothejungle/i.test(atsLink)) { data.company.ats = 'Welcome to the Jungle'; break; }
                    }
                }
                addDebugResponse('ATS (follow-up)', atsQuery, atsResults, { ats: data.company.ats });
            }

            setProgress('hiring', 'done', data.company.ats ? 'ATS: ' + data.company.ats : (data.company.open_remote_jobs || 'Limited data'));
        } catch (e) {
            console.error('[DemoBrief] Hiring search error:', e);
            addDebugResponse('Hiring', hiringQuery, { error: e.message }, {});
            setProgress('hiring', 'error', e.message);
        }

        // Step 7: Security tools
        setProgress('security', 'active');
        var secQuery = companyName + ' security compliance';
        try {
            var secResults = await serperSearch(secQuery, apiKey);
            console.log('[DemoBrief] Security results:', secResults);
            data.company.identity_tools = extractIdTools(secResults);
            data.company.compliance = extractCompliance(secResults);

            addDebugResponse('Security', secQuery, secResults, {
                tools: data.company.identity_tools,
                compliance: data.company.compliance
            });
            var secFound = data.company.identity_tools.map(function (t) { return t.name; }).join(', ');
            setProgress('security', 'done', secFound || (data.company.compliance || 'Limited data'));
        } catch (e) {
            console.error('[DemoBrief] Security search error:', e);
            addDebugResponse('Security', secQuery, { error: e.message }, {});
            setProgress('security', 'error', e.message);
        }

        // Step 8: Security incidents
        setProgress('incidents', 'active');
        var incQuery = '"' + companyName + '" data breach OR security incident OR hack';
        try {
            var incResults = await serperSearch(incQuery, apiKey);
            console.log('[DemoBrief] Incidents results:', incResults);
            data.company.security_incidents = extractIncidents(incResults, companyName);

            addDebugResponse('Incidents', incQuery, incResults, {
                incidents: data.company.security_incidents
            });
            setProgress('incidents', 'done', data.company.security_incidents.length + ' incidents found');
        } catch (e) {
            console.error('[DemoBrief] Incidents search error:', e);
            addDebugResponse('Incidents', incQuery, { error: e.message }, {});
            setProgress('incidents', 'error', e.message);
        }

        // Render the Research Log section
        renderDebugPanel();

        console.log('[DemoBrief] Research complete. Data:', data);
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
    var netrowsKeyInput = document.getElementById('netrows-api-key');
    var apiStatus = document.getElementById('api-status');

    function updateSettingsIndicator() {
        if (getApiKey() || getNetrowsApiKey()) {
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
        netrowsKeyInput.value = getNetrowsApiKey();
        apiStatus.textContent = '';
        apiStatus.className = 'api-status';
    });

    closeSettingsBtn.addEventListener('click', function () { settingsModal.style.display = 'none'; });
    settingsModal.addEventListener('click', function (e) { if (e.target === settingsModal) settingsModal.style.display = 'none'; });

    saveSettingsBtn.addEventListener('click', function () {
        saveSettings({ serperApiKey: apiKeyInput.value.trim(), netrowsApiKey: netrowsKeyInput.value.trim() });
        updateSettingsIndicator();
        settingsModal.style.display = 'none';
        showToast('Settings saved', 'success');
    });

    testApiBtn.addEventListener('click', function () {
        var serperKey = apiKeyInput.value.trim();
        var netrowsKey = netrowsKeyInput.value.trim();
        if (!serperKey && !netrowsKey) { apiStatus.textContent = 'Enter at least one API key'; apiStatus.className = 'api-status error'; return; }
        apiStatus.textContent = 'Testing...';
        apiStatus.className = 'api-status';
        var results = [];
        var promises = [];
        if (netrowsKey) {
            promises.push(
                fetch('https://www.netrows.com/api/v1/health', { headers: { 'Authorization': 'Bearer ' + netrowsKey } })
                    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
                    .then(function () { results.push('Netrows OK'); })
                    .catch(function (e) { results.push('Netrows FAILED: ' + e.message); })
            );
        }
        if (serperKey) {
            promises.push(
                testApiKey(serperKey)
                    .then(function () { results.push('Serper OK'); })
                    .catch(function (e) { results.push('Serper FAILED: ' + e.message); })
            );
        }
        Promise.all(promises).then(function () {
            var allOk = results.every(function (r) { return r.indexOf('OK') !== -1; });
            apiStatus.textContent = results.join(' | ');
            apiStatus.className = 'api-status ' + (allOk ? 'success' : 'error');
        });
    });

    // ══════════════════════════════════════════
    // UI: LinkedIn URL parsing (live hint)
    // ══════════════════════════════════════════
    var linkedInInput = document.getElementById('linkedin-url');
    var linkedInHint = document.getElementById('linkedin-hint');

    var _companyLookupAbort = null;
    var _lastParsedUrl = '';

    function handleLinkedInInput() {
        var val = linkedInInput.value.trim();
        if (!val) { linkedInHint.textContent = ''; linkedInHint.className = 'input-hint'; return; }
        var parsed = parseLinkedInUrl(val);
        if (parsed) {
            linkedInHint.textContent = 'Detected: ' + parsed.name;
            linkedInHint.className = 'input-hint success';
            // Auto-fill prospect name
            document.getElementById('prospect-name').value = parsed.name;
            // Auto-detect company (only if this is a new URL)
            if (_lastParsedUrl !== parsed.slug) {
                _lastParsedUrl = parsed.slug;
                autoDetectCompany(parsed);
            }
        } else {
            linkedInHint.textContent = 'Not a valid LinkedIn profile URL';
            linkedInHint.className = 'input-hint error';
        }
    }

    linkedInInput.addEventListener('input', handleLinkedInInput);
    linkedInInput.addEventListener('paste', function () {
        // Paste event fires before the value is updated, so defer
        setTimeout(handleLinkedInInput, 50);
    });

    function autoDetectCompany(parsed) {
        var companyInput = document.getElementById('company-name');

        var netrowsKey = getNetrowsApiKey();
        var apiKey = getApiKey();
        if (!apiKey && !netrowsKey) {
            console.log('[DemoBrief] No API keys, skipping company auto-detect');
            return;
        }

        // Cancel any previous lookup
        if (_companyLookupAbort) _companyLookupAbort.cancelled = true;
        var thisLookup = { cancelled: false };
        _companyLookupAbort = thisLookup;

        // Show loading state
        companyInput.value = '';
        companyInput.placeholder = 'Detecting company...';
        linkedInHint.textContent = 'Detected: ' + parsed.name + ' — looking up company...';

        var name = parsed.name;
        var slug = parsed.slug;

        // Strategy 1 (preferred): Netrows direct LinkedIn profile lookup
        var lookupPromise;
        if (netrowsKey) {
            lookupPromise = netrowsProfileLookup(parsed.url).then(function (profile) {
                if (thisLookup.cancelled) return '';
                if (profile && profile.position && profile.position.length > 0) {
                    // Use the first (current) position's company
                    var company = profile.position[0].companyName || '';
                    if (company) {
                        console.log('[DemoBrief] Netrows auto-detected company:', company);
                        return company;
                    }
                }
                return '';
            }).catch(function (e) {
                console.error('[DemoBrief] Netrows auto-detect error:', e);
                return '';
            }).then(function (company) {
                // If Netrows didn't find it and we have Serper, try that
                if (company) return company;
                if (!apiKey) return '';
                return serperSearch('site:linkedin.com/in/' + slug, apiKey).then(function (results) {
                    if (thisLookup.cancelled) return '';
                    var c = extractCompanyFromLinkedIn(results, name);
                    if (c) return c;
                    return serperSearch('"' + name + '" LinkedIn', apiKey).then(function (r2) {
                        if (thisLookup.cancelled) return '';
                        return extractCompanyFromLinkedIn(r2, name);
                    });
                });
            });
        } else {
            // Strategy 2 (fallback): Serper search
            lookupPromise = serperSearch('site:linkedin.com/in/' + slug, apiKey).then(function (results) {
                if (thisLookup.cancelled) return '';
                var company = extractCompanyFromLinkedIn(results, name);
                if (company) return company;
                return serperSearch('"' + name + '" LinkedIn', apiKey).then(function (r2) {
                    if (thisLookup.cancelled) return '';
                    return extractCompanyFromLinkedIn(r2, name);
                });
            });
        }

        lookupPromise.then(function (company) {
            if (thisLookup.cancelled) return;
            if (company) {
                companyInput.value = company;
                companyInput.placeholder = 'e.g. Elastic';
                linkedInHint.textContent = 'Detected: ' + name + ' at ' + company;
                console.log('[DemoBrief] Auto-detected company:', company);
            } else {
                companyInput.placeholder = 'Could not detect — type company name';
                linkedInHint.textContent = 'Detected: ' + name + ' — please enter company name';
                linkedInHint.className = 'input-hint';
                console.log('[DemoBrief] Could not auto-detect company');
            }
        }).catch(function (e) {
            if (!thisLookup.cancelled) {
                companyInput.placeholder = 'e.g. Elastic';
                linkedInHint.textContent = 'Detected: ' + name + ' — company lookup failed';
                console.error('[DemoBrief] Company lookup error:', e);
            }
        });
    }

    function extractCompanyFromLinkedIn(results, name) {
        if (!results || !results.organic) return '';

        for (var i = 0; i < Math.min(5, results.organic.length); i++) {
            var title = results.organic[i].title || '';
            var link = results.organic[i].link || '';
            var snippet = results.organic[i].snippet || '';

            console.log('[DemoBrief] Checking result for company:', title, '|', link);

            // Prefer LinkedIn profile results, but also check others
            var isLinkedIn = /linkedin\.com\/in\//i.test(link) || /linkedin/i.test(title);

            if (isLinkedIn) {
                // Strip "| LinkedIn" or "- LinkedIn" from end if present
                var cleanTitle = title.replace(/\s*[|–—-]\s*LinkedIn\s*$/i, '').trim();

                // Split by " - " (standard LinkedIn separator)
                var parts = cleanTitle.split(/\s+[-–—]\s+/);
                // Remove any trailing "LinkedIn" part that survived stripping
                while (parts.length > 1 && /^linkedin$/i.test(parts[parts.length - 1].trim())) {
                    parts.pop();
                }
                console.log('[DemoBrief] LinkedIn title parts:', parts);

                // "Name - Title - Company" → company is last
                if (parts.length >= 3) {
                    var company = parts[parts.length - 1].trim();
                    if (company.length > 1 && company.length < 60) return company;
                }
                // "Name - Title at Company" → extract company from "at" pattern
                // With only 2 parts, the second is almost always the job title, NOT
                // the company. LinkedIn format is "Name - Title - Company", so the
                // company only appears reliably as the 3rd part.
                if (parts.length === 2) {
                    var second = parts[1].trim();
                    var atMatch = second.match(/\b(?:at|chez|@|à)\s+(.+)$/i);
                    if (atMatch && atMatch[1].length > 1) return atMatch[1].trim();
                }
            }

            // Try snippet for company patterns (works for any result)
            var atPatterns = [
                /(?:^|\.\s+|\,\s+)(?:[A-Za-z\s&]+)\s+(?:at|chez|@|à)\s+([A-ZÀ-ÿ][a-zA-ZÀ-ÿ\s&.]+?)(?:\s*[·|•]|\s*\.\s|\s*,\s|$)/,
                /(?:works?\s+(?:at|for)|employed\s+(?:at|by)|currently\s+at)\s+([A-ZÀ-ÿ][a-zA-ZÀ-ÿ\s&.]+?)(?:\s*[·|•]|\s*\.\s|\s*,\s|$)/i,
                // "Company · Title" or "Company · Location" (LinkedIn snippet format)
                /^([A-ZÀ-ÿ][a-zA-ZÀ-ÿ\s&.,]+?)\s*[·|•]\s/
            ];
            for (var p = 0; p < atPatterns.length; p++) {
                var atCompany = snippet.match(atPatterns[p]);
                if (atCompany && atCompany[1].length > 1 && atCompany[1].length < 60) return atCompany[1].trim();
            }
        }
        return '';
    }

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
        if (!sdr) { showToast('Enter SDR name', 'error'); document.getElementById('sdr-name').focus(); return; }

        var apiKey = getApiKey();
        var netrowsAvailable = !!getNetrowsApiKey();
        if (!apiKey && !netrowsAvailable) {
            settingsModal.style.display = '';
            netrowsKeyInput.focus();
            showToast('Add your Netrows or Serper API key to enable research', 'error');
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
        previewLoadingText.textContent = 'Researching prospect...';

        try {
            var data = await runResearch(url, company, apiKey);

            // If company couldn't be detected, stop and ask user to provide it
            if (data._needsCompany) {
                previewLoading.style.display = 'none';
                previewEmpty.style.display = '';
                showToast('Enter the company name and click Research again', 'error');
                researchBtn.disabled = false;
                researchBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Research &amp; Generate';
                return;
            }

            // Update company field if it was auto-detected
            if (!company && data.company.name) {
                document.getElementById('company-name').value = data.company.name;
            }

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

            // Save to history
            saveBriefToHistory(data);

            // Show detailed toast with what was found
            var foundFields = [];
            if (data.prospect.title) foundFields.push('Title');
            if (data.prospect.location) foundFields.push('Location');
            if (data.company.industry) foundFields.push('Industry');
            if (data.company.website) foundFields.push('Website');
            if (data.company.headquarters) foundFields.push('HQ');
            var toastMsg = foundFields.length > 0
                ? 'Research complete — found: ' + foundFields.join(', ')
                : 'Research complete — no data extracted (check diagnostics in preview)';
            showToast(toastMsg, foundFields.length > 0 ? 'success' : 'error');
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
                company_tenure: document.getElementById('prospect-company-tenure').value.trim(),
                role_tenure: document.getElementById('prospect-role-tenure').value.trim(),
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
        setVal('prospect-company-tenure', p.company_tenure || p.tenure);
        setVal('prospect-role-tenure', p.role_tenure);
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
            saveBriefToHistory(data);
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
        var companyTenureStr = p.company_tenure || p.tenure || '';
        var roleTenureStr = p.role_tenure || '';
        var tenureParts = [];
        if (companyTenureStr && !nf(companyTenureStr)) tenureParts.push(companyTenureStr + ' at company');
        if (roleTenureStr && !nf(roleTenureStr)) tenureParts.push(roleTenureStr + ' in current role');
        var tenureDisplay = tenureParts.length ? tenureParts.join(', ') : '';
        if (role && tenureDisplay) role += ' (' + tenureDisplay + ')';
        else if (tenureDisplay) role = tenureDisplay;
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

        // Debug: show research diagnostics at the bottom of the preview
        if (debugResponses && debugResponses.length > 0) {
            html += '<div class="doc-section" style="margin-top: 24px; padding: 12px; background: #f1f5f9; border-radius: 8px; border: 1px dashed #94a3b8;">';
            html += '<div class="doc-section-title" style="color: #6366f1;">Research Diagnostics (remove before sending)</div>';
            debugResponses.forEach(function (dr) {
                var orgCount = (dr.results && dr.results.organic) ? dr.results.organic.length : 0;
                var hasKG = !!(dr.results && dr.results.knowledgeGraph && dr.results.knowledgeGraph.title);
                var firstTitle = (dr.results && dr.results.organic && dr.results.organic[0]) ? dr.results.organic[0].title : '(none)';
                var firstSnippet = (dr.results && dr.results.organic && dr.results.organic[0]) ? (dr.results.organic[0].snippet || '').substring(0, 100) : '';
                html += '<p style="font-size: 11px; margin: 4px 0; font-family: monospace;">';
                html += '<strong>' + escHtml(dr.label) + '</strong> [q: ' + escHtml(dr.query) + ']<br>';
                html += orgCount + ' results' + (hasKG ? ' + KG' : '') + ' — Top: "' + escHtml(firstTitle) + '"';
                if (firstSnippet) html += '<br>Snippet: "' + escHtml(firstSnippet) + '..."';
                html += '</p>';
            });
            html += '</div>';
        }

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
        var docCompanyTenure = p.company_tenure || p.tenure || '';
        var docRoleTenure = p.role_tenure || '';
        var docTenureParts = [];
        if (docCompanyTenure && !nf(docCompanyTenure)) docTenureParts.push(docCompanyTenure + ' at company');
        if (docRoleTenure && !nf(docRoleTenure)) docTenureParts.push(docRoleTenure + ' in current role');
        var docTenureDisplay = docTenureParts.length ? docTenureParts.join(', ') : '';
        if (role && docTenureDisplay) role += ' (' + docTenureDisplay + ')';
        else if (docTenureDisplay) role = docTenureDisplay;
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
    // Brief History UI
    // ══════════════════════════════════════════
    var newBriefBtn = document.getElementById('new-brief-btn');
    var activeBriefId = null;

    function renderHistory() {
        var list = document.getElementById('sidebar-history-list');
        var entries = BriefHistoryStore.getAll();

        if (entries.length === 0) {
            list.innerHTML = '<div class="sidebar-empty">No briefs yet.<br>Generate one to get started.</div>';
            return;
        }

        var html = '';
        entries.forEach(function (entry) {
            var isActive = activeBriefId && entry.id === activeBriefId;
            html += '<div class="history-card' + (isActive ? ' active' : '') + '" data-id="' + escHtml(entry.id) + '">' +
                '<div class="history-card-body">' +
                '<div class="history-card-name">' + escHtml(entry.prospect_name || 'Untitled') + '</div>' +
                '<div class="history-card-company">' + escHtml(entry.company_name || 'Unknown company') + '</div>' +
                '<div class="history-card-meta">' + escHtml(entry.sdr_name || '') + (entry.sdr_name ? ' &middot; ' : '') + formatRelativeDate(entry.created_at) + '</div>' +
                '</div>' +
                '<button type="button" class="history-card-delete" data-delete-id="' + escHtml(entry.id) + '" title="Delete brief">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
                '</button></div>';
        });

        list.innerHTML = html;
        list.scrollTop = 0;
    }

    function handleHistoryClick(e) {
        // Delete button
        var deleteBtn = e.target.closest('[data-delete-id]');
        if (deleteBtn) {
            e.stopPropagation();
            var id = deleteBtn.getAttribute('data-delete-id');
            if (id === activeBriefId) {
                activeBriefId = null;
            }
            BriefHistoryStore.remove(id);
            renderHistory();
            showToast('Brief removed', 'success');
            return;
        }
        // Card click — load brief
        var card = e.target.closest('.history-card');
        if (card) {
            var cardId = card.getAttribute('data-id');
            loadBriefFromHistory(cardId);
        }
    }

    function loadBriefFromHistory(id) {
        var entry = BriefHistoryStore.getById(id);
        if (!entry || !entry.data) return;

        activeBriefId = id;

        populateFormFromData(entry.data);

        // Open all sections
        document.querySelectorAll('.form-section-body').forEach(function (b) { b.classList.add('open'); });
        document.querySelectorAll('.form-section-toggle').forEach(function (b) { b.classList.add('open'); });

        // Show preview
        renderPreview(entry.data);
        previewEmpty.style.display = 'none';
        previewDoc.style.display = '';
        previewActions.style.display = '';
        window._lastBriefData = entry.data;

        // Restore research logs into debug panel
        if (entry.research_logs && entry.research_logs.length > 0) {
            debugResponses = entry.research_logs.map(function (log) {
                return {
                    label: log.label,
                    query: log.query,
                    results: log.result_summary || {},
                    extracted: log.extracted,
                    source: log.source,
                    timestamp: log.timestamp
                };
            });
            renderDebugPanel();
        } else {
            // No logs saved for this entry — hide Research Log section
            debugResponses = [];
            var logSection = document.getElementById('research-log-section');
            if (logSection) logSection.style.display = 'none';
        }

        renderHistory();
        showToast('Loaded brief for ' + (entry.prospect_name || 'prospect'), 'success');
    }

    function saveBriefToHistory(data) {
        var entry = createHistoryEntry(data, debugResponses);
        BriefHistoryStore.save(entry);
        activeBriefId = entry.id;
        renderHistory();
    }

    function resetForNewBrief() {
        // Reset form
        document.getElementById('brief-form').reset();
        // Clear repeaters
        document.getElementById('published-content-list').innerHTML = '';
        document.getElementById('identity-tools-list').innerHTML = '';
        document.getElementById('incidents-list').innerHTML = '';
        // Hide preview, show empty state
        previewDoc.style.display = 'none';
        previewActions.style.display = 'none';
        previewLoading.style.display = 'none';
        previewEmpty.style.display = '';
        // Collapse form sections
        document.querySelectorAll('.form-section-body').forEach(function (b) { b.classList.remove('open'); });
        document.querySelectorAll('.form-section-toggle').forEach(function (b) { b.classList.remove('open'); });
        // Hide research progress
        researchProgress.style.display = 'none';
        window._lastBriefData = null;
        // Clear research logs and hide section
        debugResponses = [];
        var logSection = document.getElementById('research-log-section');
        if (logSection) logSection.style.display = 'none';
        // Clear active brief and re-render sidebar
        activeBriefId = null;
        renderHistory();
    }

    // New Brief button
    newBriefBtn.addEventListener('click', resetForNewBrief);

    // Delegated click handler on sidebar history list
    document.getElementById('sidebar-history-list').addEventListener('click', handleHistoryClick);

    // ══════════════════════════════════════════
    // Init
    // ══════════════════════════════════════════
    updateSettingsIndicator();
    renderHistory();

})();
