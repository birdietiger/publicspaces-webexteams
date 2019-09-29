// TODO
// 429 handling throughout
// processing time per response in logs
// add integration (oauth) support to have user login

// setup env var
const env = require('node-env-file');
env(__dirname + '/.env');

// check for env vars
if (!process.env.MONGO_URI) {
	console.log('Error: Specify a mongo URI in environment as "MONGO_URI".');
	process.exit(1);
}

if (!process.env.BASE_URL) {
	console.log('Error: Specify the base URL for this bots shortened URLs in environment as "BASE_URL".');
	process.exit(1);
}

if (!process.env.CISCOSPARK_ACCESS_TOKEN) {
	console.log('Error: Specify a Webex Teams access token in environment as "CISCOSPARK_ACCESS_TOKEN".');
	process.exit(1);
}

// TODO isn't used for anything yet
/*
var webAuth = "oauth";
if (
	!process.env.WEBEXTEAMS_CLIENT_ID
	|| !process.env.WEBEXTEAMS_CLIENT_SECRET
	|| !process.env.WEBEXTEAMS_OAUTH_URL
	) {
	console.log('Warn: Specify "WEBEXTEAMS_CLIENT_ID", "WEBEXTEAMS_CLIENT_SECRET", and "WEBEXTEAMS_OAUTH_URL" in environment if you want use Webex Teams authentication.');
	webAuth = "url";
}
*/

if (!process.env.REVERSE_PROXY)
	console.log('Warn: Assuming app is not behind a reverse proxy. If it is, set "REVERSE_PROXY=true" in environment and add "X-Forwarded-Proto" to request header in the proxy.');
else
	console.log('Warn: Make sure that your reverse proxy is set to rewrite the cookie path correctly.');

if (!process.env.WEBEXTEAMS_WEBHOOK_SECRET)
	console.log('Warn: You really should be using a webhook secret. Specify a Webex Teams webhook secret in environment as "WEBEXTEAMS_WEBHOOK_SECRET".');

if (!process.env.WEBEXTEAMS_ADMIN_SPACE_ID)
	console.log('Warn: Specify a Webex Teams Room/Space ID in environment as "WEBEXTEAMS_ADMIN_SPACE_ID" to receive errors in Webex Teams.');

if (!process.env.WEBEXTEAMS_SUPPORT_SPACE_ID)
	console.log('Warn: Specify a Webex Teams Room/Space ID in environment as "WEBEXTEAMS_SUPPORT_SPACE_ID" to allow users to join the support space in Webex Teams.');

var sourceUrl = 'https://github.com/birdietiger/publicspaces-webexteams';
if (!process.env.SOURCE_URL)
	console.log('Warn: You can set a source code url in environment as "SOURCE_URL". Using default source code url of '+sourceUrl);
else
	sourceUrl = process.env.SUPPORT_EMAIL;

var permitDomains = [];
if (!process.env.PERMIT_DOMAINS)
	console.log('Warn: If you want to limit supported domains, set PERMIT_DOMAINS in environment.');
else
	permitDomains = process.env.PERMIT_DOMAINS.toLowerCase().split(/\ *,\ */);

var description = '';
if (!process.env.DESCRIPTION)
	console.log('Warn: If you want a description used on the listing page and help message set DESCRIPTION in environment.');
else
	description = process.env.DESCRIPTION;

var supportEmail = '';
if (!process.env.SUPPORT_EMAIL)
	console.log('Warn: You should have a support email set in environment as "SUPPORT_EMAIL" so users can contact you.');
else
	supportEmail = process.env.SUPPORT_EMAIL;

if (!process.env.ADMIN_PORT)
	console.log('Warn: Admin apis are disabled. Specify a TCP port to use in environment as "ADMIN_PORT" to enable them.');
else
	console.log('Info: Admin apis are enabled on port '+process.env.ADMIN_PORT);

if (!process.env.PORT)
	console.log('Warn: Specify a TCP port to use in environment as "PORT" or default port of 3000 will be used.');

const messagesPerSecond = process.env.WEBEXTEAMS_MESSAGES_PER_SECOND || 4;
if (!process.env.WEBEXTEAMS_MESSAGES_PER_SECOND)
    console.log('Warn: Using default messages per second of '+messagesPerSecond+'. Specify "WEBEXTEAMS_MESSAGES_PER_SECOND" in environment.');

if (!process.env.LOG_FILE)
	console.log('Warn: No log file set, so just using console. Set "LOG_FILE" in environment to log to a file.');

var logLevels = [ "error", "warn", "info", "verbose", "debug", "silly" ];
var logLevel = "info";
if (logLevels.includes(process.env.LOG_LEVEL))
	logLevel = process.env.LOG_LEVEL;
console.log('Info: Setting log level to "'+logLevel+'". Set LOG_LEVEL in environment to "error", "warn", "info", "verbose", "debug", or "silly"');
	
// required packages
const assert = require('assert');
const winston = require('winston');
const expressWinston = require('express-winston');
const https = require('https');
const bodyParser = require('body-parser');
const path = require('path');
const ShortId = require('shortid');
const validator = require('validator');
const crypto = require('crypto');
const webexteams = require('ciscospark/env');
const qr = require('qr-image');
const mongoose = require('mongoose').connect(process.env.MONGO_URI);
const express = require('express');
const session = require('express-session');
const mongoDBStore = require('connect-mongodb-session')(session);
 
// setup logging
var logTransports = [];
var logConfig = winston.config;
var logStatusLevels = {
	success: "debug",
	warn: "debug",
	error: "info"
}
var logOptions = {
	level: logLevel,
   timestamp: function() {
      var now = new Date();
      return now.getUTCFullYear() + "/" +
         ("0" + (now.getUTCMonth()+1)).slice(-2) + "/" +
         ("0" + now.getUTCDate()).slice(-2) + " " +
         ("0" + now.getUTCHours()).slice(-2) + ":" +
         ("0" + now.getUTCMinutes()).slice(-2) + ":" +
         ("0" + now.getUTCSeconds()).slice(-2);
   },
   formatter: function(options) {
      return options.timestamp() + ' ' +
      logConfig.colorize(options.level, options.level.toUpperCase()) + ' ' +
      (options.message ? options.message : '') +
      (options.meta && Object.keys(options.meta).length ? '\n\t'+ JSON.stringify(options.meta) : '' );
   }
}
logTransports.push(new (winston.transports.Console)(logOptions));

// if log file is set add it to transports
if (process.env.LOG_FILE)
	logTransports.push(new (winston.transports.File)(Object.assign(logOptions, { filename: process.env.LOG_FILE })));

// create logger
var log = new (winston.Logger)({
	transports: logTransports
});

// status codes from memberships list that need to be handled differently or just ignored
var membershipsIgnoreStatusCode = [
	404,
	500
	];

// cookie name for session id
const cookieSidName = 'sid';

// define db schema 
const Publicspace = require('./models/publicspace');

// define express app
const app = express();
const router = express.Router();

// set tcp port for express
app.set('port', process.env.PORT || 3000);

// if behind a https -> http reverse proxy, must trust proxy
if (process.env.REVERSE_PROXY)
	app.set('trust proxy', 1);

// create parsers for posts to shortid endpoint
const jsonParser = new bodyParser.json();
const textParser = new bodyParser.text({
	type: '*/*'
});

// winston filter for sensitive data
var expressWinstonReqFilter = function (req, propName) {
	if (propName == 'headers' && req[propName].cookie)
		req[propName].cookie = req[propName].cookie.replace(RegExp('\('+cookieSidName+'=\)[^;]+'), '$1%REDACTED%');
	return req[propName];
}

// express-winston logger makes sense BEFORE the router.
app.use(expressWinston.logger({
	transports: logTransports,
	statusLevels: logStatusLevels,
	requestFilter: expressWinstonReqFilter
}));

// use the router
app.use(router);

// express-winston errorLogger makes sense AFTER the router.
app.use(expressWinston.errorLogger({
	transports: logTransports,
	statusLevels: logStatusLevels,
	requestFilter: expressWinstonReqFilter
}));

// tell Express to serve files from our public folder
app.use(express.static(path.join(__dirname, 'public')))

// setup session store
var sessionStore = new mongoDBStore({
	uri: process.env.MONGO_URI,
	collection: 'sessions'
});

// handle errors for session store
sessionStore.on('error', function(error) {
	assert.ifError(error);
	assert.ok(false);
});

