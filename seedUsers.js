const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Import User model
const User = require('./models/User');

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected for seeding...');
  } catch (error) {
    console.error('Database connection error:', error);
    process.exit(1);
  }
};

// Test users for all 7 roles
const testUsers = [
  {
    name: 'Super Administrator',
    email: 'superadmin@smartdoor.com',
    password: 'admin123',
    role: 'SuperAdmin'
  },
  {
    name: 'Factory Administrator',
    email: 'factory@smartdoor.com',
    password: 'factory123',
    role: 'FactoryAdmin'
  },
  {
    name: 'Sales Executive',
    email: 'sales@smartdoor.com',
    password: 'sales123',
    role: 'SalesExecutive'
  },
  {
    name: 'Production Supervisor',
    email: 'production@smartdoor.com',
    password: 'production123',
    role: 'ProductionSupervisor'
  },
  {
    name: 'Inventory Manager',
    email: 'inventory@smartdoor.com',
    password: 'inventory123',
    role: 'InventoryManager'
  },
  {
    name: 'Accounts Manager',
    email: 'accounts@smartdoor.com',
    password: 'accounts123',
    role: 'AccountsManager'
  },
  {
    name: 'Franchisee Owner',
    email: 'franchisee@smartdoor.com',
    password: 'franchisee123',
    role: 'FranchiseeOwner'
  }
];

// Seed function
const seedUsers = async () => {
  try {
    // Clear existing users (optional)
    console.log('Clearing existing users...');
    await User.deleteMany({});
    
    console.log('Creating test users...');
    
    for (let userData of testUsers) {
      // Check if user already exists
      const existingUser = await User.findOne({ 
        email: userData.email
      });

      if (!existingUser) {
        // Create user - let the User model handle password hashing via pre-save middleware
        const user = new User({
          name: userData.name,
          email: userData.email,
          password: userData.password, // Plain text password - will be hashed by pre-save middleware
          role: userData.role
        });
        
        await user.save();
        console.log(`✅ Created ${userData.role}: ${userData.name}`);
      } else {
        console.log(`⚠️  User ${userData.name} already exists`);
      }
    }
    
    console.log('\n🎉 User seeding completed!');
    console.log('\n📋 TEST LOGIN CREDENTIALS:');
    console.log('================================');
    
    testUsers.forEach(user => {
      console.log(`${user.role}:`);
      console.log(`  Email: ${user.email}`);
      console.log(`  Password: ${user.password}`);
      console.log(`  Name: ${user.name}`);
      console.log('  ---');
    });
    
    console.log('\n🔗 Use these credentials to login at: http://localhost:3000/login.html');
    
  } catch (error) {
    console.error('Error seeding users:', error);
  } finally {
    mongoose.connection.close();
    console.log('\n💾 Database connection closed.');
  }
};

// Run the seeding
const runSeed = async () => {
  await connectDB();
  await seedUsers();
};

runSeed();