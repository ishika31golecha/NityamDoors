const jwt = require('jsonwebtoken');
const User = require('../models/User');

// ADDED: Role × Module Permission Matrix (centralized)
const PERMISSION_MATRIX = {
  'SuperAdmin': { orders: true, production: true, inventory: true, accounts: true, reports: true },
  'FactoryAdmin': { orders: true, production: true, inventory: true, accounts: false, reports: true },
  'SalesExecutive': { orders: true, production: false, inventory: false, accounts: false, reports: false },
  'ProductionSupervisor': { orders: false, production: true, inventory: false, accounts: false, reports: false },
  'InventoryManager': { orders: false, production: false, inventory: true, accounts: false, reports: false },
  'AccountsManager': { orders: false, production: false, inventory: false, accounts: true, reports: false },
  'FranchiseeOwner': { orders: false, production: false, inventory: true, accounts: false, reports: 'OWN_ONLY' }
};

/**
 * Authentication Middleware
 * Verifies JWT token and adds user info to request object
 * UPDATED: Improved token expiry handling with detailed error codes
 */
const protect = async (req, res, next) => {
  let token;

  try {
    // Check if authorization header exists and starts with 'Bearer'
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      // Extract token from header
      token = req.headers.authorization.split(' ')[1];
    }

    // Check if no token provided
    if (!token) {
      return res.status(401).json({
        success: false,
        code: 'NO_TOKEN',  // ADDED: Error code for frontend handling
        message: 'Access denied. No token provided.'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ADDED: Check token expiry time remaining (warn if less than 1 hour)
    const expiryTime = decoded.exp * 1000; // Convert to milliseconds
    const timeRemaining = expiryTime - Date.now();
    const oneHour = 60 * 60 * 1000;
    
    if (timeRemaining < oneHour && timeRemaining > 0) {
      // Token expiring soon - add warning header
      res.set('X-Token-Expiring-Soon', 'true');
      res.set('X-Token-Expires-In', Math.floor(timeRemaining / 1000).toString());
    }

    // Find user by ID from token payload
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        code: 'USER_NOT_FOUND',  // ADDED: Error code
        message: 'Token is valid but user no longer exists.'
      });
    }

    // Check if user is active
    if (user.status !== 'active') {
      return res.status(401).json({
        success: false,
        code: 'USER_INACTIVE',  // ADDED: Error code
        message: 'User account is not active. Please contact administrator.'
      });
    }

    // Add user to request object
    req.user = user;
    // ADDED: Add decoded token info for downstream use
    req.tokenInfo = {
      issuedAt: new Date(decoded.iat * 1000),
      expiresAt: new Date(decoded.exp * 1000),
      roles: decoded.roles || []
    };
    next();

  } catch (error) {
    console.error('Authentication Error:', error.message);

    // Handle specific JWT errors
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        code: 'INVALID_TOKEN',  // ADDED: Error code
        message: 'Invalid token format.'
      });
    }

    // UPDATED: Enhanced token expiry error with code
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        code: 'TOKEN_EXPIRED',  // ADDED: Error code for frontend to trigger re-login
        message: 'Token has expired. Please login again.',
        expiredAt: error.expiredAt  // ADDED: When token expired
      });
    }

    return res.status(401).json({
      success: false,
      code: 'AUTH_FAILED',  // ADDED: Error code
      message: 'Token verification failed.'
    });
  }
};

/**
 * Role-Based Authorization Middleware
 * Restricts access based on user roles (supports both single role and multi-role users)
 * @param {...string} roles - Allowed roles for the route
 * @returns {Function} - Express middleware function
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    // Check if user exists in request (should be added by protect middleware)
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Please login to access this resource.'
      });
    }

    // Get user's roles (support both single role and multi-role)
    const userRoles = req.user.roles && req.user.roles.length > 0 
      ? req.user.roles 
      : [req.user.role];

    // Check if any of user's roles match the allowed roles
    const hasPermission = userRoles.some(userRole => roles.includes(userRole));

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required roles: ${roles.join(', ')}. Your roles: ${userRoles.join(', ')}`
      });
    }

    next();
  };
};

/**
 * Admin Authorization Middleware
 * Only allows SuperAdmin and FactoryAdmin access
 */
