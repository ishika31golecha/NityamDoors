# Backend Stage Validation - Complete Fix

## Problem Analysis

### Why Stage Skipping Was Possible

The original validation logic in `productionRoutes.js` (lines 250-262) was:

```javascript
if (stageIndex > currentStageIndex + 1) {
    return res.status(400).json({
        success: false,
        message: `Cannot skip stages. Next allowed stage: ${validStages[currentStageIndex + 1]}`,
        data: null
    });
}
```

**Problem:** This ONLY checks if skipping 2+ stages. It allows:
- `stageIndex < currentStageIndex` ← Goes backward (blocked elsewhere, but loose)
- `stageIndex === currentStageIndex` ← Same stage (ALLOWED - should be blocked!)
- `stageIndex === currentStageIndex + 1` ← Next stage (ALLOWED - correct)
- `stageIndex > currentStageIndex + 1` ← Skip ahead (BLOCKED - correct)

So a door could be submitted to its OWN current stage or accidentally to an intermediate stage through frontend bugs.

---

## Solution: Strict Validation

### New Code (productionRoutes.js, Lines 250-270)

```javascript
// 🔐 STRICT STAGE VALIDATION: Only allow exact next stage in sequence
const stageIndex = validStages.indexOf(stage);
const currentStageIndex = validStages.indexOf(doorUnit.currentStage);

if (quality === 'OK') {
    // Calculate the EXACT next stage
    const expectedNextStage = validStages[currentStageIndex + 1];
    
    // ONLY allow transition to next stage (not same, not skip ahead)
    if (stage !== expectedNextStage) {
        return res.status(400).json({
            success: false,
            message: `Invalid stage transition. Door #${doorNumber} is in ${doorUnit.currentStage}, next stage must be ${expectedNextStage} (received: ${stage})`,
            data: null
        });
    }
} else {
    // If REJECTED, stay in the same stage (don't move forward)
    if (stage !== doorUnit.currentStage) {
        return res.status(400).json({
            success: false,
            message: `For REJECTED quality, stage must be current stage (${doorUnit.currentStage}). Received: ${stage}`,
            data: null
        });
    }
}
```

### What Changed

1. **Calculate Expected Stage Explicitly**
   ```javascript
   const expectedNextStage = validStages[currentStageIndex + 1];
   ```
   No ambiguity - we know exactly what the next stage should be.

2. **Strict Equality Check**
   ```javascript
   if (stage !== expectedNextStage)
   ```
   not `if (stageIndex > currentStageIndex + 1)`
   
   **Why:** The new check is absolute:
   - If door is in CUTTING (index 0), expectedNextStage is PROCESSING (index 1)
   - Accepting ANYTHING other than PROCESSING is an error
   - This blocks:
     - Same stage: CUTTING when already CUTTING
     - Skip: POLISHING when in CUTTING
     - Any stage: LOADING when in CUTTING

3. **Detailed Error Messages**
   ```javascript
   message: `Invalid stage transition. Door #${doorNumber} is in ${doorUnit.currentStage}, next stage must be ${expectedNextStage} (received: ${stage})`
   ```
   Users see EXACTLY:
   - What door is problematic (#1, #2, etc.)
   - What stage it's currently in (CUTTING)
   - What stage it should go to (PROCESSING)
   - What was incorrectly sent (POLISHING)

---

## Stage Sequence Array

For reference, the sequence is defined as:

```javascript
const validStages = ['CUTTING', 'PROCESSING', 'POLISHING', 'PACKING', 'LOADING'];
```

Indexes:
- CUTTING = 0
- PROCESSING = 1
- POLISHING = 2
- PACKING = 3
- LOADING = 4

---

## Validation Logic Examples

### Example 1: Valid Transition (CUTTING → PROCESSING)
```
Door currentStage: CUTTING (index 0)
currentStageIndex = 0
expectedNextStage = validStages[0 + 1] = validStages[1] = PROCESSING
Received stage: PROCESSING

