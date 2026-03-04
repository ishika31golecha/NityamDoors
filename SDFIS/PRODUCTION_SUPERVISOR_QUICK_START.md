# 🏭 PRODUCTION SUPERVISOR - QUICK START GUIDE

## How to Use the New Stage-Wise Dashboard

### Step 1: Login
1. Go to http://localhost:5000
2. Login with ProductionSupervisor credentials
3. Navigate to **Production Supervisor Dashboard** module

### Step 2: Select an Order
1. Find the order selector dropdown at the top
2. Click and select an **APPROVED** order
3. Dashboard automatically loads all doors for that order
4. Status shows "Ready for Production ✅"

### Step 3: Work Through the Stages
The dashboard shows 5 stages:

```
✂️ CUTTING → ⚙️ PROCESSING → ✨ POLISHING → 📦 PACKING → 🚚 LOADING
```

### Step 4: Complete Each Stage

#### For CUTTING Stage:
- Shows: **ALL doors** from the order
- Action: 
  1. Type worker name in the Worker field
  2. Click the checkbox to mark complete
  3. Door automatically moves to PROCESSING

#### For PROCESSING Stage:
- Shows: Only doors currently in **CUTTING**
- Action:
  1. Type worker name
  2. Click checkbox
  3. Door moves to POLISHING

#### Repeat for POLISHING → PACKING → LOADING

### Step 5: Monitor Progress
- Each stage table updates in real-time
- Doors automatically appear/disappear as they progress
- All stage history tracked in backend

---

## ⚠️ Important Rules

### ✅ You CAN:
- ✓ Enter any worker name
- ✓ Work on multiple doors at once
- ✓ Switch between orders
- ✓ Complete stages in any order (all doors independent)

### ❌ You CANNOT:
- ✗ Skip stages (Door must go through each stage)
- ✗ Go backward (Door can't go from PROCESSING back to CUTTING)
- ✗ Complete without worker name
- ✗ Complete same door twice in same stage

---

## 👤 Worker Name Guidelines

**Required for each stage completion:**
- Type full name or ID
- Must be at least 1 character
- Examples: "John", "Raj", "Worker-1", "Sarah K"

---

## 🎨 Color Guide

| Stage | Color | Icon |
|-------|-------|------|
| CUTTING | 🟠 Orange | ✂️ |
| PROCESSING | 🔵 Blue | ⚙️ |
| POLISHING | 🟣 Purple | ✨ |
| PACKING | 🟠 Deep Orange | 📦 |
| LOADING | 🟢 Green | 🚚 |

---

## 📊 Table Columns Explained

| Column | Description |
|--------|-------------|
| 🚪 Door | Door identifier number |
| 📏 Height | Door height in millimeters |
| 📐 Width | Door width in millimeters |
| 👤 Worker | Input field for worker name |
| ✓ Complete | Checkbox to mark stage complete |

---

## 🔄 Workflow Example

**Scenario: Process 3 doors for Order ORD001**

```
TIME 09:00 - John works on CUTTING
├─ Door 1: Enter "John" → Click ✓
├─ Door 2: Enter "John" → Click ✓
└─ Door 3: Enter "John" → Click ✓

TIME 09:30 - Sarah takes over PROCESSING
├─ Door 1: Enter "Sarah" → Click ✓
├─ Door 2: Enter "Sarah" → Click ✓
└─ Door 3: Enter "Sarah" → Click ✓

TIME 10:00 - Continue through all stages...
```

---

## ✅ Checklist Before Completing

Before clicking the checkbox:

- [ ] Worker name entered in field?
- [ ] Door in correct stage section?
- [ ] Height and Width match order specs?
- [ ] Door quality is acceptable?
- [ ] No issues or defects?

---

## 🔧 If Something Goes Wrong

### Checkbox unchecked automatically?
→ Likely didn't enter worker name. Try again with name filled in.

### No doors showing?
→ Try selecting order again from dropdown.

### Wrong stage showing?
→ Page may be loading. Wait 2 seconds and refresh (F5).

### Server error message?
→ Backend might be down. Check http://localhost:5000 in address bar.

---

## 📱 Supported Browsers

✅ Chrome/Edge 90+
✅ Firefox 88+
✅ Safari 14+
✅ Mobile browsers (responsive design)

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Tab | Move between fields |
| Enter | Submit checkbox (after name entered) |
| Esc | (reserved for future use) |

---

## 📞 Troubleshooting

**Q: Why can't I edit worker name after completing?**
A: Once a door moves to next stage, that stage's history is locked. You'd need to reject it to restart (not available in this version).

**Q: Can I undo a stage completion?**
A: No, stage completions are permanent. They're recorded in the history for audit trail.

**Q: What if I enter wrong worker name?**
A: The backend stores what you entered. You can see the history to track who actually worked on each door.

**Q: Can multiple workers complete same door?**
A: No, same door can only be completed once per stage. It needs unique worker each time it moves through stages.

---

## 📈 Best Practices

1. **Be Consistent**: Use same name format (e.g., always "John" not "john" or "JOHN")
2. **Be Timely**: Complete checkboxes within reasonable time of actual work
3. **Be Accurate**: Verify door dimensions match order before marking complete
4. **Be Present**: Don't let worker not present complete doors for you
5. **Be Clear**: Use recognizable names so supervisor knows who did work

---

## 🚀 For Supervisors

### Monitoring Production:
1. Check which doors are in which stages
2. Monitor worker productivity by counting completions
3. Identify bottlenecks where doors are stuck
4. Track worker performance over time

### Handling Issues:
- If door has quality issue: Reject it (mark in system)
- If blocked: Check previous stage for delays
- If slow: Check worker capacity and add more workers

---

## 🔐 Access Control

Only users with role: **ProductionSupervisor** can see this module.

Other roles see different dashboards:
- **FactoryAdmin**: Order approval and priority management
- **SalesExecutive**: Customer and order creation
- **Customer**: Order tracking

---

## 📞 Support

For issues or questions:
1. Check browser console (F12) for error messages
2. Verify you're logged in as ProductionSupervisor
3. Try refreshing the page (Ctrl+R)
4. Contact system administrator if persistent

---

Created: February 15, 2025
Last Updated: Production Supervisor Stage-Wise Redesign v1.0
