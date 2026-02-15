/**
 * Demo Brief Generator - Client-side application
 *
 * Collects prospect/company data from a form, renders a live preview,
 * and generates a downloadable .docx file using the docx library.
 */

(function () {
    'use strict';

    // ── State ──
    let logoData = null; // { dataUrl, fileName }

    // ── DOM refs ──
    const form = document.getElementById('brief-form');
    const generateBtn = document.getElementById('generate-btn');
    const exportJsonBtn = document.getElementById('export-json-btn');
    const importJsonBtn = document.getElementById('import-json-btn');
    const downloadDocxBtn = document.getElementById('download-docx-btn');
    const previewEmpty = document.getElementById('preview-empty');
    const previewDoc = document.getElementById('preview-doc');
    const previewLoading = document.getElementById('preview-loading');
    const previewActions = document.getElementById('preview-actions');
    const docPage = document.getElementById('doc-page');

    // ══════════════════════════════════════════
    // Collapsible Sections
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
    // Logo Upload
    // ══════════════════════════════════════════
    var logoUploadArea = document.getElementById('logo-upload-area');
    var logoUploadInner = document.getElementById('logo-upload-inner');
    var logoFileInput = document.getElementById('logo-file');
    var logoPreview = document.getElementById('logo-preview');
    var logoPreviewImg = document.getElementById('logo-preview-img');
    var logoRemoveBtn = document.getElementById('logo-remove-btn');

    logoUploadInner.addEventListener('click', function () { logoFileInput.click(); });

    logoUploadArea.addEventListener('dragover', function (e) {
        e.preventDefault();
        logoUploadArea.classList.add('dragover');
    });

    logoUploadArea.addEventListener('dragleave', function () {
        logoUploadArea.classList.remove('dragover');
    });

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
        var validTypes = ['image/png', 'image/jpeg', 'image/svg+xml'];
        if (validTypes.indexOf(file.type) === -1) {
            showToast('Please upload a PNG, JPG, or SVG file.', 'error');
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
    // Repeater: Published Content
    // ══════════════════════════════════════════
    document.getElementById('add-content-btn').addEventListener('click', function () {
        addRepeaterItem('published-content-list', 'content');
    });

    document.getElementById('add-tool-btn').addEventListener('click', function () {
        addRepeaterItem('identity-tools-list', 'tool');
    });

    document.getElementById('add-incident-btn').addEventListener('click', function () {
        addRepeaterItem('incidents-list', 'incident');
    });

    function addRepeaterItem(listId, type) {
        var list = document.getElementById(listId);
        var item = document.createElement('div');
        item.className = 'repeater-item';

        var fields = document.createElement('div');
        fields.className = 'repeater-fields';

        if (type === 'content') {
            fields.innerHTML =
                '<input type="text" placeholder="Title" class="rep-title">' +
                '<input type="url" placeholder="URL" class="rep-url">' +
                '<div style="display:flex;gap:6px;">' +
                '<input type="text" placeholder="Date" class="rep-date" style="flex:1;">' +
                '<select class="rep-type" style="flex:1;"><option value="article">Article</option><option value="talk">Talk</option></select>' +
                '</div>';
        } else if (type === 'tool') {
            fields.innerHTML =
                '<input type="text" placeholder="Tool name (e.g. Okta)" class="rep-name">' +
                '<input type="text" placeholder="Description (e.g. IdP - SSO & MFA)" class="rep-desc">';
        } else if (type === 'incident') {
            fields.innerHTML =
                '<input type="text" placeholder="Date (e.g. May 2024)" class="rep-date">' +
                '<input type="text" placeholder="Incident title" class="rep-title">' +
                '<input type="text" placeholder="Details" class="rep-details">';
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
        var ats = atsCustom || atsSelect || '';

        var prospect = {
            name: document.getElementById('prospect-name').value.trim(),
            company: document.getElementById('company-name').value.trim(),
            title: document.getElementById('prospect-title').value.trim(),
            location: document.getElementById('prospect-location').value.trim(),
            tenure: document.getElementById('prospect-tenure').value.trim(),
            linkedin_url: document.getElementById('prospect-linkedin').value.trim(),
            team: document.getElementById('prospect-team').value.trim(),
            certifications: splitLines(document.getElementById('prospect-certs').value, ','),
            work_history: splitLines(document.getElementById('prospect-history').value),
            achievements: splitLines(document.getElementById('prospect-achievements').value),
            published_content: collectRepeater('published-content-list', 'content')
        };

        var company = {
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
            ats: ats,
            open_remote_jobs: document.getElementById('company-remote-jobs').value.trim(),
            hiring_activity: document.getElementById('company-hiring-activity').value.trim(),
            team_structure: document.getElementById('company-team-structure').value.trim(),
            identity_tools: collectRepeater('identity-tools-list', 'tool'),
            compliance: document.getElementById('company-compliance').value.trim(),
            security_incidents: collectRepeater('incidents-list', 'incident'),
            hiring_security_notes: splitLines(document.getElementById('hiring-security-notes').value)
        };

        return {
            prospect: prospect,
            company: company,
            sdr_name: document.getElementById('sdr-name').value.trim()
        };
    }

    function splitLines(text, sep) {
        if (!text) return [];
        var delimiter = sep || '\n';
        return text.split(delimiter).map(function (s) { return s.trim(); }).filter(Boolean);
    }

    function collectRepeater(listId, type) {
        var items = [];
        var list = document.getElementById(listId);
        list.querySelectorAll('.repeater-item').forEach(function (el) {
            if (type === 'content') {
                var title = el.querySelector('.rep-title').value.trim();
                var url = el.querySelector('.rep-url').value.trim();
                var date = el.querySelector('.rep-date').value.trim();
                var ctype = el.querySelector('.rep-type').value;
                if (title) items.push({ title: title, url: url, date: date, type: ctype });
            } else if (type === 'tool') {
                var name = el.querySelector('.rep-name').value.trim();
                var desc = el.querySelector('.rep-desc').value.trim();
                if (name) items.push({ name: name, description: desc });
            } else if (type === 'incident') {
                var idate = el.querySelector('.rep-date').value.trim();
                var ititle = el.querySelector('.rep-title').value.trim();
                var details = el.querySelector('.rep-details').value.trim();
                if (ititle) items.push({ date: idate, title: ititle, details: details });
            }
        });
        return items;
    }

    // ══════════════════════════════════════════
    // JSON Import / Export
    // ══════════════════════════════════════════
    exportJsonBtn.addEventListener('click', function () {
        var data = collectFormData();
        var json = JSON.stringify(data, null, 2);
        var blob = new Blob([json], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        var safeName = (data.prospect.name || 'prospect').replace(/\s+/g, '_');
        var safeCompany = (data.company.name || 'company').replace(/\s+/g, '_');
        a.href = url;
        a.download = safeName + '_-_' + safeCompany + '_-_Research.json';
        a.click();
        URL.revokeObjectURL(url);
        showToast('JSON exported', 'success');
    });

    importJsonBtn.addEventListener('click', function () {
        var raw = document.getElementById('json-input').value.trim();
        if (!raw) { showToast('Paste JSON first', 'error'); return; }
        try {
            var data = JSON.parse(raw);
            populateFormFromData(data);
            showToast('Data imported', 'success');
        } catch (e) {
            showToast('Invalid JSON: ' + e.message, 'error');
        }
    });

    function populateFormFromData(data) {
        var p = data.prospect || {};
        var c = data.company || {};

        setVal('prospect-name', p.name);
        setVal('company-name', c.name || p.company);
        setVal('sdr-name', data.sdr_name);
        setVal('prospect-title', p.title);
        setVal('prospect-location', p.location);
        setVal('prospect-tenure', p.tenure);
        setVal('prospect-linkedin', p.linkedin_url);
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
        if (!matched) {
            atsSelect.selectedIndex = 0;
            setVal('company-ats-custom', c.ats);
        }

        // Published content
        clearRepeater('published-content-list');
        (p.published_content || []).forEach(function (item) {
            addRepeaterItem('published-content-list', 'content');
            var last = document.querySelector('#published-content-list .repeater-item:last-child');
            last.querySelector('.rep-title').value = item.title || '';
            last.querySelector('.rep-url').value = item.url || '';
            last.querySelector('.rep-date').value = item.date || '';
            last.querySelector('.rep-type').value = item.type || 'article';
        });

        // Identity tools
        clearRepeater('identity-tools-list');
        (c.identity_tools || []).forEach(function (item) {
            addRepeaterItem('identity-tools-list', 'tool');
            var last = document.querySelector('#identity-tools-list .repeater-item:last-child');
            last.querySelector('.rep-name').value = item.name || '';
            last.querySelector('.rep-desc').value = item.description || '';
        });

        // Incidents
        clearRepeater('incidents-list');
        (c.security_incidents || []).forEach(function (item) {
            addRepeaterItem('incidents-list', 'incident');
            var last = document.querySelector('#incidents-list .repeater-item:last-child');
            last.querySelector('.rep-date').value = item.date || '';
            last.querySelector('.rep-title').value = item.title || '';
            last.querySelector('.rep-details').value = item.details || '';
        });

        // Expand all sections so user sees data
        document.querySelectorAll('.form-section-body').forEach(function (body) {
            body.classList.add('open');
        });
        document.querySelectorAll('.form-section-toggle').forEach(function (btn) {
            btn.classList.add('open');
        });
    }

    function setVal(id, val) {
        var el = document.getElementById(id);
        if (el && val && val !== 'Not found') el.value = val;
    }

    function clearRepeater(listId) {
        document.getElementById(listId).innerHTML = '';
    }

    // ══════════════════════════════════════════
    // Preview Rendering
    // ══════════════════════════════════════════
    function renderPreview(data) {
        var p = data.prospect;
        var c = data.company;
        var sdr = data.sdr_name;

        var nf = function (v) { return !v || v === 'Not found'; };
        var val = function (v) { return nf(v) ? '<span class="not-found">Not found</span>' : escHtml(v); };
        var linkVal = function (text, url) {
            if (nf(url)) return val(text);
            return '<a href="' + escHtml(url) + '" target="_blank">' + escHtml(text) + '</a>';
        };

        // Header
        var headerRight = '';
        if (logoData) {
            headerRight = '<div class="doc-header-right"><img src="' + logoData.dataUrl + '" alt="Logo"><div class="doc-company-tag">' + escHtml(c.name) + '</div></div>';
        }

        var html = '';
        html += '<div class="doc-header"><div class="doc-header-left">';
        html += '<h1>Demo Brief</h1>';
        html += '<div class="doc-prospect-name">' + escHtml(p.name) + '</div>';
        html += '<div class="doc-sdr">SDR: ' + escHtml(sdr) + '</div>';
        html += '</div>' + headerRight + '</div>';

        // Info table
        var role = nf(p.title) ? '' : p.title;
        if (p.tenure && !nf(p.tenure)) role += (role ? ' - ' : '') + p.tenure;

        var ats = c.ats || '';
        var rows = [
            ['Company', linkVal(c.name, c.website)],
            ['Name', linkVal(p.name, p.linkedin_url)],
            ['Prospect Location', val(p.location)],
            ['Role', val(role || '')],
            ['Company Size', val(c.size)],
            ['Industry', val(c.industry)],
            ['ATS', val(ats)],
            ['Current Open Remote Jobs', val(c.open_remote_jobs)],
            ['Headquarters', val(c.headquarters)]
        ];

        html += '<table class="doc-info-table">';
        rows.forEach(function (r) {
            html += '<tr><td class="label-cell">' + r[0] + '</td><td>' + r[1] + '</td></tr>';
        });
        html += '</table>';

        // Section 1: About Prospect
        html += '<div class="doc-section">';
        html += '<div class="doc-section-title">About ' + escHtml(p.name) + '</div>';

        html += '<ul class="doc-bullets">';
        html += bullet('Role: ' + (nf(p.title) ? '' : p.title), nf(p.title));
        html += bullet('Team: ' + (nf(p.team) ? '' : p.team), nf(p.team));
        html += bullet('Certifications: ' + (p.certifications && p.certifications.length ? p.certifications.join(', ') : ''), !(p.certifications && p.certifications.length));
        html += '</ul>';

        // Work History
        html += '<div class="doc-sub-header">Work History:</div>';
        if (p.work_history && p.work_history.length) {
            html += '<ul class="doc-bullets">';
            p.work_history.forEach(function (w) { html += '<li>' + escHtml(w) + '</li>'; });
            html += '</ul>';
        } else {
            html += '<p class="doc-note red">Note: Work history could not be determined from public sources.</p>';
        }

        // Achievements
        html += '<div class="doc-sub-header">Notable Achievements (Identity Security & Deepfakes):</div>';
        if (p.achievements && p.achievements.length) {
            html += '<ul class="doc-bullets">';
            p.achievements.forEach(function (a) { html += '<li>' + escHtml(a) + '</li>'; });
            html += '</ul>';
        } else {
            html += '<p class="doc-note red">Note: No specific achievements in identity security found.</p>';
        }

        // Published Content
        html += '<div class="doc-sub-header">Published Content & Thought Leadership:</div>';
        if (p.published_content && p.published_content.length) {
            html += '<ul class="doc-bullets">';
            p.published_content.forEach(function (pc) {
                var prefix = pc.type === 'talk' ? '[Talk] ' : '';
                var date = pc.date ? ' (' + escHtml(pc.date) + ')' : '';
                if (pc.url) {
                    html += '<li>' + escHtml(prefix) + '<a href="' + escHtml(pc.url) + '" target="_blank">' + escHtml(pc.title) + '</a>' + date + '</li>';
                } else {
                    html += '<li>' + escHtml(prefix + pc.title) + date + '</li>';
                }
            });
            html += '</ul>';
        } else {
            html += '<p class="doc-note gray">Note: No published content found.</p>';
        }
        html += '</div>';

        // Section 2: Company Overview
        html += '<div class="doc-section">';
        html += '<div class="doc-section-title">Company Overview</div>';

        var basicsParts = [];
        basicsParts.push('Founded: ' + (nf(c.founded) ? 'Not found' : c.founded));
        if (!nf(c.ticker)) basicsParts.push('Public: ' + c.ticker);
        basicsParts.push('HQ: ' + (nf(c.headquarters) ? 'Not found' : c.headquarters));

        html += '<ul class="doc-bullets">';
        html += '<li>' + escHtml(basicsParts.join(' | ')) + '</li>';
        html += bullet('Product: ' + (nf(c.product_description) ? '' : c.product_description), nf(c.product_description));
        html += bullet('Customers: ' + (nf(c.customers) ? '' : c.customers), nf(c.customers));
        html += bullet('Culture: ' + (nf(c.culture) ? '' : c.culture), nf(c.culture));
        html += '</ul>';

        // Hiring Growth
        html += '<div class="doc-sub-header">Hiring Growth & Recruitment Infrastructure:</div>';
        html += '<ul class="doc-bullets">';
        var empText = 'Employees: ' + (nf(c.employee_count) ? 'Not found' : c.employee_count);
        if (!nf(c.growth)) empText += ' | Growth: ' + c.growth;
        html += bullet(empText, nf(c.employee_count));
        html += bullet('Hiring Activity: ' + (nf(c.hiring_activity) ? 'Not found' : c.hiring_activity), nf(c.hiring_activity));
        html += bullet('Team Structure: ' + (nf(c.team_structure) ? 'Not found' : c.team_structure), nf(c.team_structure));
        html += bullet('ATS: ' + (nf(ats) ? 'Not found' : ats), nf(ats));
        html += bullet('Open Roles: ' + (nf(c.open_remote_jobs) ? 'Not found' : c.open_remote_jobs + ' positions'), nf(c.open_remote_jobs));
        html += '</ul>';

        // Identity Tools
        html += '<div class="doc-sub-header">Identity & Access Management Tools:</div>';
        if (c.identity_tools && c.identity_tools.length) {
            html += '<ul class="doc-bullets">';
            c.identity_tools.forEach(function (t) {
                html += '<li><strong>' + escHtml(t.name) + '</strong> - ' + escHtml(t.description) + '</li>';
            });
            html += '</ul>';
        } else {
            html += '<p class="doc-note red">Note: No specific identity tools identified.</p>';
        }

        html += '<ul class="doc-bullets">';
        html += bullet('Compliance: ' + (nf(c.compliance) ? 'Not found' : c.compliance), nf(c.compliance));
        html += '</ul>';

        // Security Incidents
        html += '<div class="doc-sub-header">Recent Security Incidents:</div>';
        if (c.security_incidents && c.security_incidents.length) {
            html += '<ul class="doc-bullets">';
            c.security_incidents.forEach(function (inc) {
                html += '<li><strong>' + escHtml(inc.date) + ': ' + escHtml(inc.title) + '</strong></li>';
                if (inc.details) {
                    html += '<ul class="doc-sub-bullets"><li>' + escHtml(inc.details) + '</li></ul>';
                }
            });
            html += '</ul>';
        } else {
            html += '<ul class="doc-bullets"><li class="muted">No recent security incidents found.</li></ul>';
        }

        if (c.hiring_security_notes && c.hiring_security_notes.length) {
            html += '<ul class="doc-bullets"><li><strong>Highlights:</strong></li></ul>';
            html += '<ul class="doc-sub-bullets">';
            c.hiring_security_notes.forEach(function (n) {
                html += '<li>' + escHtml(n) + '</li>';
            });
            html += '</ul>';
        } else {
            html += '<ul class="doc-bullets"><li class="muted">No hiring/recruitment-related security incidents found.</li></ul>';
        }

        html += '</div>';

        docPage.innerHTML = html;
    }

    function bullet(text, isMissing) {
        if (isMissing) return '<li class="not-found">' + escHtml(text || 'Not found') + '</li>';
        return '<li>' + escHtml(text) + '</li>';
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
        if (!D) { showToast('docx library not loaded', 'error'); return; }

        var p = data.prospect;
        var c = data.company;
        var sdr = data.sdr_name;

        var nf = function (v) { return !v || v === 'Not found'; };

        var NAVY = '0a1628';
        var GRAY = '64748B';
        var RED = 'EF4444';
        var LINK_BLUE = '0066CC';
        var HEADER_BG = 'FFF4E6';

        function textRun(text, opts) {
            opts = opts || {};
            return new D.TextRun({
                text: text,
                font: 'Arial',
                size: opts.size || 20,
                bold: opts.bold || false,
                italics: opts.italic || false,
                color: opts.color || NAVY
            });
        }

        function hyperlink(text, url) {
            return new D.ExternalHyperlink({
                children: [new D.TextRun({
                    text: text,
                    font: 'Arial',
                    size: 20,
                    color: LINK_BLUE,
                    underline: { type: D.UnderlineType.SINGLE }
                })],
                link: url
            });
        }

        function bulletPara(text, opts) {
            opts = opts || {};
            return new D.Paragraph({
                bullet: { level: opts.level || 0 },
                spacing: { after: 40, before: 20 },
                children: [textRun(text, {
                    size: opts.size || 20,
                    bold: opts.bold || false,
                    italic: opts.italic || false,
                    color: opts.color || NAVY
                })]
            });
        }

        function bulletWithLink(before, linkText, url, after, opts) {
            opts = opts || {};
            var children = [];
            if (before) children.push(textRun(before, { size: 20 }));
            children.push(hyperlink(linkText, url));
            if (after) children.push(textRun(after, { size: 20 }));
            return new D.Paragraph({
                bullet: { level: opts.level || 0 },
                spacing: { after: 40, before: 20 },
                children: children
            });
        }

        function sectionHeading(text) {
            return new D.Paragraph({
                spacing: { before: 240, after: 80 },
                children: [textRun(text, { size: 28, bold: true })]
            });
        }

        function subHeader(text) {
            return new D.Paragraph({
                spacing: { before: 160, after: 40 },
                children: [textRun(text, { size: 22, bold: true })]
            });
        }

        function notePara(text, color) {
            return new D.Paragraph({
                indent: { left: 720 },
                spacing: { after: 40 },
                children: [textRun('Note: ' + text, { size: 20, italic: true, color: color || GRAY })]
            });
        }

        // Build header table
        var headerChildren = [
            new D.Paragraph({
                spacing: { after: 40 },
                children: [textRun('Demo Brief', { size: 44, bold: true })]
            }),
            new D.Paragraph({
                spacing: { after: 40 },
                children: [textRun(p.name, { size: 28, bold: true })]
            }),
            new D.Paragraph({
                children: [textRun('SDR: ' + sdr, { size: 20, italic: true, color: GRAY })]
            })
        ];

        var rightChildren = [];
        if (!nf(c.name)) {
            rightChildren.push(new D.Paragraph({
                alignment: D.AlignmentType.RIGHT,
                children: [textRun(c.name, { size: 16, italic: true, color: GRAY })]
            }));
        }

        var headerTable = new D.Table({
            rows: [
                new D.TableRow({
                    children: [
                        new D.TableCell({
                            width: { size: 5400, type: D.WidthType.DXA },
                            borders: noBorders(),
                            verticalAlign: D.VerticalAlign.CENTER,
                            children: headerChildren
                        }),
                        new D.TableCell({
                            width: { size: 3600, type: D.WidthType.DXA },
                            borders: noBorders(),
                            verticalAlign: D.VerticalAlign.CENTER,
                            children: rightChildren.length ? rightChildren : [new D.Paragraph({ children: [] })]
                        })
                    ]
                })
            ],
            width: { size: 100, type: D.WidthType.PERCENTAGE }
        });

        // Divider
        var divider = new D.Paragraph({
            spacing: { before: 80, after: 160 },
            border: { bottom: { style: D.BorderStyle.SINGLE, size: 6, color: 'D1D5DB', space: 1 } },
            children: []
        });

        // Info table
        var role = nf(p.title) ? '' : p.title;
        if (p.tenure && !nf(p.tenure)) role += (role ? ' - ' : '') + p.tenure;
        var ats = c.ats || '';

        var infoRows = [
            infoTableRow('Company', c.name, c.website),
            infoTableRow('Name', p.name, p.linkedin_url),
            infoTableRow('Prospect Location', p.location),
            infoTableRow('Role', role),
            infoTableRow('Company Size', c.size),
            infoTableRow('Industry', c.industry),
            infoTableRow('ATS', ats),
            infoTableRow('Current Open Remote Jobs', c.open_remote_jobs),
            infoTableRow('Headquarters', c.headquarters)
        ];

        var infoTable = new D.Table({
            rows: infoRows,
            width: { size: 100, type: D.WidthType.PERCENTAGE }
        });

        function infoTableRow(label, value, linkUrl) {
            var valueChildren = [];
            var missing = nf(value);
            if (linkUrl && !nf(linkUrl)) {
                valueChildren.push(hyperlink(value || 'Link', linkUrl));
            } else {
                valueChildren.push(textRun(missing ? 'Not found' : value, {
                    size: 20,
                    italic: missing,
                    color: missing ? RED : NAVY
                }));
            }
            return new D.TableRow({
                children: [
                    new D.TableCell({
                        width: { size: 2640, type: D.WidthType.DXA },
                        shading: { fill: HEADER_BG },
                        children: [new D.Paragraph({ children: [textRun(label, { size: 20, bold: true })] })]
                    }),
                    new D.TableCell({
                        width: { size: 6360, type: D.WidthType.DXA },
                        children: [new D.Paragraph({ children: valueChildren })]
                    })
                ]
            });
        }

        // Build content sections
        var content = [];

        // Section 1: About Prospect
        content.push(sectionHeading('About ' + p.name));

        if (nf(p.title)) {
            content.push(bulletPara('Role: Not found', { italic: true, color: RED }));
        } else {
            content.push(bulletPara('Role: ' + p.title));
        }

        if (nf(p.team)) {
            content.push(bulletPara('Team: Not found', { italic: true, color: RED }));
        } else {
            content.push(bulletPara('Team: ' + p.team));
        }

        if (p.certifications && p.certifications.length) {
            content.push(bulletPara('Certifications: ' + p.certifications.join(', ')));
        } else {
            content.push(bulletPara('Certifications: Not found', { italic: true, color: RED }));
        }

        content.push(subHeader('Work History:'));
        if (p.work_history && p.work_history.length) {
            p.work_history.forEach(function (w) { content.push(bulletPara(w)); });
        } else {
            content.push(notePara('Work history could not be determined from public sources.', RED));
        }

        content.push(subHeader('Notable Achievements (Identity Security & Deepfakes):'));
        if (p.achievements && p.achievements.length) {
            p.achievements.forEach(function (a) { content.push(bulletPara(a)); });
        } else {
            content.push(notePara('No specific achievements in identity security or deepfakes found.', RED));
        }

        content.push(subHeader('Published Content & Thought Leadership:'));
        if (p.published_content && p.published_content.length) {
            p.published_content.forEach(function (pc) {
                var prefix = pc.type === 'talk' ? '[Talk] ' : '';
                var dateStr = pc.date ? ' (' + pc.date + ')' : '';
                if (pc.url) {
                    content.push(bulletWithLink(prefix, pc.title, pc.url, dateStr));
                } else {
                    content.push(bulletPara(prefix + pc.title + dateStr));
                }
            });
        } else {
            content.push(notePara('No published content found in public sources.', GRAY));
        }

        // Section 2: Company Overview
        content.push(sectionHeading('Company Overview'));

        var basicsParts = [];
        basicsParts.push('Founded: ' + (nf(c.founded) ? 'Not found' : c.founded));
        if (!nf(c.ticker)) basicsParts.push('Public: ' + c.ticker);
        basicsParts.push('HQ: ' + (nf(c.headquarters) ? 'Not found' : c.headquarters));
        content.push(bulletPara(basicsParts.join(' | ')));

        if (nf(c.product_description)) {
            content.push(bulletPara('Product: Not found', { italic: true, color: RED }));
        } else {
            content.push(bulletPara('Product: ' + c.product_description));
        }

        if (nf(c.customers)) {
            content.push(bulletPara('Customers: Not found', { italic: true, color: RED }));
        } else {
            content.push(bulletPara('Customers: ' + c.customers));
        }

        if (nf(c.culture)) {
            content.push(bulletPara('Culture: Not found', { italic: true, color: RED }));
        } else {
            content.push(bulletPara('Culture: ' + c.culture));
        }

        // Hiring
        content.push(subHeader('Hiring Growth & Recruitment Infrastructure:'));
        var empText = 'Employees: ' + (nf(c.employee_count) ? 'Not found' : c.employee_count);
        if (!nf(c.growth)) empText += ' | Growth: ' + c.growth;
        content.push(bulletPara(empText, { color: nf(c.employee_count) ? RED : NAVY, italic: nf(c.employee_count) }));
        content.push(bulletPara('Hiring Activity: ' + (nf(c.hiring_activity) ? 'Not found' : c.hiring_activity), { color: nf(c.hiring_activity) ? RED : NAVY, italic: nf(c.hiring_activity) }));
        content.push(bulletPara('Team Structure: ' + (nf(c.team_structure) ? 'Not found' : c.team_structure), { color: nf(c.team_structure) ? RED : NAVY, italic: nf(c.team_structure) }));
        content.push(bulletPara('ATS: ' + (nf(ats) ? 'Not found' : ats), { color: nf(ats) ? RED : NAVY, italic: nf(ats) }));
        content.push(bulletPara('Open Roles: ' + (nf(c.open_remote_jobs) ? 'Not found' : c.open_remote_jobs + ' positions'), { color: nf(c.open_remote_jobs) ? RED : NAVY, italic: nf(c.open_remote_jobs) }));

        // Identity tools
        content.push(subHeader('Identity & Access Management Tools:'));
        if (c.identity_tools && c.identity_tools.length) {
            c.identity_tools.forEach(function (t) {
                content.push(bulletPara(t.name + ' - ' + t.description));
            });
        } else {
            content.push(notePara('No specific identity tools identified.', RED));
        }
        content.push(bulletPara('Compliance: ' + (nf(c.compliance) ? 'Not found' : c.compliance), { color: nf(c.compliance) ? RED : NAVY, italic: nf(c.compliance) }));

        // Security incidents
        content.push(subHeader('Recent Security Incidents:'));
        if (c.security_incidents && c.security_incidents.length) {
            c.security_incidents.forEach(function (inc) {
                content.push(bulletPara(inc.date + ': ' + inc.title, { bold: true }));
                if (inc.details) {
                    content.push(bulletPara(inc.details, { level: 1 }));
                }
            });
        } else {
            content.push(bulletPara('No recent security incidents found.', { italic: true, color: GRAY }));
        }

        if (c.hiring_security_notes && c.hiring_security_notes.length) {
            content.push(bulletPara('Highlights:', { bold: true }));
            c.hiring_security_notes.forEach(function (n) {
                content.push(bulletPara(n, { level: 1 }));
            });
        } else {
            content.push(bulletPara('No hiring/recruitment-related security incidents found.', { italic: true, color: GRAY }));
        }

        // Assemble document
        var doc = new D.Document({
            sections: [{
                properties: {
                    page: {
                        margin: { top: 720, bottom: 720, left: 1080, right: 1080 },
                        size: { orientation: D.PageOrientation.PORTRAIT }
                    }
                },
                children: [headerTable, divider, infoTable, new D.Paragraph({ spacing: { after: 200 }, children: [] })].concat(content)
            }]
        });

        return doc;
    }

    function noBorders() {
        var none = { style: 'none', size: 0 };
        return { top: none, bottom: none, left: none, right: none };
    }

    // ══════════════════════════════════════════
    // Form Submit / Generate
    // ══════════════════════════════════════════
    form.addEventListener('submit', function (e) {
        e.preventDefault();

        var prospectName = document.getElementById('prospect-name').value.trim();
        var companyName = document.getElementById('company-name').value.trim();
        var sdrName = document.getElementById('sdr-name').value.trim();

        if (!prospectName || !companyName || !sdrName) {
            showToast('Please fill in all required fields.', 'error');
            return;
        }

        var data = collectFormData();

        // Show loading
        previewEmpty.style.display = 'none';
        previewDoc.style.display = 'none';
        previewLoading.style.display = '';

        // Small delay for UI feedback
        setTimeout(function () {
            renderPreview(data);
            previewLoading.style.display = 'none';
            previewDoc.style.display = '';
            previewActions.style.display = '';

            // Store data for download
            window._lastBriefData = data;
            showToast('Brief generated', 'success');
        }, 400);
    });

    // Download .docx
    downloadDocxBtn.addEventListener('click', function () {
        var data = window._lastBriefData;
        if (!data) { showToast('Generate a brief first', 'error'); return; }

        var D = window.docx;
        if (!D) { showToast('docx library not loaded', 'error'); return; }

        var doc = generateDocx(data);
        D.Packer.toBlob(doc).then(function (blob) {
            var safeName = data.prospect.name.replace(/\s+/g, '_');
            var safeCompany = data.company.name.replace(/\s+/g, '_');
            var fileName = safeName + '_-_' + safeCompany + '_-_Demo_Brief.docx';
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.click();
            URL.revokeObjectURL(url);
            showToast('Downloaded ' + fileName, 'success');
        }).catch(function (err) {
            showToast('DOCX generation failed: ' + err.message, 'error');
        });
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

})();
