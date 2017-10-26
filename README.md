# Public Spaces for Cisco Spark

Installation
------------

``` bash
$ git clone https://github.com/birdietiger/publicspaces-ciscospark.git
$ npm install
```

After it's installed you need to configure it.

Configruation
------------

Soem environment variable must be set for this to work. You can create a .env file or set environment variables based on the details below.

If using a .env file, it must be in the same directory as index.js.

```
#Specify the port for epxress to listen on [optional; default = 3000]
#PORT=3000

#Specify the port for admin apis to listen on [optional]
#ADMIN_PORT=3001

#If a reverse web proxy is in front of express set to "true" [optional; default = false]
#REVERSE_PROXY=true

#This is the URL that users will visit to join spaces [required]
BASE_URL=https://<hostname>/<path>

#The Mongo DB URI to use to store data on public spaces and sessions [required]
MONGO_URI=mongodb://localhost/publicspaces-ciscospark

#The access token for the Cisco Spark bot [required]
CISCOSPARK_ACCESS_TOKEN=

#The Cisco Spark Space ID (roomId) that will have errors posted [optional]
#CISCOSPARK_SUPPORT_SPACE_ID=

#Cisco Spark Webhook secret to verify authenticity of data [optional]
#CISCOSPARK_WEBHOOK_SECRET=

#Messages to send to Cisco Spark to avoid hit ratelimiting [optional; default = 6]
#Note: Currently only used during startup to build membership cache
#CISCOSPARK_MESSAGES_PER_SECOND=6

#Allows users of website to request support via email [optional]
#SUPPORT_EMAIL=

#Where to store logs in machine-readable format [optional]
#LOG_FILE=

#Where to store http access logs in machine-readable format [optional]
#ACCESS_LOG_FILE=

#Set log level [optional; default = info]
#"error", "warn", "info", "verbose", "debug", or "silly"
#LOG_LEVEL=debug
```

Cisco Spark Webhooks
------------

For the bot to receive all notifications from Cisco Spark, you must manually create a [webhook](https://developer.ciscospark.com/webhooks-explained.html). 

It's probably easiest to use the Cisco Spark developer [API docs](https://developer.ciscospark.com/endpoint-webhooks-post.html).

Webhooks are expected at `https://<hostname>/<path>/api/webhooks`.

Cisco Spark Webhooks require https, so take a look at the Reverse Web Proxy section.

Reverse Web Proxy
------------

It's expected that you'll front end this app with a reverse web proxy as the app doesn't natively support https. Cisco Spark Webhooks require https, so that endpoint will have to have a proxy. While you could just put a proxy in front of the webhook endpoint, its recommend that all endpoints are served over https.