// create middleware for sessions
const sessionMiddleware = session({
	store: sessionStore,
	secret: crypto.createHash('sha256').update(process.env.CISCOSPARK_ACCESS_TOKEN).digest('base64'),
	resave: false,
	saveUninitialized: true,
	name: cookieSidName,
	cookie: {
		secure: true,
		httpOnly: false,
		maxAge: 1000 * 60 * 60 * 1 // 1 hour
	}
});

// apply session middleware
app.use(sessionMiddleware);

// if admin api enabled, setup admin express using same options as app express
if (process.env.ADMIN_PORT) {
	const adminApp = express();
	const adminRouter = express.Router();
	adminApp.set('port', process.env.ADMIN_PORT);
	if (process.env.REVERSE_PROXY)
		adminApp.set('trust proxy', 1);
	adminApp.use(expressWinston.logger({
		transports: logTransports,
		statusLevels: logStatusLevels,
		requestFilter: expressWinstonReqFilter
	}));
	adminApp.use(router);
	adminApp.use(expressWinston.errorLogger({
		transports: logTransports,
		statusLevels: logStatusLevels,
		requestFilter: expressWinstonReqFilter
	}));

	// return jobs json
	adminApp.get('/api/jobs/:type/:key/:data', function(req, res){
		res.status(200).send(JSON.stringify(jobs[req.params.type][req.params.key][req.params.data]));
	});

	// return cache json
	adminApp.get('/api/cache/:type/:key', function(req, res){
		res.status(200).send(JSON.stringify(cache[req.params.type][req.params.key]));
	});

	// endpoint to check cache size from localhost only
	adminApp.get('/api/cache/count', function(req, res){

		var response = {
			total: 0
			};
		Object.keys(cache).forEach(function(key){
			response.total += Object.keys(cache[key]).length;
		});
		res.status(200).send(JSON.stringify(response));

	});

	// start admin express
	var adminServer = adminApp.listen(adminApp.get('port'), function(){
		log.info('Admin server listening on port '+adminServer.address().port);
	});

}

// serve custom config for web app
app.get('/js/config.js', function(req, res){
	res.setHeader("Content-type", "application/javascript");
	res.charset = "UTF-8";
	var javascriptConfig = `
		var supportEmail = "`+supportEmail+`";
		var description = "`+description+`";
		var botAvatar = "`+botDetails.avatar+`";
		var botName = "`+botDetails.displayName+`";
		var botEmail = "`+botDetails.emails[0]+`";
		`;
	res.send(javascriptConfig);
});

// route to serve up the homepage (index.html)
app.get('/', function(req, res){
	res.sendFile(path.join(__dirname, 'views/index.html'));
});

// authenticate user link
app.get('/auth/:tempPwd', function(req, res){

	// must have tempPwd email and the tempPwd params must match
	if (
		req.session.tempPwd
		&& req.session.email
		&& req.session.tempPwd === req.params.tempPwd
		) { 

		// users email
		var email = req.session.email;

		// remove the verify teams message to keep things clean. don't care about return
		webexteams.messages.remove(req.session.authMessageId)
		.then(function(){})
		.catch(function(err){});

		// create a new session
		req.session.regenerate(function(err){

			// lasts for 2 weeks
			req.session.cookie.expires = new Date(Date.now() + (1000 * 60 * 60 * 24 * 14));

			// set so we know if future requests are authenticated
			req.session.authenticated = true;

			// save the email
			req.session.email = email;

			// send them back to the listing
			res.redirect(process.env.BASE_URL);

		});

	// missing something. maybe naughty
	} else

		// send them back to get email for verification
		res.redirect(process.env.BASE_URL);

});

// reroute short ids that don't have leading #
app.get('/:shortId', function(req, res) {
	res.redirect(process.env.BASE_URL+'#'+req.params.shortId);
});

// generate qr image for joining
var qrPath = '/img/qr/';
app.get(qrPath+':shortId', function(req, res){
	var code = qr.image(process.env.BASE_URL+"#"+req.params.shortId, { type: 'png' });
	res.setHeader('Content-type', 'image/png');
	code.pipe(res);
});

// endpoint to get memberships cache for a user
app.get('/api/memberships', function(req, res){

	// trying to get memberships outside of app
	if (
		!req.session.authenticated
		|| !req.session.email
		) {
		res.status(401).send('Unauthorized');
		return;
	}

	// if the cache exists for a user, return it
	var memberships = {};
	if (cache.memberships[req.session.email])
		memberships = cache.memberships[req.session.email];
	res.json({ responseCode: 0, memberships: memberships });

});

// endpoint to get spaces that are listed
app.get('/api/spaces', function(req, res){

	// trying to get spaces but haven't authenticated yet
	if (
		!req.session.authenticated
		|| !req.session.email
		) {

		// create a temp pwd
		req.session.tempPwd = ShortId.generate();

		// let web app know to display verification steps
		res.json({
			responseCode: -1,
		});

		// stop processing this route
		return;

	}

	// get domain for user
	var personDomain = getEmailDomain(req.session.email);

	// search db for spaces that are listed
	Publicspace.find({
		"active": true,
		"list": true,
		$or: [
			{ "internal": false },
			{
				$and: [
					{ "internal": true },
					{ "internalDomains": personDomain }
				]
			}
		],
	},
	function (err, publicspaces){

		// something failed
		if (err) {
			handleErr(err);
			res.json({ responseCode: 1 });

		// no spaces that have been enabled for listing
		} else if (!publicspaces) {
			res.json({ responseCode: 0, spaces: {} });

		// things look good
		} else {

			// get only relevant data from the public spaces
			parsedSpaces = publicspaces.map(function(publicspace){

				// check if user is member of the space
				var member = false;
				if (
					typeof(cache.memberships[req.session.email]) !== "undefined"
					&& cache.memberships[req.session.email].includes(publicspace.shortId)
					)
					member = true;

				// gather all necessary space data
				return {
					shortId: publicspace.shortId,
					member: member,
					created: publicspace.created,
					updated: publicspace.updated,
					internal: publicspace.internal,
					title: publicspace.title,
					hits: publicspace.hits
				};

			});

			// return list
			res.json({ responseCode: 0, spaces: parsedSpaces });

		}

	});

});

// authenticate user link
app.get('/api/auth/clean', function(req, res){
	res.status(200).send();
	if (req.session.authMessageId) {
		webexteams.messages.remove(req.session.authMessageId)
		.then(function(){})
		.catch(function(err){});
	}
});

// endpoint to validate email is valid
app.get('/api/auth/:email', function(req, res){

	// get email from url
	var email = req.params.email;

	// check if domain is permitted
	if (!isDomainPermitted(email)) {
		log.info('email auth: domain not permitted: "'+email+'"');
		res.json({ responseCode: 11 });
		return;
	}

	// error if session doesn't have a temp password set
	if (!req.session.tempPwd) {
		log.error('email auth: no tempPwd set: "'+email+'"');
		res.status(401).send('Unauthorized');
		return;
	}

	// function to send validation message to user
	var sendValidation = function() {

		// save users email
		req.session.email = email;

		// send verification message to user in teams
		var markdown = "A request to verify your email was just made. [Click here if you did that]("+process.env.BASE_URL+"./auth/"+req.session.tempPwd+"). If you didn't, please ignore this message.";
		webexteams.messages.create({
			toPersonEmail: email,
			markdown: markdown
		})

		// teams api call worked
		.then(function(message) {

			// if there's an existing verificaiton message, remove it
			if (req.session.authMessageId) {
				webexteams.messages.remove(req.session.authMessageId)
				.then(function(){})
				.catch(function(err){});
			}

			// set new verificaiton message id
			req.session.authMessageId = message.id;

			// return success to web app
			res.json({ responseCode: 0 });

		})

		// failure from teams api
		.catch(function(err){
		
			// domain is dir sync'd and email is not teams enabled
			if (err.body.message == "Failed to find user with specified email address.")
				res.json({ responseCode: 12 });

			// unknown error
			else {
				handleErr(err);
				res.json({ responseCode: 11 });
			}

		});

	}

	// is it RFC compliant email?
	if (!validator.isEmail(email)) {

		// not valid email, error and return
		log.error('email auth: invalid email: "'+email+'"');
		res.json({ responseCode: 3 });
		return;

	}

	// send validation message
	else
		sendValidation();

});

