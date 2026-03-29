// ═══════════════════════════════════════════════════════════
//  messify.js — complete frontend connector + mobile system
//  Place <script src="messify.js"></script> before </body>
//  in feedback.html, reports.html, admin.html, complaints.html
// ═══════════════════════════════════════════════════════════
(function () {
  "use strict";

  // ── INJECT GLOBAL MOBILE CSS ───────────────────────────
  (function injectMobileStyles() {
    var style = document.createElement("style");
    style.id = "messify-mobile-styles";
    style.textContent = `
      /* ── SAFE AREA + BASE ── */
      :root {
        --nav-h: 62px;
        --sidebar-w: 260px;
        --safe-bottom: env(safe-area-inset-bottom, 0px);
        --safe-left:   env(safe-area-inset-left,   0px);
        --safe-right:  env(safe-area-inset-right,  0px);
      }

      /* ── TOPNAV MOBILE ── */
      @media (max-width: 1000px) {
        .topnav {
          padding: 0 16px;
          height: var(--nav-h);
          gap: 10px;
        }
        .nav-logo { gap: 8px; }
        .logo-text { font-size: 15px; }
        .nav-links { display: none !important; }
        .nav-email { display: none !important; }
        .nav-right { flex: 0; }

        /* Hamburger — always visible, correct size */
        .menu-btn {
          display: flex !important;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          min-width: 44px;
          border-radius: 10px;
          flex-shrink: 0;
          -webkit-tap-highlight-color: transparent;
        }
        .menu-btn svg { width: 20px; height: 20px; }
      }

      /* ── SIDEBAR DRAWER ── */
      @media (max-width: 1000px) {
        /* ✅ FIX: z-index auto prevents the dark overlay bug */
        .layout { 
          grid-template-columns: 1fr !important; 
          z-index: auto !important; 
          position: static !important; 
        }

        .sidebar {
          position: fixed !important;
          top: var(--nav-h) !important;
          left: 0 !important;
          bottom: 0 !important;
          width: var(--sidebar-w) !important;
          max-width: 80vw !important;
          height: auto !important;
          z-index: 300 !important;
          transform: translateX(-110%) !important;
          transition: transform 0.3s cubic-bezier(0.4,0,0.2,1) !important;
          overflow-y: auto !important;
          -webkit-overflow-scrolling: touch;
          border-right: 1px solid var(--border2) !important;
          box-shadow: 6px 0 40px rgba(0,0,0,0.55) !important;
          background: rgba(11,15,26,0.98) !important;
          backdrop-filter: blur(24px);
          padding: 20px 14px 40px !important;
          padding-bottom: calc(40px + var(--safe-bottom)) !important;
        }
        .sidebar.open {
          transform: translateX(0) !important;
        }

        /* Overlay */
        .sidebar-overlay {
          position: fixed !important;
          inset: 0 !important;
          top: var(--nav-h) !important;
          background: rgba(0,0,0,0.6) !important;
          z-index: 290 !important;
          backdrop-filter: blur(2px);
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.3s ease;
        }
        .sidebar-overlay.show {
          opacity: 1 !important;
          pointer-events: auto !important;
          display: block !important;
        }

        /* Sidebar items — bigger tap targets on mobile */
        .sb-item {
          padding: 13px 14px !important;
          font-size: 14px !important;
          border-radius: 12px !important;
          margin-bottom: 4px !important;
          min-height: 48px;
          -webkit-tap-highlight-color: transparent;
        }
        .sb-section { margin: 20px 0 8px !important; font-size: 10px !important; }

        /* Main content — full width */
        .main { padding: 20px 16px 80px !important; }
      }

      @media (min-width: 1001px) {
        .sidebar-overlay { display: none !important; }
        .menu-btn { display: none !important; }
        .sidebar {
          transform: none !important;
          position: sticky !important;
        }
      }

      /* ── TOPNAV ADMIN PILL ── */
      @media (max-width: 640px) {
        .admin-pill { display: none !important; }
        .nav-avatar { width: 34px !important; height: 34px !important; }
      }

      /* ── FEEDBACK PAGE ── */
      @media (max-width: 860px) {
        .week-banner {
          flex-direction: column !important;
          gap: 12px !important;
          align-items: flex-start !important;
          padding: 16px 18px !important;
        }
        .wb-badge { align-self: flex-start !important; }
        .submit-row {
          flex-direction: column !important;
          align-items: stretch !important;
          gap: 14px !important;
        }
        .btn-primary { width: 100% !important; padding: 15px !important; font-size: 15px !important; }
        .fb-grid { grid-template-columns: 1fr !important; padding: 16px !important; }
      }

      /* Rating table — horizontal scroll on small screens */
      @media (max-width: 640px) {
        .card.grid-card { overflow: hidden; }
        .card.grid-card > .card-header { padding: 14px 16px !important; }
        .rating-table-wrap {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          padding-bottom: 8px;
        }
        .rating-table { min-width: 480px; font-size: 12px; }
        .rating-table th:first-child { padding-left: 12px !important; }
        .rating-table td:first-child { padding-left: 12px !important; font-size: 12px !important; }
        .star { font-size: 17px !important; }
        .meal-head .me { font-size: 15px !important; }
        .veg-toggle span { font-size: 8px !important; padding: 2px 4px !important; }
      }

      /* ── REPORTS PAGE ── */
      @media (max-width: 860px) {
        .ph {
          flex-direction: column !important;
          align-items: flex-start !important;
          gap: 16px !important;
        }
        .view-toggle { width: 100% !important; }
        .vt-btn { flex: 1 !important; text-align: center !important; }

        .summary-strip { grid-template-columns: repeat(2,1fr) !important; gap: 10px !important; }
        .charts-row { grid-template-columns: 1fr !important; }
        .heat-card .card-header { flex-direction: column !important; align-items: flex-start !important; gap: 8px !important; }
      }
      @media (max-width: 480px) {
        .summary-strip { grid-template-columns: 1fr 1fr !important; }
        .ss { padding: 12px 14px !important; }
        .ss-val { font-size: 18px !important; }
        .heat-table-wrap { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
        .ph-title { font-size: 22px !important; }
        .hist-comments { grid-template-columns: 1fr !important; }
        .hist-meal-pills { gap: 6px !important; }
        .hmp { font-size: 11px !important; padding: 4px 10px !important; }
      }

      /* ── ADMIN PAGE ── */
      @media (max-width: 860px) {
        .kpi-grid { grid-template-columns: repeat(2,1fr) !important; gap: 10px !important; }
        .admin-charts-row { grid-template-columns: 1fr !important; }
        .adm-ph { flex-direction: column !important; gap: 12px !important; }
        .adm-ph .adm-actions { flex-wrap: wrap !important; }
      }
      @media (max-width: 480px) {
        .kpi-grid { grid-template-columns: 1fr 1fr !important; }
        .kpi-card { padding: 14px 16px !important; }
        .adm-tabs { overflow-x: auto !important; -webkit-overflow-scrolling: touch !important; white-space: nowrap !important; }
      }

      /* ── COMPLAINTS PAGE ── */
      @media (max-width: 640px) {
        .comp-form-grid { grid-template-columns: 1fr !important; }
        .comp-list-item { flex-direction: column !important; gap: 8px !important; }
      }

      /* ── INDEX / LOGIN PAGE ── */
      @media (max-width: 860px) {
        .left-panel { display: none !important; }
        .right-panel { padding: 32px 20px !important; }
        .card { padding: 32px 24px !important; border-radius: 20px !important; }
      }
      @media (max-width: 400px) {
        .right-panel { padding: 20px 12px !important; }
        .card { padding: 28px 18px !important; }
      }

      /* ── UNIVERSAL IMPROVEMENTS ── */
      /* Prevent text size inflation on iOS */
      body { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }

      /* Larger tap targets for all buttons */
      @media (max-width: 1000px) {
        button, a, [role="button"] { touch-action: manipulation; }
        input, textarea, select {
          font-size: 16px !important; /* prevents iOS zoom on focus */
          border-radius: 12px !important;
        }
        .btn-primary, .btn-google {
          padding: 15px 20px !important;
          font-size: 15px !important;
        }
      }

      /* Smooth scroll everywhere */
      * { scroll-behavior: smooth; }

      /* Bottom padding for content so it doesn't hide behind phone chrome */
      @media (max-width: 1000px) {
        .main { padding-bottom: calc(80px + var(--safe-bottom)) !important; }
      }

      /* ── SWIPE HINT ANIMATION on first open ── */
      @keyframes sidebarBounce {
        0%   { transform: translateX(0); }
        30%  { transform: translateX(12px); }
        60%  { transform: translateX(-4px); }
        100% { transform: translateX(0); }
      }
    `;
    document.head.appendChild(style);
  })();

  // ── Read logged-in user from localStorage ──────────────
  var user = null;
  try {
    user = JSON.parse(localStorage.getItem("messify_user"));
  } catch (e) {}
  var userEmail = user ? user.email || "" : "";
  var userName = user ? user.name || "" : "";
  var userRole = user ? user.role || "" : "";

  var userFirstName = userName ? userName.split(" ")[0] : "there";

  function adminHeaders() {
    return { "Content-Type": "application/json", "x-user-email": userEmail };
  }

  function scColor(v) {
    if (v >= 4.5) return "rgba(34,197,94,.7)";
    if (v >= 3.8) return "rgba(34,197,94,.38)";
    if (v >= 3.0) return "rgba(234,179,8,.42)";
    if (v >= 2.5) return "rgba(249,115,22,.45)";
    return "rgba(239,68,68,.55)";
  }

  function escHtml(s) {
    return (s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function showToast(msg, type) {
    var t = document.getElementById("toast");
    if (!t) return;
    var icon = document.getElementById("toast-icon");
    var msgEl = document.getElementById("toast-msg");
    if (icon) icon.textContent = type === "success" ? "✅" : "⚠️";
    if (msgEl) msgEl.textContent = msg;
    t.className = "toast " + (type || "error");
    t.classList.add("show");
    setTimeout(function () {
      t.classList.remove("show");
    }, 3500);
  }

  // ── GLOBAL WEEK DATA FETCH ──
  fetch("/api/week/current")
    .then(function (r) {
      return r.json();
    })
    .then(function (wi) {
      if (!wi.success) return;

      var wbTitle =
        document.getElementById("wb-title") ||
        document.querySelector(".wb-title");
      if (wbTitle) wbTitle.textContent = wi.label + " — " + wi.range;
      var successName = document.getElementById("success-name");
      if (successName) successName.textContent = userFirstName;
      var successWeek = document.getElementById("success-week");
      if (successWeek) successWeek.textContent = wi.label;

      var acadEl = document.getElementById("acad-year");
      if (acadEl) acadEl.textContent = wi.acadYear;

      var adminPhSub = document.getElementById("admin-ph-sub");
      if (adminPhSub)
        adminPhSub.textContent =
          wi.label + " · " + wi.range + " · NIST University";

      var currWeekOpt = document.getElementById("currWeek");
      if (currWeekOpt) currWeekOpt.textContent = wi.label;
    })
    .catch(function () {});

  var p = window.location.pathname;
  var isDash = p.includes("admin.html") || p.endsWith("/");
  var isHist =
    p.includes("reports.html") &&
    window.location.search.includes("view=history");
  var isRep = p.includes("reports.html") && !isHist;
  var isComp = p.includes("complaints.html");
  var isFeed = p.includes("feedback.html");

  if (userRole === "admin") {
    // ── ADMIN VIEW ──
    var navLinks =
      document.getElementById("dynamic-nav-links") ||
      document.querySelector(".nav-links");
    if (navLinks) {
      navLinks.innerHTML = `
        <a href="reports.html" class="nav-link ${isRep ? "active" : ""}">Reports</a>
        <a href="admin.html" class="nav-link ${isDash || isComp ? "active" : ""}">Admin</a>
      `;
    }
    var navRight = document.getElementById("nav-right");
    if (navRight && !document.querySelector(".admin-pill")) {
      navRight.insertAdjacentHTML(
        "beforeend",
        '<span class="admin-pill">⚙️ Admin Panel</span>',
      );
    }
    var sidebar = document.getElementById("sidebar");
    if (sidebar) {
      sidebar.innerHTML = `
        <div class="sb-section">Menu</div>
        <a class="sb-item ${isDash ? "active" : ""}" href="admin.html"><span class="ic">🎛️</span> Dashboard</a>
        <a class="sb-item ${isRep ? "active" : ""}" href="reports.html"><span class="ic">📊</span> Reports</a>
        <a class="sb-item" href="#"><span class="ic">🧾</span> Mess Bill</a>
        <a class="sb-item ${isComp ? "active" : ""}" href="complaints.html"><span class="ic">💬</span> Complaints</a>
        <div class="sb-section">Account</div>
        <a class="sb-item" href="#" onclick="logoutUser(event)"><span class="ic">🚪</span> Logout</a>
      `;
    }
  } else if (userRole === "student" || userRole === "") {
    // ── UPDATED STUDENT VIEW: REMOVED TRENDS AND SETTINGS ──
    var studentNavLinks =
      document.getElementById("dynamic-nav-links") ||
      document.querySelector(".nav-links");
    if (studentNavLinks) {
      studentNavLinks.innerHTML = `
        <a href="feedback.html" class="nav-link ${isFeed ? "active" : ""}">Feedback</a>
        <a href="reports.html" class="nav-link ${isRep ? "active" : ""}">Reports</a>
      `;
    }
    var studentSidebar = document.getElementById("sidebar");
    if (studentSidebar) {
      studentSidebar.innerHTML = `
        <div class="sb-section">Student</div>
        <a class="sb-item ${isFeed ? "active" : ""}" href="feedback.html">
          <span class="ic">✍️</span> Submit Feedback
        </a>
        <a class="sb-item ${isRep && !isHist ? "active" : ""}" href="reports.html">
          <span class="ic">📊</span> Weekly Report
        </a>
        <a class="sb-item ${isHist ? "active" : ""}" href="reports.html?view=history">
          <span class="ic">📋</span> My History
        </a>
        <div class="sb-section">Account</div>
        <a class="sb-item" href="#" onclick="logoutUser(event)">
          <span class="ic">🚪</span> Logout
        </a>
      `;
    }
  }

  // ═══════════════════════════════════════════════════════
  //  FEEDBACK PAGE LOGIC
  // ═══════════════════════════════════════════════════════
  var submitBtn = document.querySelector('[onclick*="submitFeedback"]');
  if (submitBtn) {
    fetch("/api/feedback/status?email=" + encodeURIComponent(userEmail))
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (!data.submitted) {
          var badge = document.querySelector(".wb-badge");
          if (badge) {
            badge.textContent = "✓ Not yet submitted";
            badge.style.cssText =
              "background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.25);color:#4ade80;font-size:12px;font-weight:600;padding:6px 14px;border-radius:100px";
          }
        } else {
          if (data.savedData && data.savedData.ratings) {
            let ratedCountNum = 0;
            data.savedData.ratings.forEach(function (r) {
              var key = r.day + "_" + r.meal;
              if (window.ratings) window.ratings[key] = r.rating;
              if (window.foodTypes)
                window.foodTypes[key] = r.food_type || "veg";

              var stars = document.querySelectorAll(
                '[data-key="' + key + '"].star',
              );
              stars.forEach(function (s, i) {
                if (i < r.rating) {
                  s.classList.add("on");
                  s.style.color = "var(--accent)";
                  s.style.filter =
                    "drop-shadow(0 0 4px rgba(249, 115, 22, 0.5))";
                } else {
                  s.classList.remove("on");
                  s.style.color = "";
                  s.style.filter = "";
                }
              });

              var tgs = document.querySelectorAll(
                '.veg-toggle[data-key="' + key + '"] span',
              );
              tgs.forEach(function (t) {
                t.classList.remove("active");
                if (t.dataset.type === (r.food_type || "veg"))
                  t.classList.add("active");
              });

              if (r.rating > 0) ratedCountNum++;
            });

            var progFill = document.getElementById("prog-fill");
            var progText = document.getElementById("prog-text");
            var rCount = document.getElementById("rated-count");
            if (progFill)
              progFill.style.width =
                Math.round((ratedCountNum / 28) * 100) + "%";
            if (progText)
              progText.textContent =
                "Submitted — " + ratedCountNum + " / 28 meals rated";
            if (rCount) rCount.textContent = ratedCountNum;

            var liked = document.getElementById("liked");
            var issues = document.getElementById("issues");
            if (liked) liked.value = data.savedData.liked || "";
            if (issues) issues.value = data.savedData.issues || "";
          }

          lockFeedbackForm();
          showToast("Viewing your submitted ratings for this week.", "success");
        }
      })
      .catch(function () {});

    window.submitFeedback = function () {
      if (submitBtn.disabled) return;
      var ratings = window.ratings || {};
      var foodTypes = window.foodTypes || {};
      var n = Object.values(ratings).filter(function (v) {
        return v > 0;
      }).length;
      if (n < 14) {
        showToast("Please rate at least 14 meals before submitting.", "error");
        return;
      }
      var liked = document.getElementById("liked")
        ? document.getElementById("liked").value
        : "";
      var issues = document.getElementById("issues")
        ? document.getElementById("issues").value
        : "";

      submitBtn.disabled = true;
      submitBtn.textContent = "⏳ Submitting...";

      fetch("/api/feedback/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: userEmail,
          name: userName,
          ratings: ratings,
          foodTypes: foodTypes,
          liked: liked,
          issues: issues,
        }),
      })
        .then(function (r) {
          return r.json();
        })
        .then(function (data) {
          if (data.success) {
            var overlay = document.getElementById("successOverlay");
            if (overlay) overlay.classList.add("show");
            lockFeedbackForm();
          } else {
            showToast(
              data.message || "Submission failed. Please try again.",
              "error",
            );
            submitBtn.disabled = false;
            submitBtn.textContent = "Submit Feedback →";
          }
        })
        .catch(function () {
          showToast(
            "Server error. Make sure your server is running (node server.js).",
            "error",
          );
          submitBtn.disabled = false;
          submitBtn.textContent = "Submit Feedback →";
        });
    };
  }

  function lockFeedbackForm() {
    window.isFormLocked = true;
    var btn = document.querySelector('[onclick*="submitFeedback"]');
    if (btn) {
      btn.disabled = true;
      btn.textContent = "✅ Submitted this week";
      btn.style.opacity = "0.65";
      btn.style.cursor = "not-allowed";
      btn.style.background = "var(--surface2)";
      btn.style.color = "#4ade80";
    }
    var badge = document.querySelector(".wb-badge");
    if (badge) {
      badge.textContent = "✅ Submitted this week";
      badge.style.cssText =
        "background:rgba(249,115,22,.1);border:1px solid rgba(249,115,22,.3);color:#f97316;font-size:12px;font-weight:600;padding:6px 14px;border-radius:100px";
    }
    var progText = document.getElementById("prog-text");
    if (progText) progText.textContent = "Submitted — ratings are locked";

    document.querySelectorAll(".star").forEach(function (s) {
      s.style.cursor = "default";
      s.style.pointerEvents = "none";
    });
    document.querySelectorAll(".veg-toggle span").forEach(function (s) {
      s.style.cursor = "not-allowed";
    });

    var liked = document.getElementById("liked");
    var issues = document.getElementById("issues");
    if (liked) {
      liked.disabled = true;
      liked.style.opacity = "0.6";
    }
    if (issues) {
      issues.disabled = true;
      issues.style.opacity = "0.6";
    }
  }

  // ═══════════════════════════════════════════════════════
  //  REPORTS & ADMIN CHARTS LOGIC
  // ═══════════════════════════════════════════════════════
  if (document.getElementById("heatTable")) {
    fetch("/api/analytics/current")
      .then(function (r) {
        return r.json();
      })
      .then(function (res) {
        if (!res.success || res.empty) return;
        var d = res.data;
        var DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        var MK = ["b", "l", "s", "d"];
        var MH = {
          b: "🌅 Breakfast",
          l: "🍱 Lunch",
          s: "🫖 Snacks",
          d: "🌙 Dinner",
        };
        var mealNames = {
          breakfast: "Breakfast",
          lunch: "Lunch",
          snacks: "Snacks",
          dinner: "Dinner",
        };

        var vals = document.querySelectorAll(".ss-val");
        var lbls = document.querySelectorAll(".ss-label");
        if (vals.length >= 4) {
          vals[0].textContent = d.overallAvg;
          vals[1].textContent = d.total.toLocaleString();
          vals[2].textContent = d.mealAvg[d.bestMeal];
          vals[3].textContent = d.mealAvg[d.worstMeal];
          if (lbls[2]) lbls[2].textContent = "Best — " + mealNames[d.bestMeal];
          if (lbls[3])
            lbls[3].textContent = "Worst — " + mealNames[d.worstMeal];
        }

        var htEl = document.getElementById("heatTable");
        if (htEl) {
          htEl.innerHTML = "";
          var thead = htEl.createTHead();
          var hr = thead.insertRow();
          var th0 = document.createElement("th");
          hr.appendChild(th0);
          MK.forEach(function (m) {
            var t = document.createElement("th");
            t.textContent = MH[m];
            hr.appendChild(t);
          });
          var tbody = htEl.createTBody();
          DAYS.forEach(function (day) {
            var tr = tbody.insertRow();
            var td0 = tr.insertCell();
            td0.textContent = day;
            MK.forEach(function (m) {
              var td = tr.insertCell();
              var v = d.heatmap[day] ? d.heatmap[day][m] || 0 : 0;
              td.style.background = scColor(v);
              td.innerHTML = '<span class="hval">' + v + "</span>";
            });
          });
        }

        if (window._messifyBarChart) {
          window._messifyBarChart.data.datasets[0].data = [
            d.mealAvg.breakfast,
            d.mealAvg.lunch,
            d.mealAvg.snacks,
            d.mealAvg.dinner,
          ];
          window._messifyBarChart.update();
        }

        var commCard = document.querySelector(".comments-card");
        if (commCard && d.comments && d.comments.length > 0) {
          commCard.querySelectorAll(".comment-item").forEach(function (i) {
            i.remove();
          });
          d.comments.slice(0, 8).forEach(function (c, idx) {
            var letter = String.fromCharCode(65 + idx);
            if (c.liked)
              commCard.innerHTML += buildComment(
                letter,
                c.liked,
                "Positive",
                "pos",
              );
            if (c.issue)
              commCard.innerHTML += buildComment(
                letter,
                c.issue,
                "Negative",
                "neg",
              );
          });
        }
      })
      .catch(function (e) {});

    fetch("/api/analytics/all-weeks")
      .then(function (r) {
        return r.json();
      })
      .then(function (res) {
        if (!res.success || !res.data.length) return;
        if (window._messifyTrendChart) {
          window._messifyTrendChart.data.labels = res.data.map(function (w) {
            return w.weekLabel;
          });
          window._messifyTrendChart.data.datasets[0].data = res.data.map(
            function (w) {
              return w.overallAvg;
            },
          );
          window._messifyTrendChart.update();
        }
      })
      .catch(function () {});
  }

  if (document.getElementById("mealScores") && userRole === "admin") {
    fetch("/api/analytics/current")
      .then(function (r) {
        return r.json();
      })
      .then(function (res) {
        if (!res.success || res.empty) return;
        var d = res.data;
        var mealNames = {
          breakfast: "Breakfast",
          lunch: "Lunch",
          snacks: "Snacks",
          dinner: "Dinner",
        };

        var kAvg = document.getElementById("adm-kpi-avg");
        var kSubs = document.getElementById("adm-kpi-subs");
        var kWorst = document.getElementById("adm-kpi-worst");
        var kWLbl = document.getElementById("adm-kpi-worst-lbl");
        var kCompBox = document.getElementById("adm-kpi-complaints-box");

        if (kAvg) kAvg.textContent = d.overallAvg;
        if (kSubs) kSubs.textContent = d.total.toLocaleString();
        if (kWorst && d.worstMeal) kWorst.textContent = d.mealAvg[d.worstMeal];
        if (kWLbl && d.worstMeal)
          kWLbl.textContent = "Worst — " + mealNames[d.worstMeal];

        if (window._messifyDoughnutChart) {
          window._messifyDoughnutChart.data.datasets[0].data = [
            d.mealVegAvg.breakfast,
            d.mealVegAvg.lunch,
            d.mealVegAvg.snacks,
            d.mealVegAvg.dinner,
          ];
          window._messifyDoughnutChart.data.datasets[1].data = [
            d.mealNvAvg.breakfast,
            d.mealNvAvg.lunch,
            d.mealNvAvg.snacks,
            d.mealNvAvg.dinner,
          ];
          window._messifyDoughnutChart.update();
        }

        var ms = document.getElementById("mealScores");
        if (ms) {
          ms.innerHTML = "";
          var sortedMeals = ["breakfast", "lunch", "snacks", "dinner"].sort(
            function (a, b) {
              return d.mealAvg[b] - d.mealAvg[a];
            },
          );
          sortedMeals.forEach(function (m) {
            var score = d.mealAvg[m];
            var bc =
              score >= 4 ? "#22c55e" : score >= 3 ? "#eab308" : "#ef4444";
            var cls =
              score >= 4 ? "score-hi" : score >= 3 ? "score-md" : "score-lo";
            var tag =
              score >= 4
                ? "Performing well"
                : score >= 3
                  ? "Needs improvement"
                  : "Critical — review needed";

            var vegScore = d.mealVegAvg[m] || 0;
            var nvScore = d.mealNvAvg[m] || 0;
            var vegPill =
              vegScore > 0
                ? '<div class="si-veg-pill veg-pill">🌿 Veg: ' +
                  vegScore +
                  "</div>"
                : "";
            var nvPill =
              nvScore > 0
                ? '<div class="si-veg-pill nv-pill">🍗 NV: ' +
                  nvScore +
                  "</div>"
                : "";
            var pillsHtml =
              vegPill || nvPill
                ? '<div class="si-veg-row">' + vegPill + nvPill + "</div>"
                : "";

            ms.innerHTML +=
              '<div class="score-item">' +
              '<div class="si-info"><div class="si-name">' +
              mealNames[m] +
              "</div>" +
              '<div class="si-sub">' +
              tag +
              "</div>" +
              pillsHtml +
              "</div>" +
              '<div class="si-bar-bg"><div class="si-bar" style="width:' +
              (score / 5) * 100 +
              "%;background:" +
              bc +
              '"></div></div>' +
              '<div class="si-score ' +
              cls +
              '">' +
              score +
              "</div></div>";
          });
        }
      })
      .catch(function () {});

    fetch("/api/analytics/all-weeks")
      .then(function (r) {
        return r.json();
      })
      .then(function (res) {
        if (!res.success || !res.data.length) return;

        if (window._messifyAdminLineChart) {
          var weeks = res.data;
          window._messifyAdminLineChart.data.labels = weeks.map(function (w) {
            return w.weekLabel;
          });

          window._messifyAdminLineChart.data.datasets[0].data = weeks.map(
            function (w) {
              return w.mealAvg.breakfast;
            },
          );
          window._messifyAdminLineChart.data.datasets[1].data = weeks.map(
            function (w) {
              return w.mealVegAvg.breakfast;
            },
          );
          window._messifyAdminLineChart.data.datasets[2].data = weeks.map(
            function (w) {
              return w.mealNvAvg.breakfast;
            },
          );

          window._messifyAdminLineChart.data.datasets[3].data = weeks.map(
            function (w) {
              return w.mealAvg.lunch;
            },
          );
          window._messifyAdminLineChart.data.datasets[4].data = weeks.map(
            function (w) {
              return w.mealVegAvg.lunch;
            },
          );
          window._messifyAdminLineChart.data.datasets[5].data = weeks.map(
            function (w) {
              return w.mealNvAvg.lunch;
            },
          );

          window._messifyAdminLineChart.data.datasets[6].data = weeks.map(
            function (w) {
              return w.mealAvg.snacks;
            },
          );

          window._messifyAdminLineChart.data.datasets[7].data = weeks.map(
            function (w) {
              return w.mealAvg.dinner;
            },
          );
          window._messifyAdminLineChart.data.datasets[8].data = weeks.map(
            function (w) {
              return w.mealVegAvg.dinner;
            },
          );
          window._messifyAdminLineChart.data.datasets[9].data = weeks.map(
            function (w) {
              return w.mealNvAvg.dinner;
            },
          );

          window._messifyAdminLineChart.update();
        }
      })
      .catch(function () {});

    fetch("/api/admin/complaints", { headers: adminHeaders() })
      .then(function (r) {
        return r.json();
      })
      .then(function (res) {
        if (!res.success) return;

        var kComp = document.getElementById("adm-kpi-complaints");
        var kCompBox = document.getElementById("adm-kpi-complaints-box");
        if (kComp) kComp.textContent = res.count;
        if (kCompBox) kCompBox.textContent = res.count;

        if (res.data.length > 0) {
          var listContainer = document.getElementById("admin-complaints-list");
          if (listContainer) {
            listContainer.innerHTML = "";
            res.data.slice(0, 5).forEach(function (c) {
              var dt = new Date(c.submittedAt).toLocaleDateString("en-IN", {
                weekday: "short",
                day: "2-digit",
                month: "short",
              });
              var txt = c.text.toLowerCase();
              var icon =
                txt.indexOf("oil") > -1
                  ? "🦠"
                  : txt.indexOf("cook") > -1 || txt.indexOf("dal") > -1
                    ? "🍛"
                    : txt.indexOf("salt") > -1 || txt.indexOf("hard") > -1
                      ? "🧂"
                      : "⚠️";
              listContainer.innerHTML +=
                '<div class="complaint-item" style="padding: 13px 22px; border-bottom: 1px solid var(--border); display: flex; gap: 11px; align-items: flex-start;">' +
                '<div class="ci-ic" style="background:rgba(239,68,68,0.1); width: 32px; height: 32px; border-radius: 9px; display: flex; align-items: center; justify-content: center; font-size: 14px; flex-shrink: 0;">' +
                icon +
                "</div>" +
                '<div><div class="ci-text" style="font-size: 12px; color: var(--muted2); line-height: 1.6;">' +
                escHtml(c.text) +
                "</div>" +
                '<div class="ci-meta" style="font-size: 11px; color: var(--muted); margin-top: 3px;">' +
                dt +
                "</div></div></div>";
            });
          }
        }
      })
      .catch(function () {});
  }

  function buildComment(letter, text, sentiment, cls) {
    return (
      '<div class="comment-item">' +
      '<div class="ca">' +
      letter +
      "</div>" +
      '<div><div class="c-body">' +
      escHtml(text) +
      "</div>" +
      '<div class="c-meta"><span class="sent ' +
      cls +
      '">' +
      sentiment +
      "</span></div>" +
      "</div></div>"
    );
  }

  // ── ICONS ────────────────────────────────────────────────
  var ICON_MENU = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`;
  var ICON_CLOSE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

  function _sidebarOpen() {
    var sidebar = document.getElementById("sidebar");
    var overlay = document.getElementById("sidebarOverlay");
    var menuBtn = document.getElementById("menuBtn");
    if (!sidebar) return;
    sidebar.classList.add("open");
    if (overlay) overlay.classList.add("show");
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    if (menuBtn) menuBtn.innerHTML = ICON_CLOSE;
    // trap focus inside sidebar on accessibility
    sidebar.setAttribute("aria-expanded", "true");
  }

  function _sidebarClose() {
    var sidebar = document.getElementById("sidebar");
    var overlay = document.getElementById("sidebarOverlay");
    var menuBtn = document.getElementById("menuBtn");
    if (!sidebar) return;
    sidebar.classList.remove("open");
    if (overlay) overlay.classList.remove("show");
    document.body.style.overflow = "";
    document.body.style.touchAction = "";
    if (menuBtn) menuBtn.innerHTML = ICON_MENU;
    sidebar.setAttribute("aria-expanded", "false");
  }

  window.toggleSidebar = function () {
    var sidebar = document.getElementById("sidebar");
    if (!sidebar) return;
    if (sidebar.classList.contains("open")) {
      _sidebarClose();
    } else {
      _sidebarOpen();
    }
  };

  // ── SWIPE-TO-CLOSE gesture ───────────────────────────────
  (function initSwipe() {
    var touchStartX = 0;
    var touchStartY = 0;
    var isSwiping = false;

    document.addEventListener(
      "touchstart",
      function (e) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        isSwiping = false;
      },
      { passive: true },
    );

    document.addEventListener(
      "touchmove",
      function (e) {
        var dx = e.touches[0].clientX - touchStartX;
        var dy = e.touches[0].clientY - touchStartY;
        var sidebar = document.getElementById("sidebar");

        // Swipe right from left edge (<= 30px) to open sidebar on mobile
        if (
          window.innerWidth <= 1000 &&
          touchStartX <= 30 &&
          dx > 40 &&
          Math.abs(dy) < Math.abs(dx) &&
          sidebar &&
          !sidebar.classList.contains("open")
        ) {
          isSwiping = true;
          _sidebarOpen();
        }

        // Swipe left to close sidebar
        if (
          window.innerWidth <= 1000 &&
          dx < -50 &&
          Math.abs(dy) < Math.abs(dx) &&
          sidebar &&
          sidebar.classList.contains("open")
        ) {
          isSwiping = true;
          _sidebarClose();
        }
      },
      { passive: true },
    );
  })();

  // Overlay click also closes
  document.addEventListener("click", function (e) {
    var overlay = document.getElementById("sidebarOverlay");
    if (overlay && e.target === overlay) _sidebarClose();
  });

  // Escape key closes sidebar
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") _sidebarClose();
  });

  // ── RESIZE: close sidebar when going desktop ─────────────
  window.addEventListener("resize", function () {
    if (window.innerWidth > 1000) {
      _sidebarClose();
      document.body.style.overflow = "";
      document.body.style.touchAction = "";
    }
  });

  // ── WRAP rating table for horizontal scroll on mobile ────
  document.addEventListener("DOMContentLoaded", function () {
    var ratingTable = document.querySelector(".rating-table");
    if (ratingTable && !ratingTable.closest(".rating-table-wrap")) {
      var wrap = document.createElement("div");
      wrap.className = "rating-table-wrap";
      wrap.style.cssText = "overflow-x:auto;-webkit-overflow-scrolling:touch;";
      ratingTable.parentNode.insertBefore(wrap, ratingTable);
      wrap.appendChild(ratingTable);
    }

    // Wrap heat table in reports for horizontal scroll
    var heatTable = document.querySelector(".heat-table");
    if (heatTable && !heatTable.closest(".heat-table-wrap")) {
      var hWrap = document.createElement("div");
      hWrap.className = "heat-table-wrap";
      hWrap.style.cssText =
        "overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:4px;";
      heatTable.parentNode.insertBefore(hWrap, heatTable);
      hWrap.appendChild(heatTable);
    }

    // Ensure menu btn always shows correct icon
    var menuBtn = document.getElementById("menuBtn");
    if (menuBtn) menuBtn.innerHTML = ICON_MENU;

    // ✅ FIXED: Event delegation to guarantee sidebar links navigate
    var sidebar = document.getElementById("sidebar");
    if (sidebar) {
      sidebar.addEventListener("click", function (e) {
        var link = e.target.closest("a.sb-item");
        if (link && window.innerWidth <= 1000) {
          var targetUrl = link.getAttribute("href");
          if (targetUrl && targetUrl !== "#") {
            e.preventDefault(); // Stop standard broken cancel
            _sidebarClose(); // Slide the menu closed
            setTimeout(function () {
              window.location.href = targetUrl; // Force navigation manually
            }, 180);
          } else {
            setTimeout(_sidebarClose, 80);
          }
        }
      });
    }
  });
})();
