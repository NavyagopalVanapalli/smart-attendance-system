const API_BASE_URL = `${window.location.origin}/api`;

function switchTab(tabName) {
  document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

  event.currentTarget.classList.add("active");
  document.getElementById(`tab-${tabName}`).classList.add("active");
}

document.addEventListener("DOMContentLoaded", () => {
  const adminLoginBtn = document.getElementById("adminLoginBtn");
  const adminLogoutBtn = document.getElementById("adminLogoutBtn");
  const adminLoginSection = document.getElementById("adminLoginSection");
  const adminDashboardSection = document.getElementById("adminDashboardSection");

  // LOGIN
  if (adminLoginBtn) {
    adminLoginBtn.addEventListener("click", async () => {
      const adminId = document.getElementById("adminId").value.trim();
      const password = document.getElementById("adminPassword").value.trim();

      const res = await fetch(`${API_BASE_URL}/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminId, password })
      });

      const data = await res.json();
      if (data.success) {
        sessionStorage.setItem("activeAdmin", JSON.stringify(data.admin));
        loadDashboard();
      } else {
        alert(data.message);
      }
    });
  }

  // LOGOUT
  if (adminLogoutBtn) {
    adminLogoutBtn.addEventListener("click", () => {
      sessionStorage.removeItem("activeAdmin");
      location.reload();
    });
  }

  function loadDashboard() {
    adminLoginSection.classList.add("hidden");
    adminDashboardSection.classList.remove("hidden");
    adminLogoutBtn.classList.remove("hidden");

    fetchSummary();
    fetchTeachers();
    fetchClasses();
  }

  // OVERVIEW STATS
  async function fetchSummary() {
    const res = await fetch(`${API_BASE_URL}/admin/reports/summary`);
    const data = await res.json();

    document.getElementById("statStudents").textContent = data.totalStudents || 0;
    document.getElementById("statTeachers").textContent = data.totalTeachers || 0;
    document.getElementById("statClasses").textContent = data.totalClasses || 0;
    document.getElementById("statPresent").textContent = data.todayPresent || 0;
    document.getElementById("statAbsent").textContent = data.todayAbsent || 0;
  }

  // FETCH TEACHERS
  async function fetchTeachers() {
    const res = await fetch(`${API_BASE_URL}/admin/teachers`);
    const teachers = await res.json();

    const tbody = document.getElementById("teacherTableBody");
    tbody.innerHTML = "";

    teachers.forEach(t => {
      tbody.innerHTML += `
        <tr>
          <td>${t.teacher_id}</td>
          <td>${t.full_name}</td>
          <td>${t.email}</td>
          <td>${t.dept_code}</td>
          <td>
            <button onclick="deleteTeacher('${t.teacher_id}')" class="btn btn-danger" style="padding: 2px 6px;">Delete</button>
          </td>
        </tr>
      `;
    });
  }

  // ADD TEACHER
  document.getElementById("addTeacherBtn").addEventListener("click", async () => {
    const teacher_id = document.getElementById("facId").value.trim();
    const full_name = document.getElementById("facName").value.trim();
    const email = document.getElementById("facEmail").value.trim();
    const dept_code = document.getElementById("facDept").value.trim();
    const password = document.getElementById("facPass").value.trim();

    const res = await fetch(`${API_BASE_URL}/admin/teachers/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacher_id, full_name, email, dept_code, password })
    });

    const data = await res.json();
    if (data.success) {
      alert("Faculty Added!");
      fetchTeachers();
    } else {
      alert(data.message);
    }
  });

  window.deleteTeacher = async (id) => {
    if (confirm(`Delete Faculty ${id}?`)) {
      await fetch(`${API_BASE_URL}/admin/teachers/delete?teacher_id=${id}`, { method: "DELETE" });
      fetchTeachers();
    }
  };

  // CLASSES MANAGEMENT
  async function fetchClasses() {
    const res = await fetch(`${API_BASE_URL}/admin/classes`);
    const classes = await res.json();

    const tbody = document.getElementById("classTableBody");
    tbody.innerHTML = "";

    classes.forEach(c => {
      tbody.innerHTML += `
        <tr>
          <td>${c.class_id}</td>
          <td>${c.dept_code}</td>
          <td>${c.year_level}</td>
          <td>${c.section}</td>
        </tr>
      `;
    });
  }

  document.getElementById("addClassBtn").addEventListener("click", async () => {
    const dept_code = document.getElementById("clsDept").value.trim();
    const year_level = document.getElementById("clsYear").value.trim();
    const section = document.getElementById("clsSec").value.trim();

    const res = await fetch(`${API_BASE_URL}/admin/classes/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dept_code, year_level, section })
    });

    const data = await res.json();
    if (data.success) {
      alert("Class Created!");
      fetchClasses();
    } else {
      alert(data.message);
    }
  });

  // REPORTS & CSV EXPORT
  let currentReportData = [];

  document.getElementById("fetchReportBtn").addEventListener("click", async () => {
    const dept = document.getElementById("repDept").value.trim();
    const date = document.getElementById("repDate").value;

    const res = await fetch(`${API_BASE_URL}/admin/reports/attendance?dept=${encodeURIComponent(dept)}&date=${date}`);
    currentReportData = await res.json();

    const tbody = document.getElementById("reportTableBody");
    tbody.innerHTML = "";

    currentReportData.forEach(r => {
      tbody.innerHTML += `
        <tr>
          <td>${r.date}</td>
          <td>${r.hour}</td>
          <td>${r.dept_code}</td>
          <td>${r.roll_no}</td>
          <td>${r.student_name}</td>
          <td>${r.status}</td>
          <td>${r.teacher_id}</td>
        </tr>
      `;
    });
  });

  document.getElementById("exportCsvBtn").addEventListener("click", () => {
    if (currentReportData.length === 0) return alert("No report loaded!");

    let csv = "Date,Hour,Dept,Roll No,Student Name,Status,Teacher ID\n";
    currentReportData.forEach(r => {
      csv += `"${r.date}","${r.hour}","${r.dept_code}","${r.roll_no}","${r.student_name}","${r.status}","${r.teacher_id}"\n`;
    });

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Attendance_Report.csv";
    a.click();
  });

  if (sessionStorage.getItem("activeAdmin")) {
    loadDashboard();
  }
});