const express = require('express');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const nodemailer = require('nodemailer');
const twilio = require('twilio');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Validate environment variables
const requiredEnvVars = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_PHONE_NUMBER',
  'GMAIL_USER',
  'GMAIL_PASS'
];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
  console.error(`Missing environment variables: ${missingEnvVars.join(', ')}`);
  process.exit(1); // Exit to prevent runtime errors
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Multer setup for file uploads
const upload = multer({ dest: 'uploads/' });

// Twilio setup
let twilioClient;
try {
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
} catch (err) {
  console.error('Twilio initialization error:', err.message);
  process.exit(1);
}

// Nodemailer setup
let transporter;
try {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS
    }
  });
} catch (err) {
  console.error('Nodemailer initialization error:', err.message);
  process.exit(1);
}

// Google Meet link
const meetLink = 'https://meet.google.com/vee-wxwv-nof';

// SQLite setup (file-based)
const db = new sqlite3.Database('bookings.db', (err) => {
  if (err) {
    console.error('SQLite error:', err.message);
    process.exit(1);
  }
  console.log('Connected to SQLite database (bookings.db).');
});

// Create bookings table
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
  paymentMethod TEXT
)`, (err) => {
  if (err) {
    console.error('Error creating bookings table:', err.message);
  }
});

// Create testimonials table
db.run(`CREATE TABLE IF NOT EXISTS testimonials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rating INTEGER,
  comment TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`, (err) => {
  if (err) {
    console.error('Error creating testimonials table:', err.message);
  }
});

// Serve the HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Handle booking
app.post('/book', upload.single('questions'), async (req, res) => {
  const {
    name, surname, age, gender, township, city, postalCode, province,
    phone, email, school, grade, subject, topic, comments, datetime,
    paymentMethod
  } = req.body;
  const questionsPath = req.file ? req.file.path : null;

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
        datetime, meetLink, paymentMethod
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name, surname, age, gender, township, city, postalCode, province,
        phone, email, school, grade, subject, topic, questionsPath, comments,
        datetime, meetLink, paymentMethod
      ],
      async function(err) {
        if (err) {
          console.error('Database error:', err.message);
          return res.status(500).json({ success: false, message: 'Database error' });
        }

        const bookingId = this.lastID;
        const booking = {
          id: bookingId,
          name, surname, email, phone, subject, topic, datetime,
        };

        // Send email to tutor
        const tutorMailOptions = {
          from: `"From 1 to 7 Tutoring" <${process.env.GMAIL_USER}>`,
          to: process.env.GMAIL_USER,
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
            <p>Join the session: <a href="${meetLink}">Click here</a></p>
          `
        };

        try {
          await transporter.sendMail(tutorMailOptions);
          console.log('Tutorするためemail sent');
        } catch (error) {
          console.error('Tutor email error:', error.message);
        }

        // Send email to student
        const studentMailOptions = {
          from: `"From 1 to 7 Tutoring" <${process.env.GMAIL_USER}>`,
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
            <p>Join your session: <a href="${meetLink}">Click here</a></p>
          `
        };

        try {
          await transporter.sendMail(studentMailOptions);
          console.log('Student email sent');
        } catch (error) {
          console.error('Student email error:', error.message);
        }

        // Send SMS to tutor
        try {
          await twilioClient.messages.create({
            body: `New booking: ${name} ${surname} for ${subject} (${topic}) on ${datetime}. Payment: ${paymentMethod || 'Not specified'}. Join: ${meetLink}`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: '+27766440806'
          });
          console.log('Tutor SMS sent');
        } catch (error) {
          console.error('Tutor SMS error:', error.message);
        }

        // Send SMS to student
        try {
          await twilioClient.messages.create({
            body: `From 1 to 7 Tutoring: Your session for ${subject} (${topic}) is confirmed for ${datetime}. Payment Method: ${paymentMethod || 'Not specified'}. Join: ${meetLink}`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: phone
          });
          console.log('Student SMS sent');
        } catch (error) {
          console.error('Student SMS error:', error.message);
        }

        res.json({ success: true });
      }
    );
  } catch (err) {
    console.error('Server error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Handle testimonial submission
app.post('/testimonials', upload.none(), (req, res) => {
  const { rating, comment } = req.body;

  // Validate rating
  const parsedRating = parseInt(rating);
  if (!parsedRating || parsedRating < 1 || parsedRating > 5) {
    return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
  }

  // Store testimonial in database
  db.run(
    `INSERT INTO testimonials (rating, comment) VALUES (?, ?)`,
    [parsedRating, comment || null],
    function(err) {
      if (err) {
        console.error('Database error:', err.message);
        return res.status(500).json({ success: false, message: 'Database error' });
      }
      res.json({ success: true });
    }
  );
});

// Retrieve testimonials
app.get('/testimonials', (req, res) => {
  db.all('SELECT * FROM testimonials ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      console.error('Database error:', err.message);
      return res.status(500).json({ success: false, message: 'Error retrieving testimonials' });
    }

    // Calculate average rating
    const totalRatings = rows.length;
    const sumRatings = rows.reduce((sum, row) => sum + row.rating, 0);
    const averageRating = totalRatings > 0 ? sumRatings / totalRatings : 0;

    res.json({
      success: true,
      testimonials: rows,
      averageRating
    });
  });
});

// View all sessions (simple password protection)
app.get('/sessions', (req, res) => {
  const password = req.query.password;
  if (password !== 'tutor123') {
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

// Start server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});