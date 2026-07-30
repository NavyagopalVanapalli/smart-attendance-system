USE defaultdb;

-- 1. CLEANUP EXISTING TABLES
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS attendance;
DROP TABLE IF EXISTS students;
DROP TABLE IF EXISTS teachers;
DROP TABLE IF EXISTS classes;
DROP TABLE IF EXISTS admins;
SET FOREIGN_KEY_CHECKS = 1;

-- 2. CREATE ADMINS TABLE
CREATE TABLE admins (
    admin_id VARCHAR(50) PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. CREATE CLASSES TABLE
CREATE TABLE classes (
    class_id INT AUTO_INCREMENT PRIMARY KEY,
    dept_code VARCHAR(20) NOT NULL,
    year_level VARCHAR(20) NOT NULL,
    section VARCHAR(10) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_class (dept_code, year_level, section)
);

-- 4. CREATE TEACHERS TABLE
CREATE TABLE teachers (
    teacher_id VARCHAR(50) PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    dept_code VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. CREATE STUDENTS TABLE
CREATE TABLE students (
    roll_no VARCHAR(50) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    parent_phone VARCHAR(15) NOT NULL,
    dept_code VARCHAR(20) NOT NULL,
    year_level VARCHAR(20) NOT NULL,
    section VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (roll_no, dept_code)
);

-- 6. CREATE ATTENDANCE TABLE WITH FOREIGN KEYS
CREATE TABLE attendance (
    id INT AUTO_INCREMENT PRIMARY KEY,
    roll_no VARCHAR(50) NOT NULL,
    dept_code VARCHAR(20) NOT NULL,
    hour VARCHAR(100) NOT NULL,
    date DATE NOT NULL,
    status ENUM('Present', 'Absent') NOT NULL,
    teacher_id VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_attendance_entry (roll_no, dept_code, hour, date),
    FOREIGN KEY (roll_no, dept_code) REFERENCES students(roll_no, dept_code) ON DELETE CASCADE,
    FOREIGN KEY (teacher_id) REFERENCES teachers(teacher_id) ON DELETE CASCADE
);

-- 7. SEED INITIAL DATA
INSERT INTO admins (admin_id, full_name, email, password_hash)
VALUES ('ADMIN01', 'System Administrator', 'admin@college.edu', 'admin123')
ON DUPLICATE KEY UPDATE full_name=VALUES(full_name);

INSERT INTO classes (dept_code, year_level, section) VALUES 
('MCA', '1st Year', 'Sec A'),
('MCA', '2nd Year', 'Sec A'),
('MBA', '1st Year', 'Sec B')
ON DUPLICATE KEY UPDATE dept_code=dept_code;

INSERT INTO teachers (teacher_id, full_name, email, password_hash, dept_code)
VALUES 
  ('FAC101', 'Dr. Dupesh', 'smith@college.edu', 'admin123', 'MCA'),
  ('FAC102', 'Dr. Johnson', 'johnson@college.edu', 'admin123', 'MBA')
ON DUPLICATE KEY UPDATE full_name=VALUES(full_name);

INSERT INTO students (roll_no, full_name, parent_phone, dept_code, year_level, section)
VALUES 
  ('2585351001', 'Yamini V', '9876543210', 'MCA', '1st Year', 'Sec A'),
  ('2585351020', 'Manohar B', '9876543211', 'MCA', '1st Year', 'Sec A'),
  ('2585351125', 'Akshay K', '9876543212', 'MBA', '1st Year', 'Sec B')
ON DUPLICATE KEY UPDATE full_name=VALUES(full_name);

-- VERIFY SETUP
DESCRIBE teachers;
SELECT * FROM teachers;