const mongoose = require('mongoose');

/**
 * Database Connection Configuration
 * Connects to MongoDB Atlas using the URI from environment variables
 */
const connectDB = async () => {
  try {
    // Connect to MongoDB Atlas
    const conn = await mongoose.connect(process.env.MONGO_URI);

    console.log(`✅ MongoDB Connected Successfully: ${conn.connection.host}`);
    console.log(`📄 Database Name: ${conn.connection.name}`);
    
    // Connection event listeners for better monitoring
    mongoose.connection.on('disconnected', () => {
      console.log('❌ MongoDB Disconnected');
    });

    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB Connection Error:', err);
    });

  } catch (error) {
    console.error('❌ Database Connection Failed:', error.message);
    
    // Exit process with failure if database connection fails
    process.exit(1);
  }
};

/**
 * Graceful shutdown handler for database connection
 */
const disconnectDB = async () => {
  try {
    await mongoose.connection.close();
    console.log('📴 Database connection closed');
  } catch (error) {
    console.error('❌ Error closing database connection:', error.message);
  }
};

module.exports = { connectDB, disconnectDB };