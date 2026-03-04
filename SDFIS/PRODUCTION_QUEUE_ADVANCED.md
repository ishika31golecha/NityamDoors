# Production Queue - Advanced Door Priority Management

## Overview

Enhanced the Factory Admin Production Queue with **collapsible order cards** and **per-door priority management**. Factory Admins can now view detailed door specifications and update individual door priorities, which are persisted to the MongoDB database.

---

## Backend Implementation

### 1. Updated GET /admin/production-queue Route

**File:** `routes/adminRoutes.js`

**Key Changes:**
- Now includes the full `doors` array with all door specifications
- Returns door details: doorType, height, width, laminate, priority, etc.

**Response Format:**
```json
{
  "success": true,
  "message": "Production queue fetched successfully.",
  "count": 2,
  "data": [
    {
      "orderId": "ORD-1770963812253",
      "customerName": "John's Stores",
      "totalDoors": 3,
      "status": "APPROVED",
      "createdAt": "2026-02-13T08:30:12.253Z",
      "doors": [
        {
          "flatNo": "101",
          "doorType": "Kitchen Door",
          "height": 2080,
          "width": 800,
          "laminate": "Oak Wood",
          "priority": "High",
          "quantity": 1
        },
        {
          "flatNo": "102", 
          "doorType": "Bedroom Door",
          "height": 2080,
          "width": 750,
          "laminate": "Walnut",
          "priority": "Normal",
          "quantity": 1
        },
        {
          "flatNo": "103",
          "doorType": "Wardrobe Door",
          "height": 2200,
          "width": 1200,
          "laminate": "White Lacquer",
          "priority": "Low",
          "quantity": 1
        }
      ]
    }
  ]
}
```

### 2. New PUT /admin/update-door-priority Route

**File:** `routes/adminRoutes.js`

**Endpoint:** `PUT /admin/update-door-priority`

**Access:** Private (FactoryAdmin, SuperAdmin roles only)

**Request Body:**
```json
{
  "orderId": "ORD-1770963812253",
  "doorIndex": 0,
  "newPriority": "High"
}
```

**Validation:**
- ✅ Validates JWT token (protect middleware)
- ✅ Checks role authorization (FactoryAdmin, SuperAdmin)
- ✅ Validates orderId exists
- ✅ Validates doorIndex is within range
- ✅ Validates newPriority is one of: High, Normal, Low

**Logic:**
1. Find order by orderId
2. Validate door index
3. Update `doors[doorIndex].priority` to new value
4. Save order to MongoDB
5. Return success with updated door info

**Response Format (Success - Status 200):**
```json
{
  "success": true,
  "message": "Door priority updated from Normal to High.",
  "data": {
    "orderId": "ORD-1770963812253",
    "doorIndex": 0,
    "oldPriority": "Normal",
    "newPriority": "High",
    "door": {
      "flatNo": "101",
      "doorType": "Kitchen Door",
      "height": 2080,
      "width": 800,
      "laminate": "Oak Wood",
      "priority": "High",
      "quantity": 1
    }
  }
}
```

**Error Responses:**
- 400: Missing orderID, doorIndex, or invalid priority
- 404: Order not found
- 403: Unauthorized (not FactoryAdmin or SuperAdmin)
- 500: Server error during save

### 3. Logging & Debugging

Backend logs for door priority updates:
```
=== 📥 PUT /admin/update-door-priority REQUEST ===
🔄 Updating door priority: Order=ORD-123, Door Index=0, New Priority=High
✏️ Door priority updated: Normal → High
✅ Order saved successfully
```

---

## Frontend Implementation

### 1. HTML Structure

**File:** `index.html`

**Production Queue Section:** `id="fa-production-queue"`

**New Container:** `id="productionQueueContainer"`
- Replaces table-based layout
- Renders collapsible order cards

**Card-Based Structure:**
```
Order Card
├── Card Header
│   ├── Order ID (with collapse button)
│   └── Meta Info (Customer, Doors, Status, Created Date)
└── Doors Container (expandable)
    ├── Door Row 1
    │   ├── Door Info (Type, Height, Width, Laminate)
    │   └── Priority Control (Badge + Dropdown + Save)
    ├── Door Row 2
    └── Door Row N
```

### 2. CSS Styling

**File:** `index.html` (lines ~610-780)

**Key Classes:**

