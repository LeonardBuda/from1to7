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

// SQLite setup
const db = new sqlite3.Database(':memory:', (err) => {
  if (err) console.error('SQLite error:', err.message);
  console.log('Connected to SQLite database.');
});

db.run(`CREATE TABLE bookings (
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

        // Send email
        const mailOptions = {
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

        transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
            console.error('Email error:', error.message);
          } else {
            console.log('Email sent:', info.response);
          }
        });

        // Send SMS
        twilioClient.messages.create({
          body: `From 1 to 7 Tutoring: Your session for ${subject} (${topic}) is confirmed for ${datetime}. Payment Method: ${paymentMethod || 'Not specified'}. Join: ${meetLink}`,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: phone
        }).then(message => {
          console.log('SMS sent:', message.sid);
        }).catch(error => {
          console.error('SMS error:', error.message);
        });

        res.json({ success: true });
      }
    );
  } catch (err) {
    console.error('Server error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});