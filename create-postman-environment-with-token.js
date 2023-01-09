// ----------------------------------------------------------------------------------------------------
// This script takes a Postman environment JSON file and generates a copy but with a valid Azure
// client credentials token.
// ----------------------------------------------------------------------------------------------------

const axios = require('axios');
const chalk = require('chalk');
const fs = require('fs/promises');
const qs = require('qs');
const { Command } = require('commander');

const program = new Command();

/**
 * The output location for the environment file with the real token variable.
 * This file must be generated in the "scripts\generated" folder so the file is available to K6 running
 * in a container. Also, this file with real token in it then isn't committed to git (the folder 
 * "scripts\generated" is excluded).
 * @type {string}
 */
const outputFilePath = 'scripts\\generated\\environment-with-token.json';

program
  .name('create-postman-environment-with-token')
  .description('Creates a copy of a Postman environment JSON file with an Azure client credentials token variable')
  .argument('<environment-filename>', 'Postman environment variables JSON filename')
  .requiredOption('-r, --resource-uri-variable-key <key>', 'The key of the environment variable for the Azure resource URI')
  .option('-g, --globals <file>', 'Postman global variables JSON filename', 'workspace.postman_globals.json')
  .action(async (environmentFilename, options) => {
    const resourceUriVariableKey = program.opts().resourceUriVariableKey;
    const globalsFilename = program.opts().globals;    
        
    console.info(chalk.gray('environment-filename:'), environmentFilename);
    console.info(chalk.gray('globals-filename:'), globalsFilename);
    console.log(chalk.gray('resource-uri-variable-key'), resourceUriVariableKey);

    try {
      const environmentData = await readPostmanVariablesJsonFile(environmentFilename);
      const authSettings = await getAuthSettings(globalsFilename, resourceUriVariableKey, environmentData);
      const token = await generateBearerToken(authSettings);

      await savePostmanEnvironmentJsonFileWithToken(environmentData, outputFilePath, token);
      
      console.info(chalk.green(`Postman collection with token created: ${outputFilePath}`));
      console.info(chalk.gray('output-file-path:'), outputFilePath);
    } catch (e) {
      console.error(chalk.red(`Error occurred generating the Postman environment JSON file with token:`), e);
    }
  });

program.parse();

async function readPostmanVariablesJsonFile(filename) {

  let jsonString = '';

  try {
    jsonString = await fs.readFile(filename);
  } catch (e) {
    throw new CustomException('Error reading file from disk', e);
  }

  let fileData = {};

  try {
    fileData = JSON.parse(jsonString);
  } catch (e) {
    throw new CustomException('Error parsing JSON string:', e);
  }
  
  if (!fileData.values || !Array.isArray(fileData.values)) {
    throw new Error(`The data object doesn't contain a "values" array property`)
  }

  return fileData;
}


async function savePostmanEnvironmentJsonFileWithToken(environmentData, filename, token) {

  const tokenItem = environmentData.values.find(x => x.key === 'token');

  // If a "token" variable exists then update else add one to the "values" array
  if (tokenItem) {
    tokenItem.value = token;
    tokenItem.enabled = true;
  } else {
    environmentData.values.push({
      key: 'token',
      value: token,
      enabled: true
    });
  }

  try {
    const jsonString = JSON.stringify(environmentData, null, 2); // Indent size = 2
    await fs.writeFile(filename, jsonString);
  } catch (e) {
    throw new CustomException('Error writing file to disk', e);
  }
}

/**
 * Call Azure AD to generate a token
 * @param {AuthSettings} authSettings
 */
function generateBearerToken(authSettings) {
  
  const oauthUrl = `https://login.microsoftonline.com/${authSettings.tenantId}/oauth2/token`;
  
  const postData = {
    'grant_type': 'client_credentials',
    'resource': authSettings.resourceUri,
    'client_id': authSettings.clientId,
    'client_secret': authSettings.clientSecret
  }
 
  const postDataUrlEncoded = qs.stringify(postData);

  const options = {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  }
  
  return axios
    .post(oauthUrl, postDataUrlEncoded, options)
    .then((response) => {
      const expiresInMinutes = Math.floor(response.data.expires_in / 60)
      console.info(chalk.blue(`Client credential token generated via the OAuth endpoint. Token expires in ${expiresInMinutes} minutes.`));
      
      return response.data.access_token;
    })
    .catch((e) => {
      throw new CustomException('Error generating bearing token', e);
    })
}

/**
 * 
 * @param {string} globalsFilename
 * @param {string} resourceUriVariableKey
 * @param {object} environmentData
 * @returns {Promise<AuthSettings>}
 */
async function getAuthSettings(globalsFilename, resourceUriVariableKey, environmentData) {

  const resourceUriItem = environmentData.values.find(x => x.key === resourceUriVariableKey);

  if (!resourceUriItem) {
    throw new Error(`The environment data doesn't contain a value with the key "${resourceUriVariableKey}"`);
  }
  
  const globalsData = await readPostmanVariablesJsonFile(globalsFilename);

  /**
   * Inner function to retrieve required item values from the environment "values" array
   */
  function getGlobalsRequiredValue(key) {
    const item = globalsData.values.find(x => x.key === key);

    if (!item) {
      throw new Error(`The globals data doesn't contain a "${key}" value`);
    }

    return item.value; // Return the actual value rather than item object
  }
  
  const tenantId = getGlobalsRequiredValue('AzureTenantId');
  const clientId = getGlobalsRequiredValue('AzureClientId');
  const clientSecret = getGlobalsRequiredValue('AzureSecret')

  return new AuthSettings(resourceUriItem.value, tenantId, clientId, clientSecret);
}

/**
 * Exception that includes an inner exception
 */
class CustomException {
  constructor(message, internalException) {
    this.message = message;
    this.internalException = internalException;
  }
}

/**
 * Class to hold all the setting required to generate a client credentials token for an Azure resource 
 */
class AuthSettings {
  constructor(resourceUri, tenantId, clientId, clientSecret) {
    this.resourceUri = resourceUri;
    this.tenantId = tenantId;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }
}