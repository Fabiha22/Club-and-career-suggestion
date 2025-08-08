const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const nodemailer = require('nodemailer');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
// Configure storage for uploaded images
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');  // Make sure this folder exists
  },
  filename: function (req, file, cb) {
    // Use timestamp + original filename to avoid collisions
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({ storage: storage });

const app = express();
app.use(express.static('html_files')); // Serve static HTML files
const PORT = 3000;

app.use(cors());
app.use(express.json());

// MySQL connection
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'root',
  database: 'wt_project',
});

db.connect(err => {
  if (err) {
    console.error('MySQL connection error:', err.message);
    process.exit(1);
  }
  console.log('✅ Connected to MySQL');
});

// Nodemailer (optional)


const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'faruquegolam2@gmail.com', // ✅ your Gmail
    pass: 'xujt prrg tvdw ofop'     // ✅ Gmail App Password, NOT your Gmail password
  }
});


// ====================== ROUTES ======================

app.post('/signup', (req, res) => {
  const { name, email, password, role } = req.body;
  if (role !== 'student' && role !== 'instructor') {
    return res.status(400).json({ message: 'Invalid role' });
  }
  const table = role === 'student' ? 'students' : 'instructors';
  const sql = `INSERT INTO ${table} (name, email, password) VALUES (?, ?, ?)`;

  db.query(sql, [name, email, password], (err) => {
    if (err) return res.status(500).json({ message: 'Database error: ' + err.message });
    res.json({ message: 'Signup successful!' });
  });
});

app.post('/login', (req, res) => {
  const { email, password } = req.body;

  db.query('SELECT * FROM students WHERE email = ?', [email], (err, studentResults) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error' });

    if (studentResults.length > 0) {
      const student = studentResults[0];
      if (student.password === password) {
        return res.json({ success: true, name: student.name, email: student.email, role: 'student', id: student.id, redirect: 's_dashboard.html' });
      } else {
        return res.json({ success: false, message: 'Incorrect password' });
      }
    }

    db.query('SELECT * FROM instructors WHERE email = ?', [email], (err, instructorResults) => {
      if (err) return res.status(500).json({ success: false, message: 'Database error' });

      if (instructorResults.length > 0) {
        const instructor = instructorResults[0];
        if (instructor.password === password) {
          return res.json({ success: true, name: instructor.name, role: 'instructor', id: instructor.id, redirect: 'i_dashboard.html' });
        } else {
          return res.json({ success: false, message: 'Incorrect password' });
        }
      }

      return res.json({ success: false, message: 'Email not found' });
    });
  });
});

const crypto = require('crypto');

// Temporary in-memory token store (use DB in production)
const passwordResetTokens = new Map();

app.post('/forgot-password', (req, res) => {
  const { email } = req.body;

  if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

  // Check if email exists in students or instructors table
  const findUserQuery = `
    SELECT id, email, 'student' AS role FROM students WHERE email = ?
    UNION
    SELECT id, email, 'instructor' AS role FROM instructors WHERE email = ?
  `;

  db.query(findUserQuery, [email, email], (err, results) => {
    if (err) {
      console.error('DB error:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    if (results.length === 0) {
      return res.status(404).json({ success: false, message: 'Email not found' });
    }

    const user = results[0];

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + 1000 * 60 * 15; // valid for 15 minutes

    passwordResetTokens.set(token, { email, expires });

    // Build reset link
    const resetLink = `http://localhost:3000/reset-password.html?token=${token}`;

    // Send email
    const mailOptions = {
      from: 'faruquegolam2@gmail.com',
      to: email,
      subject: 'Ahoron Password Reset',
      html: `<p>Hello,</p>
             <p>You requested a password reset. Click below to reset it:</p>
             <a href="${resetLink}">${resetLink}</a>
             <p>This link will expire in 15 minutes.</p>`
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('Email send error:', error);
        return res.status(500).json({ success: false, message: 'Failed to send email' });
      }

      res.json({ success: true, message: 'Reset link sent successfully' });
    });
  });
});