Check: stage === expectedNextStage
       PROCESSING === PROCESSING ✅ TRUE
Result: ✅ ACCEPTED - Door moves to PROCESSING
```

### Example 2: Invalid Transition (CUTTING → POLISHING, skip PROCESSING)
```
Door currentStage: CUTTING (index 0)
currentStageIndex = 0
expectedNextStage = validStages[0 + 1] = PROCESSING
Received stage: POLISHING

Check: stage === expectedNextStage
       POLISHING === PROCESSING ❌ FALSE
Result: ❌REJECTED - Error: "next stage must be PROCESSING (received: POLISHING)"
```

### Example 3: Invalid Transition (Going backward, PROCESSING → CUTTING)
```
Door currentStage: PROCESSING (index 1)
currentStageIndex = 1
expectedNextStage = validStages[1 + 1] = POLISHING
Received stage: CUTTING

Check: stage === expectedNextStage
       CUTTING === POLISHING ❌ FALSE
Result: ❌ REJECTED - Error: "next stage must be POLISHING (received: CUTTING)"
```

### Example 4: Invalid Transition (Same stage, POLISHING → POLISHING)
```
Door currentStage: POLISHING (index 2)
currentStageIndex = 2
expectedNextStage = validStages[2 + 1] = PACKING
Received stage: POLISHING

Check: stage === expectedNextStage
       POLISHING === PACKING ❌ FALSE
Result: ❌ REJECTED - Error: "next stage must be PACKING (received: POLISHING)"
```

### Example 5: Valid Final Stage (PACKING → LOADING)
```
Door currentStage: PACKING (index 3)
currentStageIndex = 3
expectedNextStage = validStages[3 + 1] = LOADING
Received stage: LOADING

Check: stage === expectedNextStage
       LOADING === LOADING ✅ TRUE
Result: ✅ ACCEPTED - Door moves to LOADING
```

---

## Rejected Quality (Special Case)

If `quality === 'REJECTED'`, the door doesn't move. It stays in current stage:

```javascript
if (quality === 'REJECTED' && !reason) {
    return res.status(400).json({
        success: false,
        message: 'Rejection reason is required when quality is REJECTED',
        data: null
    });
}

if (quality === 'REJECTED') {
    if (stage !== doorUnit.currentStage) {
        return res.status(400).json({
            success: false,
            message: `For REJECTED quality, stage must be current stage (${doorUnit.currentStage}). Received: ${stage}`,
            data: null
        });
    }
}
```

**Logic:** When rejecting, stage must be current stage (no progress).

---

## Complete Stage Update Route (Updated)

```javascript
/**
 * @route   POST /api/production/update-stage
 * @desc    Update door stage with worker information
 * @access  Private (ProductionSupervisor, FactoryAdmin, SuperAdmin)
 * 
 * Body:
 * {
 *   orderId: String,
 *   doorNumber: Number,
 *   stage: String (CUTTING|PROCESSING|POLISHING|PACKING|LOADING),
 *   worker: String (manual entry),
 *   quality: String (OK|REJECTED),
 *   reason: String (required if REJECTED)
 * }
 * 
 * Validation:
 * - Stage must be exact next stage (NO SKIPPING)
 * - Worker field is required
 * - If rejected, door stays in current stage
 * - When all doors reach LOADING, order auto-completes
 */
