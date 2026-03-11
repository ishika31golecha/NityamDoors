const mongoose = require('mongoose');

/**
 * RolePermission Schema
 * Stores module-level permissions for each role.
 * Managed via the Access Control Management page (SuperAdmin only).
 * Collection: role_permissions
 */
const rolePermissionSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    permissions: {
      orders:     { type: Boolean, default: false },
      production: { type: Boolean, default: false },
      inventory:  { type: Boolean, default: false },
      accounts:   { type: Boolean, default: false },
      reports:    { type: Boolean, default: false }
    }
  },
  {
    timestamps: true,
    collection: 'role_permissions'
  }
);

// Default permission set per role — used for seeding and reset
rolePermissionSchema.statics.DEFAULT_MATRIX = {
  SuperAdmin:           { orders: true,  production: true,  inventory: true,  accounts: true,  reports: true  },
  FactoryAdmin:         { orders: true,  production: true,  inventory: true,  accounts: false, reports: true  },
  SalesExecutive:       { orders: true,  production: false, inventory: false, accounts: false, reports: false },
  ProductionSupervisor: { orders: false, production: true,  inventory: false, accounts: false, reports: false },
  InventoryManager:     { orders: false, production: false, inventory: true,  accounts: false, reports: false },
  AccountsManager:      { orders: false, production: false, inventory: false, accounts: true,  reports: false },
  FranchiseeOwner:      { orders: false, production: false, inventory: true,  accounts: false, reports: false }
};

/**
 * Seed default permissions for all roles.
 * Uses upsert so it is safe to call multiple times.
 */
rolePermissionSchema.statics.seedDefaults = async function () {
  const matrix = this.DEFAULT_MATRIX;
  const ops = Object.entries(matrix).map(([role, permissions]) => ({
    updateOne: {
      filter: { role },
      update: { $setOnInsert: { role, permissions } },
      upsert: true
    }
  }));
  return this.bulkWrite(ops);
};

module.exports = mongoose.model('RolePermission', rolePermissionSchema);