// Password Reset POST
app.post('/reset-password', (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({ success: false, message: 'Missing token or new password' });
  }

  const tokenData = passwordResetTokens.get(token);
  if (!tokenData) {
    return res.status(400).json({ success: false, message: 'Invalid or expired token' });
  }

  const { email, expires } = tokenData;

  if (Date.now() > expires) {
    passwordResetTokens.delete(token);
    return res.status(400).json({ success: false, message: 'Token expired' });
  }

  // Check if user is student or instructor
  const findQuery = `
    SELECT id, 'student' as role FROM students WHERE email = ?
    UNION
    SELECT id, 'instructor' as role FROM instructors WHERE email = ?
  `;

  db.query(findQuery, [email, email], (err, results) => {
    if (err || results.length === 0) {
      return res.status(500).json({ success: false, message: 'User not found' });
    }

    const { role } = results[0];
    const table = role === 'student' ? 'students' : 'instructors';

    const updateQuery = `UPDATE ${table} SET password = ? WHERE email = ?`;
    db.query(updateQuery, [newPassword, email], (err) => {
      if (err) return res.status(500).json({ success: false, message: 'Password update failed' });

      passwordResetTokens.delete(token); // Clean up
      res.json({ success: true, message: 'Password updated successfully' });
    });
  });
});


app.get('/api/instructor/:id', (req, res) => {
  const instructorId = req.params.id;
  db.query('SELECT name FROM instructors WHERE id = ?', [instructorId], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (results.length === 0) return res.status(404).json({ error: 'Instructor not found' });
    res.json({ name: results[0].name });
  });
});


app.get('/api/instructors', (req, res) => {
  db.query('SELECT id, name FROM instructors', (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
});

app.get('/api/chat', (req, res) => {
  const { student_id, instructor_id } = req.query;
  if (!student_id || !instructor_id) {
    return res.status(400).json({ error: 'Missing student_id or instructor_id' });
  }

  const sql = `
    SELECT m.*, 
      CASE 
        WHEN m.sender_role = 'student' THEN s.name
        WHEN m.sender_role = 'instructor' THEN i.name
        ELSE 'Unknown'
      END AS sender_name
    FROM messages m
    LEFT JOIN students s ON m.sender_role = 'student' AND m.sender_id = s.id
    LEFT JOIN instructors i ON m.sender_role = 'instructor' AND m.sender_id = i.id
    WHERE 
      (m.sender_role = 'student' AND m.sender_id = ? AND m.receiver_role = 'instructor' AND m.receiver_id = ?)
      OR
      (m.sender_role = 'instructor' AND m.sender_id = ? AND m.receiver_role = 'student' AND m.receiver_id = ?)
    ORDER BY m.timestamp ASC
  `;

  db.query(sql, [student_id, instructor_id, instructor_id, student_id], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
});

app.post('/api/chat/mark-read', (req, res) => {
  const { instructor_id, student_id } = req.body;
  if (!instructor_id || !student_id) return res.status(400).json({ error: 'Missing instructor_id or student_id' });

  const sql = `
    UPDATE messages 
    SET is_read = 1 
    WHERE receiver_role = 'instructor' AND receiver_id = ? AND sender_role = 'student' AND sender_id = ? AND is_read = 0
  `;

  db.query(sql, [instructor_id, student_id], (err) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json({ success: true, message: 'Messages marked as read' });
  });
});

app.post('/api/chat/send', (req, res) => {
  const { sender_role, sender_id, receiver_role, receiver_id, message } = req.body;

  if (!sender_role || !sender_id || !receiver_role || !receiver_id || !message) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  const sql = `
    INSERT INTO messages (sender_role, sender_id, receiver_role, receiver_id, message, timestamp, is_read)
    VALUES (?, ?, ?, ?, ?, NOW(), 0)
  `;

  db.query(sql, [sender_role, sender_id, receiver_role, receiver_id, message], (err) => {
    if (err) return res.status(500).json({ success: false, error: 'Database error' });
    res.json({ success: true, message: 'Message sent' });
  });
});

app.get('/api/dashboard-data', (req, res) => {
  const data = {};
  const studentQuery = 'SELECT COUNT(*) AS total_students FROM students';
  const instructorQuery = 'SELECT COUNT(*) AS total_instructors FROM instructors';
  const paymentsQuery = 'SELECT SUM(amount) AS total_payments FROM payments';
  const clubsQuery = 'SELECT COUNT(*) AS total_clubs FROM clubs';
  const activitiesQuery = 'SELECT description FROM activities ORDER BY timestamp DESC LIMIT 5';

  db.query(studentQuery, (err, result) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch student count' });
    data.students = result[0].total_students;

    db.query(instructorQuery, (err, result) => {
      if (err) return res.status(500).json({ error: 'Failed to fetch instructor count' });
      data.instructors = result[0].total_instructors;

      db.query(paymentsQuery, (err, result) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch payments' });
        data.payments = parseFloat(result[0].total_payments) || 0;

        db.query(clubsQuery, (err, result) => {
          if (err) return res.status(500).json({ error: 'Failed to fetch clubs' });
          data.clubs = result[0].total_clubs;

          db.query(activitiesQuery, (err, result) => {
            if (err) {
              console.error('Failed to fetch recent activities:', err);
              data.recent_activities = ['No recent activities available'];
            } else {
              data.recent_activities = result.map(row => row.description);
            }
            res.json(data);
          });
        });
      });
    });
  });
});


