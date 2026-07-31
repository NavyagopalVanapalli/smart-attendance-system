const API_BASE = "/api/admin";

// SECURITY CHECK: Redirect to admin-login.html if session key is missing
if (sessionStorage.getItem("isAdminLoggedIn") !== "true") {
  window.location.href = "admin-login.html";
}

document.addEventListener("DOMContentLoaded", () => {
  fetchStats();
  loadTeachersTable();
  loadStudentsTable();
  displayAdminProfile();
});

// Display Logged-In Admin Info
function displayAdminProfile() {
  const activeAdmin = JSON.parse(sessionStorage.getItem("activeAdmin"));
  const headerElem = document.querySelector("h1");
  if (activeAdmin && headerElem) {
    headerElem.innerHTML = `⚡ Admin Dashboard <span style="font-size:0.9rem; font-weight:normal; color:#cbd5e1; display:block; margin-top:5px;">Welcome, <strong>${activeAdmin.full_name}</strong> (${activeAdmin.admin_id})</span>`;
  }
}

// Admin Logout Action
function logoutAdmin() {
  sessionStorage.removeItem("isAdminLoggedIn");
  sessionStorage.removeItem("activeAdmin");
  window.location.href = "admin-login.html";
}

// ==================== STATS & CRUD FUNCTIONS ====================

async function fetchStats() {
  try {
    const res = await fetch('/api/admin/stats');
    const data = await res.json();

    const studentElem = document.getElementById("totalStudents");
    const teacherElem = document.getElementById("totalTeachers") || document.getElementById("totalFaculty");
    const presentElem = document.getElementById("todayPresent");
    const absentElem = document.getElementById("todayAbsent");

    if (studentElem) studentElem.innerText = data.totalStudents ?? 0;
    if (teacherElem) teacherElem.innerText = data.totalTeachers ?? 0;
    if (presentElem) presentElem.innerText = data.todayPresent ?? 0;
    if (absentElem) absentElem.innerText = data.todayAbsent ?? 0;
  } catch (err) {
    console.error("Failed to fetch admin stats:", err);
  }
}

async function addTeacher(e) {
  e.preventDefault();
  
  const payload = {
    teacher_id: document.getElementById("t_id").value.trim(),
    full_name: document.getElementById("t_name").value.trim(),
    email: document.getElementById("t_email").value.trim(),
    phone: document.getElementById("t_phone").value.trim(),
    password_hash: document.getElementById("t_pass").value.trim(),
    dept_code: document.getElementById("t_dept").value.trim()
  };

  try {
    const res = await fetch(`${API_BASE}/teachers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (res.ok) {
      alert("✅ Faculty added successfully!");
      document.getElementById("addTeacherForm").reset();
      fetchStats();
      loadTeachersTable();
    } else {
      alert("Error: " + (result.error || result.message));
    }
  } catch (err) {
    alert("Network error adding faculty.");
  }
}

async function loadTeachersTable() {
  try {
    const res = await fetch('/api/admin/teachers-list');
    const teachers = await res.json();
    const tbody = document.getElementById("teachersTableBody");
    if (!tbody) return;

    tbody.innerHTML = teachers.map(t => `
      <tr>
        <td><b>${t.teacher_id}</b></td>
        <td>${t.full_name}</td>
        <td>${t.email || '-'}</td>
        <td>${t.phone || '-'}</td>
        <td>${t.dept_code}</td>
        <td>
          <button onclick="editTeacher('${t.teacher_id}', '${escapeQuotes(t.full_name)}', '${escapeQuotes(t.email)}', '${t.phone || ''}', '${t.dept_code}')" class="btn" style="padding:4px 8px; font-size:0.8rem;">✏️ Edit</button>
          <button onclick="deleteTeacher('${t.teacher_id}')" class="btn btn-danger" style="padding:4px 8px; font-size:0.8rem;">🗑️ Delete</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error("Error loading teachers:", err);
  }
}

async function editTeacher(teacher_id, oldName, oldEmail, oldPhone, oldDept) {
  const full_name = prompt("Update Full Name:", oldName);
  if (full_name === null) return;
  const email = prompt("Update Email:", oldEmail);
  if (email === null) return;
  const phone = prompt("Update Phone Number:", oldPhone);
  if (phone === null) return;
  const dept_code = prompt("Update Dept Code:", oldDept);
  if (dept_code === null) return;

  try {
    const res = await fetch(`${API_BASE}/teachers/update`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacher_id, full_name, email, phone, dept_code })
    });
    const result = await res.json();
    if (result.success) {
      alert("✅ Faculty updated successfully!");
      loadTeachersTable();
    } else {
      alert("Error: " + result.message);
    }
  } catch (err) {
    alert("Failed to update faculty.");
  }
}

