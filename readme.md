# Performance Testing with K6

## 1. Export Postman collection, environment and global files
Ensure the Postman collection, environment variables and global variables JSON files are exported to the same folder as this `README.md`.

## 2. Add real token to copy of Postman environment
**TODO: Review if these steps can / should be run in a container**
 - First install the required npm development dependencies locally.
```
npm install
```

- Now execute the `create-postman-environment-with-token.js` script passing the filename for the Postman collection, the resource URI variable key and optionally the globals file path.
For help on the options supported, run the script with `--help`.

**Providing Postman collection file and resource URI**
```
node .\create-postman-environment-with-token.js PerformancePD.postman_environment.json --resource-uri-variable-key AdjResourceUri
```
**Providing all supported options**
```
node .\create-postman-environment-with-token.js PerformancePD.postman_environment.json --resource-uri-variable-key AdjResourceUri --globals workspace.postman_globals.json
```

This will generate the file `environment-with-token.json` in the `scripts/generated/` folder.  
This file **MUST NOT** be committed to git as it contains a token. The folder `scripts/generated/` has been excluded in `.gitignore`.

## 3. Generate a K6 script from the new Postman collection
```
npx @apideck/postman-to-k6 adjudication_api.postman_collection.json -o ./scripts/generated/adjudication-api-k6-script.js --environment ./scripts/generated/environment-with-token.json --globals ./workspace.postman_globals.json --skip-pre 
```

This will generate the file `adjudication-api-k6-script.js` in the `scripts/generated` folder.  
This file **MUST NOT** be committed to git as it contains a token. The folder `scripts/generated/` has been excluded in `.gitignore`.

Later, when the K6 container is run, the `scripts` folder is mounted so the K6 scripts must be output to this folder.


## 4. Start Grafana and InfluxDB container instances
Grafana provides a graphing dashboard and InfluxDB is a high-speed read and write database ideal for real-time analytics. 

 - Start instances of both containers in detached mode
```
docker-compose up --detach influxdb grafana
```

**Create a Grafana dashboard**
 - Navigate to [http://localhost:3000](http://localhost:3000) to access the Grafana homepage
 - Click the "Plus" icon on the left navigation and click the "Import" option
 - Paste the JSON from the file `grafana_dashboard.json` or select the file for upload and click the "Load" button
 - Enter a name for the dashboard and for the "K6" field / InfluxDB data source, select the "K6" entry in the dropdown
 - Click the "Import" button to create the dashboard

## 5. Run the K6 script
Run K6 from the container and execute the K6 script in the mounted `scripts` folder.

**Single run**
```
docker-compose run k6 run /scripts/generated/adjudication-api-k6-script.js
```

**Run with 10 virtual users for 5 minutes**
```
docker-compose run k6 run --vus 10 --duration 5m /scripts/generated/adjudication-api-k6-script.js
```

**Run with a pre-configured config files**
```
docker-compose run k6 run --config /scripts/k6-config/1-request-every-second-for-10-mins.json /scripts/generated/adjudication-api-k6-script.js
```
```
docker-compose run k6 run --config /scripts/k6-config/50-users-for-10-minutes.json /scripts/generated/adjudication-api-k6-script.js
```
```
docker-compose run k6 run --config /scripts/k6-config/1-request-every-10-seconds-for-1-hour.json /scripts/generated/adjudication-api-k6-script.js
```

## 6. Stop Grafana and InfluxDB container instances
```
docker-compose down
```
