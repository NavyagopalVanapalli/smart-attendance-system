const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// DATABASE CONNECTION
// ==========================================
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'Haveaniceday@1', // ⚠️ Replace with your actual MySQL Workbench password
  database: 'defaultdb'
});

db.connect((err) => {
  if (err) {
    console.error('❌ Database connection failed:', err.stack);
    return;
  }
  console.log('⚡ Connected to MySQL Database: defaultdb');
});

// ==========================================
// 1. FACULTY / TEACHER ENDPOINTS
// ==========================================

// Teacher Login
app.post('/api/teacher/login', (req, res) => {
  const { teacherId, password } = req.body;
  const sql = 'SELECT teacher_id, full_name, email, dept_code FROM teachers WHERE (teacher_id = ? OR email = ?) AND password_hash = ?';

  db.query(sql, [teacherId, teacherId, password], (err, results) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    if (results.length > 0) {
      res.json({ success: true, teacher: results[0] });
    } else {
      res.status(401).json({ success: false, message: 'Invalid Faculty Credentials!' });
    }
  });
});

// Fetch Students by Department, Year, and Section
app.get('/api/students', (req, res) => {
  const { dept_code, year_level, section } = req.query;

  let sql = 'SELECT roll_no, full_name, parent_phone, dept_code, year_level, section FROM students WHERE 1=1';
  const params = [];

  if (dept_code) { sql += ' AND dept_code = ?'; params.push(dept_code); }
  if (year_level) { sql += ' AND year_level = ?'; params.push(year_level); }
  if (section) { sql += ' AND section = ?'; params.push(section); }

  sql += ' ORDER BY roll_no ASC';

  db.query(sql, params, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// Submit / Mark Hourly Attendance
app.post('/api/attendance/mark', (req, res) => {
  const { attendanceData, teacher_id, dept_code, hour, date } = req.body;

  if (!attendanceData || !teacher_id || !dept_code || !hour || !date) {
    return res.status(400).json({ success: false, message: 'Missing required attendance parameters.' });
  }

  // Prepare batch insert values
  const values = attendanceData.map(item => [
    item.roll_no,
    dept_code,
    hour,
    date,
    item.status,
    teacher_id
  ]);

  const sql = `
    INSERT INTO attendance (roll_no, dept_code, hour, date, status, teacher_id)
    VALUES ?
    ON DUPLICATE KEY UPDATE status = VALUES(status), teacher_id = VALUES(teacher_id)
  `;

  db.query(sql, [values], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, message: 'Attendance submitted successfully!' });
  });
});


// ==========================================
// 2. ADMIN DASHBOARD ENDPOINTS
// ==========================================

// Admin Login
app.post('/api/admin/login', (req, res) => {
  const { adminId, password } = req.body;
  const sql = 'SELECT admin_id, full_name, email FROM admins WHERE (admin_id = ? OR email = ?) AND password_hash = ?';
  
  db.query(sql, [adminId, adminId, password], (err, results) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    if (results.length > 0) {
      res.json({ success: true, admin: results[0] });
    } else {
      res.status(401).json({ success: false, message: 'Invalid Admin Credentials!' });
    }
  });
});

// Get All Teachers
app.get('/api/admin/teachers', (req, res) => {
  db.query('SELECT teacher_id, full_name, email, dept_code, created_at FROM teachers', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// Add New Teacher / Faculty
app.post('/api/admin/teachers/add', (req, res) => {
  const { teacher_id, full_name, email, dept_code, password } = req.body;
  if (!teacher_id || !full_name || !email || !dept_code || !password) {
    return res.status(400).json({ success: false, message: 'All fields are required.' });
  }

  const sql = 'INSERT INTO teachers (teacher_id, full_name, email, password_hash, dept_code) VALUES (?, ?, ?, ?, ?)';
  db.query(sql, [teacher_id, full_name, email, password, dept_code], (err) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, message: 'Teacher added successfully!' });
  });
});

// Delete Teacher
app.delete('/api/admin/teachers/delete', (req, res) => {
  const { teacher_id } = req.query;
  db.query('DELETE FROM teachers WHERE teacher_id = ?', [teacher_id], (err) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, message: 'Teacher deleted successfully!' });
  });
});

// Get All Classes
app.get('/api/admin/classes', (req, res) => {
  db.query('SELECT * FROM classes ORDER BY dept_code, year_level, section', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// Add Class
app.post('/api/admin/classes/add', (req, res) => {
  const { dept_code, year_level, section } = req.body;
  if (!dept_code || !year_level || !section) {
    return res.status(400).json({ success: false, message: 'All fields are required.' });
  }

  const sql = 'INSERT INTO classes (dept_code, year_level, section) VALUES (?, ?, ?)';
  db.query(sql, [dept_code, year_level, section], (err) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, message: 'Class registered successfully!' });
  });
});

// Attendance Report (Filtered by Dept and Date)
app.get('/api/admin/reports/attendance', (req, res) => {
  const { dept, date } = req.query;

  let query = `
    SELECT 
      a.date, 
      a.hour, 
      a.dept_code, 
      a.roll_no, 
      s.full_name AS student_name, 
      a.status, 
      a.teacher_id, 
      t.full_name AS teacher_name
    FROM attendance a
    JOIN students s ON a.roll_no = s.roll_no AND a.dept_code = s.dept_code
    JOIN teachers t ON a.teacher_id = t.teacher_id
    WHERE 1=1
  `;

  const params = [];

  if (dept) {
    query += ` AND a.dept_code = ?`;
    params.push(dept);
  }
  if (date) {
    query += ` AND a.date = ?`;
    params.push(date);
  }

  query += ` ORDER BY a.date DESC, a.hour ASC`;

  db.query(query, params, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// Summary Stats Overview
app.get('/api/admin/reports/summary', (req, res) => {
  const stats = {};

  db.query('SELECT COUNT(*) AS totalStudents FROM students', (err, r1) => {
    stats.totalStudents = r1 ? r1[0].totalStudents : 0;
    db.query('SELECT COUNT(*) AS totalTeachers FROM teachers', (err, r2) => {
      stats.totalTeachers = r2 ? r2[0].totalTeachers : 0;
      db.query('SELECT COUNT(*) AS totalClasses FROM classes', (err, r3) => {
        stats.totalClasses = r3 ? r3[0].totalClasses : 0;
        db.query('SELECT status, COUNT(*) as count FROM attendance WHERE date = CURDATE() GROUP BY status', (err, r4) => {
          stats.todayPresent = 0;
          stats.todayAbsent = 0;
          if (r4) {
            r4.forEach(row => {
              if (row.status === 'Present') stats.todayPresent = row.count;
              if (row.status === 'Absent') stats.todayAbsent = row.count;
            });
          }
          res.json(stats);
        });
      });
    });
  });
});

// ==========================================
// 3. PAGE ROUTES
// ==========================================

// Serve Admin Dashboard Page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Serve Main Faculty Page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// START SERVER
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`🔑 Admin Panel at http://localhost:${PORT}/admin`);
});