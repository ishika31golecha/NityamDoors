const express = require('express');
const Order = require('../models/Order');
const { protect, authorize } = require('../middleware/authMiddleware');
const upload = require('../config/multer');

const router = express.Router();

/**
 * @route   POST /api/orders
 * @desc    Create a new order with file upload support
 * @access  Private (SalesExecutive, FactoryAdmin, SuperAdmin)
 */
router.post('/', protect, authorize('SalesExecutive', 'FactoryAdmin', 'SuperAdmin'), upload.single('doorFile'), async (req, res) => {
  try {
    console.log('\n=== 📥 POST /api/orders REQUEST ===');
    console.log('Request Body Keys:', Object.keys(req.body));
    console.log('File:', req.file ? req.file.filename : 'No file');

    let { customerType, customer, doors, ratePerUnit } = req.body;

    // Parse JSON strings from FormData
    if (typeof customer === 'string') {
      try {
        customer = JSON.parse(customer);
        console.log('✅ Parsed customer:', customer);
      } catch (e) {
        console.error('❌ Failed to parse customer:', customer, e.message);
        return res.status(400).json({
          success: false,
          message: 'Invalid customer data format: ' + e.message
        });
      }
    }

    if (typeof doors === 'string') {
      try {
        doors = JSON.parse(doors);
        console.log('✅ Parsed doors:', Array.isArray(doors) ? `[${doors.length} doors]` : 'single door');
      } catch (e) {
        console.error('❌ Failed to parse doors:', doors, e.message);
        return res.status(400).json({
          success: false,
          message: 'Invalid doors data format: ' + e.message
        });
      }
    }

    console.log('Customer Type:', customerType);
    console.log('Customer Name:', customer?.name);
    console.log('Customer Mobile:', customer?.mobileNumber);
    console.log('Mobile type:', typeof customer?.mobileNumber);
    console.log('Doors Count:', Array.isArray(doors) ? doors.length : (doors ? 1 : 0));
    console.log('Rate Per Unit:', ratePerUnit, 'Type:', typeof ratePerUnit);

    // Validate required fields
    if (!customer) {
      console.error('❌ Customer object is missing');
      return res.status(400).json({
        success: false,
        message: 'Customer object is missing.',
        received: { customer }
      });
    }

    if (!customer.name) {
      console.error('❌ Customer name is missing');
      return res.status(400).json({
        success: false,
        message: 'Customer name is required.',
        received: { name: customer.name }
      });
    }

    if (!customer.mobileNumber) {
      console.error('❌ Mobile number is missing');
      return res.status(400).json({
        success: false,
        message: 'Mobile number is required.',
        received: { mobileNumber: customer.mobileNumber }
      });
    }

    // Convert mobile to string and trim
    const mobileStr = String(customer.mobileNumber).trim();
    
    // Validate mobile number
    const mobileRegex = /^[0-9]{10}$/;
    if (!mobileRegex.test(mobileStr) || mobileStr === '0000000000') {
      console.error('❌ Mobile validation failed:', mobileStr);
      return res.status(400).json({
        success: false,
        message: `Mobile number must be 10 digits and not all zeros. Received: "${mobileStr}"`
      });
    }

    // Validate GST if provided
    if (customer.gstNumber && String(customer.gstNumber).trim()) {
      const gstStr = String(customer.gstNumber).trim();
      const gstRegex = /^[A-Z0-9]{15}$/;
      if (!gstRegex.test(gstStr)) {
        console.error('❌ GST validation failed:', gstStr);
        return res.status(400).json({
          success: false,
          message: `GST number must be 15 alphanumeric characters. Received: "${gstStr}" (length: ${gstStr.length})`
        });
      }
    }

    if (!doors || doors.length === 0) {
      console.error('❌ No doors provided. Received:', doors);
      return res.status(400).json({
        success: false,
        message: 'At least one door specification is required.',
        received: { doorsCount: doors?.length, doorsType: typeof doors }
      });
    }

    // Parse and validate doors
    let parsedDoors = [];
    let totalArea = 0;

    try {
      const doorsArray = Array.isArray(doors) ? doors : [doors];
      
      // Filter out empty door entries
      const nonEmptyDoors = doorsArray.filter(door => {
        const doorData = typeof door === 'string' ? JSON.parse(door) : door;
        return doorData.length && doorData.breadth;
      });

      if (nonEmptyDoors.length === 0) {
        console.error('❌ All doors are empty (no length/breadth). Total doors received:', doorsArray.length);
        return res.status(400).json({
          success: false,
          message: 'At least one valid door specification (with length and breadth) is required.',
          debug: { totalDoorsReceived: doorsArray.length, validDoors: 0 }
        });
      }

      console.log(`✅ Found ${nonEmptyDoors.length} valid doors out of ${doorsArray.length}`);

      nonEmptyDoors.forEach((door, index) => {
        const doorData = typeof door === 'string' ? JSON.parse(door) : door;
        
        console.log(`Processing Door ${index + 1}:`, doorData);
        
        // Check for required fields - Use proper null/undefined checks, not falsy checks
        if (doorData.length === null || doorData.length === undefined || doorData.length === '') {
          throw new Error(`Door ${index + 1}: Length is required and must be a number`);
        }
        if (doorData.breadth === null || doorData.breadth === undefined || doorData.breadth === '') {
          throw new Error(`Door ${index + 1}: Breadth is required and must be a number`);
        }
        if (doorData.thickness === null || doorData.thickness === undefined || doorData.thickness === '') {
          throw new Error(`Door ${index + 1}: Thickness is required and must be a number`);
        }

        const length = parseFloat(doorData.length);
        const breadth = parseFloat(doorData.breadth);
        const thickness = parseFloat(doorData.thickness);

        // Validate parsed numbers
        if (isNaN(length)) {
          throw new Error(`Door ${index + 1}: Length must be a valid number (received: ${doorData.length})`);
        }
        if (isNaN(breadth)) {
          throw new Error(`Door ${index + 1}: Breadth must be a valid number (received: ${doorData.breadth})`);
        }
        if (isNaN(thickness)) {
          throw new Error(`Door ${index + 1}: Thickness must be a valid number (received: ${doorData.thickness})`);
        }

        // Validate positive values
        if (length <= 0) {
          throw new Error(`Door ${index + 1}: Length must be greater than 0 (received: ${length})`);
        }
        if (breadth <= 0) {
          throw new Error(`Door ${index + 1}: Breadth must be greater than 0 (received: ${breadth})`);
        }
        if (thickness <= 0) {
          throw new Error(`Door ${index + 1}: Thickness must be greater than 0 (received: ${thickness})`);
        }

        const area = length * breadth;
        totalArea += area;

        console.log(`✅ Door ${index + 1} Valid - Area: ${area.toFixed(2)} cm²`);

        parsedDoors.push({
          length,
          breadth,
          thickness,
          area,
          doorType: doorData.doorType || '',
          laminate: doorData.laminate || '',
          priority: doorData.priority || 'Normal',
          flatNo: doorData.flatNo || '',
          fileUrl: req.file && index === 0 ? `/uploads/${req.file.filename}` : null
        });
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid door data: ' + error.message
      });
    }

    const rateValue = parseFloat(ratePerUnit);
    console.log('Rate Per Unit Check - Raw:', ratePerUnit, 'Parsed:', rateValue, 'isNaN:', isNaN(rateValue));
    
    if (isNaN(rateValue)) {
      return res.status(400).json({
        success: false,
        message: 'Rate per unit must be a valid number (received: ' + ratePerUnit + ')'
      });
    }
    
    // Allow 0 rate (can be set/adjusted later)
    if (rateValue < 0) {
      return res.status(400).json({
        success: false,
        message: 'Rate per unit cannot be negative.'
      });
    }

    const totalAmount = totalArea * rateValue;

    // Create order object
    const orderData = {
      customer: {
        name: customer.name,
        email: customer.primaryEmail,
        phone: customer.primaryPhone,
        mobileNumber: customer.mobileNumber,
        gstNumber: customer.gstNumber && customer.gstNumber.trim() ? customer.gstNumber : null,
        address: customer.address?.billing
      },
      customerType: customerType || 'Individual',
      doors: parsedDoors,
      ratePerUnit: rateValue,
      totalArea: parseFloat(totalArea.toFixed(2)),
      totalAmount: parseFloat(totalAmount.toFixed(2)),
      status: 'CREATED',
      createdBy: req.user._id
    };

    console.log('📝 Saving order to MongoDB...');

    // Save to MongoDB
    const order = await Order.create(orderData);

    console.log('✅ Order saved successfully!');

    res.status(201).json({
      success: true,
      message: 'Order created successfully and saved to MongoDB.',
      data: { 
        order,
        orderId: order.orderId,
        mongoId: order._id
      }
    });

  } catch (error) {
    console.error('❌ Create Order Error:', error);
    console.error('Error Stack:', error.stack);
    
    res.status(500).json({
      success: false,
      message: 'Server error creating order: ' + error.message,
      error: process.env.NODE_ENV === 'development' ? {
        message: error.message,
        stack: error.stack.split('\n').slice(0, 5)
      } : undefined
    });
  }
});

