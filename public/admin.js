const API_BASE = "http://localhost:5000/api/admin";

// Load Metrics on Page Load
document.addEventListener("DOMContentLoaded", () => {
  fetchStats();
});

async function fetchStats() {
  try {
    const res = await fetch(`${API_BASE}/stats`);
    const data = await res.json();
    
    document.getElementById("stat-students").innerText = data.totalStudents || 0;
    document.getElementById("stat-teachers").innerText = data.totalTeachers || 0;
    document.getElementById("stat-present").innerText = data.todayPresent || 0;
    document.getElementById("stat-absent").innerText = data.todayAbsent || 0;
  } catch (err) {
    alert("Error fetching admin stats. Is node server running?");
  }
}

function downloadCSV() {
  window.open(`${API_BASE}/export-attendance`, '_blank');
}

async function addTeacher(e) {
  e.preventDefault();
  const payload = {
    teacher_id: document.getElementById("t_id").value,
    full_name: document.getElementById("t_name").value,
    email: document.getElementById("t_email").value,
    dept_code: document.getElementById("t_dept").value
  };

  const res = await fetch(`${API_BASE}/teachers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const result = await res.json();
  if (res.ok) {
    alert("Faculty added successfully!");
    document.getElementById("addTeacherForm").reset();
    fetchStats();
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