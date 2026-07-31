require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'PUT', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

// MYSQL CONNECTION


const db = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'Haveaniceday@1', 
  database: process.env.DB_NAME || 'defaultdb',
  ssl: process.env.DB_HOST ? { rejectUnauthorized: false } : false
}).promise(); // <-- .promise() enables async/await support

db.connect((err) => {
  if (err) {
    console.error('❌ MySQL Connection Error:', err.message);
  } else {
    console.log('✅ Connected to MySQL Database!');
  }
});

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

// TEACHER LOGIN API
app.post('/api/login', (req, res) => {
  const { teacherId, password } = req.body;
  const sql = 'SELECT teacher_id, full_name, email, dept_code FROM teachers WHERE teacher_id = ? AND password_hash = ?';
  
  db.query(sql, [teacherId, password], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length > 0) {
      res.json({ success: true, teacher: results[0] });
    } else {
      res.status(401).json({ success: false, message: 'Invalid Faculty ID or Password!' });
    }
  });
});

// RESET / FORGOT PASSWORD ENDPOINT
app.post('/api/reset-password', (req, res) => {
  const { teacherId, newPassword } = req.body;

  if (!teacherId || !newPassword) {
    return res.status(400).json({ success: false, message: 'All fields are required.' });
  }

  const query = 'UPDATE teachers SET password_hash = ? WHERE teacher_id = ?';
  db.query(query, [newPassword, teacherId], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Database query failed.' });
    
    if (results.affectedRows > 0) {
      res.json({ success: true, message: 'Password updated successfully!' });
    } else {
      res.json({ success: false, message: 'Faculty ID not found.' });
    }
  });
});

// CHANGE TEACHER PASSWORD API
app.post('/api/change-password', (req, res) => {
  const { teacherId, currentPassword, newPassword } = req.body;

  const verifySql = 'SELECT * FROM teachers WHERE teacher_id = ? AND password_hash = ?';
  db.query(verifySql, [teacherId, currentPassword], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect!' });
    }

    const updateSql = 'UPDATE teachers SET password_hash = ? WHERE teacher_id = ?';
    db.query(updateSql, [newPassword, teacherId], (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, message: 'Password updated successfully!' });
    });
  });
});