router.post('/update-stage', protect, authorize(...), async (req, res) => {
  try {
    const { orderId, doorNumber, stage, worker, quality, reason } = req.body;
    const validStages = ['CUTTING', 'PROCESSING', 'POLISHING', 'PACKING', 'LOADING'];

    // ... basic validations ...

    // Find the door unit
    const doorUnit = await DoorUnit.findOne({ orderId, doorNumber });
    if (!doorUnit) {
        return res.status(404).json({
            success: false,
            message: `Door unit not found`,
            data: null
        });
    }

    // 🔐 STRICT STAGE VALIDATION: Only allow exact next stage in sequence
    const stageIndex = validStages.indexOf(stage);
    const currentStageIndex = validStages.indexOf(doorUnit.currentStage);

    if (quality === 'OK') {
        // Calculate the EXACT next stage
        const expectedNextStage = validStages[currentStageIndex + 1];
        
        // ONLY allow transition to next stage (not same, not skip ahead)
        if (stage !== expectedNextStage) {
            return res.status(400).json({
                success: false,
                message: `Invalid stage transition. Door #${doorNumber} is in ${doorUnit.currentStage}, next stage must be ${expectedNextStage} (received: ${stage})`,
                data: null
            });
        }
    } else {
        // If REJECTED, stay in the same stage (don't move forward)
        if (stage !== doorUnit.currentStage) {
            return res.status(400).json({
                success: false,
                message: `For REJECTED quality, stage must be current stage (${doorUnit.currentStage}). Received: ${stage}`,
                data: null
            });
        }
    }

    // Create history entry
    const historyEntry = {
        stage: quality === 'REJECTED' ? doorUnit.currentStage : stage,
        worker: worker.trim(),
        quality,
        reason: reason || null,
        timestamp: new Date()
    };

    // Update the door unit
    if (quality === 'OK') {
        doorUnit.currentStage = stage;
        doorUnit.isRejected = false;
    } else {
        doorUnit.isRejected = true;
    }

    doorUnit.stageHistory.push(historyEntry);
    await doorUnit.save();

    // ... rest of the logic ...

  } catch (error) {
    // ... error handling ...
  }
});
```

---

## Why This Works

1. **Definitive:** No ambiguity about what stage is next
2. **Strict:** Only accepts the exact stage, nothing else
3. **Clear:** Error messages show exactly what went wrong
4. **Foolproof:** Backend catches all attempts to violate sequence
5. **Enforceable:** Works even if frontend has bugs

---

## Testing Validation

### Test Case 1: Normal Flow (Should Work)
```
Request: { orderId: 'ORD001', doorNumber: 1, stage: 'PROCESSING', ... }
Door currentStage: 'CUTTING'
Expected: 'PROCESSING'
Received: 'PROCESSING'
Result: ✅ 200 OK
```

### Test Case 2: Skip Stage (Should Fail)
```
Request: { orderId: 'ORD001', doorNumber: 1, stage: 'POLISHING', ... }
Door currentStage: 'CUTTING'
Expected: 'PROCESSING'
Received: 'POLISHING'
Result: ❌ 400 Bad Request
Message: "Door #1 is in CUTTING, next stage must be PROCESSING (received: POLISHING)"
```

### Test Case 3: Backward (Should Fail)
```
Request: { orderId: 'ORD001', doorNumber: 1, stage: 'CUTTING', ... }
Door currentStage: 'PROCESSING'
Expected: 'POLISHING'
Received: 'CUTTING'
Result: ❌ 400 Bad Request
Message: "Door #1 is in PROCESSING, next stage must be POLISHING (received: CUTTING)"
```

---

## Deployment Checklist

- [x] Backend route updated with strict validation
- [x] Frontend auto-calculates next stage per door
- [x] Frontend filtering shows correct doors per section
- [x] Error messages are specific and helpful
- [x] All code validated (no syntax errors)
- [x] Documentation created

**Ready for:** Testing, QA, Production deployment

---

## Version Control

- **Before:** Lines 250-262 (loose validation)
- **After:** Lines 250-270 (strict validation)
- **Change Type:** Bug fix / Safety improvement
- **Breaking Changes:** None (only rejects invalid requests)

---

## Summary

The new backend validation ensures:
✅ No stage skipping (MUST be exact next stage)  
✅ No backward movement (next is always forward)  
✅ No staying in same stage (must progress)  
✅ Clear error messages (exact expected vs received)  
✅ Robust error handling (works despite frontend bugs)

**Result:** Strict sequential stage flow guaranteed at the API level.
