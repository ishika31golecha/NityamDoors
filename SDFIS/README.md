# Smart Door ERP Backend 🚪

A completely **FREE** manufacturing ERP backend system built with modern technologies. Perfect for small to medium manufacturing businesses looking for a cost-effective ERP solution.

## 🌟 Features

- **100% FREE** - No paid services or libraries
- **Role-Based Access Control** - 7 different user roles with specific permissions
- **JWT Authentication** - Secure token-based authentication
- **RESTful APIs** - Clean and well-documented API endpoints
- **MongoDB Atlas** - Free cloud database (M0 tier)
- **Production Ready** - Error handling, logging, and graceful shutdown
- **Scalable Architecture** - Modular design for easy extension

## 🏗️ Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | ^18.0.0 | Server runtime |
| Express.js | ^4.18.2 | Web framework |
| MongoDB Atlas | Free M0 | Database (cloud) |
| Mongoose | ^8.0.0 | ODM for MongoDB |
| JWT | ^9.0.2 | Authentication |
| bcryptjs | ^2.4.3 | Password hashing |
| dotenv | ^16.3.1 | Environment variables |
| cors | ^2.8.5 | Cross-origin requests |

## 🚀 Quick Start

### Prerequisites
- Node.js (v18 or higher)
- MongoDB Atlas account (free)
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd smart-door-erp-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Setup MongoDB Atlas**
   - Create a free account at [MongoDB Atlas](https://www.mongodb.com/atlas)
   - Create a new cluster (M0 - Free tier)
   - Create a database user
   - Get your connection string

4. **Environment Setup**
   - Copy the `.env` file and update with your values:
   ```env
   MONGO_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/smart-door-erp?retryWrites=true&w=majority
   JWT_SECRET=YourSecureJWTSecretKey
   PORT=5000
   NODE_ENV=development
   ```

5. **Start the server**
   ```bash
   # Development mode with auto-restart
   npm run dev
   
   # Production mode
   npm start
   ```

6. **Test the installation**
   - Open: http://localhost:5000
   - Health check: http://localhost:5000/health

## 👥 User Roles & Permissions

| Role | Create Records | Read Records | Update Records | Delete Records | Manage Users |
|------|----------------|--------------|----------------|----------------|--------------|
| **SuperAdmin** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **FactoryAdmin** | ✅ | ✅ | ✅ | ❌ | ✅ |
| **SalesExecutive** | ❌ | ✅ | Own only | ❌ | ❌ |
| **ProductionSupervisor** | ❌ | ✅ | Own only | ❌ | ❌ |
| **InventoryManager** | ❌ | ✅ | Own only | ❌ | ❌ |
| **AccountsManager** | ❌ | ✅ | Own only | ❌ | ❌ |
| **FranchiseeOwner** | ❌ | ✅ | Own only | ❌ | ❌ |

## 📚 API Documentation

### Base URL
```
http://localhost:5000
```

### Authentication
All protected routes require JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

### 🔐 Authentication Endpoints

#### Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "role": "SalesExecutive"
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "password123"
}
```

#### Get Profile
```http
GET /api/auth/me
Authorization: Bearer <token>
```

#### Update Profile
```http
PUT /api/auth/profile
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "John Updated"
}
```

#### Get All Users (Admin Only)
```http
GET /api/auth/users?role=SalesExecutive&page=1&limit=10
Authorization: Bearer <admin-token>
```

### 📊 Record Management Endpoints

#### Create Record (Admin Only)
```http
POST /api/records
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "title": "Production Report Q1",
  "description": "Quarterly production analysis and metrics",
  "category": "Production",
  "priority": "high",
  "tags": ["production", "quarterly", "analysis"]
}
```

#### Get All Records
```http
GET /api/records?category=Production&page=1&limit=10&search=report
Authorization: Bearer <token>
```

#### Get Single Record
```http
GET /api/records/:recordId
Authorization: Bearer <token>
```

#### Update Record
```http
PUT /api/records/:recordId
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Updated Production Report Q1",
  "status": "completed"
}
```

#### Delete Record (SuperAdmin Only)
```http
DELETE /api/records/:recordId
Authorization: Bearer <superadmin-token>
```

#### Get Records by Category
```http
GET /api/records/category/Production
Authorization: Bearer <token>
```

#### Get My Records
```http
GET /api/records/user/my-records
Authorization: Bearer <token>
```

#### Get Record Statistics (Admin Only)
```http
GET /api/records/stats/overview
Authorization: Bearer <admin-token>
```

## 📁 Project Structure

```
smart-door-erp-backend/
│
├── config/
│   └── db.js                 # Database connection
│
├── middleware/
│   └── authMiddleware.js     # Authentication & authorization
│
├── models/
│   ├── User.js              # User schema with roles
│   └── Record.js            # Generic record schema
│
├── routes/
│   ├── authRoutes.js        # Authentication routes
│   └── recordRoutes.js      # CRUD routes with RBAC
│
├── .env                     # Environment variables
├── package.json             # Dependencies and scripts
├── server.js               # Main server file
└── README.md               # This file
```

## 🔧 Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `MONGO_URI` | MongoDB Atlas connection string | `mongodb+srv://user:pass@cluster0.mongodb.net/db` |
| `JWT_SECRET` | Secret key for JWT token signing | `your-super-secret-key` |
| `PORT` | Server port | `5000` |
| `NODE_ENV` | Environment mode | `development` or `production` |