/**
 * @route   POST /api/orders/parse-document
 * @desc    Parse order document using OpenAI Vision API
 * @access  Private (SalesExecutive, FactoryAdmin, SuperAdmin)
 */
router.post('/parse-document', protect, authorize('SalesExecutive', 'FactoryAdmin', 'SuperAdmin'), upload.single('orderDocument'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    console.log('📄 Processing document:', req.file.filename);

    const fs = require('fs');
    const path = require('path');
    const axios = require('axios');

    const filePath = req.file.path;
    const fileExt = path.extname(req.file.originalname).toLowerCase();

    let base64Data = null;
    let imageMediaType = null;

    if (['.jpg', '.jpeg', '.png'].includes(fileExt)) {
      const imageBuffer = fs.readFileSync(filePath);
      base64Data = imageBuffer.toString('base64');
      imageMediaType = fileExt === '.png' ? 'image/png' : 'image/jpeg';
    } else if (fileExt === '.pdf') {
      // For PDF, use document parsing
      base64Data = fs.readFileSync(filePath).toString('base64');
      imageMediaType = 'application/pdf';
    } else if (['.xlsx', '.xls'].includes(fileExt)) {
      const XLSX = require('xlsx');
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);
      
      // Parse Excel data into door specifications
      const doors = data.map(row => ({
        length: parseFloat(row['Length'] || row['length'] || row['Height'] || row['height'] || 0),
        breadth: parseFloat(row['Breadth'] || row['breadth'] || row['Width'] || row['width'] || 0),
        thickness: parseFloat(row['Thickness'] || row['thickness'] || row['Thick'] || row['thick'] || 30),
        doorType: row['Door Type'] || row['Type'] || row['type'] || 'BED'
      })).filter(d => d.length > 0 && d.breadth > 0);

      // Clean up uploaded file
      fs.unlinkSync(filePath);

      return res.status(200).json({
        success: true,
        data: {
          customerName: data[0]?.['Customer Name'] || data[0]?.['Customer'] || '',
          date: data[0]?.['Date'] || new Date().toLocaleDateString('en-IN'),
          doors: doors
        }
      });
    }

    // Use OpenAI Vision API for image/PDF
    if (!base64Data) {
      return res.status(400).json({
        success: false,
        message: 'Could not process file'
      });
    }

    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      console.error('❌ OPENAI_API_KEY not set in environment');
      return res.status(500).json({
        success: false,
        message: 'OpenAI API key not configured'
      });
    }

    const requestPayload = {
      model: 'gpt-4-vision-preview',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Extract door specifications from this order sheet. Return ONLY valid JSON with this structure:
{
  "customerName": "string",
  "date": "string",
  "doors": [
    {
      "length": number (in cm),
      "breadth": number (in cm),
      "thickness": number (in mm, typically 30 or 35),
      "doorType": "string (MAIN/BED/KITCHEN/WARDROBE/GAL etc)"
    }
  ]
}

Rules:
- Extract all door rows from the table
- Convert measurements to numbers
- If unit is inches, convert to cm (multiply by 2.54)
- If unit is mm, convert length/breadth to cm
- thickness should remain in mm
- Return only the JSON, no additional text`
            },
            {
              type: imageMediaType === 'application/pdf' ? 'text' : 'image',
              ...(imageMediaType === 'application/pdf' 
                ? { text: '[PDF content in base64]' }
                : { image_url: { url: `data:${imageMediaType};base64,${base64Data}` } }
              )
            }
          ]
        }
      ],
      max_tokens: 1000
    };

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      requestPayload,
      {
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const content = response.data.choices[0].message.content;
    console.log('📤 OpenAI Response:', content);

    // Parse JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(400).json({
        success: false,
        message: 'Could not extract structured data from document'
      });
    }

    const parsedData = JSON.parse(jsonMatch[0]);

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    res.status(200).json({
      success: true,
      data: parsedData
    });

  } catch (error) {
    console.error('❌ Parse Document Error:', error.message);

    // Clean up file if exists
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {
        console.error('Error deleting file:', e.message);
      }
    }

    res.status(500).json({
      success: false,
      message: 'Error parsing document: ' + error.message
    });
  }
});

/**
 * @route   GET /api/orders
 * @desc    Get all orders
 * @access  Private
 */
router.get('/', protect, async (req, res) => {
  try {
    const orders = await Order.find();

    res.status(200).json({
      success: true,
      data: { orders }
    });
  } catch (error) {
    console.error('Get Orders Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching orders.'
    });
  }
});

/**
 * @route   GET /api/orders/:id
 * @desc    Get order by ID
 * @access  Private
 */
router.get('/:id', protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.'
      });
    }

    res.status(200).json({
      success: true,
      data: { order }
    });
  } catch (error) {
    console.error('Get Order By ID Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching order.'
    });
  }
});

/**
 * @route   PUT /api/orders/:id
 * @desc    Update order
 * @access  Private (SalesExecutive, FactoryAdmin, SuperAdmin)
 */
router.put('/:id', protect, authorize('SalesExecutive', 'FactoryAdmin', 'SuperAdmin'), async (req, res) => {
  try {
    const { items, totalAmount, status } = req.body;

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { items, totalAmount, status },
      { new: true, runValidators: true }
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Order updated successfully.',
      data: { order }
    });
  } catch (error) {
    console.error('Update Order Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating order.'
    });
  }
});

module.exports = router;
