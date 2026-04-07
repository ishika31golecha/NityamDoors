# Priority Orders Implementation Guide

## Overview
Complete DB-connected Priority Orders feature for SDFIS Factory Admin Dashboard. Allows filtering and viewing of orders by door priority levels.

---

## 📋 Table of Contents
1. [Backend Implementation](#backend-implementation)
2. [Frontend Implementation](#frontend-implementation)
3. [API Documentation](#api-documentation)
4. [Database Structure](#database-structure)
5. [CSS Styling](#css-styling)
6. [Usage Instructions](#usage-instructions)
7. [Error Handling](#error-handling)

---

## Backend Implementation

### File: `routes/adminRoutes.js`

#### New Route: `GET /admin/priority-orders`

**Route Definition**:
```javascript
router.get('/priority-orders', protect, authorize('FactoryAdmin', 'SuperAdmin'), async (req, res) => {
  // Implementation...
});
```

**Access Control**:
- Protected route (requires authentication)
- Authorized for: `FactoryAdmin`, `SuperAdmin`
- Uses JWT Bearer token authentication

**Query Parameters**:
```
GET /admin/priority-orders?priority=High
GET /admin/priority-orders?priority=Normal
GET /admin/priority-orders?priority=Low
GET /admin/priority-orders  (fetches all priorities)
```

**Request Processing Logic**:

1. **Validate Query Parameters**
   - If `priority` parameter is provided, validate it's one of: `High`, `Normal`, `Low`
   - Return 400 error if invalid

2. **Fetch Orders**
   - Query MongoDB for orders with status: `APPROVED` OR `IN_PRODUCTION`
   - Select fields: `orderId`, `customer`, `doors`, `status`, `totalAmount`, `createdAt`

3. **Filter Doors by Priority**
   - If `priority` parameter is provided:
     - Filter each order's `doors` array to only include doors matching the priority
   - If no `priority` parameter:
     - Include all doors in each order

4. **Format Response**
   - Transform raw MongoDB data to frontend-friendly format
   - Include only orders with matching doors (remove empty orders)

**Response Structure**:
```json
{
  "success": true,
  "message": "Priority orders fetched successfully.",
  "count": 5,
  "filter": "High",
  "data": [
    {
      "orderId": "ORD-1707887644325",
      "customerName": "Acme Corp",
      "status": "APPROVED",
      "createdAt": "2026-02-13T14:27:24.325Z",
      "totalAmount": 25000,
      "doors": [
        {
          "flatNo": "101",
          "doorType": "Wooden Door",
          "height": 7,
          "width": 3,
          "laminate": "Teak",
          "priority": "High",
          "quantity": 2
        }
      ],
      "totalDoors": 1
    }
  ]
}
```

**Error Responses**:

```json
{
  "success": false,
  "message": "Invalid priority value. Must be: High, Normal, or Low.",
  "error": "Error details..."
}
```

---

## Frontend Implementation

### File: `index.html`

#### 1. HTML Structure Changes

**Location**: `<div id="fa-priority-orders" class="fa-subsection">`

**Components**:
- **Info Box**: Displays loading status and summary information
- **Filter Dropdown**: `<select id="priorityFilterSelect">`
- **Data Table**: `<table class="data-table">` with 5 columns

**Table Columns**:
1. Order ID - `#ORD-XXXXX`
2. Customer Name - Name from MongoDB customer document
3. Door Type - Type of door (e.g., "Wooden Door", "Steel Door")
4. Priority - Badge showing door priority (High/Normal/Low)
5. Status - Badge showing order status (APPROVED/IN_PRODUCTION)

#### 2. JavaScript Functions

**Main Function**: `loadPriorityOrders(priority = '')`

**Parameters**:
- `priority` (optional): Filter by priority level
  - `''` or `undefined` = All priorities
  - `'High'` = Only high priority doors
  - `'Normal'` = Only normal priority doors
  - `'Low'` = Only low priority doors

**Logic Flow**:

```
1. Validate authentication token
2. Show loading state in UI
3. Build API URL with optional priority parameter
4. Fetch from `/api/admin/priority-orders?priority=X`
5. Validate response
6. Clear table and render results
7. For each order:
   - For each door in order:
     - Create table row with door details
     - Apply appropriate priority badge styling
     - Apply status badge styling
8. Update info box with summary
9. Show success toast notification
```

**Dropdown Integration**:
```html
<select id="priorityFilterSelect" onchange="loadPriorityOrders(this.value)">
  <option value="">All Priorities</option>
  <option value="High">🔴 High</option>
  <option value="Normal">🟠 Normal</option>
  <option value="Low">🟢 Low</option>
</select>
```

**Auto-load on Tab Switch**:
```javascript
if (tabId === 'fa-priority-orders') {
    loadPriorityOrders();
}
```

**Backward Compatibility**:
- Old `filterPriorityOrders(level)` function maintained
- Maps old parameters to new system
- Calls `loadPriorityOrders()` with correct values

---

## API Documentation

### Endpoint: `GET /api/admin/priority-orders`

**Base URL**: `http://localhost:5000/api`

**Full URL Examples**:
```
http://localhost:5000/api/admin/priority-orders
http://localhost:5000/api/admin/priority-orders?priority=High
http://localhost:5000/api/admin/priority-orders?priority=Normal
http://localhost:5000/api/admin/priority-orders?priority=Low
```

**Headers Required**:
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

**JavaScript Fetch Example**:
```javascript
const token = localStorage.getItem('sdfis_token');

const response = await fetch(
  'http://localhost:5000/api/admin/priority-orders?priority=High',
  {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    }
  }
);

const data = await response.json();
console.log(data);
```

**cURL Example**:
```bash
curl -X GET \
  'http://localhost:5000/api/admin/priority-orders?priority=High' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json'
```

---

## Database Structure

### Collection: `orders`

**Relevant Fields for Priority Orders**:

```javascript
{
  orderId: String,           // Unique order identifier
  
  customer: {
    _id: ObjectId,          // Customer reference
    name: String            // Customer name (displayed)
  },
  
  doors: [
    {
      flatNo: String,       // Room/flat number
      doorType: String,     // Type of door (Wooden, Steel, etc.)
      height: Number,       // Door height
      width: Number,        // Door width
      laminate: String,     // Laminate material
      priority: String,     // [High | Normal | Low]
      quantity: Number      // Number of doors of this type
    }
  ],
  
  status: String,           // [CREATED | APPROVED | REJECTED | IN_PRODUCTION | COMPLETED]
  
  createdAt: Date,          // Order creation timestamp
  
  totalAmount: Number       // Total order amount
}
```

### Index Performance

Database currently has these indexes for optimal performance:
```javascript
// Existing indexes (will improve query performance)
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ 'customer.name': 1 });
orderSchema.index({ createdAt: -1 });
```

---

## CSS Styling

### Priority Badge Classes

All styles are already defined in `index.html` `<style>` section.

#### High Priority (Red)
```css
.priority-high {
    background: #ffcdd2;
    color: #c62828;
    border: 1px solid #ef9a9a;
}
```
- Background: Light red
- Text: Dark red
- Used for high priority doors

#### Normal Priority (Orange)
```css
.priority-normal {
    background: #ffe0b2;
    color: #e65100;
    border: 1px solid #ffcc80;
}
```
- Background: Light orange
- Text: Dark orange
- Used for normal priority doors

#### Low Priority (Green)
```css
.priority-low {
    background: #c8e6c9;
    color: #2e7d32;
    border: 1px solid #a5d6a7;
}
```
- Background: Light green
- Text: Dark green
- Used for low priority doors

### Status Badge Classes

#### Pending/Approved (Orange)
```css
.status-pending {
    background: #fff3e0;
    color: #ef6c00;
}
```

#### In Progress/Production (Purple)
```css
.status-inprogress {
    background: #f3e5f5;
    color: #7b1fa2;
}
```

---

## Usage Instructions

### For Factory Admin Users

**Step 1: Login**
- Login with FactoryAdmin or SuperAdmin account
- JWT token is automatically stored in localStorage

**Step 2: Navigate to Priority Orders**
- Click on "Factory Admin Dashboard" button in navigation
- Click on "⚡ Priority Orders" tab

**Step 3: View All Priorities**
- The page automatically loads all priority orders
- Shows all doors from APPROVED and IN_PRODUCTION orders

**Step 4: Filter by Priority**
- Use the dropdown menu: "Filter by Priority"
- Select: "All Priorities", "🔴 High", "🟠 Normal", or "🟢 Low"
- Table updates automatically with filtered results

---

## Error Handling

### Error Scenarios

**1. Authentication Error**
```
Message: "⚠️ Authentication token not found. Please login again."
Action: User is prompted to login
```

**2. Network Error**
```
Message: "❌ Server is offline. Please start the backend."
Action: Check if server is running on port 5000
```

**3. Invalid Priority Parameter**
```json
{
  "success": false,
  "message": "Invalid priority value. Must be: High, Normal, or Low."
}
Action: Frontend validates before sending request
```

**4. No Orders Found**
```
Message: "📭 No orders found for selected priority"
Info: Shows empty message instead of error
```

**5. Server Error**
```json
{
  "success": false,
  "message": "Server error fetching priority orders.",
  "error": "MongoDB connection error..."
}
Action: Display error message to user with retry option
```

### Console Logging

For debugging, check browser console for detailed logs:

**Backend Logs**:
```
=== 📥 GET /admin/priority-orders REQUEST ===
Query Parameters: { priority: 'High' }
📦 Found 10 orders with APPROVED or IN_PRODUCTION status
🔍 Filtering for priority "High": 3 doors found in order ORD-123
✅ Returning 8 orders with matching criteria
```

**Frontend Logs**:
```
--- ⚡ FACTORY ADMIN: Loading Priority Orders ---
Priority Filter: High
📡 Fetching from: http://localhost:5000/api/admin/priority-orders?priority=High
📡 API Response Status: 200
📦 API Response: { success: true, count: 8, data: [...] }
✅ Rendering 8 orders
✅ Priority orders loaded and displayed successfully (24 doors rendered)
```

---

## Testing the Implementation

### Test Case 1: Load All Priorities
```
1. Click "Priority Orders" tab
2. Dropdown should show "All Priorities"
3. Table should display all doors from all orders
```

### Test Case 2: Filter High Priority
```
1. Select "🔴 High" from dropdown
2. Wait for API response
3. Table should show only High priority doors
4. Toast: "✅ Loaded X order(s) with Y doors!"
```

### Test Case 3: Filter Normal Priority
```
1. Select "🟠 Normal" from dropdown
2. Wait for API response
3. Table should show only Normal priority doors
```

### Test Case 4: Filter Low Priority
```
1. Select "🟢 Low" from dropdown
2. Wait for API response
3. Table should show only Low priority doors
```

### Test Case 5: No Results
```
1. Select a priority with no matching doors
2. Table should show: "📭 No orders found for selected priority"
3. Info box: "✅ No Orders: No X priority orders available."
```

### Test Case 6: Logout and Access
```
1. Logout from account
2. Try to access priority orders API directly
3. Should receive 401 Unauthorized error
4. Frontend should redirect to login
```

---

## Quick API Testing

### Using Postman

**Setup**:
1. Login endpoint: `POST http://localhost:5000/api/auth/login`
2. Get JWT token from response
3. Copy token to Postman Bearer token

**Request**:
```
Method: GET
URL: http://localhost:5000/api/admin/priority-orders?priority=High
Headers:
  Authorization: Bearer YOUR_JWT_TOKEN
  Content-Type: application/json
```

**Expected Response** (Status 200):
```json
{
  "success": true,
  "message": "Priority orders fetched successfully.",
  "count": 3,
  "filter": "High",
  "data": [...]
}
```

---

## Notes & Observations

### Performance Considerations
- Query with `lean()` optimization to return plain JavaScript objects
- Indexes on status and createdAt fields speed up queries
- No N+1 query problems (orders fetched in single query)

### Data Validation
- Priority values strictly validated: `High`, `Normal`, `Low` (case-sensitive)
- Only APPROVED and IN_PRODUCTION orders are included
- Empty orders (no matching doors) are filtered out

### Backward Compatibility
- Old `filterPriorityOrders()` function still works
- Maintains compatibility with existing code
- Old parameter names (urgent, high, low) still supported

### Future Enhancements
- Add pagination support for large result sets
- Add sorting options (by date, priority, customer)
- Add export to CSV/Excel functionality
- Add door status tracking (completed, in progress, etc.)
- Add bulk operations (change priority of multiple doors)

---

## Summary

✅ **Complete Implementation**:
- Backend route fully implemented with proper error handling
- Frontend dropdown integration with real-time filtering
- Proper CSS styling for priority visualization
- Comprehensive error handling and logging
- Authentication and authorization verified
- Database queries optimized with indexes

✅ **Features**:
- Filter by High/Normal/Low priority
- Real-time API calls on dropdown change
- Auto-load when tab is clicked
- Proper status indicators for orders
- Detailed info box with summary counts

✅ **Testing**:
- All error scenarios handled
- Console logging for debugging
- Browser developer tools show all requests
- Toast notifications for user feedback

The Priority Orders feature is now ready for production use! 🎉