| Class | Purpose | Styling |
|-------|---------|---------|
| `.pq-order-card` | Order container | Gray background, border, hover effects |
| `.pq-order-header` | Header section | Flex layout with order details |
| `.pq-collapse-btn` | Expand/collapse toggle | Animated arrow rotation |
| `.pq-doors-container` | Doors list wrapper | Hidden by default, expands when clicked |
| `.pq-door-row` | Single door | White background, flexbox layout |
| `.pq-door-info` | Door specs | Shows type, height, width, laminate |
| `.pq-priority-select` | Dropdown menu | Standard form select styling |
| `.pq-door-priority-badge` | Priority display | Color-coded: Red/Orange/Green |
| `.pq-priority-high` | High priority badge | Red background (#ffcdd2) |
| `.pq-priority-normal` | Normal priority badge | Orange background (#ffe0b2) |
| `.pq-priority-low` | Low priority badge | Green background (#c8e6c9) |
| `.pq-btn-save` | Save button | Green, disabled state styling |

### 3. JavaScript Functions

#### **Function: `loadProductionQueue()`**

**Purpose:** Fetch and display production queue with expandable door details

**Flow:**
1. Get JWT token from localStorage
2. Fetch from `GET /admin/production-queue`
3. Parse and validate response
4. Create collapsible order cards
5. For each order:
   - Create card header with order ID and meta info
   - Create collapsible doors container
   - For each door:
     - Display door specs (type, dimensions, laminate)
     - Create priority dropdown
     - Create save button
6. Update info box with queue summary
7. Show success toast

**Key Features:**
- Comprehensive error handling
- User-friendly loading states
- Detailed console logging for debugging
- Empty queue message
- Toast notifications

---

#### **Function: `toggleOrderExpansion(button, container)`**

**Purpose:** Handle collapsible card expansion/collapse

**Logic:**
1. Toggle `expanded` class on button
2. Toggle `expanded` class on container
3. Button rotates visually
4. Container shows/hides doors

---

#### **Function: `saveDoorPriority(orderId, doorIndex, newPriority, btn)`**

**Purpose:** Update door priority and persist to database

**Flow:**
1. Get JWT token
2. Show loading state ("⏳ Saving...")
3. Call `PUT /admin/update-door-priority` with:
   - orderId
   - doorIndex
   - newPriority
4. On success:
   - Show "✅ Saved" confirmation
   - Disable button for 2 seconds
   - Show success toast
5. On error:
   - Show error toast
   - Restore button to enable state

**Error Handling:**
- Missing token → Show auth error
- Network failure → Try-catch handles
- Validation errors → Show backend error message
- Button always restores to usable state

---

### 4. User Interaction Flow

**Step 1:** Factory Admin clicks "🔄 Production Queue" tab
- `showFactoryAdminTab('fa-production-queue')` called
- `loadProductionQueue()` triggered

**Step 2:** API fetches and renders orders
- Shows loading state
- Creates collapsible cards
- Displays order details and meta info

**Step 3:** Admin views order details (optional)
- Clicks ▼ button to expand order
- Door list becomes visible
- Shows all door specifications

**Step 4:** Admin changes door priority
- Selects new priority from dropdown
- Save button becomes enabled (green)
- Clicks "💾 Save" button

**Step 5:** Priority saves to database
- Button shows "⏳ Saving..." state
- API call made to backend
- Backend updates order.doors[index].priority
- Response returned with confirmation

**Step 6:** Update confirmed to admin
- Button shows "✅ Saved" 
- Success toast notification appears
- Button auto-resets after 2 seconds
- Data persisted in MongoDB

---

## Data Flow Diagram

```
Frontend Form (Production Queue)
    ↓
[Dropdown changed] → [Save button enabled]
    ↓
[Save clicked] → PUT /admin/update-door-priority
    ↓
Backend Route Handler
├─ Validate JWT token (protect middleware)
├─ Check FactoryAdmin role (authorize middleware)
├─ Find order by orderId
├─ Validate doorIndex range
├─ Update doors[doorIndex].priority
├─ Save to MongoDB
└─ Return success response
    ↓
Frontend Receives Response
├─ Show "✅ Saved" confirmation
├─ Display success toast
├─ Reset button state
└─ Data now persisted in database
```

---

## Feature Breakdown

### Card-Based Layout Benefits

| Feature | Benefit |
|---------|---------|
| Collapsible cards | Reduces visual clutter, shows summary first |
| Door grouping | Easy to see all doors in one order |
| In-place editing | No navigation needed for priority changes |
| Visual badges | Quick priority identification (Red/Orange/Green) |
| Dropdown + Save | Clear two-step process for changes |
| Button states | Provides feedback during save operation |

### Per-Door Priority Management

| Capability | Use Case |
|------------|----------|
| Individual door priority | Different doors have different urgency |
| Inline save | No form submission required |
| Instant database update | Changes persist immediately |
| Color-coded badges | Visual indicator of priority level |
| Disabled state during save | Prevents double-click submissions |

---

## Database Integration

### Order.doors Schema

Each door in the doors array now contains:
```javascript
{
  flatNo: String,              // Apartment/room number
  doorType: String,             // Type of door
  height: Number,               // Height in mm
  width: Number,                // Width in mm
  laminate: String,             // Laminate/finish type
  priority: String,             // NEW: "High" | "Normal" | "Low"
  quantity: { type: Number, default: 1 }
}
```

### MongoDB Update Operation

When priority is updated:
```javascript
// Find order and update specific door priority
db.orders.updateOne(
  { orderId: "ORD-123" },
  { $set: { "doors.0.priority": "High" } }
);
```

---

## Testing Scenarios

### Scenario 1: Load Production Queue
1. Click Production Queue tab
2. ✅ Orders load with expandable cards
3. ✅ Door count shown in meta
4. ✅ Collapse button visible

### Scenario 2: Expand Order Card
1. Click ▼ button on order
2. ✅ Button rotates to ▲
3. ✅ Doors list becomes visible
4. ✅ All door details displayed

### Scenario 3: Change Door Priority
1. Expand order card
2. Select different priority from dropdown
3. ✅ Badge updates with new color
4. ✅ Save button becomes enabled

### Scenario 4: Save Priority Change
1. Change priority and click Save
2. ✅ Button shows "⏳ Saving..."
3. ✅ Backend processes update
4. ✅ Button shows "✅ Saved"
5. ✅ Success toast appears
6. ✅ Data persists in MongoDB

### Scenario 5: Error Handling
1. Backend offline → Error message in container
2. Invalid priority → Backend validation returns 400
3. Order not found → Backend returns 404
4. ✅ User-friendly error messages displayed

---

## Console Logging

### Frontend Logs

General flow:
```
🔄 FACTORY ADMIN: Loading Production Queue
📡 API Response Status: 200
📦 API Response: { success: true, count: 2, data: [...] }
📌 Order 1: ORD-123 has 3 door(s)
✅ Production Queue loaded and displayed successfully
```

Priority update:
```
💾 Updating Door Priority
Order: ORD-123, Door: 0, New Priority: High
📡 API Response Status: 200
✅ Door priority updated: { orderId: '...', doorIndex: 0, ... }
```

### Backend Logs

Queue load:
```
GET /admin/production-queue - 2026-02-13T09:20:02.199Z
=== 📥 GET /admin/production-queue REQUEST ===
📦 Found 5 orders in production queue
✅ Returning 5 formatted orders
```

Priority update:
```
PUT /admin/update-door-priority - 2026-02-13T09:20:15.500Z
=== 📥 PUT /admin/update-door-priority REQUEST ===
🔄 Updating door priority: Order=ORD-123, Door Index=0, New Priority=High
✏️ Door priority updated: Normal → High
✅ Order saved successfully
```

---

## Performance Considerations

| Aspect | Details |
|--------|---------|
| **API Calls** | Minimal - only load on tab click, save only when button clicked |
| **Database** | Single index lookup + one-field update per save operation |
| **Frontend Rendering** | Card-based layout is faster than table for expandable content |
| **Memory** | Full doors array included but only rendered when expanded |
| **Network** | Lean JSON responses, only necessary fields included |

---

## Security Features

✅ **JWT Authentication** - All routes require valid token
✅ **Role-Based Access** - Only FactoryAdmin and SuperAdmin can access
✅ **Input Validation** - doorIndex and priority values validated
✅ **Boundary Checks** - doorIndex verified against array length
✅ **Authorized Save** - update-door-priority requires admin role
✅ **Error Messages** - No sensitive info leaked in errors

---

## Files Modified

1. **`routes/adminRoutes.js`**
   - Updated GET /admin/production-queue to include full doors array
   - Added new PUT /admin/update-door-priority route

2. **`index.html`**
   - Updated production queue HTML (card-based instead of table)
   - Added CSS styling for cards and priority controls
   - Replaced loadProductionQueue() with card rendering logic
   - Added toggleOrderExpansion() function
   - Added saveDoorPriority() function

---

## Future Enhancements

1. **Batch Priority Updates** - Update multiple doors at once
2. **Drag-to-Reorder** - Rearrange order of doors in card
3. **Priority History** - Track who changed priority and when
4. **Estimated Times** - Show production timeline per priority
5. **Auto-Refresh** - Real-time updates when orders status changes
6. **Export** - Download queue as PDF/CSV
7. **Notifications** - Alert when order status changes
8. **Worker Assignment** - Assign doors to specific production workers
9. **Quality Checkpoints** - Add approval gates during production
10. **Analytics Dashboard** - Charts showing priority distribution

---

## Troubleshooting

### Issue: "No orders in production queue"
**Cause:** No orders with APPROVED or IN_PRODUCTION status
**Solution:** Create orders and approve them from Pending Orders tab

### Issue: Save button not responding
**Cause:** Network issue or backend offline
**Check:**
1. Backend is running: `npm start`
2. Check browser console (F12) for error messages
3. Check backend logs for request/response

### Issue: Priority dropdown not updating
**Cause:** CSS not loaded properly
**Solution:** Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)

### Issue: Changes not persisting
**Cause:** Save button clicked but didn't show "✅ Saved"
**Check:**
1. Device has internet connection
2. Backend is responding to PUT requests
3. Check MongoDB Atlas to verify order document was updated

---

**Implementation Date:** February 13, 2026
**Status:** ✅ COMPLETE & TESTED
**Version:** 2.0 (Advanced Door Priority Management)
