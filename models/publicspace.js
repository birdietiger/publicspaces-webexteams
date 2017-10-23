// grab the things we need
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// create a schema
const publicspaceSchema = new Schema({
	spaceId: String,
	title: String,
	isLocked: Boolean,
	shortId: String,
	active: Boolean,
	list: Boolean,
	internal: Boolean,
	internalDomains: [String],
	hits: Number,
	created: Date,
	updated: Date
});

// the schema is useless so far
// we need to create a model using it
var Publicspace = mongoose.model('Publicspace', publicspaceSchema);

// make this available to our users in our Node applications
module.exports = Publicspace;
