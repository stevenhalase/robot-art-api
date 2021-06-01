const mongoose = require('mongoose');

const RobotSchema = new mongoose.Schema({
	name: String,
	image: { data: String, contentType: String },
	votes: [String]
});

module.exports = mongoose.model('Robot', RobotSchema);;