const adminOnly = authorize('SuperAdmin', 'FactoryAdmin');

/**
 * Super Admin Authorization Middleware
 * Only allows SuperAdmin access
 */
const superAdminOnly = authorize('SuperAdmin');

/**
 * Management Authorization Middleware
 * Allows management level roles access
 */
const managementOnly = authorize(
  'SuperAdmin', 
  'FactoryAdmin', 
  'ProductionSupervisor', 
  'InventoryManager', 
  'AccountsManager'
);

/**
 * ADDED: Franchise Data Filter Middleware
 * Filters data access for FranchiseeOwner role - allows only OWN franchise data
 * Use this middleware on report routes to restrict FranchiseeOwner access
 */
const filterByFranchise = (req, res, next) => {
  // Check if user exists
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Please login to access this resource.'
    });
  }

  // Get user's roles
  const userRoles = req.user.roles && req.user.roles.length > 0 
    ? req.user.roles 
    : [req.user.role];

  // Check if user is FranchiseeOwner
  const isFranchiseeOwner = userRoles.includes('FranchiseeOwner');
  
  // If FranchiseeOwner, enforce franchise filtering
  if (isFranchiseeOwner) {
    // Check if franchiseId exists for this user
    if (!req.user.franchiseId) {
      return res.status(403).json({
        success: false,
        message: 'FranchiseeOwner must have a franchiseId assigned. Contact administrator.'
      });
    }
    
    // ADDED: Set franchise filter flag on request for use in route handlers
    req.franchiseFilter = {
      enabled: true,
      franchiseId: req.user.franchiseId,
      accessLevel: 'OWN_ONLY'
    };
    
    // Block factory-wide report requests
    if (req.query.scope === 'factory' || req.query.scope === 'all') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. FranchiseeOwner can only view own franchise reports.'
      });
    }
    
    // Auto-add franchiseId filter to query
    req.query.franchiseId = req.user.franchiseId;
  } else {
    // Non-franchisee users have full access
    req.franchiseFilter = {
      enabled: false,
      accessLevel: 'FULL'
    };
  }

  next();
};

/**
 * ADDED: Check if user has limited (OWN_ONLY) access to a module
 * @param {Object} user - User object
 * @param {string} module - Module name (e.g., 'reports')
 * @returns {boolean} - True if access is limited to own data only
 */
const hasLimitedAccess = (user, module) => {
  const userRoles = user.roles && user.roles.length > 0 ? user.roles : [user.role];
  
  // FranchiseeOwner has limited access to reports
  if (userRoles.includes('FranchiseeOwner') && module === 'reports') {
    return true;
  }
  return false;
};

/**
 * Optional Authentication Middleware
 * Adds user info to request if token is provided, but doesn't require it
 */
const optionalAuth = async (req, res, next) => {
  let token;

  try {
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
      
      if (token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password');
        
        if (user && user.status === 'active') {
          req.user = user;
        }
      }
    }
  } catch (error) {
    // Silently ignore errors for optional auth
    console.log('Optional auth failed:', error.message);
  }

  next();
};

/**
 * ADDED: Role Guard Middleware
 * Strictly checks if user has ANY of the required roles
 * More explicit than authorize() - use for critical routes
 * @param {Array} allowedRoles - Array of allowed role names
 * @param {Object} options - Optional settings
 * @param {boolean} options.requireAll - If true, user must have ALL roles (default: false)
 */