// endpoint to validate email is valid
app.get('/api/email/:email', function(req, res){

	// get email from url
	var email = req.params.email;

	// check if domain is permitted
	if (!isDomainPermitted(email)) {
		log.info('email check: domain not permitted: "'+email+'"');
		res.json({ responseCode: 3 });
		return;
	}

	// is it RFC compliant email?
	if (!validator.isEmail(email)) {

		// not valid email, error and return
		log.error('email check: invalid email: "'+email+'"');
		res.json({ responseCode: 3 });
		return;

	}

	// everything looks ok
	res.json({ responseCode: 0 });

});

// endpoint to validate short id and get teams space details
app.get('/api/shortid/:shortId', function(req, res){

	// shortId from url
	var shortId = req.params.shortId;

	// search db for short if provided
	Publicspace.findOne({ 'shortId': shortId }, function (err, publicspace){

		// something failed
		if (err) {
			handleErr(err);
			res.json({ responseCode: 1 });

		// not a valid short id
		} else if (!publicspace) {
			handleErr(shortId, false, "", 'invalid shortId');
			res.json({ responseCode: 1 });

		// space is not active
		} else if (!publicspace.active) {
			handleErr(shortId, false, "", 'no longer active shortId');
			res.json({ responseCode: 2 });

		// things look good
		} else {

			// get space details
			webexteams.rooms.get(publicspace.spaceId)
			.then(function(space) {

				// found space
				res.json({ responseCode: 0, title: space.title, logoUrl: publicspace.logoUrl, description: publicspace.description });

			})
			.catch(function(err){

				// couldn't get space details
				handleErr(err);
				res.json({ responseCode: 11 });

			});

		}

	});

});

// endpoint to add email to a space
app.post('/api/shortid/:shortId', jsonParser, function(req, res){

	/*
	possible response codes
	0=added to space
	2=email is not teams enabled
	3=invlaid email
	4=invlaid session
	5=already in space
	6=failed to add to space
	7=general failure
	*/

	// short ID from url
	var shortId = req.params.shortId;

	// email from body
	var email = req.body.email;

	// check if domain is permitted
	if (!isDomainPermitted(email)) {
		log.info('add to space: domain not permitted: "'+email+'"');
		res.json({ responseCode: 3 });
		return;
	}

	// check for email
	if (!email) {
		log.error('add to space: missing email');
		res.json({ responseCode: 3 });
		return;
	}

	// valid email
	if (!validator.isEmail(email)) {
		log.error('add to space: invalid email: "'+email+'"');
		res.json({ responseCode: 3 });
		return;
	}

	// get db entry for shortid
	Publicspace.findOneAndUpdate({ 'shortId': shortId }, { $inc: { hits: 1 }, $set: { 'updated': new Date() } }, { new: true }, function (err, publicspace) {

		// failure to query db
		if (err) {
			handleErr(err);
			res.json({ responseCode: 4 });
			alertAdminSpace(req, 4, 'failed to call db; '+email+'; '+shortId, err);
		}

		// no valid space
		else if (!publicspace) {
			log.error('invalid shortId ', shortId);
			res.json({ responseCode: 4 });
			alertAdminSpace(req, 4, 'no entry in db; '+email+'; '+shortId, err);
		}

		// space is not active
		else if (!publicspace.active) {
			log.error('no longer active shortId ', shortId);
			res.json({ responseCode: 10 });
		}

		// space is internal and user is not in domain
		else if (
			publicspace.internal
			&& publicspace.internalDomains.indexOf(email.split('@')[1].toLowerCase()) === -1
			) {
			log.error(email+' not in internal space domains', publicspace.internalDomains);
			res.json({ responseCode: 13 });
		}

		// things look good
		else {

			// space ID that user is trying to join
			var spaceId = publicspace.spaceId;

			// check if email is in space 
			webexteams.memberships.list({
				roomId: spaceId,
				personEmail: email
			})
			.then(function(memberships) {

				// email is already in space
				if (memberships.items.length === 1)
					res.json({ responseCode: 5, spaceId: spaceId });

				// email is not in space
				else
					addUser(spaceId, email);

			})
			.catch(function(err){
				log.error("ERROR: Code=" + err.statusCode + "; Email=" + email + "; spaceId=" + spaceId);
				if (membershipsIgnoreStatusCode.indexOf(err.statusCode) > -1)
					addUser(spaceId, email);
				else {
					// check if its an existing teams user
					webexteams.people.list({
						email: email
					})
					.then(function(people){

						// new teams user
						if (people.items.length === 0)
							addUser(spaceId, email);

						// user exists
						else {
							res.json({ responseCode: 6 });
							alertAdminSpace(req, 6, 'person exists, but couldnt add to space. bot might not be in space anymore; '+email+'; '+spaceId);
						}

					})
					.catch(function(err){

						handleErr(err);
						res.json({ responseCode: 6 });
						alertAdminSpace(req, 6, 'couldnt get person details; '+email+'; '+spaceId, err);
				
					});
				}
			});

		}

	});

	// put email in a space or request membership
	function addUser(spaceId, email) {

		// try to add user to space even though it could fail to avoid excessive API calls
		webexteams.memberships.create({
			roomId: spaceId,
			personEmail: email
		})
		.then(function(membership) {

			// was able to add user
			log.info("added user to space", membership.id);
			res.json({ responseCode: 0, spaceId: spaceId });

		})
		.catch(function(err){

			// couldn't add user, but it might be ok. will check below
			handleErr(err);

			// domain is dir sync'd and email is not teams enabled
			if (err.body.message.indexOf("not found") > -1) {
				res.json({ responseCode: 12 });
				return;
			}

			// get space details to determine if its currently locked
			webexteams.rooms.get(spaceId)
			.then(function(space){

				// check to see if bot is a member of the space
				webexteams.memberships.list({
					roomId: spaceId,
					personId: botDetails.id
				})
				.then(function(memberships){

					// if the space is locked and the bot isn't a mod
					if (
						space.isLocked
						&& !memberships.items[0].isModerator
						) {

						// message the space that the user is requesting access
						webexteams.messages.create({
							roomId: spaceId,
							markdown: email+' would like to join this space'
						})
						.then(function(space) {

							// sent message to space
							res.json({ responseCode: 9 });

						})
						.catch(function(err){

							// failed to send message to space
							handleErr(err);
							res.json({ responseCode: 6 });
							alertAdminSpace(req, 6, 'couldnt send message to locked space to add user; '+email+'; '+spaceId, err);

						});

					}

					// space isn't locked or its locked and bot is mod
					// no good reason to not be able to add user
					else {
						res.json({ responseCode: 6 });
						alertAdminSpace(req, 6, 'couldnt add user to space; '+email+'; '+spaceId, err);
					}

				})
				.catch(function(err){

					// couldn't get membership for bot. likely API services failure
					handleErr(err);
					res.json({ responseCode: 6 });
					alertAdminSpace(req, 6, 'couldnt get bot membership details; '+email+'; '+spaceId, err);

				});

			})
			.catch(function(err){

				handleErr(err);

				// very likely the bot isn't in the space
				if (err.statusCode === 404) {
					log.info("bot not in space", err);
					alertAdminSpace(req, 6, 'bot not in space; '+email+'; '+spaceId, spaceId);
				}

				// couldn't get details on space. likely API service failure
				else
					alertAdminSpace(req, 6, 'couldnt get space details; '+email+'; '+spaceId, err);

				res.json({ responseCode: 6 });

			});

		});

	}

});

