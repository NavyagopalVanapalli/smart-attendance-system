// 1. Immediately apply saved theme on load
if (localStorage.getItem("appTheme") === "dark") {
  document.body.classList.add("dark-mode");
}

// Place this at the TOP of script.js
function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  
  const icon = btn.querySelector("i");
  if (input.type === "password") {
    input.type = "text";
    if (icon) icon.className = "fa-solid fa-eye-slash";
  } else {
    input.type = "password";
    if (icon) icon.className = "fa-solid fa-eye";
  }
}


// 2. Global function reachable by theme toggle button
function toggleDarkMode() {
  document.body.classList.toggle("dark-mode");
  const isDark = document.body.classList.contains("dark-mode");

  localStorage.setItem("appTheme", isDark ? "dark" : "light");

  const btn = document.getElementById("themeToggleBtn");
  if (btn) {
    btn.textContent = isDark ? "☀️ Light Mode" : "🌙 Dark Mode";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const themeToggleBtn = document.getElementById("themeToggleBtn");
  if (themeToggleBtn && document.body.classList.contains("dark-mode")) {
    themeToggleBtn.textContent = "☀️ Light Mode";
  }

  const API_BASE_URL = `${window.location.origin}/api`;
  const dateInput = document.getElementById("attendanceDate");
  if (dateInput) dateInput.valueAsDate = new Date();

  let attendanceStateMemory = JSON.parse(localStorage.getItem("attendanceStateMemory")) || {};
  let pollingInterval = null;

  const loginSection = document.getElementById("loginSection");
  const dashboardSection = document.getElementById("dashboardSection");
  const logoutBtn = document.getElementById("logoutBtn");
  const changePasswordBtn = document.getElementById("changePasswordBtn");

  const deptSelect = document.getElementById("departmentSelect");
  const yearSelect = document.getElementById("yearSelect");
  const secSelect = document.getElementById("sectionSelect");
  const hourSelect = document.getElementById("hourSelect");

  function getActiveTeacher() {
    return JSON.parse(sessionStorage.getItem("activeTeacher")) || null;
  }

  function saveFilterState() {
    const filters = {
      dept: deptSelect ? deptSelect.value : "",
      year: yearSelect ? yearSelect.value : "",
      sec: secSelect ? secSelect.value : "",
      hour: hourSelect ? hourSelect.value : "",
      date: dateInput ? dateInput.value : ""
    };
    sessionStorage.setItem("college_attendance_filters", JSON.stringify(filters));
  }

  function restoreFilterState() {
    const savedFilters = sessionStorage.getItem("college_attendance_filters");
    if (!savedFilters) return;

    try {
      const filters = JSON.parse(savedFilters);
      if (deptSelect && filters.dept) deptSelect.value = filters.dept;
      if (yearSelect && filters.year) yearSelect.value = filters.year;
      if (secSelect && filters.sec) secSelect.value = filters.sec;
      if (hourSelect && filters.hour) hourSelect.value = filters.hour;
      if (dateInput && filters.date) dateInput.value = filters.date;
    } catch (e) {
      console.error("Error restoring filters:", e);
    }
  }

  function showDashboard(teacher) {
    if (loginSection) loginSection.classList.add("hidden");
    if (dashboardSection) dashboardSection.classList.remove("hidden");
    if (logoutBtn) logoutBtn.classList.remove("hidden");
    if (changePasswordBtn) changePasswordBtn.classList.remove("hidden");

    const facultyInfoDisplay = document.getElementById("facultyInfoDisplay");
    const teacherName = teacher.teacher_name || teacher.full_name || "Faculty";
    const teacherId = teacher.teacher_id || "N/A";

    if (facultyInfoDisplay) {
      facultyInfoDisplay.innerHTML = `<strong>Faculty:</strong> ${teacherName} (${teacherId})`;
    } else {
      let teacherBadge = document.getElementById("teacherProfileBadge");
      if (!teacherBadge) {
        teacherBadge = document.createElement("div");
        teacherBadge.id = "teacherProfileBadge";
        teacherBadge.style.cssText = "padding: 10px 18px; background: rgba(99, 102, 241, 0.15); border: 1px solid var(--glass-border); border-radius: 12px; font-weight: 600; color: var(--text-main); margin-bottom: 15px; backdrop-filter: var(--blur-amount);";
        const dashboardHeader = dashboardSection.querySelector(".dashboard-header") || dashboardSection;
        dashboardHeader.prepend(teacherBadge);
      }
      teacherBadge.innerHTML = `👤 <strong>Faculty:</strong> ${teacherName} | <strong>ID:</strong> ${teacherId}`;
    }
    
    restoreFilterState();
    renderStudentTable();
  }

  function getScopedKey(rollNo) {
    const activeTeacher = getActiveTeacher();
    const teacherId = activeTeacher ? activeTeacher.teacher_id : "guest";
    const d = dateInput ? dateInput.value : "today";
    const dept = deptSelect ? deptSelect.value : "";
    const yr = yearSelect ? yearSelect.value : "";
    const sec = secSelect ? secSelect.value : "";
    const hr = hourSelect ? hourSelect.value.split(" ")[0] : "";
    return `attendance_${teacherId}_${d}_${dept}_${yr}_${sec}_${hr}_${rollNo}`;
  }

  function saveCurrentStateToMemory() {
    document.querySelectorAll("#studentTableBody tr").forEach(row => {
      const roll = row.getAttribute("data-student-id");
      const toggle = row.querySelector(".attendance-toggle");
      const smsPill = row.querySelector(".status-pill");

      if (roll && toggle) {
        const key = getScopedKey(roll);
        attendanceStateMemory[key] = {
          checked: toggle.checked,
          smsStatus: smsPill ? smsPill.textContent : "Not Sent"
        };
      }
    });
    localStorage.setItem("attendanceStateMemory", JSON.stringify(attendanceStateMemory));
  }

  [deptSelect, yearSelect, secSelect, hourSelect, dateInput].forEach(input => {
    if (input) {
      input.addEventListener("change", () => {
        saveFilterState();
        renderStudentTable();
      });
    }
  });

  async function renderStudentTable() {
    if (pollingInterval) clearInterval(pollingInterval);

    const activeTeacher = getActiveTeacher();
    const teacherId = activeTeacher ? activeTeacher.teacher_id : "";

    const dept = deptSelect ? deptSelect.value : "";
    const year = yearSelect ? yearSelect.value : "";
    const sec = secSelect ? secSelect.value : "";
    const rawHour = hourSelect ? hourSelect.value : "";
    const date = dateInput ? dateInput.value : "";

    const badge = document.getElementById("activeSectionBadge");
    if (badge) badge.textContent = `${dept} - ${year} (${sec}) | ${rawHour}`;

    const tableBody = document.getElementById("studentTableBody");
    if (!tableBody) return;

    try {
      const response = await fetch(`${API_BASE_URL}/students?dept=${dept}&year=${year}&section=${sec}`);
      const students = await response.json();

      const liveRes = await fetch(`${API_BASE_URL}/attendance/live?dept=${encodeURIComponent(dept)}&hour=${encodeURIComponent(rawHour)}&date=${encodeURIComponent(date)}&teacherId=${encodeURIComponent(teacherId)}`);
      const dbRecords = liveRes.ok ? await liveRes.json() : [];
      const presentRollsInDb = new Set(dbRecords.map(r => r.roll_no));

      tableBody.innerHTML = "";

      if (!students || students.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--text-muted);">No students found for this section.</td></tr>`;
        updateSummary();
        return;
      }

      students.forEach(student => {
        const tr = document.createElement("tr");
        tr.setAttribute("data-student-id", student.roll_no);

        const key = getScopedKey(student.roll_no);
        const savedState = attendanceStateMemory[key];

        const isPresentInDb = presentRollsInDb.has(student.roll_no);
        const isChecked = isPresentInDb || (savedState ? savedState.checked : false);
        const smsStatus = savedState ? savedState.smsStatus : "Not Sent";

        const statusText = isChecked ? "Present" : "Absent";
        const statusClass = isChecked ? "text-present" : "text-absent";
        const pillClass = smsStatus.startsWith("SMS Sent") || smsStatus === "WhatsApp Opened" ? "pill-sent"
          : smsStatus === "Send Failed" ? "pill-failed"
          : "pill-neutral";

        tr.innerHTML = `
          <td class="roll-no">${student.roll_no}</td>
          <td class="student-name">${student.full_name}</td>
          <td class="parent-phone">${student.parent_phone}</td>
          <td>
            <label class="switch">
              <input type="checkbox" class="attendance-toggle" ${isChecked ? 'checked' : ''} data-roll="${student.roll_no}" data-student-name="${student.full_name}" data-parent-phone="${student.parent_phone}">
              <span class="slider round"></span>
            </label>
            <span class="status-text ${statusClass}">${statusText}</span>
          </td>
          <td><span class="status-pill ${pillClass}">${smsStatus}</span></td>
          <td style="text-align: center; display: flex; gap: 8px; justify-content: center; align-items: center;">
            <button class="whatsapp-btn btn-secondary" data-roll="${student.roll_no}" data-name="${student.full_name}" data-phone="${student.parent_phone}" title="Send WhatsApp to Parent" style="padding: 4px 10px; font-size: 0.8rem; display: ${isChecked ? 'none' : 'inline-flex'}; border-color: #25D366; color: #25D366;">
              💬 WhatsApp
            </button>
            <button class="delete-btn" data-roll="${student.roll_no}" data-name="${student.full_name}" title="Delete Student" style="background: none; border: none; color: var(--danger); cursor: pointer; font-size: 1.1rem;">
              🗑️
            </button>
          </td>
        `;
        tableBody.appendChild(tr);
      });

      attachToggleListeners();
      attachWhatsAppListeners();
      attachDeleteListeners();
      updateSummary();

      startLivePolling(dept, rawHour, date, teacherId);

    } catch (err) {
      console.error("Fetch error:", err);
    }
  }

  function startLivePolling(dept, hour, date, teacherId) {
    if (!dept || !hour || !date || !teacherId) return;
    if (pollingInterval) clearInterval(pollingInterval);

    pollingInterval = setInterval(async () => {
      try {
        const liveRes = await fetch(`${API_BASE_URL}/attendance/live?dept=${encodeURIComponent(dept)}&hour=${encodeURIComponent(hour)}&date=${encodeURIComponent(date)}&teacherId=${encodeURIComponent(teacherId)}`);
        if (!liveRes.ok) return;
        
        const liveData = await liveRes.json();

        if (Array.isArray(liveData)) {
          liveData.forEach(record => {
            if (record.status === 'Present') {
              const row = document.querySelector(`#studentTableBody tr[data-student-id="${record.roll_no}"]`);
              if (row) {
                const toggle = row.querySelector(".attendance-toggle");
                if (toggle && !toggle.checked) {
                  toggle.checked = true;
                  updateRowStatus(toggle, true, "Not Sent");
                }
              }
            }
          });
        }
      } catch (e) {
        console.error("Live polling error:", e);
      }
    }, 3000);
  }

  function attachDeleteListeners() {
    document.querySelectorAll(".delete-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const roll_no = e.currentTarget.getAttribute("data-roll");
        const studentName = e.currentTarget.getAttribute("data-name");
        const dept_code = deptSelect.value;

        if (confirm(`Are you sure you want to delete student "${studentName}" (${roll_no})?`)) {
          try {
            const response = await fetch(`${API_BASE_URL}/students/delete?roll_no=${encodeURIComponent(roll_no)}&dept_code=${encodeURIComponent(dept_code)}`, {
              method: "DELETE"
            });
            const data = await response.json();

            if (data.success) {
              alert(`✅ Student "${studentName}" removed!`);
              renderStudentTable();
            } else {
              alert("Error deleting student: " + data.message);
            }
          } catch (err) {
            alert("Failed to connect to backend server.");
          }
        }
      });
    });
  }

  function attachWhatsAppListeners() {
    document.querySelectorAll(".whatsapp-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const studentName = e.currentTarget.getAttribute("data-name");
        const rawPhone = e.currentTarget.getAttribute("data-phone");
        const rollNo = e.currentTarget.getAttribute("data-roll");

        let cleanPhone = rawPhone.replace(/\D/g, "");
        if (cleanPhone.length === 10) cleanPhone = "91" + cleanPhone;

        const messageText = `Dear Parent, your child ${studentName} (${rollNo}) was marked ABSENT today (${dateInput.value}) during ${hourSelect.value} for ${deptSelect.value} ${secSelect.value}.`;
        const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(messageText)}`;

        const row = e.currentTarget.closest("tr");
        const smsPill = row ? row.querySelector(".status-pill") : null;
        if (smsPill) {
          smsPill.textContent = "WhatsApp Opened";
          smsPill.className = "status-pill pill-sent";
        }

        saveCurrentStateToMemory();
        window.open(whatsappUrl, "_blank");
      });
    });
  }

  function attachToggleListeners() {
    document.querySelectorAll(".attendance-toggle").forEach(toggle => {
      toggle.addEventListener("change", (e) => {
        const isChecked = e.target.checked;
        updateRowStatus(e.target, isChecked, isChecked ? "Not Sent" : "No SMS");
      });
    });
  }

  function updateRowStatus(toggle, isPresent, smsStatus) {
    const row = toggle.closest("tr");
    const statusText = row.querySelector(".status-text");
    const smsPill = row.querySelector(".status-pill");
    const whatsappBtn = row.querySelector(".whatsapp-btn");

    if (isPresent) {
      statusText.textContent = "Present";
      statusText.className = "status-text text-present";
      smsPill.textContent = "Not Sent";
      smsPill.className = "status-pill pill-neutral";

      if (whatsappBtn) whatsappBtn.style.display = "none";
    } else {
      statusText.textContent = "Absent";
      statusText.className = "status-text text-absent";
      smsPill.textContent = smsStatus;
      smsPill.className = smsStatus.startsWith("SMS Sent") || smsStatus === "WhatsApp Opened" ? "status-pill pill-sent"
        : smsStatus === "Send Failed" ? "status-pill pill-failed"
        : "status-pill pill-neutral";

      if (whatsappBtn) whatsappBtn.style.display = "inline-flex";
    }

    saveCurrentStateToMemory();
    updateSummary();
  }

  function updateSummary() {
    const rows = document.querySelectorAll("#studentTableBody tr");
    let presentCount = 0;
    let absentCount = 0;

    const presentList = document.getElementById("presentStudentsList");
    const absentList = document.getElementById("absentStudentsList");

    if (presentList) presentList.innerHTML = "";
    if (absentList) absentList.innerHTML = "";

    rows.forEach(row => {
      const nameEl = row.querySelector(".student-name");
      if (!nameEl) return;

      const name = nameEl.textContent;
      const roll = row.querySelector(".roll-no").textContent;
      const toggle = row.querySelector(".attendance-toggle");

      if (toggle && toggle.checked) {
        presentCount++;
        if (presentList) {
          const li = document.createElement("li");
          li.textContent = `${roll} - ${name}`;
          presentList.appendChild(li);
        }
      } else {
        absentCount++;
        if (absentList) {
          const li = document.createElement("li");
          li.textContent = `${roll} - ${name}`;
          absentList.appendChild(li);
        }
      }
    });

    const presentEl = document.getElementById("presentCount");
    const absentEl = document.getElementById("absentCount");
    const totalEl = document.getElementById("totalCount");

    if (presentEl) presentEl.textContent = presentCount;
    if (absentEl) absentEl.textContent = absentCount;
    if (totalEl) totalEl.textContent = presentCount + absentCount;

    if (absentList && absentCount === 0) {
      absentList.innerHTML = '<li class="empty-msg" style="color: var(--text-muted);">No students marked absent yet.</li>';
    }
  }

  const loginBtn = document.getElementById("loginBtn");
  if (loginBtn) {
    loginBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      const teacherIdInput = document.getElementById("teacherId");
      const passwordInput = document.getElementById("password");

      const teacherId = teacherIdInput ? teacherIdInput.value.trim() : "";
      const password = passwordInput ? passwordInput.value.trim() : "";

      if (!teacherId || !password) {
        alert("Please enter Faculty ID and Password.");
        return;
      }

      try {
        const res = await fetch(`${API_BASE_URL}/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teacherId, password })
        });
        const data = await res.json();

        if (data.success) {
          sessionStorage.setItem("activeTeacher", JSON.stringify(data.teacher));
          if (passwordInput) passwordInput.value = "";
          showDashboard(data.teacher);
        } else {
          if (passwordInput) passwordInput.value = "";
          alert(data.message || "Invalid credentials");
        }
      } catch (err) {
        alert("Backend Server Error. Ensure node server.js is running!");
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      if (pollingInterval) clearInterval(pollingInterval);
      sessionStorage.removeItem("activeTeacher");
      sessionStorage.removeItem("college_attendance_filters");

      if (dashboardSection) dashboardSection.classList.add("hidden");
      if (logoutBtn) logoutBtn.classList.add("hidden");
      if (changePasswordBtn) changePasswordBtn.classList.add("hidden");
      if (loginSection) loginSection.classList.remove("hidden");
      const pwd = document.getElementById("password");
      if (pwd) pwd.value = "";
    });
  }

  const addStudentModal = document.getElementById("addStudentModal");
  const openAddStudentModalBtn = document.getElementById("openAddStudentModalBtn");
  const closeAddStudentModalBtn = document.getElementById("closeAddStudentModalBtn");
  const saveNewStudentBtn = document.getElementById("saveNewStudentBtn");

  if (openAddStudentModalBtn) openAddStudentModalBtn.addEventListener("click", () => addStudentModal.classList.remove("hidden"));
  if (closeAddStudentModalBtn) closeAddStudentModalBtn.addEventListener("click", () => addStudentModal.classList.add("hidden"));

  if (saveNewStudentBtn) {
    saveNewStudentBtn.addEventListener("click", async () => {
      const roll_no = document.getElementById("newRollNo").value.trim();
      const full_name = document.getElementById("newStudentName").value.trim();
      const parent_phone = document.getElementById("newParentPhone").value.trim();

      if (!roll_no || !full_name || !parent_phone) {
        alert("Please fill in all student details!");
        return;
      }

      if (!/^\d{10}$/.test(parent_phone)) {
        alert("Please enter a valid 10-digit mobile number!");
        return;
      }

      saveCurrentStateToMemory();

      try {
        const response = await fetch(`${API_BASE_URL}/students/add`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roll_no,
            full_name,
            parent_phone,
            dept_code: deptSelect.value,
            year_level: yearSelect.value,
            section: secSelect.value
          })
        });

        const data = await response.json();

        if (data.success) {
          alert(`✅ Student "${full_name}" added successfully!`);
          document.getElementById("newRollNo").value = "";
          document.getElementById("newStudentName").value = "";
          document.getElementById("newParentPhone").value = "";
          addStudentModal.classList.add("hidden");
          renderStudentTable();
        } else {
          alert("Error: " + data.message);
        }
      } catch (err) {
        alert("Failed to connect to backend server.");
      }
    });
  }

  const submitAttendanceBtn = document.getElementById("submitAttendanceBtn");
  if (submitAttendanceBtn) {
    submitAttendanceBtn.addEventListener("click", async () => {
      const rows = document.querySelectorAll("#studentTableBody tr");
      const records = [];

      rows.forEach(row => {
        const roll_no = row.getAttribute("data-student-id");
        const toggle = row.querySelector(".attendance-toggle");
        const smsPill = row.querySelector(".status-pill");

        if (roll_no && toggle) {
          records.push({
            roll_no: roll_no,
            status: toggle.checked ? "Present" : "Absent",
            sms_status: smsPill ? smsPill.textContent : "Not Sent"
          });
        }
      });

      if (records.length === 0) {
        alert("No student records to save!");
        return;
      }

      const activeTeacher = getActiveTeacher() || { teacher_id: "FAC101" };

      try {
        const response = await fetch(`${API_BASE_URL}/attendance/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: dateInput.value,
            hour: hourSelect.value,
            teacherId: activeTeacher.teacher_id,
            dept: deptSelect.value,
            records: records
          })
        });

        const data = await response.json();
        if (data.success) {
          alert(`✅ Attendance saved permanently!`);
          renderStudentTable();
        } else {
          alert("Error: " + data.message);
        }
      } catch (err) {
        alert("Server error when saving attendance.");
      }
    });
  }

  const changePasswordModal = document.getElementById("changePasswordModal");
  const openChangePasswordBtn = document.getElementById("changePasswordBtn");
  const closePasswordModalBtn = document.getElementById("closePasswordModalBtn");
  const savePasswordBtn = document.getElementById("savePasswordBtn");

  if (openChangePasswordBtn) {
    openChangePasswordBtn.addEventListener("click", () => {
      if (changePasswordModal) changePasswordModal.classList.remove("hidden");
    });
  }

  if (closePasswordModalBtn) {
    closePasswordModalBtn.addEventListener("click", () => {
      if (changePasswordModal) changePasswordModal.classList.add("hidden");
    });
  }

  if (savePasswordBtn) {
    savePasswordBtn.addEventListener("click", async () => {
      const currentPassword = document.getElementById("currentPassword").value.trim();
      const newPassword = document.getElementById("newPassword").value.trim();
      const activeTeacher = getActiveTeacher();

      if (!currentPassword || !newPassword) {
        alert("Please enter both current and new passwords.");
        return;
      }

      if (!activeTeacher || !activeTeacher.teacher_id) {
        alert("Session expired. Please log in again.");
        return;
      }

      try {
        const response = await fetch(`${API_BASE_URL}/change-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teacherId: activeTeacher.teacher_id,
            currentPassword,
            newPassword
          })
        });

        const data = await response.json();

        if (data.success) {
          alert("✅ Password updated successfully!");
          document.getElementById("currentPassword").value = "";
          document.getElementById("newPassword").value = "";
          if (changePasswordModal) changePasswordModal.classList.add("hidden");
        } else {
          alert("Error: " + data.message);
        }
      } catch (err) {
        alert("Failed to connect to backend server.");
      }
    });
  }

  const generateQrBtn = document.getElementById("generateQrBtn");
  const qrModal = document.getElementById("qrModal");
  const closeQrModalBtn = document.getElementById("closeQrModalBtn");
  const qrCodeContainer = document.getElementById("qrCodeContainer");
  const qrInfoText = document.getElementById("qrInfoText");

  if (generateQrBtn) {
    generateQrBtn.addEventListener("click", () => {
      if (!navigator.geolocation) {
        alert("Geolocation is not supported by your browser.");
        return;
      }

      const geoOptions = {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000
      };

      navigator.geolocation.getCurrentPosition(async (position) => {
        const teacherLat = position.coords.latitude;
        const teacherLng = position.coords.longitude;
        const activeTeacher = getActiveTeacher() || { teacher_id: "FAC101" };

        try {
          const response = await fetch(`${API_BASE_URL}/qr/generate-location`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              dept: deptSelect.value,
              year: yearSelect.value,
              section: secSelect.value,
              hour: hourSelect.value,
              date: dateInput.value,
              teacherLat,
              teacherLng,
              teacherId: activeTeacher.teacher_id
            })
          });

          const data = await response.json();

          if (data.success) {
            if (qrCodeContainer) qrCodeContainer.innerHTML = "";
            
            const studentAccessUrl = `${window.location.origin}/student?sessionId=${data.sessionId}`;

            if (typeof QRCode !== "undefined" && qrCodeContainer) {
              new QRCode(qrCodeContainer, {
                text: studentAccessUrl,
                width: 220,
                height: 220
              });
            }
            if (qrInfoText) {
              qrInfoText.textContent = `${deptSelect.value} - ${secSelect.value} | Scan to Mark Attendance 📍`;
            }
            if (qrModal) qrModal.classList.remove("hidden");
          }
        } catch (err) {
          alert("Failed to connect to backend server.");
        }
      }, (err) => {
        alert("Please allow GPS location permission to generate classroom QR code.");
      }, geoOptions);
    });
  }

  if (closeQrModalBtn) {
    closeQrModalBtn.addEventListener("click", () => {
      if (qrModal) qrModal.classList.add("hidden");
    });
  }

 // Add/Replace inside document.addEventListener("DOMContentLoaded", () => { ... }) in script.js