const roleGuard = (allowedRoles, options = {}) => {
  const { requireAll = false } = options;
  
  return (req, res, next) => {
    // Ensure protect middleware ran first
    if (!req.user) {
      return res.status(401).json({
        success: false,
        code: 'NOT_AUTHENTICATED',
        message: 'Authentication required. Please login first.'
      });
    }

    // Get user's roles
    const userRoles = req.user.roles && req.user.roles.length > 0 
      ? req.user.roles 
      : [req.user.role];

    let hasAccess = false;

    if (requireAll) {
      // User must have ALL specified roles
      hasAccess = allowedRoles.every(role => userRoles.includes(role));
    } else {
      // User must have AT LEAST ONE of the specified roles
      hasAccess = allowedRoles.some(role => userRoles.includes(role));
    }

    if (!hasAccess) {
      console.warn(`[ROLE_GUARD] Access denied for user ${req.user.email}. Required: ${allowedRoles.join(', ')}. Has: ${userRoles.join(', ')}`);
      return res.status(403).json({
        success: false,
        code: 'ROLE_NOT_ALLOWED',
        message: 'Access denied. You do not have the required role for this action.',
        required: allowedRoles,
        userRoles: userRoles
      });
    }

    // ADDED: Attach role info to request for logging
    req.roleGuard = {
      allowedRoles,
      userRoles,
      requireAll
    };

    next();
  };
};

/**
 * ADDED: Permission Guard Middleware
 * Checks if user has permission to access a specific module
 * Uses centralized PERMISSION_MATRIX
 * @param {string} module - Module name (orders, production, inventory, accounts, reports)
 * @param {Object} options - Optional settings
 * @param {string} options.action - Action type (read, write, delete) - for future use
 */
const permissionGuard = (module, options = {}) => {
  const { action = 'read' } = options;
  
  return (req, res, next) => {
    // Ensure protect middleware ran first
    if (!req.user) {
      return res.status(401).json({
        success: false,
        code: 'NOT_AUTHENTICATED',
        message: 'Authentication required. Please login first.'
      });
    }

    // Get user's primary role (first role in array)
    const userRoles = req.user.roles && req.user.roles.length > 0 
      ? req.user.roles 
      : [req.user.role];
    const primaryRole = userRoles[0];

    // Check permission matrix
    const rolePermissions = PERMISSION_MATRIX[primaryRole];
    
    if (!rolePermissions) {
      console.error(`[PERMISSION_GUARD] Unknown role: ${primaryRole}`);
      return res.status(403).json({
        success: false,
        code: 'UNKNOWN_ROLE',
        message: 'Access denied. Your role is not recognized.'
      });
    }

    const moduleAccess = rolePermissions[module];

    // Check access level
    if (moduleAccess === false) {
      console.warn(`[PERMISSION_GUARD] Access denied for ${req.user.email} to module: ${module}`);
      return res.status(403).json({
        success: false,
        code: 'MODULE_ACCESS_DENIED',
        message: `Access denied. Your role (${primaryRole}) cannot access the ${module} module.`,
        module: module,
        role: primaryRole
      });
    }

    // ADDED: Handle 'OWN_ONLY' access level
    if (moduleAccess === 'OWN_ONLY') {
      req.accessLevel = 'OWN_ONLY';
      req.permissionGuard = {
        module,
        access: 'OWN_ONLY',
        role: primaryRole,
        message: 'Limited access - own data only'
      };
      // Let filterByFranchise middleware handle the actual filtering
    } else {
      req.accessLevel = 'FULL';
      req.permissionGuard = {
        module,
        access: 'FULL',
        role: primaryRole
      };
    }

    next();
  };
};

/**
 * ADDED: Get permission matrix (for frontend sync)
 */
const getPermissionMatrix = () => PERMISSION_MATRIX;

module.exports = {
  protect,
  authorize,
  adminOnly,
  superAdminOnly,
  managementOnly,
  optionalAuth,
  filterByFranchise,
  hasLimitedAccess,
  roleGuard,           // ADDED: Strict role checking middleware
  permissionGuard,     // ADDED: Module permission checking middleware
  getPermissionMatrix, // ADDED: Get permission matrix for frontend sync
  PERMISSION_MATRIX    // ADDED: Export matrix for reference
};