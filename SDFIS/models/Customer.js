const mongoose = require('mongoose');

/**
 * Customer Schema for Sales Executive customer management
 */
const customerSchema = new mongoose.Schema({
	name: {
		type: String,
		required: [true, 'Customer name is required'],
		trim: true,
		maxlength: [100, 'Customer name cannot exceed 100 characters']
	},
	email: {
		type: String,
		trim: true,
		lowercase: true,
		match: [
			/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
			'Please provide a valid email address'
		]
	},
	phone: {
		type: String,
		required: [true, 'Phone number is required'],
		trim: true,
		match: [
			/^[+]?[0-9]{10,15}$/,
			'Please provide a valid phone number (10-15 digits)'
		]
	},
	address: {
		type: String,
		trim: true,
		maxlength: [250, 'Address cannot exceed 250 characters']
	},
	city: {
		type: String,
		trim: true,
		maxlength: [80, 'City cannot exceed 80 characters']
	},
	type: {
		type: String,
		enum: ['Individual', 'Builder', 'Architect', 'Dealer', 'Other'],
		default: 'Individual'
	},
	createdBy: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'User',
		required: [true, 'Created by user is required']
	}
}, {
	timestamps: true
});

module.exports = mongoose.model('Customer', customerSchema);