const forgotPasswordLink = document.getElementById("forgotPasswordLink");
const forgotPasswordModal = document.getElementById("forgotPasswordModal");
const closeForgotModalBtn = document.getElementById("closeForgotModalBtn");
const sendOtpBtn = document.getElementById("sendOtpBtn");
const otpStepFields = document.getElementById("otpStepFields");
const submitResetPasswordBtn = document.getElementById("submitResetPasswordBtn");

if (forgotPasswordLink) {
  forgotPasswordLink.addEventListener("click", (e) => {
    e.preventDefault();
    if (forgotPasswordModal) {
      forgotPasswordModal.classList.remove("hidden");
      if (otpStepFields) otpStepFields.classList.add("hidden");
      if (submitResetPasswordBtn) submitResetPasswordBtn.classList.add("hidden");
      if (sendOtpBtn) sendOtpBtn.classList.remove("hidden");
    }
  });
}

if (closeForgotModalBtn) {
  closeForgotModalBtn.addEventListener("click", () => {
    if (forgotPasswordModal) forgotPasswordModal.classList.add("hidden");
  });
}

// Step 1: Request OTP & Open WhatsApp Link
if (sendOtpBtn) {
  sendOtpBtn.addEventListener("click", async () => {
    const teacherId = document.getElementById("resetTeacherId").value.trim();

    if (!teacherId) {
      alert("Please enter your Faculty ID.");
      return;
    }

    sendOtpBtn.disabled = true;
    sendOtpBtn.textContent = "Processing Request...";

    try {
      const response = await fetch('/api/request-reset-otp', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherId })
      });

      const data = await response.json();

      if (data.success) {
        alert("✅ " + data.message);

        const whatsappLinkWrapper = document.getElementById("whatsappLinkWrapper");
        const whatsappOtpLink = document.getElementById("whatsappOtpLink");

        if (whatsappOtpLink && data.whatsappUrl) {
          whatsappOtpLink.href = data.whatsappUrl;
        }

        // Show WhatsApp Opener and Step 2 fields
        if (whatsappLinkWrapper) whatsappLinkWrapper.classList.remove("hidden");
        if (otpStepFields) otpStepFields.classList.remove("hidden");
        if (submitResetPasswordBtn) submitResetPasswordBtn.classList.remove("hidden");
        
        sendOtpBtn.classList.add("hidden");

        // Automatically open WhatsApp window
        if (data.whatsappUrl) {
          window.open(data.whatsappUrl, "_blank");
        }

      } else {
        alert("Error: " + data.message);
      }
    } catch (err) {
      alert("Failed to connect to backend server.");
    } finally {
      sendOtpBtn.disabled = false;
      sendOtpBtn.textContent = "💬 Request WhatsApp OTP";
    }
  });
}