// validate webhook from teams cloud
app.post('/api/webhooks', textParser, function(req, res, next){

	// immediately return 200 so webhook isn't disabled
	res.status(200);
	res.send('ok');

	// make sure webhook isn't empty
	if (req.body == '') {
		log.error('invalid webhook: empty');
		return;
	}

	// validate webhook hasn't been modified or faked
	if (process.env.WEBEXTEAMS_WEBHOOK_SECRET) {
		var hash = crypto.createHmac('sha1', process.env.WEBEXTEAMS_WEBHOOK_SECRET).update(req.body).digest('hex');
		var teamsHash = req.get('X-Spark-Signature');
		if (hash !== teamsHash) { 
			log.error('invalid webhook: wrong hash');
			return;
		}
	}

	// create objext from body of webhook 
	req.body = JSON.parse(req.body);
	log.debug('webhook body: ', req.body);

	// if webhook has status of disabled, ignore it
	if (req.body.status == 'disabled') {
		log.error('invalid webhook: status is disabled');
		return;
	}

	// there was a change to membership to a space for a user other than the bot
	if (
		req.body.resource == 'memberships'
		&& req.body.data.personEmail.toLowerCase() != botDetails.emails[0].toLowerCase()
		) {

		// check if domain is permitted
		if (!isDomainPermitted(req.body.data.personEmail)) {
			log.info('invalid webhook: domain not permitted: "'+req.body.data.personEmail+'"');
			return;
		}

	}

	// if the event is a message to the bot and not created by the bot, get details
	else if (
		req.body.resource == 'messages'
		&& req.body.event == 'created'
		&& req.body.data.personEmail.toLowerCase() != botDetails.emails[0].toLowerCase()
		) {

		// check if domain is permitted
		if (!isDomainPermitted(req.body.data.personEmail)) {
			log.info('invalid webhook: domain not permitted: "'+req.body.data.personEmail+'"');
			return;
		}

		// get the details of the message
		webexteams.messages.get(req.body.data.id)
		.then(function(message){

			// save the message details
			req.body.message = message;

			// if 1-1 space, don't make the rest of the teams API calls
			if (req.body.data.roomType == 'direct') {
				next();
				return;
			}

			// get the details of the room
			webexteams.rooms.get(req.body.data.roomId)
			.then(function(room){

				// save the message details
				req.body.room = room;

				// get the membership details of the message
				webexteams.memberships.list({
					roomId: req.body.data.roomId,
					personId: req.body.data.personId
				})

				// successful call to memberships
				.then(function(memberships){

					// bot not a member
					if (memberships.items.length === 0)
						handleErr(memberships.items, false, {}, "messageCreateNotBot: bot not in space so can't send message");

					// bot is a member
					else {

						// save membership detail
						req.body.membership = memberships.items[0];

						// continue to next matching route
						next();

					}

				})

				// couldn't get membership details
				.catch(function(err){
					if (membershipsIgnoreStatusCode.indexOf(err.statusCode) > -1)
						handleErr(err+", status: "+err.statusCode, false, {}, "messageCreateNotBot: bot not in space so can't send message");
					else
						handleErr(err, true, "personId="+req.body.data.personId+" roomId="+req.body.data.roomId, "couldn't get membership details");
				});

			})

			// couldn't get room details
			.catch(function(err){
				handleErr(err, true, req.body.data.roomId, "couldn't get space details");
			});


		})

		// couldn't get message details
		.catch(function(err){
			handleErr(err, true, req.body.data.id, "couldn't get message details");
		});

	// not a message or a message created by the bot
	} else

		// proceed to next stage
		next();


});

