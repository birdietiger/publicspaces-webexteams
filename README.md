# publicspaces-ciscospark

Cisco Spark webhooks are expected at /api/webhooks.

Create a .env file along side index.js. Here's the template

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

#Set log level [optional; default = info]
#"error", "warn", "info", "verbose", "debug", or "silly"
#LOG_LEVEL=debug
```