app.get('/api/instructor-notifications', (req, res) => {
  const { instructor_id } = req.query;
  if (!instructor_id) return res.status(400).json({ error: 'Missing instructor_id' });

  const sql = `
    SELECT m.*, s.name AS student_name
    FROM messages m
    INNER JOIN (
      SELECT sender_id, MAX(timestamp) AS latest
      FROM messages
      WHERE receiver_id = ? AND receiver_role = 'instructor'
      GROUP BY sender_id
    ) AS recent
    ON m.sender_id = recent.sender_id AND m.timestamp = recent.latest
    JOIN students s ON m.sender_id = s.id
    WHERE m.receiver_role = 'instructor' AND m.receiver_id = ?
    ORDER BY m.timestamp DESC
  `;

  db.query(sql, [instructor_id, instructor_id], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(results);
  });
});

app.get('/api/instructor/:id/unread-messages-count', (req, res) => {
  const instructor_id = req.params.id;
  const sql = `
    SELECT COUNT(*) AS unreadCount
    FROM messages
    WHERE receiver_role = 'instructor' AND receiver_id = ? AND is_read = 0
  `;
  db.query(sql, [instructor_id], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json({ unreadCount: results[0].unreadCount });
  });
});

app.get('/api/instructor/:id/messages', (req, res) => {
  const instructor_id = req.params.id;
  const sql = `
    SELECT s.id AS student_id, s.name AS student_name,
           MAX(m.timestamp) AS last_time,
           (SELECT m2.message 
            FROM messages m2 
            WHERE m2.sender_id = s.id 
              AND m2.sender_role = 'student' 
              AND m2.receiver_role = 'instructor' 
              AND m2.receiver_id = ? 
            ORDER BY m2.timestamp DESC 
            LIMIT 1) AS last_message,
           SUM(CASE WHEN m.is_read = 0 AND m.receiver_role = 'instructor' AND m.receiver_id = ? THEN 1 ELSE 0 END) AS unread
    FROM messages m
    JOIN students s ON m.sender_id = s.id AND m.sender_role = 'student'
    WHERE m.receiver_role = 'instructor' AND m.receiver_id = ?
    GROUP BY s.id
    ORDER BY last_time DESC
  `;
  db.query(sql, [instructor_id, instructor_id, instructor_id], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json({ messages: results });
  });
});

