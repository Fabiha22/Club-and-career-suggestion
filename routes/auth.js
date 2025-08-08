// const express = require('express');
// const router = express.Router();
// const mysql = require('mysql2/promise');
// const crypto = require('crypto');
// const nodemailer = require('nodemailer');

// // MySQL connection
// const dbConfig = {
//   host: 'localhost',
//   user: 'root',
//   password: 'root', // your DB password
//   database: 'wt_project'
// };

// // Nodemailer transporter (use your email config here)
// const transporter = nodemailer.createTransport({
//   service: 'Gmail',
//   auth: {
//     user: 'faruquegolam2@gmail.com',      // replace with your email
//     pass: 'hprv vutu uytp utgn'        // or app password if 2FA is enabled
//   }
// });

// router.post('/forgot-password', async (req, res) => {
//   const { email } = req.body;

//   if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

//   try {
//     const connection = await mysql.createConnection(dbConfig);

//     // Check if user exists (students or teachers)
//     const [studentRows] = await connection.execute('SELECT * FROM students WHERE email = ?', [email]);
//     const [teacherRows] = await connection.execute('SELECT * FROM instructors WHERE email = ?', [email]);

//     const user = studentRows[0] || teacherRows[0];
//     const role = studentRows[0] ? 'student' : (teacherRows[0] ? 'instructor' : null);

//     if (!user) {
//       await connection.end();
//       return res.status(404).json({ success: false, message: 'No account found with that email' });
//     }

//     // Generate token and expiry
//     const token = crypto.randomBytes(32).toString('hex');
//     const expiry = new Date(Date.now() + 3600000); // 1 hour from now

//     // Store token in a reset_tokens table
//     await connection.execute(`
//       CREATE TABLE IF NOT EXISTS reset_tokens (
//         email VARCHAR(255),
//         token VARCHAR(255),
//         expires_at DATETIME,
//         role ENUM('student', 'teacher')
//       )
//     `);

//     await connection.execute(`
//       INSERT INTO reset_tokens (email, token, expires_at, role)
//       VALUES (?, ?, ?, ?)
//     `, [email, token, expiry, role]);

//     const resetLink = `http://localhost:3000/reset-password?token=${token}&email=${encodeURIComponent(email)}`;

//     // Send email
//     await transporter.sendMail({
//       from: '"Ahoron" <faruquegolam2@gmail.com>',
//       to: email,
//       subject: 'Password Reset - Ahoron',
//       html: `
//         <h3>Hi ${user.name},</h3>
//         <p>You requested a password reset for your Ahoron account.</p>
//         <p>Click the button below to reset your password:</p>
//         <a href="${resetLink}" style="background:#7c3aed; color:white; padding:10px 20px; text-decoration:none; border-radius:5px;">
//           Reset Password
//         </a>
//         <p>This link will expire in 1 hour.</p>
//         <p>If you didn’t request this, please ignore this email.</p>
//       `
//     });

//     await connection.end();

//     res.json({ success: true, message: 'Reset link sent successfully' });

//   } catch (err) {
//     console.error('Forgot password error:', err);
//     res.status(500).json({ success: false, message: 'Server error' });
//   }
// });

// module.exports = router;
