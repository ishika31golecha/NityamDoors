# Production Supervisor Update - Quick Testing Guide

## 🚀 Quick Start

### Prerequisites
- ✅ Server running: `node server.js`
- ✅ All code changes deployed
- ✅ Browser with access to http://localhost:5000

---

## 📋 Test Checklist

### Test 1: Login & Module Access
- [ ] Login as `ProductionSupervisor` or `FactoryAdmin`
- [ ] Navigate to "Production Supervisor" module
- [ ] Verify dropdown shows "Select Order..."

### Test 2: Order Selection & Display
- [ ] Select an APPROVED order from dropdown
- [ ] Wait for data to load
- [ ] **VERIFY:** CUTTING section shows ALL doors with Height & Width columns
- [ ] **VERIFY:** All door heights and widths are displayed (or "N/A" if missing)
- [ ] Check: Worker Name, Type, Laminate columns present

### Test 3: Checkbox Behavior (No Auto-Submit)
- [ ] Check 1st door checkbox
- [ ] **VERIFY:** Door remains checked, does NOT submit immediately
- [ ] Check 2nd and 3rd doors
- [ ] **VERIFY:** Multiple doors stay checked (no auto-submit)
- [ ] Uncheck a door
- [ ] **VERIFY:** Checkbox unchecks, still no submission

### Test 4: Submit Button Single Door
- [ ] Select new order
- [ ] In CUTTING section:
  - Enter worker name for Door 1: "John"
  - Check Door 1 checkbox
  - Click "💾 Submit Cutting" button
- [ ] **VERIFY:** Success toast: "✅ 1 door(s) moved to PROCESSING"
- [ ] **VERIFY:** Door disappears from CUTTING section
- [ ] Navigate to PROCESSING section
- [ ] **VERIFY:** Door 1 appears in PROCESSING with worker name "John"

### Test 5: Batch Submit Multiple Doors
- [ ] Select new order from dropdown
- [ ] In CUTTING section:
  - Door 1: Enter worker "Alice", check checkbox
  - Door 2: Enter worker "Bob", check checkbox
  - Door 3: Enter worker "Charlie", check checkbox
  - Click "💾 Submit Cutting" button
- [ ] **VERIFY:** Success toast: "✅ 3 door(s) moved to PROCESSING"
- [ ] **VERIFY:** All 3 doors disappear from CUTTING
- [ ] **VERIFY:** All 3 doors appear in PROCESSING with their worker names

### Test 6: Validation - Missing Worker Name
- [ ] Select order
- [ ] In CUTTING section:
  - Door 1: DON'T enter worker name, check checkbox
  - Door 2: Enter worker "John", check checkbox
  - Click "💾 Submit Cutting" button
- [ ] **VERIFY:** Error toast: "⚠️ Door #1: Please enter worker name"
- [ ] **VERIFY:** NO doors submitted (batch fails safely)
- [ ] Now enter worker name for Door 1
- [ ] Click "💾 Submit Cutting" again
- [ ] **VERIFY:** Success: Both doors submitted and moved to PROCESSING

### Test 7: Validation - No Doors Selected
- [ ] Select order
- [ ] In CUTTING section:
  - DON'T check any doors
  - Click "💾 Submit Cutting" button
- [ ] **VERIFY:** Error toast: "⚠️ Please select at least one door to complete"

### Test 8: Complete Pipeline (All 5 Stages)
- [ ] Select order with at least 5 doors
- [ ] **CUTTING Section:**
  - Select all 5 doors
  - Fill in worker names
  - Click Submit
  - **VERIFY:** Toast shows "✅ 5 door(s) moved to PROCESSING"
  
- [ ] **PROCESSING Section:**
  - All 5 doors appear
  - Select all 5, fill worker names
  - Click Submit
  - **VERIFY:** Toast shows "✅ 5 door(s) moved to POLISHING"
  
- [ ] **POLISHING Section:**
  - All 5 doors appear
  - Select all 5, fill worker names
  - Click Submit
  - **VERIFY:** Toast shows "✅ 5 door(s) moved to PACKING"
  
- [ ] **PACKING Section:**
  - All 5 doors appear
  - Select all 5, fill worker names
  - Click Submit
  - **VERIFY:** Toast shows "✅ 5 door(s) moved to LOADING"
  
- [ ] **LOADING Section:**
  - All 5 doors appear
  - Select all 5, fill worker names
  - Click Submit
  - **VERIFY:** Toast shows success message

---

## 🔍 Expected Data Display

### Before Changes
```
Door | Cutting | Processing | Polishing | Packing | Loading
  1  |   ⬜    |            |           |         |
  2  |   ⬜    |            |           |         |
```
**Problems:**
- Height/Width missing
- Auto-submit on checkbox

