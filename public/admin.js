const API_BASE = "http://localhost:5000/api/admin";

// Load Metrics on Page Load
document.addEventListener("DOMContentLoaded", () => {
  fetchStats();
});

async function fetchStats() {
  try {
    const res = await fetch('/api/admin/stats');
    const data = await res.json();

    console.log("Stats received from server:", data);

    // Explicitly update each card if the element exists
    const studentElem = document.getElementById("totalStudents");
    const teacherElem = document.getElementById("totalTeachers") || document.getElementById("totalFaculty"); // Checks both common ID names
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

// Ensure stats load on start
document.addEventListener("DOMContentLoaded", fetchStats);

// Call on page load
document.addEventListener("DOMContentLoaded", fetchStats);
function downloadCSV() {
  window.open(`${API_BASE}/export-attendance`, '_blank');
}

async function addTeacher(e) {
  e.preventDefault();
  
  const payload = {
    teacher_id: document.getElementById("t_id").value.trim(),
    full_name: document.getElementById("t_name").value.trim(),
    email: document.getElementById("t_email").value.trim(),
    password_hash: document.getElementById("t_pass").value.trim(), // Passes custom password if entered
    dept_code: document.getElementById("t_dept").value.trim()
  };

  const res = await fetch(`${API_BASE}/teachers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const result = await res.json();
  // Inside your addTeacher form submission success block:
if (res.ok && data.success) {
  alert("✅ Faculty added successfully!");
  document.getElementById("addTeacherForm").reset();
  
  // Force fetch updated stats or reload list:
  if (typeof fetchStats === "function") fetchStats();
  
  // Or simply reload the page to see updated tables:
  location.reload(); 
} else {
    alert("Error: " + result.error);
  }
}



async function addStudent(e) {
  e.preventDefault();
  const payload = {
    roll_no: document.getElementById("s_roll").value,
    full_name: document.getElementById("s_name").value,
    dept_code: document.getElementById("s_dept").value,
    parent_phone: document.getElementById("s_phone").value
  };

  const res = await fetch(`${API_BASE}/students`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const result = await res.json();
  if (res.ok) {
    alert("Student added successfully!");
    document.getElementById("addStudentForm").reset();
    fetchStats();
  } else {
    alert("Error: " + result.error);
  }
}


// Fetch and render Teachers Table
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
        <td>${t.email}</td>
        <td>${t.dept_code}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error("Error loading teachers:", err);
  }
}

// Fetch and render Students Table
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
      </tr>
    `).join('');
  } catch (err) {
    console.error("Error loading students:", err);
  }
}

// Automatically load tables on page load
document.addEventListener("DOMContentLoaded", () => {
  loadTeachersTable();
  loadStudentsTable();
});

