// ═══════════════════════════════════════════════════════════
//  messify.js — clean frontend logic connector
// ═══════════════════════════════════════════════════════════
(function () {
  "use strict";

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
  fetch("/api/week/current", { credentials: "include" })
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
    // ── UPDATED STUDENT VIEW ──
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
        <a class="sb-item" href="#"><span class="ic">🧾</span> Mess Bill</a>
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
    fetch("/api/feedback/status?email=" + encodeURIComponent(userEmail), {
      credentials: "include",
    })
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
                s.style.cursor = "default";
                s.style.pointerEvents = "none";
              });

              var tgs = document.querySelectorAll(
                '.veg-toggle[data-key="' + key + '"] span',
              );
              tgs.forEach(function (t) {
                t.classList.remove("active");
                if (t.dataset.type === (r.food_type || "veg"))
                  t.classList.add("active");
                t.style.cursor = "not-allowed";
                t.style.pointerEvents = "none";
                t.style.opacity = t.classList.contains("active") ? "1" : "0.2";
              });

              if (r.rating > 0) ratedCountNum++;
            });

            var progFill = document.getElementById("prog-fill");
            var progText = document.getElementById("prog-text");
            var rCount = document.getElementById("rated-count");
            var totalSlots =
              typeof getTotalUnlockedSlots === "function"
                ? getTotalUnlockedSlots()
                : 28;
            if (progFill)
              progFill.style.width =
                Math.round((ratedCountNum / totalSlots) * 100) + "%";
            if (progText)
              progText.textContent =
                "Submitted — " + ratedCountNum + " meals rated";
            if (rCount) rCount.textContent = ratedCountNum;

            var liked = document.getElementById("liked");
            var issues = document.getElementById("issues");
            if (liked) liked.value = data.savedData.liked || "";
            if (issues) issues.value = data.savedData.issues || "";
          }

          if (submitBtn) {
            submitBtn.textContent = "Update Feedback →";
          }
          var badge = document.querySelector(".wb-badge");
          if (badge) {
            badge.textContent = "🔄 Progress Saved";
            badge.style.cssText =
              "background:rgba(59, 130, 246, 0.1);border:1px solid rgba(59, 130, 246, 0.25);color:#60a5fa;font-size:12px;font-weight:600;padding:6px 14px;border-radius:100px";
          }
          showToast("Loaded your saved progress for this week.", "success");
        }
      })
      .catch(function () {});

    window.submitFeedback = function () {
      if (submitBtn.disabled) return;
      var ratings = window.ratings || {};
      var foodTypes = window.foodTypes || {};

      var unlockedRated = 0;
      if (
        typeof getUnlockedDayIndices === "function" &&
        typeof days !== "undefined" &&
        typeof meals !== "undefined"
      ) {
        var uIdx = getUnlockedDayIndices();
        days.forEach(function (day, idx) {
          if (uIdx.indexOf(idx) === -1) return;
          meals.forEach(function (meal) {
            if ((ratings[day + "_" + meal] || 0) > 0) unlockedRated++;
          });
        });
      } else {
        unlockedRated = Object.values(ratings).filter(function (v) {
          return v > 0;
        }).length;
      }
      if (unlockedRated < 1) {
        showToast("Please rate at least one meal before submitting.", "error");
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
        credentials: "include",
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
            if (overlay) {
              overlay.onclick = function (e) {
                if (e.target === overlay) overlay.classList.remove("show");
              };
              overlay.classList.add("show");
            }
            submitBtn.disabled = false;
            submitBtn.textContent = "Update Feedback →";

            var badge = document.querySelector(".wb-badge");
            if (badge) {
              badge.textContent = "🔄 Progress Saved";
              badge.style.cssText =
                "background:rgba(59, 130, 246, 0.1);border:1px solid rgba(59, 130, 246, 0.25);color:#60a5fa;font-size:12px;font-weight:600;padding:6px 14px;border-radius:100px";
            }
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

  // ═══════════════════════════════════════════════════════
  //  REPORTS & ADMIN CHARTS LOGIC
  // ═══════════════════════════════════════════════════════
  if (document.getElementById("heatTable")) {
    fetch("/api/analytics/current", { credentials: "include" })
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
          var vAvg = d.mealVegAvg || {};
          var nvAvg = d.mealNvAvg || {};
          window._messifyBarChart.data.datasets[0].data = [
            vAvg.breakfast || null,
            vAvg.lunch || null,
            vAvg.snacks || null,
            vAvg.dinner || null,
          ];
          window._messifyBarChart.data.datasets[1].data = [
            nvAvg.breakfast || null,
            nvAvg.lunch || null,
            nvAvg.snacks || null,
            nvAvg.dinner || null,
          ];
          window._messifyBarChart.update();
        }

        var commCard = document.querySelector(".comments-card");
        if (commCard && d.comments && d.comments.length > 0) {
          commCard.querySelectorAll(".comment-item").forEach(function (i) {
            i.remove();
          });
          var placeholder = document.getElementById("comments-placeholder");
          if (placeholder) placeholder.remove();
          d.comments.slice(0, 8).forEach(function (c, idx) {
            var letter = String.fromCharCode(65 + idx);
            if (c.liked)
              commCard.innerHTML += buildComment(letter, c.liked, "Positive", "pos");
            if (c.issue)
              commCard.innerHTML += buildComment(letter, c.issue, "Negative", "neg");
          });
        }
      })
      .catch(function (e) {});

    fetch("/api/analytics/all-weeks", { credentials: "include" })
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

  document.addEventListener("click", function (e) {
    var overlay = document.getElementById("sidebarOverlay");
    if (overlay && e.target === overlay) _sidebarClose();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") _sidebarClose();
  });

  window.addEventListener("resize", function () {
    if (window.innerWidth > 1000) {
      _sidebarClose();
      document.body.style.overflow = "";
      document.body.style.touchAction = "";
    }
  });

  document.addEventListener("DOMContentLoaded", function () {
    var heatTable = document.querySelector(".heat-table");
    if (heatTable && !heatTable.closest(".heat-table-wrap")) {
      var hWrap = document.createElement("div");
      hWrap.className = "heat-table-wrap";
      hWrap.style.cssText =
        "overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:4px;";
      heatTable.parentNode.insertBefore(hWrap, heatTable);
      hWrap.appendChild(heatTable);
    }

    var menuBtn = document.getElementById("menuBtn");
    if (menuBtn) menuBtn.innerHTML = ICON_MENU;

    var sidebar = document.getElementById("sidebar");
    if (sidebar) {
      sidebar.addEventListener("click", function (e) {
        var link = e.target.closest("a.sb-item");
        if (link && window.innerWidth <= 1000) {
          var targetUrl = link.getAttribute("href");
          if (targetUrl && targetUrl !== "#") {
            e.preventDefault();
            _sidebarClose();
            setTimeout(function () {
              window.location.href = targetUrl;
            }, 180);
          } else {
            setTimeout(_sidebarClose, 80);
          }
        }
      });
    }
  });
})();