// GET STUDENTS BY DEPARTMENT, YEAR, SECTION
app.get('/api/students', (req, res) => {
  const { dept, year, section } = req.query;
  const sql = 'SELECT * FROM students WHERE dept_code = ? AND year_level = ? AND section = ?';
  
  db.query(sql, [dept, year, section], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// GET REAL-TIME ATTENDANCE STATUS
app.get('/api/attendance/live', (req, res) => {
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

  db.query(query, params, (err, results) => {
    if (err) {
      console.error("Error fetching live attendance:", err);
      return res.status(500).json({ error: "Database query failed" });
    }
    res.json(results);
  });
});

// ADD NEW STUDENT API
app.post('/api/students/add', (req, res) => {
  const { roll_no, full_name, parent_phone, dept_code, year_level, section } = req.body;

  if (!roll_no || !full_name || !parent_phone) {
    return res.status(400).json({ success: false, message: "Missing required fields." });
  }

  const checkSql = 'SELECT * FROM students WHERE roll_no = ? AND dept_code = ?';
  db.query(checkSql, [roll_no, dept_code], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: err.message });

    if (results.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Roll No ${roll_no} already exists in ${dept_code} department!` 
      });
    }

    const insertSql = `INSERT INTO students (roll_no, full_name, parent_phone, dept_code, year_level, section) VALUES (?, ?, ?, ?, ?, ?)`;
    db.query(insertSql, [roll_no, full_name, parent_phone, dept_code, year_level, section], (err, result) => {
      if (err) return res.status(500).json({ success: false, message: err.message });
      res.json({ success: true, message: "Student added successfully!" });
    });
  });
});

// SAVE ATTENDANCE RECORD
app.post('/api/attendance/submit', (req, res) => {
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

  db.query(query, [values], (err, result) => {
    if (err) {
      console.error("Database save error:", err);
      return res.status(500).json({ success: false, message: err.message });
    }
    res.json({ success: true, message: "Attendance saved successfully!" });
  });
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
app.post('/api/qr/verify-student', (req, res) => {
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

  const verifyStudentSql = `SELECT full_name FROM students WHERE roll_no = ? AND dept_code = ?`;
  db.query(verifyStudentSql, [rollNo, session.dept], (err, studentResults) => {
    if (err) return res.status(500).json({ success: false, message: "Database verification error." });
    
    if (studentResults.length === 0) {
      return res.status(400).json({ success: false, message: `Roll No ${rollNo} is not registered in ${session.dept} department!` });
    }

    const studentName = studentResults[0].full_name;
    const sql = `INSERT INTO attendance (date, hour, teacher_id, roll_no, dept_code, status) 
                 VALUES (?, ?, ?, ?, ?, 'Present') 
                 ON DUPLICATE KEY UPDATE status='Present'`;

    db.query(sql, [session.date, session.hour, session.teacherId, rollNo, session.dept], (err, result) => {
      if (err) {
        console.error("Database error during QR attendance:", err);
        return res.status(500).json({ success: false, message: "Database error recording attendance." });
      }

      res.json({ 
        success: true, 
        message: `✅ Attendance marked Present for ${studentName} (${rollNo})!` 
      });
    });
  });
});

// DELETE STUDENT ENDPOINT
app.delete('/api/students/delete', (req, res) => {
  const { roll_no, dept_code } = req.query;

  if (!roll_no || !dept_code) {
    return res.status(400).json({ success: false, message: "Missing roll number or department code." });
  }

  const deleteSql = 'DELETE FROM students WHERE roll_no = ? AND dept_code = ?';
  db.query(deleteSql, [roll_no, dept_code], (err, result) => {
    if (err) {
      console.error("Database error during delete:", err);
      return res.status(500).json({ success: false, message: err.message });
    }
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Student not found." });
    }

    res.json({ success: true, message: "Student deleted successfully!" });
  });
});

// ROUTE TO SERVE STUDENT SCANNER PAGE
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

// ROUTE TO SERVE MAIN INDEX PAGE
app.get('/', (req, res) => {
  const possibleIndexPaths = [
    path.join(__dirname, 'index.html'),
    path.join(__dirname, 'public', 'index.html')
  ];

  for (const filePath of possibleIndexPaths) {
    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath);
    }
  }
  res.status(404).send("index.html missing from server repository.");
});

// START SERVER
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Attendance Backend Server running on port ${PORT}`);
});


// ==================== ADMIN API ENDPOINTS ====================

// 1. Get High-Level Dashboard Statistics
app.get('/api/admin/stats', async (req, res) => {
  try {
    const [[{ totalStudents }]] = await db.query("SELECT COUNT(*) as totalStudents FROM students");
    const [[{ totalTeachers }]] = await db.query("SELECT COUNT(*) as totalTeachers FROM teachers");
    const [[{ todayPresent }]] = await db.query(
      "SELECT COUNT(*) as todayPresent FROM attendance WHERE date = CURDATE() AND status = 'Present'"
    );
    const [[{ todayAbsent }]] = await db.query(
      "SELECT COUNT(*) as todayAbsent FROM attendance WHERE date = CURDATE() AND status = 'Absent'"
    );

    res.json({
      totalStudents,
      totalTeachers,
      todayPresent,
      todayAbsent
    });
  } catch (err) {
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
      LEFT JOIN students s ON a.roll_no = s.roll_no
      ORDER BY a.date DESC, a.hour ASC
    `);

    // Build CSV Header & Rows
    let csvContent = "ID,Date,Hour,Roll No,Student Name,Department,Status,Teacher ID\n";
    rows.forEach(r => {
      csvContent += `"${r.id}","${r.date.toISOString().split('T')[0]}","${r.hour}","${r.roll_no}","${r.student_name || ''}","${r.dept_code}","${r.status}","${r.teacher_id}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="attendance_report.csv"');
    res.status(200).send(csvContent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Add a New Teacher
// Add a New Teacher (Fixed for NOT NULL schema constraints)
app.post('/api/admin/teachers', async (req, res) => {
  const { teacher_id, full_name, email, dept_code, password_hash } = req.body;
  
  if (!teacher_id || !full_name || !dept_code) {
    return res.status(400).json({ error: "Missing required teacher fields (ID, Name, or Dept)." });
  }

  // Provide fallback defaults so MySQL NOT NULL checks don't fail
  const teacherEmail = email && email.trim() !== '' 
    ? email 
    : `${teacher_id.toLowerCase()}@college.edu`;
    
  const teacherPassword = password_hash && password_hash.trim() !== '' 
    ? password_hash 
    : 'admin123'; // Default temporary password

  try {
    await db.query(
      "INSERT INTO teachers (teacher_id, full_name, email, dept_code, password_hash) VALUES (?, ?, ?, ?, ?)",
      [teacher_id, full_name, teacherEmail, dept_code, teacherPassword]
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
      [roll_no, full_name, parent_phone || '', dept_code, year_level || '1', section || 'A']
    );
    res.json({ success: true, message: "Student added successfully!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/test-db', async (req, res) => {
  try {
    const [tables] = await db.query("SHOW TABLES");
    res.json({ tables });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});