app.get('/api/students', (req, res) => {
  const sql = `
    SELECT id, name, email FROM students
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error('Error fetching students:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(results);
  });
});

app.get('/api/instructors', (req, res) => {
  const sql = 'SELECT id, name, email FROM instructors';
  db.query(sql, (err, results) => {
    if (err) {
      console.error('Error fetching instructors:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    console.log('Instructor API result:', results); // Debug log
    res.json(results);
  });
});





// ========== CLUB REQUEST ROUTES ==========

app.post('/api/clubs/request', upload.single('club_image'), (req, res) => {
  console.log('--- Incoming Request ---');
  console.log('Body:', req.body);
  console.log('File:', req.file);

  const { club_name, university_name, description, facebook_link } = req.body;
  const clubImage = req.file;
  const imagePath = clubImage ? `/uploads/${clubImage.filename}` : null;

  if (!club_name || !university_name || !description || !facebook_link) {
    console.log('Missing fields');
    return res.status(400).json({ message: 'All fields are required.' });
  }

  const checkQuery = 'SELECT id FROM club_requests WHERE facebook_link = ?';
  db.query(checkQuery, [facebook_link], (checkErr, results) => {
    if (checkErr) {
      console.error('Check error:', checkErr);
      return res.status(500).json({ message: 'Error checking duplicates' });
    }

    if (results.length > 0) {
      return res.status(409).json({ message: 'Duplicate Facebook link' });
    }

    const insertQuery = `
      INSERT INTO club_requests 
        (club_name, university_name, description, facebook_link, club_image, status) 
      VALUES (?, ?, ?, ?, ?, 'pending')
    `;

    db.query(insertQuery, [club_name, university_name, description, facebook_link, imagePath], (err, result) => {
      if (err) {
        console.error('Insert error:', err);
        return res.status(500).json({ message: 'Insert failed' });
      }

      res.status(200).json({ message: 'Club request submitted.' });
    });
  });
});



app.get('/api/club-requests/pending', (req, res) => {
  db.query('SELECT * FROM club_requests WHERE status = "pending"', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});


app.post('/api/events/submit', express.json(), (req, res) => {
  const { club_name, event_name, university_name, description, facebook_link, event_date } = req.body;

  console.log('Incoming event data:', req.body); // 🔍 LOG THIS

  if (!club_name || !event_name || !university_name || !description || !facebook_link || !event_date) {
    console.log('Missing fields');
    return res.status(400).json({ message: 'All fields are required.' });
  }

  const checkClubQuery = 'SELECT id FROM clubs WHERE club_name = ? AND university_name = ?';

  db.query(checkClubQuery, [club_name, university_name], (err, results) => {
    if (err) {
      console.error('Club check error:', err);
      return res.status(500).json({ message: 'Server error at checkClubQuery' });
    }

    if (results.length === 0) {
      console.log('Club not found for:', club_name, university_name);
      return res.status(404).json({ message: 'Club not found. Please add club details first.' });
    }

    const clubId = results[0].id;
    console.log('Matched club ID:', clubId);

    const insertEventQuery = `
      INSERT INTO club_events 
        (club_id, event_name, university_name, description, facebook_link, event_date, status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `;

    db.query(insertEventQuery, [clubId, event_name, university_name, description, facebook_link, event_date], (insertErr, insertResult) => {
      if (insertErr) {
        console.error('Insert event error:', insertErr); // 🔍 IMPORTANT
        return res.status(500).json({ message: 'Failed to submit event' });
      }

      console.log('Event inserted successfully!');
      res.status(200).json({ message: 'Event submitted successfully' });
    });
  });
});

app.get('/api/events/pending', (req, res) => {
  const query = `
    SELECT e.id, e.event_name, e.university_name, e.description, e.facebook_link, e.event_date, c.club_name
    FROM club_events e
    LEFT JOIN clubs c ON e.club_id = c.id
    WHERE e.status = 'pending'
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error('DB error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(results);
  });
});



// Assuming you have your MySQL connection in `db`

