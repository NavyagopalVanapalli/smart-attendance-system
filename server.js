require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();

// Middlewares
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'PUT', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Twilio Setup
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM;

let twilioClient = null;
if (TWILIO_SID && TWILIO_AUTH) {
  const twilio = require('twilio');
  twilioClient = twilio(TWILIO_SID, TWILIO_AUTH);
  console.log('✅ Twilio WhatsApp client initialized.');
} else {
  console.log('⚠️ Twilio credentials not set — WhatsApp messages will be SIMULATED.');
}

async function sendWhatsAppMessage(phoneNumber, message) {
  const toNumber = `whatsapp:+91${phoneNumber}`;

  if (!twilioClient) {
    console.log(`[WhatsApp Simulated] To ${toNumber}: ${message}`);
    return { simulated: true, success: true };
  }

  try {
    const result = await twilioClient.messages.create({
      from: TWILIO_WHATSAPP_FROM,
      to: toNumber,
      body: message
    });
    return { simulated: false, success: true, sid: result.sid };
  } catch (err) {
    console.error(`❌ WhatsApp send failed for ${toNumber}:`, err.message);
    return { simulated: false, success: false, error: err.message };
  }
}

// MYSQL POOL CREATION (Promise-based)
const db = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'Haveaniceday@1',
  database: process.env.DB_NAME || 'defaultdb',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: process.env.DB_HOST && process.env.DB_HOST !== 'localhost' 
    ? { rejectUnauthorized: false } 
    : false
});

