// ═══════════════════════════════════════════════════════════
//  messify.js — complete frontend connector
//  Place <script src="messify.js"></script> before </body>
//  in feedback.html, reports.html, admin.html
// ═══════════════════════════════════════════════════════════
(function () {
  'use strict';

  // ── Read logged-in user from localStorage ──────────────
  var user = null;
  try { user = JSON.parse(localStorage.getItem('messify_user')); } catch (e) {}
  var userEmail = user ? (user.email || '') : '';
  var userName  = user ? (user.name  || '') : '';
  var userRole  = user ? (user.role  || '') : '';

  // First name for personalised messages
  var userFirstName = userName ? userName.split(' ')[0] : 'there';

  function adminHeaders() {
    return { 'Content-Type': 'application/json', 'x-user-email': userEmail };
  }

  // ── Colour helper for heatmap ───────────────────────────
  function scColor(v) {
    if (v >= 4.5) return 'rgba(34,197,94,.7)';
    if (v >= 3.8) return 'rgba(34,197,94,.38)';
    if (v >= 3.0) return 'rgba(234,179,8,.42)';
    if (v >= 2.5) return 'rgba(249,115,22,.45)';
    return 'rgba(239,68,68,.55)';
  }

  function escHtml(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function showToast(msg, type) {
    var t = document.getElementById('toast');
    if (!t) return;
    var icon  = document.getElementById('toast-icon');
    var msgEl = document.getElementById('toast-msg');
    if (icon)  icon.textContent  = type === 'success' ? '✅' : '⚠️';
    if (msgEl) msgEl.textContent = msg;
    t.className = 'toast ' + (type || 'error');
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 3500);
  }

  // ═══════════════════════════════════════════════════════
  //  FEEDBACK PAGE
  //  Detect by presence of submit button
  // ═══════════════════════════════════════════════════════
  var submitBtn = document.querySelector('[onclick*="submitFeedback"]');
  if (submitBtn) {

    // 1. Set real current week date in banner
    fetch('/api/week/current')
      .then(function (r) { return r.json(); })
      .then(function (wi) {
        if (!wi.success) return;
        // Update week banner title
        var wbTitle = document.getElementById('wb-title') || document.querySelector('.wb-title');
        if (wbTitle) wbTitle.textContent = wi.label + ' — ' + wi.range;
        // Update success overlay with real name and week
        var successName = document.getElementById('success-name');
        var successWeek = document.getElementById('success-week');
        if (successName) successName.textContent = userFirstName;
        if (successWeek) successWeek.textContent = wi.label;
      })
      .catch(function () {});

    // 2. Check if already submitted this week → lock or unlock
    fetch('/api/feedback/status?email=' + encodeURIComponent(userEmail))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.submitted) {
          // Not yet submitted — show green badge
          var badge = document.querySelector('.wb-badge');
          if (badge) {
            badge.textContent = '✓ Not yet submitted';
            badge.style.cssText = 'background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.25);color:#4ade80;font-size:12px;font-weight:600;padding:6px 14px;border-radius:100px';
          }
        } else {
          // Already submitted — lock form immediately
          lockFeedbackForm();
          showToast('You have already submitted this week. You can view your ratings but cannot change them.', 'error');
        }
      })
      .catch(function () {});

    // 3. Override submitFeedback → send to backend
    window.submitFeedback = function () {
      if (submitBtn.disabled) {
        showToast('You have already submitted this week. Ratings cannot be changed.', 'error');
        return;
      }
      var ratings = window.ratings || {};
      var n = Object.values(ratings).filter(function (v) { return v > 0; }).length;
      if (n < 14) {
        showToast('Please rate at least 14 meals before submitting.', 'error');
        return;
      }
      var liked  = document.getElementById('liked')  ? document.getElementById('liked').value  : '';
      var issues = document.getElementById('issues') ? document.getElementById('issues').value : '';

      // Disable and show loading
      submitBtn.disabled = true;
      submitBtn.textContent = '⏳ Submitting...';

      fetch('/api/feedback/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: userEmail, name: userName,
          ratings: ratings, liked: liked, issues: issues
        })
      })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.success) {
          // Show success overlay with real name already set above
          var overlay = document.getElementById('successOverlay');
          if (overlay) overlay.classList.add('show');
          lockFeedbackForm();
        } else {
          showToast(data.message || 'Submission failed. Please try again.', 'error');
          submitBtn.disabled = false;
          submitBtn.textContent = 'Submit Feedback →';
        }
      })
      .catch(function () {
        showToast('Server error. Make sure your server is running (node server.js).', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Feedback →';
      });
    };
  }

  // Lock all star inputs and submit button after submission
  function lockFeedbackForm() {
    var btn = document.querySelector('[onclick*="submitFeedback"]');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '✅ Submitted this week';
      btn.style.opacity    = '0.65';
      btn.style.cursor     = 'not-allowed';
      btn.style.boxShadow  = 'none';
      btn.style.background = 'var(--surface2)';
      btn.style.color      = '#4ade80';
    }
    var badge = document.querySelector('.wb-badge');
    if (badge) {
      badge.textContent = '✅ Submitted this week';
      badge.style.cssText = 'background:rgba(249,115,22,.1);border:1px solid rgba(249,115,22,.3);color:#f97316;font-size:12px;font-weight:600;padding:6px 14px;border-radius:100px';
    }
    var progText = document.getElementById('prog-text');
    if (progText) progText.textContent = 'Submitted — ratings are locked';
    // Disable all stars — read-only view
    document.querySelectorAll('.star').forEach(function (s) {
      s.style.cursor       = 'default';
      s.style.pointerEvents = 'none';
    });
    // Disable textareas
    var liked  = document.getElementById('liked');
    var issues = document.getElementById('issues');
    if (liked)  { liked.disabled  = true; liked.style.opacity  = '0.6'; }
    if (issues) { issues.disabled = true; issues.style.opacity = '0.6'; }
  }

  // ═══════════════════════════════════════════════════════
  //  REPORTS PAGE
  //  Detect by presence of heatTable
  // ═══════════════════════════════════════════════════════
  if (document.getElementById('heatTable')) {

    // Load current week analytics and update everything
    fetch('/api/analytics/current')
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res.success || res.empty) return; // keep demo data if no submissions yet
        var d = res.data;
        var DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
        var MK   = ['b','l','s','d'];
        var MH   = { b:'🌅 Breakfast', l:'🍱 Lunch', s:'🫖 Snacks', d:'🌙 Dinner' };
        var mealNames = { breakfast:'Breakfast', lunch:'Lunch', snacks:'Snacks', dinner:'Dinner' };

        // ── Summary strip ──
        var vals = document.querySelectorAll('.ss-val');
        var lbls = document.querySelectorAll('.ss-label');
        if (vals.length >= 4) {
          vals[0].textContent = d.overallAvg;
          vals[1].textContent = d.total.toLocaleString();
          vals[2].textContent = d.mealAvg[d.bestMeal];
          vals[3].textContent = d.mealAvg[d.worstMeal];
          if (lbls[2]) lbls[2].textContent = 'Best — ' + mealNames[d.bestMeal];
          if (lbls[3]) lbls[3].textContent = 'Worst — ' + mealNames[d.worstMeal];
        }

        // ── Heatmap ──
        var htEl = document.getElementById('heatTable');
        if (htEl) {
          htEl.innerHTML = '';
          var thead = htEl.createTHead();
          var hr = thead.insertRow();
          var th0 = document.createElement('th');
          hr.appendChild(th0);
          MK.forEach(function (m) {
            var t = document.createElement('th');
            t.textContent = MH[m];
            hr.appendChild(t);
          });
          var tbody = htEl.createTBody();
          DAYS.forEach(function (day) {
            var tr  = tbody.insertRow();
            var td0 = tr.insertCell();
            td0.textContent = day;
            MK.forEach(function (m) {
              var td = tr.insertCell();
              var v  = d.heatmap[day] ? (d.heatmap[day][m] || 0) : 0;
              td.style.background = scColor(v);
              td.innerHTML = '<span class="hval">' + v + '</span>';
            });
          });
        }

        // ── Bar chart ──
        if (window._messifyBarChart) {
          window._messifyBarChart.data.datasets[0].data = [
            d.mealAvg.breakfast, d.mealAvg.lunch,
            d.mealAvg.snacks,    d.mealAvg.dinner
          ];
          window._messifyBarChart.update();
        }

        // ── Anonymous comments (no names) ──
        var commCard = document.querySelector('.comments-card');
        if (commCard && d.comments && d.comments.length > 0) {
          commCard.querySelectorAll('.comment-item').forEach(function (i) { i.remove(); });
          d.comments.slice(0, 8).forEach(function (c, idx) {
            var letter = String.fromCharCode(65 + idx);
            if (c.liked) commCard.innerHTML += buildComment(letter, c.liked, 'Positive', 'pos');
            if (c.issue) commCard.innerHTML += buildComment(letter, c.issue, 'Negative', 'neg');
          });
        }
      })
      .catch(function (e) { console.log('Reports analytics error:', e); });

    // ── Update academic year in header ──
    fetch('/api/week/current')
      .then(function(r){ return r.json(); })
      .then(function(wi){
        if(!wi.success) return;
        var acadEl = document.getElementById('acad-year');
        if(acadEl) acadEl.textContent = wi.acadYear;
      }).catch(function(){});

    // ── Trend chart — all weeks ──
    fetch('/api/analytics/all-weeks')
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res.success || !res.data.length) return;
        if (window._messifyTrendChart) {
          window._messifyTrendChart.data.labels = res.data.map(function (w) { return w.weekLabel; });
          window._messifyTrendChart.data.datasets[0].data = res.data.map(function (w) { return w.overallAvg; });
          window._messifyTrendChart.update();
        }
      })
      .catch(function () {});
  }

  // ═══════════════════════════════════════════════════════
  //  ADMIN PAGE
  //  Detect by presence of mealScores div + admin role
  // ═══════════════════════════════════════════════════════
  if (document.getElementById('mealScores') && userRole === 'admin') {

    // Current week analytics → KPIs, doughnut, meal scores
    fetch('/api/analytics/current')
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res.success || res.empty) return;
        var d = res.data;
        var mealNames = { breakfast:'Breakfast', lunch:'Lunch', snacks:'Snacks', dinner:'Dinner' };

        // KPI cards
        var kpiVals   = document.querySelectorAll('.kpi-val');
        var kpiLabels = document.querySelectorAll('.kpi-label');
        if (kpiVals.length >= 4) {
          kpiVals[0].textContent = d.overallAvg;
          kpiVals[1].textContent = d.total.toLocaleString();
          // kpiVals[2] = complaints — filled by complaints fetch below
          kpiVals[3].textContent = d.mealAvg[d.worstMeal];
          if (kpiLabels[3]) kpiLabels[3].textContent = 'Worst — ' + mealNames[d.worstMeal];
        }

        // Doughnut chart
        if (window._messifyDoughnutChart) {
          window._messifyDoughnutChart.data.datasets[0].data = [
            d.mealAvg.breakfast, d.mealAvg.lunch,
            d.mealAvg.snacks,    d.mealAvg.dinner
          ];
          window._messifyDoughnutChart.update();
        }

        // Meal scores list
        var ms = document.getElementById('mealScores');
        if (ms) {
          ms.innerHTML = '';
          var sortedMeals = ['breakfast','lunch','snacks','dinner']
            .sort(function (a, b) { return d.mealAvg[b] - d.mealAvg[a]; });
          sortedMeals.forEach(function (m) {
            var score = d.mealAvg[m];
            var bc  = score >= 4 ? '#22c55e' : score >= 3 ? '#eab308' : '#ef4444';
            var cls = score >= 4 ? 'score-hi' : score >= 3 ? 'score-md' : 'score-lo';
            var tag = score >= 4 ? 'Performing well' : score >= 3 ? 'Needs improvement' : 'Critical — review needed';
            ms.innerHTML += '<div class="score-item">'
              + '<div class="si-info"><div class="si-name">' + mealNames[m] + '</div>'
              + '<div class="si-sub">' + tag + '</div></div>'
              + '<div class="si-bar-bg"><div class="si-bar" style="width:' + (score / 5 * 100) + '%;background:' + bc + '"></div></div>'
              + '<div class="si-score ' + cls + '">' + score + '</div></div>';
          });
        }
      })
      .catch(function () {});

    // All weeks → line chart
    fetch('/api/analytics/all-weeks')
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res.success || !res.data.length) return;
        if (window._messifyAdminLineChart) {
          var weeks = res.data;
          window._messifyAdminLineChart.data.labels = weeks.map(function (w) { return w.weekLabel; });
          window._messifyAdminLineChart.data.datasets[0].data = weeks.map(function (w) { return w.mealAvg.breakfast; });
          window._messifyAdminLineChart.data.datasets[1].data = weeks.map(function (w) { return w.mealAvg.lunch; });
          window._messifyAdminLineChart.data.datasets[2].data = weeks.map(function (w) { return w.mealAvg.snacks; });
          window._messifyAdminLineChart.data.datasets[3].data = weeks.map(function (w) { return w.mealAvg.dinner; });
          window._messifyAdminLineChart.update();
        }
      })
      .catch(function () {});

    // Complaints count + list
    fetch('/api/admin/complaints', { headers: adminHeaders() })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res.success) return;

        // Update KPI complaint count
        var kpiVals = document.querySelectorAll('.kpi-val');
        if (kpiVals[2]) kpiVals[2].textContent = res.count;

        // Replace static complaint list with real data
        if (res.data.length > 0) {
          var tblCards = document.querySelectorAll('.tbl-card');
          var complaintCard = tblCards[0];
          if (complaintCard) {
            complaintCard.querySelectorAll('.complaint-item').forEach(function (i) { i.remove(); });
            res.data.slice(0, 5).forEach(function (c) {
              var dt   = new Date(c.submittedAt).toLocaleDateString('en-IN', { weekday:'short', day:'2-digit', month:'short' });
              var txt  = c.text.toLowerCase();
              var icon = txt.indexOf('oil') > -1 ? '🦠'
                : (txt.indexOf('cook') > -1 || txt.indexOf('dal') > -1) ? '🍛'
                : (txt.indexOf('salt') > -1 || txt.indexOf('hard') > -1) ? '🧂' : '⚠️';
              complaintCard.innerHTML += '<div class="complaint-item">'
                + '<div class="ci-ic" style="background:rgba(239,68,68,0.1)">' + icon + '</div>'
                + '<div><div class="ci-text">' + escHtml(c.text) + '</div>'
                + '<div class="ci-meta">' + dt + '</div></div></div>';
            });
          }
        }
      })
      .catch(function () {});

    // ── Export PDF button ──
    // Find the Export PDF button specifically (not just any btn-primary)
    var allBtns = document.querySelectorAll('.btn-primary, button');
    var exportBtn = null;
    allBtns.forEach(function (btn) {
      if (btn.textContent.indexOf('Export') > -1 || btn.textContent.indexOf('PDF') > -1) {
        exportBtn = btn;
      }
    });
    if (exportBtn) {
      exportBtn.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        var origText = exportBtn.textContent;
        exportBtn.textContent = '⏳ Generating...';
        exportBtn.disabled = true;

        fetch('/api/admin/export-pdf', { headers: adminHeaders() })
          .then(function (r) {
            if (!r.ok) throw new Error('Server returned ' + r.status);
            return r.text();
          })
          .then(function (html) {
            exportBtn.textContent = origText;
            exportBtn.disabled = false;
            var win = window.open('', '_blank');
            if (!win) {
              showToast('Popup blocked! Allow popups for localhost:3000 and try again.', 'error');
              return;
            }
            win.document.open();
            win.document.write(html);
            win.document.close();
          })
          .catch(function (err) {
            exportBtn.textContent = origText;
            exportBtn.disabled = false;
            showToast('PDF error: ' + err.message + '. Make sure server is running.', 'error');
          });
      };
    }
  }

  // ── Anonymous comment HTML builder (no names shown) ────
  function buildComment(letter, text, sentiment, cls) {
    return '<div class="comment-item">'
      + '<div class="ca">' + letter + '</div>'
      + '<div><div class="c-body">' + escHtml(text) + '</div>'
      + '<div class="c-meta"><span class="sent ' + cls + '">' + sentiment + '</span></div>'
      + '</div></div>';
  }

})();
