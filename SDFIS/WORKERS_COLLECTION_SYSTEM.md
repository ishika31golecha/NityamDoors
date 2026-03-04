/**
 * WORKERS COLLECTION AND REFERENCE SYSTEM
 * 
 * Implementation of worker master data storage and production tracking
 * with proper MongoDB references and populate() logic
 */

// ============================================
// 1. WORKER SCHEMA (models/Worker.js)
// ============================================

/**
 * Minimal Worker Collection Structure
 * 
 * Schema Fields:
 * {
 *   workerId: String (unique, required)
 *     - Unique identifier for the worker
 *     - e.g., "W001", "W002"
 *     - Stored in uppercase
 *     - Has unique index
 * 
 *   name: String (required)
 *     - Worker's full name
 * 
 *   phone: String (optional)
 *     - Contact number
 * 
 *   aadhaarNumber: String (optional)
 *     - Stored only in masked format
 *     - e.g., "XXXX-XXXX-1234"
 *     - Privacy consideration
 * 
 *   status: String (enum: ACTIVE, INACTIVE)
 *     - Worker availability status
 *     - Default: ACTIVE
 *     - Has index for filtering
 * 
 *   timestamps: true
 *     - Auto-managed createdAt, updatedAt
 * }
 */

// ============================================
// 2. WORKER API ROUTES
// ============================================

/**
 * Configuration:
 * Base URL: /api/workers
 * Authorization: FactoryAdmin, ProductionSupervisor, SuperAdmin
 */

/**
 * GET /api/workers
 * - Fetch all workers
 * - Query params: ?status=ACTIVE or ?status=INACTIVE
 * - Returns: Array of worker objects with count
 */

/**
 * GET /api/workers/:id
 * - Get specific worker by MongoDB _id
 * - Returns: Single worker object with all fields
 */

/**
 * POST /api/workers
 * - Create new worker (FactoryAdmin, SuperAdmin only)
 * - Body: { workerId, name, phone?, aadhaarNumber?, status? }
 * - Validation: workerId must be unique
 * - Returns: Created worker object
 */

/**
 * PUT /api/workers/:id
 * - Update worker (FactoryAdmin, SuperAdmin only)
 * - Body: Any fields to update
 * - Returns: Updated worker object
 */

/**
 * DELETE /api/workers/:id
 * - Soft delete worker (SuperAdmin only)
 * - Sets status to INACTIVE (records preserved)
 * - Returns: Updated worker object
 */

// ============================================
// 3. PRODUCTION SCHEMA UPDATE
// ============================================

/**
 * BEFORE:
 * stageHistory[].worker = String (worker name stored directly)
 * 
 * Example:
 * {
 *   stage: "CUTTING",
 *   worker: "Aman",              // ❌ String stored directly
 *   quality: "OK",
 *   timestamp: Date
 * }
 * 
 * PROBLEM:
 * - Denormalized data
 * - No reference to workers collection
 * - Inconsistent worker names
 * - Cannot fetch worker details
 */

/**
 * AFTER:
 * stageHistory[].worker = ObjectId (reference to Worker model)
 * 
 * Example:
 * {
 *   stage: "CUTTING",
 *   worker: ObjectId("507f1f77bcf86cd799439011"),  // ✅ ObjectId reference
 *   quality: "OK",
 *   timestamp: Date
 * }
 * 
 * BENEFIT:
 * - Normalized data
 * - Reference to workers collection
 * - Consistent data integrity
 * - Can populate() to get worker details
 * - Can query worker info easily
 */

// ============================================
// 4. POPULATE LOGIC IN PRODUCTION ROUTES
// ============================================

/**
 * Simple populate() Example (for direct queries):
 * 
 * const doorUnit = await DoorUnit.findById(doorId)
 *   .populate('stageHistory.worker', 'workerId name phone status');
 *   // Select specific fields from populated Worker
 * 
 * Result:
 * {
 *   orderId: "ORD001",
 *   doorNumber: 1,
 *   currentStage: "CUTTING",
 *   stageHistory: [
 *     {
 *       stage: "CUTTING",
 *       worker: {
 *         _id: ObjectId("507f..."),
 *         workerId: "W001",
 *         name: "Aman",
 *         phone: "9876543210",
 *         status: "ACTIVE"
 *       },
 *       quality: "OK"
 *     }
 *   ]
 * }
 */

/**
 * Aggregation Pipeline $lookup Example:
 * 
 * Used in worker-history and worker-performance routes:
 * 
 * const results = await DoorUnit.aggregate([
 *   { $unwind: '$stageHistory' },
 *   { $match: { /* date filters */ } },
 *   {
 *     $lookup: {
 *       from: 'workers',
 *       localField: 'stageHistory.worker',
 *       foreignField: '_id',
 *       as: 'workerDetails'
 *     }
 *   },
 *   { $unwind: '$workerDetails' },
 *   { $group: { /* grouping logic */ } }
 * ]);
 */

// ============================================
// 5. UPDATING PRODUCTION STAGE (API)
// ============================================

/**
 * POST /api/production/update-stage
 * 
 * BEFORE:
 * Body: { orderId, doorNumber, stage, worker: "Aman", quality, reason? }
 * Issue: Sent worker name as string
 * 
 * AFTER:
 * Body: { orderId, doorNumber, stage, workerId: "W001", quality, reason? }
 * 
 * Backend processing:
 * 1. Validate workerId exists in workers collection
 * 2. Create stageHistory entry with workerId (ObjectId)
 * 3. Store ObjectId reference instead of name string
 * 4. When fetching data, use populate() to get worker details
 */

// ============================================
// 6. DOCUMENT STRUCTURE EXAMPLE
// ============================================

