const express = require('express');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const nodemailer = require('nodemailer');
const twilio = require('twilio');
const path = require('path');
require('dotenv').config();

const app = express();
const upload = multer({ dest: 'uploads/' });

// Twilio setup
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Nodemailer setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS
  }
});

// Google Meet link
const meetLink = 'https://meet.google.com/vee-wxwv-nof';

// SQLite setup (file-based)
const db = new sqlite3.Database('bookings.db', (err) => {
  if (err) console.error('SQLite error:', err.message);
  console.log('Connected to SQLite database (bookings.db).');
});

db.run(`CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  surname TEXT,
  age INTEGER,
  gender TEXT,
  township TEXT,
  city TEXT,
  postalCode TEXT,
  province TEXT,
  phone TEXT,
  email TEXT,
  school TEXT,
  grade TEXT,
  subject TEXT,
  topic TEXT,
  questionsPath TEXT,
  comments TEXT,
  datetime TEXT,
  meetLink TEXT,
  paymentMethod TEXT,
  proofOfPaymentPath TEXT
)`);

app.use(express.json());
app.use(express.static('public'));

// Serve the HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Handle booking
app.post('/book', upload.fields([
  { name: 'questions', maxCount: 1 },
  { name: 'proofOfPayment', maxCount: 1 }
]), async (req, res) => {
  const {
    name, surname, age, gender, township, city, postalCode, province,
    phone, email, school, grade, subject, topic, comments, datetime,
    paymentMethod
  } = req.body;
  const questionsPath = req.files['questions'] ? req.files['questions'][0].path : null;
  const proofOfPaymentPath = req.files['proofOfPayment'] ? req.files['proofOfPayment'][0].path : null;

  try {
    // Validate inputs
    if (!name || !surname || !age || !gender || !city || !province || !phone || !email || !subject || !topic || !datetime) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    // Store booking in database
    db.run(
      `INSERT INTO bookings (
        name, surname, age, gender, township, city, postalCode, province,
        phone, email, school, grade, subject, topic, questionsPath, comments,
        datetime, meetLink, paymentMethod, proofOfPaymentPath
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name, surname, age, gender, township, city, postalCode, province,
        phone, email, school, grade, subject, topic, questionsPath, comments,
        datetime, meetLink, paymentMethod, proofOfPaymentPath
      ],
      (err) => {
        if (err) {
          console.error('Database error:', err.message);
          return res.status(500).json({ success: false, message: 'Database error' });
        }

        // Send email to tutor
        const tutorMailOptions = {
          from: '"From 1 to 7 Tutoring" <' + process.env.GMAIL_USER + '>',
          to: process.env.GMAIL_USER, // Your email
          subject: 'New Booking Confirmation',
          html: `
            <p>Dear Mdu Mataboge,</p>
            <p>A new tutoring session has been booked!</p>
            <p><strong>Student Details:</strong></p>
            <p>Name: ${name} ${surname}</p>
            <p>Email: ${email}</p>
            <p>Phone: ${phone}</p>
            <p><strong>Session Details:</strong></p>
            <p>Subject: ${subject}</p>
            <p>Topic: ${topic}</p>
            <p>Date & Time: ${datetime}</p>
            <p>Payment Method: ${paymentMethod || 'Not specified'}</p>
            <p>Proof of Payment: ${proofOfPaymentPath ? 'Uploaded' : 'Not provided'}</p>
            <p>Join the session: <a href="${meetLink}">Click here</a></p>
          `
        };

        transporter.sendMail(tutorMailOptions, (error, info) => {
          if (error) {
            console.error('Tutor email error:', error.message);
          } else {
            console.log('Tutor email sent:', info.response);
          }
        });

        // Send email to student
        const studentMailOptions = {
          from: '"From 1 to 7 Tutoring" <' + process.env.GMAIL_USER + '>',
          to: email,
          subject: 'Booking Confirmation',
          html: `
            <p>Dear ${name} ${surname},</p>
            <p>Your tutoring session has been confirmed!</p>
            <p><strong>Details:</strong></p>
            <p>Subject: ${subject}</p>
            <p>Topic: ${topic}</p>
            <p>Date & Time: ${datetime}</p>
            <p>Payment Method: ${paymentMethod || 'Not specified'}</p>
            <p>Proof of Payment: ${proofOfPaymentPath ? 'Uploaded' : 'Not provided'}</p>
            <p>Join your session: <a href="${meetLink}">Click here</a></p>
          `
        };

        transporter.sendMail(studentMailOptions, (error, info) => {
          if (error) {
            console.error('Student email error:', error.message);
          } else {
            console.log('Student email sent:', info.response);
          }
        });

        // Send SMS to tutor (if Twilio number is verified)
        twilioClient.messages.create({
          body: `New booking: ${name} ${surname} for ${subject} (${topic}) on ${datetime}. Payment: ${paymentMethod || 'Not specified'}. Join: ${meetLink}`,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: '+27766440806' // Your phone number
        }).then(message => {
          console.log('Tutor SMS sent:', message.sid);
        }).catch(error => {
          console.error('Tutor SMS error:', error.message);
        });

        // Send SMS to student (if their number is verified)
        twilioClient.messages.create({
          body: `From 1 to 7 Tutoring: Your session for ${subject} (${topic}) is confirmed for ${datetime}. Payment Method: ${paymentMethod || 'Not specified'}. Join: ${meetLink}`,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: phone
        }).then(message => {
          console.log('Student SMS sent:', message.sid);
        }).catch(error => {
          console.error('Student SMS error:', error.message);
        });

        res.json({ success: true });
      }
    );
  } catch (err) {
    console.error('Server error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// View all sessions (simple password protection)
app.get('/sessions', (req, res) => {
  const password = req.query.password;
  if (password !== 'tutor123') { // Simple password (change this to something secure)
    return res.status(401).send(`
      <h1>Unauthorized</h1>
      <p>Please enter the correct password.</p>
      <form method="GET" action="/sessions">
        <label>Password: </label>
        <input type="password" name="password" required>
        <button type="submit">Submit</button>
      </form>
    `);
  }

  db.all('SELECT * FROM bookings ORDER BY datetime ASC', [], (err, rows) => {
    if (err) {
      console.error('Database error:', err.message);
      return res.status(500).send('Error retrieving sessions');
    }

    let html = `
      <html>
      <head>
        <title>All Sessions - From 1 to 7 Tutoring</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; }
        </style>
      </head>
      <body>
        <h1>All Booked Sessions</h1>
        <table>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Surname</th>
            <th>Email</th>
            <th>Phone</th>
            <th>Subject</th>
            <th>Topic</th>
            <th>Date & Time</th>
            <th>Payment Method</th>
            <th>Proof of Payment</th>
            <th>Meet Link</th>
          </tr>
    `;

    rows.forEach(row => {
      html += `
        <tr>
          <td>${row.id}</td>
          <td>${row.name}</td>
          <td>${row.surname}</td>
          <td>${row.email}</td>
          <td>${row.phone}</td>
          <td>${row.subject}</td>
          <td>${row.topic}</td>
          <td>${row.datetime}</td>
          <td>${row.paymentMethod || 'Not specified'}</td>
          <td>${row.proofOfPaymentPath ? 'Uploaded' : 'Not provided'}</td>
          <td><a href="${row.meetLink}" target="_blank">Join</a></td>
        </tr>
      `;
    });

    html += `
        </table>
        <p><a href="/">Back to Booking</a></p>
      </body>
      </html>
    `;

    res.send(html);
  });
});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});