## 🧪 Testing the API

### Using cURL

1. **Register a user**
   ```bash
   curl -X POST http://localhost:5000/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Test User",
       "email": "test@example.com",
       "password": "password123",
       "role": "SuperAdmin"
     }'
   ```

2. **Login and get token**
   ```bash
   curl -X POST http://localhost:5000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{
       "email": "test@example.com",
       "password": "password123"
     }'
   ```

3. **Create a record**
   ```bash
   curl -X POST http://localhost:5000/api/records \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <your-token>" \
     -d '{
       "title": "Test Record",
       "description": "This is a test record",
       "category": "General"
     }'
   ```

### Using Postman

1. Import the endpoints into Postman
2. Set up environment variables for base URL and token
3. Test each endpoint with the appropriate role

## 🚨 Common Issues & Solutions

### MongoDB Connection Issues
```bash
# Error: MongoServerError: bad auth Authentication failed
# Solution: Check username, password, and IP whitelist in MongoDB Atlas
```

### JWT Token Issues
```bash
# Error: JsonWebTokenError: invalid token
# Solution: Ensure token is properly formatted: "Bearer <token>"
```

### Port Already in Use
```bash
# Error: EADDRINUSE :::5000
# Solution: Change PORT in .env file or kill process using port 5000
```

## 📈 Scaling & Production

### Performance Tips
- Use MongoDB indexes for frequently queried fields
- Implement caching with Redis (free tiers available)
- Add rate limiting for API protection
- Use compression middleware for response optimization

### Security Enhancements
- Implement password complexity requirements
- Add account lockout after failed attempts
- Use HTTPS in production
- Implement request validation with Joi or express-validator

### Deployment Options (FREE)
- **Heroku** - Free tier (with limitations)
- **Railway** - Free tier with GitHub integration
- **Render** - Free tier for web services
- **Vercel** - Free for API functions

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

If you encounter any issues:

1. Check the [Common Issues](#🚨-common-issues--solutions) section
2. Search existing GitHub issues
3. Create a new issue with detailed description
4. Join our Discord community (link coming soon)

## 🎯 Roadmap

- [ ] Add email notifications
- [ ] Implement file upload functionality
- [ ] Add audit logging
- [ ] Create dashboard analytics
- [ ] Add batch operations
- [ ] Implement data export features
- [ ] Add WebSocket support for real-time updates

---

**Made with ❤️ for the manufacturing community**

*This project aims to provide a completely free ERP solution for small and medium manufacturing businesses. No hidden costs, no paid tiers - just open-source goodness!*