/**
 * Workers Collection:
 * db.workers
 * [
 *   {
 *     _id: ObjectId("507f1f77bcf86cd799439010"),
 *     workerId: "W001",
 *     name: "Aman Kumar",
 *     phone: "9876543210",
 *     aadhaarNumber: "XXXX-XXXX-1234",
 *     status: "ACTIVE",
 *     createdAt: ISODate("2026-02-10T10:00:00Z"),
 *     updatedAt: ISODate("2026-02-15T15:30:00Z")
 *   },
 *   {
 *     _id: ObjectId("507f1f77bcf86cd799439011"),
 *     workerId: "W002",
 *     name: "Rajesh Singh",
 *     phone: "9876543211",
 *     aadhaarNumber: "XXXX-XXXX-5678",
 *     status: "ACTIVE",
 *     createdAt: ISODate("2026-02-10T10:00:00Z"),
 *     updatedAt: ISODate("2026-02-15T15:30:00Z")
 *   }
 * ]
 * 
 * Production Collection (door units):
 * db.production
 * [
 *   {
 *     _id: ObjectId("507f1f77bcf86cd799439020"),
 *     orderId: "ORD001",
 *     doorNumber: 1,
 *     currentStage: "CUTTING",
 *     stageHistory: [
 *       {
 *         stage: "CUTTING",
 *         worker: ObjectId("507f1f77bcf86cd799439010"),  // Reference to W001
 *         quality: "OK",
 *         timestamp: ISODate("2026-02-15T10:30:00Z")
 *       }
 *     ],
 *     createdAt: ISODate("2026-02-15T09:00:00Z"),
 *     updatedAt: ISODate("2026-02-15T10:30:00Z")
 *   }
 * ]
 */

// ============================================
// 7. FETCHING DATA WITH WORKER DETAILS
// ============================================

/**
 * Query 1: Get production data with worker names
 * 
 * Method 1: Using populate() (simple queries)
 * const doors = await DoorUnit.find({ orderId: "ORD001" })
 *   .populate('stageHistory.worker', 'workerId name');
 * 
 * Returns:
 * {
 *   stageHistory: [
 *     {
 *       worker: {
 *         _id: ObjectId("..."),
 *         workerId: "W001",
 *         name: "Aman Kumar"
 *       }
 *     }
 *   ]
 * }
 */

/**
 * Query 2: Worker performance for a date
 * 
 * Uses aggregation pipeline with $lookup:
 * 
 * GET /api/production/worker-performance?type=daily&date=2026-02-15
 * 
 * Returns:
 * {
 *   summary: [
 *     {
 *       workerId: ObjectId("..."),
 *       workerName: "Aman Kumar",
 *       stages: {
 *         CUTTING: 10,
 *         PROCESSING: 5
 *       },
 *       totalDoorsForWorker: 15
 *     }
 *   ]
 * }
 */

// ============================================
// 8. MIGRATIONS & CONSIDERATIONS
// ============================================

/**
 * For existing production data:
 * 
 * Current state: stageHistory.worker contains worker names (strings)
 * 
 * Options:
 * 1. Migrate old documents to use worker references
 *    - Find worker by name
 *    - Update stageHistory.worker to ObjectId
 * 
 * 2. Handle both formats in queries
 *    - If worker is string, keep as is
 *    - If worker is ObjectId, populate to get name
 *    - Gradually migrate old data
 * 
 * 3. Start fresh with new data only
 *    - New production entries use workerId
 *    - Old entries kept as is (read-only)
 */

/**
 * Migration Script Example (optional):
 * 
 * async function migrateWorkerReferences() {
 *   const doorUnits = await DoorUnit.find({
 *     'stageHistory.worker': { $type: 'string' }
 *   });
 * 
 *   for (const door of doorUnits) {
 *     for (const history of door.stageHistory) {
 *       if (typeof history.worker === 'string') {
 *         const worker = await Worker.findOne({ name: history.worker });
 *         if (worker) {
 *           history.worker = worker._id;
 *         }
 *       }
 *     }
 *     await door.save();
 *   }
 * }
 */

// ============================================
// 9. API EXAMPLES
// ============================================

/**
 * CREATE WORKER:
 * POST /api/workers
 * Authorization: FactoryAdmin, SuperAdmin
 * 
 * Request:
 * {
 *   "workerId": "W001",
 *   "name": "Aman Kumar",
 *   "phone": "9876543210",
 *   "aadhaarNumber": "XXXX-XXXX-1234",
 *   "status": "ACTIVE"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Worker created successfully",
 *   "data": {
 *     "_id": "507f1f77bcf86cd799439010",
 *     "workerId": "W001",
 *     "name": "Aman Kumar",
 *     "status": "ACTIVE",
 *     "createdAt": "2026-02-15T10:00:00Z"
 *   }
 * }
 */

/**
 * UPDATE PRODUCTION STAGE:
 * POST /api/production/update-stage
 * 
 * Request (NEW FORMAT):
 * {
 *   "orderId": "ORD001",
 *   "doorNumber": 1,
 *   "stage": "CUTTING",
 *   "workerId": "W001",            // ✅ No longer "worker name"
 *   "quality": "OK"
 * }
 * 
 * Backend converts workerId to ObjectId and stores reference
 */

/**
 * GET WORKER PERFORMANCE:
 * GET /api/production/worker-performance?type=daily&date=2026-02-15
 * 
 * Response (WITH WORKER NAMES):
 * {
 *   "success": true,
 *   "summary": [
 *     {
 *       "workerId": ObjectId("..."),
 *       "workerName": "Aman Kumar",
 *       "stages": {
 *         "CUTTING": 10,
 *         "PROCESSING": 5
 *       },
 *       "totalDoorsForWorker": 15
 *     }
 *   ]
 * }
 */

console.log('✅ Workers Collection System Documentation Loaded');