// AUTO-CREATE TABLES ON STARTUP
async function initDB() {
  try {
    const connection = await db.getConnection();
    console.log("⚡ Connected to MySQL. Ensuring tables exist...");

    // 1. ADMINS TABLE
   await connection.query(`
  CREATE TABLE IF NOT EXISTS teachers (
    teacher_id VARCHAR(50) PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    phone VARCHAR(15),
    password_hash VARCHAR(255) NOT NULL,
    dept_code VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`);

    // Create default admin if table is empty
    const [existingAdmins] = await connection.query('SELECT * FROM admins LIMIT 1');
    if (existingAdmins.length === 0) {
      await connection.query(`
        INSERT INTO admins (admin_id, full_name, email, password_hash) 
        VALUES ('admin', 'System Administrator', 'admin@college.edu', 'admin123');
      `);
      console.log("✅ Default admin account created (User: admin / Pass: admin123)");
    }

    // 2. TEACHERS TABLE
    await connection.query(`
      CREATE TABLE IF NOT EXISTS teachers (
        teacher_id VARCHAR(50) PRIMARY KEY,
        full_name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        dept_code VARCHAR(20) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. STUDENTS TABLE
    await connection.query(`
      CREATE TABLE IF NOT EXISTS students (
        roll_no VARCHAR(50) NOT NULL,
        full_name VARCHAR(100) NOT NULL,
        parent_phone VARCHAR(15) NOT NULL,
        dept_code VARCHAR(20) NOT NULL,
        year_level VARCHAR(20) NOT NULL,
        section VARCHAR(20) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (roll_no, dept_code)
      );
    `);

    // 4. ATTENDANCE TABLE
    await connection.query(`
      CREATE TABLE IF NOT EXISTS attendance (
        id INT AUTO_INCREMENT PRIMARY KEY,
        roll_no VARCHAR(50) NOT NULL,
        dept_code VARCHAR(20) NOT NULL,
        hour VARCHAR(100) NOT NULL,
        date DATE NOT NULL,
        status ENUM('Present', 'Absent') NOT NULL,
        teacher_id VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_attendance_entry (roll_no, dept_code, hour, date)
      );
    `);

    console.log("✅ All database tables verified and ready!");
    connection.release();
  } catch (err) {
    console.error("❌ Database Initialization Error:", err.message);
  }
}
initDB();

// HAVERSINE FORMULA (GPS Distance Calculation)
function getDistanceInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * rad) * Math.cos(lat2 * rad) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
            
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ==================== ADMIN AUTHENTICATION ====================

// ADMIN LOGIN API
app.post('/api/admin/login', async (req, res) => {
  const { adminId, password } = req.body;

  if (!adminId || !password) {
    return res.status(400).json({ success: false, message: 'Admin ID and Password are required.' });
  }

  const sql = 'SELECT admin_id, full_name, email FROM admins WHERE (admin_id = ? OR email = ?) AND password_hash = ?';
  
  try {
    const [results] = await db.query(sql, [adminId.trim(), adminId.trim(), password.trim()]);
    if (results.length > 0) {
      res.json({ success: true, admin: results[0] });
    } else {
      res.status(401).json({ success: false, message: 'Invalid Admin Credentials!' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== FACULTY & USER ROUTES ====================

// TEACHER LOGIN API
app.post('/api/login', async (req, res) => {
  const { teacherId, password } = req.body;
  const sql = 'SELECT teacher_id, full_name, email, dept_code FROM teachers WHERE teacher_id = ? AND password_hash = ?';
  
  try {
    const [results] = await db.query(sql, [teacherId, password]);
    if (results.length > 0) {
      res.json({ success: true, teacher: results[0] });
    } else {
      res.status(401).json({ success: false, message: 'Invalid Faculty ID or Password!' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// RESET / FORGOT PASSWORD ENDPOINT
app.post('/api/reset-password', async (req, res) => {
  const { teacherId, newPassword } = req.body;

  if (!teacherId || !newPassword) {
    return res.status(400).json({ success: false, message: 'All fields are required.' });
  }

  const query = 'UPDATE teachers SET password_hash = ? WHERE teacher_id = ?';
  try {
    const [results] = await db.query(query, [newPassword, teacherId]);
    if (results.affectedRows > 0) {
      res.json({ success: true, message: 'Password updated successfully!' });
    } else {
      res.json({ success: false, message: 'Faculty ID not found.' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'Database query failed.' });
  }
});

// CHANGE TEACHER PASSWORD API
app.post('/api/change-password', async (req, res) => {
  const { teacherId, currentPassword, newPassword } = req.body;

  try {
    const verifySql = 'SELECT * FROM teachers WHERE teacher_id = ? AND password_hash = ?';
    const [results] = await db.query(verifySql, [teacherId, currentPassword]);

    if (results.length === 0) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect!' });
    }

    const updateSql = 'UPDATE teachers SET password_hash = ? WHERE teacher_id = ?';
    await db.query(updateSql, [newPassword, teacherId]);
    res.json({ success: true, message: 'Password updated successfully!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET STUDENTS BY DEPARTMENT, YEAR, SECTION
app.get('/api/students', async (req, res) => {
  const { dept, year, section } = req.query;
  const sql = 'SELECT * FROM students WHERE dept_code = ? AND year_level = ? AND section = ?';
  
  try {
    const [results] = await db.query(sql, [dept, year, section]);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET REAL-TIME ATTENDANCE STATUS
app.get('/api/attendance/live', async (req, res) => {
  const { dept, hour, date, teacherId } = req.query;

  let query = `
    SELECT roll_no, status 
    FROM attendance 
    WHERE dept_code = ? 
      AND hour = ? 
      AND date = ? 
      AND status = 'Present'
  `;
  const params = [dept, hour, date];

  if (teacherId) {
    query += ` AND teacher_id = ?`;
    params.push(teacherId);
  }

  try {
    const [results] = await db.query(query, params);
    res.json(results);
  } catch (err) {
    console.error("Error fetching live attendance:", err);
    res.status(500).json({ error: "Database query failed" });
  }
});

// ADD NEW STUDENT API
app.post('/api/students/add', async (req, res) => {
  const { roll_no, full_name, parent_phone, dept_code, year_level, section } = req.body;

  if (!roll_no || !full_name || !parent_phone) {
    return res.status(400).json({ success: false, message: "Missing required fields." });
  }

  try {
    const checkSql = 'SELECT * FROM students WHERE roll_no = ? AND dept_code = ?';
    const [results] = await db.query(checkSql, [roll_no, dept_code]);

    if (results.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Roll No ${roll_no} already exists in ${dept_code} department!` 
      });
    }

    const insertSql = `INSERT INTO students (roll_no, full_name, parent_phone, dept_code, year_level, section) VALUES (?, ?, ?, ?, ?, ?)`;
    await db.query(insertSql, [roll_no, full_name, parent_phone, dept_code, year_level, section]);
    res.json({ success: true, message: "Student added successfully!" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// SAVE ATTENDANCE RECORD
app.post('/api/attendance/submit', async (req, res) => {
  const { date, hour, teacherId, dept, records } = req.body;

  if (!records || records.length === 0) {
    return res.status(400).json({ success: false, message: "No attendance records provided." });
  }

  const query = `
    INSERT INTO attendance (roll_no, hour, date, status, teacher_id, dept_code) 
    VALUES ? 
    ON DUPLICATE KEY UPDATE status=VALUES(status), teacher_id=VALUES(teacher_id)
  `;
  
  const values = records.map(r => [r.roll_no, hour, date, r.status, teacherId, dept]);

  try {
    await db.query(query, [values]);
    res.json({ success: true, message: "Attendance saved successfully!" });
  } catch (err) {
    console.error("Database save error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// SEND DEDICATED WHATSAPP MESSAGE TO PARENT
app.post('/api/send-whatsapp', async (req, res) => {
  const { parentPhone, message } = req.body;

  if (!parentPhone || !message) {
    return res.status(400).json({ success: false, message: "parentPhone and message are required." });
  }

  const result = await sendWhatsAppMessage(parentPhone, message);

  if (result.success) {
    res.json({ success: true, simulated: result.simulated });
  } else {
    res.status(500).json({ success: false, message: result.error });
  }
});

// MULTI-SESSION QR CODE GENERATOR ENDPOINT
let activeQrSessions = {};

app.post('/api/qr/generate-location', (req, res) => {
  const { dept, year, section, hour, date, teacherLat, teacherLng, teacherId } = req.body;
  
  const cleanHour = hour.split(' ')[0];
  const sessionId = `${dept}_${year.replace(/\s+/g, '')}_${section.replace(/\s+/g, '')}_${cleanHour}_${date}`;

  activeQrSessions[sessionId] = {
    dept, year, section, hour, date,
    teacherId: teacherId || 'FAC101',
    lat: parseFloat(teacherLat),
    lng: parseFloat(teacherLng),
    expiresAt: Date.now() + (10 * 60 * 1000)
  };

  res.json({ 
    success: true, 
    sessionId: sessionId,
    qrPayload: JSON.stringify({ sessionId, dept, section, hour, date, time: Date.now() })
  });
});

// STUDENT QR ATTENDANCE VERIFICATION
app.post('/api/qr/verify-student', async (req, res) => {
  const { rollNo, studentLat, studentLng, sessionId } = req.body;

  const session = activeQrSessions[sessionId];

  if (!session || !session.expiresAt) {
    return res.status(400).json({ success: false, message: "No active QR session found for this class! Ask teacher to generate QR." });
  }

  if (Date.now() > session.expiresAt) {
    return res.status(400).json({ success: false, message: "QR Code has expired! Ask teacher to regenerate." });
  }

  const distance = getDistanceInMeters(
    session.lat,
    session.lng,
    parseFloat(studentLat),
    parseFloat(studentLng)
  );

  const MAX_RADIUS_METERS = 500; 

  if (distance > MAX_RADIUS_METERS) {
    return res.status(403).json({ 
      success: false, 
      message: `Location verification failed! You are ${Math.round(distance)}m away from classroom.` 
    });
  }

  try {
    const verifyStudentSql = `SELECT full_name FROM students WHERE roll_no = ? AND dept_code = ?`;
    const [studentResults] = await db.query(verifyStudentSql, [rollNo, session.dept]);
    
    if (studentResults.length === 0) {
      return res.status(400).json({ success: false, message: `Roll No ${rollNo} is not registered in ${session.dept} department!` });
    }

    const studentName = studentResults[0].full_name;
    const sql = `INSERT INTO attendance (date, hour, teacher_id, roll_no, dept_code, status) 
                 VALUES (?, ?, ?, ?, ?, 'Present') 
                 ON DUPLICATE KEY UPDATE status='Present'`;

    await db.query(sql, [session.date, session.hour, session.teacherId, rollNo, session.dept]);

    res.json({ 
      success: true, 
      message: `✅ Attendance marked Present for ${studentName} (${rollNo})!` 
    });
  } catch (err) {
    console.error("Database error during QR attendance:", err);
    res.status(500).json({ success: false, message: "Database error recording attendance." });
  }
});

// DELETE STUDENT ENDPOINT
app.delete('/api/students/delete', async (req, res) => {
  const { roll_no, dept_code } = req.query;

  if (!roll_no || !dept_code) {
    return res.status(400).json({ success: false, message: "Missing roll number or department code." });
  }

  try {
    const deleteSql = 'DELETE FROM students WHERE roll_no = ? AND dept_code = ?';
    const [result] = await db.query(deleteSql, [roll_no, dept_code]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Student not found." });
    }

    res.json({ success: true, message: "Student deleted successfully!" });
  } catch (err) {
    console.error("Database error during delete:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== ADMIN API ENDPOINTS ====================

// 1. Get High-Level Dashboard Statistics
app.get('/api/admin/stats', async (req, res) => {
  try {
    const [[studentsCount]] = await db.query("SELECT COUNT(*) AS totalStudents FROM students");
    const [[teachersCount]] = await db.query("SELECT COUNT(*) AS totalTeachers FROM teachers");

    const today = new Date().toISOString().split('T')[0];
    let presentCount = 0;
    let absentCount = 0;

    try {
      const [[p]] = await db.query("SELECT COUNT(*) AS total FROM attendance WHERE status = 'Present' AND DATE(date) = ?", [today]);
      const [[a]] = await db.query("SELECT COUNT(*) AS total FROM attendance WHERE status = 'Absent' AND DATE(date) = ?", [today]);
      presentCount = p.total || 0;
      absentCount = a.total || 0;
    } catch (attErr) {
      presentCount = 0;
      absentCount = 0;
    }

    res.json({
      totalStudents: studentsCount.totalStudents || 0,
      totalTeachers: teachersCount.totalTeachers || 0,
      todayPresent: presentCount,
      todayAbsent: absentCount
    });

  } catch (err) {
    console.error("Error fetching stats:", err);
    res.status(500).json({ error: err.message });
  }
});

// 2. Export All Attendance Records as CSV
app.get('/api/admin/export-attendance', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        a.id, a.date, a.hour, a.roll_no, s.full_name AS student_name, 
        a.dept_code, a.status, a.teacher_id 
      FROM attendance a
      LEFT JOIN students s ON a.roll_no = s.roll_no AND a.dept_code = s.dept_code
      ORDER BY a.date DESC, a.hour ASC
    `);

    let csvContent = "ID,Date,Hour,Roll No,Student Name,Department,Status,Teacher ID\n";
    rows.forEach(r => {
      const formattedDate = r.date ? new Date(r.date).toISOString().split('T')[0] : '';
      csvContent += `"${r.id}","${formattedDate}","${r.hour}","${r.roll_no}","${r.student_name || ''}","${r.dept_code}","${r.status}","${r.teacher_id}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="attendance_report.csv"');
    res.status(200).send(csvContent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Add a New Teacher
app.post('/api/admin/teachers', async (req, res) => {
  const { teacher_id, full_name, email, phone, dept_code, password_hash } = req.body;
  
  if (!teacher_id || !full_name || !dept_code) {
    return res.status(400).json({ error: "Missing required teacher fields (ID, Name, or Dept)." });
  }

  const teacherEmail = email && email.trim() !== '' 
    ? email.trim() 
    : `${teacher_id.toLowerCase()}@college.edu`;
    
  const teacherPassword = password_hash && password_hash.trim() !== '' 
    ? password_hash.trim() 
    : 'admin123';

  try {
    await db.query(
      "INSERT INTO teachers (teacher_id, full_name, email, phone, dept_code, password_hash) VALUES (?, ?, ?, ?, ?, ?)",
      [teacher_id.trim(), full_name.trim(), teacherEmail, phone ? phone.trim() : null, dept_code.trim(), teacherPassword]
    );
    res.json({ success: true, message: "Faculty added successfully!" });
  } catch (err) {
    console.error("SQL Error during Add Teacher:", err);
    res.status(500).json({ error: err.message });
  }
});

// 4. Add a New Student
app.post('/api/admin/students', async (req, res) => {
  const { roll_no, full_name, parent_phone, dept_code, year_level, section } = req.body;
  if (!roll_no || !full_name || !dept_code) {
    return res.status(400).json({ error: "Missing required student fields." });
  }
  try {
    await db.query(
      "INSERT INTO students (roll_no, full_name, parent_phone, dept_code, year_level, section) VALUES (?, ?, ?, ?, ?, ?)",
      [
        roll_no.trim(),
        full_name.trim(),
        parent_phone ? parent_phone.trim() : '0000000000',
        dept_code.trim(),
        year_level ? year_level.trim() : '1st Year',
        section ? section.trim() : 'Sec A'
      ]
    );
    res.json({ success: true, message: "Student added successfully!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get All Faculty Members
app.get('/api/admin/teachers-list', async (req, res) => {
  try {
    const [teachers] = await db.query("SELECT teacher_id, full_name, email, phone, dept_code, created_at FROM teachers ORDER BY created_at DESC");
    res.json(teachers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get All Students
app.get('/api/admin/students-list', async (req, res) => {
  try {
    const [students] = await db.query("SELECT roll_no, full_name, parent_phone, dept_code, year_level, section FROM students ORDER BY created_at DESC");
    res.json(students);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE FACULTY / TEACHER
// 4. UPDATE TEACHER EDIT ROUTE
app.put('/api/admin/teachers/update', async (req, res) => {
  const { teacher_id, full_name, email, phone, dept_code } = req.body;
  if (!teacher_id || !full_name || !dept_code) {
    return res.status(400).json({ success: false, message: "Teacher ID, Name, and Department are required." });
  }

  try {
    const updateSql = `UPDATE teachers SET full_name = ?, email = ?, phone = ?, dept_code = ? WHERE teacher_id = ?`;
    const [result] = await db.query(updateSql, [full_name.trim(), email.trim(), phone ? phone.trim() : null, dept_code.trim(), teacher_id.trim()]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Faculty member not found." });
    }
    res.json({ success: true, message: "Faculty updated successfully!" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE FACULTY / TEACHER
app.delete('/api/admin/teachers/delete', async (req, res) => {
  const { teacher_id } = req.query;
  if (!teacher_id) {
    return res.status(400).json({ success: false, message: "Missing Teacher ID." });
  }

  try {
    const deleteSql = 'DELETE FROM teachers WHERE teacher_id = ?';
    const [result] = await db.query(deleteSql, [teacher_id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Faculty member not found." });
    }
    res.json({ success: true, message: "Faculty deleted successfully!" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// UPDATE STUDENT
app.put('/api/admin/students/update', async (req, res) => {
  const { roll_no, full_name, parent_phone, dept_code, year_level, section } = req.body;
  if (!roll_no || !full_name || !dept_code) {
    return res.status(400).json({ success: false, message: "Roll No, Name, and Dept are required." });
  }

  try {
    const updateSql = `
      UPDATE students 
      SET full_name = ?, parent_phone = ?, year_level = ?, section = ? 
      WHERE roll_no = ? AND dept_code = ?
    `;
    const [result] = await db.query(updateSql, [
      full_name.trim(),
      parent_phone ? parent_phone.trim() : '0000000000',
      year_level ? year_level.trim() : '1st Year',
      section ? section.trim() : 'Sec A',
      roll_no.trim(),
      dept_code.trim()
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Student record not found." });
    }
    res.json({ success: true, message: "Student updated successfully!" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DIAGNOSTIC ROUTE
app.get('/api/debug-db', async (req, res) => {
  try {
    const [dbName] = await db.query("SELECT DATABASE() as current_db");
    const [tables] = await db.query("SHOW TABLES");
    res.json({
      connected_database: dbName[0].current_db,
      tables_found_by_node: tables.map(t => Object.values(t)[0])
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== STATIC FILE SERVING ====================

const serveStudentPage = (req, res) => {
  const possiblePaths = [
    path.join(__dirname, 'student.html'),
    path.join(__dirname, 'Student.html'),
    path.join(__dirname, 'public', 'student.html'),
    path.join(__dirname, 'public', 'Student.html')
  ];

  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath);
    }
  }
  res.status(404).send("student.html file missing from server repository.");
};

app.get('/student', serveStudentPage);
app.get('/student.html', serveStudentPage);
app.get('/Student.html', serveStudentPage);

app.get('/', (req, res) => {
  const possibleIndexPaths = [
    path.join(__dirname, 'login.html'),
    path.join(__dirname, 'public', 'login.html')
  ];

  for (const filePath of possibleIndexPaths) {
    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath);
    }
  }
  res.status(404).send("login.html missing from server repository.");
});

// ==================== START SERVER ====================
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Attendance Backend Server running on port ${PORT}`);
});


// ==================== 2SV / OTP FORGOT PASSWORD ====================

// Temporary in-memory OTP store (In production, use Redis or DB table)
// Key: teacherId, Value: { otp, expiresAt }
let otpStore = {};

// REQUEST RESET OTP (Returns Direct WhatsApp Web Link)
app.post('/api/request-reset-otp', async (req, res) => {
  const { teacherId } = req.body;

  if (!teacherId) {
    return res.status(400).json({ success: false, message: 'Faculty ID is required.' });
  }

  try {
    const [rows] = await db.query('SELECT teacher_id, full_name, phone FROM teachers WHERE teacher_id = ?', [teacherId.trim()]);
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Faculty ID not found.' });
    }

    const teacher = rows[0];

    if (!teacher.phone) {
      return res.status(400).json({ success: false, message: 'No phone number registered for this Faculty ID. Contact Admin.' });
    }

    // Clean phone number (Ensure 91 country code prefix)
    let cleanPhone = teacher.phone.replace(/\D/g, "");
    if (cleanPhone.length === 10) cleanPhone = "91" + cleanPhone;

    // Generate random 6-digit OTP
    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store in memory for 5 minutes
    otpStore[teacher.teacher_id] = {
      otp: generatedOtp,
      expiresAt: Date.now() + (5 * 60 * 1000)
    };

    // Pre-filled WhatsApp message
    const messageText = `🔒 SmartAttend Verification Code: Your OTP for resetting password is ${generatedOtp}. Valid for 5 minutes.`;
    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(messageText)}`;

    res.json({ 
      success: true, 
      message: `OTP generated for ${teacher.full_name}! Click the link below to open WhatsApp.`,
      whatsappUrl: whatsappUrl,
      otpDebug: generatedOtp // Useful for quick testing in development
    });

  } catch (err) {
    console.error("OTP Generation Error:", err);
    res.status(500).json({ success: false, message: 'Failed to process OTP request.' });
  }
});



// 2. VERIFY OTP AND RESET PASSWORD ENDPOINT
app.post('/api/verify-otp-reset-password', async (req, res) => {
  const { teacherId, otp, newPassword } = req.body;

  if (!teacherId || !otp || !newPassword) {
    return res.status(400).json({ success: false, message: 'All fields (Faculty ID, OTP, and New Password) are required.' });
  }

  const record = otpStore[teacherId.trim()];

  if (!record) {
    return res.status(400).json({ success: false, message: 'No OTP requested or session expired. Please request a new OTP.' });
  }

  if (Date.now() > record.expiresAt) {
    delete otpStore[teacherId.trim()];
    return res.status(400).json({ success: false, message: 'OTP has expired! Please request a new code.' });
  }

  if (record.otp !== otp.trim()) {
    return res.status(400).json({ success: false, message: 'Invalid OTP code! Please check and try again.' });
  }

  try {
    const updateSql = 'UPDATE teachers SET password_hash = ? WHERE teacher_id = ?';
    await db.query(updateSql, [newPassword.trim(), teacherId.trim()]);

    // Clear used OTP
    delete otpStore[teacherId.trim()];

    res.json({ success: true, message: 'Password updated successfully! You can now log in.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Database error updating password.' });
  }
});