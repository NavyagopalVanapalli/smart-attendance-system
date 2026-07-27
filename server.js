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
app.use(express.static(__dirname)); // Serve static files

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

// MYSQL CONNECTION USING ENVIRONMENT VARIABLES
const db = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'Haveaniceday@1', 
  database: process.env.DB_NAME || 'defaultdb',
  ssl: process.env.DB_HOST ? { rejectUnauthorized: false } : false
});

db.connect((err) => {
  if (err) {
    console.error('❌ MySQL Connection Error:', err.message);
  } else {
    console.log('✅ Connected to MySQL Database!');
  }
});

// HAVERSINE FORMULA (GPS Distance Calculation)
function getDistanceInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * rad) * Math.cos(lat2 * rad) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
            
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Returns distance in meters
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
  const { date, hour, teacherId, records } = req.body;

  if (!records || records.length === 0) {
    return res.status(400).json({ success: false, message: "No attendance records provided." });
  }

  const query = `INSERT INTO attendance (roll_no, hour, date, status, teacher_id) VALUES ? ON DUPLICATE KEY UPDATE status=VALUES(status)`;
  const values = records.map(r => [r.roll_no, hour, date, r.status, teacherId]);

  db.query(query, [values], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: err.message });
    }
    res.json({ success: true, message: "Attendance saved successfully!" });
  });
});

// SEND WHATSAPP MESSAGE
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
    expiresAt: Date.now() + (10 * 60 * 1000) // 10 minutes session
  };

  res.json({ 
    success: true, 
    sessionId: sessionId,
    qrPayload: JSON.stringify({ sessionId, dept, section, hour, date, time: Date.now() })
  });
});

// ROBUST ROUTE TO SERVE STUDENT SCANNER PAGE (Case-insensitive check)
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

// STUDENT QR ATTENDANCE VERIFICATION & RECORDING
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

  const MAX_RADIUS_METERS = 30; 

  if (distance > MAX_RADIUS_METERS) {
    return res.status(403).json({ 
      success: false, 
      message: `Location verification failed! You are ${Math.round(distance)}m away from classroom (Max allowed: ${MAX_RADIUS_METERS}m).` 
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

// START SERVER
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Attendance Backend Server running on port ${PORT}`);
});