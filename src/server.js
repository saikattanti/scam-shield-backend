const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const analyzeRoutes = require('./routes/analyze');
const feedbackRoutes = require('./routes/feedback');
const { router: tickerRoutes } = require('./routes/ticker');
const { sessionMiddleware, cleanupExpiredSessions } = require('./middleware/session');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(sessionMiddleware);

// Routes
app.use('/api/analyze', analyzeRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/ticker', tickerRoutes);

// Health Check
app.get('/', (req, res) => {
    res.send({ status: 'active', message: 'ScamShield Backend is running' });
});

// Cleanup expired sessions every 6 hours
setInterval(async () => {
  try {
    await cleanupExpiredSessions();
  } catch (error) {
    console.error('Session cleanup failed:', error);
  }
}, 6 * 60 * 60 * 1000);

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Session cleanup scheduled every 6 hours`);
});