async function deleteTeacher(teacher_id) {
  if (!confirm(`Are you sure you want to delete Faculty ID: ${teacher_id}?`)) return;

  try {
    const res = await fetch(`${API_BASE}/teachers/delete?teacher_id=${encodeURIComponent(teacher_id)}`, {
      method: "DELETE"
    });
    const result = await res.json();
    if (result.success) {
      alert("✅ Faculty deleted successfully!");
      fetchStats();
      loadTeachersTable();
    } else {
      alert("Error: " + result.message);
    }
  } catch (err) {
    alert("Failed to delete faculty.");
  }
}

async function addStudent(e) {
  e.preventDefault();
  const payload = {
    roll_no: document.getElementById("s_roll").value.trim(),
    full_name: document.getElementById("s_name").value.trim(),
    dept_code: document.getElementById("s_dept").value.trim(),
    parent_phone: document.getElementById("s_phone").value.trim()
  };

  try {
    const res = await fetch(`${API_BASE}/students`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (res.ok) {
      alert("✅ Student added successfully!");
      document.getElementById("addStudentForm").reset();
      fetchStats();
      loadStudentsTable();
    } else {
      alert("Error: " + (result.error || result.message));
    }
  } catch (err) {
    alert("Network error adding student.");
  }
}

async function loadStudentsTable() {
  try {
    const res = await fetch('/api/admin/students-list');
    const students = await res.json();
    const tbody = document.getElementById("studentsTableBody");
    if (!tbody) return;

    tbody.innerHTML = students.map(s => `
      <tr>
        <td><b>${s.roll_no}</b></td>
        <td>${s.full_name}</td>
        <td>${s.parent_phone}</td>
        <td>${s.dept_code}</td>
        <td>${s.year_level}</td>
        <td>${s.section}</td>
        <td>
          <button onclick="editStudent('${s.roll_no}', '${escapeQuotes(s.full_name)}', '${s.parent_phone}', '${s.dept_code}', '${s.year_level}', '${s.section}')" class="btn" style="padding:4px 8px; font-size:0.8rem;">✏️ Edit</button>
          <button onclick="deleteStudent('${s.roll_no}', '${s.dept_code}')" class="btn btn-danger" style="padding:4px 8px; font-size:0.8rem;">🗑️ Delete</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error("Error loading students:", err);
  }
}

async function editStudent(roll_no, oldName, oldPhone, dept_code, oldYear, oldSec) {
  const full_name = prompt("Update Full Name:", oldName);
  if (full_name === null) return;
  const parent_phone = prompt("Update Parent Phone:", oldPhone);
  if (parent_phone === null) return;
  const year_level = prompt("Update Year Level:", oldYear);
  if (year_level === null) return;
  const section = prompt("Update Section:", oldSec);
  if (section === null) return;

  try {
    const res = await fetch(`${API_BASE}/students/update`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roll_no, full_name, parent_phone, dept_code, year_level, section })
    });
    const result = await res.json();
    if (result.success) {
      alert("✅ Student updated successfully!");
      loadStudentsTable();
    } else {
      alert("Error: " + result.message);
    }
  } catch (err) {
    alert("Failed to update student.");
  }
}

async function deleteStudent(roll_no, dept_code) {
  if (!confirm(`Are you sure you want to delete Student Roll No: ${roll_no}?`)) return;

  try {
    const res = await fetch(`/api/students/delete?roll_no=${encodeURIComponent(roll_no)}&dept_code=${encodeURIComponent(dept_code)}`, {
      method: "DELETE"
    });
    const result = await res.json();
    if (result.success) {
      alert("✅ Student deleted successfully!");
      fetchStats();
      loadStudentsTable();
    } else {
      alert("Error: " + result.message);
    }
  } catch (err) {
    alert("Failed to delete student.");
  }
}

function escapeQuotes(str) {
  return (str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}


function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  const icon = btn.querySelector("i");
  if (input.type === "password") {
    input.type = "text";
    icon.className = "fa-solid fa-eye-slash";
  } else {
    input.type = "password";
    icon.className = "fa-solid fa-eye";
  }
}