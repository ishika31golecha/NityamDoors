/**
 * Smart Door ERP Backend Server
 * A FREE manufacturing ERP system built with Node.js, Express.js, and MongoDB
 */

// Load environment variables first
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { connectDB } = require('./config/db');

// Import route files
const authRoutes = require('./routes/authRoutes');
const recordRoutes = require('./routes/recordRoutes');
const customerRoutes = require('./routes/customerRoutes');
const productionRoutes = require('./routes/productionRoutes');
const orderRoutes = require('./routes/orderRoutes');
const adminRoutes = require('./routes/adminRoutes');
const workerRoutes = require('./routes/workerRoutes');

// Initialize Express app
const app = express();

// Connect to database
connectDB();

// Middleware setup
app.use(express.json({ limit: '10mb' })); // Body parser with size limit
app.use(express.urlencoded({ extended: true })); // URL encoded parser

// Serve static frontend files from root directory
app.use(express.static('.'));

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://yourdomain.com'] // Add your production domain here
    : [
        'http://localhost:3000', 
        'http://localhost:3001', 
        'http://localhost:5500',
        'http://127.0.0.1:5500',
        'http://localhost:8080',
        'http://127.0.0.1:8080'
      ], // Development origins including Live Server
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Request logging middleware (Development only)
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path} - ${new Date().toISOString()}`);
    next();
  });
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Smart Door ERP Backend is running successfully!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0'
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/records', recordRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/production', productionRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/workers', workerRoutes);
app.use('/api/admin', adminRoutes);

// Serve index.html as fallback for SPA routing
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// Error handling middleware for undefined routes
app.all('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found on this server.`,
    availableRoutes: {
      root: 'GET /',
      health: 'GET /health',
      auth: '/api/auth/*',
      records: '/api/records/*'
    }
  });
});

// Global error handling middleware
app.use((error, req, res, next) => {
  console.error('Global Error Handler:', error);

  // Default error
  let err = { ...error };
  err.message = error.message;

  // Log error details in development
  if (process.env.NODE_ENV === 'development') {
    console.error('Error Stack:', error.stack);
  }

  // Mongoose bad ObjectId
  if (error.name === 'CastError') {
    const message = 'Resource not found';
    err = { message, statusCode: 404 };
  }

  // Mongoose duplicate key
  if (error.code === 11000) {
    const message = 'Duplicate field value entered';
    err = { message, statusCode: 400 };
  }

  // Mongoose validation error
  if (error.name === 'ValidationError') {
    const message = Object.values(error.errors).map(val => val.message);
    err = { message, statusCode: 400 };
  }

  res.status(err.statusCode || 500).json({
    success: false,
    error: err.message || 'Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
});

// Set port from environment or default to 5000
const PORT = process.env.PORT || 5000;

// Start server
const server = app.listen(PORT, () => {
  console.log(`
🚪 ===================================== 🚪
   Smart Door ERP Backend Server
🚪 ===================================== 🚪

✅ Server running on port ${PORT}
🌍 Environment: ${process.env.NODE_ENV || 'development'}
📱 Health check: http://localhost:${PORT}/health
📚 API docs: http://localhost:${PORT}/
🔐 Auth endpoint: http://localhost:${PORT}/api/auth
📊 Records endpoint: http://localhost:${PORT}/api/records

🚪 Ready to handle manufacturing ERP requests! 🚪
  `);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.error('❌ Unhandled Promise Rejection:', err.message);
  
  // Close server & exit process
  server.close(() => {
    console.log('🔄 Server closed due to unhandled promise rejection');
    process.exit(1);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err.message);
  console.log('🔄 Shutting down server due to uncaught exception');
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('📴 SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('🔄 Process terminated');
  });
});

process.on('SIGINT', () => {
  console.log('📴 SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('🔄 Process terminated');
  });
});

module.exports = app;