// since webhook was validated, we can now process it
app.post('/api/webhooks', function(req, res){

/*
	// create objext from body of webhook 
	req.body = JSON.parse(req.body);
	log.debug('webhook body: ', req.body);
*/

	// if the event is a message to the bot and not created by the bot
	if (
		req.body.resource == 'messages'
		&& req.body.event == 'created'
		&& req.body.data.personEmail != botDetails.emails[0]
		) {

		// var to contain the response message
		var response;

		// get domain for message sender
		var personDomain = getEmailDomain(req.body.data.personEmail);

		/*
		// get the details of the message
		webexteams.messages.get(req.body.data.id)
		.then(function(message){
		*/

		var message = req.body.message;

			// doing search
			if (message.roomType == 'direct') {

				var sentHelp = false;

				if (message.text.match(/^\s*help\s*$/i)) {
					sendHelpDirect(message.roomId);
					sentHelp = true;
				}

				// get query text
				var query = message.text;

				// search db for query from active entries that are publicly listed or internal and in users domain
				Publicspace.find({
					"title": { "$regex": query, "$options": "i" },
					"active": true,
					"list": true,
					$or: [
						{ "internal": false },
						{
							$and: [
								{ "internal": true },
								{ "internalDomains": personDomain }
							]
						}
					],
				},
				function (err, publicspaces) {

					// couldn't get anything from db
					if (err)
						handleErr(err, true, message.roomId, "db err");

					// find worked
					else {
				
						// no spaces found and senthelp
						if (
							publicspaces.length === 0
							&& sentHelp
							)
							return;

						// no spaces found
						else if (publicspaces.length === 0)
							response = "I couldn't find any spaces for **"+query+"**";

						// 1 or more found spaces. build list
						else {

							// tell user what was found using what query
							response = "I found **"+publicspaces.length+"** spaces for **"+query+"**\n\n";

							// create arrays of what was found for spaces they're in and not in
							var toJoin = [];
							var joined = [];
							publicspaces.forEach(function(publicspace){
								if (
									cache.memberships[message.personEmail.toLowerCase()]
									&& cache.memberships[message.personEmail.toLowerCase()].includes(publicspace.shortId)
									)
									joined.push("> ["+publicspace.title+"]("+process.env.BASE_URL+'#'+publicspace.shortId+")<br>\n");
								else
									toJoin.push("> ["+publicspace.title+"]("+process.env.BASE_URL+'#'+publicspace.shortId+")<br>\n");
							});

							// create output based on what was found
							if (toJoin.length > 0)
								response += toJoin.join("");
							if (toJoin.length > 0 && joined.length > 0)
								response += "\n\n";
							if (joined.length > 0)
								response += "You're already a member of these spaces\n\n" + joined.join("");

						}

						// respond
						sendResponse(message.roomId, response);

					}

				});

			}

			// rest of checks are for group spaces

			// anyone can join space (default)
			else if (commandMatch('internal\\s+off', message.text)) {

				// check if permitted to issue this command
				if (
					req.body.room.isLocked
					&& !req.body.membership.isModerator
					) {

					// respond with error and stop processing this command
					sendPermissionDenied(req.body.room.id);
					return;

				}

				// get the space details from the db
				Publicspace.findOne({ 'spaceId': message.roomId }, function (err, publicspace) {

					// couldn't get anything from db
					if (err)
						handleErr(err, true, message.roomId, "db err");

					// not found in db
					else if (!publicspace) {

						// get space details
						webexteams.rooms.get(req.body.data.roomId)

						// found space
						.then(function(space) {

							// make it public
							createPublicSpace(req, space);

						})

						// failed to get space details
						.catch(function(err){
							handleErr(err, true, message.roomId, "failed to get space details");
						});

					}

					// found an entry in the db
					else if (publicspace) {

						// set it so open to people outside org
						publicspace.internal = false;
						publicspace.internalDomains = [];

						// update db
						updatePublicSpace(publicspace);

					}

				});

			}

			// don't show space externally
			else if (commandMatch('internal', message.text)) {

				var internalDomains = [
					personDomain
					];

				// check if permitted to issue this command
				if (
					req.body.room.isLocked
					&& !req.body.membership.isModerator
					) {

					// respond with error and stop processing this command
					sendPermissionDenied(req.body.room.id);
					return;

				}

				// get list of optional domains from command
				var domains = message.text.match(/internal\b\s*([^\s].*)$/i);
				if (
					domains !== null
					&& domains[1].trim() !== ""
					)
					var internalDomains = domains[1].replace(/(^\[|\]$)/g,'').trim().toLowerCase().split(/[,\s]+/);

				// get the space details from the db
				Publicspace.findOne({ 'spaceId': message.roomId}, function (err, publicspace) {

					// couldn't get anything from db
					if (err)
						handleErr(err, true, message.roomId, "db err");

					// not found in db
					else if (!publicspace) {

						// get space details
						webexteams.rooms.get(message.roomId)

						// found space
						.then(function(space) {

							// make it public
							createPublicSpace(req, space, { internal: true, internalDomains: internalDomains });

						})

						// failed to get space details
						.catch(function(err){
							handleErr(err, true, message.roomId, "failed to get space details");
						});

					}

					// found an entry in the db
					else if (publicspace) {

						// set it so its restricted to internal
						publicspace.internal = true;
						publicspace.internalDomains = internalDomains;

						// update db
						updatePublicSpace(publicspace);

					}

				});

			}

			// disable description for space
			else if (commandMatch('description\\s+off', message.text)) {

				// check if permitted to issue this command
				if (
					req.body.room.isLocked
					&& !req.body.membership.isModerator
					) {

					// respond with error and stop processing this command
					sendPermissionDenied(req.body.room.id);
					return;

				}

				// get the space details from the db
				Publicspace.findOne({ 'spaceId': message.roomId}, function (err, publicspace) {

					// couldn't get anything from db
					if (err)
						handleErr(err, true, message.roomId, "db err");

					// not found in db
					else if (!publicspace) {

						// get space details
						webexteams.rooms.get(message.roomId)

						// found space
						.then(function(space) {

							// make it public
							createPublicSpace(req, space);

						})

						// failed to get space details
						.catch(function(err){
							handleErr(err, true, message.roomId, "failed to get space details");
						});

					}

					// found an entry in the db
					else if (publicspace) {

						// set description to nothing
						publicspace.description = '';

						// update db
						updatePublicSpace(publicspace, function(){
							
							// let user know the description has been set to nothing
							response = "I won't use a description for this space";
							sendResponse(message.roomId, response);

						});

					}

				});

			}

			// set description for space
			else if (commandMatch('description', message.text)) {

				// check if permitted to issue this command
				if (
					req.body.room.isLocked
					&& !req.body.membership.isModerator
					) {

					// respond with error and stop processing this command
					sendPermissionDenied(req.body.room.id);
					return;

				}

				// parse the description command they sent
				var description = "";
				var descriptionCmd = message.html.match(/description\b\s*(.+)?$/i);
				if (
					message.text.match(/description\b\s*$/) === null
					&& descriptionCmd !== null
					&& descriptionCmd[1].trim() !== ""
					)
					description = descriptionCmd[1].replace(/(^\[|\]$)/g,'').trim();

				// get the space details from the db
				Publicspace.findOne({ 'spaceId': message.roomId}, function (err, publicspace) {

					// couldn't get anything from db
					if (err)
						handleErr(err, true, message.roomId, "db err");

					// not found in db
					else if (!publicspace) {

						// get space details
						webexteams.rooms.get(message.roomId)

						// found space
						.then(function(space) {

							// make it public
							createPublicSpace(req, space, { description: description });

						})

						// failed to get space details
						.catch(function(err){
							handleErr(err, true, message.roomId, "failed to get space details");
						});

					}

					// found an entry in the db
					else if (publicspace) {

						// update the description if provided
						if (description !== "") {

							// set description
							publicspace.description = description;

							// update db
							updatePublicSpace(publicspace, function(){
							
								// let user know the description has been set
								response = "I'll use that description for this space. Make sure it looks ok at ["+process.env.BASE_URL+"#"+publicspace.shortId+"]("+process.env.BASE_URL+"#"+publicspace.shortId+")";
								sendResponse(message.roomId, response);

							});

						}

						// checking description setting
						else {

							// let user know what the description is set to
							if (publicspace.description)
								response = "I'm using this description for this space: "+publicspace.description;
							else
								response = "I'm not using a description for this space";
							sendResponse(message.roomId, response);

						}

					}

				});

			}

			// revert to previous shortId for this space
			else if (commandMatch('url\\s+previous', message.text)) {

				// check if permitted to issue this command
				if (
					req.body.room.isLocked
					&& !req.body.membership.isModerator
					) {

					// respond with error and stop processing this command
					sendPermissionDenied(req.body.room.id);
					return;

				}

				// get the space details from the db
				Publicspace.findOne({ 'spaceId': message.roomId}, function (err, publicspace) {

					// couldn't get anything from db
					if (err)
						handleErr(err, true, message.roomId, "db err");

					// not found in db
					else if (!publicspace) {

						// get space details
						webexteams.rooms.get(message.roomId)

						// found space
						.then(function(space) {

							// make it public
							createPublicSpace(req, space);

						})

						// failed to get space details
						.catch(function(err){
							handleErr(err, true, message.roomId, "failed to get space details");
						});

					}

					// found an entry in the db
					else if (publicspace) {

						// save current url and revert to previous shortid
						var previousShortId = publicspace.shortId;
						publicspace.shortId = publicspace.previousShortId;
						publicspace.previousShortId = previousShortId;

						// update db
						updatePublicSpace(publicspace, function(){
							
							// share the new join details
							sendJoinDetails(publicspace);

						});

					}

				});

			}

			// regenerate a new shortid for this space
			else if (commandMatch('url\\s+new', message.text)) {

				// check if permitted to issue this command
				if (
					req.body.room.isLocked
					&& !req.body.membership.isModerator
					) {

					// respond with error and stop processing this command
					sendPermissionDenied(req.body.room.id);
					return;

				}

				// get the space details from the db
				Publicspace.findOne({ 'spaceId': message.roomId}, function (err, publicspace) {

					// couldn't get anything from db
					if (err)
						handleErr(err, true, message.roomId, "db err");

					// not found in db
					else if (!publicspace) {

						// get space details
						webexteams.rooms.get(message.roomId)

						// found space
						.then(function(space) {

							// make it public
							createPublicSpace(req, space);

						})

						// failed to get space details
						.catch(function(err){
							handleErr(err, true, message.roomId, "failed to get space details");
						});

					}

					// found an entry in the db
					else if (publicspace) {

						// save current shortId and set new shortid
						publicspace.previousShortId = publicspace.shortId;
						publicspace.shortId = ShortId.generate();

						// update db
						updatePublicSpace(publicspace, function(){
							
							// share the new join details
							sendJoinDetails(publicspace);

						});

					}

				});

			}

			// disable logo for space
			else if (commandMatch('logo\\s+off', message.text)) {

				// check if permitted to issue this command
				if (
					req.body.room.isLocked
					&& !req.body.membership.isModerator
					) {

					// respond with error and stop processing this command
					sendPermissionDenied(req.body.room.id);
					return;

				}

				// get the space details from the db
				Publicspace.findOne({ 'spaceId': message.roomId}, function (err, publicspace) {

					// couldn't get anything from db
					if (err)
						handleErr(err, true, message.roomId, "db err");

					// not found in db
					else if (!publicspace) {

						// get space details
						webexteams.rooms.get(message.roomId)

						// found space
						.then(function(space) {

							// make it public
							createPublicSpace(req, space);

						})

						// failed to get space details
						.catch(function(err){
							handleErr(err, true, message.roomId, "failed to get space details");
						});

					}

					// found an entry in the db
					else if (publicspace) {

						// set logo to nothing
						publicspace.logoUrl = '';

						// update db
						updatePublicSpace(publicspace, function(){
							
							// let user know the logo has been set to nothing
							response = "I'll use my avatar for this space";
							sendResponse(message.roomId, response);

						});

					}

				});

			}

			// set logo for space
			else if (commandMatch('logo', message.text)) {

				// check if permitted to issue this command
				if (
					req.body.room.isLocked
					&& !req.body.membership.isModerator
					) {

					// respond with error and stop processing this command
					sendPermissionDenied(req.body.room.id);
					return;

				}

				// parse the logo command they sent
				var logoUrl = "";
				var logoCmd = message.text.match(/logo\b\s*([^\b]+)?$/i);
				if (
					message.text.match(/logo\b\s*$/) === null
					&& logoCmd !== null
					&& logoCmd[1].trim() !== ""
					) {

					// they provided a url
					if (logoCmd[1].trim().match(/^http[s]?:\/\//i))
						logoUrl = logoCmd[1].replace(/(^\[|\]$)/g,'').trim();

					// tell the user they didn't give a url
					else {
						response = "You didn't provide a valid url";
						sendResponse(message.roomId, response);
						return;
					}

				}

				// get the space details from the db
				Publicspace.findOne({ 'spaceId': message.roomId}, function (err, publicspace) {

					// couldn't get anything from db
					if (err)
						handleErr(err, true, message.roomId, "db err");

					// not found in db
					else if (!publicspace) {

						// get space details
						webexteams.rooms.get(message.roomId)

						// found space
						.then(function(space) {

							// make it public
							createPublicSpace(req, space, { logoUrl: logoUrl });

						})

						// failed to get space details
						.catch(function(err){
							handleErr(err, true, message.roomId, "failed to get space details");
						});

					}

					// found an entry in the db
					else if (publicspace) {

						// update the logo if a url was provided
						if (logoUrl !== "") {

							// set logo
							publicspace.logoUrl = logoUrl;

							// update db
							updatePublicSpace(publicspace, function(){
							
								// let user know the logo has been set
								response = "I'll use that logo for this space. Make sure it looks ok at ["+process.env.BASE_URL+"#"+publicspace.shortId+"]("+process.env.BASE_URL+"#"+publicspace.shortId+")";
								sendResponse(message.roomId, response);

							});

						}

						// checking logo setting
						else {

							// let user know what the logo is set to
							if (publicspace.logoUrl)
								response = "I'm using this logo for this space: "+publicspace.logoUrl;
							else
								response = "I'm using my avatar as the logo for this space";
							sendResponse(message.roomId, response);

						}

					}

				});

			}

			// don't show space publicly
			else if (commandMatch('list\\s+off', message.text)) {

				// check if permitted to issue this command
				if (
					req.body.room.isLocked
					&& !req.body.membership.isModerator
					) {

					// respond with error and stop processing this command
					sendPermissionDenied(req.body.room.id);
					return;

				}

				// get the space details from the db
				Publicspace.findOne({ 'spaceId': message.roomId }, function (err, publicspace) {

					// couldn't get anything from db
					if (err)
						handleErr(err, true, message.roomId, "db err");

					// not found in db
					else if (!publicspace) {

						// get space details
						webexteams.rooms.get(req.body.data.roomId)

						// found space
						.then(function(space) {

							// create space so not listed
							createPublicSpace(req, space, {}, function(publicspace){

								// send join link
								sendJoinDetails(publicspace);

								// let user know the space is not listed
								response = "I've made sure this space isn't listed at ["+process.env.BASE_URL+"]("+process.env.BASE_URL+")";
								sendResponse(space.id, response);

							});

						})

						// failed to get space details
						.catch(function(err){
							handleErr(err, true, message.roomId, "failed to get space details");
						});

					}

					// found the space in the db
					else if (publicspace) {

						// delist space 
						publicspace.list = false;

						// update db
						updatePublicSpace(publicspace, function(){

							// let user know the space is not public
							response = "I've made sure this space isn't listed at ["+process.env.BASE_URL+"]("+process.env.BASE_URL+")";
							sendResponse(message.roomId, response);

						});

					}

				});

			}

			// show space publicly
			else if (commandMatch('list', message.text)) {

				// check if permitted to issue this command
				if (
					req.body.room.isLocked
					&& !req.body.membership.isModerator
					) {

					// respond with error and stop processing this command
					sendPermissionDenied(req.body.room.id);
					return;

				}

				// get the space details from the db
				Publicspace.findOne({ 'spaceId': message.roomId }, function (err, publicspace) {

					// couldn't get anything from db
					if (err)
						handleErr(err, true, message.roomId, "db err");

					// not found in db
					else if (!publicspace) {

						// get space details
						webexteams.rooms.get(req.body.data.roomId)

						// found space
						.then(function(space) {

							// make it public
							createPublicSpace(req, space, { list: true }, function(publicspace){

								// send join link
								sendJoinDetails(publicspace);

								// let user know the space is now public
								response = "I've listed this space for all to see at ["+process.env.BASE_URL+"]("+process.env.BASE_URL+")";
								sendResponse(space.id, response);

							});

						})

						// failed to get space details
						.catch(function(err){
							handleErr(err, true, message.roomId, "failed to get space details");
						});

					}

					// found the space in the db
					else if (publicspace) {

						// make space public
						publicspace.list = true;

						// update db
						updatePublicSpace(publicspace);/*, function(){

							// let user know the space is now public
							response = "I've listed this space for all to see at ["+process.env.BASE_URL+"]("+process.env.BASE_URL+")";
							sendResponse(message.roomId, response);

						});*/

					}

				});

			}

			// add the user to the support space for this bot if support space id provided
			else if (
						process.env.WEBEXTEAMS_SUPPORT_SPACE_ID
						&& commandMatch('support', message.text)
						) {

				// add person to support space
				webexteams.memberships.create({
					personId: message.personId,
					roomId: process.env.WEBEXTEAMS_SUPPORT_SPACE_ID
				})

				// teams api call worked
				.then(function(membership) {

					sendResponse(message.roomId, "<@personId:"+message.personId+"> I've added you to the support space");

				})

				// failed to call teams api
				.catch(function(err){

					if (err.name === "Conflict")
						sendResponse(message.roomId, "<@personId:"+message.personId+"> You're already in the support space");
					else {
						sendResponse(message.roomId, "<@personId:"+message.personId+"> I wasn't able to add you to the support space");
						handleErr(err, false, '', "Couldn't add "+message.personEmail+" to the support space "+process.env.WEBEXTEAMS_SUPPORT_SPACE_ID);
					}

				});

			}

			// send source link
			else if (commandMatch('source', message.text)) {
				sendResponse(message.roomId, "You can find the source code for me at " + sourceUrl);
			}

			// send qr code to space
			else if (commandMatch('qr', message.text)) {

				// get space from db
				Publicspace.findOne({ 'spaceId': message.roomId }, function (err, publicspace) {

					// find from db failed
					if (err)
						handleErr(err, true, message.roomId, "db err");
					
					// not found in db
					else if (!publicspace) {

						// get space details
						webexteams.rooms.get(req.body.data.roomId)

						// found space
						.then(function(space) {

							// make it public and send qr code to join
							createPublicSpace(req, space, {}, function(publicspace){
								sendJoinDetails(publicspace, { qr: true });
							});

						})

						// failed to get space details
						.catch(function(err){
							handleErr(err, true, message.roomId, "failed to get space details");
						});

					}

					// public space already exists in db. send qr code to join
					else
						sendJoinDetails(publicspace, { qr: true });

				});
	
			}

			// get url to join space
			else if (commandMatch('url', message.text)) {

				// get space from db
				Publicspace.findOne({ 'spaceId': message.roomId }, function (err, publicspace) {

					// find from db failed
					if (err)
						handleErr(err, true, message.roomId, "db err");
					
					// not found in db
					else if (!publicspace) {

						// get space details
						webexteams.rooms.get(req.body.data.roomId)

						// found space
						.then(function(space) {

							// make it public
							createPublicSpace(req, space);

						})

						// failed to get space details
						.catch(function(err){
							handleErr(err, true, message.roomId, "failed to get space details");
						});

					}

					// public space already exists in db. send join details
					else
						sendJoinDetails(publicspace);

				});
	
			}

			// sent help command or didn't recognize the message content/command. send help
			else { 

				// get space from db
				Publicspace.findOne({ 'spaceId': message.roomId }, function (err, publicspace) {

					// find from db failed
					if (err)
						handleErr(err, true, message.roomId, "db err");
					
					// not found in db
					else if (!publicspace) {

						// get space details
						webexteams.rooms.get(req.body.data.roomId)

						// found space
						.then(function(space) {

							// make it public and send help details
							createPublicSpace(req, space, {}, function(){
								sendJoinDetails(publicspace);
								sendHelpGroup(publicspace);
							});

						})

						// failed to get space details
						.catch(function(err){
							handleErr(err, true, message.roomId, "failed to get space details");
						});

					}

					// public space already exists in db. send help
					else
						sendHelpGroup(publicspace);

				});

			}

		/*
		})

		// couldn't get message details
		.catch(function(err){
			handleErr(err, true, message.roomId, "couldn't get message details");
		});
		*/

	}

	// there was a change to the space that a bot is in
	else if (
		req.body.resource == 'rooms'
		&& req.body.event == 'updated'
		) {

		// get details for space
		webexteams.rooms.get(req.body.data.id)

		// got space details
		.then(function(space) {

			// get space from db
			Publicspace.findOne({ 'spaceId': space.id}, function (err, publicspace) {

				// db error
				if (err) 
					handleErr(err, true, space.id, "db failure");

				// space exists in db and something has changed
				else if (
					publicspace.isLocked !== space.isLocked
					|| publicspace.title !== space.title
					) {

					// set title in db
					publicspace.title = space.title;

					// space locked status hasn't changed so be silent in update as title doesn't matter
					if (publicspace.isLocked === space.isLocked)
						updatePublicSpace(publicspace, function(){
							// do nothing
						});

					// locked status changed so need to update space with join details
					else {
						publicspace.isLocked = space.isLocked;
						updatePublicSpace(publicspace);
					}

				}

			});

		})

		// failed to get space details
		.catch(function(err){
			handleErr(err);
		});

	}

	// there was a change to membership to a space for a user other than the bot
	else if (
		req.body.resource == 'memberships'
		&& req.body.data.personEmail.toLowerCase() != botDetails.emails[0].toLowerCase()
		) {

		// holds email in lowercase and spaceId
		var email = req.body.data.personEmail.toLowerCase();
		var spaceId = req.body.data.roomId;

		// get space from db
		Publicspace.findOne({ 'spaceId': spaceId }, function (err, publicspace) {

			// db error
			if (err) 
				handleErr(err, false, '', "db failure");

			// db call was successful
			else {

				// if membership was created or updated make sure to add to cache
				if (
					req.body.event == 'created'
					|| req.body.event == 'updated'
					) {

					// space exists in db
					if (publicspace)

						// add to membership cache
						addCache(cache.memberships, email, publicspace.shortId);

				}

				// remove from cache if membership was deleted
				else if (req.body.event == 'deleted') {

					// space doesn't exist in db. create one
					if (publicspace)
						removeCache(cache.memberships, email, publicspace.shortId);

				}

				log.debug(cache.memberships[email]);
				log.info("updated cache for "+email);

			}

		});

	}

	// there was a change to the bots membership to a space
	else if (
		req.body.resource == 'memberships'
		&& req.body.data.personEmail.toLowerCase() == botDetails.emails[0].toLowerCase()
		&& (
			req.body.event == 'created'
			|| req.body.event == 'updated'
			|| req.body.event == 'deleted'
			)
		) {

		// find space in db
		Publicspace.findOne({ 'spaceId': req.body.data.roomId }, function (err, publicspace) {

			// db failure
			if (err)
				handleErr(err, false, "", "db failure");

			// didn't find space in db
			else if (!publicspace) {

				// new or modified membership
				if (
					req.body.event == 'created'
					) {

					// get space details
					webexteams.rooms.get(req.body.data.roomId)

					// found space
					.then(function(space) {

						// if membership is for a group space
						if (space.type == 'group') {

							// make it public
							createPublicSpace(req, space); 

							// add to one job to membership cache
							addJob(jobs.cache.memberships, {
								spaceId: space.id,
								type: "space"
							});
							
						}

					})

					// failed to get space details
					.catch(function(err){
						handleErr(err, false, "", "failed to get space details");
					});

				}

			}

			// found space in db
			else {

				// bot was removed from a space
				if (req.body.event == 'deleted') {

					// disable but don't remove it from db in case bot is added back so shortid doesn't change
					publicspace.active = false;
					publicspace.updated = new Date();

					// save to db
					publicspace.save(function (err, data) {

						// failed to save
						if (err) 
							handleErr(err, false, "", "db failure");

						// updated db
						else {
							log.info('Saved : ', data );

							// remove space from memberships cache
							Object.keys(cache.memberships).forEach(function(email){
								removeCache(cache.memberships, email, publicspace.spaceId);
							});

						}

					});

				}

				// bot membership was modified
				else if (req.body.event == 'updated') {

					// space is not enabled so activate it
					if (!publicspace.active) {
						publicspace.active = true;
						updatePublicSpace(publicspace);

						// add to one job to membership cache
						addJob(jobs.cache.memberships, {
							spaceId: publicspace.spaceId,
							type: "space"
						});

					}

					// space is enabled, so send join link
					else
						sendJoinDetails(publicspace);

				}

				// bot membership was added
				else if (req.body.event == 'created') {

					// space is not enabled so activate it
					if (!publicspace.active) {
						publicspace.active = true;
						updatePublicSpace(publicspace);

						// add to one job to membership cache
						addJob(jobs.cache.memberships, {
							spaceId: publicspace.spaceId,
							type: "space"
						});

					}

				}

			}

		});

	}

});

// global function to check if email domain is permitted
function isDomainPermitted(email = "") {

	// no permitted domains set
	if (!permitDomains.length)
		return true;

	// permitted domains are set. default to not permitted
	var permitted = false;

	// domain is in permitted domains
	if (permitDomains.indexOf(getEmailDomain(email)) !== -1)
		permitted = true;

	return permitted;

}

// global function to get email domain
function getEmailDomain(email = "") {
	return email.trim().split("@")[1].toLowerCase();
}

// global function to handle err
function handleErr(err, respond = false, spaceId = "", mesg = "") {

	// log err
	log.error(mesg, err.toString());

	// send message to end user
	if (
		respond
		&& spaceId != ""
		) {
		var response = "I'm not feeling quite right. I can't help now. Sorry";
		sendResponse(spaceId, response);
	}

}

// global function to send message to teams admin space
function alertAdminSpace(req, code, message, err = null) {

	// if admin space not defined in env var return
	if (!process.env.WEBEXTEAMS_ADMIN_SPACE_ID)
		return;

	// if err is defined, get it into a string
	if (err != '') err = '<br><br>'+JSON.stringify(err);

	// get request headers
	var headers = req.headers;
	if (headers.cookie)
		headers.cookie = headers.cookie.replace(RegExp('\('+cookieSidName+'=\)[^;]+'), '$1%REDACTED>');
	headers = '<br><br>'+JSON.stringify(headers);

	// send message to space
	webexteams.messages.create({
		roomId: process.env.WEBEXTEAMS_ADMIN_SPACE_ID,
		markdown: code+': '+message+err+headers
	})
	.then(function(space) {

		// message sent

	})
	.catch(function(err){

		// failed to send message
		handleErr(err);

	});

}

// global function to notify user they don't have permission to send a command
function sendPermissionDenied(spaceId) {
	var markdown = "Only a moderator can send that command in a moderated space";
	sendResponse(spaceId, markdown);
}

// global function to send direct help
function sendHelpDirect(spaceId) {
	var markdown = "I'll use messages you send in this space to search for public and internal spaces you can join. Add me to a group space so I can help people join there";
	sendResponse(spaceId, markdown);
}

// global function to send help
function sendHelpGroup(publicspace) {
	var supportMarkdown = '', internalMarkdown = '', descriptionMarkdown = '', urlPreviousMarkdown = '';
	if (process.env.WEBEXTEAMS_SUPPORT_SPACE_ID)
		supportMarkdown = "**`support`** - Join the support space for this bot<br>\n";
	if (!process.env.PERMIT_DOMAINS)
		internalMarkdown = "**`internal [opt. list of domains]`** - Only users from specific domains can join this space<br>\n" + "**`internal off`** - Anyone can join this space<br>\n";
	if (process.env.DESCRIPTION)
		descriptionMarkdown = description + "\n\n";
	if (publicspace.shortId != publicspace.previousShortId)
		urlPreviousMarkdown = "**`url previous`** - Revert to the previous url to join this space<br>\n";
	var markdown = 
		descriptionMarkdown+
		"@mention me with one of the following commands<br>\n\n"+
		"**`url`** - Get details on how someone can join this space<br>\n"+
		"**`qr`** - Get QR code to join this space<br>\n"+
		"**`list`** - Anyone can see this space listed at "+process.env.BASE_URL+"<br>\n"+
		"**`list off`** - Remove this space from public listing at "+process.env.BASE_URL+"<br>\n"+
		internalMarkdown+
		"**`logo [opt. url]`** - See or set custom logo (transparent png, 50px width recommended) <br>\n"+
		"**`logo off`** - Remove custom logo<br>\n"+
		"**`description [opt. text or markdown]`** - See or set description<br>\n"+
		"**`description off`** - Remove description<br>\n"+
		"**`url new`** - Create a new url to join this space<br>\n"+
		urlPreviousMarkdown+
		"**`source`** - Get the link to the source code for this bot<br>\n"+
		supportMarkdown+
		"**`help`** - List commands<br>\n"+
		"\nYou can message me directly to search public and internal spaces.<br>\n\n";
	sendResponse(publicspace.spaceId, markdown);
}

// global function to send response message to space
function sendResponse(spaceId, markdown, files = []) {

	// set options
	var options = {
		roomId: spaceId,
		markdown: markdown,
		};
	if (files.length > 0)
		options.files = files;

	// send message
	webexteams.messages.create(options)
	.then(function(message) {

		// message sent

	})
	.catch(function(err){

		// failed to send message
		handleErr(err);

	});

}

// global function to post message about joining space
function sendJoinDetails(publicspace, options = {}) {

	// check for bot membership in space
	webexteams.memberships.list({
		roomId: publicspace.spaceId,
		personId: botDetails.id
	})

	// found bot membership
	.then(function(memberships) {

		// bot not a member
		if (memberships.items.length === 0)
			handleErr(memberships.items, false, {}, "sendJoinDetails: bot not in space so can't send message");

		// bot is a member
		else {

			var who = "Anyone";
			var listed = "";
			var files = [];

			if (publicspace.internal)
				who = "Only users in the domain(s) **"+publicspace.internalDomains.join(", ")+"**";

			if (publicspace.list)
				listed = " or by finding it listed at "+process.env.BASE_URL;

			// space is locked and bot isn't a mod
			if (
				publicspace.isLocked
				&& !memberships.items[0].isModerator
				)
				response = who+" can **request** to join this space using ["+process.env.BASE_URL+"#"+publicspace.shortId+"]("+process.env.BASE_URL+"#"+publicspace.shortId+")"+listed+". Make me a moderator if you want me to add them for you.";

			// space is unlocked or locked and bot is mod
			else
				response = who+" can join this space using ["+process.env.BASE_URL+"#"+publicspace.shortId+"]("+process.env.BASE_URL+"#"+publicspace.shortId+")"+listed;

			// add qr if requested
			if (
				typeof(options.qr) !== "undefined"
				&& options.qr
				) {
				files = [ process.env.BASE_URL.replace(/\/$/, '')+qrPath+publicspace.shortId ];
			}

			// send details in teams
			sendResponse(publicspace.spaceId, response, files);

		}

	})

	// failed to get membership
	.catch(function(err){
		if (membershipsIgnoreStatusCode.indexOf(err.statusCode) > -1)
			handleErr(err+", status: "+err.statusCode, false, {}, "sendJoinDetails: bot not in space so can't send message");
		else
			handleErr(err+", status: "+err.statusCode);
	});

}

// global function to update public space in db
function updatePublicSpace(publicspace, success = undefined) {

	// set updated to now
	publicspace.updated = new Date();

	// save to db
	publicspace.save(function (err, data) {

		// db failure
		if (err)
			handleErr(err, false, '', "failed to update db");

		// saved to db
		else {

			log.info("saved ", publicspace);

			// success callback if defined
			if (typeof(success) === "function")
				success();

			// default send join details
			else
				sendJoinDetails(publicspace);

		}

	});

}

// global function to create new public space
function createPublicSpace(req, space, optionsOverride, success = undefined) {

	// get domain name to restrict initial space
	webexteams.people.list({
		id: req.body.actorId
	})
	.then(function(person){

		// get domain for user
		var personDomain = getEmailDomain(person.items[0].emails[0]);

		// get new shortid
		var shortId = ShortId.generate();

		// set default options
		var defaultOptions = {
			spaceId: space.id,
			isLocked: space.isLocked,
			title: space.title,
			shortId: shortId,
			previousShortId: shortId,
			active: true,
			list: false,
			internal: true,
			internalDomains: [ personDomain ],
			hits: 0,
			created: new Date(),
			updated: new Date()
			};

		// override default options
		var options = Object.assign({}, defaultOptions, optionsOverride);

		// create new public space object
		var publicspace = new Publicspace(options);

		// create entry in db
		publicspace.save(function (err, data) {

			// failed to create db entry
			if (err) 
				handleErr(err, true, space.id, "failed to create db entry");

			// created new space entry
			else {

				log.info("saved ", publicspace);

				// success callback if defined
				if (typeof(success) === "function")
					success(options);

				// default send join details
				else {
					sendJoinDetails(options);
					sendHelpGroup(options);
				}


			}

		});

	})
	.catch(function(err){
		handleErr(err, true, space.id, "failed to get webhook actor details");
	});

}

// remove entry from cache
function removeCache(cache, key, value = null) {

	// if key doesn't exist return
	if (!cache[key])
		return;

	// if no value, remove key
	if (value === null) {
		delete cache[key];
		return;
	}

	// index of the value in the cache
	var index = cache[key].indexOf(value);

	// if its in there, remove it
	if (index > -1)
		cache[key].splice(index, 1);

}

// add an entry to the cache 
function addCache(cache, key, value) {

	// if a key isn't in the cache, add them
	if (!cache[key])
		cache[key] = [ value ];

	// if the value isn't already in the cache, add it
	else if (!cache[key].includes(value))
		cache[key].push(value);

}

// process memberships cache job
function membershipsCacheJob(job) {

	// hold promise for job
	var promise;

	// initial call to get members from spcae
	if (job.type === "space")
		promise = webexteams.memberships.list({roomId: job.spaceId});

	// a job to handle paging of results from first call to memeberships
	else if (job.type === "next")
		promise = job.data.next();

	// promise for call to teams api
	promise

	// call to teams api was successful
	.then(function(memberships){

		// iteraite through the memberships and add to cache
		memberships.items.forEach(function(membership){

			// check if email domain is permitted before adding to cache
			if (
				membership.personEmail
				&& isDomainPermitted(membership.personEmail)
				)
				addCache(cache.memberships, membership.personEmail.toLowerCase(), job.shortId);

		});

		// there are more memberships to get for this space, so add a new job to the queue
		if (memberships.hasNext()) {
			addJob(jobs.cache.memberships, {
            spaceId: job.spaceId,
            shortId: job.shortId,
            type: "next",
            data: memberships
         });
		}

		// done with job
		completeJob(jobs.cache.memberships, job);

	})

	// call to teams api failed
	.catch(function(err){

		// hit rate-limiting
		if (err.statusCode === 429) {

			log.warn('hit rate-limit while building memberships cache', err.headers["retry-after"]);

			// get retry-after header so no new jobs are processed until we've waited
			jobs.cache.memberships.wait = (new Date()).getTime() + (parseInt(err.headers["retry-after"])*1000) + 2000;

			// add job back into queue. need to start over for this space
			addJob(jobs.cache.memberships, {
            spaceId: job.spaceId,
            shortId: job.shortId,
            type: "space"
         });

		}

		// error that we won't try to recover from
		else
			log.error('teams api error while doing memberships cache job', err);

		// job is considered complete 
		completeJob(jobs.cache.memberships, job);

	});

}

// handle completion of creating membership cache
function membershipsCacheComplete() {
	log.info("memberships cache complete");
}

// process membership cache jobs
function processJobs(jobs) {

	var done = false;

	// start interval for processing jobs
	var interval = setInterval(function(){

		// all current jobs complete
		if (jobs.remaining === 0) {

			// if current processing is done, call complete callback
			if (!done) {
				done = true;
				jobs.complete();
			}

			return;

		}

		// there are jobs so not done
		done = false;

		// need to wait pefore processing more jobs
		if ((new Date()).getTime() <= jobs.wait)
			return;

		// there is a job to process
		if (jobs.queue.length > 0)
			jobs.process(jobs.queue.splice(0, 1)[0]);

	}, (1000 / messagesPerSecond));

}

// global for cache
var cache = {
	memberships: {}
}

// global for jobs
var jobs = {
	cache: {
		memberships: {
			remaining: 0,
			queue: [],
			wait: 0,
			process: membershipsCacheJob,
			complete: membershipsCacheComplete
		}
	}
}

// done with a job
function completeJob(jobs, job) {

	// reduce remaining job count
	jobs.remaining--;

}

// add job into queue
function addJob(jobs, job) {

	// get number of membership cache jobs
	jobs.remaining++;

	// add job to queue
	jobs.queue.push(job);

}

// check if command was sent
var commandMatch = function(commandRegExp, messageText) {
	var botCommandRegExp = new RegExp('('+botDetails.displayName+'|'+botDetails.displayName.split(' ')[0]+'|\\b)'+commandRegExp+'\\b', 'i');
	if (messageText.match(botCommandRegExp))
		return true;
	else
		return false;
}

// initialize
var botDetails = {};
var init = function() {

	// search db for all spaces
	Publicspace.find({ 'active': true }, function (err, publicspaces){

		// something failed
		if (err) {
			handleErr(err);

		// no spaces that have been enabled for listing
		} else if (!publicspaces) {
			handleErr("No spaces in db");

		// things look good
		} else {

			// add membership cache jobs to queue
			publicspaces.forEach(function(publicspace){
				addJob(jobs.cache.memberships, {
					spaceId: publicspace.spaceId,
					shortId: publicspace.shortId,
					type: "space"
				});
			});

			// start to process membership cache jobs
			processJobs(jobs.cache.memberships);

		}

	});

	// get bot details
	getBotDetails();

	// check every hour to see if bot details have changed
	setInterval(function(){
		getBotDetails();
	}, 1000 * 60 * 60);

}

// global function to get bot details from teams
var getBotDetails = function() {

	// options for api call
	var options = { 
		hostname: 'api.ciscospark.com',
		path: '/v1/people/me',
		method: 'GET',
		headers: {
			'Authorization': 'Bearer '+process.env.CISCOSPARK_ACCESS_TOKEN
		}
	};

	// make api call
	var req = https.request(options, function(res) {

		// get data chunks and make results string
		var results = '';
		res.on('data', function (chunk) {
			results = results + chunk;
		}); 

		// when all chunks have been read
		res.on('end', function () {

			// get bot details into object
			newBotDetails = JSON.parse(results);

			// if there's been a change save the new details
			if (JSON.stringify(botDetails) !== JSON.stringify(newBotDetails)) {
				botDetails = newBotDetails;
				log.info("Bot details updated: ", botDetails);
			}

		}); 

	});

	// if there's an error with api call
	req.on('error', function(e) {
		log.error("Couldn't get details for bot from Teams");
	});

	// end the request
	req.end();

}

// start express
var server = app.listen(app.get('port'), function(){
	log.info('Server listening on port '+server.address().port);
	init();
});