// GET upcoming approved events
// Return all approved upcoming events sorted by event_date ascending
app.get('/api/events/approved/upcoming', (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  const sql = `
    SELECT e.id, e.event_name, e.description, e.facebook_link, e.event_date, e.status, e.university_name, c.club_name
    FROM club_events e
    JOIN clubs c ON e.club_id = c.id
    WHERE e.status = 'approved' AND e.event_date >= ?
    ORDER BY e.event_date ASC
  `;

  db.query(sql, [today], (err, results) => {
    if (err) {
      console.error('Error fetching approved upcoming events:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(results);
  });
});






app.post('/api/events/:id/approve', (req, res) => {
  const eventId = req.params.id;
  console.log('Attempting to approve event with ID:', eventId); // log the ID

  const updateQuery = `UPDATE club_events SET status = 'approved' WHERE id = ?`;
  db.query(updateQuery, [eventId], (err, result) => {
    if (err) {
      console.error('Error approving event:', err);
      return res.status(500).json({ message: 'Error approving event' });
    }

    if (result.affectedRows === 0) {
      // No row updated, likely invalid event ID
      console.warn(`No event found with ID ${eventId}`);
      return res.status(404).json({ message: 'Event not found or already approved' });
    }

    console.log(`Event with ID ${eventId} approved.`);
    res.json({ message: 'Event approved successfully' });
  });
});



app.post('/api/events/:id/decline', (req, res) => {
  const eventId = req.params.id;

  const sql = `UPDATE club_events SET status = 'rejected' WHERE id = ?`;
  db.query(sql, [eventId], (err, result) => {
    if (err) {
      console.error('Decline error:', err);
      return res.status(500).json({ message: 'Error declining event' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Event not found or already declined' });
    }

    res.status(200).json({ message: 'Event declined successfully' });
  });
});

// Express + MySQL required
// Approve route using facebook_link
app.post('/api/club-requests/approve/:facebook_link', (req, res) => {
  const facebookLink = decodeURIComponent(req.params.facebook_link);

  const sql = 'UPDATE club_requests SET status = "approved" WHERE facebook_link = ?';
  db.query(sql, [facebookLink], (err, result) => {
    if (err) {
      console.error('Approval error:', err);
      return res.status(500).json({ error: 'Failed to approve club' });
    }
    res.status(200).json({ message: 'Club approved successfully' });
  });
});

// Decline route using facebook_link
app.post('/api/club-requests/decline/:facebook_link', (req, res) => {
  const facebookLink = decodeURIComponent(req.params.facebook_link);

  const sql = 'UPDATE club_requests SET status = "rejected" WHERE facebook_link = ?';
  db.query(sql, [facebookLink], (err, result) => {
    if (err) {
      console.error('Decline error:', err);
      return res.status(500).json({ error: 'Failed to reject club' });
    }
    res.status(200).json({ message: 'Club rejected successfully' });
  });
});



app.get('/api/clubs/approved', (req, res) => {
  const query = `
    SELECT club_name, university_name, description, facebook_link, club_image
    FROM club_requests 
    WHERE status = 'approved'
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching approved clubs:', err);
      return res.status(500).json({ message: 'Server error' });
    }
    res.json(results);
  });
});


// GET student profile by email
app.get('/api/student-profile', (req, res) => {
  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const sql = 'SELECT id, name, email FROM students WHERE email = ?';
  db.query(sql, [email], (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    if (results.length > 0) {
      res.json(results[0]);
    } else {
      res.status(404).json({ error: 'Student not found' });
    }
  });
});





// =============== SOCKET.IO SETUP ===============
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

io.on('connection', (socket) => {
  console.log('🔌 New socket client connected');

  socket.on('joinRoom', ({ student_id, instructor_id }) => {
    const room = `chat_${student_id}_${instructor_id}`;
    socket.join(room);
    console.log(`✅ User joined room ${room}`);
  });

  // Handle sending new chat messages
  socket.on('sendMessage', ({ sender_role, sender_id, receiver_role, receiver_id, message }) => {
    if (!sender_role || !sender_id || !receiver_role || !receiver_id || !message) return;

    const sql = `
      INSERT INTO messages (sender_role, sender_id, receiver_role, receiver_id, message, timestamp, is_read)
      VALUES (?, ?, ?, ?, ?, NOW(), 0)
    `;

    db.query(sql, [sender_role, sender_id, receiver_role, receiver_id, message], (err) => {
      if (err) return console.error('❌ Message insert error:', err);

      const student_id = sender_role === 'student' ? sender_id : receiver_id;
      const instructor_id = sender_role === 'student' ? receiver_id : sender_id;
      const room = `chat_${student_id}_${instructor_id}`;

      io.to(room).emit('receiveMessage', {
        sender_role,
        sender_id,
        receiver_role,
        receiver_id,
        message,
        timestamp: new Date()
      });
    });
  });

  // Typing indicator: broadcast to other users in the room that sender is typing
  socket.on('typing', ({ student_id, instructor_id, sender_role }) => {
    const room = `chat_${student_id}_${instructor_id}`;
    // Broadcast to all except sender in the room
    socket.to(room).emit('typing', { sender_role });
  });

  // Mark messages as read by instructor
  socket.on('markSeen', ({ instructor_id, student_id }) => {
    if (!instructor_id || !student_id) return;

    // Update DB: mark all unread messages from student to this instructor as read
    const sql = `
      UPDATE messages 
      SET is_read = 1 
      WHERE receiver_role = 'instructor' AND receiver_id = ? 
        AND sender_role = 'student' AND sender_id = ? AND is_read = 0
    `;

    db.query(sql, [instructor_id, student_id], (err) => {
      if (err) {
        console.error('❌ Error marking messages as read:', err);
        return;
      }

      // Notify other clients in room that messages have been seen
      const room = `chat_${student_id}_${instructor_id}`;
      socket.to(room).emit('messagesSeen', { instructor_id, student_id });
    });
  });

  socket.on('disconnect', () => {
    console.log('❌ Socket client disconnected');
  });
});

// =============== START SERVER ===============
server.listen(PORT, () => {
  console.log(`🚀 Server (with Socket.IO) running at http://localhost:${PORT}`);
});