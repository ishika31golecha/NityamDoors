# Priority Orders - Quick Reference

## 🚀 What Was Implemented

### Backend Route (adminRoutes.js)
```javascript
// New Route: GET /admin/priority-orders
router.get('/priority-orders', protect, authorize('FactoryAdmin', 'SuperAdmin'), async (req, res) => {
  // Fetch APPROVED and IN_PRODUCTION orders
  // Optional filter by door priority: High, Normal, Low
  // Returns structured list of orders with filtered doors
});
```

**Query Parameters**:
- `?priority=High` - Filter for high priority doors only
- `?priority=Normal` - Filter for normal priority doors only
- `?priority=Low` - Filter for low priority doors only
- (no parameter) - Return all doors from all orders

---

### Frontend Dropdown (index.html)
```html
<select id="priorityFilterSelect" onchange="loadPriorityOrders(this.value)">
  <option value="">All Priorities</option>
  <option value="High">🔴 High</option>
  <option value="Normal">🟠 Normal</option>
  <option value="Low">🟢 Low</option>
</select>
```

---

### JavaScript Function (index.html)
```javascript
// Main function - fetches data from API
async function loadPriorityOrders(priority = '') {
  // Get token from localStorage
  // Build API URL with optional priority parameter
  // Fetch from /api/admin/priority-orders?priority=X
  // Render results in table with priority badges
  // Handle errors with proper messages
}

// Auto-load on tab click
if (tabId === 'fa-priority-orders') {
    loadPriorityOrders();
}
```

---

## 📊 API Endpoint Summary

```
GET /api/admin/priority-orders?priority=High/Normal/Low
Authorization: Bearer JWT_TOKEN

Response:
{
  "success": true,
  "count": 5,
  "filter": "High",
  "data": [
    {
      "orderId": "ORD-123",
      "customerName": "Company Name",
      "status": "APPROVED",
      "doors": [ { priority, doorType, ... } ]
    }
  ]
}
```

---

## 🎨 Priority Badge Colors

| Priority | CSS Class      | Color    | Emoji |
|----------|----------------|----------|-------|
| High     | .priority-high | 🔴 Red   | 🔴    |
| Normal   | .priority-normal | 🟠 Orange | 🟠    |
| Low      | .priority-low  | 🟢 Green | 🟢    |

---

## ✨ Data Flow

### User clicks Priority Orders tab
```
showFactoryAdminTab('fa-priority-orders')
    ↓
loadPriorityOrders() [no filter]
    ↓
Fetch /api/admin/priority-orders
    ↓
Display all doors from APPROVED & IN_PRODUCTION orders
```

### User selects filter from dropdown
```
<select onChange="loadPriorityOrders(this.value)">
    ↓
loadPriorityOrders('High')
    ↓
Fetch /api/admin/priority-orders?priority=High
    ↓
Display only HIGH priority doors
```

---

## 🔧 Integration Points

**Backend Route**: `routes/adminRoutes.js` (Line 230)
**Frontend HTML**: `index.html` (Line 2519 - Priority Orders section)
**Frontend JS**: `index.html` (Line 4862 - loadPriorityOrders function)
**Frontend JS**: `index.html` (Line 4310 - showFactoryAdminTab auto-load)

---

## ✅ Testing Checklist

- [ ] Login as FactoryAdmin or SuperAdmin
- [ ] Navigate to Priority Orders tab
- [ ] Verify table loads with all orders
- [ ] Select "High" priority - verify only high doors show
- [ ] Select "Normal" priority - verify only normal doors show
- [ ] Select "Low" priority - verify only low doors show
- [ ] Select "All Priorities" - verify all doors show again
- [ ] Check browser console for API logs
- [ ] Verify priority badges display correctly (red/orange/green)
- [ ] Verify status badges display correctly (APPROVED/IN_PRODUCTION)

---

## 🐛 Troubleshooting

**Problem**: No data appears in table
- Check browser console for errors
- Verify backend server is running (port 5000)
- Verify JWT token is valid
- Ensure user has FactoryAdmin or SuperAdmin role

**Problem**: "No orders found" message
- Verify there are orders in database with APPROVED or IN_PRODUCTION status
- Check if doors have priority field set
- Try "All Priorities" filter to see if data exists

**Problem**: Dropdown doesn't trigger API call
- Check that `loadPriorityOrders()` function exists
- Verify `id="priorityFilterSelect"` matches HTML element
- Check browser console for JavaScript errors

---

## 📝 Sample Database Data

To test the feature, add sample orders with priorities:

```javascript
db.orders.insertOne({
  orderId: "ORD-TEST-001",
  customer: { name: "Test Company" },
  customerType: "Corporate",
  doors: [
    { doorType: "Wooden", priority: "High", height: 7, width: 3 },
    { doorType: "Steel", priority: "Normal", height: 6.5, width: 3.5 },
    { doorType: "Glass", priority: "Low", height: 7, width: 2 }
  ],
  status: "APPROVED",
  totalAmount: 50000,
  createdBy: ObjectId("..."),
  createdAt: new Date()
})
```

---

## 🎯 Key Features Implemented

✅ Real-time API integration
✅ Priority-based filtering (High/Normal/Low)
✅ Auto-load on tab switch
✅ Dropdown filter selector
✅ Priority badge styling (color-coded)
✅ Status badge styling
✅ Error handling and user feedback
✅ Loading state indicators
✅ Info box with summary counts
✅ Toast notifications
✅ Console logging for debugging
✅ Backend validation
✅ Authentication & authorization
✅ Backward compatibility with old functions

---

## 📋 Related Documentation

- See `PRIORITY_ORDERS_IMPLEMENTATION.md` for detailed implementation guide
- See `README.md` for overall system documentation
- See Order model documentation for database schema

---

**Status**: ✅ Complete and ready for production
**Last Updated**: February 14, 2026