const copyOtpBtn = document.getElementById("copyOtpBtn");
if (copyOtpBtn) {
  copyOtpBtn.addEventListener("click", () => {
    const otpText = document.getElementById("displayOtpCode").textContent;
    navigator.clipboard.writeText(otpText).then(() => {
      copyOtpBtn.textContent = "✅ Copied!";
      setTimeout(() => { copyOtpBtn.textContent = "📋 Copy"; }, 2000);
    });
  });
}


// STEP 2: Verify OTP & Reset Password Handler
if (submitResetPasswordBtn) {
  submitResetPasswordBtn.addEventListener("click", async () => {
    const teacherId = document.getElementById("resetTeacherId").value.trim();
    const otp = document.getElementById("resetOtpCode").value.trim();
    const newPassword = document.getElementById("resetNewPassword").value.trim();

    if (!teacherId || !otp || !newPassword) {
      alert("Please fill in Faculty ID, OTP, and New Password.");
      return;
    }

    try {
      const response = await fetch('/api/verify-otp-reset-password', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherId, otp, newPassword })
      });

      const data = await response.json();

      if (data.success) {
        alert("✅ " + data.message);
        document.getElementById("resetTeacherId").value = "";
        document.getElementById("resetOtpCode").value = "";
        document.getElementById("resetNewPassword").value = "";
        if (forgotPasswordModal) forgotPasswordModal.classList.add("hidden");
      } else {
        alert("Error: " + data.message);
      }
    } catch (err) {
      alert("Failed to connect to backend server.");
    }
  });
}

  const activeTeacher = getActiveTeacher();
  if (activeTeacher) {
    showDashboard(activeTeacher);
  }


  // Add this inside document.addEventListener("DOMContentLoaded", () => { ... })
const hamburgerBtn = document.getElementById("hamburgerBtn");
const navActions = document.getElementById("navActions");

if (hamburgerBtn && navActions) {
  hamburgerBtn.addEventListener("click", () => {
    navActions.classList.toggle("active");
    
    // Toggle icon between bars and close X
    const icon = hamburgerBtn.querySelector("i");
    if (icon) {
      if (navActions.classList.contains("active")) {
        icon.className = "fa-solid fa-xmark";
      } else {
        icon.className = "fa-solid fa-bars";
      }
    }
  });

  // Close mobile menu when clicking outside
  document.addEventListener("click", (e) => {
    if (!hamburgerBtn.contains(e.target) && !navActions.contains(e.target)) {
      navActions.classList.remove("active");
      const icon = hamburgerBtn.querySelector("i");
      if (icon) icon.className = "fa-solid fa-bars";
    }
  });
}
});