### After Changes
```
Door | Height | Width  | Type    | Laminate | Worker Name | Status | Cutting
  1  | 2100mm | 900mm  | Kitchen | Oak      | [  input  ] | ✓ ⬜   |
  2  | 2100mm | 900mm  | Kitchen | Oak      | [  input  ] | ✓ ⬜   |
                                         [💾 Sumbit Cutting Button]
```
**Improvements:**
- Height/Width now visible
- Worker name input
- Manual submit button
- Batch processing

---

## 📊 Dimension Display Examples

### Valid Display
```
✅ Door 1: Height: 2100 mm | Width: 900 mm
✅ Door 2: Height: 2200 mm | Width: 850 mm
```

### Missing Dimensions
```
⚠️ Door 3: Height: N/A | Width: N/A
(Order doesn't have dimensions for this door)
```

---

## 🐛 Troubleshooting

### Issue: "No heights/widths showing (all N/A)"
**Diagnosis:** Order dimensions not in test.orders collection

**Fix:**
1. Check that order exists in test.orders collection
2. Check order has doors array with height/width properties
3. Verify backend route `/production/order-details/:orderId` works:
   - F12 → Network tab
   - Submit a door
   - Look for `order-details` request
   - Should show 200 status with door dimensions

### Issue: "Checkbox auto-submits immediately"
**Diagnosis:** Old code still running

**Fix:**
1. Hard refresh browser: Ctrl+Shift+R (or Cmd+Shift+R on Mac)
2. Clear browser cache
3. Verify index.html has NO `onchange="completeStageCheckbox(...)"` on checkboxes

### Issue: "Submit button doesn't work"
**Diagnosis:** JavaScript not loading correctly

**Fix:**
1. Open browser console: F12 → Console
2. Type: `window.submitStageUpdate`
3. Should show: `ƒ submitStageUpdate(stage) { ... }`
4. If undefined, try hard refresh

### Issue: "Error: Worker name required"
**Diagnosis:** Missing worker name validation working as intended

**Fix:**
1. Enter worker name for door before checking checkbox
2. OR: Check door, then enter worker name before clicking Submit
3. Make sure there's text in the Worker Name input field

---

## 📱 UI Elements Checklist

### CUTTING Section
- [ ] Shows all doors from selected order
- [ ] Table columns: Door | Height | Width | Type | Laminate | Worker | Checkbox
- [ ] Orange "💾 Submit Cutting" button below table
- [ ] Button text appears in white text

### PROCESSING Section  
- [ ] Shows only doors with currentStage = "PROCESSING"
- [ ] Blue "💾 Submit Processing" button
- [ ] Same table structure as CUTTING

### POLISHING Section
- [ ] Shows only doors with currentStage = "POLISHING"
- [ ] Purple "💾 Submit Polishing" button
- [ ] Same table structure

### PACKING Section
- [ ] Shows only doors with currentStage = "PACKING"
- [ ] Deep Orange "💾 Submit Packing" button
- [ ] Same table structure

### LOADING Section
- [ ] Shows only doors with currentStage = "LOADING"
- [ ] Green "💾 Submit Loading" button
- [ ] Same table structure

---

## 🎯 Success Criteria

### All tests must pass:
✅ Checkboxes don't auto-submit  
✅ Height/Width values display in table  
✅ Manual Submit button works  
✅ Single door submission works  
✅ Batch (multiple door) submission works  
✅ Worker name validation enforced  
✅ No empty selection allowed  
✅ Toast messages show correct door count  
✅ Doors move to correct next stage  
✅ All 5 stages can be processed sequentially  
✅ Stage skipping prevented by backend  

**If ANY criterion fails → Review logs and troubleshoot**

---

## 📜 Console Reference

### View JavaScript Execution
Open browser console (F12) and look for logs like:
```
--- 💾 Submitting Stage: CUTTING ---
📦 Processing 3 doors for CUTTING
✅ All door stages updated successfully
```

### Check API Calls
F12 → Network tab → Look for these requests:
1. `GET /api/production/doors/ORDER_ID` → Door units
2. `GET /api/production/order-details/ORDER_ID` → Dimensions ⭐ NEW
3. `POST /api/production/update-stage` → Stage update (×N for batch)

All should return `200` status with `success: true`

---

## Next Steps After Testing

1. **If all tests pass:**
   - ✅ Feature is production ready
   - Deploy to production
   - Train users on new workflow

2. **If tests fail:**
   - Document failure details
   - Check error logs on server
   - Review browser console errors
   - Verify database connection
   - Test backend route manually via Postman/cURL

3. **For optimization:**
   - Monitor performance with large batch submissions
   - Consider implementing progress bar for batch operations
   - Cache order details if fetched multiple times
